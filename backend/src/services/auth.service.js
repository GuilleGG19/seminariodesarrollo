// Logica de autenticacion: verificar credenciales y generar el JWT.
// Los servicios son los unicos que hablan con la base de datos.
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');

const DURACION_HORAS = 8;
const DURACION_MS = DURACION_HORAS * 60 * 60 * 1000;

// Hash de relleno: se usa para comparar cuando el correo no existe,
// de modo que el tiempo de respuesta no revele si el correo esta registrado.
const HASH_FALSO = bcrypt.hashSync('contrasena-falsa', 10);

async function login(correo, password) {
  const { rows } = await pool.query(
    `SELECT u.id, u.nombre_completo, u.correo, u.password_hash, u.estado, r.nombre AS rol
     FROM usuario u
     JOIN rol r ON r.id = u.rol_id
     WHERE u.correo = $1`,
    [correo]
  );
  const usuario = rows[0];

  const coincide = await bcrypt.compare(password, usuario ? usuario.password_hash : HASH_FALSO);

  // Mismo mensaje si falla el correo o la contrasena (no se revela cual fue)
  if (!usuario || !coincide) {
    throw Object.assign(new Error('Credenciales inválidas'), { status: 401 });
  }
  if (usuario.estado !== 'activo') {
    throw Object.assign(new Error('El usuario está inactivo'), { status: 403 });
  }

  const token = jwt.sign({ id: usuario.id, rol: usuario.rol }, process.env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: `${DURACION_HORAS}h`,
  });

  return {
    token,
    usuario: {
      id: usuario.id,
      nombre_completo: usuario.nombre_completo,
      correo: usuario.correo,
      rol: usuario.rol,
    },
  };
}

// Devuelve el usuario si existe y sigue activo; si no, null.
async function obtenerUsuarioActivo(id) {
  const { rows } = await pool.query(
    `SELECT u.id, u.nombre_completo, u.correo, r.nombre AS rol
     FROM usuario u
     JOIN rol r ON r.id = u.rol_id
     WHERE u.id = $1 AND u.estado = 'activo'`,
    [id]
  );
  return rows[0] || null;
}

module.exports = { login, obtenerUsuarioActivo, DURACION_MS };
