// Controlador del catalogo de vacunas: valida lo que llega por HTTP y responde.
// La logica y las consultas estan en services/vacuna.service.js
const vacunaService = require('../services/vacuna.service');

const MAX_EDAD_MESES = 216; // 18 anios
const MAX_DOSIS = 10;

const texto = (valor) => (typeof valor === 'string' ? valor.trim() : '');

// Convierte a entero. Devuelve "porDefecto" si el valor no viene y NaN si no es un entero.
function aEntero(valor, porDefecto) {
  if (valor === undefined || valor === null || valor === '') return porDefecto;
  const n = typeof valor === 'number' ? valor : Number(String(valor).trim());
  return Number.isInteger(n) ? n : NaN;
}

// Valida y limpia el cuerpo. Devuelve { datos } si es correcto o { error } si no.
function validarCuerpo(body) {
  const nombre = texto(body.nombre);
  const edad = aEntero(body.edad_recomendada_meses, undefined);
  const dosis = aEntero(body.dosis_total, 1); // por defecto 1 dosis

  if (!nombre) {
    return { error: 'nombre es obligatorio' };
  }
  if (nombre.length > 150) {
    return { error: 'nombre no puede superar 150 caracteres' };
  }
  if (edad === undefined || Number.isNaN(edad) || edad < 0 || edad > MAX_EDAD_MESES) {
    return {
      error: `edad_recomendada_meses es obligatoria y debe ser un entero entre 0 y ${MAX_EDAD_MESES} (0 = al nacer)`,
    };
  }
  if (Number.isNaN(dosis) || dosis < 1 || dosis > MAX_DOSIS) {
    return { error: `dosis_total debe ser un entero entre 1 y ${MAX_DOSIS}` };
  }

  // edades_dosis_meses es opcional: edad (en meses) de cada dosis, en orden.
  // Si no viene, solo se conoce la edad de la primera dosis.
  let edades = null;
  const crudo = body.edades_dosis_meses;
  if (crudo !== undefined && crudo !== null) {
    if (!Array.isArray(crudo) || crudo.length !== dosis) {
      return { error: `edades_dosis_meses debe ser una lista con ${dosis} edades (una por dosis)` };
    }
    edades = crudo.map((v) => aEntero(v, NaN));
    if (edades.some((e) => Number.isNaN(e) || e < 0 || e > MAX_EDAD_MESES)) {
      return { error: `Cada edad de edades_dosis_meses debe ser un entero entre 0 y ${MAX_EDAD_MESES}` };
    }
    if (edades.some((e, i) => i > 0 && e <= edades[i - 1])) {
      return { error: 'Las edades de edades_dosis_meses deben ir de menor a mayor' };
    }
    if (edades[0] !== edad) {
      return { error: 'La primera edad de edades_dosis_meses debe ser igual a edad_recomendada_meses' };
    }
  }

  return {
    datos: { nombre, edad_recomendada_meses: edad, dosis_total: dosis, edades_dosis_meses: edades },
  };
}

// GET /api/vacunas?buscar=texto
const listar = async (req, res, next) => {
  try {
    const buscar = typeof req.query.buscar === 'string' ? req.query.buscar.trim() : '';
    res.json(await vacunaService.listar({ buscar }));
  } catch (error) {
    next(error);
  }
};

// GET /api/vacunas/:id
const obtener = async (req, res, next) => {
  try {
    res.json(await vacunaService.obtenerPorId(req.params.id));
  } catch (error) {
    next(error);
  }
};

// POST /api/vacunas
const crear = async (req, res, next) => {
  try {
    const { datos, error } = validarCuerpo(req.body);
    if (error) {
      return res.status(400).json({ error });
    }
    res.status(201).json(await vacunaService.crear(datos));
  } catch (error) {
    next(error);
  }
};

// PUT /api/vacunas/:id
const actualizar = async (req, res, next) => {
  try {
    const { datos, error } = validarCuerpo(req.body);
    if (error) {
      return res.status(400).json({ error });
    }
    res.json(await vacunaService.actualizar(req.params.id, datos));
  } catch (error) {
    next(error);
  }
};

// DELETE /api/vacunas/:id
const eliminar = async (req, res, next) => {
  try {
    await vacunaService.eliminar(req.params.id);
    res.json({ mensaje: 'Vacuna eliminada' });
  } catch (error) {
    next(error);
  }
};

module.exports = { listar, obtener, crear, actualizar, eliminar };
