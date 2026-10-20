// Pestana del carnet digital con QR (seccion 3.7).
// El PIN y la imagen del QR solo se muestran al generar: hay que imprimirlos o entregarlos en ese momento.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Ban, Copy, Printer, QrCode, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { carnets } from '../../api/recursos';
import { mensajeError } from '../../api/cliente';
import { useMutacion } from '../../hooks/utiles';
import { CajaError, Insignia, Tarjeta } from '../../components/ui/Elementos';
import { CargandoBloque } from '../../components/ui/Cargando';
import { Tabla } from '../../components/ui/Tabla';
import { Modal, Confirmar } from '../../components/ui/Modal';
import { Selector } from '../../components/ui/Campos';
import Boton from '../../components/ui/Boton';
import { fecha, fechaHora } from '../../utils/formato';

const ESTADOS = {
  activo: <Insignia tono="verde">Activo</Insignia>,
  expirado: <Insignia>Expirado</Insignia>,
  revocado: <Insignia tono="rojo" icono={Ban}>Revocado</Insignia>,
};

function CarnetGenerado({ carnet, nino, alCerrar }) {
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(carnet.url);
      toast.success('Enlace copiado');
    } catch {
      toast.error('No se pudo copiar el enlace');
    }
  };

  return (
    <Modal
      abierto
      alCerrar={alCerrar}
      titulo="Carnet generado"
      ancho="md"
      pie={
        <>
          <Boton variante="secundario" icono={Copy} onClick={copiar}>Copiar enlace</Boton>
          <Boton icono={Printer} onClick={() => window.print()}>Imprimir carnet</Boton>
        </>
      }
    >
      <div className="mb-4 flex gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
        <ShieldAlert className="size-5 shrink-0" aria-hidden />
        <p>El PIN solo se muestra ahora. Imprímelo o entrégalo al padre o madre por separado. Si se pierde, genera un carnet nuevo.</p>
      </div>
      <div className="solo-impresion mx-auto max-w-sm rounded-xl p-5 text-center ring-1 ring-slate-200">
        <p className="text-xs font-semibold tracking-wide text-marca-600 uppercase">Carnet digital de crecimiento y vacunación</p>
        <p className="mt-1 text-lg font-semibold text-slate-900">{nino.nombre}</p>
        <p className="text-xs text-slate-500">Nacimiento: {fecha(nino.fecha_nacimiento)} · {nino.comunidad}</p>
        <img src={carnet.qr_data_url} alt="Código QR del carnet" className="mx-auto my-3 size-56" />
        <p className="text-xs text-slate-500">PIN de acceso</p>
        <p className="tabular text-3xl font-bold tracking-[0.3em] text-slate-900">{carnet.pin}</p>
        <p className="mt-3 text-xs text-slate-500">Escanea el código y escribe el PIN para ver el carnet. Válido hasta el {fechaHora(carnet.fecha_expiracion)}</p>
      </div>
    </Modal>
  );
}

export default function TabCarnet({ nino }) {
  const [generarAbierto, setGenerarAbierto] = useState(false);
  const [dias, setDias] = useState('365');
  const [generado, setGenerado] = useState(null);
  const [revocar, setRevocar] = useState(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['carnets', nino.id],
    queryFn: () => carnets.listar({ nino_id: nino.id, limite: 50 }),
  });

  const generar = useMutacion(() => carnets.generar(nino.id, Number(dias)), {
    invalidar: [['carnets', nino.id]],
    alExito: (c) => {
      setGenerarAbierto(false);
      setGenerado(c);
    },
  });

  const revocarMut = useMutacion((id) => carnets.revocar(id), {
    exito: 'Carnet revocado',
    invalidar: [['carnets', nino.id]],
    alExito: () => setRevocar(null),
  });

  if (isLoading) return <CargandoBloque />;
  if (error) return <CajaError mensaje={mensajeError(error)} alReintentar={refetch} />;

  const activo = data.datos.find((c) => c.estado === 'activo');

  return (
    <div className="space-y-4">
      <Tarjeta>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <QrCode className="mt-0.5 size-8 text-marca-600" aria-hidden />
            <div>
              <p className="text-sm font-medium text-slate-800">{activo ? 'El niño tiene un carnet activo' : 'El niño no tiene un carnet activo'}</p>
              <p className="text-sm text-slate-500">
                Los padres escanean el QR y escriben el PIN para ver vacunas y crecimiento. Generar uno nuevo revoca el anterior.
              </p>
            </div>
          </div>
          <Boton icono={QrCode} onClick={() => setGenerarAbierto(true)}>{activo ? 'Generar nuevo carnet' : 'Generar carnet'}</Boton>
        </div>
      </Tarjeta>

      <Tarjeta titulo="Historial de carnets" sinRelleno>
        <Tabla
          filas={data.datos}
          vacio="Aún no se ha generado ningún carnet."
          columnas={[
            { clave: 'fecha_generado', titulo: 'Generado', render: (c) => fechaHora(c.fecha_generado) },
            { clave: 'fecha_expiracion', titulo: 'Vence', render: (c) => fechaHora(c.fecha_expiracion) },
            {
              clave: 'estado',
              titulo: 'Estado',
              render: (c) => (
                <span className="flex flex-wrap gap-1">
                  {ESTADOS[c.estado]}
                  {c.bloqueado && <Insignia tono="ambar">Bloqueado temporalmente</Insignia>}
                </span>
              ),
            },
            { clave: 'intentos_totales', titulo: 'PIN fallidos', render: (c) => <span className="tabular">{c.intentos_totales}</span> },
            {
              clave: 'acciones',
              titulo: <span className="sr-only">Acciones</span>,
              className: 'text-right',
              render: (c) =>
                c.estado === 'activo' && (
                  <Boton variante="secundario" tamano="sm" icono={Ban} onClick={() => setRevocar(c)}>Revocar</Boton>
                ),
            },
          ]}
        />
      </Tarjeta>

      <Modal
        abierto={generarAbierto}
        alCerrar={() => setGenerarAbierto(false)}
        titulo="Generar carnet QR"
        ancho="sm"
        pie={
          <>
            <Boton variante="secundario" onClick={() => setGenerarAbierto(false)}>Cancelar</Boton>
            <Boton onClick={() => generar.mutate()} cargando={generar.isPending}>Generar</Boton>
          </>
        }
      >
        <Selector
          etiqueta="Vigencia"
          value={dias}
          onChange={(e) => setDias(e.target.value)}
          opciones={[
            { valor: '90', texto: '3 meses' },
            { valor: '180', texto: '6 meses' },
            { valor: '365', texto: '1 año' },
            { valor: '730', texto: '2 años' },
          ]}
        />
        {activo && <p className="mt-3 text-sm text-amber-700">El carnet activo actual dejará de funcionar.</p>}
      </Modal>

      {generado && <CarnetGenerado carnet={generado} nino={nino} alCerrar={() => setGenerado(null)} />}

      <Confirmar
        abierto={Boolean(revocar)}
        alCerrar={() => setRevocar(null)}
        alConfirmar={() => revocarMut.mutate(revocar.id)}
        cargando={revocarMut.isPending}
        titulo="Revocar carnet"
        textoConfirmar="Revocar"
        mensaje="El QR y el PIN de este carnet dejarán de funcionar de inmediato."
      />
    </div>
  );
}
