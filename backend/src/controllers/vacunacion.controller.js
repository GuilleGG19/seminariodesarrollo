// Controlador de vacunaciones: valida lo que llega por HTTP y responde.
// La logica y las consultas estan en services/vacunacion.service.js
const vacunacionService = require('../services/vacunacion.service');
const { hoyGuatemala, esFechaReal } = require('../utils/fechas');

const MAX_NUMERO_DOSIS = 20;
const ESTADOS = ['completa', 'pendiente', 'atrasada'];

const texto = (valor) => (typeof valor === 'string' ? valor.trim() : '');

// Convierte a entero. Devuelve "porDefecto" si el valor no viene y NaN si no es un entero.
function aEntero(valor, porDefecto) {
  if (valor === undefined || valor === null || valor === '') return porDefecto;
  const n = typeof valor === 'number' ? valor : Number(String(valor).trim());
  return Number.isInteger(n) ? n : NaN;
}

// Valida las dos fechas opcionales. Devuelve { fecha_aplicada, proxima_dosis } o { error }.
function validarFechas(body) {
  const fechaAplicada = texto(body.fecha_aplicada) || null;
  const proximaDosis = texto(body.proxima_dosis) || null;

  if (!fechaAplicada && !proximaDosis) {
    return { error: 'Debes indicar fecha_aplicada (dosis aplicada) o proxima_dosis (dosis programada)' };
  }
  if (fechaAplicada) {
    if (!esFechaReal(fechaAplicada)) {
      return { error: 'fecha_aplicada debe tener el formato AAAA-MM-DD y ser una fecha real' };
    }
    if (fechaAplicada > hoyGuatemala()) {
      return { error: 'La fecha de aplicación no puede ser futura' };
    }
  }
  if (proximaDosis && !esFechaReal(proximaDosis)) {
    return { error: 'proxima_dosis debe tener el formato AAAA-MM-DD y ser una fecha real' };
  }
  if (fechaAplicada && proximaDosis && proximaDosis <= fechaAplicada) {
    return { error: 'proxima_dosis debe ser posterior a fecha_aplicada' };
  }

  return { fecha_aplicada: fechaAplicada, proxima_dosis: proximaDosis };
}

// GET /api/vacunaciones?nino_id=uuid&vacuna_id=uuid&estado=pendiente
const listar = async (req, res, next) => {
  try {
    const leer = (valor) => (typeof valor === 'string' ? valor.trim() : '');
    const estado = leer(req.query.estado);
    if (estado && !ESTADOS.includes(estado)) {
      return res.status(400).json({ error: `estado debe ser uno de: ${ESTADOS.join(', ')}` });
    }
    res.json(
      await vacunacionService.listar({
        ninoId: leer(req.query.nino_id),
        vacunaId: leer(req.query.vacuna_id),
        estado,
      })
    );
  } catch (error) {
    next(error);
  }
};

// GET /api/vacunaciones/:id
const obtener = async (req, res, next) => {
  try {
    res.json(await vacunacionService.obtenerPorId(req.params.id));
  } catch (error) {
    next(error);
  }
};

// POST /api/vacunaciones
const crear = async (req, res, next) => {
  try {
    const ninoId = texto(req.body.nino_id);
    const vacunaId = texto(req.body.vacuna_id);
    if (!ninoId || !vacunaId) {
      return res.status(400).json({ error: 'nino_id y vacuna_id son obligatorios' });
    }

    const numeroDosis = aEntero(req.body.numero_dosis, 1); // por defecto, dosis 1
    if (Number.isNaN(numeroDosis) || numeroDosis < 1 || numeroDosis > MAX_NUMERO_DOSIS) {
      return res
        .status(400)
        .json({ error: `numero_dosis debe ser un entero entre 1 y ${MAX_NUMERO_DOSIS}` });
    }

    const fechas = validarFechas(req.body);
    if (fechas.error) {
      return res.status(400).json({ error: fechas.error });
    }

    res.status(201).json(
      await vacunacionService.crear({
        nino_id: ninoId,
        vacuna_id: vacunaId,
        numero_dosis: numeroDosis,
        ...fechas,
      })
    );
  } catch (error) {
    next(error);
  }
};

// PUT /api/vacunaciones/:id
const actualizar = async (req, res, next) => {
  try {
    const fechas = validarFechas(req.body);
    if (fechas.error) {
      return res.status(400).json({ error: fechas.error });
    }
    res.json(await vacunacionService.actualizar(req.params.id, fechas));
  } catch (error) {
    next(error);
  }
};

// DELETE /api/vacunaciones/:id
const eliminar = async (req, res, next) => {
  try {
    await vacunacionService.eliminar(req.params.id);
    res.json({ mensaje: 'Registro de vacunación eliminado' });
  } catch (error) {
    next(error);
  }
};

module.exports = { listar, obtener, crear, actualizar, eliminar };
