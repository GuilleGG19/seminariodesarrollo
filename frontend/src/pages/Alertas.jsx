// Alertas (seccion 3.5): peso bajo/alto, talla baja, sin control y vacunas atrasadas.
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { alertas } from '../api/recursos';
import { mensajeError } from '../api/cliente';
import { useAuth } from '../auth/AuthContext';
import { useMutacion } from '../hooks/utiles';
import { useComunidades } from '../hooks/catalogos';
import { CajaError, EncabezadoPagina, Tarjeta } from '../components/ui/Elementos';
import { Selector } from '../components/ui/Campos';
import { Paginacion } from '../components/ui/Tabla';
import { CargandoBloque } from '../components/ui/Cargando';
import Boton from '../components/ui/Boton';
import ListaAlertas from '../components/ListaAlertas';
import { TIPOS_ALERTA } from '../utils/formato';
import { GESTION } from '../utils/roles';

export default function Alertas() {
  const { tiene } = useAuth();
  const [parametros, setParametros] = useSearchParams();
  const [pagina, setPagina] = useState(1);
  const { opciones } = useComunidades();

  // Los filtros viven en la URL: se pueden compartir y sobreviven al recargar
  const tipo = parametros.get('tipo') || '';
  const nivel = parametros.get('nivel') || '';
  const estado = parametros.get('estado') || 'abiertas';
  const comunidadId = parametros.get('comunidad') || '';
  const cambiarFiltro = (clave) => (e) => {
    const nuevos = new URLSearchParams(parametros);
    if (e.target.value) nuevos.set(clave, e.target.value);
    else nuevos.delete(clave);
    setParametros(nuevos, { replace: true });
    setPagina(1);
  };

  const filtros = {
    tipo,
    nivel,
    comunidad_id: comunidadId,
    atendida: estado === 'abiertas' ? 'false' : estado === 'atendidas' ? 'true' : '',
    pagina,
    limite: 25,
  };
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['alertas', filtros],
    queryFn: () => alertas.listar(filtros),
    placeholderData: (anterior) => anterior,
  });

  const generar = useMutacion(() => alertas.generar(), {
    invalidar: [['alertas'], ['dashboard']],
    exito: (r) => `Revisión completa: ${r.ninos_revisados} niños, ${r.creadas} alertas nuevas, ${r.cerradas_automaticamente} cerradas`,
  });

  return (
    <>
      <EncabezadoPagina
        titulo="Alertas"
        descripcion="Se revisan todos los días a las 6:00 y cada vez que se registra una medición o vacuna"
        acciones={
          tiene(GESTION) && (
            <Boton variante="secundario" icono={RefreshCw} onClick={() => generar.mutate()} cargando={generar.isPending}>
              Revisar ahora
            </Boton>
          )
        }
      />

      <div className="mb-4 flex flex-wrap gap-3">
        <Selector
          aria-label="Estado"
          value={estado}
          onChange={cambiarFiltro('estado')}
          opciones={[
            { valor: 'abiertas', texto: 'Abiertas' },
            { valor: 'atendidas', texto: 'Atendidas' },
            { valor: 'todas', texto: 'Todas' },
          ]}
          className="w-full sm:w-40"
        />
        <Selector aria-label="Tipo" value={tipo} onChange={cambiarFiltro('tipo')} vacio="Todos los tipos" opciones={Object.entries(TIPOS_ALERTA).map(([valor, texto]) => ({ valor, texto }))} className="w-full sm:w-52" />
        <Selector
          aria-label="Nivel"
          value={nivel}
          onChange={cambiarFiltro('nivel')}
          vacio="Todos los niveles"
          opciones={[
            { valor: 'critica', texto: 'Críticas' },
            { valor: 'preventiva', texto: 'Preventivas' },
          ]}
          className="w-full sm:w-44"
        />
        <Selector aria-label="Comunidad" value={comunidadId} onChange={cambiarFiltro('comunidad')} vacio="Todas las comunidades" opciones={opciones} className="w-full sm:w-56" />
      </div>

      {error ? (
        <CajaError mensaje={mensajeError(error)} alReintentar={refetch} />
      ) : (
        <Tarjeta sinRelleno>
          {isLoading ? (
            <CargandoBloque />
          ) : (
            <div className={isFetching ? 'opacity-60' : ''}>
              <ListaAlertas alertas={data.datos} vacio={estado === 'abiertas' ? 'No hay alertas abiertas con estos filtros' : 'No hay alertas con estos filtros'} />
            </div>
          )}
          <Paginacion datos={data} alCambiar={setPagina} />
        </Tarjeta>
      )}
    </>
  );
}
