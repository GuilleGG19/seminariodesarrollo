// Logica del catalogo de vacunas. Aqui viven las consultas SQL.
const { pool } = require('../config/db');

const crearError = (status, mensaje) => Object.assign(new Error(mensaje), { status });

async function listar({ buscar }) {
  const patron = buscar ? `%${buscar}%` : null;
  const { rows } = await pool.query(
    `SELECT id, nombre, edad_recomendada_meses, dosis_total
     FROM vacuna
     WHERE ($1::text IS NULL OR nombre ILIKE $1)
     ORDER BY edad_recomendada_meses, nombre`,
    [patron]
  );
  return rows;
}

async function obtenerPorId(id) {
  const { rows } = await pool.query(
    `SELECT id, nombre, edad_recomendada_meses, dosis_total
     FROM vacuna
     WHERE id = $1`,
    [id]
  );
  if (!rows[0]) {
    throw crearError(404, 'Vacuna no encontrada');
  }
  return rows[0];
}

// El esquema no tiene un UNIQUE en el nombre, asi que se comprueba aqui
// (sin importar mayusculas). "idExcluido" sirve al editar: ignora la propia vacuna.
async function verificarNombreLibre(nombre, idExcluido) {
  const { rows } = await pool.query(
    `SELECT 1 FROM vacuna
     WHERE lower(nombre) = lower($1) AND ($2::uuid IS NULL OR id <> $2)`,
    [nombre, idExcluido || null]
  );
  if (rows.length > 0) {
    throw crearError(409, 'Ya existe una vacuna con ese nombre');
  }
}

async function crear({ nombre, edad_recomendada_meses, dosis_total }) {
  await verificarNombreLibre(nombre, null);
  const { rows } = await pool.query(
    `INSERT INTO vacuna (nombre, edad_recomendada_meses, dosis_total)
     VALUES ($1, $2, $3)
     RETURNING id, nombre, edad_recomendada_meses, dosis_total`,
    [nombre, edad_recomendada_meses, dosis_total]
  );
  return rows[0];
}

async function actualizar(id, { nombre, edad_recomendada_meses, dosis_total }) {
  await obtenerPorId(id); // lanza 404 si no existe
  await verificarNombreLibre(nombre, id);

  // No se puede bajar el total de dosis por debajo de dosis que ya estan registradas
  const conflicto = await pool.query(
    'SELECT 1 FROM vacunacion WHERE vacuna_id = $1 AND numero_dosis > $2 LIMIT 1',
    [id, dosis_total]
  );
  if (conflicto.rows.length > 0) {
    throw crearError(
      409,
      'Hay niños con dosis registradas de un número mayor al nuevo total de dosis'
    );
  }

  const { rows } = await pool.query(
    `UPDATE vacuna
     SET nombre = $1, edad_recomendada_meses = $2, dosis_total = $3
     WHERE id = $4
     RETURNING id, nombre, edad_recomendada_meses, dosis_total`,
    [nombre, edad_recomendada_meses, dosis_total, id]
  );
  return rows[0];
}

async function eliminar(id) {
  try {
    const { rowCount } = await pool.query('DELETE FROM vacuna WHERE id = $1', [id]);
    if (rowCount === 0) {
      throw crearError(404, 'Vacuna no encontrada');
    }
  } catch (error) {
    // 23503 = llave foranea: ya tiene dosis registradas o campanas
    if (error.code === '23503') {
      throw crearError(409, 'No se puede eliminar: la vacuna tiene dosis registradas o campañas asociadas');
    }
    throw error;
  }
}

module.exports = { listar, obtenerPorId, crear, actualizar, eliminar };
