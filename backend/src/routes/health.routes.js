const { Router } = require('express');
const { verificarDb } = require('../controllers/health.controller');

const router = Router();

router.get('/db', verificarDb); // GET /health/db

module.exports = router;
