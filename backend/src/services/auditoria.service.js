// Consulta del registro de auditoria (solo administrador).
const { pool } = require('../config/db');
const { consultar } = require('../utils/paginacion');

async function listar({ usuarioId, metodo, desde, hasta }, paginacion) {
  return consultar(
    pool,
    {
      sql: `SELECT a.id, a.fecha, a.metodo, a.ruta, a.estado, a.ip,
                   a.usuario_id, u.nombre_completo AS usuario, u.correo
            FROM auditoria a
            LEFT JOIN usuario u ON u.id = a.usuario_id
            WHERE ($1::uuid IS NULL OR a.usuario_id = $1)
              AND ($2::text IS NULL OR a.metodo = $2)
              AND ($3::date IS NULL OR a.fecha >= $3::date)
              AND ($4::date IS NULL OR a.fecha < $4::date + 1)`,
      params: [usuarioId || null, metodo || null, desde || null, hasta || null],
      orden: 't.fecha DESC, t.id DESC',
    },
    paginacion
  );
}

module.exports = { listar };
