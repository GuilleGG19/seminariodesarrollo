const { Router } = require('express');
const vacunacionController = require('../controllers/vacunacion.controller');
const { verificarToken } = require('../middlewares/auth.middleware');
const { permitirRoles } = require('../middlewares/roles.middleware');

const router = Router();

// Cualquier usuario con sesion puede consultar
router.use(verificarToken);

router.get('/', vacunacionController.listar);
router.get('/:id', vacunacionController.obtener);

// Registrar y corregir dosis: todo el personal
const PERSONAL = ['administrador', 'encargado', 'personal_salud'];
router.post('/', permitirRoles(...PERSONAL), vacunacionController.crear);
router.put('/:id', permitirRoles(...PERSONAL), vacunacionController.actualizar);

// Eliminar: solo administrador
router.delete('/:id', permitirRoles('administrador'), vacunacionController.eliminar);

module.exports = router;
