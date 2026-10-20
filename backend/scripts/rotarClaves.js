// Vuelve a cifrar los datos personales con claves nuevas (por ejemplo, si las
// anteriores se expusieron). Lee las claves NUEVAS de backend/.env y las ANTERIORES
// de las variables OLD_DATA_ENCRYPTION_KEY y OLD_DATA_HASH_KEY.
//
// Uso (PowerShell):
//   $env:OLD_DATA_ENCRYPTION_KEY="clave_vieja"; $env:OLD_DATA_HASH_KEY="hash_viejo"; npm run rotar-claves
// Uso (Git Bash):
//   OLD_DATA_ENCRYPTION_KEY=clave_vieja OLD_DATA_HASH_KEY=hash_viejo npm run rotar-claves
//
// Todo ocurre en una transaccion: si algo falla, no cambia nada.
require('dotenv').config({ quiet: true });
const { pool } = require('../src/config/db');
const { validarEntorno } = require('../src/config/entorno');
const cifrado = require('../src/utils/cifrado');

const HEX_64 = /^[0-9a-fA-F]{64}$/;
const COLUMNAS = ['dpi', 'telefono', 'correo', 'telegram_chat_id'];

// Ejecuta "fn" usando temporalmente las claves indicadas
function conClaves(claveCifrado, claveHash, fn) {
  const antes = [process.env.DATA_ENCRYPTION_KEY, process.env.DATA_HASH_KEY];
  process.env.DATA_ENCRYPTION_KEY = claveCifrado;
  process.env.DATA_HASH_KEY = claveHash;
  try {
    return fn();
  } finally {
    [process.env.DATA_ENCRYPTION_KEY, process.env.DATA_HASH_KEY] = antes;
  }
}

async function main() {
  const errores = validarEntorno();
  const viejaCifrado = process.env.OLD_DATA_ENCRYPTION_KEY || '';
  const viejaHash = process.env.OLD_DATA_HASH_KEY || '';
  if (!HEX_64.test(viejaCifrado) || !HEX_64.test(viejaHash)) {
    errores.push('Define OLD_DATA_ENCRYPTION_KEY y OLD_DATA_HASH_KEY (64 caracteres hexadecimales)');
  }
  if (viejaCifrado === process.env.DATA_ENCRYPTION_KEY) {
    errores.push('DATA_ENCRYPTION_KEY en .env sigue siendo la clave anterior: pon la nueva primero');
  }
  if (errores.length > 0) {
    console.error(' - ' + errores.join('\n - '));
    process.exitCode = 1;
    return;
  }
  const nuevaCifrado = process.env.DATA_ENCRYPTION_KEY;
  const nuevaHash = process.env.DATA_HASH_KEY;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'SELECT id, dpi, telefono, correo, telegram_chat_id FROM padre FOR UPDATE'
    );

    for (const fila of rows) {
      // Descifrar con las claves viejas (los valores en texto plano pasan tal cual)
      const plano = conClaves(viejaCifrado, viejaHash, () =>
        Object.fromEntries(COLUMNAS.map((c) => [c, cifrado.descifrar(fila[c])]))
      );
      // Cifrar con las nuevas
      const [nuevos, dpiHash] = conClaves(nuevaCifrado, nuevaHash, () => [
        COLUMNAS.map((c) => cifrado.cifrar(plano[c])),
        cifrado.hashBusqueda(plano.dpi),
      ]);
      await client.query(
        `UPDATE padre SET dpi = $1, telefono = $2, correo = $3, telegram_chat_id = $4, dpi_hash = $5
         WHERE id = $6`,
        [...nuevos, dpiHash, fila.id]
      );
    }

    await client.query('COMMIT');
    console.log(`Listo: ${rows.length} padre(s) cifrados de nuevo con las claves nuevas.`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('No se cambió nada. Error:', error.message);
    console.error('¿Las claves OLD_ son las que se usaron para cifrar?');
    process.exitCode = 1;
  } finally {
    client.release();
  }
}

main().finally(() => pool.end());
