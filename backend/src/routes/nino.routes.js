const { Router } = require('express');
const ninoController = require('../controllers/nino.controller');
const { verificarToken } = require('../middlewares/auth.middleware');
const { permitirRoles } = require('../middlewares/roles.middleware');

const router = Router();

// Cualquier usuario con sesion puede consultar ninos
router.use(verificarToken);

router.get('/', ninoController.listar);
router.get('/:id', ninoController.obtener);

// Registrar y editar: todo el personal (administrador, encargado y personal de salud)
const PERSONAL = ['administrador', 'encargado', 'personal_salud'];
router.post('/', permitirRoles(...PERSONAL), ninoController.crear);
router.put('/:id', permitirRoles(...PERSONAL), ninoController.actualizar);

// Eliminar: solo administrador
router.delete('/:id', permitirRoles('administrador'), ninoController.eliminar);

module.exports = router;
