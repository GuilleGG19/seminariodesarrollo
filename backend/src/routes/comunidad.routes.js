const { Router } = require('express');
const comunidadController = require('../controllers/comunidad.controller');
const { verificarToken } = require('../middlewares/auth.middleware');
const { permitirRoles } = require('../middlewares/roles.middleware');

const router = Router();

// Cualquier usuario con sesion puede consultar comunidades
router.use(verificarToken);

router.get('/', comunidadController.listar);
router.get('/:id', comunidadController.obtener);

// Crear y editar: administrador o encargado del centro de salud
router.post('/', permitirRoles('administrador', 'encargado'), comunidadController.crear);
router.put('/:id', permitirRoles('administrador', 'encargado'), comunidadController.actualizar);

// Eliminar: solo administrador
router.delete('/:id', permitirRoles('administrador'), comunidadController.eliminar);

module.exports = router;
