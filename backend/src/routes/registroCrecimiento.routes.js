const { Router } = require('express');
const registroController = require('../controllers/registroCrecimiento.controller');
const { verificarToken } = require('../middlewares/auth.middleware');
const { permitirRoles } = require('../middlewares/roles.middleware');

const router = Router();

// Cualquier usuario con sesion puede consultar
router.use(verificarToken);

// IMPORTANTE: '/curva/:ninoId' debe ir antes de '/:id'
router.get('/curva/:ninoId', registroController.curva);
router.get('/', registroController.listar);
router.get('/:id', registroController.obtener);

// Registrar y corregir mediciones: todo el personal
const PERSONAL = ['administrador', 'encargado', 'personal_salud'];
router.post('/', permitirRoles(...PERSONAL), registroController.crear);
router.put('/:id', permitirRoles(...PERSONAL), registroController.actualizar);

// Eliminar: solo administrador
router.delete('/:id', permitirRoles('administrador'), registroController.eliminar);

module.exports = router;
