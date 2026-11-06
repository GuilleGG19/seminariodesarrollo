// Canales de envio a los padres: correo (Resend o SMTP) y Telegram (Bot API).
//
// Correo, en orden de preferencia:
//  1) Resend (RESEND_API_KEY)  -> API HTTP de https://resend.com
//  2) SMTP   (SMTP_HOST)       -> nodemailer
//  3) Sin configuracion: fuera de produccion el envio se SIMULA (se muestra en
//     consola y cuenta como enviado); en produccion falla con un error claro.
const nodemailer = require('nodemailer');

const TIEMPO_ESPERA_MS = 15000;
const RESEND_URL = 'https://api.resend.com/emails';
// Resend permite 2 peticiones por segundo en el plan gratuito: se deja un margen
const PAUSA_RESEND_MS = 600;

const esProduccion = () => process.env.NODE_ENV === 'production';
const remitente = () => process.env.EMAIL_FROM || process.env.SMTP_FROM || process.env.SMTP_USER;
const proveedorCorreo = () => (process.env.RESEND_API_KEY ? 'resend' : process.env.SMTP_HOST ? 'smtp' : null);

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

// Plantilla HTML sencilla (tablas y estilos en linea: es lo que mejor se ve en
// Gmail, Outlook y celulares). Todo el texto se escapa: viene de la base de datos.
function plantillaHtml(asunto, texto) {
  const parrafos = escaparHtml(texto)
    .split('\n\n')
    .map((p) => `<p style="margin:0 0 14px">${p.split('\n').join('<br>')}</p>`)
    .join('');
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escaparHtml(asunto)}</title></head>
<body style="margin:0;padding:0;background:#f5f7fa">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7fa;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">
<tr><td style="background:#1f4e79;color:#ffffff;padding:16px 24px;font-family:Arial,sans-serif;font-size:16px;font-weight:bold">SCCVI · Centro de Salud</td></tr>
<tr><td style="padding:24px;font-family:Arial,sans-serif;font-size:15px;line-height:1.55;color:#1e293b">${parrafos}</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

function simular(canal, destino, asunto, texto) {
  if (esProduccion()) {
    throw new Error(`El canal ${canal} no está configurado en el servidor`);
  }
  console.log(`[${canal} simulado] Para: ${destino}${asunto ? ` | Asunto: ${asunto}` : ''}\n${texto}\n`);
  return { simulado: true, idProveedor: null };
}

// Espaciado entre envios a Resend (los envios se hacen de uno en uno)
let ultimoEnvioResend = 0;
async function esperarTurnoResend() {
  const espera = ultimoEnvioResend + PAUSA_RESEND_MS - Date.now();
  if (espera > 0) await new Promise((r) => setTimeout(r, espera));
  ultimoEnvioResend = Date.now();
}

// claveIdempotencia: si se repite (por ejemplo, un reintento de algo que si se
// envio), Resend no manda el correo dos veces.
async function enviarConResend({ para, asunto, texto, claveIdempotencia }) {
  await esperarTurnoResend();
  const respuesta = await fetch(RESEND_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      ...(claveIdempotencia ? { 'Idempotency-Key': claveIdempotencia } : {}),
    },
    body: JSON.stringify({
      from: remitente(),
      to: [para],
      subject: asunto,
      text: texto,
      html: plantillaHtml(asunto, texto),
      ...(process.env.EMAIL_REPLY_TO ? { reply_to: process.env.EMAIL_REPLY_TO } : {}),
    }),
    signal: AbortSignal.timeout(TIEMPO_ESPERA_MS),
  });

  const cuerpo = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) {
    // Mensajes de Resend mas comunes, traducidos para el personal
    const detalle = cuerpo.message || 'error desconocido';
    let pista = '';
    if (respuesta.status === 401 || respuesta.status === 403) {
      pista = /domain/i.test(detalle)
        ? ' (el dominio del remitente no está verificado en Resend, o con onboarding@resend.dev solo puedes enviar a tu propio correo)'
        : ' (revisa RESEND_API_KEY)';
    } else if (respuesta.status === 429) {
      pista = ' (límite de envíos de Resend: se reintentará)';
    } else if (respuesta.status === 422) {
      pista = ' (revisa EMAIL_FROM y el correo del destinatario)';
    }
    const error = new Error(`Resend respondió ${respuesta.status}: ${detalle}${pista}`);
    // Clave, dominio o direccion invalidos: reintentar no sirve hasta corregir la configuracion
    error.definitivo = [401, 403, 422].includes(respuesta.status);
    throw error;
  }
  return { simulado: false, idProveedor: cuerpo.id || null };
}

async function enviarCorreo({ para, asunto, texto, claveIdempotencia }) {
  const proveedor = proveedorCorreo();
  if (!proveedor) return simular('correo', para, asunto, texto);
  if (proveedor === 'resend') return enviarConResend({ para, asunto, texto, claveIdempotencia });

  const info = await transporteCorreo().sendMail({
    from: remitente(),
    to: para,
    subject: asunto,
    text: texto,
    html: plantillaHtml(asunto, texto),
    ...(process.env.EMAIL_REPLY_TO ? { replyTo: process.env.EMAIL_REPLY_TO } : {}),
  });
  return { simulado: false, idProveedor: info.messageId || null };
}

// Llama a un metodo de la Bot API de Telegram y devuelve "result".
// El error lleva "codigo" (error_code de Telegram) y "definitivo" si reintentar no sirve.
async function llamarTelegram(metodo, parametros = {}, tiempoMs = TIEMPO_ESPERA_MS) {
  const respuesta = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${metodo}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(parametros),
    signal: AbortSignal.timeout(tiempoMs),
  });
  const cuerpo = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok || !cuerpo.ok) {
    const descripcion = cuerpo.description || 'error desconocido';
    let pista = '';
    if (/blocked by the user/i.test(descripcion)) pista = ' (el padre bloqueó el bot: debe vincularse de nuevo)';
    else if (/chat not found/i.test(descripcion)) pista = ' (el chat no existe: vincula de nuevo al padre)';
    else if (respuesta.status === 401) pista = ' (revisa TELEGRAM_BOT_TOKEN)';
    const error = new Error(`Telegram respondió ${respuesta.status}: ${descripcion}${pista}`);
    error.codigo = cuerpo.error_code || respuesta.status;
    // 400 (chat no existe), 401 (token) y 403 (bloqueado) no se arreglan reintentando
    error.definitivo = [400, 401, 403].includes(respuesta.status);
    throw error;
  }
  return cuerpo.result;
}

async function enviarTelegram({ chatId, texto }) {
  if (!process.env.TELEGRAM_BOT_TOKEN) return simular('Telegram', `chat ${chatId}`, null, texto);
  const resultado = await llamarTelegram('sendMessage', { chat_id: chatId, text: texto });
  return { simulado: false, idProveedor: resultado?.message_id ? String(resultado.message_id) : null };
}

// Estado de configuracion (para mostrarlo en el frontend)
const estadoCanales = () => ({
  correo: proveedorCorreo() ? 'configurado' : esProduccion() ? 'no_configurado' : 'simulado',
  proveedor_correo: proveedorCorreo(),
  remitente: proveedorCorreo() ? remitente() : null,
  telegram: process.env.TELEGRAM_BOT_TOKEN ? 'configurado' : esProduccion() ? 'no_configurado' : 'simulado',
});

module.exports = { enviarCorreo, enviarTelegram, llamarTelegram, estadoCanales, plantillaHtml };
