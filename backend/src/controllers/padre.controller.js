// Controlador de padres/tutores: valida lo que llega por HTTP y responde.
// La logica y las consultas estan en services/padre.service.js
const padreService = require('../services/padre.service');
const { leerPaginacion } = require('../utils/paginacion');

const REGEX_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REGEX_DPI = /^\d{13}$/; // el DPI de Guatemala tiene 13 digitos
const REGEX_TELEFONO = /^\+?\d{8,15}$/;
const REGEX_CHAT_ID = /^\d{1,20}$/;
const CANALES = ['Email', 'Telegram'];

// Devuelve el texto sin espacios a los lados ('' si no es texto ni numero)
const texto = (valor) => {
  if (typeof valor === 'string') return valor.trim();
  if (typeof valor === 'number') return String(valor);
  return '';
};

// Igual que texto(), pero quita espacios y guiones (DPI y telefonos suelen escribirse asi)
const sinSeparadores = (valor) => texto(valor).replace(/[\s-]/g, '');

// Valida y limpia el cuerpo. Devuelve { datos } si es correcto o { error } si no.
function validarCuerpo(body) {
  const datos = {
    comunidad_id: texto(body.comunidad_id),
    nombre_completo: texto(body.nombre_completo),
    dpi: sinSeparadores(body.dpi),
    telefono: sinSeparadores(body.telefono) || null,
    correo: texto(body.correo).toLowerCase() || null,
    canal_preferido: texto(body.canal_preferido) || 'Email',
    telegram_chat_id: texto(body.telegram_chat_id) || null,
  };

  if (!datos.comunidad_id || !datos.nombre_completo || !datos.dpi) {
    return { error: 'comunidad_id, nombre_completo y dpi son obligatorios' };
  }
  if (datos.nombre_completo.length > 150) {
    return { error: 'nombre_completo no puede superar 150 caracteres' };
  }
  if (!REGEX_DPI.test(datos.dpi)) {
    return { error: 'El DPI debe tener 13 dígitos' };
  }
  if (datos.telefono && !REGEX_TELEFONO.test(datos.telefono)) {
    return { error: 'El teléfono no tiene un formato válido (8 a 15 dígitos)' };
  }
  if (datos.correo && (datos.correo.length > 150 || !REGEX_CORREO.test(datos.correo))) {
    return { error: 'El correo no tiene un formato válido' };
  }
  if (!CANALES.includes(datos.canal_preferido)) {
    return { error: "canal_preferido debe ser 'Email' o 'Telegram'" };
  }
  if (datos.canal_preferido === 'Email' && !datos.correo) {
    return { error: 'Si el canal preferido es Email, el correo es obligatorio' };
  }
  if (datos.telegram_chat_id && !REGEX_CHAT_ID.test(datos.telegram_chat_id)) {
    return { error: 'telegram_chat_id debe contener solo dígitos' };
  }

  return { datos };
}

// GET /api/padres?buscar=texto&comunidad_id=uuid&pagina=1&limite=50
// "buscar" busca por nombre o por DPI completo (13 digitos)
const listar = async (req, res, next) => {
  try {
    const { paginacion, error } = leerPaginacion(req.query);
    if (error) return res.status(400).json({ error });
    const buscar = typeof req.query.buscar === 'string' ? req.query.buscar.trim() : '';
    const comunidadId =
      typeof req.query.comunidad_id === 'string' ? req.query.comunidad_id.trim() : '';
    res.json(await padreService.listar({ buscar, comunidadId }, paginacion));
  } catch (error) {
    next(error);
  }
};

// GET /api/padres/:id
const obtener = async (req, res, next) => {
  try {
    res.json(await padreService.obtenerPorId(req.params.id));
  } catch (error) {
    next(error);
  }
};

// POST /api/padres
const crear = async (req, res, next) => {
  try {
    const { datos, error } = validarCuerpo(req.body);
    if (error) {
      return res.status(400).json({ error });
    }
    res.status(201).json(await padreService.crear(datos));
  } catch (error) {
    next(error);
  }
};

// PUT /api/padres/:id
const actualizar = async (req, res, next) => {
  try {
    const { datos, error } = validarCuerpo(req.body);
    if (error) {
      return res.status(400).json({ error });
    }
    res.json(await padreService.actualizar(req.params.id, datos));
  } catch (error) {
    next(error);
  }
};

// DELETE /api/padres/:id
const eliminar = async (req, res, next) => {
  try {
    await padreService.eliminar(req.params.id);
    res.json({ mensaje: 'Padre o tutor eliminado' });
  } catch (error) {
    next(error);
  }
};

module.exports = { listar, obtener, crear, actualizar, eliminar };
