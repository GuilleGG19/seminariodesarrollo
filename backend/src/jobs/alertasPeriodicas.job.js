// Tareas programadas (node-cron).
const cron = require('node-cron');
const alertaService = require('../services/alerta.service');

const ZONA_HORARIA = 'America/Guatemala';
let enEjecucion = false;

async function revisarAlertas() {
  // Evita que se encimen dos ejecuciones si una tarda mas de lo esperado
  if (enEjecucion) return;
  enEjecucion = true;
  try {
    const resumen = await alertaService.generar();
    console.log('[alertas] Revisión diaria completada:', resumen);
  } catch (error) {
    console.error('[alertas] Falló la revisión diaria:', error.message);
  } finally {
    enEjecucion = false;
  }
}

function iniciarJobs() {
  // Todos los dias a las 06:00, hora de Guatemala
  cron.schedule('0 6 * * *', revisarAlertas, { timezone: ZONA_HORARIA });
  console.log('Tareas programadas activas: revisión diaria de alertas a las 06:00 (hora de Guatemala)');
}

module.exports = { iniciarJobs, revisarAlertas };
