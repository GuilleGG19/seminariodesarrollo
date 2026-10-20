// Reportes para el encargado del centro (seccion 3.9 del documento).
// Cada reporte devuelve la MISMA forma, para poder mostrarlo como JSON o exportarlo
// a PDF/Excel con el mismo codigo:
//   { titulo, subtitulo, columnas: [{ clave, titulo, ancho? }], filas: [ { clave: valor } ] }
const { pool } = require('../config/db');
const { hoyGuatemala } = require('../utils/fechas');
const { UMBRALES } = require('./alertaReglas.service');

const crearError = (status, mensaje) => Object.assign(new Error(mensaje), { status });

const HOY = `(now() at time zone 'America/Guatemala')::date`;

// Edad en meses cumplidos a una fecha dada
const edadMeses = (fecha, nacimiento) =>
  `(extract(year from age(${fecha}, ${nacimiento})) * 12 + extract(month from age(${fecha}, ${nacimiento})))::int`;

// Si se filtra por comunidad, se valida que exista y se devuelve su nombre
async function nombreComunidad(comunidadId) {
  if (!comunidadId) return null;
  const { rows } = await pool.query('SELECT nombre FROM comunidad WHERE id = $1', [comunidadId]);
  if (!rows[0]) throw crearError(404, 'Comunidad no encontrada');
  return rows[0].nombre;
}

const subtitulo = (comunidad, extra) =>
  [`Generado el ${hoyGuatemala()}`, comunidad ? `Comunidad: ${comunidad}` : 'Todas las comunidades', extra]
    .filter(Boolean)
    .join(' | ');

// ---------------------------------------------------------------------
// 1) Ninos con bajo peso, sobrepeso o vacunas incompletas
// ---------------------------------------------------------------------
const TIPOS_RIESGO = {
  bajo_peso: 'Niños con bajo peso',
  sobrepeso: 'Niños con sobrepeso',
  vacunas_incompletas: 'Niños con vacunas incompletas',
};

async function ninosEnRiesgo({ tipo, comunidadId }) {
  if (!TIPOS_RIESGO[tipo]) {
    throw crearError(400, `tipo debe ser uno de: ${Object.keys(TIPOS_RIESGO).join(', ')}`);
  }
  const comunidad = await nombreComunidad(comunidadId);

  if (tipo === 'vacunas_incompletas') {
    // Un nino aparece si tiene al menos una dosis registrada que aun no se aplica
    const { rows } = await pool.query(
      `SELECT n.nombre AS nino, c.nombre AS comunidad,
              ${edadMeses(HOY, 'n.fecha_nacimiento')} AS edad_meses,
              count(*)::int AS dosis_faltantes,
              (count(*) FILTER (WHERE v.proxima_dosis < ${HOY}))::int AS dosis_atrasadas,
              string_agg(va.nombre || ' (dosis ' || v.numero_dosis || ')', ', '
                         ORDER BY va.nombre, v.numero_dosis) AS detalle,
              p.nombre_completo AS padre, p.telefono
       FROM vacunacion v
       JOIN nino n ON n.id = v.nino_id
       JOIN comunidad c ON c.id = n.comunidad_id
       JOIN padre p ON p.id = n.padre_id
       JOIN vacuna va ON va.id = v.vacuna_id
       WHERE v.fecha_aplicada IS NULL
         AND ($1::uuid IS NULL OR n.comunidad_id = $1)
       GROUP BY n.id, c.id, p.id
       ORDER BY dosis_atrasadas DESC, n.nombre`,
      [comunidadId || null]
    );
    return {
      titulo: TIPOS_RIESGO[tipo],
      subtitulo: subtitulo(comunidad),
      columnas: [
        { clave: 'nino', titulo: 'Niño', ancho: 2 },
        { clave: 'comunidad', titulo: 'Comunidad', ancho: 2 },
        { clave: 'edad_meses', titulo: 'Edad (meses)', ancho: 1 },
        { clave: 'dosis_faltantes', titulo: 'Dosis faltantes', ancho: 1 },
        { clave: 'dosis_atrasadas', titulo: 'Atrasadas', ancho: 1 },
        { clave: 'detalle', titulo: 'Detalle', ancho: 4 },
        { clave: 'padre', titulo: 'Padre/Madre', ancho: 2 },
        { clave: 'telefono', titulo: 'Teléfono', ancho: 1.5 },
      ],
      filas: rows,
    };
  }

  // Bajo peso / sobrepeso: segun el ULTIMO registro de crecimiento de cada nino
  const condicion = tipo === 'bajo_peso' ? 'u.percentil_peso < $2' : 'u.percentil_peso > $2';
  const limite = tipo === 'bajo_peso' ? UMBRALES.percentilBajoPreventiva : UMBRALES.percentilAltoPreventiva;
  const { rows } = await pool.query(
    `SELECT n.nombre AS nino, c.nombre AS comunidad,
            ${edadMeses(HOY, 'n.fecha_nacimiento')} AS edad_meses,
            u.fecha_medicion, u.peso_kg::float AS peso_kg, u.talla_cm::float AS talla_cm,
            u.percentil_peso::float AS percentil_peso,
            p.nombre_completo AS padre, p.telefono
     FROM nino n
     JOIN comunidad c ON c.id = n.comunidad_id
     JOIN padre p ON p.id = n.padre_id
     JOIN LATERAL (
       SELECT r.fecha_medicion, r.peso_kg, r.talla_cm, r.percentil_peso
       FROM registro_crecimiento r
       WHERE r.nino_id = n.id
       ORDER BY r.fecha_medicion DESC, r.id DESC
       LIMIT 1
     ) u ON true
     WHERE ${condicion}
       AND ($1::uuid IS NULL OR n.comunidad_id = $1)
     ORDER BY u.percentil_peso ${tipo === 'bajo_peso' ? 'ASC' : 'DESC'}, n.nombre`,
    [comunidadId || null, limite]
  );
  return {
    titulo: TIPOS_RIESGO[tipo],
    subtitulo: subtitulo(
      comunidad,
      `Último registro con percentil de peso ${tipo === 'bajo_peso' ? 'menor a' : 'mayor a'} ${limite}`
    ),
    columnas: [
      { clave: 'nino', titulo: 'Niño', ancho: 2 },
      { clave: 'comunidad', titulo: 'Comunidad', ancho: 2 },
      { clave: 'edad_meses', titulo: 'Edad (meses)', ancho: 1 },
      { clave: 'fecha_medicion', titulo: 'Fecha medición', ancho: 1.5 },
      { clave: 'peso_kg', titulo: 'Peso (kg)', ancho: 1 },
      { clave: 'talla_cm', titulo: 'Talla (cm)', ancho: 1 },
      { clave: 'percentil_peso', titulo: 'Percentil peso', ancho: 1 },
      { clave: 'padre', titulo: 'Padre/Madre', ancho: 2 },
      { clave: 'telefono', titulo: 'Teléfono', ancho: 1.5 },
    ],
    filas: rows,
  };
}

// ---------------------------------------------------------------------
// 2) Cobertura de vacunacion por comunidad
// Para cada vacuna se toman los ninos que ya tienen la edad recomendada de la
// primera dosis. De ellos se cuentan los que ya recibieron al menos una dosis
// y los que completaron todas las dosis de la vacuna.
// ---------------------------------------------------------------------
async function coberturaVacunacion({ comunidadId, vacunaId }) {
  const comunidad = await nombreComunidad(comunidadId);
  const { rows } = await pool.query(
    `WITH pares AS (
       SELECT n.comunidad_id, va.id AS vacuna_id, va.nombre AS vacuna, va.dosis_total,
              (count(v.id) FILTER (WHERE v.fecha_aplicada IS NOT NULL))::int AS aplicadas
       FROM nino n
       JOIN vacuna va ON ${edadMeses(HOY, 'n.fecha_nacimiento')} >= va.edad_recomendada_meses
       LEFT JOIN vacunacion v ON v.nino_id = n.id AND v.vacuna_id = va.id
       WHERE ($1::uuid IS NULL OR n.comunidad_id = $1)
         AND ($2::uuid IS NULL OR va.id = $2)
       GROUP BY n.id, va.id
     )
     SELECT c.nombre AS comunidad, p.vacuna,
            count(*)::int AS ninos_elegibles,
            (count(*) FILTER (WHERE p.aplicadas >= 1))::int AS con_primera_dosis,
            (count(*) FILTER (WHERE p.aplicadas >= p.dosis_total))::int AS esquema_completo,
            round(100.0 * count(*) FILTER (WHERE p.aplicadas >= 1) / count(*), 1)::float AS pct_primera_dosis,
            round(100.0 * count(*) FILTER (WHERE p.aplicadas >= p.dosis_total) / count(*), 1)::float AS pct_esquema_completo
     FROM pares p
     JOIN comunidad c ON c.id = p.comunidad_id
     GROUP BY c.id, c.nombre, p.vacuna_id, p.vacuna
     ORDER BY c.nombre, p.vacuna`,
    [comunidadId || null, vacunaId || null]
  );
  return {
    titulo: 'Cobertura de vacunación por comunidad',
    subtitulo: subtitulo(comunidad, 'Niños que ya tienen la edad recomendada de cada vacuna'),
    columnas: [
      { clave: 'comunidad', titulo: 'Comunidad', ancho: 2.5 },
      { clave: 'vacuna', titulo: 'Vacuna', ancho: 2.5 },
      { clave: 'ninos_elegibles', titulo: 'Niños elegibles', ancho: 1 },
      { clave: 'con_primera_dosis', titulo: 'Con 1ª dosis', ancho: 1 },
      { clave: 'esquema_completo', titulo: 'Esquema completo', ancho: 1 },
      { clave: 'pct_primera_dosis', titulo: '% 1ª dosis', ancho: 1 },
      { clave: 'pct_esquema_completo', titulo: '% esquema completo', ancho: 1 },
    ],
    filas: rows,
  };
}

// ---------------------------------------------------------------------
// 3) Crecimiento promedio por region
// El sistema no tiene una tabla de regiones: la region es la comunidad.
// Se agrupan todas las mediciones por comunidad y grupo de edad (edad al medir).
// ---------------------------------------------------------------------
async function crecimientoPromedio({ comunidadId }) {
  const comunidad = await nombreComunidad(comunidadId);
  const { rows } = await pool.query(
    `WITH m AS (
       SELECT c.nombre AS comunidad, r.nino_id, r.peso_kg, r.talla_cm, r.percentil_peso,
              ${edadMeses('r.fecha_medicion', 'n.fecha_nacimiento')} AS edad_meses
       FROM registro_crecimiento r
       JOIN nino n ON n.id = r.nino_id
       JOIN comunidad c ON c.id = n.comunidad_id
       WHERE ($1::uuid IS NULL OR n.comunidad_id = $1)
     )
     SELECT comunidad,
            CASE WHEN edad_meses < 12 THEN '0 a 11 meses'
                 WHEN edad_meses < 24 THEN '12 a 23 meses'
                 WHEN edad_meses < 36 THEN '24 a 35 meses'
                 WHEN edad_meses < 48 THEN '36 a 47 meses'
                 ELSE '48 meses o más' END AS grupo_edad,
            count(DISTINCT nino_id)::int AS ninos,
            count(*)::int AS mediciones,
            round(avg(peso_kg), 2)::float AS peso_promedio_kg,
            round(avg(talla_cm), 1)::float AS talla_promedio_cm,
            round(avg(percentil_peso), 1)::float AS percentil_peso_promedio
     FROM m
     GROUP BY comunidad, grupo_edad
     ORDER BY comunidad, min(edad_meses)`,
    [comunidadId || null]
  );
  return {
    titulo: 'Crecimiento promedio por región',
    subtitulo: subtitulo(comunidad, 'Cada comunidad se toma como una región'),
    columnas: [
      { clave: 'comunidad', titulo: 'Comunidad', ancho: 2.5 },
      { clave: 'grupo_edad', titulo: 'Grupo de edad', ancho: 2 },
      { clave: 'ninos', titulo: 'Niños', ancho: 1 },
      { clave: 'mediciones', titulo: 'Mediciones', ancho: 1 },
      { clave: 'peso_promedio_kg', titulo: 'Peso promedio (kg)', ancho: 1.5 },
      { clave: 'talla_promedio_cm', titulo: 'Talla promedio (cm)', ancho: 1.5 },
      { clave: 'percentil_peso_promedio', titulo: 'Percentil peso promedio', ancho: 1.5 },
    ],
    filas: rows,
  };
}

module.exports = { TIPOS_RIESGO, ninosEnRiesgo, coberturaVacunacion, crecimientoPromedio };
