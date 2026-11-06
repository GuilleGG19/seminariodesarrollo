// Crea el primer usuario administrador (la base arranca sin usuarios).
// Uso: node scripts/crearAdmin.js "Nombre Completo" correo@dominio.com contrasena
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('../src/config/db');
const { validarPassword } = require('../src/utils/password');

async function main() {
  const [nombre, correo, password] = process.argv.slice(2);

  if (!nombre || !correo || !password) {
    console.error('Uso: node scripts/crearAdmin.js "Nombre Completo" correo@dominio.com contrasena');
    process.exitCode = 1;
    return;
  }
  const errorPassword = validarPassword(password);
  if (errorPassword) {
    console.error(errorPassword);
    process.exitCode = 1;
    return;
  }

  const hash = await bcrypt.hash(password, 10);

  // El rol se busca por nombre, asi no hace falta conocer su UUID
  const { rows } = await pool.query(
    `INSERT INTO usuario (rol_id, nombre_completo, correo, password_hash)
     SELECT id, $1, $2, $3 FROM rol WHERE nombre = 'administrador'
     RETURNING correo`,
    [nombre, correo.trim().toLowerCase(), hash]
  );

  if (rows.length === 0) {
    console.error('No existe el rol "administrador" en la tabla rol');
    process.exitCode = 1;
    return;
  }
  console.log(`Administrador creado: ${rows[0].correo}`);
}

main()
  .catch((error) => {
    if (error.code === '23505') {
      console.error('Ya existe un usuario con ese correo');
    } else {
      console.error('Error:', error.message);
    }
    process.exitCode = 1;
  })
  .finally(() => pool.end());
