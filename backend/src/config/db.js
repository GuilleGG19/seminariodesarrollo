// Conexion a PostgreSQL.
// Un "pool" mantiene varias conexiones abiertas y las reutiliza,
// en lugar de abrir y cerrar una conexion por cada consulta.
const { Pool, types } = require('pg');

types.setTypeParser(1082, (valor) => valor);

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

// Verifica que la base de datos responda. Si falla, lanza el error.
async function probarConexion() {
  const { rows } = await pool.query(
    `SELECT current_database() AS base,
            current_user AS usuario,
            NOW() AS fecha_actual`
  );
  return rows[0];
}

module.exports = { pool, probarConexion };
