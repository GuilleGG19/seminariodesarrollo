// Notificaciones a padres (seccion 3.5 canales y 3.8 campanas): estado de cada envio.
import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { AlertOctagon, CheckCircle2, Clock, Mail, RotateCcw, Send, FlaskConical } from 'lucide-react';
import { notificaciones } from '../api/recursos';
import { mensajeError } from '../api/cliente';
import { useAuth } from '../auth/AuthContext';
import { useMutacion } from '../hooks/utiles';
import { CajaError, EncabezadoPagina, Insignia, Tarjeta } from '../components/ui/Elementos';
import { Entrada, Selector } from '../components/ui/Campos';
import { Tabla, Paginacion } from '../components/ui/Tabla';
import { Modal } from '../components/ui/Modal';
import Boton from '../components/ui/Boton';
import { fechaHora, TIPOS_ALERTA } from '../utils/formato';
import { GESTION } from '../utils/roles';

const ESTADOS = {
  enviado: <Insignia tono="verde" icono={CheckCircle2}>Enviado</Insignia>,
  pendiente: <Insignia tono="azul" icono={Clock}>Pendiente</Insignia>,
  fallido: <Insignia tono="rojo" icono={AlertOctagon}>Fallido</Insignia>,
};

const TEXTO_CANAL = { configurado: 'Configurado', simulado: 'Simulado (sin configurar, solo consola)', no_configurado: 'No configurado' };

function PruebaEnvio({ abierto, alCerrar }) {
  const [canal, setCanal] = useState('Email');
  const [destino, setDestino] = useState('');
  const probar = useMutacion(() => notificaciones.prueba(canal, destino), { exito: (r) => r.mensaje, alExito: alCerrar });
  return (
    <Modal
      abierto={abierto}
      alCerrar={alCerrar}
      titulo="Enviar mensaje de prueba"
      ancho="sm"
      pie={
        <>
          <Boton variante="secundario" onClick={alCerrar}>Cancelar</Boton>
          <Boton type="submit" form="form-prueba" cargando={probar.isPending}>Enviar</Boton>
        </>
      }
    >
      <form
        id="form-prueba"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          probar.mutate();
        }}
      >
        <Selector etiqueta="Canal" value={canal} onChange={(e) => setCanal(e.target.value)} opciones={[{ valor: 'Email', texto: 'Correo' }, { valor: 'Telegram', texto: 'Telegram' }]} />
        <Entrada
          etiqueta={canal === 'Email' ? 'Correo de destino' : 'Chat ID de Telegram'}
          type={canal === 'Email' ? 'email' : 'text'}
          value={destino}
          onChange={(e) => setDestino(e.target.value)}
          required
        />
      </form>
    </Modal>
  );
}

export default function Notificaciones() {
  const { tiene } = useAuth();
  const gestion = tiene(GESTION);
  const [estado, setEstado] = useState('');
  const [canal, setCanal] = useState('');
  const [pagina, setPagina] = useState(1);
  const [prueba, setPrueba] = useState(false);

  const filtros = { estado, canal, pagina, limite: 25 };
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['notificaciones', filtros],
    queryFn: () => notificaciones.listar(filtros),
    placeholderData: (anterior) => anterior,
  });
  const { data: canales } = useQuery({ queryKey: ['notificaciones', 'canales'], queryFn: notificaciones.canales, enabled: gestion });

  const procesar = useMutacion(() => notificaciones.procesar(), {
    invalidar: [['notificaciones'], ['dashboard']],
    exito: (r) => (r.procesadas ? `Procesadas ${r.procesadas}: ${r.enviadas} enviadas, ${r.con_error} con error` : 'No había notificaciones listas para enviar'),
  });
  const reintentar = useMutacion((id) => notificaciones.reintentar(id), { exito: 'Puesta en cola de nuevo', invalidar: [['notificaciones']] });

  return (
    <>
      <EncabezadoPagina
        titulo="Notificaciones a padres"
        descripcion="Avisos de alertas y campañas. Se envían automáticamente cada 5 minutos."
        acciones={
          gestion && (
            <>
              {tiene('administrador') && <Boton variante="secundario" icono={FlaskConical} onClick={() => setPrueba(true)}>Probar canal</Boton>}
              <Boton icono={Send} onClick={() => procesar.mutate()} cargando={procesar.isPending}>Enviar pendientes ahora</Boton>
            </>
          )
        }
      />

      {canales && (
        <div className="mb-4 flex flex-wrap gap-3 text-sm">
          <span className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 ring-1 ring-slate-200">
            <Mail className="size-4 text-slate-500" aria-hidden /> Correo: <strong className="font-medium">{TEXTO_CANAL[canales.correo]}</strong>
          </span>
          <span className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 ring-1 ring-slate-200">
            <Send className="size-4 text-slate-500" aria-hidden /> Telegram: <strong className="font-medium">{TEXTO_CANAL[canales.telegram]}</strong>
          </span>
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-3">
        <Selector aria-label="Estado" value={estado} onChange={(e) => { setEstado(e.target.value); setPagina(1); }} vacio="Todos los estados"
          opciones={[{ valor: 'pendiente', texto: 'Pendientes' }, { valor: 'enviado', texto: 'Enviados' }, { valor: 'fallido', texto: 'Fallidos' }]} className="w-full sm:w-44" />
        <Selector aria-label="Canal" value={canal} onChange={(e) => { setCanal(e.target.value); setPagina(1); }} vacio="Todos los canales"
          opciones={[{ valor: 'Email', texto: 'Correo' }, { valor: 'Telegram', texto: 'Telegram' }]} className="w-full sm:w-44" />
      </div>

      {error ? (
        <CajaError mensaje={mensajeError(error)} alReintentar={refetch} />
      ) : (
        <Tarjeta sinRelleno>
          <Tabla
            cargando={isLoading || isFetching}
            filas={data?.datos}
            vacio="No hay notificaciones"
            columnas={[
              { clave: 'fecha_creacion', titulo: 'Creada', render: (n) => fechaHora(n.fecha_creacion), className: 'whitespace-nowrap' },
              { clave: 'padre', titulo: 'Para', render: (n) => (<><p className="text-slate-800">{n.padre}</p><Link to={`/ninos/${n.nino_id}`} className="text-xs text-marca-600 hover:underline">{n.nino}</Link></>) },
              { clave: 'origen', titulo: 'Motivo', render: (n) => (n.origen === 'alerta' ? `Alerta: ${TIPOS_ALERTA[n.alerta_tipo] || n.alerta_tipo}` : 'Campaña'), className: 'hidden md:table-cell' },
              { clave: 'canal', titulo: 'Canal', className: 'hidden sm:table-cell' },
              {
                clave: 'estado_envio',
                titulo: 'Estado',
                render: (n) => (
                  <div>
                    {ESTADOS[n.estado_envio]}
                    {n.ultimo_error && <p className="mt-1 max-w-xs text-xs text-red-700">{n.ultimo_error}</p>}
                    {n.fecha_envio && <p className="mt-1 text-xs text-slate-500">{fechaHora(n.fecha_envio)}</p>}
                  </div>
                ),
              },
              {
                clave: 'acciones',
                titulo: <span className="sr-only">Acciones</span>,
                className: 'text-right',
                render: (n) =>
                  gestion && n.estado_envio === 'fallido' && (
                    <Boton variante="secundario" tamano="sm" icono={RotateCcw} onClick={() => reintentar.mutate(n.id)}>Reintentar</Boton>
                  ),
              },
            ]}
          />
          <Paginacion datos={data} alCambiar={setPagina} />
        </Tarjeta>
      )}
      <PruebaEnvio abierto={prueba} alCerrar={() => setPrueba(false)} />
    </>
  );
}
