// Logica del CRUD de comunidades. Aqui viven las consultas SQL.
// Las consultas usan parametros ($1, $2...) para evitar la inyeccion SQL.
const { pool } = require('../config/db');

const crearError = (status, mensaje) => Object.assign(new Error(mensaje), { status });

// Consulta base: datos de la comunidad + cuantos padres y ninos tiene.
// count() devuelve bigint (texto en JS), por eso se convierte con ::int
const SELECT_COMUNIDAD = `
  SELECT c.id, c.nombre, c.ubicacion, c.num_familias_estimado,
         (SELECT count(*) FROM padre p WHERE p.comunidad_id = c.id)::int AS total_padres,
         (SELECT count(*) FROM nino n WHERE n.comunidad_id = c.id)::int AS total_ninos
  FROM comunidad c`;

// "buscar" es opcional: filtra por nombre sin importar mayusculas
async function listar(buscar) {
  const patron = buscar ? `%${buscar}%` : null;
  const { rows } = await pool.query(
    `${SELECT_COMUNIDAD}
     WHERE ($1::text IS NULL OR c.nombre ILIKE $1)
     ORDER BY c.nombre`,
    [patron]
  );
  return rows;
}

async function obtenerPorId(id) {
  const { rows } = await pool.query(`${SELECT_COMUNIDAD} WHERE c.id = $1`, [id]);
  if (!rows[0]) {
    throw crearError(404, 'Comunidad no encontrada');
  }
  return rows[0];
}

async function crear({ nombre, ubicacion, num_familias_estimado }) {
  const { rows } = await pool.query(
    `INSERT INTO comunidad (nombre, ubicacion, num_familias_estimado)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [nombre, ubicacion, num_familias_estimado]
  );
  return obtenerPorId(rows[0].id);
}

async function actualizar(id, { nombre, ubicacion, num_familias_estimado }) {
  const { rowCount } = await pool.query(
    `UPDATE comunidad
     SET nombre = $1, ubicacion = $2, num_familias_estimado = $3
     WHERE id = $4`,
    [nombre, ubicacion, num_familias_estimado, id]
  );
  if (rowCount === 0) {
    throw crearError(404, 'Comunidad no encontrada');
  }
  return obtenerPorId(id);
}

async function eliminar(id) {
  try {
    const { rowCount } = await pool.query('DELETE FROM comunidad WHERE id = $1', [id]);
    if (rowCount === 0) {
      throw crearError(404, 'Comunidad no encontrada');
    }
  } catch (error) {
    // 23503 = llave foranea: hay datos que dependen de esta comunidad
    if (error.code === '23503') {
      throw crearError(
        409,
        'No se puede eliminar: la comunidad tiene padres, niños o campañas asociados'
      );
    }
    throw error;
  }
}

module.exports = { listar, obtenerPorId, crear, actualizar, eliminar };
