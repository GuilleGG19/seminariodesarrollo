// Reportes: solo para el administrador y el encargado del centro.
const { Router } = require('express');
const reporteController = require('../controllers/reporte.controller');
const { verificarToken } = require('../middlewares/auth.middleware');
const { permitirRoles } = require('../middlewares/roles.middleware');

const router = Router();
router.use(verificarToken, permitirRoles('administrador', 'encargado'));

router.get('/ninos-riesgo', reporteController.ninosEnRiesgo);
router.get('/cobertura-vacunacion', reporteController.coberturaVacunacion);
router.get('/crecimiento-promedio', reporteController.crecimientoPromedio);

module.exports = router;
