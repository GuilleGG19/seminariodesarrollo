// Controlador de reportes: valida parametros, genera el reporte y lo entrega
// como JSON (por defecto), Excel (formato=xlsx) o PDF (formato=pdf).
const reporteService = require('../services/reporte.service');
const exportService = require('../services/reporteExport.service');
const { hoyGuatemala } = require('../utils/fechas');

const FORMATOS = ['json', 'xlsx', 'pdf'];
const leer = (valor) => (typeof valor === 'string' ? valor.trim() : '');

async function entregar(req, res, reporte, nombreBase) {
  const formato = leer(req.query.formato).toLowerCase() || 'json';
  const nombreArchivo = `${nombreBase}-${hoyGuatemala()}`;

  if (formato === 'xlsx') return exportService.enviarExcel(res, reporte, nombreArchivo);
  if (formato === 'pdf') return exportService.enviarPdf(res, reporte, nombreArchivo);
  return res.json(reporte);
}

// Valida "formato" antes de consultar la base
function formatoValido(req, res) {
  const formato = leer(req.query.formato).toLowerCase();
  if (formato && !FORMATOS.includes(formato)) {
    res.status(400).json({ error: `formato debe ser uno de: ${FORMATOS.join(', ')}` });
    return false;
  }
  return true;
}

// GET /api/reportes/ninos-riesgo?tipo=bajo_peso|sobrepeso|talla_baja|vacunas_incompletas&comunidad_id=uuid&formato=pdf
const ninosEnRiesgo = async (req, res, next) => {
  try {
    if (!formatoValido(req, res)) return;
    const tipo = leer(req.query.tipo);
    const reporte = await reporteService.ninosEnRiesgo({
      tipo,
      comunidadId: leer(req.query.comunidad_id),
    });
    await entregar(req, res, reporte, `ninos-${tipo}`);
  } catch (error) {
    next(error);
  }
};

// GET /api/reportes/cobertura-vacunacion?comunidad_id=uuid&vacuna_id=uuid&formato=xlsx
const coberturaVacunacion = async (req, res, next) => {
  try {
    if (!formatoValido(req, res)) return;
    const reporte = await reporteService.coberturaVacunacion({
      comunidadId: leer(req.query.comunidad_id),
      vacunaId: leer(req.query.vacuna_id),
    });
    await entregar(req, res, reporte, 'cobertura-vacunacion');
  } catch (error) {
    next(error);
  }
};

// GET /api/reportes/crecimiento-promedio?comunidad_id=uuid&formato=pdf
const crecimientoPromedio = async (req, res, next) => {
  try {
    if (!formatoValido(req, res)) return;
    const reporte = await reporteService.crecimientoPromedio({
      comunidadId: leer(req.query.comunidad_id),
    });
    await entregar(req, res, reporte, 'crecimiento-promedio');
  } catch (error) {
    next(error);
  }
};

module.exports = { ninosEnRiesgo, coberturaVacunacion, crecimientoPromedio };
