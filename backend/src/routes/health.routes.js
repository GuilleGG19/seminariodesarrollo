const { Router } = require('express');
const { verificarDb } = require('../controllers/health.controller');

const router = Router();

// GET /health: el proceso esta vivo (no consulta la base; lo usa Railway para el health check)
router.get('/', (req, res) => res.json({ status: 'ok' }));
router.get('/db', verificarDb); // GET /health/db

module.exports = router;
