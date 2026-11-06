// Registro de auditoria: solo administrador.
const { Router } = require('express');
const auditoriaController = require('../controllers/auditoria.controller');
const { verificarToken } = require('../middlewares/auth.middleware');
const { permitirRoles } = require('../middlewares/roles.middleware');

const router = Router();
router.use(verificarToken, permitirRoles('administrador'));

router.get('/', auditoriaController.listar);

module.exports = router;
