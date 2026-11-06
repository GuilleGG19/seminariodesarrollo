const { Router } = require('express');
const authController = require('../controllers/auth.controller');
const { verificarToken } = require('../middlewares/auth.middleware');
const { limiteLogin } = require('../middlewares/rateLimit.middleware');

const router = Router();

router.post('/login', limiteLogin, authController.login);
router.post('/logout', authController.logout);
router.get('/perfil', verificarToken, authController.perfil);
router.patch('/password', verificarToken, limiteLogin, authController.cambiarPassword);

module.exports = router;
