// Valida las variables de entorno obligatorias al arrancar.
// Si falta algo o es inseguro, el servidor no inicia (mejor fallar al inicio que en produccion).
const HEX_64 = /^[0-9a-fA-F]{64}$/;

function validarEntorno() {
  const errores = [];

  const jwt = process.env.JWT_SECRET || '';
  if (jwt.length < 32) {
    errores.push('JWT_SECRET debe tener al menos 32 caracteres aleatorios');
  }
  if (!HEX_64.test(process.env.DATA_ENCRYPTION_KEY || '')) {
    errores.push('DATA_ENCRYPTION_KEY debe tener 64 caracteres hexadecimales');
  }
  if (!HEX_64.test(process.env.DATA_HASH_KEY || '')) {
    errores.push('DATA_HASH_KEY debe tener 64 caracteres hexadecimales');
  }
  for (const nombre of ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME']) {
    if (!process.env[nombre]) errores.push(`Falta ${nombre}`);
  }

  if (process.env.NODE_ENV === 'production') {
    if (!process.env.FRONTEND_URL || !process.env.FRONTEND_URL.startsWith('https://')) {
      errores.push('En produccion FRONTEND_URL debe usar https://');
    }
    if ((process.env.DB_PASSWORD || '').length < 12) {
      errores.push('En produccion DB_PASSWORD debe tener al menos 12 caracteres');
    }
  }

  return errores;
}

module.exports = { validarEntorno };
