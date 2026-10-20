// Campanas comunitarias (seccion 3.8 del documento): mensajes masivos para
// jornadas de vacunacion o controles medicos, segmentados por comunidad, edad
// y estado de vacunacion.
//
// Esta parte arma la campana y deja un registro "pendiente" por cada familia
// destinataria (tabla notificacion). El envio real (Email/Telegram) se conecta despues:
// solo tendra que recorrer las notificaciones pendientes.
//
// Regla de destinatarios: UNA notificacion por padre/madre, aunque tenga varios
// ninos que cumplan el filtro. Solo se incluye a quien tiene dato de contacto del
// canal que prefiere (correo para Email, chat_id para Telegram).
const { pool } = require('../config/db');
const { UMBRALES } = require('./alertaReglas.service');

const crearError = (status, mensaje) => Object.assign(new Error(mensaje), { status });

const HOY = `(now() at time zone 'America/Guatemala')::date`;
const DIAS_POR_MES = 30.4375;
const EDAD_MESES = `(extract(year from age(${HOY}, n.fecha_nacimiento)) * 12 + extract(month from age(${HOY}, n.fecha_nacimiento)))::int`;

// Arma la consulta de destinatarios segun los filtros. Todo va como parametros ($n).
function consultaDestinatarios(filtros) {
  const params = [];
  const condiciones = [];
  const agregar = (valor) => {
    params.push(valor);
    return `$${params.length}`;
  };

  if (filtros.comunidadId) {
    condiciones.push(`n.comunidad_id = ${agregar(filtros.comunidadId)}`);
  }
  if (filtros.edadMinMeses !== undefined) {
    condiciones.push(`${EDAD_MESES} >= ${agregar(filtros.edadMinMeses)}`);
  }
  if (filtros.edadMaxMeses !== undefined) {
    condiciones.push(`${EDAD_MESES} <= ${agregar(filtros.edadMaxMeses)}`);
  }

  if (filtros.estadoVacunacion) {
    // Ninos con al menos una dosis sin aplicar en ese estado (opcionalmente de una vacuna)
    const estado = filtros.estadoVacunacion === 'atrasada' ? `v.proxima_dosis < ${HOY}` : `v.proxima_dosis >= ${HOY}`;
    const vacuna = filtros.vacunaId ? `AND v.vacuna_id = ${agregar(filtros.vacunaId)}` : '';
    condiciones.push(
      `EXISTS (SELECT 1 FROM vacunacion v
               WHERE v.nino_id = n.id AND v.fecha_aplicada IS NULL AND v.proxima_dosis IS NOT NULL
                 AND ${estado} ${vacuna})`
    );
  } else if (filtros.vacunaId) {
    // Solo vacuna: ninos que ya tienen la edad recomendada y aun no completan sus dosis
    const idVacuna = agregar(filtros.vacunaId);
    condiciones.push(
      `EXISTS (SELECT 1 FROM vacuna va
               WHERE va.id = ${idVacuna}
                 AND ${EDAD_MESES} >= va.edad_recomendada_meses
                 AND (SELECT count(*) FROM vacunacion v
                      WHERE v.nino_id = n.id AND v.vacuna_id = va.id AND v.fecha_aplicada IS NOT NULL) < va.dosis_total)`
    );
  }

  if (filtros.sinControlReciente) {
    // Mismos plazos que las alertas de "sin registros"
    const menor = agregar(UMBRALES.mesesSinRegistroMenor * DIAS_POR_MES);
    const mayor = agregar(UMBRALES.mesesSinRegistroMayor * DIAS_POR_MES);
    const edadCambio = agregar(UMBRALES.edadCambioFrecuenciaMeses);
    const edadMaxima = agregar(UMBRALES.edadMaximaControlMeses);
    condiciones.push(
      `${EDAD_MESES} < ${edadMaxima}
       AND (${HOY} - COALESCE((SELECT max(r.fecha_medicion) FROM registro_crecimiento r WHERE r.nino_id = n.id),
                              n.fecha_nacimiento))
           > CASE WHEN ${EDAD_MESES} < ${edadCambio} THEN ${menor}::float ELSE ${mayor}::float END`
    );
  }

  const where = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';
  const sql = `
    SELECT p.id AS padre_id, p.nombre_completo AS padre, p.telefono,
           p.canal_preferido AS canal,
           (CASE WHEN p.canal_preferido = 'Email' THEN coalesce(p.correo, '') <> ''
                 ELSE coalesce(p.telegram_chat_id, '') <> '' END) AS tiene_contacto,
           (array_agg(n.id ORDER BY n.nombre))[1] AS nino_id,
           string_agg(n.nombre, ', ' ORDER BY n.nombre) AS ninos,
           min(c.nombre) AS comunidad
    FROM nino n
    JOIN padre p ON p.id = n.padre_id
    JOIN comunidad c ON c.id = n.comunidad_id
    ${where}
    GROUP BY p.id
    ORDER BY min(c.nombre), p.nombre_completo`;
  return { sql, params };
}

async function buscarDestinatarios(filtros, ejecutor = pool) {
  const { sql, params } = consultaDestinatarios(filtros);
  const { rows } = await ejecutor.query(sql, params);
  return {
    destinatarios: rows.filter((r) => r.tiene_contacto),
    sinContacto: rows.filter((r) => !r.tiene_contacto),
  };
}

// Valida que la comunidad y la vacuna existan (para dar un 404 claro)
async function validarReferencias({ comunidadId, vacunaId }) {
  if (comunidadId) {
    const r = await pool.query('SELECT 1 FROM comunidad WHERE id = $1', [comunidadId]);
    if (!r.rows[0]) throw crearError(404, 'Comunidad no encontrada');
  }
  if (vacunaId) {
    const r = await pool.query('SELECT 1 FROM vacuna WHERE id = $1', [vacunaId]);
    if (!r.rows[0]) throw crearError(404, 'Vacuna no encontrada');
  }
}

// Muestra a quien llegaria la campana, sin guardar nada
async function vistaPrevia(filtros) {
  await validarReferencias(filtros);
  const { destinatarios, sinContacto } = await buscarDestinatarios(filtros);
  return {
    total_destinatarios: destinatarios.length,
    omitidos_sin_contacto: sinContacto.length,
    destinatarios: destinatarios.slice(0, 50).map((d) => ({
      padre: d.padre,
      ninos: d.ninos,
      comunidad: d.comunidad,
      canal: d.canal,
    })),
    sin_contacto: sinContacto.slice(0, 50).map((d) => ({
      padre: d.padre,
      ninos: d.ninos,
      comunidad: d.comunidad,
      telefono: d.telefono,
      canal_preferido: d.canal,
    })),
  };
}

// Crea la campana y sus notificaciones pendientes en una sola transaccion
async function crear({ usuarioId, mensaje, fechaProgramada, filtros }) {
  await validarReferencias(filtros);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { destinatarios, sinContacto } = await buscarDestinatarios(filtros, client);

    if (destinatarios.length === 0) {
      throw crearError(
        422,
        sinContacto.length > 0
          ? `Hay ${sinContacto.length} familias que cumplen el filtro, pero ninguna tiene correo o chat de Telegram para contactarla`
          : 'Ningún niño cumple los filtros indicados'
      );
    }

    const { rows } = await client.query(
      `INSERT INTO campana (usuario_id, mensaje, comunidad_id, vacuna_id, edad_min_meses, edad_max_meses,
                            estado_vacunacion, sin_control_reciente, fecha_programada, total_destinatarios)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        usuarioId,
        mensaje,
        filtros.comunidadId || null,
        filtros.vacunaId || null,
        filtros.edadMinMeses ?? null,
        filtros.edadMaxMeses ?? null,
        filtros.estadoVacunacion || null,
        Boolean(filtros.sinControlReciente),
        fechaProgramada || null,
        destinatarios.length,
      ]
    );
    const campanaId = rows[0].id;

    await client.query(
      `INSERT INTO notificacion (nino_id, campana_id, canal)
       SELECT t.nino_id, $2::uuid, t.canal
       FROM unnest($1::uuid[], $3::text[]) AS t(nino_id, canal)`,
      [destinatarios.map((d) => d.nino_id), campanaId, destinatarios.map((d) => d.canal)]
    );

    await client.query('COMMIT');
    return { ...(await obtenerPorId(campanaId)), omitidos_sin_contacto: sinContacto.length };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

const SELECT_CAMPANA = `
  SELECT ca.id, ca.mensaje, ca.fecha_envio AS fecha_creacion, ca.fecha_programada,
         ca.total_destinatarios, ca.edad_min_meses, ca.edad_max_meses,
         ca.estado_vacunacion, ca.sin_control_reciente,
         co.nombre AS comunidad, va.nombre AS vacuna, u.nombre_completo AS creada_por,
         (SELECT count(*)::int FROM notificacion x WHERE x.campana_id = ca.id AND x.estado_envio = 'pendiente') AS pendientes,
         (SELECT count(*)::int FROM notificacion x WHERE x.campana_id = ca.id AND x.estado_envio = 'enviado') AS enviadas,
         (SELECT count(*)::int FROM notificacion x WHERE x.campana_id = ca.id AND x.estado_envio = 'fallido') AS fallidas
  FROM campana ca
  JOIN usuario u ON u.id = ca.usuario_id
  LEFT JOIN comunidad co ON co.id = ca.comunidad_id
  LEFT JOIN vacuna va ON va.id = ca.vacuna_id`;

async function listar() {
  const { rows } = await pool.query(`${SELECT_CAMPANA} ORDER BY ca.fecha_envio DESC`);
  return rows;
}

async function obtenerPorId(id) {
  const { rows } = await pool.query(`${SELECT_CAMPANA} WHERE ca.id = $1`, [id]);
  if (!rows[0]) throw crearError(404, 'Campaña no encontrada');

  const destinatarios = await pool.query(
    `SELECT p.nombre_completo AS padre, n.nombre AS nino, c.nombre AS comunidad,
            x.canal, x.estado_envio, x.fecha_envio
     FROM notificacion x
     JOIN nino n ON n.id = x.nino_id
     JOIN padre p ON p.id = n.padre_id
     JOIN comunidad c ON c.id = n.comunidad_id
     WHERE x.campana_id = $1
     ORDER BY c.nombre, p.nombre_completo`,
    [id]
  );
  return { ...rows[0], destinatarios: destinatarios.rows };
}

module.exports = { vistaPrevia, crear, listar, obtenerPorId };
