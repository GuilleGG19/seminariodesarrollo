// Controlador de campanas: valida lo que llega por HTTP y responde.
const campanaService = require('../services/campana.service');
const { hoyGuatemala, esFechaReal } = require('../utils/fechas');

const ESTADOS = ['pendiente', 'atrasada'];
const leer = (valor) => (typeof valor === 'string' ? valor.trim() : '');

// Convierte un valor a entero >= 0. Devuelve undefined si no viene, o null si es invalido.
function entero(valor) {
  if (valor === undefined || valor === null || valor === '') return undefined;
  const numero = Number(valor);
  return Number.isInteger(numero) && numero >= 0 && numero <= 1200 ? numero : null;
}

// Lee y valida los filtros de segmentacion. Devuelve { filtros } o { error }.
function leerFiltros(body) {
  const edadMinMeses = entero(body.edad_min_meses);
  const edadMaxMeses = entero(body.edad_max_meses);
  if (edadMinMeses === null || edadMaxMeses === null) {
    return { error: 'edad_min_meses y edad_max_meses deben ser enteros entre 0 y 1200' };
  }
  if (edadMinMeses !== undefined && edadMaxMeses !== undefined && edadMinMeses > edadMaxMeses) {
    return { error: 'edad_min_meses no puede ser mayor que edad_max_meses' };
  }

  const estadoVacunacion = leer(body.estado_vacunacion);
  if (estadoVacunacion && !ESTADOS.includes(estadoVacunacion)) {
    return { error: `estado_vacunacion debe ser uno de: ${ESTADOS.join(', ')}` };
  }

  if (body.sin_control_reciente !== undefined && typeof body.sin_control_reciente !== 'boolean') {
    return { error: 'sin_control_reciente debe ser true o false' };
  }

  return {
    filtros: {
      comunidadId: leer(body.comunidad_id),
      vacunaId: leer(body.vacuna_id),
      edadMinMeses,
      edadMaxMeses,
      estadoVacunacion,
      sinControlReciente: body.sin_control_reciente === true,
    },
  };
}

// POST /api/campanas/vista-previa   (solo filtros)
const vistaPrevia = async (req, res, next) => {
  try {
    const { filtros, error } = leerFiltros(req.body);
    if (error) return res.status(400).json({ error });
    res.json(await campanaService.vistaPrevia(filtros));
  } catch (err) {
    next(err);
  }
};

// POST /api/campanas   { mensaje, fecha_programada?, ...filtros }
const crear = async (req, res, next) => {
  try {
    const mensaje = leer(req.body.mensaje);
    if (!mensaje) return res.status(400).json({ error: 'mensaje es obligatorio' });
    if (mensaje.length > 1000) {
      return res.status(400).json({ error: 'mensaje no puede exceder 1000 caracteres' });
    }

    const fechaProgramada = leer(req.body.fecha_programada);
    if (fechaProgramada) {
      if (!esFechaReal(fechaProgramada)) {
        return res.status(400).json({ error: 'fecha_programada debe ser una fecha real (AAAA-MM-DD)' });
      }
      if (fechaProgramada < hoyGuatemala()) {
        return res.status(400).json({ error: 'fecha_programada no puede ser anterior a hoy' });
      }
    }

    const { filtros, error } = leerFiltros(req.body);
    if (error) return res.status(400).json({ error });

    const campana = await campanaService.crear({
      usuarioId: req.usuario.id,
      mensaje,
      fechaProgramada,
      filtros,
    });
    res.status(201).json(campana);
  } catch (err) {
    next(err);
  }
};

// GET /api/campanas
const listar = async (req, res, next) => {
  try {
    res.json(await campanaService.listar());
  } catch (err) {
    next(err);
  }
};

// GET /api/campanas/:id
const obtener = async (req, res, next) => {
  try {
    res.json(await campanaService.obtenerPorId(req.params.id));
  } catch (err) {
    next(err);
  }
};

module.exports = { vistaPrevia, crear, listar, obtener };
