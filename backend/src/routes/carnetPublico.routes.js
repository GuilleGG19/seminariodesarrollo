// Acceso de los padres al carnet: SIN sesion, solo token (QR) + PIN.
const { Router } = require('express');
const carnetController = require('../controllers/carnetQr.controller');
const { limitePublico } = require('../middlewares/rateLimit.middleware');

const router = Router();
router.use(limitePublico);

router.get('/:token', carnetController.estado);
router.post('/:token/acceso', carnetController.acceder);

module.exports = router;
