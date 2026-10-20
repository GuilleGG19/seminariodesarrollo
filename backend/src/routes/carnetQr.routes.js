// Gestion de carnets por el personal (requiere sesion)
const { Router } = require('express');
const carnetController = require('../controllers/carnetQr.controller');
const { verificarToken } = require('../middlewares/auth.middleware');
const { permitirRoles } = require('../middlewares/roles.middleware');

const router = Router();
router.use(verificarToken);

const PERSONAL = ['administrador', 'encargado', 'personal_salud'];

router.get('/', carnetController.listar);
router.post('/', permitirRoles(...PERSONAL), carnetController.generar);
router.patch('/:id/revocar', permitirRoles(...PERSONAL), carnetController.revocar);

module.exports = router;
