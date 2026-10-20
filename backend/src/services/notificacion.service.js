// Envio de notificaciones a los padres (alertas y campanas).
//
// Las alertas (alerta.service.js) y las campanas (campana.service.js) solo dejan
// filas "pendiente" en la tabla notificacion. Aqui se envian:
//  1) Se "reservan" hasta LOTE notificaciones listas (FOR UPDATE SKIP LOCKED), asi
//     dos procesos nunca envian la misma.
//  2) Se envia cada una por su canal (correo o Telegram).
//  3) Exito -> 'enviado'. Error -> se reintenta con espera creciente; despues de
//     MAX_INTENTOS queda 'fallido' (el personal puede reintentarla a mano).
// Una campana con fecha_programada no se envia antes de ese dia.
const { pool } = require('../config/db');
const { descifrar } = require('../utils/cifrado');
const { consultar } = require('../utils/paginacion');
const canales = require('./canales.service');

const crearError = (status, mensaje) => Object.assign(new Error(mensaje), { status });

const LOTE = 50;
const MAX_INTENTOS = 3;
const MINUTOS_RESERVA = 10; // si el proceso se cae a medio envio, se reintenta despues de esto
const MINUTOS_ESPERA_BASE = 5; // 5, 10, 20... minutos entre reintentos
const HOY = `(now() at time zone 'America/Guatemala')::date`;

const ETIQUETAS_ALERTA = {
  desnutricion: 'peso bajo',
  sobrepeso: 'peso alto',
  talla_baja: 'talla baja',
  sin_registros: 'control de crecimiento pendiente',
  vacuna_atrasada: 'vacunas atrasadas',
};

// Arma el asunto y el texto de una notificacion
function armarMensaje(n) {
  const saludo = `Hola ${n.padre}:`;
  const pie = '\n\nCentro de Salud - Sistema de Control de Crecimiento y Vacunación Infantil (SCCVI).\nEste es un mensaje automático, por favor no responda.';

  if (n.alerta_id) {
    const urgente = n.alerta_nivel === 'critica';
    return {
      asunto: `${urgente ? 'URGENTE: ' : ''}Aviso de salud de ${n.nino} (${ETIQUETAS_ALERTA[n.alerta_tipo] || n.alerta_tipo})`,
      texto: `${saludo}\n\n${n.alerta_mensaje}${pie}`,
    };
  }
  const fecha = n.campana_fecha_programada ? `\n\nFecha: ${n.campana_fecha_programada}` : '';
  return {
    asunto: 'Aviso del centro de salud',
    texto: `${saludo}\n\n${n.campana_mensaje}${fecha}\n\nNiño(s): ${n.nino}${pie}`,
  };
}

// Reserva un lote de notificaciones listas para enviar
async function reservarLote(limite) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT x.id
       FROM notificacion x
       LEFT JOIN campana ca ON ca.id = x.campana_id
       WHERE x.estado_envio = 'pendiente'
         AND x.proximo_intento <= now()
         AND (ca.fecha_programada IS NULL OR ca.fecha_programada <= ${HOY})
       ORDER BY x.proximo_intento
       LIMIT $1
       FOR UPDATE OF x SKIP LOCKED`,
      [limite]
    );
    const ids = rows.map((r) => r.id);
    if (ids.length > 0) {
      await client.query(
        `UPDATE notificacion SET proximo_intento = now() + ($2::int * interval '1 minute')
         WHERE id = ANY($1::uuid[])`,
        [ids, MINUTOS_RESERVA]
      );
    }
    await client.query('COMMIT');
    return ids;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Datos necesarios para enviar (contacto descifrado + contenido)
async function datosEnvio(ids) {
  const { rows } = await pool.query(
    `SELECT x.id, x.canal, x.intentos, x.alerta_id, x.campana_id,
            p.nombre_completo AS padre, p.correo, p.telegram_chat_id,
            CASE WHEN x.campana_id IS NULL THEN n.nombre
                 ELSE (SELECT string_agg(h.nombre, ', ' ORDER BY h.nombre) FROM nino h WHERE h.padre_id = p.id)
            END AS nino,
            a.tipo AS alerta_tipo, a.nivel AS alerta_nivel, a.mensaje AS alerta_mensaje, a.atendida AS alerta_atendida,
            ca.mensaje AS campana_mensaje, ca.fecha_programada AS campana_fecha_programada
     FROM notificacion x
     JOIN nino n ON n.id = x.nino_id
     JOIN padre p ON p.id = n.padre_id
     LEFT JOIN alerta a ON a.id = x.alerta_id
     LEFT JOIN campana ca ON ca.id = x.campana_id
     WHERE x.id = ANY($1::uuid[])`,
    [ids]
  );
  return rows.map((r) => ({ ...r, correo: descifrar(r.correo), telegram_chat_id: descifrar(r.telegram_chat_id) }));
}

async function marcarEnviada(id) {
  await pool.query(
    `UPDATE notificacion
     SET estado_envio = 'enviado', fecha_envio = now(), intentos = intentos + 1, ultimo_error = NULL
     WHERE id = $1`,
    [id]
  );
}

// definitivo = true: no se reintenta (por ejemplo, el padre no tiene contacto)
async function marcarError(id, intentosPrevios, mensaje, definitivo = false) {
  const intentos = intentosPrevios + 1;
  const agotado = definitivo || intentos >= MAX_INTENTOS;
  await pool.query(
    `UPDATE notificacion
     SET intentos = $2, ultimo_error = $3,
         estado_envio = CASE WHEN $4 THEN 'fallido' ELSE 'pendiente' END,
         proximo_intento = now() + ($5::int * interval '1 minute')
     WHERE id = $1`,
    [id, intentos, mensaje.slice(0, 500), agotado, MINUTOS_ESPERA_BASE * 2 ** (intentos - 1)]
  );
}

async function enviarUna(n) {
  if (n.alerta_id && n.alerta_atendida) {
    return marcarError(n.id, n.intentos, 'Omitida: la alerta ya fue atendida antes del envío', true);
  }

  const { asunto, texto } = armarMensaje(n);
  try {
    if (n.canal === 'Email') {
      if (!n.correo) return marcarError(n.id, n.intentos, 'El padre o tutor no tiene correo registrado', true);
      await canales.enviarCorreo({ para: n.correo, asunto, texto });
    } else {
      if (!n.telegram_chat_id) {
        return marcarError(n.id, n.intentos, 'El padre o tutor no tiene chat de Telegram registrado', true);
      }
      await canales.enviarTelegram({ chatId: n.telegram_chat_id, texto: `${asunto}\n\n${texto}` });
    }
    return marcarEnviada(n.id);
  } catch (error) {
    return marcarError(n.id, n.intentos, error.message || 'Error desconocido');
  }
}

// Envia las notificaciones pendientes. Devuelve un resumen.
async function enviarPendientes({ limite = LOTE } = {}) {
  const ids = await reservarLote(limite);
  if (ids.length === 0) return { procesadas: 0, enviadas: 0, con_error: 0 };

  const notificaciones = await datosEnvio(ids);
  for (const n of notificaciones) {
    await enviarUna(n); // de una en una, para no saturar al servidor de correo
  }

  const { rows } = await pool.query(
    `SELECT count(*) FILTER (WHERE estado_envio = 'enviado')::int AS enviadas,
            count(*) FILTER (WHERE estado_envio <> 'enviado')::int AS con_error
     FROM notificacion WHERE id = ANY($1::uuid[])`,
    [ids]
  );
  return { procesadas: ids.length, ...rows[0] };
}

// ---------------------------------------------------------------------
// Consulta y gestion por el personal
// ---------------------------------------------------------------------

async function listar({ estado, canal, ninoId, campanaId, alertaId }, paginacion) {
  return consultar(
    pool,
    {
      sql: `SELECT x.id, x.canal, x.estado_envio, x.intentos, x.ultimo_error,
                   x.fecha_creacion, x.fecha_envio, x.proximo_intento,
                   x.nino_id, n.nombre AS nino, p.nombre_completo AS padre,
                   x.alerta_id, a.tipo AS alerta_tipo, a.nivel AS alerta_nivel,
                   x.campana_id, CASE WHEN x.alerta_id IS NOT NULL THEN 'alerta' ELSE 'campana' END AS origen
            FROM notificacion x
            JOIN nino n ON n.id = x.nino_id
            JOIN padre p ON p.id = n.padre_id
            LEFT JOIN alerta a ON a.id = x.alerta_id
            WHERE ($1::text IS NULL OR x.estado_envio = $1)
              AND ($2::text IS NULL OR x.canal = $2)
              AND ($3::uuid IS NULL OR x.nino_id = $3)
              AND ($4::uuid IS NULL OR x.campana_id = $4)
              AND ($5::uuid IS NULL OR x.alerta_id = $5)`,
      params: [estado || null, canal || null, ninoId || null, campanaId || null, alertaId || null],
      orden: 't.fecha_creacion DESC, t.id',
    },
    paginacion
  );
}

// Vuelve a poner en cola una notificacion fallida
async function reintentar(id) {
  const { rowCount } = await pool.query(
    `UPDATE notificacion
     SET estado_envio = 'pendiente', intentos = 0, ultimo_error = NULL, proximo_intento = now()
     WHERE id = $1 AND estado_envio = 'fallido'`,
    [id]
  );
  if (rowCount === 0) {
    const existe = await pool.query('SELECT estado_envio FROM notificacion WHERE id = $1', [id]);
    if (!existe.rows[0]) throw crearError(404, 'Notificación no encontrada');
    throw crearError(409, `Solo se pueden reintentar notificaciones fallidas (esta está "${existe.rows[0].estado_envio}")`);
  }
  return { mensaje: 'Notificación puesta en cola de nuevo' };
}

// Envia un mensaje de prueba para verificar la configuracion de un canal
async function enviarPrueba({ canal, destino }) {
  const texto = 'Mensaje de prueba del Sistema de Control de Crecimiento y Vacunación Infantil (SCCVI). Si lo recibes, el canal está bien configurado.';
  try {
    const resultado =
      canal === 'Email'
        ? await canales.enviarCorreo({ para: destino, asunto: 'Prueba de correo SCCVI', texto })
        : await canales.enviarTelegram({ chatId: destino, texto });
    return { mensaje: resultado.simulado ? 'Envío simulado (canal sin configurar): revisa la consola del servidor' : 'Mensaje enviado' };
  } catch (error) {
    throw crearError(502, `No se pudo enviar: ${error.message}`);
  }
}

module.exports = {
  enviarPendientes,
  listar,
  reintentar,
  enviarPrueba,
  estadoCanales: canales.estadoCanales,
  armarMensaje,
};
