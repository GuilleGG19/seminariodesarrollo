// Controlador de autenticacion: recibe la peticion HTTP y responde.
// La logica y las consultas estan en services/auth.service.js
const authService = require('../services/auth.service');

const OPCIONES_COOKIE = {
  httpOnly: true, // JavaScript del navegador no puede leer la cookie
  sameSite: 'lax', // no se envia en peticiones POST desde otros sitios
  secure: process.env.NODE_ENV === 'production', // solo HTTPS en produccion
};

// POST /api/auth/login
const login = async (req, res, next) => {
  try {
    const { correo, password } = req.body;
    if (!correo || !password) {
      return res.status(400).json({ error: 'correo y password son obligatorios' });
    }

    const { token, usuario } = await authService.login(
      String(correo).trim().toLowerCase(),
      String(password)
    );

    res.cookie('token', token, { ...OPCIONES_COOKIE, maxAge: authService.DURACION_MS });
    res.json({ mensaje: 'Inicio de sesión exitoso', usuario });
  } catch (error) {
    next(error);
  }
};

// POST /api/auth/logout
const logout = (req, res) => {
  res.clearCookie('token', OPCIONES_COOKIE);
  res.json({ mensaje: 'Sesión cerrada' });
};

// GET /api/auth/perfil
const perfil = (req, res) => {
  res.json({ usuario: req.usuario });
};

module.exports = { login, logout, perfil };
