// Listado de ninos con busqueda, filtros y paginacion.
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { ninos } from '../../api/recursos';
import { mensajeError } from '../../api/cliente';
import { useRetrasado } from '../../hooks/utiles';
import { useComunidades } from '../../hooks/catalogos';
import { EncabezadoPagina, Tarjeta, CajaError } from '../../components/ui/Elementos';
import { Buscador, Selector } from '../../components/ui/Campos';
import { Tabla, Paginacion } from '../../components/ui/Tabla';
import Boton from '../../components/ui/Boton';
import FormNino from './FormNino';
import { edad, fecha, sexo } from '../../utils/formato';

export default function Ninos() {
  const navegar = useNavigate();
  const [buscar, setBuscar] = useState('');
  const [comunidadId, setComunidadId] = useState('');
  const [filtroSexo, setFiltroSexo] = useState('');
  const [pagina, setPagina] = useState(1);
  const [formAbierto, setFormAbierto] = useState(false);
  const { opciones } = useComunidades();
  const busqueda = useRetrasado(buscar.trim());

  const filtros = { buscar: busqueda, comunidad_id: comunidadId, sexo: filtroSexo, pagina, limite: 25 };
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['ninos', filtros],
    queryFn: () => ninos.listar(filtros),
    placeholderData: (anterior) => anterior,
  });

  // Al cambiar un filtro se vuelve a la primera pagina
  const conReinicio = (fn) => (valor) => {
    fn(valor);
    setPagina(1);
  };

  return (
    <>
      <EncabezadoPagina
        titulo="Niños"
        descripcion="Registro, crecimiento y vacunación de cada niño"
        acciones={<Boton icono={Plus} onClick={() => setFormAbierto(true)}>Registrar niño</Boton>}
      />

      <div className="mb-4 flex flex-wrap gap-3">
        <Buscador valor={buscar} alCambiar={conReinicio(setBuscar)} placeholder="Buscar por nombre" className="w-full sm:w-72" />
        <Selector aria-label="Comunidad" value={comunidadId} onChange={(e) => conReinicio(setComunidadId)(e.target.value)} vacio="Todas las comunidades" opciones={opciones} className="w-full sm:w-56" />
        <Selector
          aria-label="Sexo"
          value={filtroSexo}
          onChange={(e) => conReinicio(setFiltroSexo)(e.target.value)}
          vacio="Niñas y niños"
          opciones={[
            { valor: 'F', texto: 'Niñas' },
            { valor: 'M', texto: 'Niños' },
          ]}
          className="w-full sm:w-40"
        />
      </div>

      {error ? (
        <CajaError mensaje={mensajeError(error)} alReintentar={refetch} />
      ) : (
        <Tarjeta sinRelleno>
          <Tabla
            cargando={isLoading || isFetching}
            filas={data?.datos}
            vacio={busqueda || comunidadId || filtroSexo ? 'Ningún niño coincide con los filtros' : 'Todavía no hay niños registrados'}
            alClicFila={(n) => navegar(`/ninos/${n.id}`)}
            columnas={[
              { clave: 'nombre', titulo: 'Nombre', render: (n) => <span className="font-medium text-slate-900">{n.nombre}</span> },
              { clave: 'edad', titulo: 'Edad', render: (n) => edad(n.edad_meses), className: 'whitespace-nowrap' },
              { clave: 'fecha_nacimiento', titulo: 'Nacimiento', render: (n) => fecha(n.fecha_nacimiento), className: 'whitespace-nowrap hidden md:table-cell' },
              { clave: 'sexo', titulo: 'Sexo', render: (n) => sexo(n.sexo), className: 'hidden sm:table-cell' },
              { clave: 'comunidad', titulo: 'Comunidad', className: 'hidden md:table-cell' },
              { clave: 'padre', titulo: 'Padre / tutor', className: 'hidden lg:table-cell' },
            ]}
          />
          <Paginacion datos={data} alCambiar={setPagina} />
        </Tarjeta>
      )}

      <FormNino abierto={formAbierto} alCerrar={() => setFormAbierto(false)} alGuardar={(n) => navegar(`/ninos/${n.id}`)} />
    </>
  );
}
