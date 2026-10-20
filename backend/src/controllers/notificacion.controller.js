// Controlador de notificaciones: valida lo que llega por HTTP y responde.
const notificacionService = require('../services/notificacion.service');
const { leerPaginacion } = require('../utils/paginacion');

const ESTADOS = ['pendiente', 'enviado', 'fallido'];
const CANALES = ['Email', 'Telegram'];
const REGEX_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REGEX_CHAT_ID = /^-?\d{1,20}$/;
const leer = (valor) => (typeof valor === 'string' ? valor.trim() : '');

// GET /api/notificaciones?estado=fallido&canal=Email&nino_id=&campana_id=&alerta_id=&pagina=1&limite=50
const listar = async (req, res, next) => {
  try {
    const { paginacion, error } = leerPaginacion(req.query);
    if (error) return res.status(400).json({ error });

    const estado = leer(req.query.estado);
    const canal = leer(req.query.canal);
    if (estado && !ESTADOS.includes(estado)) {
      return res.status(400).json({ error: `estado debe ser uno de: ${ESTADOS.join(', ')}` });
    }
    if (canal && !CANALES.includes(canal)) {
      return res.status(400).json({ error: `canal debe ser uno de: ${CANALES.join(', ')}` });
    }

    res.json(
      await notificacionService.listar(
        {
          estado,
          canal,
          ninoId: leer(req.query.nino_id),
          campanaId: leer(req.query.campana_id),
          alertaId: leer(req.query.alerta_id),
        },
        paginacion
      )
    );
  } catch (err) {
    next(err);
  }
};

// GET /api/notificaciones/canales
const canales = (req, res) => {
  res.json(notificacionService.estadoCanales());
};

// POST /api/notificaciones/procesar   (envia ya las pendientes, sin esperar a la tarea programada)
const procesar = async (req, res, next) => {
  try {
    res.json(await notificacionService.enviarPendientes());
  } catch (err) {
    next(err);
  }
};

// POST /api/notificaciones/:id/reintentar
const reintentar = async (req, res, next) => {
  try {
    res.json(await notificacionService.reintentar(req.params.id));
  } catch (err) {
    next(err);
  }
};

// POST /api/notificaciones/prueba   { canal: 'Email' | 'Telegram', destino }
const prueba = async (req, res, next) => {
  try {
    const canal = leer(req.body.canal);
    const destino = leer(req.body.destino);
    if (!CANALES.includes(canal)) {
      return res.status(400).json({ error: `canal debe ser uno de: ${CANALES.join(', ')}` });
    }
    if (canal === 'Email' && !REGEX_CORREO.test(destino)) {
      return res.status(400).json({ error: 'destino debe ser un correo válido' });
    }
    if (canal === 'Telegram' && !REGEX_CHAT_ID.test(destino)) {
      return res.status(400).json({ error: 'destino debe ser un chat_id de Telegram (solo dígitos)' });
    }
    res.json(await notificacionService.enviarPrueba({ canal, destino }));
  } catch (err) {
    next(err);
  }
};

module.exports = { listar, canales, procesar, reintentar, prueba };
