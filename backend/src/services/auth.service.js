// Logica de autenticacion: verificar credenciales y generar el JWT.
// Los servicios son los unicos que hablan con la base de datos.
//
// El JWT lleva "tv" (token_version del usuario). Al cerrar sesion, cambiar la
// contrasena o desactivar al usuario, token_version aumenta y los tokens
// emitidos antes dejan de ser validos aunque no hayan expirado.
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');

const DURACION_HORAS = 8;
const DURACION_MS = DURACION_HORAS * 60 * 60 * 1000;

const crearError = (status, mensaje) => Object.assign(new Error(mensaje), { status });

// Hash de relleno: se usa para comparar cuando el correo no existe,
// de modo que el tiempo de respuesta no revele si el correo esta registrado.
const HASH_FALSO = bcrypt.hashSync('contrasena-falsa', 10);

const firmarToken = (usuario) =>
  jwt.sign({ id: usuario.id, tv: usuario.token_version }, process.env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: `${DURACION_HORAS}h`,
  });

async function login(correo, password) {
  const { rows } = await pool.query(
    `SELECT u.id, u.nombre_completo, u.correo, u.password_hash, u.estado, u.token_version,
            r.nombre AS rol
     FROM usuario u
     JOIN rol r ON r.id = u.rol_id
     WHERE u.correo = $1`,
    [correo]
  );
  const usuario = rows[0];

  const coincide = await bcrypt.compare(password, usuario ? usuario.password_hash : HASH_FALSO);

  // Mismo mensaje si falla el correo o la contrasena (no se revela cual fue)
  if (!usuario || !coincide) {
    throw crearError(401, 'Credenciales inválidas');
  }
  if (usuario.estado !== 'activo') {
    throw crearError(403, 'El usuario está inactivo');
  }

  return {
    token: firmarToken(usuario),
    usuario: {
      id: usuario.id,
      nombre_completo: usuario.nombre_completo,
      correo: usuario.correo,
      rol: usuario.rol,
    },
  };
}

// Devuelve el usuario si existe, sigue activo y el token es de su version actual; si no, null.
async function obtenerUsuarioActivo(id, tokenVersion) {
  const { rows } = await pool.query(
    `SELECT u.id, u.nombre_completo, u.correo, r.nombre AS rol
     FROM usuario u
     JOIN rol r ON r.id = u.rol_id
     WHERE u.id = $1 AND u.estado = 'activo' AND u.token_version = $2`,
    [id, tokenVersion]
  );
  return rows[0] || null;
}

// Invalida todas las sesiones abiertas del usuario
async function invalidarSesiones(id, ejecutor = pool) {
  await ejecutor.query('UPDATE usuario SET token_version = token_version + 1 WHERE id = $1', [id]);
}

// El propio usuario cambia su contrasena (debe confirmar la actual).
// Se cierran sus otras sesiones y se devuelve un token nuevo para la sesion actual.
async function cambiarPasswordPropia(id, actual, nueva) {
  const { rows } = await pool.query('SELECT password_hash FROM usuario WHERE id = $1', [id]);
  if (!rows[0] || !(await bcrypt.compare(actual, rows[0].password_hash))) {
    throw crearError(401, 'La contraseña actual no es correcta');
  }
  if (await bcrypt.compare(nueva, rows[0].password_hash)) {
    throw crearError(400, 'La nueva contraseña debe ser distinta a la actual');
  }

  const hash = await bcrypt.hash(nueva, 10);
  const actualizado = await pool.query(
    `UPDATE usuario SET password_hash = $1, token_version = token_version + 1
     WHERE id = $2
     RETURNING id, token_version`,
    [hash, id]
  );
  return { token: firmarToken(actualizado.rows[0]) };
}

module.exports = {
  login,
  obtenerUsuarioActivo,
  invalidarSesiones,
  cambiarPasswordPropia,
  DURACION_MS,
};
