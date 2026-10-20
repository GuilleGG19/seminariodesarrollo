const { Router } = require('express');
const padreController = require('../controllers/padre.controller');
const { verificarToken } = require('../middlewares/auth.middleware');
const { permitirRoles } = require('../middlewares/roles.middleware');

const router = Router();

// Cualquier usuario con sesion puede consultar padres
router.use(verificarToken);

router.get('/', padreController.listar);
router.get('/:id', padreController.obtener);

// Registrar y editar: todo el personal (administrador, encargado y personal de salud)
const PERSONAL = ['administrador', 'encargado', 'personal_salud'];
router.post('/', permitirRoles(...PERSONAL), padreController.crear);
router.put('/:id', permitirRoles(...PERSONAL), padreController.actualizar);

// Eliminar: solo administrador
router.delete('/:id', permitirRoles('administrador'), padreController.eliminar);

module.exports = router;
