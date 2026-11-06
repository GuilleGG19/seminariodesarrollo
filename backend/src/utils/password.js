// Reglas de contrasena compartidas (usuarios creados por el admin y cambio propio).
// bcrypt solo usa los primeros 72 bytes, por eso el maximo.
function validarPassword(password) {
  if (typeof password !== 'string' || password.length < 8) {
    return 'La contraseña debe tener al menos 8 caracteres';
  }
  if (Buffer.byteLength(password, 'utf8') > 72) {
    return 'La contraseña no puede superar 72 caracteres';
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return 'La contraseña debe incluir al menos una letra y un número';
  }
  return null;
}

module.exports = { validarPassword };
