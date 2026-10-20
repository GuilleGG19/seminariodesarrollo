const { Router } = require('express');
const alertaController = require('../controllers/alerta.controller');
const { verificarToken } = require('../middlewares/auth.middleware');
const { permitirRoles } = require('../middlewares/roles.middleware');

const router = Router();

// Cualquier usuario con sesion puede consultar alertas
router.use(verificarToken);

router.get('/', alertaController.listar);
router.get('/:id', alertaController.obtener);

// Marcar una alerta como atendida: todo el personal
const PERSONAL = ['administrador', 'encargado', 'personal_salud'];
router.patch('/:id/atendida', permitirRoles(...PERSONAL), alertaController.marcarAtendida);

// Ejecutar la revision de alertas manualmente: administrador o encargado
router.post('/generar', permitirRoles('administrador', 'encargado'), alertaController.generar);

module.exports = router;
