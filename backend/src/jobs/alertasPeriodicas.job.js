// Tareas programadas (node-cron).
const cron = require('node-cron');
const alertaService = require('../services/alerta.service');
const notificacionService = require('../services/notificacion.service');

const ZONA_HORARIA = 'America/Guatemala';

// Ejecuta "tarea" evitando que se encimen dos ejecuciones si una tarda mas de lo esperado
function sinSolapar(nombre, tarea, { registrarVacio = true } = {}) {
  let enEjecucion = false;
  return async () => {
    if (enEjecucion) return;
    enEjecucion = true;
    try {
      const resumen = await tarea();
      if (registrarVacio || (resumen && resumen.procesadas > 0)) {
        console.log(`[${nombre}] Completado:`, resumen);
      }
    } catch (error) {
      console.error(`[${nombre}] Falló:`, error.message);
    } finally {
      enEjecucion = false;
    }
  };
}

const revisarAlertas = sinSolapar('alertas', () => alertaService.generar());
const enviarNotificaciones = sinSolapar('notificaciones', () => notificacionService.enviarPendientes(), {
  registrarVacio: false,
});

function iniciarJobs() {
  // Todos los dias a las 06:00, hora de Guatemala
  cron.schedule('0 6 * * *', revisarAlertas, { timezone: ZONA_HORARIA });
  // Cada 5 minutos se envian las notificaciones pendientes (alertas y campanas)
  cron.schedule('*/5 * * * *', enviarNotificaciones, { timezone: ZONA_HORARIA });
  console.log(
    'Tareas programadas activas: revisión diaria de alertas a las 06:00 y envío de notificaciones cada 5 minutos'
  );
}

module.exports = { iniciarJobs, revisarAlertas, enviarNotificaciones };
