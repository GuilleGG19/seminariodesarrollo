// Limites de peticiones (proteccion contra abuso y fuerza bruta).
const rateLimit = require('express-rate-limit');

// Limite general para toda la API
const limiteGeneral = rateLimit({
  windowMs: 15 * 60 * 1000, // ventana de 15 minutos
  // maximo de peticiones por IP dentro de la ventana (en un centro de salud
  // varias computadoras suelen compartir la misma IP publica)
  limit: Number(process.env.RATE_LIMIT_GENERAL) || 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas peticiones, intenta de nuevo en unos minutos' },
});

// Limite estricto para el login: solo cuentan los intentos fallidos
const limiteLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de inicio de sesión, intenta de nuevo en 15 minutos' },
});

// Limite para el acceso publico al carnet (sin sesion): solo cuentan las peticiones
// que fallan (PIN incorrecto, carnet inexistente, etc.)
const limitePublico = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos, intenta de nuevo en 15 minutos' },
});

module.exports = { limiteGeneral, limiteLogin, limitePublico };
