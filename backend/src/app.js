// Punto de entrada del backend SCCVI.
// IMPORTANTE: dotenv debe cargarse primero para que config/db.js encuentre las variables.
require('dotenv').config({ quiet: true });

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const swaggerUi = require('swagger-ui-express');
const { probarConexion, pool } = require('./config/db');
const { validarEntorno } = require('./config/entorno');
const { limiteGeneral } = require('./middlewares/rateLimit.middleware');
const { registrarAuditoria } = require('./middlewares/auditoria.middleware');
const { iniciarJobs } = require('./jobs/alertasPeriodicas.job');
const openapi = require('./docs/openapi');

const app = express();
const PORT = process.env.PORT || 3000;

// Detras de un proxy (nginx, balanceador) la IP real llega en X-Forwarded-For.
// Sin esto, el limite de peticiones veria a todos los usuarios como una sola IP.
app.set('trust proxy', Number(process.env.TRUST_PROXY) || 0);
app.disable('x-powered-by');

// Documentacion Swagger (seccion 11). Va antes del CSP general porque la interfaz
// de Swagger UI necesita estilos en linea. Desactivada en produccion salvo DOCS_ENABLED=true.
const docsActivos =
  process.env.DOCS_ENABLED === 'true' || (process.env.NODE_ENV !== 'production' && process.env.DOCS_ENABLED !== 'false');
if (docsActivos) {
  app.get('/api/docs.json', (req, res) => res.json(openapi));
  app.use(
    '/api/docs',
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          frameAncestors: ["'none'"],
        },
      },
    }),
    swaggerUi.serve,
    swaggerUi.setup(openapi, {
      customSiteTitle: 'SCCVI - API',
      swaggerOptions: { withCredentials: true, persistAuthorization: true },
    })
  );
}

// Seguridad: headers HTTP + CSP
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
  })
);

// Middlewares de seguridad y parsing
app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  })
);
app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());

// Ruta de verificacion (health check): GET /health/db
app.use('/health', require('./routes/health.routes'));

// Limite general de peticiones y registro de auditoria para toda la API
app.use('/api', limiteGeneral);
app.use('/api', registrarAuditoria);

// Rutas del sistema
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/usuarios', require('./routes/usuario.routes'));
app.use('/api/comunidades', require('./routes/comunidad.routes'));
app.use('/api/padres', require('./routes/padre.routes'));
app.use('/api/ninos', require('./routes/nino.routes'));
app.use('/api/registros-crecimiento', require('./routes/registroCrecimiento.routes'));
app.use('/api/vacunas', require('./routes/vacuna.routes'));
app.use('/api/vacunaciones', require('./routes/vacunacion.routes'));
app.use('/api/alertas', require('./routes/alerta.routes'));
app.use('/api/reportes', require('./routes/reporte.routes'));
app.use('/api/campanas', require('./routes/campana.routes'));
app.use('/api/notificaciones', require('./routes/notificacion.routes'));
app.use('/api/carnets-qr', require('./routes/carnetQr.routes'));
app.use('/api/carnet-publico', require('./routes/carnetPublico.routes'));
app.use('/api/dashboard', require('./routes/dashboard.routes'));
app.use('/api/auditoria', require('./routes/auditoria.routes'));

// Ruta no encontrada
app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// Errores de PostgreSQL que se traducen a respuestas claras
const ERRORES_PG = {
  23503: {
    status: 409,
    error: 'No se puede completar la accion porque el registro esta relacionado con otros datos',
  },
  23505: {
    status: 409,
    error: 'Ya existe un registro con ese dato unico (correo, DPI, etc.)',
  },
  23502: {
    status: 400,
    error: 'Faltan datos obligatorios para completar la accion',
  },
  23514: {
    status: 400,
    error: 'Uno de los valores enviados no esta permitido',
  },
  22001: {
    status: 400,
    error: 'Uno de los datos excede la longitud permitida',
  },
  '22P02': {
    status: 400,
    error: 'El identificador proporcionado no tiene un formato valido',
  },
};

// Manejo central de errores (debe ir despues de todas las rutas)
app.use((err, req, res, next) => {
  const conocido = ERRORES_PG[err.code];
  if (conocido) {
    return res.status(conocido.status).json({ error: conocido.error });
  }

  const status = err.status || err.statusCode || 500;
  // Solo los errores inesperados se registran con todo el detalle
  if (status >= 500) console.error(err.stack);

  res.status(status).json({
    // En errores 500 no se expone el mensaje interno
    error: status >= 500 ? 'Error interno del servidor' : err.message,
    ...(err.intentos_restantes !== undefined ? { intentos_restantes: err.intentos_restantes } : {}),
  });
});

// Avisa si hay padres registrados antes de activar el cifrado
async function revisarDatosSinCifrar() {
  const { rows } = await pool.query("SELECT count(*)::int AS total FROM padre WHERE dpi_hash IS NULL OR dpi NOT LIKE 'enc:v1:%'");
  if (rows[0].total > 0) {
    console.warn(
      `AVISO: hay ${rows[0].total} padre(s) con datos personales sin cifrar. Ejecuta: npm run cifrar-datos`
    );
  }
}

// Arranque: primero se verifica la configuracion y la base de datos, luego se abre el servidor
async function iniciar() {
  const errores = validarEntorno();
  if (errores.length > 0) {
    console.error('Configuración inválida en backend/.env:\n - ' + errores.join('\n - '));
    console.error('Genera secretos nuevos con: npm run secretos');
    process.exit(1);
  }

  try {
    const info = await probarConexion();
    console.log(`Base de datos conectada: ${info.base} (usuario ${info.usuario})`);
    await revisarDatosSinCifrar().catch((e) => console.warn('No se pudo revisar el cifrado:', e.message));

    app.listen(PORT, () => {
      console.log(`Servidor SCCVI corriendo en http://localhost:${PORT}`);
      if (docsActivos) console.log(`Documentación de la API: http://localhost:${PORT}/api/docs`);
      iniciarJobs(); // tareas programadas (node-cron)
    });
  } catch (error) {
    // Si la conexion es rechazada, pg lanza un AggregateError sin mensaje: se usa el codigo
    const causa = error.message || error.code || (error.errors && error.errors[0]?.code) || String(error);
    console.error(`No se pudo conectar a la base de datos (${process.env.DB_HOST}:${process.env.DB_PORT}): ${causa}`);
    if (/ECONNREFUSED/.test(causa) || error.code === 'ECONNREFUSED') {
      console.error('PostgreSQL no está escuchando. ¿Está encendido Docker Desktop y el contenedor sccvi_postgres? (docker compose up -d)');
    } else if (error.code === '28P01') {
      console.error('Usuario o contraseña incorrectos: revisa DB_USER y DB_PASSWORD en backend/.env');
    }
    process.exit(1);
  }
}

// Al importar app.js desde las pruebas no se arranca el servidor
if (require.main === module) {
  iniciar();
}

module.exports = app;
