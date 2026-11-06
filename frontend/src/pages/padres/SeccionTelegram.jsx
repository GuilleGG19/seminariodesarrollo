// Vinculacion del padre con el bot de Telegram: el padre escanea el QR (o abre
// el enlace) y toca "Iniciar". Mientras el QR esta abierto se consulta el estado
// cada pocos segundos para mostrar cuando quedo vinculado.
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, Copy, Link2Off, Send } from 'lucide-react';
import { padres } from '../../api/recursos';
import { useMutacion } from '../../hooks/utiles';
import Boton from '../../components/ui/Boton';
import { Confirmar } from '../../components/ui/Modal';
import { fechaHora } from '../../utils/formato';

export default function SeccionTelegram({ padre }) {
  const queryClient = useQueryClient();
  const [vinculo, setVinculo] = useState(null);
  const [confirmarBaja, setConfirmarBaja] = useState(false);
  const vinculado = Boolean(padre.telegram_chat_id);

  const generar = useMutacion(() => padres.vincularTelegram(padre.id), { alExito: setVinculo });
  const desvincular = useMutacion(() => padres.desvincularTelegram(padre.id), {
    exito: (r) => r.mensaje,
    invalidar: [['padres']],
    alExito: () => setConfirmarBaja(false),
  });

  // Mientras se muestra el QR, revisa cada 4 s si el padre ya se vinculo
  useEffect(() => {
    if (!vinculo || vinculado) return undefined;
    const intervalo = setInterval(() => queryClient.invalidateQueries({ queryKey: ['padres', padre.id] }), 4000);
    return () => clearInterval(intervalo);
  }, [vinculo, vinculado, padre.id, queryClient]);

  // Cuando se detecta la vinculacion, se cierra el QR
  useEffect(() => {
    if (vinculo && vinculado) {
      toast.success(`${padre.nombre_completo} quedó vinculado a Telegram`);
      setVinculo(null);
      queryClient.invalidateQueries({ queryKey: ['padres'] });
    }
  }, [vinculo, vinculado, padre.nombre_completo, queryClient]);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(vinculo.enlace);
      toast.success('Enlace copiado. Envíaselo solo al padre o madre.');
    } catch {
      toast.error('No se pudo copiar');
    }
  };

  return (
    <section className="mt-5 rounded-lg p-4 ring-1 ring-slate-200">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex gap-3">
          <Send className="mt-0.5 size-5 shrink-0 text-sky-600" aria-hidden />
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Avisos por Telegram</h3>
            {vinculado ? (
              <p className="flex items-center gap-1 text-sm text-emerald-700">
                <CheckCircle2 className="size-4" aria-hidden />
                Vinculado{padre.telegram_vinculado_en ? ` desde el ${fechaHora(padre.telegram_vinculado_en)}` : ''}
              </p>
            ) : (
              <p className="text-sm text-slate-500">
                {padre.telegram_vinculo_pendiente ? 'Hay un enlace generado esperando a que el padre lo abra.' : 'No vinculado.'}
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {vinculado ? (
            <Boton variante="secundario" tamano="sm" icono={Link2Off} onClick={() => setConfirmarBaja(true)}>
              Desvincular
            </Boton>
          ) : (
            !vinculo && (
              <Boton tamano="sm" icono={Send} onClick={() => generar.mutate()} cargando={generar.isPending}>
                Vincular Telegram
              </Boton>
            )
          )}
        </div>
      </div>

      {vinculo && !vinculado && (
        <div className="mt-4 flex flex-col items-center gap-3 rounded-lg bg-slate-50 p-4 text-center sm:flex-row sm:text-left">
          <img src={vinculo.qr_data_url} alt="Código QR para vincular Telegram" className="size-44 shrink-0 rounded bg-white" />
          <div className="space-y-2 text-sm text-slate-700">
            <p className="font-medium">Pide al padre o madre que:</p>
            <ol className="list-inside list-decimal space-y-1 text-slate-600">
              <li>Escanee este código con la cámara de su teléfono.</li>
              <li>Toque <strong>Iniciar</strong> en el chat de {vinculo.bot}.</li>
            </ol>
            <p className="text-xs text-slate-500">
              El enlace es personal y vence el {fechaHora(vinculo.expira)}. Esta pantalla se actualiza sola al completarse.
            </p>
            <Boton variante="secundario" tamano="sm" icono={Copy} onClick={copiar}>Copiar enlace</Boton>
          </div>
        </div>
      )}

      <Confirmar
        abierto={confirmarBaja}
        alCerrar={() => setConfirmarBaja(false)}
        alConfirmar={() => desvincular.mutate()}
        cargando={desvincular.isPending}
        titulo="Desvincular Telegram"
        textoConfirmar="Desvincular"
        mensaje={`${padre.nombre_completo} dejará de recibir avisos por Telegram. Si tiene correo registrado, los recibirá por correo.`}
      />
    </section>
  );
}
