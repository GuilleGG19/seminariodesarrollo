// Controlador de usuarios: valida lo que llega por HTTP y responde.
// La logica y las consultas estan en services/usuario.service.js
const usuarioService = require('../services/usuario.service');
const { validarPassword } = require('../utils/password');

const REGEX_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ESTADOS = ['activo', 'inactivo'];

// Devuelve el texto sin espacios a los lados, o '' si no es texto
const texto = (valor) => (typeof valor === 'string' ? valor.trim() : '');

function limpiarDatos(body) {
  return {
    nombre_completo: texto(body.nombre_completo),
    correo: texto(body.correo).toLowerCase(),
    rol_id: texto(body.rol_id),
  };
}

// Devuelve un texto de error, o null si los datos son validos
function validarDatos({ nombre_completo, correo, rol_id }) {
  if (!nombre_completo || !correo || !rol_id) {
    return 'nombre_completo, correo y rol_id son obligatorios';
  }
  if (nombre_completo.length > 150 || correo.length > 150) {
    return 'nombre_completo y correo no pueden superar 150 caracteres';
  }
  if (!REGEX_CORREO.test(correo)) {
    return 'El correo no tiene un formato válido';
  }
  return null;
}

// GET /api/usuarios/roles
const listarRoles = async (req, res, next) => {
  try {
    res.json(await usuarioService.listarRoles());
  } catch (error) {
    next(error);
  }
};

// GET /api/usuarios
const listar = async (req, res, next) => {
  try {
    res.json(await usuarioService.listar());
  } catch (error) {
    next(error);
  }
};

// GET /api/usuarios/:id
const obtener = async (req, res, next) => {
  try {
    res.json(await usuarioService.obtenerPorId(req.params.id));
  } catch (error) {
    next(error);
  }
};

// POST /api/usuarios
const crear = async (req, res, next) => {
  try {
    const datos = limpiarDatos(req.body);
    const errorDatos = validarDatos(datos) || validarPassword(req.body.password);
    if (errorDatos) {
      return res.status(400).json({ error: errorDatos });
    }

    const usuario = await usuarioService.crear({ ...datos, password: req.body.password });
    res.status(201).json(usuario);
  } catch (error) {
    next(error);
  }
};

// PUT /api/usuarios/:id
const actualizar = async (req, res, next) => {
  try {
    const datos = limpiarDatos(req.body);
    const errorDatos = validarDatos(datos);
    if (errorDatos) {
      return res.status(400).json({ error: errorDatos });
    }

    res.json(await usuarioService.actualizar(req.params.id, datos, req.usuario.id));
  } catch (error) {
    next(error);
  }
};

// PATCH /api/usuarios/:id/estado
const cambiarEstado = async (req, res, next) => {
  try {
    const { estado } = req.body;
    if (!ESTADOS.includes(estado)) {
      return res.status(400).json({ error: "estado debe ser 'activo' o 'inactivo'" });
    }

    res.json(await usuarioService.cambiarEstado(req.params.id, estado, req.usuario.id));
  } catch (error) {
    next(error);
  }
};

// PATCH /api/usuarios/:id/password
const cambiarPassword = async (req, res, next) => {
  try {
    const errorPassword = validarPassword(req.body.password);
    if (errorPassword) {
      return res.status(400).json({ error: errorPassword });
    }

    await usuarioService.cambiarPassword(req.params.id, req.body.password);
    res.json({ mensaje: 'Contraseña actualizada. Las sesiones abiertas de ese usuario se cerraron.' });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  listarRoles,
  listar,
  obtener,
  crear,
  actualizar,
  cambiarEstado,
  cambiarPassword,
};
