// Controlador de registros de crecimiento: valida lo que llega por HTTP y responde.
// La logica y las consultas estan en services/registroCrecimiento.service.js
const registroService = require('../services/registroCrecimiento.service');
const { hoyGuatemala, esFechaReal } = require('../utils/fechas');

// Rangos razonables para detectar errores de digitacion
const PESO_MIN = 0.3;
const PESO_MAX = 150;
const TALLA_MIN = 20;
const TALLA_MAX = 220;

const texto = (valor) => (typeof valor === 'string' ? valor.trim() : '');

// Convierte a numero. Acepta "10.5" y "10,5". Devuelve NaN si no es un numero valido.
function aNumero(valor) {
  if (typeof valor === 'number') return valor;
  if (typeof valor === 'string' && valor.trim() !== '') {
    return Number(valor.trim().replace(',', '.'));
  }
  return NaN;
}

// Redondea a 2 decimales, que es la precision de las columnas de la base
const redondear2 = (n) => Math.round(n * 100) / 100;

// Valida peso, talla y fecha. Devuelve { datos } si es correcto o { error } si no.
// En POST la fecha es opcional (por defecto hoy); en PUT es obligatoria.
function validarMedicion(body, { fechaObligatoria }) {
  const peso = aNumero(body.peso_kg);
  const talla = aNumero(body.talla_cm);
  let fecha = texto(body.fecha_medicion);

  if (!Number.isFinite(peso) || !Number.isFinite(talla)) {
    return { error: 'peso_kg y talla_cm son obligatorios y deben ser números' };
  }
  if (peso < PESO_MIN || peso > PESO_MAX) {
    return { error: `peso_kg debe estar entre ${PESO_MIN} y ${PESO_MAX}` };
  }
  if (talla < TALLA_MIN || talla > TALLA_MAX) {
    return { error: `talla_cm debe estar entre ${TALLA_MIN} y ${TALLA_MAX}` };
  }

  if (!fecha) {
    if (fechaObligatoria) {
      return { error: 'fecha_medicion es obligatoria' };
    }
    fecha = hoyGuatemala();
  }
  if (!esFechaReal(fecha)) {
    return { error: 'fecha_medicion debe tener el formato AAAA-MM-DD y ser una fecha real' };
  }
  if (fecha > hoyGuatemala()) {
    return { error: 'La fecha de medición no puede ser futura' };
  }

  return {
    datos: { peso_kg: redondear2(peso), talla_cm: redondear2(talla), fecha_medicion: fecha },
  };
}

// GET /api/registros-crecimiento?nino_id=uuid
const listar = async (req, res, next) => {
  try {
    const ninoId = typeof req.query.nino_id === 'string' ? req.query.nino_id.trim() : '';
    res.json(await registroService.listar({ ninoId }));
  } catch (error) {
    next(error);
  }
};

// GET /api/registros-crecimiento/:id
const obtener = async (req, res, next) => {
  try {
    res.json(await registroService.obtenerPorId(req.params.id));
  } catch (error) {
    next(error);
  }
};

// GET /api/registros-crecimiento/curva/:ninoId
const curva = async (req, res, next) => {
  try {
    res.json(await registroService.obtenerCurva(req.params.ninoId));
  } catch (error) {
    next(error);
  }
};

// POST /api/registros-crecimiento
const crear = async (req, res, next) => {
  try {
    const ninoId = texto(req.body.nino_id);
    if (!ninoId) {
      return res.status(400).json({ error: 'nino_id es obligatorio' });
    }

    const { datos, error } = validarMedicion(req.body, { fechaObligatoria: false });
    if (error) {
      return res.status(400).json({ error });
    }

    res.status(201).json(await registroService.crear({ nino_id: ninoId, ...datos }));
  } catch (error) {
    next(error);
  }
};

// PUT /api/registros-crecimiento/:id
const actualizar = async (req, res, next) => {
  try {
    const { datos, error } = validarMedicion(req.body, { fechaObligatoria: true });
    if (error) {
      return res.status(400).json({ error });
    }

    res.json(await registroService.actualizar(req.params.id, datos));
  } catch (error) {
    next(error);
  }
};

// DELETE /api/registros-crecimiento/:id
const eliminar = async (req, res, next) => {
  try {
    await registroService.eliminar(req.params.id);
    res.json({ mensaje: 'Registro de crecimiento eliminado' });
  } catch (error) {
    next(error);
  }
};

module.exports = { listar, obtener, curva, crear, actualizar, eliminar };
