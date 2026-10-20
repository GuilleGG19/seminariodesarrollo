// Logica de las vacunaciones. Aqui viven las consultas SQL.
//
// Cada fila de la tabla vacunacion es UNA DOSIS de una vacuna para un nino:
//   - fecha_aplicada: cuando se aplico (null si todavia no)
//   - proxima_dosis : fecha en que toca la siguiente aplicacion. En una dosis
//                     pendiente es su propia fecha programada; en una dosis ya
//                     aplicada es la fecha de la dosis que sigue.
//   - estado: completa (tiene fecha_aplicada) | atrasada (no aplicada y su fecha
//             ya paso) | pendiente (no aplicada y su fecha aun no llega)
const { pool } = require('../config/db');
const { hoyGuatemala } = require('../utils/fechas');

const crearError = (status, mensaje) => Object.assign(new Error(mensaje), { status });

const HOY_SQL = `(now() at time zone 'America/Guatemala')::date`;

// El estado se recalcula SIEMPRE al consultar, asi nunca queda desactualizado
// (por ejemplo, una dosis "pendiente" que ayer se volvio "atrasada").
const ESTADO_SQL = `CASE
    WHEN v.fecha_aplicada IS NOT NULL THEN 'completa'
    WHEN v.proxima_dosis < ${HOY_SQL} THEN 'atrasada'
    ELSE 'pendiente'
  END`;

const SELECT_VACUNACION = `
  SELECT v.id, v.nino_id, n.nombre AS nino,
         v.vacuna_id, va.nombre AS vacuna, va.dosis_total,
         v.numero_dosis, v.fecha_aplicada, v.proxima_dosis,
         ${ESTADO_SQL} AS estado
  FROM vacunacion v
  JOIN nino n ON n.id = v.nino_id
  JOIN vacuna va ON va.id = v.vacuna_id`;

// Estado que se guarda en la columna al escribir (se compara texto AAAA-MM-DD)
function calcularEstado(fechaAplicada, proximaDosis) {
  if (fechaAplicada) return 'completa';
  return proximaDosis < hoyGuatemala() ? 'atrasada' : 'pendiente';
}

async function listar({ ninoId, vacunaId, estado }) {
  const { rows } = await pool.query(
    `SELECT * FROM (${SELECT_VACUNACION}) AS t
     WHERE ($1::uuid IS NULL OR t.nino_id = $1)
       AND ($2::uuid IS NULL OR t.vacuna_id = $2)
       AND ($3::text IS NULL OR t.estado = $3)
     ORDER BY t.nino, t.vacuna, t.numero_dosis`,
    [ninoId || null, vacunaId || null, estado || null]
  );
  return rows;
}

async function obtenerPorId(id) {
  const { rows } = await pool.query(`${SELECT_VACUNACION} WHERE v.id = $1`, [id]);
  if (!rows[0]) {
    throw crearError(404, 'Registro de vacunación no encontrado');
  }
  return rows[0];
}

// Reglas que dependen de datos del nino y de la vacuna
function validarReglas({ numeroDosis, fechaAplicada, proximaDosis, fechaNacimiento, dosisTotal }) {
  if (numeroDosis > dosisTotal) {
    throw crearError(400, `La vacuna tiene ${dosisTotal} dosis; la dosis ${numeroDosis} no existe`);
  }
  if (fechaAplicada && fechaAplicada < fechaNacimiento) {
    throw crearError(400, 'La fecha de aplicación no puede ser anterior al nacimiento del niño');
  }
  if (fechaAplicada && proximaDosis && numeroDosis >= dosisTotal) {
    throw crearError(400, 'Es la última dosis de esta vacuna: no puede tener próxima dosis');
  }
}

// Registra una dosis:
//  - con fecha_aplicada: la dosis se aplico. Si estaba programada, se completa.
//    Si ademas viene proxima_dosis, se programa automaticamente la dosis siguiente.
//  - sin fecha_aplicada: se programa la dosis (proxima_dosis es su fecha).
async function crear({ nino_id, vacuna_id, numero_dosis, fecha_aplicada, proxima_dosis }) {
  const nino = await pool.query('SELECT fecha_nacimiento FROM nino WHERE id = $1', [nino_id]);
  if (!nino.rows[0]) {
    throw crearError(400, 'El niño indicado no existe');
  }
  const vacuna = await pool.query('SELECT dosis_total FROM vacuna WHERE id = $1', [vacuna_id]);
  if (!vacuna.rows[0]) {
    throw crearError(400, 'La vacuna indicada no existe');
  }

  validarReglas({
    numeroDosis: numero_dosis,
    fechaAplicada: fecha_aplicada,
    proximaDosis: proxima_dosis,
    fechaNacimiento: nino.rows[0].fecha_nacimiento,
    dosisTotal: vacuna.rows[0].dosis_total,
  });

  // Transaccion: o se guardan las dos filas (dosis aplicada + siguiente) o ninguna
  const client = await pool.connect();
  let id;
  try {
    await client.query('BEGIN');

    if (fecha_aplicada) {
      // Si la dosis ya existia pendiente se actualiza; si ya estaba aplicada, no devuelve fila
      const { rows } = await client.query(
        `INSERT INTO vacunacion (nino_id, vacuna_id, numero_dosis, fecha_aplicada, proxima_dosis, estado)
         VALUES ($1, $2, $3, $4, $5, 'completa')
         ON CONFLICT (nino_id, vacuna_id, numero_dosis)
         DO UPDATE SET fecha_aplicada = EXCLUDED.fecha_aplicada,
                       proxima_dosis = EXCLUDED.proxima_dosis,
                       estado = 'completa'
         WHERE vacunacion.fecha_aplicada IS NULL
         RETURNING id`,
        [nino_id, vacuna_id, numero_dosis, fecha_aplicada, proxima_dosis]
      );
      if (rows.length === 0) {
        throw crearError(409, 'Esa dosis ya fue registrada como aplicada');
      }
      id = rows[0].id;

      // Programar la dosis siguiente (si todavia no se ha aplicado)
      if (proxima_dosis) {
        await client.query(
          `INSERT INTO vacunacion (nino_id, vacuna_id, numero_dosis, fecha_aplicada, proxima_dosis, estado)
           VALUES ($1, $2, $3, NULL, $4, $5)
           ON CONFLICT (nino_id, vacuna_id, numero_dosis)
           DO UPDATE SET proxima_dosis = EXCLUDED.proxima_dosis, estado = EXCLUDED.estado
           WHERE vacunacion.fecha_aplicada IS NULL`,
          [nino_id, vacuna_id, numero_dosis + 1, proxima_dosis, calcularEstado(null, proxima_dosis)]
        );
      }
    } else {
      const { rows } = await client.query(
        `INSERT INTO vacunacion (nino_id, vacuna_id, numero_dosis, fecha_aplicada, proxima_dosis, estado)
         VALUES ($1, $2, $3, NULL, $4, $5)
         RETURNING id`,
        [nino_id, vacuna_id, numero_dosis, proxima_dosis, calcularEstado(null, proxima_dosis)]
      );
      id = rows[0].id;
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    // 23505 = ya existe esa dosis (violacion del UNIQUE nino + vacuna + dosis)
    if (error.code === '23505') {
      throw crearError(409, 'Ya existe un registro de esa dosis para este niño');
    }
    throw error;
  } finally {
    client.release();
  }

  return obtenerPorId(id);
}

// Corrige las fechas de una dosis. El nino, la vacuna y el numero de dosis no cambian.
async function actualizar(id, { fecha_aplicada, proxima_dosis }) {
  const { rows } = await pool.query(
    `SELECT v.numero_dosis, n.fecha_nacimiento, va.dosis_total
     FROM vacunacion v
     JOIN nino n ON n.id = v.nino_id
     JOIN vacuna va ON va.id = v.vacuna_id
     WHERE v.id = $1`,
    [id]
  );
  if (!rows[0]) {
    throw crearError(404, 'Registro de vacunación no encontrado');
  }

  validarReglas({
    numeroDosis: rows[0].numero_dosis,
    fechaAplicada: fecha_aplicada,
    proximaDosis: proxima_dosis,
    fechaNacimiento: rows[0].fecha_nacimiento,
    dosisTotal: rows[0].dosis_total,
  });

  await pool.query(
    `UPDATE vacunacion
     SET fecha_aplicada = $1, proxima_dosis = $2, estado = $3
     WHERE id = $4`,
    [fecha_aplicada, proxima_dosis, calcularEstado(fecha_aplicada, proxima_dosis), id]
  );
  return obtenerPorId(id);
}

async function eliminar(id) {
  const { rowCount } = await pool.query('DELETE FROM vacunacion WHERE id = $1', [id]);
  if (rowCount === 0) {
    throw crearError(404, 'Registro de vacunación no encontrado');
  }
}

module.exports = { listar, obtenerPorId, crear, actualizar, eliminar };
