// Notificaciones a padres (alertas y campanas)
const { Router } = require('express');
const notificacionController = require('../controllers/notificacion.controller');
const { verificarToken } = require('../middlewares/auth.middleware');
const { permitirRoles } = require('../middlewares/roles.middleware');

const router = Router();
router.use(verificarToken);

const PERSONAL = ['administrador', 'encargado', 'personal_salud'];

// IMPORTANTE: las rutas fijas van antes de '/:id'
router.get('/', permitirRoles(...PERSONAL), notificacionController.listar);
router.get('/canales', permitirRoles('administrador', 'encargado'), notificacionController.canales);
router.post('/procesar', permitirRoles('administrador', 'encargado'), notificacionController.procesar);
router.post('/prueba', permitirRoles('administrador'), notificacionController.prueba);
router.post('/:id/reintentar', permitirRoles('administrador', 'encargado'), notificacionController.reintentar);

module.exports = router;
