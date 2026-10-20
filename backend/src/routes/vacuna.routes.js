const { Router } = require('express');
const vacunaController = require('../controllers/vacuna.controller');
const { verificarToken } = require('../middlewares/auth.middleware');
const { permitirRoles } = require('../middlewares/roles.middleware');

const router = Router();

// Cualquier usuario con sesion puede consultar el catalogo
router.use(verificarToken);

router.get('/', vacunaController.listar);
router.get('/:id', vacunaController.obtener);

// Crear y editar el catalogo: administrador o encargado
router.post('/', permitirRoles('administrador', 'encargado'), vacunaController.crear);
router.put('/:id', permitirRoles('administrador', 'encargado'), vacunaController.actualizar);

// Eliminar: solo administrador
router.delete('/:id', permitirRoles('administrador'), vacunaController.eliminar);

module.exports = router;
