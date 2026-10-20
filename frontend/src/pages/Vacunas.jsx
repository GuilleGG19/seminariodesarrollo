// Catalogo de vacunas (seccion 3.6): nombre, edad recomendada y dosis.
import { useEffect, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { vacunas } from '../api/recursos';
import { mensajeError } from '../api/cliente';
import { useAuth } from '../auth/AuthContext';
import { useMutacion } from '../hooks/utiles';
import { useVacunas } from '../hooks/catalogos';
import { CajaError, EncabezadoPagina, Tarjeta } from '../components/ui/Elementos';
import { Entrada } from '../components/ui/Campos';
import { Tabla } from '../components/ui/Tabla';
import { Modal, Confirmar } from '../components/ui/Modal';
import Boton from '../components/ui/Boton';
import { edad } from '../utils/formato';
import { GESTION } from '../utils/roles';

const textoEdad = (m) => (m === 0 ? 'Al nacer' : edad(m));

function FormVacuna({ abierto, alCerrar, vacuna }) {
  const [nombre, setNombre] = useState('');
  const [dosis, setDosis] = useState(1);
  const [edades, setEdades] = useState(['']);

  useEffect(() => {
    if (!abierto) return;
    setNombre(vacuna?.nombre || '');
    const total = vacuna?.dosis_total || 1;
    setDosis(total);
    setEdades(vacuna?.edades_dosis_meses?.map(String) || [String(vacuna?.edad_recomendada_meses ?? ''), ...Array(total - 1).fill('')]);
  }, [abierto, vacuna]);

  // Ajusta la lista de edades al numero de dosis
  const cambiarDosis = (valor) => {
    const n = Math.min(Math.max(Number(valor) || 1, 1), 10);
    setDosis(n);
    setEdades((e) => [...e.slice(0, n), ...Array(Math.max(n - e.length, 0)).fill('')]);
  };

  const guardar = useMutacion((c) => (vacuna ? vacunas.actualizar(vacuna.id, c) : vacunas.crear(c)), {
    exito: vacuna ? 'Vacuna actualizada' : 'Vacuna agregada al catálogo',
    invalidar: [['vacunas'], ['esquema'], ['dashboard']],
    alExito: alCerrar,
  });

  const enviar = (e) => {
    e.preventDefault();
    const completas = edades.every((x) => x !== '');
    guardar.mutate({
      nombre,
      dosis_total: dosis,
      edad_recomendada_meses: Number(edades[0]),
      // Si no se indicaron todas las edades, solo se guarda la de la primera dosis
      edades_dosis_meses: completas ? edades.map(Number) : null,
    });
  };

  return (
    <Modal
      abierto={abierto}
      alCerrar={alCerrar}
      titulo={vacuna ? 'Editar vacuna' : 'Agregar vacuna'}
      pie={
        <>
          <Boton variante="secundario" onClick={alCerrar}>Cancelar</Boton>
          <Boton type="submit" form="form-vacuna" cargando={guardar.isPending}>Guardar</Boton>
        </>
      }
    >
      <form id="form-vacuna" onSubmit={enviar} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Entrada etiqueta="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={150} required className="sm:col-span-2" />
          <Entrada etiqueta="Número de dosis" type="number" min="1" max="10" value={dosis} onChange={(e) => cambiarDosis(e.target.value)} required />
        </div>
        <fieldset>
          <legend className="mb-1 text-sm font-medium text-slate-700">Edad de cada dosis (en meses)</legend>
          <p className="mb-2 text-xs text-slate-500">0 = al nacer. La primera es obligatoria; completa todas para que el sistema detecte dosis atrasadas.</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {edades.map((valor, i) => (
              <Entrada
                key={i}
                etiqueta={`Dosis ${i + 1}`}
                type="number"
                min={i === 0 ? 0 : Number(edades[i - 1] || 0) + 1}
                max="216"
                value={valor}
                required={i === 0}
                onChange={(e) => setEdades((x) => x.map((y, j) => (j === i ? e.target.value : y)))}
              />
            ))}
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}

export default function Vacunas() {
  const { tiene } = useAuth();
  const puedeEditar = tiene(GESTION);
  const [form, setForm] = useState({ abierto: false, vacuna: null });
  const [borrar, setBorrar] = useState(null);
  const { data = [], isLoading, error, refetch } = useVacunas();

  const eliminar = useMutacion((id) => vacunas.eliminar(id), {
    exito: 'Vacuna eliminada',
    invalidar: [['vacunas'], ['esquema']],
    alExito: () => setBorrar(null),
  });

  return (
    <>
      <EncabezadoPagina
        titulo="Catálogo de vacunas"
        descripcion="Esquema nacional de vacunación (verifícalo con el documento vigente del MSPAS)"
        acciones={puedeEditar && <Boton icono={Plus} onClick={() => setForm({ abierto: true, vacuna: null })}>Agregar vacuna</Boton>}
      />
      {error ? (
        <CajaError mensaje={mensajeError(error)} alReintentar={refetch} />
      ) : (
        <Tarjeta sinRelleno>
          <Tabla
            cargando={isLoading}
            filas={data}
            vacio="El catálogo está vacío"
            columnas={[
              { clave: 'nombre', titulo: 'Vacuna', render: (v) => <span className="font-medium text-slate-900">{v.nombre}</span> },
              { clave: 'dosis_total', titulo: 'Dosis', render: (v) => <span className="tabular">{v.dosis_total}</span> },
              {
                clave: 'edades',
                titulo: 'Edades de aplicación',
                render: (v) =>
                  v.edades_dosis_meses ? (
                    <span className="text-slate-600">{v.edades_dosis_meses.map(textoEdad).join(' · ')}</span>
                  ) : (
                    <span className="text-slate-600">
                      1ª: {textoEdad(v.edad_recomendada_meses)}
                      {v.dosis_total > 1 && <span className="text-amber-700"> · faltan las edades de las demás dosis</span>}
                    </span>
                  ),
              },
              {
                clave: 'acciones',
                titulo: <span className="sr-only">Acciones</span>,
                className: 'text-right',
                render: (v) => (
                  <div className="flex justify-end gap-1">
                    {puedeEditar && <Boton variante="fantasma" tamano="sm" icono={Pencil} onClick={() => setForm({ abierto: true, vacuna: v })} aria-label={`Editar ${v.nombre}`} />}
                    {tiene('administrador') && <Boton variante="fantasma" tamano="sm" icono={Trash2} onClick={() => setBorrar(v)} aria-label={`Eliminar ${v.nombre}`} />}
                  </div>
                ),
              },
            ]}
          />
        </Tarjeta>
      )}

      <FormVacuna abierto={form.abierto} vacuna={form.vacuna} alCerrar={() => setForm({ abierto: false, vacuna: null })} />
      <Confirmar
        abierto={Boolean(borrar)}
        alCerrar={() => setBorrar(null)}
        alConfirmar={() => eliminar.mutate(borrar.id)}
        cargando={eliminar.isPending}
        titulo="Eliminar vacuna"
        textoConfirmar="Eliminar"
        mensaje={borrar ? `Se eliminará ${borrar.nombre} del catálogo. Solo es posible si no tiene dosis registradas.` : ''}
      />
    </>
  );
}
