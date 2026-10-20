// Logica de gestion de usuarios del personal (solo administrador).
// Nunca se devuelve password_hash.
const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');

const COLUMNAS = `u.id, u.nombre_completo, u.correo, u.estado, u.fecha_creacion,
                  r.id AS rol_id, r.nombre AS rol`;

const crearError = (status, mensaje) => Object.assign(new Error(mensaje), { status });

async function listarRoles() {
  const { rows } = await pool.query('SELECT id, nombre FROM rol ORDER BY nombre');
  return rows;
}

async function listar() {
  const { rows } = await pool.query(
    `SELECT ${COLUMNAS}
     FROM usuario u
     JOIN rol r ON r.id = u.rol_id
     ORDER BY u.nombre_completo`
  );
  return rows;
}

async function obtenerPorId(id) {
  const { rows } = await pool.query(
    `SELECT ${COLUMNAS}
     FROM usuario u
     JOIN rol r ON r.id = u.rol_id
     WHERE u.id = $1`,
    [id]
  );
  if (!rows[0]) {
    throw crearError(404, 'Usuario no encontrado');
  }
  return rows[0];
}

// Comprueba que el rol exista antes de usarlo
async function verificarRol(rolId) {
  const { rows } = await pool.query('SELECT 1 FROM rol WHERE id = $1', [rolId]);
  if (rows.length === 0) {
    throw crearError(400, 'El rol indicado no existe');
  }
}

async function crear({ nombre_completo, correo, password, rol_id }) {
  await verificarRol(rol_id);
  const hash = await bcrypt.hash(password, 10);

  const { rows } = await pool.query(
    `INSERT INTO usuario (rol_id, nombre_completo, correo, password_hash)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [rol_id, nombre_completo, correo, hash]
  );
  return obtenerPorId(rows[0].id);
}

async function actualizar(id, { nombre_completo, correo, rol_id }, actorId) {
  await verificarRol(rol_id);

  // Regla: un administrador no puede cambiar su propio rol (evita quedarse sin acceso)
  if (id.toLowerCase() === actorId) {
    const actual = await obtenerPorId(id);
    if (actual.rol_id !== rol_id) {
      throw crearError(403, 'No puedes cambiar tu propio rol');
    }
  }

  const { rowCount } = await pool.query(
    `UPDATE usuario
     SET nombre_completo = $1, correo = $2, rol_id = $3
     WHERE id = $4`,
    [nombre_completo, correo, rol_id, id]
  );
  if (rowCount === 0) {
    throw crearError(404, 'Usuario no encontrado');
  }
  return obtenerPorId(id);
}

async function cambiarEstado(id, estado, actorId) {
  // Regla: un administrador no puede desactivarse a si mismo
  if (id.toLowerCase() === actorId && estado === 'inactivo') {
    throw crearError(403, 'No puedes desactivar tu propio usuario');
  }

  const { rowCount } = await pool.query('UPDATE usuario SET estado = $1 WHERE id = $2', [
    estado,
    id,
  ]);
  if (rowCount === 0) {
    throw crearError(404, 'Usuario no encontrado');
  }
  return obtenerPorId(id);
}

async function cambiarPassword(id, password) {
  const hash = await bcrypt.hash(password, 10);
  const { rowCount } = await pool.query('UPDATE usuario SET password_hash = $1 WHERE id = $2', [
    hash,
    id,
  ]);
  if (rowCount === 0) {
    throw crearError(404, 'Usuario no encontrado');
  }
}

module.exports = {
  listarRoles,
  listar,
  obtenerPorId,
  crear,
  actualizar,
  cambiarEstado,
  cambiarPassword,
};
