// Registra en la tabla auditoria cada peticion que modifica datos
// (POST, PUT, PATCH, DELETE): quien, que ruta, con que resultado y cuando.
// No se guarda el cuerpo de la peticion para no copiar datos sensibles.
const { pool } = require('../config/db');

const METODOS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const registrarAuditoria = (req, res, next) => {
  if (!METODOS.has(req.method)) return next();

  res.on('finish', () => {
    // req.usuario lo coloca verificarToken durante la peticion (null en rutas publicas)
    const usuarioId = req.usuario ? req.usuario.id : null;
    const ruta = req.originalUrl.split('?')[0].slice(0, 255);
    pool
      .query('INSERT INTO auditoria (usuario_id, metodo, ruta, estado, ip) VALUES ($1, $2, $3, $4, $5)', [
        usuarioId,
        req.method,
        ruta,
        res.statusCode,
        (req.ip || '').slice(0, 64),
      ])
      .catch((error) => console.error('[auditoria] No se pudo registrar:', error.message));
  });
  next();
};

module.exports = { registrarAuditoria };
