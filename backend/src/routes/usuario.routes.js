const { Router } = require('express');
const usuarioController = require('../controllers/usuario.controller');
const { verificarToken } = require('../middlewares/auth.middleware');
const { permitirRoles } = require('../middlewares/roles.middleware');

const router = Router();

// Todas las rutas de este archivo son solo para administradores
router.use(verificarToken, permitirRoles('administrador'));

// IMPORTANTE: '/roles' debe ir antes de '/:id'; si no, Express tomaria "roles" como un id
router.get('/roles', usuarioController.listarRoles);
router.get('/', usuarioController.listar);
router.get('/:id', usuarioController.obtener);
router.post('/', usuarioController.crear);
router.put('/:id', usuarioController.actualizar);
router.patch('/:id/estado', usuarioController.cambiarEstado);
router.patch('/:id/password', usuarioController.cambiarPassword);

module.exports = router;
