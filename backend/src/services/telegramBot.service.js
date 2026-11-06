// Bot de Telegram del centro de salud.
//
// Vinculacion de un padre:
//  1) El personal pide un enlace (generarVinculo): https://t.me/<bot>?start=<codigo>
//     El codigo es aleatorio (192 bits), vence en HORAS_VIGENCIA y en la base solo
//     se guarda su hash.
//  2) El padre abre el enlace y toca "Iniciar": Telegram le manda al bot
//     "/start <codigo>". El bot guarda el chat del padre (cifrado) y le confirma.
//  3) Con /baja el padre deja de recibir avisos por Telegram.
//
// El bot recibe los mensajes con "long polling" (getUpdates): no necesita una
// URL publica ni HTTPS. Solo UNA instancia del backend debe tener el bot activo.
const crypto = require('crypto');
const QRCode = require('qrcode');
const { pool } = require('../config/db');
const { cifrar, hashBusqueda } = require('../utils/cifrado');
const { llamarTelegram } = require('./canales.service');

const HORAS_VIGENCIA = 24;
const SEGUNDOS_ESPERA_POLLING = 25;

const crearError = (status, mensaje) => Object.assign(new Error(mensaje), { status });
const hashCodigo = (codigo) => crypto.createHash('sha256').update(codigo).digest('hex');
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

const estado = { activo: false, usuario: null, nombre: null, ultimoError: null };

// ---------------------------------------------------------------------
// Uso del personal
// ---------------------------------------------------------------------

async function generarVinculo(padreId) {
  if (!estado.usuario) {
    throw crearError(503, 'El bot de Telegram no está activo. Configura TELEGRAM_BOT_TOKEN en el servidor y reinícialo.');
  }
  const codigo = crypto.randomBytes(24).toString('base64url'); // 32 caracteres, permitido por Telegram
  const { rows } = await pool.query(
    `UPDATE padre
     SET telegram_codigo_hash = $2, telegram_codigo_expira = now() + ($3::int * interval '1 hour')
     WHERE id = $1
     RETURNING telegram_codigo_expira`,
    [padreId, hashCodigo(codigo), HORAS_VIGENCIA]
  );
  if (!rows[0]) throw crearError(404, 'Padre o tutor no encontrado');

  const enlace = `https://t.me/${estado.usuario}?start=${codigo}`;
  const qr = await QRCode.toDataURL(enlace, { errorCorrectionLevel: 'M', margin: 2, width: 280 });
  return { enlace, qr_data_url: qr, expira: rows[0].telegram_codigo_expira, bot: `@${estado.usuario}` };
}

async function desvincular(padreId) {
  const { rows } = await pool.query(
    `UPDATE padre
     SET telegram_chat_id = NULL, telegram_chat_hash = NULL, telegram_vinculado_en = NULL,
         telegram_codigo_hash = NULL, telegram_codigo_expira = NULL,
         canal_preferido = CASE WHEN coalesce(correo, '') <> '' THEN 'Email' ELSE canal_preferido END
     WHERE id = $1
     RETURNING canal_preferido`,
    [padreId]
  );
  if (!rows[0]) throw crearError(404, 'Padre o tutor no encontrado');
  return {
    mensaje:
      rows[0].canal_preferido === 'Email'
        ? 'Telegram desvinculado. Los avisos llegarán por correo.'
        : 'Telegram desvinculado. El padre no tiene correo: no recibirá avisos hasta que se registre uno.',
  };
}

const estadoBot = () => ({
  activo: estado.activo && Boolean(estado.usuario),
  usuario: estado.usuario ? `@${estado.usuario}` : null,
  ultimo_error: estado.ultimoError,
});

// ---------------------------------------------------------------------
// Mensajes que recibe el bot
// ---------------------------------------------------------------------

const responder = (chatId, texto) =>
  llamarTelegram('sendMessage', { chat_id: chatId, text: texto }).catch((e) =>
    console.error('[telegram] No se pudo responder:', e.message)
  );

// /start <codigo>: vincula el chat con el padre dueno del codigo
async function vincular(codigo, chatId, nombreTelegram) {
  const { rows } = await pool.query(
    `UPDATE padre p
     SET telegram_chat_id = $2, telegram_chat_hash = $3, canal_preferido = 'Telegram',
         telegram_vinculado_en = now(), telegram_codigo_hash = NULL, telegram_codigo_expira = NULL
     WHERE p.telegram_codigo_hash = $1 AND p.telegram_codigo_expira > now()
     RETURNING p.nombre_completo,
       (SELECT string_agg(n.nombre, ', ' ORDER BY n.nombre) FROM nino n WHERE n.padre_id = p.id) AS ninos`,
    [hashCodigo(codigo), cifrar(String(chatId)), hashBusqueda(String(chatId))]
  );

  if (!rows[0]) {
    return responder(
      chatId,
      'Este enlace no es válido o ya venció. Pide uno nuevo en tu centro de salud.'
    );
  }
  console.log(`[telegram] Padre vinculado (${nombreTelegram || 'sin nombre'})`);
  const { nombre_completo: nombre, ninos } = rows[0];
  return responder(
    chatId,
    `Hola ${nombre}, ¡listo! 👋\n\nDesde ahora recibirás aquí los avisos del centro de salud` +
      `${ninos ? ` sobre ${ninos}` : ''}: alertas de crecimiento, vacunas pendientes y jornadas.\n\n` +
      'Si ya no quieres recibirlos, escribe /baja.'
  );
}

async function darDeBaja(chatId) {
  const { rowCount } = await pool.query(
    `UPDATE padre
     SET telegram_chat_id = NULL, telegram_chat_hash = NULL, telegram_vinculado_en = NULL,
         canal_preferido = CASE WHEN coalesce(correo, '') <> '' THEN 'Email' ELSE canal_preferido END
     WHERE telegram_chat_hash = $1`,
    [hashBusqueda(String(chatId))]
  );
  return responder(
    chatId,
    rowCount
      ? 'Listo, ya no recibirás avisos por Telegram. Si tienes correo registrado, te llegarán por ahí.'
      : 'Este chat no está vinculado a ningún registro.'
  );
}

async function procesarActualizacion(actualizacion) {
  const mensaje = actualizacion.message;
  // Solo chats privados con texto (no grupos ni canales)
  if (!mensaje?.text || mensaje.chat?.type !== 'private') return;
  const chatId = mensaje.chat.id;
  const texto = mensaje.text.trim();

  const inicio = /^\/start(?:@\w+)?(?:\s+([A-Za-z0-9_-]{16,64}))?$/.exec(texto);
  if (inicio && inicio[1]) return vincular(inicio[1], chatId, mensaje.from?.first_name);
  if (/^\/(baja|stop)(@\w+)?$/i.test(texto)) return darDeBaja(chatId);

  return responder(
    chatId,
    'Hola 👋 Soy el bot del Sistema de Control de Crecimiento y Vacunación Infantil.\n\n' +
      'Para recibir los avisos de tus hijos, pide en el centro de salud tu enlace o código QR de Telegram y ábrelo desde este teléfono.\n\n' +
      'Escribe /baja para dejar de recibir avisos.'
  );
}

// ---------------------------------------------------------------------
// Ciclo de long polling
// ---------------------------------------------------------------------

async function ciclo() {
  let desplazamiento = 0;
  while (estado.activo) {
    try {
      const actualizaciones = await llamarTelegram(
        'getUpdates',
        { offset: desplazamiento, timeout: SEGUNDOS_ESPERA_POLLING, allowed_updates: ['message'] },
        (SEGUNDOS_ESPERA_POLLING + 10) * 1000
      );
      for (const a of actualizaciones) {
        desplazamiento = a.update_id + 1;
        try {
          await procesarActualizacion(a);
        } catch (error) {
          console.error('[telegram] Error al procesar un mensaje:', error.message);
        }
      }
      estado.ultimoError = null;
    } catch (error) {
      estado.ultimoError = error.message;
      if (error.codigo === 409) {
        console.error('[telegram] Otra instancia del backend ya está usando el bot (409). Reintentando en 30 s.');
        await pausa(30000);
      } else if (error.codigo === 401) {
        console.error('[telegram] TELEGRAM_BOT_TOKEN inválido: el bot se detiene.');
        estado.activo = false;
      } else {
        console.error('[telegram] Error de conexión:', error.message);
        await pausa(5000);
      }
    }
  }
}

async function iniciarBot() {
  if (!process.env.TELEGRAM_BOT_TOKEN || estado.activo) return;
  try {
    const yo = await llamarTelegram('getMe');
    estado.usuario = yo.username;
    estado.nombre = yo.first_name;
    // getUpdates no funciona si hay un webhook configurado
    await llamarTelegram('deleteWebhook', { drop_pending_updates: false });
    await llamarTelegram('setMyCommands', {
      commands: [{ command: 'baja', description: 'Dejar de recibir avisos del centro de salud' }],
    }).catch(() => {});
    estado.activo = true;
    console.log(`Bot de Telegram activo: @${estado.usuario}`);
    ciclo();
  } catch (error) {
    estado.ultimoError = error.message;
    console.error('[telegram] No se pudo iniciar el bot:', error.message);
  }
}

const detenerBot = () => {
  estado.activo = false;
};

module.exports = {
  iniciarBot,
  detenerBot,
  generarVinculo,
  desvincular,
  estadoBot,
  procesarActualizacion,
  hashCodigo,
};
