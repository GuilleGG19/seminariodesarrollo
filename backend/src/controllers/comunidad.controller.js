// Controlador de comunidades: valida lo que llega por HTTP y responde.
// La logica y las consultas estan en services/comunidad.service.js
const comunidadService = require('../services/comunidad.service');

const MAX_FAMILIAS = 1000000;

// Devuelve el texto sin espacios a los lados, o '' si no es texto
const texto = (valor) => (typeof valor === 'string' ? valor.trim() : '');

// Valida y limpia el cuerpo. Devuelve { datos } si es correcto o { error } si no.
function validarCuerpo(body) {
  const nombre = texto(body.nombre);
  const ubicacion = texto(body.ubicacion);

  if (!nombre || !ubicacion) {
    return { error: 'nombre y ubicacion son obligatorios' };
  }
  if (nombre.length > 150) {
    return { error: 'nombre no puede superar 150 caracteres' };
  }
  if (ubicacion.length > 255) {
    return { error: 'ubicacion no puede superar 255 caracteres' };
  }

  // num_familias_estimado es opcional: si no viene, se guarda como null
  let familias = null;
  const crudo = body.num_familias_estimado;
  if (crudo !== undefined && crudo !== null && crudo !== '') {
    familias = Number(crudo);
    if (!Number.isInteger(familias) || familias < 0 || familias > MAX_FAMILIAS) {
      return {
        error: `num_familias_estimado debe ser un entero entre 0 y ${MAX_FAMILIAS}`,
      };
    }
  }

  return { datos: { nombre, ubicacion, num_familias_estimado: familias } };
}

// GET /api/comunidades?buscar=texto
const listar = async (req, res, next) => {
  try {
    const buscar = typeof req.query.buscar === 'string' ? req.query.buscar.trim() : '';
    res.json(await comunidadService.listar(buscar));
  } catch (error) {
    next(error);
  }
};

// GET /api/comunidades/:id
const obtener = async (req, res, next) => {
  try {
    res.json(await comunidadService.obtenerPorId(req.params.id));
  } catch (error) {
    next(error);
  }
};

// POST /api/comunidades
const crear = async (req, res, next) => {
  try {
    const { datos, error } = validarCuerpo(req.body);
    if (error) {
      return res.status(400).json({ error });
    }
    res.status(201).json(await comunidadService.crear(datos));
  } catch (error) {
    next(error);
  }
};

// PUT /api/comunidades/:id
const actualizar = async (req, res, next) => {
  try {
    const { datos, error } = validarCuerpo(req.body);
    if (error) {
      return res.status(400).json({ error });
    }
    res.json(await comunidadService.actualizar(req.params.id, datos));
  } catch (error) {
    next(error);
  }
};

// DELETE /api/comunidades/:id
const eliminar = async (req, res, next) => {
  try {
    await comunidadService.eliminar(req.params.id);
    res.json({ mensaje: 'Comunidad eliminada' });
  } catch (error) {
    next(error);
  }
};

module.exports = { listar, obtener, crear, actualizar, eliminar };
