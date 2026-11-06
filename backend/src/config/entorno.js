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
  // Base de datos: DATABASE_URL (nube) o DB_HOST/DB_USER/... (Docker local)
  let passwordDb = process.env.DB_PASSWORD || '';
  if (process.env.DATABASE_URL) {
    try {
      const url = new URL(process.env.DATABASE_URL);
      if (!/^postgres(ql)?:$/.test(url.protocol)) throw new Error();
      passwordDb = decodeURIComponent(url.password);
    } catch {
      errores.push('DATABASE_URL no es válida (formato: postgresql://usuario:clave@host:5432/base)');
    }
  } else {
    for (const nombre of ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME']) {
      if (!process.env[nombre]) errores.push(`Falta ${nombre} (o DATABASE_URL)`);
    }
  }
  if (!['false', 'verify', 'no-verify', undefined].includes(process.env.DB_SSL?.toLowerCase())) {
    errores.push('DB_SSL debe ser false, verify o no-verify');
  }

  // Correo con Resend: la clave empieza con "re_" y hace falta un remitente
  if (process.env.RESEND_API_KEY) {
    if (!process.env.RESEND_API_KEY.startsWith('re_')) {
      errores.push('RESEND_API_KEY no parece una clave de Resend (debe empezar con "re_")');
    }
    if (!/<[^@\s]+@[^@\s]+\.[^@\s>]+>$|^[^@\s<]+@[^@\s]+\.[^@\s]+$/.test((process.env.EMAIL_FROM || '').trim())) {
      errores.push('Con Resend, EMAIL_FROM es obligatorio: "Nombre <correo@tu-dominio.com>" o "correo@tu-dominio.com"');
    }
  }

  if (process.env.NODE_ENV === 'production') {
    if (!process.env.FRONTEND_URL || !process.env.FRONTEND_URL.startsWith('https://')) {
      errores.push('En produccion FRONTEND_URL debe usar https://');
    }
    if (passwordDb.length < 12) {
      errores.push('En produccion la contraseña de la base de datos debe tener al menos 12 caracteres');
    }
    if (!process.env.DB_SSL || process.env.DB_SSL.toLowerCase() === 'false') {
      errores.push('En produccion la conexion a la base debe usar SSL (DB_SSL=verify)');
    }
  }

  return errores;
}

module.exports = { validarEntorno };
