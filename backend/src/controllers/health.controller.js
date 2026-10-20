// Verificacion del estado del servidor y la base de datos.
const { probarConexion } = require('../config/db');

const verificarDb = async (req, res) => {
  try {
    const info = await probarConexion();
    res.status(200).json({
      status: 'ok',
      mensaje: 'Conexión a PostgreSQL exitosa',
      fecha_servidor: info.fecha_actual,
    });
  } catch (error) {
    console.error('Error al conectar con la base de datos:', error);
    res.status(500).json({
      status: 'error',
      mensaje: 'No se pudo conectar a la base de datos',
    });
  }
};

module.exports = { verificarDb };
