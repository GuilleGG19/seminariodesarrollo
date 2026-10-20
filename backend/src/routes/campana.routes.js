// Campanas comunitarias: solo administrador y encargado.
const { Router } = require('express');
const campanaController = require('../controllers/campana.controller');
const { verificarToken } = require('../middlewares/auth.middleware');
const { permitirRoles } = require('../middlewares/roles.middleware');

const router = Router();
router.use(verificarToken, permitirRoles('administrador', 'encargado'));

router.get('/', campanaController.listar);
router.post('/vista-previa', campanaController.vistaPrevia);
router.post('/', campanaController.crear);
router.get('/:id', campanaController.obtener);

module.exports = router;
