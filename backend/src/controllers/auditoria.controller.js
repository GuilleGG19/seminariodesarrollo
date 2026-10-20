// Controlador de auditoria: valida filtros y responde.
const auditoriaService = require('../services/auditoria.service');
const { leerPaginacion } = require('../utils/paginacion');
const { esFechaReal } = require('../utils/fechas');

const METODOS = ['POST', 'PUT', 'PATCH', 'DELETE'];
const leer = (valor) => (typeof valor === 'string' ? valor.trim() : '');

// GET /api/auditoria?usuario_id=uuid&metodo=DELETE&desde=AAAA-MM-DD&hasta=AAAA-MM-DD&pagina=1&limite=50
const listar = async (req, res, next) => {
  try {
    const { paginacion, error } = leerPaginacion(req.query);
    if (error) return res.status(400).json({ error });

    const metodo = leer(req.query.metodo).toUpperCase();
    if (metodo && !METODOS.includes(metodo)) {
      return res.status(400).json({ error: `metodo debe ser uno de: ${METODOS.join(', ')}` });
    }
    const desde = leer(req.query.desde);
    const hasta = leer(req.query.hasta);
    if ((desde && !esFechaReal(desde)) || (hasta && !esFechaReal(hasta))) {
      return res.status(400).json({ error: 'desde y hasta deben tener el formato AAAA-MM-DD' });
    }

    res.json(
      await auditoriaService.listar(
        { usuarioId: leer(req.query.usuario_id), metodo, desde, hasta },
        paginacion
      )
    );
  } catch (err) {
    next(err);
  }
};

module.exports = { listar };
