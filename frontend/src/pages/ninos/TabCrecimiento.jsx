// Pestana de crecimiento: curvas OMS de peso y talla + mediciones.
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { registros } from '../../api/recursos';
import { mensajeError } from '../../api/cliente';
import { useAuth } from '../../auth/AuthContext';
import { useMutacion } from '../../hooks/utiles';
import { CajaError, Tarjeta } from '../../components/ui/Elementos';
import { CargandoBloque } from '../../components/ui/Cargando';
import { Tabla } from '../../components/ui/Tabla';
import { Modal, Confirmar } from '../../components/ui/Modal';
import { Entrada } from '../../components/ui/Campos';
import Boton from '../../components/ui/Boton';
import CurvaCrecimiento from '../../components/graficas/CurvaCrecimiento';
import { fecha, hoy, numero } from '../../utils/formato';

const INVALIDAR = (id) => [['curva', id], ['alertas'], ['dashboard'], ['ninos', id]];

function Percentil({ valor }) {
  if (valor === null || valor === undefined) return <span className="text-slate-400">—</span>;
  const fuera = valor < 5 || valor > 95;
  return (
    <span className={`tabular ${fuera ? 'font-semibold text-red-700' : ''}`} title={fuera ? 'Fuera del rango P5–P95' : undefined}>
      P{numero(valor, 1)}
      {fuera && <span className="sr-only"> (fuera de rango)</span>}
    </span>
  );
}

function FormMedicion({ abierto, alCerrar, nino, medicion }) {
  const [valores, setValores] = useState({ peso_kg: '', talla_cm: '', fecha_medicion: hoy() });

  useEffect(() => {
    if (abierto) {
      setValores({
        peso_kg: medicion?.peso_kg ?? '',
        talla_cm: medicion?.talla_cm ?? '',
        fecha_medicion: medicion?.fecha_medicion || hoy(),
      });
    }
  }, [abierto, medicion]);

  const guardar = useMutacion(
    (cuerpo) => (medicion ? registros.actualizar(medicion.id, cuerpo) : registros.crear({ ...cuerpo, nino_id: nino.id })),
    {
      invalidar: INVALIDAR(nino.id),
      alExito: (r) => {
        toast.success(`Medición guardada: peso P${numero(r.percentil_peso, 1)}, talla P${numero(r.percentil_talla, 1)}`);
        r.advertencias?.forEach((a) => toast.warning(a));
        alCerrar();
      },
    }
  );

  const cambiar = (campo) => (e) => setValores((v) => ({ ...v, [campo]: e.target.value }));

  return (
    <Modal
      abierto={abierto}
      alCerrar={alCerrar}
      titulo={medicion ? 'Corregir medición' : 'Registrar medición'}
      descripcion={nino.nombre}
      ancho="sm"
      pie={
        <>
          <Boton variante="secundario" onClick={alCerrar}>Cancelar</Boton>
          <Boton type="submit" form="form-medicion" cargando={guardar.isPending}>Guardar</Boton>
        </>
      }
    >
      <form
        id="form-medicion"
        onSubmit={(e) => {
          e.preventDefault();
          guardar.mutate(valores);
        }}
        className="space-y-4"
      >
        <div className="grid grid-cols-2 gap-4">
          <Entrada etiqueta="Peso (kg)" type="number" inputMode="decimal" step="0.01" min="0.3" max="150" value={valores.peso_kg} onChange={cambiar('peso_kg')} required />
          <Entrada etiqueta="Talla (cm)" type="number" inputMode="decimal" step="0.1" min="20" max="220" value={valores.talla_cm} onChange={cambiar('talla_cm')} required />
        </div>
        <Entrada
          etiqueta="Fecha de la medición"
          type="date"
          min={nino.fecha_nacimiento}
          max={hoy()}
          value={valores.fecha_medicion}
          onChange={cambiar('fecha_medicion')}
          required
        />
        <p className="text-xs text-slate-500">Los percentiles se calculan automáticamente con las tablas de la OMS según la edad y el sexo.</p>
      </form>
    </Modal>
  );
}

export default function TabCrecimiento({ nino }) {
  const { tiene } = useAuth();
  const [form, setForm] = useState({ abierto: false, medicion: null });
  const [borrar, setBorrar] = useState(null);

  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['curva', nino.id], queryFn: () => registros.curva(nino.id) });

  const eliminar = useMutacion((id) => registros.eliminar(id), {
    exito: 'Medición eliminada',
    invalidar: INVALIDAR(nino.id),
    alExito: () => setBorrar(null),
  });

  if (isLoading) return <CargandoBloque />;
  if (error) return <CajaError mensaje={mensajeError(error)} alReintentar={refetch} />;

  const mediciones = data.mediciones;
  const ultima = mediciones[mediciones.length - 1];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          {ultima
            ? `Última medición: ${fecha(ultima.fecha_medicion)} · ${numero(ultima.peso_kg, 2)} kg · ${numero(ultima.talla_cm, 1)} cm`
            : 'Aún no hay mediciones registradas.'}
        </p>
        <Boton icono={Plus} onClick={() => setForm({ abierto: true, medicion: null })}>Registrar medición</Boton>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <CurvaCrecimiento
          titulo="Peso para la edad"
          unidad="kg"
          referencia={data.referencia.peso_edad}
          mediciones={mediciones.map((m) => ({ ...m, valor: m.peso_kg, percentil: m.percentil_peso }))}
        />
        <CurvaCrecimiento
          titulo="Talla para la edad"
          unidad="cm"
          referencia={data.referencia.talla_edad}
          mediciones={mediciones.map((m) => ({ ...m, valor: m.talla_cm, percentil: m.percentil_talla }))}
        />
      </div>

      <Tarjeta titulo="Historial de mediciones" sinRelleno>
        <Tabla
          filas={[...mediciones].reverse()}
          vacio="Registra la primera medición para ver las curvas."
          columnas={[
            { clave: 'fecha_medicion', titulo: 'Fecha', render: (m) => fecha(m.fecha_medicion), className: 'whitespace-nowrap' },
            { clave: 'edad_meses', titulo: 'Edad', render: (m) => `${m.edad_meses} m` },
            { clave: 'peso_kg', titulo: 'Peso', render: (m) => <span className="tabular">{numero(m.peso_kg, 2)} kg</span> },
            { clave: 'percentil_peso', titulo: 'P. peso', render: (m) => <Percentil valor={m.percentil_peso} /> },
            { clave: 'talla_cm', titulo: 'Talla', render: (m) => <span className="tabular">{numero(m.talla_cm, 1)} cm</span> },
            { clave: 'percentil_talla', titulo: 'P. talla', render: (m) => <Percentil valor={m.percentil_talla} /> },
            {
              clave: 'acciones',
              titulo: <span className="sr-only">Acciones</span>,
              className: 'text-right',
              render: (m) => (
                <div className="flex justify-end gap-1">
                  <Boton variante="fantasma" tamano="sm" icono={Pencil} onClick={() => setForm({ abierto: true, medicion: m })} aria-label="Corregir medición" />
                  {tiene('administrador') && (
                    <Boton variante="fantasma" tamano="sm" icono={Trash2} onClick={() => setBorrar(m)} aria-label="Eliminar medición" />
                  )}
                </div>
              ),
            },
          ]}
        />
      </Tarjeta>

      <FormMedicion abierto={form.abierto} medicion={form.medicion} nino={nino} alCerrar={() => setForm({ abierto: false, medicion: null })} />
      <Confirmar
        abierto={Boolean(borrar)}
        alCerrar={() => setBorrar(null)}
        alConfirmar={() => eliminar.mutate(borrar.id)}
        cargando={eliminar.isPending}
        titulo="Eliminar medición"
        textoConfirmar="Eliminar"
        mensaje={borrar ? `Se eliminará la medición del ${fecha(borrar.fecha_medicion)}.` : ''}
      />
    </div>
  );
}
