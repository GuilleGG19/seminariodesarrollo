// Dashboard analitico: indicadores generales en una sola llamada.
// Usa los mismos umbrales que las alertas y los reportes (alertaReglas.service.js).
const { pool } = require('../config/db');
const { UMBRALES } = require('./alertaReglas.service');

const crearError = (status, mensaje) => Object.assign(new Error(mensaje), { status });

const HOY = `(now() at time zone 'America/Guatemala')::date`;
const DIAS_POR_MES = 30.4375;
const EDAD_MESES = `(extract(year from age(${HOY}, n.fecha_nacimiento)) * 12 + extract(month from age(${HOY}, n.fecha_nacimiento)))::int`;

// $1 = comunidad (o NULL para todas). Todas las consultas filtran los ninos con esto.
const FILTRO = '($1::uuid IS NULL OR n.comunidad_id = $1)';

async function resumen({ comunidadId }) {
  const id = comunidadId || null;
  if (id) {
    const { rows } = await pool.query('SELECT 1 FROM comunidad WHERE id = $1', [id]);
    if (!rows[0]) throw crearError(404, 'Comunidad no encontrada');
  }
  const p = [id];

  const [totales, alertas, nutricion, vacunacion, sinControl, tendencia, porComunidad, notificaciones] =
    await Promise.all([
      pool.query(
        `SELECT (SELECT count(*) FROM comunidad c WHERE $1::uuid IS NULL OR c.id = $1)::int AS comunidades,
                (SELECT count(*) FROM padre p WHERE $1::uuid IS NULL OR p.comunidad_id = $1)::int AS padres,
                count(*)::int AS ninos,
                (count(*) FILTER (WHERE ${EDAD_MESES} < 60))::int AS ninos_menores_5,
                (SELECT count(*) FROM registro_crecimiento r JOIN nino n ON n.id = r.nino_id
                  WHERE ${FILTRO} AND date_trunc('month', r.fecha_medicion) = date_trunc('month', ${HOY}))::int AS mediciones_mes,
                (SELECT count(*) FROM vacunacion v JOIN nino n ON n.id = v.nino_id
                  WHERE ${FILTRO} AND date_trunc('month', v.fecha_aplicada) = date_trunc('month', ${HOY}))::int AS dosis_aplicadas_mes
         FROM nino n
         WHERE ${FILTRO}`,
        p
      ),
      pool.query(
        `SELECT a.tipo, a.nivel, count(*)::int AS total
         FROM alerta a JOIN nino n ON n.id = a.nino_id
         WHERE a.atendida = false AND ${FILTRO}
         GROUP BY a.tipo, a.nivel`,
        p
      ),
      // Estado nutricional segun la ultima medicion de cada nino menor de 5 anios
      pool.query(
        `SELECT count(*) FILTER (WHERE u.percentil_peso IS NULL)::int AS sin_medicion,
                count(*) FILTER (WHERE u.percentil_peso < $2)::int AS bajo_peso,
                count(*) FILTER (WHERE u.percentil_peso > $3)::int AS sobrepeso,
                count(*) FILTER (WHERE u.percentil_talla < $4)::int AS talla_baja,
                count(*) FILTER (WHERE u.percentil_peso BETWEEN $2 AND $3
                                   AND (u.percentil_talla IS NULL OR u.percentil_talla >= $4))::int AS normal
         FROM nino n
         LEFT JOIN LATERAL (
           SELECT r.percentil_peso, r.percentil_talla FROM registro_crecimiento r
           WHERE r.nino_id = n.id ORDER BY r.fecha_medicion DESC, r.id DESC LIMIT 1
         ) u ON true
         WHERE ${FILTRO} AND ${EDAD_MESES} < 60`,
        [id, UMBRALES.percentilBajoPreventiva, UMBRALES.percentilAltoPreventiva, UMBRALES.percentilTallaBajaPreventiva]
      ),
      // Cobertura: ninos dentro de la edad del esquema sin ninguna dosis atrasada
      pool.query(
        `SELECT count(*)::int AS ninos_en_esquema,
                (count(*) FILTER (WHERE NOT EXISTS (
                   SELECT 1 FROM v_esquema_vacunacion e WHERE e.nino_id = n.id AND e.estado = 'atrasada'
                 )))::int AS esquema_al_dia,
                (SELECT count(*) FROM v_esquema_vacunacion e JOIN nino n ON n.id = e.nino_id
                  WHERE ${FILTRO} AND e.estado = 'atrasada' AND e.edad_nino_meses < $2)::int AS dosis_atrasadas,
                (SELECT count(*) FROM v_esquema_vacunacion e JOIN nino n ON n.id = e.nino_id
                  WHERE ${FILTRO} AND e.estado = 'pendiente' AND e.fecha_objetivo <= ${HOY} + 30)::int AS dosis_proximos_30_dias
         FROM nino n
         WHERE ${FILTRO} AND ${EDAD_MESES} < $2`,
        [id, UMBRALES.edadMaximaVacunacionMeses]
      ),
      pool.query(
        `SELECT count(*)::int AS total
         FROM nino n
         WHERE ${FILTRO} AND ${EDAD_MESES} < $2
           AND (${HOY} - COALESCE((SELECT max(r.fecha_medicion) FROM registro_crecimiento r WHERE r.nino_id = n.id),
                                  n.fecha_nacimiento))
               > CASE WHEN ${EDAD_MESES} < $3 THEN $4::float ELSE $5::float END`,
        [
          id,
          UMBRALES.edadMaximaControlMeses,
          UMBRALES.edadCambioFrecuenciaMeses,
          UMBRALES.mesesSinRegistroMenor * DIAS_POR_MES,
          UMBRALES.mesesSinRegistroMayor * DIAS_POR_MES,
        ]
      ),
      // Actividad de los ultimos 6 meses (incluido el actual)
      pool.query(
        `WITH meses AS (
           SELECT generate_series(date_trunc('month', ${HOY}) - interval '5 months',
                                  date_trunc('month', ${HOY}), interval '1 month')::date AS mes
         )
         SELECT to_char(m.mes, 'YYYY-MM') AS mes,
                (SELECT count(*) FROM registro_crecimiento r JOIN nino n ON n.id = r.nino_id
                  WHERE ${FILTRO} AND date_trunc('month', r.fecha_medicion) = m.mes)::int AS mediciones,
                (SELECT count(*) FROM vacunacion v JOIN nino n ON n.id = v.nino_id
                  WHERE ${FILTRO} AND date_trunc('month', v.fecha_aplicada) = m.mes)::int AS dosis_aplicadas,
                (SELECT count(*) FROM alerta a JOIN nino n ON n.id = a.nino_id
                  WHERE ${FILTRO} AND date_trunc('month', a.fecha_generada AT TIME ZONE 'America/Guatemala') = m.mes)::int AS alertas_generadas
         FROM meses m
         ORDER BY m.mes`,
        p
      ),
      pool.query(
        `SELECT c.id, c.nombre,
                count(n.id)::int AS ninos,
                (SELECT count(*) FROM alerta a JOIN nino x ON x.id = a.nino_id
                  WHERE x.comunidad_id = c.id AND a.atendida = false AND a.nivel = 'critica')::int AS alertas_criticas,
                (count(n.id) FILTER (WHERE ${EDAD_MESES} < $2))::int AS ninos_en_esquema,
                (count(n.id) FILTER (WHERE ${EDAD_MESES} < $2 AND NOT EXISTS (
                   SELECT 1 FROM v_esquema_vacunacion e WHERE e.nino_id = n.id AND e.estado = 'atrasada'
                 )))::int AS esquema_al_dia
         FROM comunidad c
         LEFT JOIN nino n ON n.comunidad_id = c.id
         WHERE $1::uuid IS NULL OR c.id = $1
         GROUP BY c.id, c.nombre
         ORDER BY c.nombre`,
        [id, UMBRALES.edadMaximaVacunacionMeses]
      ),
      pool.query(
        `SELECT count(*) FILTER (WHERE x.estado_envio = 'pendiente')::int AS pendientes,
                count(*) FILTER (WHERE x.estado_envio = 'fallido')::int AS fallidas,
                count(*) FILTER (WHERE x.estado_envio = 'enviado' AND x.fecha_envio > now() - interval '30 days')::int AS enviadas_30_dias
         FROM notificacion x JOIN nino n ON n.id = x.nino_id
         WHERE ${FILTRO}`,
        p
      ),
    ]);

  const porcentaje = (parte, total) => (total > 0 ? Math.round((1000 * parte) / total) / 10 : null);

  const alertasAbiertas = { total: 0, criticas: 0, preventivas: 0, por_tipo: {} };
  for (const fila of alertas.rows) {
    alertasAbiertas.total += fila.total;
    alertasAbiertas[fila.nivel === 'critica' ? 'criticas' : 'preventivas'] += fila.total;
    alertasAbiertas.por_tipo[fila.tipo] = (alertasAbiertas.por_tipo[fila.tipo] || 0) + fila.total;
  }

  const vac = vacunacion.rows[0];
  return {
    generado: new Date().toISOString(),
    comunidad_id: id,
    totales: { ...totales.rows[0], ninos_sin_control_reciente: sinControl.rows[0].total },
    alertas_abiertas: alertasAbiertas,
    estado_nutricional_menores_5: nutricion.rows[0],
    vacunacion: { ...vac, pct_esquema_al_dia: porcentaje(vac.esquema_al_dia, vac.ninos_en_esquema) },
    notificaciones: notificaciones.rows[0],
    tendencia_6_meses: tendencia.rows,
    por_comunidad: porComunidad.rows.map((c) => ({
      ...c,
      pct_esquema_al_dia: porcentaje(c.esquema_al_dia, c.ninos_en_esquema),
    })),
  };
}

module.exports = { resumen };
