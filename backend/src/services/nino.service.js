// Logica del CRUD de ninos. Aqui viven las consultas SQL.
const { pool } = require('../config/db');
const { consultar } = require('../utils/paginacion');

const crearError = (status, mensaje) => Object.assign(new Error(mensaje), { status });

// Edad en meses cumplidos, calculada por PostgreSQL con la fecha de hoy en Guatemala.
// age() devuelve "X anios Y meses Z dias"; se convierte a meses totales.
const EDAD_MESES = `(
  extract(year from age((now() at time zone 'America/Guatemala')::date, n.fecha_nacimiento)) * 12 +
  extract(month from age((now() at time zone 'America/Guatemala')::date, n.fecha_nacimiento))
)::int`;

// Consulta base: datos del nino + edad en meses + su comunidad y su padre
const SELECT_NINO = `
  SELECT n.id, n.nombre, n.fecha_nacimiento, n.sexo,
         ${EDAD_MESES} AS edad_meses,
         c.id AS comunidad_id, c.nombre AS comunidad,
         p.id AS padre_id, p.nombre_completo AS padre
  FROM nino n
  JOIN comunidad c ON c.id = n.comunidad_id
  JOIN padre p ON p.id = n.padre_id`;

// Filtros opcionales: "buscar" (nombre), "comunidadId", "padreId" y "sexo"
async function listar({ buscar, comunidadId, padreId, sexo }, paginacion) {
  const patron = buscar ? `%${buscar}%` : null;
  return consultar(
    pool,
    {
      sql: `${SELECT_NINO}
            WHERE ($1::text IS NULL OR n.nombre ILIKE $1)
              AND ($2::uuid IS NULL OR n.comunidad_id = $2)
              AND ($3::uuid IS NULL OR n.padre_id = $3)
              AND ($4::text IS NULL OR n.sexo = $4)`,
      params: [patron, comunidadId || null, padreId || null, sexo || null],
      orden: 't.nombre, t.id',
    },
    paginacion
  );
}

// Cartilla de vacunacion: el esquema completo del nino (v_esquema_vacunacion)
// agrupado por vacuna, con el estado de cada dosis y un resumen.
async function obtenerEsquema(id) {
  const nino = await obtenerPorId(id); // lanza 404 si no existe
  const { rows } = await pool.query(
    `SELECT vacuna_id, vacuna, dosis_total, numero_dosis, edad_dosis_meses,
            vacunacion_id, fecha_aplicada, programada, fecha_objetivo, estado, dias_atraso
     FROM v_esquema_vacunacion
     WHERE nino_id = $1
     ORDER BY vacuna_id, numero_dosis`,
    [id]
  );

  const porVacuna = new Map();
  const resumen = { aplicadas: 0, atrasadas: 0, pendientes: 0, sin_fecha: 0, total: rows.length };
  const CONTADOR = { aplicada: 'aplicadas', atrasada: 'atrasadas', pendiente: 'pendientes', sin_fecha: 'sin_fecha' };

  for (const fila of rows) {
    resumen[CONTADOR[fila.estado]] += 1;
    if (!porVacuna.has(fila.vacuna_id)) {
      porVacuna.set(fila.vacuna_id, {
        vacuna_id: fila.vacuna_id,
        vacuna: fila.vacuna,
        dosis_total: fila.dosis_total,
        dosis: [],
      });
    }
    porVacuna.get(fila.vacuna_id).dosis.push({
      numero_dosis: fila.numero_dosis,
      edad_recomendada_meses: fila.edad_dosis_meses,
      fecha_objetivo: fila.fecha_objetivo,
      fecha_aplicada: fila.fecha_aplicada,
      estado: fila.estado,
      dias_atraso: fila.dias_atraso,
      programada: fila.programada,
      vacunacion_id: fila.vacunacion_id,
    });
  }

  // Vacunas ordenadas por la fecha de su primera dosis
  const vacunas = [...porVacuna.values()].sort(
    (a, b) =>
      String(a.dosis[0].fecha_objetivo || '9999').localeCompare(String(b.dosis[0].fecha_objetivo || '9999')) ||
      a.vacuna.localeCompare(b.vacuna)
  );
  for (const v of vacunas) {
    v.aplicadas = v.dosis.filter((d) => d.estado === 'aplicada').length;
    v.completa = v.aplicadas === v.dosis_total;
  }

  return {
    nino: { id: nino.id, nombre: nino.nombre, fecha_nacimiento: nino.fecha_nacimiento, edad_meses: nino.edad_meses },
    resumen: { ...resumen, al_dia: resumen.atrasadas === 0 },
    vacunas,
  };
}

async function obtenerPorId(id) {
  const { rows } = await pool.query(`${SELECT_NINO} WHERE n.id = $1`, [id]);
  if (!rows[0]) {
    throw crearError(404, 'Niño no encontrado');
  }
  return rows[0];
}

// La comunidad del nino NO la envia el cliente: se toma de su padre.
// Asi nunca queda un nino en una comunidad distinta a la de su padre.
async function crear({ padre_id, nombre, fecha_nacimiento, sexo }) {
  const { rows } = await pool.query(
    `INSERT INTO nino (comunidad_id, padre_id, nombre, fecha_nacimiento, sexo)
     SELECT p.comunidad_id, p.id, $2, $3, $4
     FROM padre p
     WHERE p.id = $1
     RETURNING id`,
    [padre_id, nombre, fecha_nacimiento, sexo]
  );

  // Si no se inserto nada, es porque el padre no existe
  if (rows.length === 0) {
    throw crearError(400, 'El padre o tutor indicado no existe');
  }
  return obtenerPorId(rows[0].id);
}

async function actualizar(id, { padre_id, nombre, fecha_nacimiento, sexo }) {
  const { rows } = await pool.query(
    `UPDATE nino n
     SET padre_id = p.id, comunidad_id = p.comunidad_id,
         nombre = $2, fecha_nacimiento = $3, sexo = $4
     FROM padre p
     WHERE p.id = $1 AND n.id = $5
     RETURNING n.id`,
    [padre_id, nombre, fecha_nacimiento, sexo, id]
  );

  if (rows.length === 0) {
    // Se distingue si falto el nino o el padre para dar el mensaje correcto
    await obtenerPorId(id); // lanza 404 si el nino no existe
    throw crearError(400, 'El padre o tutor indicado no existe');
  }
  return obtenerPorId(id);
}

async function eliminar(id) {
  try {
    const { rowCount } = await pool.query('DELETE FROM nino WHERE id = $1', [id]);
    if (rowCount === 0) {
      throw crearError(404, 'Niño no encontrado');
    }
  } catch (error) {
    // 23503 = llave foranea: tiene historial que depende de el
    if (error.code === '23503') {
      throw crearError(
        409,
        'No se puede eliminar: el niño tiene registros de crecimiento, vacunas, alertas o carnet asociados'
      );
    }
    throw error;
  }
}

module.exports = { listar, obtenerPorId, obtenerEsquema, crear, actualizar, eliminar };
