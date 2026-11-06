// Aplica los scripts de db/init/*.sql que falten, en orden, y registra cada uno
// en la tabla schema_migraciones (asi se puede ejecutar varias veces sin repetir).
//
// Uso (usa la conexion de backend/.env, o DATABASE_URL si se define):
//   npm run migrar                       aplica las migraciones pendientes
//   npm run migrar -- --estado           solo muestra cuales faltan
//   npm run migrar -- --registrar-todas  marca todas como aplicadas SIN ejecutarlas
//                                        (para una base que ya se armo a mano, como la de Docker)
require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const { pool } = require('../src/config/db');

const CARPETA = path.join(__dirname, '..', '..', 'db', 'init');
const args = new Set(process.argv.slice(2));

async function main() {
  const archivos = fs.readdirSync(CARPETA).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();
  const client = await pool.connect();
  try {
    const { rows: info } = await client.query('SELECT current_database() AS base, inet_server_addr() AS host');
    console.log(`Base de datos: ${info[0].base} (${info[0].host || 'local'})`);

    await client.query(`CREATE TABLE IF NOT EXISTS schema_migraciones (
      nombre      varchar(255) PRIMARY KEY,
      aplicada_en timestamptz NOT NULL DEFAULT now()
    )`);
    await client.query('ALTER TABLE schema_migraciones ENABLE ROW LEVEL SECURITY');

    const aplicadas = new Set((await client.query('SELECT nombre FROM schema_migraciones')).rows.map((r) => r.nombre));
    const pendientes = archivos.filter((f) => !aplicadas.has(f));

    if (pendientes.length === 0) {
      console.log(`Todo al día: ${archivos.length} migraciones aplicadas.`);
      return;
    }
    console.log(`Pendientes (${pendientes.length}): ${pendientes.join(', ')}`);
    if (args.has('--estado')) return;

    if (args.has('--registrar-todas')) {
      for (const f of pendientes) {
        await client.query('INSERT INTO schema_migraciones (nombre) VALUES ($1) ON CONFLICT DO NOTHING', [f]);
      }
      console.log('Marcadas como aplicadas (no se ejecutó ningún SQL).');
      return;
    }

    // Seguridad: si la base ya tiene tablas del sistema pero no hay registro de
    // migraciones, probablemente se armo a mano y volver a correr 01 fallaria.
    const yaTieneTablas = (await client.query("SELECT to_regclass('public.usuario') IS NOT NULL AS existe")).rows[0].existe;
    if (yaTieneTablas && aplicadas.size === 0) {
      console.error(
        'La base ya tiene las tablas del sistema pero no hay registro de migraciones.\n' +
          'Si ya está al día, ejecuta: npm run migrar -- --registrar-todas'
      );
      process.exitCode = 1;
      return;
    }

    for (const f of pendientes) {
      const sql = fs.readFileSync(path.join(CARPETA, f), 'utf8');
      process.stdout.write(`Aplicando ${f}... `);
      const inicio = Date.now();
      await client.query(sql);
      await client.query('INSERT INTO schema_migraciones (nombre) VALUES ($1)', [f]);
      console.log(`listo (${Date.now() - inicio} ms)`);
    }
    console.log('Migraciones aplicadas correctamente.');
  } finally {
    client.release();
  }
}

main()
  .catch((error) => {
    console.error('\nError:', error.message);
    console.error('La migración que falló NO quedó registrada; corrige el problema y vuelve a ejecutar.');
    process.exitCode = 1;
  })
  .finally(() => pool.end());
