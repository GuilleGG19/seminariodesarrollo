// Conexion a PostgreSQL.
// Un "pool" mantiene varias conexiones abiertas y las reutiliza,
// en lugar de abrir y cerrar una conexion por cada consulta.
//
// Dos formas de configurarla:
//  - Local (Docker): DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
//  - Nube (Supabase, Neon...): DATABASE_URL=postgresql://usuario:clave@host:5432/base
//
// SSL (DB_SSL):
//  - false     : sin SSL (Docker local)
//  - verify    : SSL verificando el certificado del servidor (recomendado en la nube).
//                Si el proveedor usa su propia CA (Supabase), poner el certificado en DB_SSL_CA.
//  - no-verify : SSL sin verificar el certificado (cifra, pero no protege de suplantacion)
const { Pool, types } = require('pg');

types.setTypeParser(1082, (valor) => valor);

// pg da prioridad a "sslmode" de la URL sobre la opcion "ssl": se quita de la URL
// para que mande DB_SSL.
function limpiarUrl(url) {
  const u = new URL(url);
  ['sslmode', 'sslrootcert', 'sslcert', 'sslkey', 'uselibpqcompat'].forEach((p) => u.searchParams.delete(p));
  return u.toString();
}

function opcionesSsl() {
  const modo = (process.env.DB_SSL || 'false').toLowerCase();
  if (modo === 'false') return false;
  if (modo === 'no-verify') return { rejectUnauthorized: false };
  // "verify": el certificado puede venir en una sola linea con \n escritos
  const ca = process.env.DB_SSL_CA ? process.env.DB_SSL_CA.replace(/\\n/g, '\n') : undefined;
  return { rejectUnauthorized: true, ...(ca ? { ca } : {}) };
}

const comunes = {
  ssl: opcionesSsl(),
  max: Number(process.env.DB_POOL_MAX) || 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000,
};

const pool = new Pool(
  process.env.DATABASE_URL
    ? { connectionString: limpiarUrl(process.env.DATABASE_URL), ...comunes }
    : {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        ...comunes,
      }
);

// Un error en una conexion inactiva (por ejemplo, el proveedor la cerro) no debe tumbar el proceso
pool.on('error', (error) => console.error('[db] Error en una conexión inactiva:', error.message));

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
