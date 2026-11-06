// Registro de auditoria: quien modifico que y cuando (solo administrador).
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { auditoria, usuarios } from '../api/recursos';
import { mensajeError } from '../api/cliente';
import { CajaError, EncabezadoPagina, Insignia, Tarjeta } from '../components/ui/Elementos';
import { Entrada, Selector } from '../components/ui/Campos';
import { Tabla, Paginacion } from '../components/ui/Tabla';
import { fechaHora } from '../utils/formato';

const METODOS = { POST: ['azul', 'Creación'], PUT: ['ambar', 'Edición'], PATCH: ['ambar', 'Cambio'], DELETE: ['rojo', 'Eliminación'] };

export default function Auditoria() {
  const [filtros, setFiltros] = useState({ usuario_id: '', metodo: '', desde: '', hasta: '' });
  const [pagina, setPagina] = useState(1);
  const { data: personal = [] } = useQuery({ queryKey: ['usuarios'], queryFn: usuarios.listar });

  const params = { ...filtros, pagina, limite: 50 };
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['auditoria', params],
    queryFn: () => auditoria.listar(params),
    placeholderData: (anterior) => anterior,
  });

  const cambiar = (campo) => (e) => {
    setFiltros((f) => ({ ...f, [campo]: e.target.value }));
    setPagina(1);
  };

  return (
    <>
      <EncabezadoPagina titulo="Auditoría" descripcion="Registro de todas las modificaciones hechas en el sistema" />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Selector aria-label="Usuario" value={filtros.usuario_id} onChange={cambiar('usuario_id')} vacio="Todos los usuarios" opciones={personal.map((u) => ({ valor: u.id, texto: u.nombre_completo }))} className="w-full sm:w-56" />
        <Selector aria-label="Acción" value={filtros.metodo} onChange={cambiar('metodo')} vacio="Todas las acciones" opciones={Object.entries(METODOS).map(([valor, [, texto]]) => ({ valor, texto }))} className="w-full sm:w-44" />
        <Entrada etiqueta="Desde" type="date" value={filtros.desde} onChange={cambiar('desde')} className="w-full sm:w-40" />
        <Entrada etiqueta="Hasta" type="date" value={filtros.hasta} onChange={cambiar('hasta')} className="w-full sm:w-40" />
      </div>
      {error ? (
        <CajaError mensaje={mensajeError(error)} alReintentar={refetch} />
      ) : (
        <Tarjeta sinRelleno>
          <Tabla
            cargando={isLoading || isFetching}
            filas={data?.datos}
            vacio="No hay registros con estos filtros"
            columnas={[
              { clave: 'fecha', titulo: 'Fecha', render: (a) => fechaHora(a.fecha), className: 'whitespace-nowrap' },
              { clave: 'usuario', titulo: 'Usuario', render: (a) => a.usuario || <span className="text-slate-400">Sin sesión</span> },
              { clave: 'metodo', titulo: 'Acción', render: (a) => <Insignia tono={METODOS[a.metodo]?.[0]}>{METODOS[a.metodo]?.[1] || a.metodo}</Insignia> },
              { clave: 'ruta', titulo: 'Recurso', render: (a) => <code className="text-xs text-slate-600">{a.ruta}</code> },
              {
                clave: 'estado',
                titulo: 'Resultado',
                render: (a) => (a.estado < 400 ? <Insignia tono="verde">{a.estado} OK</Insignia> : <Insignia tono="rojo">{a.estado} Rechazada</Insignia>),
              },
              { clave: 'ip', titulo: 'IP', className: 'hidden lg:table-cell tabular text-xs' },
            ]}
          />
          <Paginacion datos={data} alCambiar={setPagina} />
        </Tarjeta>
      )}
    </>
  );
}
