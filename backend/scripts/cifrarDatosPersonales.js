// Cifra los datos personales de los padres que todavia estan en texto plano
// (registros creados antes de activar el cifrado) y calcula su dpi_hash.
// Uso: npm run cifrar-datos
// Es seguro ejecutarlo mas de una vez: los valores ya cifrados no se tocan.
require('dotenv').config({ quiet: true });
const { pool } = require('../src/config/db');
const { validarEntorno } = require('../src/config/entorno');
const { cifrar, descifrar, estaCifrado, hashBusqueda } = require('../src/utils/cifrado');

const COLUMNAS = ['dpi', 'telefono', 'correo', 'telegram_chat_id'];

async function main() {
  const errores = validarEntorno();
  if (errores.length > 0) {
    console.error('Configura primero backend/.env:\n - ' + errores.join('\n - '));
    process.exitCode = 1;
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT id, dpi, dpi_hash, telefono, correo, telegram_chat_id FROM padre FOR UPDATE`
    );

    let actualizados = 0;
    for (const fila of rows) {
      const pendiente = fila.dpi_hash === null || COLUMNAS.some((c) => fila[c] && !estaCifrado(fila[c]));
      if (!pendiente) continue;

      const valores = COLUMNAS.map((c) => (fila[c] && !estaCifrado(fila[c]) ? cifrar(fila[c]) : fila[c]));
      await client.query(
        `UPDATE padre SET dpi = $1, telefono = $2, correo = $3, telegram_chat_id = $4, dpi_hash = $5
         WHERE id = $6`,
        [...valores, hashBusqueda(descifrar(fila.dpi)), fila.id]
      );
      actualizados += 1;
    }

    await client.query('COMMIT');
    console.log(`Padres revisados: ${rows.length}. Cifrados ahora: ${actualizados}.`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

main()
  .catch((error) => {
    console.error('Error:', error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
