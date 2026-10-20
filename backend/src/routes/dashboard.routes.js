// Dashboard: todo el personal con sesion (no incluye datos personales).
const { Router } = require('express');
const dashboardService = require('../services/dashboard.service');
const { verificarToken } = require('../middlewares/auth.middleware');

const router = Router();
router.use(verificarToken);

// GET /api/dashboard?comunidad_id=uuid
router.get('/', async (req, res, next) => {
  try {
    const comunidadId = typeof req.query.comunidad_id === 'string' ? req.query.comunidad_id.trim() : '';
    res.json(await dashboardService.resumen({ comunidadId }));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
