// Controlador de autenticacion: recibe la peticion HTTP y responde.
// La logica y las consultas estan en services/auth.service.js
const authService = require('../services/auth.service');
const { leerToken } = require('../middlewares/auth.middleware');
const { validarPassword } = require('../utils/password');

const OPCIONES_COOKIE = {
  httpOnly: true, // JavaScript del navegador no puede leer la cookie
  sameSite: 'lax', // no se envia en peticiones POST desde otros sitios
  secure: process.env.NODE_ENV === 'production', // solo HTTPS en produccion
};

const enviarCookie = (res, token) =>
  res.cookie('token', token, { ...OPCIONES_COOKIE, maxAge: authService.DURACION_MS });

// POST /api/auth/login
const login = async (req, res, next) => {
  try {
    const { correo, password } = req.body;
    if (typeof correo !== 'string' || typeof password !== 'string' || !correo || !password) {
      return res.status(400).json({ error: 'correo y password son obligatorios' });
    }

    const { token, usuario } = await authService.login(correo.trim().toLowerCase(), password);

    enviarCookie(res, token);
    res.json({ mensaje: 'Inicio de sesión exitoso', usuario });
  } catch (error) {
    next(error);
  }
};

// POST /api/auth/logout
// Ademas de borrar la cookie, invalida el token en el servidor (cierra todas
// las sesiones del usuario), por si alguien hubiera copiado la cookie.
const logout = async (req, res, next) => {
  try {
    const payload = leerToken(req);
    if (payload && payload.id) {
      await authService.invalidarSesiones(payload.id);
    }
    res.clearCookie('token', OPCIONES_COOKIE);
    res.json({ mensaje: 'Sesión cerrada' });
  } catch (error) {
    next(error);
  }
};

// GET /api/auth/perfil
const perfil = (req, res) => {
  res.json({ usuario: req.usuario });
};

// PATCH /api/auth/password   { password_actual, password_nueva }
const cambiarPassword = async (req, res, next) => {
  try {
    const { password_actual: actual, password_nueva: nueva } = req.body;
    if (typeof actual !== 'string' || !actual) {
      return res.status(400).json({ error: 'password_actual es obligatoria' });
    }
    const errorPassword = validarPassword(nueva);
    if (errorPassword) {
      return res.status(400).json({ error: errorPassword });
    }

    const { token } = await authService.cambiarPasswordPropia(req.usuario.id, actual, nueva);
    enviarCookie(res, token);
    res.json({ mensaje: 'Contraseña actualizada. Se cerraron tus otras sesiones.' });
  } catch (error) {
    next(error);
  }
};

module.exports = { login, logout, perfil, cambiarPassword };
