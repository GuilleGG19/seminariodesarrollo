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
const { consultar } = require('../utils/paginacion');
const alertaService = require('./alerta.service');

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

// "paginacion" es opcional: sin ella se devuelven todas las filas (uso interno)
async function listar({ ninoId, vacunaId, estado }, paginacion) {
  return consultar(
    pool,
    {
      sql: `SELECT * FROM (${SELECT_VACUNACION}) AS x
            WHERE ($1::uuid IS NULL OR x.nino_id = $1)
              AND ($2::uuid IS NULL OR x.vacuna_id = $2)
              AND ($3::text IS NULL OR x.estado = $3)`,
      params: [ninoId || null, vacunaId || null, estado || null],
      orden: 't.nino, t.vacuna, t.numero_dosis',
    },
    paginacion
  );
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

// Dosis anterior y siguiente de la misma vacuna para el mismo nino
async function dosisVecinas(ejecutor, ninoId, vacunaId, numeroDosis) {
  const { rows } = await ejecutor.query(
    `SELECT numero_dosis, fecha_aplicada
     FROM vacunacion
     WHERE nino_id = $1 AND vacuna_id = $2 AND numero_dosis IN ($3::int - 1, $3::int + 1)`,
    [ninoId, vacunaId, numeroDosis]
  );
  return {
    anterior: rows.find((r) => r.numero_dosis === numeroDosis - 1) || null,
    siguiente: rows.find((r) => r.numero_dosis === numeroDosis + 1) || null,
  };
}

// Las dosis deben seguir su orden:
//  - para aplicar la dosis N, la dosis N-1 debe estar aplicada en una fecha igual o anterior
//  - para programar la dosis N, la dosis N-1 debe existir (aplicada o programada)
//  - si la dosis N+1 ya se aplico, la dosis N debe estar aplicada en una fecha igual o anterior
function validarOrden({ numeroDosis, fechaAplicada, anterior, siguiente }) {
  if (numeroDosis > 1) {
    if (!anterior) {
      throw crearError(400, `Primero debes registrar la dosis ${numeroDosis - 1} de esta vacuna`);
    }
    if (fechaAplicada) {
      if (!anterior.fecha_aplicada) {
        throw crearError(400, `La dosis ${numeroDosis - 1} todavía no está aplicada`);
      }
      if (anterior.fecha_aplicada > fechaAplicada) {
        throw crearError(
          400,
          `La fecha de aplicación no puede ser anterior a la de la dosis ${numeroDosis - 1} (${anterior.fecha_aplicada})`
        );
      }
    }
  }
  if (siguiente && siguiente.fecha_aplicada) {
    if (!fechaAplicada) {
      throw crearError(
        409,
        `La dosis ${numeroDosis + 1} ya está aplicada: esta dosis debe tener fecha de aplicación`
      );
    }
    if (fechaAplicada > siguiente.fecha_aplicada) {
      throw crearError(
        400,
        `La fecha de aplicación no puede ser posterior a la de la dosis ${numeroDosis + 1} (${siguiente.fecha_aplicada})`
      );
    }
  }
}

// Programa (o reprograma) la dosis siguiente si todavia no se aplico
async function programarSiguiente(client, { ninoId, vacunaId, numeroDosis, fecha }) {
  await client.query(
    `INSERT INTO vacunacion (nino_id, vacuna_id, numero_dosis, fecha_aplicada, proxima_dosis, estado)
     VALUES ($1, $2, $3, NULL, $4, $5)
     ON CONFLICT (nino_id, vacuna_id, numero_dosis)
     DO UPDATE SET proxima_dosis = EXCLUDED.proxima_dosis, estado = EXCLUDED.estado
     WHERE vacunacion.fecha_aplicada IS NULL`,
    [ninoId, vacunaId, numeroDosis + 1, fecha, calcularEstado(null, fecha)]
  );
}

// Ejecuta "trabajo" dentro de una transaccion
async function enTransaccion(trabajo) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const resultado = await trabajo(client);
    await client.query('COMMIT');
    return resultado;
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
  const id = await enTransaccion(async (client) => {
    const vecinas = await dosisVecinas(client, nino_id, vacuna_id, numero_dosis);
    validarOrden({ numeroDosis: numero_dosis, fechaAplicada: fecha_aplicada, ...vecinas });

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
      if (proxima_dosis) {
        await programarSiguiente(client, {
          ninoId: nino_id,
          vacunaId: vacuna_id,
          numeroDosis: numero_dosis,
          fecha: proxima_dosis,
        });
      }
      return rows[0].id;
    }

    const { rows } = await client.query(
      `INSERT INTO vacunacion (nino_id, vacuna_id, numero_dosis, fecha_aplicada, proxima_dosis, estado)
       VALUES ($1, $2, $3, NULL, $4, $5)
       RETURNING id`,
      [nino_id, vacuna_id, numero_dosis, proxima_dosis, calcularEstado(null, proxima_dosis)]
    );
    return rows[0].id;
  });

  await alertaService.revisarNino(nino_id);
  return obtenerPorId(id);
}

// Corrige las fechas de una dosis. El nino, la vacuna y el numero de dosis no cambian.
// Si la dosis queda aplicada y trae proxima_dosis, se programa la dosis siguiente.
async function actualizar(id, { fecha_aplicada, proxima_dosis }) {
  const { rows } = await pool.query(
    `SELECT v.nino_id, v.vacuna_id, v.numero_dosis, n.fecha_nacimiento, va.dosis_total
     FROM vacunacion v
     JOIN nino n ON n.id = v.nino_id
     JOIN vacuna va ON va.id = v.vacuna_id
     WHERE v.id = $1`,
    [id]
  );
  const actual = rows[0];
  if (!actual) {
    throw crearError(404, 'Registro de vacunación no encontrado');
  }

  validarReglas({
    numeroDosis: actual.numero_dosis,
    fechaAplicada: fecha_aplicada,
    proximaDosis: proxima_dosis,
    fechaNacimiento: actual.fecha_nacimiento,
    dosisTotal: actual.dosis_total,
  });

  await enTransaccion(async (client) => {
    const vecinas = await dosisVecinas(client, actual.nino_id, actual.vacuna_id, actual.numero_dosis);
    validarOrden({ numeroDosis: actual.numero_dosis, fechaAplicada: fecha_aplicada, ...vecinas });

    await client.query(
      `UPDATE vacunacion
       SET fecha_aplicada = $1, proxima_dosis = $2, estado = $3
       WHERE id = $4`,
      [fecha_aplicada, proxima_dosis, calcularEstado(fecha_aplicada, proxima_dosis), id]
    );
    if (fecha_aplicada && proxima_dosis) {
      await programarSiguiente(client, {
        ninoId: actual.nino_id,
        vacunaId: actual.vacuna_id,
        numeroDosis: actual.numero_dosis,
        fecha: proxima_dosis,
      });
    }
  });

  await alertaService.revisarNino(actual.nino_id);
  return obtenerPorId(id);
}

// No se puede eliminar una dosis si la siguiente ya esta registrada (romperia el orden)
async function eliminar(id) {
  const { rows } = await pool.query(
    `DELETE FROM vacunacion v
     WHERE v.id = $1
       AND NOT EXISTS (
         SELECT 1 FROM vacunacion s
         WHERE s.nino_id = v.nino_id AND s.vacuna_id = v.vacuna_id
           AND s.numero_dosis = v.numero_dosis + 1
       )
     RETURNING v.nino_id`,
    [id]
  );
  if (rows.length === 0) {
    const existe = await pool.query('SELECT numero_dosis FROM vacunacion WHERE id = $1', [id]);
    if (!existe.rows[0]) {
      throw crearError(404, 'Registro de vacunación no encontrado');
    }
    throw crearError(
      409,
      `No se puede eliminar: primero elimina la dosis ${existe.rows[0].numero_dosis + 1} de esta vacuna`
    );
  }
  await alertaService.revisarNino(rows[0].nino_id);
}

module.exports = { listar, obtenerPorId, crear, actualizar, eliminar };
