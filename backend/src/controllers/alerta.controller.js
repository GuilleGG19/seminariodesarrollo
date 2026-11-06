// Controlador de alertas: valida lo que llega por HTTP y responde.
// La logica y las consultas estan en services/alerta.service.js
const alertaService = require('../services/alerta.service');
const { leerPaginacion } = require('../utils/paginacion');

const TIPOS = ['desnutricion', 'sobrepeso', 'talla_baja', 'sin_registros', 'vacuna_atrasada'];
const NIVELES = ['preventiva', 'critica'];

const leer = (valor) => (typeof valor === 'string' ? valor.trim() : '');

// GET /api/alertas?nino_id=uuid&comunidad_id=uuid&tipo=desnutricion&nivel=critica&atendida=false&pagina=1&limite=50
const listar = async (req, res, next) => {
  try {
    const { paginacion, error } = leerPaginacion(req.query);
    if (error) return res.status(400).json({ error });
    const tipo = leer(req.query.tipo);
    const nivel = leer(req.query.nivel);
    const atendida = leer(req.query.atendida);

    if (tipo && !TIPOS.includes(tipo)) {
      return res.status(400).json({ error: `tipo debe ser uno de: ${TIPOS.join(', ')}` });
    }
    if (nivel && !NIVELES.includes(nivel)) {
      return res.status(400).json({ error: `nivel debe ser uno de: ${NIVELES.join(', ')}` });
    }
    if (atendida && !['true', 'false'].includes(atendida)) {
      return res.status(400).json({ error: "atendida debe ser 'true' o 'false'" });
    }

    res.json(
      await alertaService.listar(
        {
          ninoId: leer(req.query.nino_id),
          comunidadId: leer(req.query.comunidad_id),
          tipo,
          nivel,
          atendida: atendida ? atendida === 'true' : undefined,
        },
        paginacion
      )
    );
  } catch (error) {
    next(error);
  }
};

// GET /api/alertas/:id
const obtener = async (req, res, next) => {
  try {
    res.json(await alertaService.obtenerPorId(req.params.id));
  } catch (error) {
    next(error);
  }
};

// PATCH /api/alertas/:id/atendida
const marcarAtendida = async (req, res, next) => {
  try {
    res.json(await alertaService.marcarAtendida(req.params.id, req.usuario.id));
  } catch (error) {
    next(error);
  }
};

// POST /api/alertas/generar
const generar = async (req, res, next) => {
  try {
    res.json(await alertaService.generar());
  } catch (error) {
    next(error);
  }
};

module.exports = { listar, obtener, marcarAtendida, generar };
