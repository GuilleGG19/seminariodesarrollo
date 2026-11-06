// Logica de los registros de crecimiento (peso y talla). Aqui viven las consultas SQL.
const { pool } = require('../config/db');
const percentilesService = require('./percentiles.service');
const alertaService = require('./alerta.service');
const { consultar } = require('../utils/paginacion');

const crearError = (status, mensaje) => Object.assign(new Error(mensaje), { status });

// Edad en meses cumplidos al momento de la medicion
const EDAD_MESES = `(
  extract(year from age(r.fecha_medicion, n.fecha_nacimiento)) * 12 +
  extract(month from age(r.fecha_medicion, n.fecha_nacimiento))
)::int`;

// Consulta base. Los decimales se convierten con ::float para que lleguen
// como numeros (y no como texto) al cliente.
const SELECT_REGISTRO = `
  SELECT r.id, r.nino_id, n.nombre AS nino,
         r.peso_kg::float AS peso_kg, r.talla_cm::float AS talla_cm,
         r.fecha_medicion,
         (r.fecha_medicion - n.fecha_nacimiento) AS edad_dias,
         ${EDAD_MESES} AS edad_meses,
         r.percentil_peso::float AS percentil_peso,
         r.percentil_talla::float AS percentil_talla
  FROM registro_crecimiento r
  JOIN nino n ON n.id = r.nino_id`;

// Agrega las advertencias a la respuesta solo si hay alguna
const conAdvertencias = (registro, advertencias) =>
  advertencias.length > 0 ? { ...registro, advertencias } : registro;

async function listar({ ninoId }, paginacion) {
  return consultar(
    pool,
    {
      sql: `${SELECT_REGISTRO} WHERE ($1::uuid IS NULL OR r.nino_id = $1)`,
      params: [ninoId || null],
      orden: 't.fecha_medicion DESC, t.id',
    },
    paginacion
  );
}

async function obtenerPorId(id) {
  const { rows } = await pool.query(`${SELECT_REGISTRO} WHERE r.id = $1`, [id]);
  if (!rows[0]) {
    throw crearError(404, 'Registro de crecimiento no encontrado');
  }
  return rows[0];
}

// Datos del nino necesarios para calcular: sexo y edad en dias en la fecha de la medicion
async function datosNino(ninoId, fechaMedicion) {
  const { rows } = await pool.query(
    `SELECT sexo, ($2::date - fecha_nacimiento) AS edad_dias
     FROM nino
     WHERE id = $1`,
    [ninoId, fechaMedicion]
  );
  if (!rows[0]) {
    throw crearError(400, 'El niño indicado no existe');
  }
  if (rows[0].edad_dias < 0) {
    throw crearError(400, 'La fecha de medición no puede ser anterior al nacimiento del niño');
  }
  return rows[0];
}

async function crear({ nino_id, peso_kg, talla_cm, fecha_medicion }) {
  const nino = await datosNino(nino_id, fecha_medicion);
  const calculo = await percentilesService.calcular({
    sexo: nino.sexo,
    edadDias: nino.edad_dias,
    pesoKg: peso_kg,
    tallaCm: talla_cm,
  });

  const { rows } = await pool.query(
    `INSERT INTO registro_crecimiento
       (nino_id, peso_kg, talla_cm, fecha_medicion, percentil_peso, percentil_talla)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [nino_id, peso_kg, talla_cm, fecha_medicion, calculo.percentil_peso, calculo.percentil_talla]
  );

  await alertaService.revisarNino(nino_id);
  const registro = await obtenerPorId(rows[0].id);
  return conAdvertencias(registro, calculo.advertencias);
}

// Se pueden corregir peso, talla y fecha; el nino no cambia. Los percentiles se recalculan.
async function actualizar(id, { peso_kg, talla_cm, fecha_medicion }) {
  const existente = await pool.query('SELECT nino_id FROM registro_crecimiento WHERE id = $1', [id]);
  if (!existente.rows[0]) {
    throw crearError(404, 'Registro de crecimiento no encontrado');
  }
  const ninoId = existente.rows[0].nino_id;

  const nino = await datosNino(ninoId, fecha_medicion);
  const calculo = await percentilesService.calcular({
    sexo: nino.sexo,
    edadDias: nino.edad_dias,
    pesoKg: peso_kg,
    tallaCm: talla_cm,
  });

  await pool.query(
    `UPDATE registro_crecimiento
     SET peso_kg = $1, talla_cm = $2, fecha_medicion = $3,
         percentil_peso = $4, percentil_talla = $5
     WHERE id = $6`,
    [peso_kg, talla_cm, fecha_medicion, calculo.percentil_peso, calculo.percentil_talla, id]
  );

  await alertaService.revisarNino(ninoId);
  const registro = await obtenerPorId(id);
  return conAdvertencias(registro, calculo.advertencias);
}

async function eliminar(id) {
  const { rows } = await pool.query('DELETE FROM registro_crecimiento WHERE id = $1 RETURNING nino_id', [id]);
  if (rows.length === 0) {
    throw crearError(404, 'Registro de crecimiento no encontrado');
  }
  await alertaService.revisarNino(rows[0].nino_id);
}

// Datos para las graficas: mediciones del nino + curvas de referencia de la OMS
async function obtenerCurva(ninoId) {
  const { rows: filasNino } = await pool.query(
    'SELECT id, nombre, sexo, fecha_nacimiento FROM nino WHERE id = $1',
    [ninoId]
  );
  const nino = filasNino[0];
  if (!nino) {
    throw crearError(404, 'Niño no encontrado');
  }

  const { rows } = await pool.query(
    `${SELECT_REGISTRO}
     WHERE r.nino_id = $1
     ORDER BY r.fecha_medicion ASC`,
    [ninoId]
  );
  // Edad con decimales (en meses) para ubicar cada punto con precision en el eje X
  const mediciones = rows.map((fila) => ({
    ...fila,
    edad_meses_exacta: Math.round((fila.edad_dias / percentilesService.DIAS_POR_MES) * 100) / 100,
  }));

  const referencia = await percentilesService.curvasReferencia(nino.sexo);
  return { nino, mediciones, referencia };
}

module.exports = { listar, obtenerPorId, crear, actualizar, eliminar, obtenerCurva };
