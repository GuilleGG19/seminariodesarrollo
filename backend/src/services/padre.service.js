// Logica del CRUD de padres/tutores. Aqui viven las consultas SQL.
const { pool } = require('../config/db');

const crearError = (status, mensaje) => Object.assign(new Error(mensaje), { status });

// Consulta base: datos del padre + nombre de su comunidad + cuantos ninos tiene
const SELECT_PADRE = `
  SELECT p.id, p.nombre_completo, p.dpi, p.telefono, p.correo,
         p.canal_preferido, p.telegram_chat_id,
         c.id AS comunidad_id, c.nombre AS comunidad,
         (SELECT count(*) FROM nino n WHERE n.padre_id = p.id)::int AS total_ninos
  FROM padre p
  JOIN comunidad c ON c.id = p.comunidad_id`;

// Filtros opcionales: "buscar" (nombre o DPI) y "comunidadId"
async function listar({ buscar, comunidadId }) {
  const patron = buscar ? `%${buscar}%` : null;
  const { rows } = await pool.query(
    `${SELECT_PADRE}
     WHERE ($1::text IS NULL OR p.nombre_completo ILIKE $1 OR p.dpi ILIKE $1)
       AND ($2::uuid IS NULL OR p.comunidad_id = $2)
     ORDER BY p.nombre_completo`,
    [patron, comunidadId || null]
  );
  return rows;
}

// En el detalle se incluyen tambien los ninos del padre
async function obtenerPorId(id) {
  const { rows } = await pool.query(`${SELECT_PADRE} WHERE p.id = $1`, [id]);
  if (!rows[0]) {
    throw crearError(404, 'Padre o tutor no encontrado');
  }

  const ninos = await pool.query(
    `SELECT id, nombre, fecha_nacimiento, sexo
     FROM nino
     WHERE padre_id = $1
     ORDER BY nombre`,
    [id]
  );
  return { ...rows[0], ninos: ninos.rows };
}

// Comprueba que la comunidad exista antes de usarla
async function verificarComunidad(comunidadId) {
  const { rows } = await pool.query('SELECT 1 FROM comunidad WHERE id = $1', [comunidadId]);
  if (rows.length === 0) {
    throw crearError(400, 'La comunidad indicada no existe');
  }
}

// El unico campo UNIQUE de padre (aparte del id) es el DPI
function traducirErrorDpi(error) {
  if (error.code === '23505') {
    return crearError(409, 'Ya existe un padre o tutor registrado con ese DPI');
  }
  return error;
}

async function crear(datos) {
  await verificarComunidad(datos.comunidad_id);

  try {
    const { rows } = await pool.query(
      `INSERT INTO padre
         (comunidad_id, nombre_completo, dpi, telefono, correo, canal_preferido, telegram_chat_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        datos.comunidad_id,
        datos.nombre_completo,
        datos.dpi,
        datos.telefono,
        datos.correo,
        datos.canal_preferido,
        datos.telegram_chat_id,
      ]
    );
    return obtenerPorId(rows[0].id);
  } catch (error) {
    throw traducirErrorDpi(error);
  }
}

async function actualizar(id, datos) {
  await verificarComunidad(datos.comunidad_id);

  try {
    const { rowCount } = await pool.query(
      `UPDATE padre
       SET comunidad_id = $1, nombre_completo = $2, dpi = $3, telefono = $4,
           correo = $5, canal_preferido = $6, telegram_chat_id = $7
       WHERE id = $8`,
      [
        datos.comunidad_id,
        datos.nombre_completo,
        datos.dpi,
        datos.telefono,
        datos.correo,
        datos.canal_preferido,
        datos.telegram_chat_id,
        id,
      ]
    );
    if (rowCount === 0) {
      throw crearError(404, 'Padre o tutor no encontrado');
    }
    return obtenerPorId(id);
  } catch (error) {
    throw traducirErrorDpi(error);
  }
}

async function eliminar(id) {
  try {
    const { rowCount } = await pool.query('DELETE FROM padre WHERE id = $1', [id]);
    if (rowCount === 0) {
      throw crearError(404, 'Padre o tutor no encontrado');
    }
  } catch (error) {
    // 23503 = llave foranea: el padre todavia tiene ninos asociados
    if (error.code === '23503') {
      throw crearError(409, 'No se puede eliminar: el padre o tutor tiene niños asociados');
    }
    throw error;
  }
}

module.exports = { listar, obtenerPorId, crear, actualizar, eliminar };
