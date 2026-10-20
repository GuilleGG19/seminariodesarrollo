// Verifica que la peticion venga de un usuario con sesion valida.
// El token viaja en una cookie httpOnly llamada "token".
const jwt = require('jsonwebtoken');
const { obtenerUsuarioActivo } = require('../services/auth.service');

const verificarToken = async (req, res, next) => {
  try {
    const token = req.cookies && req.cookies.token;
    if (!token) {
      return res.status(401).json({ error: 'No autenticado' });
    }

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    } catch (error) {
      return res.status(401).json({ error: 'Sesión inválida o expirada' });
    }

    // Se consulta la base en cada peticion: si el usuario fue desactivado,
    // pierde el acceso de inmediato aunque su token no haya expirado.
    const usuario = await obtenerUsuarioActivo(payload.id);
    if (!usuario) {
      return res.status(401).json({ error: 'Usuario no válido o inactivo' });
    }

    req.usuario = usuario; // disponible en los controladores
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = { verificarToken };
