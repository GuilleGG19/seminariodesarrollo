// Controlador de ninos: valida lo que llega por HTTP y responde.
// La logica y las consultas estan en services/nino.service.js
const ninoService = require('../services/nino.service');
const { hoyGuatemala, esFechaReal } = require('../utils/fechas');

const MAX_EDAD_ANIOS = 18;

// Devuelve el texto sin espacios a los lados ('' si no es texto)
const texto = (valor) => (typeof valor === 'string' ? valor.trim() : '');

// Valida y limpia el cuerpo. Devuelve { datos } si es correcto o { error } si no.
function validarCuerpo(body) {
  const datos = {
    padre_id: texto(body.padre_id),
    nombre: texto(body.nombre),
    fecha_nacimiento: texto(body.fecha_nacimiento),
    sexo: texto(body.sexo).toUpperCase(),
  };

  if (!datos.padre_id || !datos.nombre || !datos.fecha_nacimiento || !datos.sexo) {
    return { error: 'padre_id, nombre, fecha_nacimiento y sexo son obligatorios' };
  }
  if (datos.nombre.length > 150) {
    return { error: 'nombre no puede superar 150 caracteres' };
  }
  if (!['M', 'F'].includes(datos.sexo)) {
    return { error: "sexo debe ser 'M' o 'F'" };
  }
  if (!esFechaReal(datos.fecha_nacimiento)) {
    return { error: 'fecha_nacimiento debe tener el formato AAAA-MM-DD y ser una fecha real' };
  }

  // Como las fechas AAAA-MM-DD se ordenan igual como texto, se pueden comparar directamente
  const hoy = hoyGuatemala();
  if (datos.fecha_nacimiento > hoy) {
    return { error: 'La fecha de nacimiento no puede ser futura' };
  }
  const minima = `${Number(hoy.slice(0, 4)) - MAX_EDAD_ANIOS}${hoy.slice(4)}`;
  if (datos.fecha_nacimiento < minima) {
    return { error: `La fecha de nacimiento no puede ser de hace más de ${MAX_EDAD_ANIOS} años` };
  }

  return { datos };
}

// GET /api/ninos?buscar=texto&comunidad_id=uuid&padre_id=uuid
const listar = async (req, res, next) => {
  try {
    const leer = (valor) => (typeof valor === 'string' ? valor.trim() : '');
    res.json(
      await ninoService.listar({
        buscar: leer(req.query.buscar),
        comunidadId: leer(req.query.comunidad_id),
        padreId: leer(req.query.padre_id),
      })
    );
  } catch (error) {
    next(error);
  }
};

// GET /api/ninos/:id
const obtener = async (req, res, next) => {
  try {
    res.json(await ninoService.obtenerPorId(req.params.id));
  } catch (error) {
    next(error);
  }
};

// POST /api/ninos
const crear = async (req, res, next) => {
  try {
    const { datos, error } = validarCuerpo(req.body);
    if (error) {
      return res.status(400).json({ error });
    }
    res.status(201).json(await ninoService.crear(datos));
  } catch (error) {
    next(error);
  }
};

// PUT /api/ninos/:id
const actualizar = async (req, res, next) => {
  try {
    const { datos, error } = validarCuerpo(req.body);
    if (error) {
      return res.status(400).json({ error });
    }
    res.json(await ninoService.actualizar(req.params.id, datos));
  } catch (error) {
    next(error);
  }
};

// DELETE /api/ninos/:id
const eliminar = async (req, res, next) => {
  try {
    await ninoService.eliminar(req.params.id);
    res.json({ mensaje: 'Niño eliminado' });
  } catch (error) {
    next(error);
  }
};

module.exports = { listar, obtener, crear, actualizar, eliminar };
