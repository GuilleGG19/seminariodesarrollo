// Punto de entrada del backend SCCVI.
// IMPORTANTE: dotenv debe cargarse primero para que config/db.js encuentre las variables.
require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { probarConexion } = require('./config/db');
const { limiteGeneral } = require('./middlewares/rateLimit.middleware');
const { iniciarJobs } = require('./jobs/alertasPeriodicas.job');

const app = express();
const PORT = process.env.PORT || 3000;

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

// Limite general de peticiones para toda la API
app.use('/api', limiteGeneral);

// Rutas del sistema (descomentar cada una al crear su modulo)
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
app.use('/api/carnets-qr', require('./routes/carnetQr.routes'));
app.use('/api/carnet-publico', require('./routes/carnetPublico.routes'));
// app.use('/api/dashboard', require('./routes/dashboard.routes'));

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
  console.error(err.stack);

  const conocido = ERRORES_PG[err.code];
  if (conocido) {
    return res.status(conocido.status).json({ error: conocido.error });
  }

  const status = err.status || 500;
  res.status(status).json({
    // En errores 500 no se expone el mensaje interno
    error: status === 500 ? 'Error interno del servidor' : err.message,
  });
});

// Arranque: primero se verifica la base de datos y luego se abre el servidor
async function iniciar() {
  // Sin esta clave no se pueden firmar ni verificar los JWT
  if (!process.env.JWT_SECRET) {
    console.error('Falta JWT_SECRET en el archivo .env');
    process.exit(1);
  }

  try {
    const info = await probarConexion();
    console.log(`Base de datos conectada: ${info.base} (usuario ${info.usuario})`);

    app.listen(PORT, () => {
      console.log(`Servidor SCCVI corriendo en http://localhost:${PORT}`);
      iniciarJobs(); // tareas programadas (node-cron)
    });
  } catch (error) {
    console.error('No se pudo conectar a la base de datos:', error.message);
    process.exit(1);
  }
}

iniciar();
