// Verifica que la peticion venga de un usuario con sesion valida.
// El token viaja en una cookie httpOnly llamada "token".
const jwt = require('jsonwebtoken');
const { obtenerUsuarioActivo } = require('../services/auth.service');

// Devuelve el contenido del token si es valido; si no, null
function leerToken(req) {
  const token = req.cookies && req.cookies.token;
  if (!token) return null;
  try {
    return jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
  } catch (error) {
    return null;
  }
}

const verificarToken = async (req, res, next) => {
  try {
    if (!req.cookies || !req.cookies.token) {
      return res.status(401).json({ error: 'No autenticado' });
    }

    const payload = leerToken(req);
    if (!payload || !Number.isInteger(payload.tv)) {
      return res.status(401).json({ error: 'Sesión inválida o expirada' });
    }

    // Se consulta la base en cada peticion: si el usuario fue desactivado, cerro
    // sesion o cambio su contrasena, pierde el acceso de inmediato.
    const usuario = await obtenerUsuarioActivo(payload.id, payload.tv);
    if (!usuario) {
      return res.status(401).json({ error: 'Sesión inválida o expirada' });
    }

    req.usuario = usuario; // disponible en los controladores
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = { verificarToken, leerToken };
