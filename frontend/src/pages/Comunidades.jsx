// Comunidades (seccion 3.1)
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { comunidades } from '../api/recursos';
import { mensajeError } from '../api/cliente';
import { useAuth } from '../auth/AuthContext';
import { useMutacion, useRetrasado } from '../hooks/utiles';
import { CajaError, EncabezadoPagina, Tarjeta } from '../components/ui/Elementos';
import { Buscador, Entrada } from '../components/ui/Campos';
import { Tabla } from '../components/ui/Tabla';
import { Modal, Confirmar } from '../components/ui/Modal';
import Boton from '../components/ui/Boton';
import { numero } from '../utils/formato';
import { GESTION } from '../utils/roles';

function FormComunidad({ abierto, alCerrar, comunidad }) {
  const [v, setV] = useState({ nombre: '', ubicacion: '', num_familias_estimado: '' });
  useEffect(() => {
    if (abierto) {
      setV({
        nombre: comunidad?.nombre || '',
        ubicacion: comunidad?.ubicacion || '',
        num_familias_estimado: comunidad?.num_familias_estimado ?? '',
      });
    }
  }, [abierto, comunidad]);

  const guardar = useMutacion((c) => (comunidad ? comunidades.actualizar(comunidad.id, c) : comunidades.crear(c)), {
    exito: comunidad ? 'Comunidad actualizada' : 'Comunidad registrada',
    invalidar: [['comunidades'], ['dashboard']],
    alExito: alCerrar,
  });
  const cambiar = (campo) => (e) => setV((x) => ({ ...x, [campo]: e.target.value }));

  return (
    <Modal
      abierto={abierto}
      alCerrar={alCerrar}
      titulo={comunidad ? 'Editar comunidad' : 'Registrar comunidad'}
      ancho="sm"
      pie={
        <>
          <Boton variante="secundario" onClick={alCerrar}>Cancelar</Boton>
          <Boton type="submit" form="form-comunidad" cargando={guardar.isPending}>Guardar</Boton>
        </>
      }
    >
      <form
        id="form-comunidad"
        onSubmit={(e) => {
          e.preventDefault();
          guardar.mutate(v);
        }}
        className="space-y-4"
      >
        <Entrada etiqueta="Nombre" value={v.nombre} onChange={cambiar('nombre')} maxLength={150} required />
        <Entrada etiqueta="Ubicación" value={v.ubicacion} onChange={cambiar('ubicacion')} maxLength={255} required placeholder="Municipio, departamento o referencia" />
        <Entrada etiqueta="Número estimado de familias" type="number" min="0" value={v.num_familias_estimado} onChange={cambiar('num_familias_estimado')} />
      </form>
    </Modal>
  );
}

export default function Comunidades() {
  const { tiene } = useAuth();
  const puedeEditar = tiene(GESTION);
  const [buscar, setBuscar] = useState('');
  const [form, setForm] = useState({ abierto: false, comunidad: null });
  const [borrar, setBorrar] = useState(null);
  const busqueda = useRetrasado(buscar.trim());

  const { data = [], isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['comunidades', busqueda],
    queryFn: () => comunidades.listar({ buscar: busqueda }),
  });

  const eliminar = useMutacion((id) => comunidades.eliminar(id), {
    exito: 'Comunidad eliminada',
    invalidar: [['comunidades']],
    alExito: () => setBorrar(null),
  });

  return (
    <>
      <EncabezadoPagina
        titulo="Comunidades"
        descripcion="Localidades atendidas por el centro de salud"
        acciones={puedeEditar && <Boton icono={Plus} onClick={() => setForm({ abierto: true, comunidad: null })}>Registrar comunidad</Boton>}
      />
      <Buscador valor={buscar} alCambiar={setBuscar} placeholder="Buscar comunidad" className="mb-4 w-full sm:w-72" />

      {error ? (
        <CajaError mensaje={mensajeError(error)} alReintentar={refetch} />
      ) : (
        <Tarjeta sinRelleno>
          <Tabla
            cargando={isLoading || isFetching}
            filas={data}
            vacio="No hay comunidades registradas"
            columnas={[
              { clave: 'nombre', titulo: 'Nombre', render: (c) => <span className="font-medium text-slate-900">{c.nombre}</span> },
              { clave: 'ubicacion', titulo: 'Ubicación', className: 'hidden sm:table-cell' },
              { clave: 'num_familias_estimado', titulo: 'Familias (est.)', render: (c) => <span className="tabular">{numero(c.num_familias_estimado)}</span>, className: 'hidden md:table-cell' },
              { clave: 'total_padres', titulo: 'Padres', render: (c) => <span className="tabular">{c.total_padres}</span> },
              { clave: 'total_ninos', titulo: 'Niños', render: (c) => <span className="tabular">{c.total_ninos}</span> },
              {
                clave: 'acciones',
                titulo: <span className="sr-only">Acciones</span>,
                className: 'text-right',
                render: (c) => (
                  <div className="flex justify-end gap-1">
                    {puedeEditar && <Boton variante="fantasma" tamano="sm" icono={Pencil} onClick={() => setForm({ abierto: true, comunidad: c })} aria-label={`Editar ${c.nombre}`} />}
                    {tiene('administrador') && <Boton variante="fantasma" tamano="sm" icono={Trash2} onClick={() => setBorrar(c)} aria-label={`Eliminar ${c.nombre}`} />}
                  </div>
                ),
              },
            ]}
          />
        </Tarjeta>
      )}

      <FormComunidad abierto={form.abierto} comunidad={form.comunidad} alCerrar={() => setForm({ abierto: false, comunidad: null })} />
      <Confirmar
        abierto={Boolean(borrar)}
        alCerrar={() => setBorrar(null)}
        alConfirmar={() => eliminar.mutate(borrar.id)}
        cargando={eliminar.isPending}
        titulo="Eliminar comunidad"
        textoConfirmar="Eliminar"
        mensaje={borrar ? `Se eliminará la comunidad ${borrar.nombre}. Solo es posible si no tiene padres, niños ni campañas.` : ''}
      />
    </>
  );
}
