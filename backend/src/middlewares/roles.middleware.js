// Restringe una ruta a ciertos roles. Debe ir DESPUES de verificarToken.
// Ejemplo: router.post('/', verificarToken, permitirRoles('administrador'), crear)
const permitirRoles = (...rolesPermitidos) => (req, res, next) => {
  if (!req.usuario || !rolesPermitidos.includes(req.usuario.rol)) {
    return res.status(403).json({ error: 'No tienes permiso para realizar esta acción' });
  }
  next();
};

module.exports = { permitirRoles };
