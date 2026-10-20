// Logica del CRUD de padres/tutores. Aqui viven las consultas SQL.
//
// DPI, telefono, correo y chat de Telegram se guardan CIFRADOS (utils/cifrado.js).
// dpi_hash permite verificar que el DPI no se repita y buscar por DPI exacto.
// En los listados el DPI se devuelve enmascarado; completo solo en el detalle.
const { pool } = require('../config/db');
const { cifrar, descifrar, hashBusqueda, enmascarar } = require('../utils/cifrado');
const { consultar } = require('../utils/paginacion');

const crearError = (status, mensaje) => Object.assign(new Error(mensaje), { status });

// Consulta base: datos del padre + nombre de su comunidad + cuantos ninos tiene
const SELECT_PADRE = `
  SELECT p.id, p.nombre_completo, p.dpi, p.telefono, p.correo,
         p.canal_preferido, p.telegram_chat_id,
         c.id AS comunidad_id, c.nombre AS comunidad,
         (SELECT count(*) FROM nino n WHERE n.padre_id = p.id)::int AS total_ninos
  FROM padre p
  JOIN comunidad c ON c.id = p.comunidad_id`;

// Descifra los datos personales de una fila
function descifrarFila(fila) {
  return {
    ...fila,
    dpi: descifrar(fila.dpi),
    telefono: descifrar(fila.telefono),
    correo: descifrar(fila.correo),
    telegram_chat_id: descifrar(fila.telegram_chat_id),
  };
}

// Version para listados: DPI enmascarado
const filaListado = (fila) => {
  const limpia = descifrarFila(fila);
  return { ...limpia, dpi: enmascarar(limpia.dpi) };
};

// Filtros opcionales: "buscar" (nombre, o DPI completo de 13 digitos) y "comunidadId".
// El DPI esta cifrado: solo se puede buscar por el DPI exacto, no por una parte.
async function listar({ buscar, comunidadId }, paginacion) {
  const patron = buscar ? `%${buscar}%` : null;
  const dpi = buscar ? buscar.replace(/[\s-]/g, '') : '';
  const dpiHash = /^\d{13}$/.test(dpi) ? hashBusqueda(dpi) : null;

  const resultado = await consultar(
    pool,
    {
      sql: `${SELECT_PADRE}
            WHERE ($1::text IS NULL OR p.nombre_completo ILIKE $1 OR p.dpi_hash = $3)
              AND ($2::uuid IS NULL OR p.comunidad_id = $2)`,
      params: [patron, comunidadId || null, dpiHash],
      orden: 't.nombre_completo',
    },
    paginacion
  );
  if (Array.isArray(resultado)) return resultado.map(filaListado);
  return { ...resultado, datos: resultado.datos.map(filaListado) };
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
  return { ...descifrarFila(rows[0]), ninos: ninos.rows };
}

// Comprueba que la comunidad exista antes de usarla
async function verificarComunidad(comunidadId) {
  const { rows } = await pool.query('SELECT 1 FROM comunidad WHERE id = $1', [comunidadId]);
  if (rows.length === 0) {
    throw crearError(400, 'La comunidad indicada no existe');
  }
}

// El unico campo UNIQUE de padre (aparte del id) es el DPI (via dpi_hash)
function traducirErrorDpi(error) {
  if (error.code === '23505') {
    return crearError(409, 'Ya existe un padre o tutor registrado con ese DPI');
  }
  return error;
}

// Valores en el orden de las columnas de INSERT/UPDATE, con los datos personales cifrados
const valoresCifrados = (datos) => [
  datos.comunidad_id,
  datos.nombre_completo,
  cifrar(datos.dpi),
  hashBusqueda(datos.dpi),
  cifrar(datos.telefono),
  cifrar(datos.correo),
  datos.canal_preferido,
  cifrar(datos.telegram_chat_id),
];

async function crear(datos) {
  await verificarComunidad(datos.comunidad_id);

  try {
    const { rows } = await pool.query(
      `INSERT INTO padre
         (comunidad_id, nombre_completo, dpi, dpi_hash, telefono, correo, canal_preferido, telegram_chat_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      valoresCifrados(datos)
    );
    return obtenerPorId(rows[0].id);
  } catch (error) {
    throw traducirErrorDpi(error);
  }
}

// Si el padre cambia de comunidad, sus ninos se mueven con el en la misma transaccion
// (un nino nunca queda en una comunidad distinta a la de su padre).
async function actualizar(id, datos) {
  await verificarComunidad(datos.comunidad_id);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rowCount } = await client.query(
      `UPDATE padre
       SET comunidad_id = $1, nombre_completo = $2, dpi = $3, dpi_hash = $4, telefono = $5,
           correo = $6, canal_preferido = $7, telegram_chat_id = $8
       WHERE id = $9`,
      [...valoresCifrados(datos), id]
    );
    if (rowCount === 0) {
      throw crearError(404, 'Padre o tutor no encontrado');
    }
    await client.query('UPDATE nino SET comunidad_id = $1 WHERE padre_id = $2', [
      datos.comunidad_id,
      id,
    ]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw traducirErrorDpi(error);
  } finally {
    client.release();
  }
  return obtenerPorId(id);
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
