// Canales de envio a los padres: correo (SMTP con nodemailer) y Telegram (Bot API).
//
// Sin configuracion (SMTP_HOST o TELEGRAM_BOT_TOKEN vacios):
//  - fuera de produccion el envio se SIMULA (se muestra en consola y cuenta como enviado),
//    para poder probar el sistema sin una cuenta de correo ni un bot;
//  - en produccion el envio falla con un error claro.
const nodemailer = require('nodemailer');

const TIEMPO_ESPERA_MS = 15000;
const esProduccion = () => process.env.NODE_ENV === 'production';

let transporte = null;
function transporteCorreo() {
  if (!transporte) {
    transporte = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
      connectionTimeout: TIEMPO_ESPERA_MS,
      // Los mensajes solo llevan texto propio: no se permite leer archivos ni URLs
      disableFileAccess: true,
      disableUrlAccess: true,
    });
  }
  return transporte;
}

const escaparHtml = (texto) =>
  String(texto).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function simular(canal, destino, asunto, texto) {
  if (esProduccion()) {
    throw new Error(`El canal ${canal} no está configurado en el servidor`);
  }
  console.log(`[${canal} simulado] Para: ${destino}${asunto ? ` | Asunto: ${asunto}` : ''}\n${texto}\n`);
  return { simulado: true };
}

async function enviarCorreo({ para, asunto, texto }) {
  if (!process.env.SMTP_HOST) return simular('correo', para, asunto, texto);

  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#222">${escaparHtml(texto)
    .split('\n')
    .join('<br>')}</div>`;
  await transporteCorreo().sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: para,
    subject: asunto,
    text: texto,
    html,
  });
  return { simulado: false };
}

async function enviarTelegram({ chatId, texto }) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return simular('Telegram', `chat ${chatId}`, null, texto);

  const respuesta = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: texto }),
    signal: AbortSignal.timeout(TIEMPO_ESPERA_MS),
  });
  const cuerpo = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok || !cuerpo.ok) {
    throw new Error(`Telegram respondió ${respuesta.status}: ${cuerpo.description || 'error desconocido'}`);
  }
  return { simulado: false };
}

// Estado de configuracion (para mostrarlo en el frontend)
const estadoCanales = () => ({
  correo: process.env.SMTP_HOST ? 'configurado' : esProduccion() ? 'no_configurado' : 'simulado',
  telegram: process.env.TELEGRAM_BOT_TOKEN ? 'configurado' : esProduccion() ? 'no_configurado' : 'simulado',
});

module.exports = { enviarCorreo, enviarTelegram, estadoCanales };
