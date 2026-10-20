// Pestana de vacunas: cartilla del esquema nacional (esperado vs aplicado).
// Cada dosis es un boton: aplicar, programar o corregir.
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, AlertOctagon, Clock, CircleDashed } from 'lucide-react';
import { ninos, vacunaciones } from '../../api/recursos';
import { mensajeError } from '../../api/cliente';
import { useAuth } from '../../auth/AuthContext';
import { useMutacion } from '../../hooks/utiles';
import { CajaError, EstadoDosis, Tarjeta } from '../../components/ui/Elementos';
import { CargandoBloque } from '../../components/ui/Cargando';
import { Modal } from '../../components/ui/Modal';
import { Entrada } from '../../components/ui/Campos';
import Boton from '../../components/ui/Boton';
import { edad, fecha, hoy, sumarMeses } from '../../utils/formato';

const ESTILO_DOSIS = {
  aplicada: { clase: 'bg-emerald-50 ring-emerald-200 text-emerald-800', icono: CheckCircle2 },
  atrasada: { clase: 'bg-red-50 ring-red-200 text-red-800', icono: AlertOctagon },
  pendiente: { clase: 'bg-white ring-slate-200 text-slate-700', icono: Clock },
  sin_fecha: { clase: 'bg-slate-50 ring-slate-200 text-slate-500', icono: CircleDashed },
};

// Fecha sugerida para la siguiente dosis: la del esquema si es posterior a la aplicacion
function sugerirProxima(nino, siguiente, fechaAplicada) {
  if (!siguiente || siguiente.edad_recomendada_meses === null) return '';
  const segunEsquema = sumarMeses(nino.fecha_nacimiento, siguiente.edad_recomendada_meses);
  return segunEsquema > fechaAplicada ? segunEsquema : sumarMeses(fechaAplicada, 1);
}

function ModalDosis({ seleccion, nino, alCerrar }) {
  const { tiene } = useAuth();
  const { vacuna, dosis, siguiente } = seleccion || {};
  const aplicada = dosis?.estado === 'aplicada';
  const [modo, setModo] = useState('aplicar'); // aplicar | programar
  const [fechaAplicada, setFechaAplicada] = useState(hoy());
  const [proxima, setProxima] = useState(''); // fecha de la dosis siguiente (al aplicar)
  const [programada, setProgramada] = useState(''); // fecha de esta dosis (al solo programar)

  useEffect(() => {
    if (!seleccion) return;
    const f = dosis.fecha_aplicada || hoy();
    setModo('aplicar');
    setFechaAplicada(f);
    setProxima(aplicada ? (siguiente?.programada ? siguiente.fecha_objetivo || '' : '') : sugerirProxima(nino, siguiente, f));
    setProgramada(dosis.fecha_objetivo || hoy());
  }, [seleccion]); // eslint-disable-line react-hooks/exhaustive-deps

  const invalidar = [['esquema', nino.id], ['alertas'], ['dashboard'], ['vacunaciones']];

  const guardar = useMutacion(
    (cuerpo) => {
      if (aplicada) return vacunaciones.actualizar(dosis.vacunacion_id, cuerpo);
      // Cambiar la fecha de una dosis ya programada (sin aplicarla)
      if (modo === 'programar' && dosis.vacunacion_id) {
        return vacunaciones.actualizar(dosis.vacunacion_id, cuerpo);
      }
      return vacunaciones.crear({ nino_id: nino.id, vacuna_id: vacuna.vacuna_id, numero_dosis: dosis.numero_dosis, ...cuerpo });
    },
    {
      exito: modo === 'programar' ? 'Dosis programada' : aplicada ? 'Dosis corregida' : 'Dosis registrada',
      invalidar,
      alExito: alCerrar,
    }
  );

  const eliminar = useMutacion(() => vacunaciones.eliminar(dosis.vacunacion_id), {
    exito: 'Registro de dosis eliminado',
    invalidar,
    alExito: alCerrar,
  });

  if (!seleccion) return null;
  const esUltima = dosis.numero_dosis >= vacuna.dosis_total;

  const enviar = (e) => {
    e.preventDefault();
    if (modo === 'programar') {
      guardar.mutate({ fecha_aplicada: null, proxima_dosis: programada });
    } else {
      guardar.mutate({ fecha_aplicada: fechaAplicada, proxima_dosis: esUltima ? null : proxima || null });
    }
  };

  return (
    <Modal
      abierto
      alCerrar={alCerrar}
      titulo={`${vacuna.vacuna} · dosis ${dosis.numero_dosis} de ${vacuna.dosis_total}`}
      descripcion={dosis.edad_recomendada_meses !== null ? `Edad recomendada: ${dosis.edad_recomendada_meses === 0 ? 'al nacer' : edad(dosis.edad_recomendada_meses)}` : undefined}
      ancho="sm"
      pie={
        <>
          {aplicada && tiene('administrador') && (
            <Boton variante="peligro" className="mr-auto" onClick={() => eliminar.mutate()} cargando={eliminar.isPending}>
              Eliminar registro
            </Boton>
          )}
          <Boton variante="secundario" onClick={alCerrar}>Cancelar</Boton>
          <Boton type="submit" form="form-dosis" cargando={guardar.isPending}>Guardar</Boton>
        </>
      }
    >
      <div className="mb-4 flex items-center gap-2">
        <EstadoDosis estado={dosis.estado} />
        {dosis.fecha_objetivo && !aplicada && (
          <span className="text-xs text-slate-500">
            {dosis.programada ? 'Programada para' : 'Según el esquema'}: {fecha(dosis.fecha_objetivo)}
            {dosis.dias_atraso ? ` (${dosis.dias_atraso} días de atraso)` : ''}
          </span>
        )}
      </div>

      {!aplicada && (
        <div className="mb-4 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 text-sm" role="radiogroup" aria-label="Acción">
          {[
            ['aplicar', 'Registrar aplicación'],
            ['programar', 'Solo programar fecha'],
          ].map(([valor, texto]) => (
            <button
              key={valor}
              type="button"
              role="radio"
              aria-checked={modo === valor}
              onClick={() => setModo(valor)}
              className={`rounded-md px-2 py-1.5 font-medium ${modo === valor ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'}`}
            >
              {texto}
            </button>
          ))}
        </div>
      )}

      <form id="form-dosis" onSubmit={enviar} className="space-y-4">
        {modo === 'aplicar' ? (
          <>
            <Entrada
              etiqueta="Fecha de aplicación"
              type="date"
              min={nino.fecha_nacimiento}
              max={hoy()}
              value={fechaAplicada}
              onChange={(e) => setFechaAplicada(e.target.value)}
              required
            />
            {!esUltima && (
              <Entrada
                etiqueta={`Próxima dosis (dosis ${dosis.numero_dosis + 1})`}
                type="date"
                min={fechaAplicada}
                value={proxima}
                onChange={(e) => setProxima(e.target.value)}
                ayuda="Opcional. Si la indicas, la siguiente dosis queda programada y se avisará si se atrasa."
              />
            )}
          </>
        ) : (
          <Entrada
            etiqueta="Fecha programada"
            type="date"
            value={programada}
            onChange={(e) => setProgramada(e.target.value)}
            required
          />
        )}
      </form>
    </Modal>
  );
}

export default function TabVacunas({ nino }) {
  const [seleccion, setSeleccion] = useState(null);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['esquema', nino.id], queryFn: () => ninos.esquema(nino.id) });

  if (isLoading) return <CargandoBloque />;
  if (error) return <CajaError mensaje={mensajeError(error)} alReintentar={refetch} />;

  const { resumen, vacunas } = data;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['Aplicadas', resumen.aplicadas, 'text-emerald-700'],
          ['Atrasadas', resumen.atrasadas, resumen.atrasadas ? 'text-red-700' : 'text-slate-900'],
          ['Pendientes', resumen.pendientes, 'text-slate-900'],
          ['Total del esquema', resumen.total, 'text-slate-900'],
        ].map(([texto, valor, color]) => (
          <div key={texto} className="rounded-xl bg-white p-3 shadow-xs ring-1 ring-slate-200">
            <p className="text-xs text-slate-500">{texto}</p>
            <p className={`text-xl font-semibold ${color}`}>{valor}</p>
          </div>
        ))}
      </div>

      <Tarjeta
        titulo="Cartilla de vacunación"
        acciones={<span className="text-xs text-slate-500">Toca una dosis para registrarla o corregirla</span>}
        sinRelleno
      >
        {vacunas.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500">El catálogo de vacunas está vacío.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {vacunas.map((v) => (
              <li key={v.vacuna_id} className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center">
                <div className="md:w-56 md:shrink-0">
                  <p className="text-sm font-medium text-slate-800">{v.vacuna}</p>
                  <p className="text-xs text-slate-500">
                    {v.aplicadas} de {v.dosis_total} dosis{v.completa ? ' · completa' : ''}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {v.dosis.map((d, i) => {
                    const estilo = ESTILO_DOSIS[d.estado];
                    return (
                      <button
                        key={d.numero_dosis}
                        type="button"
                        onClick={() => setSeleccion({ vacuna: v, dosis: d, siguiente: v.dosis[i + 1] })}
                        className={`flex min-w-32 items-center gap-2 rounded-lg px-3 py-2 text-left ring-1 transition hover:shadow-sm focus-visible:outline-2 focus-visible:outline-marca-600 ${estilo.clase}`}
                      >
                        <estilo.icono className="size-4 shrink-0" aria-hidden />
                        <span className="leading-tight">
                          <span className="block text-xs font-semibold">Dosis {d.numero_dosis}</span>
                          <span className="block text-xs">
                            {d.estado === 'aplicada'
                              ? fecha(d.fecha_aplicada)
                              : d.fecha_objetivo
                                ? `${d.estado === 'atrasada' ? 'Debió ser' : 'Toca'} ${fecha(d.fecha_objetivo)}`
                                : 'Sin fecha'}
                          </span>
                          <span className="sr-only">, estado {d.estado}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>

      <ModalDosis seleccion={seleccion} nino={nino} alCerrar={() => setSeleccion(null)} />
    </div>
  );
}
