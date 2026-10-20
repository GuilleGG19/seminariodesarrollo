// Campanas comunitarias (seccion 3.8): mensajes masivos segmentados por
// comunidad, edad y estado de vacunacion. Primero se ve a quien llegara, luego se crea.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Eye, Megaphone, Plus, Users } from 'lucide-react';
import { campanas } from '../../api/recursos';
import { mensajeError } from '../../api/cliente';
import { useMutacion } from '../../hooks/utiles';
import { useComunidades, useVacunas } from '../../hooks/catalogos';
import { CajaError, Dato, EncabezadoPagina, Insignia, Tarjeta } from '../../components/ui/Elementos';
import { AreaTexto, Entrada, Selector } from '../../components/ui/Campos';
import { Tabla } from '../../components/ui/Tabla';
import { Modal } from '../../components/ui/Modal';
import { CargandoBloque } from '../../components/ui/Cargando';
import Boton from '../../components/ui/Boton';
import { dia, fecha, fechaHora, hoy } from '../../utils/formato';

const FILTROS_VACIOS = { comunidad_id: '', vacuna_id: '', edad_min_meses: '', edad_max_meses: '', estado_vacunacion: '', sin_control_reciente: false };

const PLANTILLAS = [
  'Jornada de vacunación en su comunidad. Le esperamos con el carné de su hijo o hija.',
  'Control de peso y talla en el centro de salud. Por favor asista con su hijo o hija.',
];

// Convierte los filtros del formulario al formato de la API (sin campos vacios)
function filtrosApi(f) {
  const r = {};
  if (f.comunidad_id) r.comunidad_id = f.comunidad_id;
  if (f.vacuna_id) r.vacuna_id = f.vacuna_id;
  if (f.edad_min_meses !== '') r.edad_min_meses = Number(f.edad_min_meses);
  if (f.edad_max_meses !== '') r.edad_max_meses = Number(f.edad_max_meses);
  if (f.estado_vacunacion) r.estado_vacunacion = f.estado_vacunacion;
  if (f.sin_control_reciente) r.sin_control_reciente = true;
  return r;
}

function NuevaCampana({ abierto, alCerrar }) {
  const { opciones: comunidades } = useComunidades();
  const { opciones: vacunas } = useVacunas();
  const [filtros, setFiltros] = useState(FILTROS_VACIOS);
  const [mensaje, setMensaje] = useState('');
  const [fechaProgramada, setFechaProgramada] = useState('');
  const [previa, setPrevia] = useState(null);

  const cambiar = (campo) => (e) => {
    const valor = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setFiltros((f) => ({ ...f, [campo]: valor }));
    setPrevia(null); // la vista previa ya no corresponde a los filtros
  };

  const verPrevia = useMutacion(() => campanas.vistaPrevia(filtrosApi(filtros)), { alExito: setPrevia });
  const crear = useMutacion(
    () => campanas.crear({ ...filtrosApi(filtros), mensaje, ...(fechaProgramada ? { fecha_programada: fechaProgramada } : {}) }),
    {
      exito: (c) => `Campaña creada: ${c.total_destinatarios} familias recibirán el aviso`,
      invalidar: [['campanas'], ['notificaciones']],
      alExito: () => {
        cerrar();
      },
    }
  );

  const cerrar = () => {
    setFiltros(FILTROS_VACIOS);
    setMensaje('');
    setFechaProgramada('');
    setPrevia(null);
    alCerrar();
  };

  return (
    <Modal
      abierto={abierto}
      alCerrar={cerrar}
      titulo="Nueva campaña"
      descripcion="Un aviso por familia, por su canal preferido"
      ancho="xl"
      pie={
        <>
          <Boton variante="secundario" onClick={cerrar}>Cancelar</Boton>
          <Boton icono={Megaphone} onClick={() => crear.mutate()} cargando={crear.isPending} disabled={!previa || previa.total_destinatarios === 0 || !mensaje.trim()}>
            Crear campaña
          </Boton>
        </>
      }
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-slate-800">1. ¿A quién va dirigida?</h3>
          <Selector etiqueta="Comunidad" value={filtros.comunidad_id} onChange={cambiar('comunidad_id')} vacio="Todas las comunidades" opciones={comunidades} />
          <div className="grid grid-cols-2 gap-3">
            <Entrada etiqueta="Edad mínima (meses)" type="number" min="0" value={filtros.edad_min_meses} onChange={cambiar('edad_min_meses')} />
            <Entrada etiqueta="Edad máxima (meses)" type="number" min="0" value={filtros.edad_max_meses} onChange={cambiar('edad_max_meses')} />
          </div>
          <Selector
            etiqueta="Estado de vacunación"
            value={filtros.estado_vacunacion}
            onChange={cambiar('estado_vacunacion')}
            vacio="Cualquiera"
            opciones={[
              { valor: 'atrasada', texto: 'Con dosis atrasadas' },
              { valor: 'pendiente', texto: 'Con dosis en los próximos 30 días' },
            ]}
          />
          <Selector
            etiqueta="Vacuna"
            value={filtros.vacuna_id}
            onChange={cambiar('vacuna_id')}
            vacio="Cualquier vacuna"
            opciones={vacunas}
            ayuda={filtros.estado_vacunacion ? 'Limita el estado anterior a esta vacuna' : 'Niños con edad para esta vacuna que no la han completado'}
          />
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={filtros.sin_control_reciente} onChange={cambiar('sin_control_reciente')} className="size-4 rounded border-slate-300 text-marca-600" />
            Solo niños sin control de crecimiento reciente
          </label>
          <Boton variante="secundario" icono={Eye} onClick={() => verPrevia.mutate()} cargando={verPrevia.isPending}>Ver destinatarios</Boton>

          {previa && (
            <div className="rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
              <p className="flex items-center gap-2 text-sm font-medium text-slate-800">
                <Users className="size-4" aria-hidden /> {previa.total_destinatarios} familias recibirán el aviso
              </p>
              {previa.omitidos_sin_contacto > 0 && (
                <p className="mt-1 text-xs text-amber-700">{previa.omitidos_sin_contacto} familias cumplen el filtro pero no tienen correo ni Telegram registrado.</p>
              )}
              {previa.destinatarios.length > 0 && (
                <ul className="mt-2 max-h-40 space-y-1 overflow-auto text-xs text-slate-600">
                  {previa.destinatarios.map((d, i) => (
                    <li key={i}>
                      <span className="font-medium text-slate-800">{d.padre}</span> · {d.ninos} · {d.comunidad} ({d.canal})
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-slate-800">2. Mensaje</h3>
          <AreaTexto etiqueta="Mensaje" value={mensaje} onChange={(e) => setMensaje(e.target.value)} maxLength={1000} required ayuda={`${mensaje.length}/1000 caracteres. Se envía con un saludo y el nombre del niño.`} />
          <div className="flex flex-wrap gap-2">
            {PLANTILLAS.map((p) => (
              <button key={p} type="button" onClick={() => setMensaje(p)} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600 hover:bg-slate-200">
                {p.split('.')[0]}
              </button>
            ))}
          </div>
          <Entrada
            etiqueta="Fecha de la jornada (opcional)"
            type="date"
            min={hoy()}
            value={fechaProgramada}
            onChange={(e) => setFechaProgramada(e.target.value)}
            ayuda="Si la indicas, el aviso se envía ese día y la fecha aparece en el mensaje."
          />
        </div>
      </div>
    </Modal>
  );
}

function DetalleCampana({ id, alCerrar }) {
  const { data, isLoading, error } = useQuery({ queryKey: ['campanas', id], queryFn: () => campanas.obtener(id), enabled: Boolean(id) });
  const ESTADO = { enviado: 'verde', pendiente: 'azul', fallido: 'rojo' };
  return (
    <Modal abierto={Boolean(id)} alCerrar={alCerrar} titulo="Detalle de la campaña" ancho="lg">
      {isLoading && <CargandoBloque />}
      {error && <CajaError mensaje={mensajeError(error)} />}
      {data && (
        <>
          <p className="rounded-lg bg-slate-50 p-3 text-sm whitespace-pre-line text-slate-700 ring-1 ring-slate-200">{data.mensaje}</p>
          <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Dato etiqueta="Creada">{fechaHora(data.fecha_creacion)}</Dato>
            <Dato etiqueta="Por">{data.creada_por}</Dato>
            <Dato etiqueta="Fecha programada">{data.fecha_programada ? fecha(data.fecha_programada) : 'Inmediata'}</Dato>
            <Dato etiqueta="Comunidad">{data.comunidad || 'Todas'}</Dato>
            <Dato etiqueta="Enviadas / pendientes / fallidas">{`${data.enviadas} / ${data.pendientes} / ${data.fallidas}`}</Dato>
          </dl>
          <h3 className="mt-5 mb-2 text-sm font-semibold text-slate-800">Destinatarios ({data.destinatarios.length})</h3>
          <div className="max-h-72 overflow-auto rounded-lg ring-1 ring-slate-200">
            <Tabla
              filas={data.destinatarios.map((d, i) => ({ ...d, id: i }))}
              columnas={[
                { clave: 'padre', titulo: 'Padre/madre' },
                { clave: 'nino', titulo: 'Niño' },
                { clave: 'canal', titulo: 'Canal' },
                { clave: 'estado_envio', titulo: 'Estado', render: (d) => <Insignia tono={ESTADO[d.estado_envio]}>{d.estado_envio}</Insignia> },
              ]}
            />
          </div>
        </>
      )}
    </Modal>
  );
}

export default function Campanas() {
  const [nueva, setNueva] = useState(false);
  const [verId, setVerId] = useState(null);
  const { data = [], isLoading, error, refetch } = useQuery({ queryKey: ['campanas'], queryFn: campanas.listar });

  return (
    <>
      <EncabezadoPagina
        titulo="Campañas"
        descripcion="Jornadas de vacunación y controles médicos por comunidad"
        acciones={<Boton icono={Plus} onClick={() => setNueva(true)}>Nueva campaña</Boton>}
      />
      {error ? (
        <CajaError mensaje={mensajeError(error)} alReintentar={refetch} />
      ) : (
        <Tarjeta sinRelleno>
          <Tabla
            cargando={isLoading}
            filas={data}
            vacio="Aún no se han creado campañas"
            alClicFila={(c) => setVerId(c.id)}
            columnas={[
              { clave: 'fecha_creacion', titulo: 'Creada', render: (c) => dia(c.fecha_creacion), className: 'whitespace-nowrap' },
              { clave: 'mensaje', titulo: 'Mensaje', render: (c) => <span className="line-clamp-2 max-w-md">{c.mensaje}</span> },
              { clave: 'comunidad', titulo: 'Comunidad', render: (c) => c.comunidad || 'Todas', className: 'hidden md:table-cell' },
              { clave: 'fecha_programada', titulo: 'Jornada', render: (c) => (c.fecha_programada ? fecha(c.fecha_programada) : '—'), className: 'hidden sm:table-cell' },
              {
                clave: 'envios',
                titulo: 'Envíos',
                render: (c) => (
                  <span className="tabular text-xs">
                    {c.enviadas}/{c.total_destinatarios}
                    {c.fallidas > 0 && <span className="ml-1 text-red-700">({c.fallidas} fallidos)</span>}
                  </span>
                ),
              },
            ]}
          />
        </Tarjeta>
      )}
      <NuevaCampana abierto={nueva} alCerrar={() => setNueva(false)} />
      <DetalleCampana id={verId} alCerrar={() => setVerId(null)} />
    </>
  );
}
