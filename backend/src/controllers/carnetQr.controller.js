// Controlador del carnet QR: valida lo que llega por HTTP y responde.
// La logica y las consultas estan en services/carnetQr.service.js
const carnetService = require('../services/carnetQr.service');
const { leerPaginacion } = require('../utils/paginacion');

const leer = (valor) => (typeof valor === 'string' ? valor.trim() : '');
const TOKEN_VALIDO = /^[A-Za-z0-9_-]{43}$/; // 32 bytes en base64url
const PIN_VALIDO = /^\d{6}$/;

// Las respuestas con datos del carnet nunca deben guardarse en cache
const sinCache = (res) => res.set('Cache-Control', 'no-store');

// ---------- Personal (con sesion) ----------

// POST /api/carnets-qr   { nino_id, dias_vigencia? }
const generar = async (req, res, next) => {
  try {
    const ninoId = leer(req.body.nino_id);
    if (!ninoId) {
      return res.status(400).json({ error: 'nino_id es obligatorio' });
    }

    let diasVigencia;
    if (req.body.dias_vigencia !== undefined) {
      diasVigencia = Number(req.body.dias_vigencia);
      if (!Number.isInteger(diasVigencia) || diasVigencia < 1 || diasVigencia > 730) {
        return res.status(400).json({ error: 'dias_vigencia debe ser un entero entre 1 y 730' });
      }
    }

    sinCache(res);
    res.status(201).json(await carnetService.generar({ ninoId, diasVigencia }));
  } catch (error) {
    next(error);
  }
};

// GET /api/carnets-qr?nino_id=uuid&pagina=1&limite=50
const listar = async (req, res, next) => {
  try {
    const { paginacion, error } = leerPaginacion(req.query);
    if (error) return res.status(400).json({ error });
    res.json(await carnetService.listar({ ninoId: leer(req.query.nino_id) }, paginacion));
  } catch (error) {
    next(error);
  }
};

// PATCH /api/carnets-qr/:id/revocar
const revocar = async (req, res, next) => {
  try {
    res.json(await carnetService.revocar(req.params.id));
  } catch (error) {
    next(error);
  }
};

// ---------- Padres (sin sesion) ----------

// GET /api/carnet-publico/:token
const estado = async (req, res, next) => {
  try {
    if (!TOKEN_VALIDO.test(req.params.token)) {
      return res.status(404).json({ error: 'Carnet no disponible. Solicita uno nuevo en tu centro de salud.' });
    }
    sinCache(res);
    res.json(await carnetService.verificarDisponible(req.params.token));
  } catch (error) {
    next(error);
  }
};

// POST /api/carnet-publico/:token/acceso   { pin }
const acceder = async (req, res, next) => {
  try {
    if (!TOKEN_VALIDO.test(req.params.token)) {
      return res.status(404).json({ error: 'Carnet no disponible. Solicita uno nuevo en tu centro de salud.' });
    }
    const pin = leer(req.body.pin);
    if (!PIN_VALIDO.test(pin)) {
      return res.status(400).json({ error: 'El PIN debe tener 6 dígitos' });
    }

    sinCache(res);
    res.json(await carnetService.acceder(req.params.token, pin));
  } catch (error) {
    next(error);
  }
};

module.exports = { generar, listar, revocar, estado, acceder };
