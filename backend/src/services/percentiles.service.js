// Percentiles OMS: busca los parametros L, M, S en la base y aplica la formula.
const { pool } = require('../config/db');
const { Z_CURVAS, calcularZ, valorDesdeZ, percentilDesdeZ } = require('./lms.service');

const DIAS_POR_MES = 30.4375;
const EDAD_MAX_DIAS = 1856; // las tablas de la OMS cubren de 0 a 1856 dias (unos 5 anios)

// Limites de la OMS para marcar valores biologicamente improbables
const LIMITES_Z = {
  peso_edad: { min: -6, max: 5 },
  talla_edad: { min: -6, max: 6 },
};

// Calcula los percentiles de peso y talla de una medicion.
// Devuelve { percentil_peso, percentil_talla, advertencias }.
async function calcular({ sexo, edadDias, pesoKg, tallaCm }) {
  const resultado = { percentil_peso: null, percentil_talla: null, advertencias: [] };

  // Fuera del rango de las tablas no se calcula nada (se guarda null)
  if (edadDias < 0 || edadDias > EDAD_MAX_DIAS) {
    resultado.advertencias.push(
      'No se calcularon percentiles: la edad está fuera del rango de las tablas de la OMS (0 a 5 años)'
    );
    return resultado;
  }

  const { rows } = await pool.query(
    `SELECT indicador, l::float AS l, m::float AS m, s::float AS s
     FROM oms_referencia
     WHERE sexo = $1 AND edad_dias = $2`,
    [sexo, edadDias]
  );
  const referencia = Object.fromEntries(rows.map((fila) => [fila.indicador, fila]));

  const evaluar = (indicador, valor, nombre) => {
    const ref = referencia[indicador];
    if (!ref) {
      throw new Error(`Falta el dato de referencia OMS (${indicador}, sexo ${sexo}, día ${edadDias})`);
    }
    const z = calcularZ(valor, ref.l, ref.m, ref.s);
    const limites = LIMITES_Z[indicador];
    if (z < limites.min || z > limites.max) {
      resultado.advertencias.push(
        `El ${nombre} parece biológicamente improbable para la edad (z = ${z.toFixed(1)}); verifica el dato`
      );
    }
    return percentilDesdeZ(z);
  };

  resultado.percentil_peso = evaluar('peso_edad', pesoKg, 'peso');
  resultado.percentil_talla = evaluar('talla_edad', tallaCm, 'talla');
  return resultado;
}

// Curvas de referencia de la OMS (percentiles 5, 25, 50, 75 y 95) mes a mes,
// para dibujarlas junto a las mediciones del nino.
async function curvasReferencia(sexo, hastaMeses = 60) {
  const dias = Array.from({ length: hastaMeses + 1 }, (_, mes) => Math.round(mes * DIAS_POR_MES));

  const { rows } = await pool.query(
    `SELECT indicador, edad_dias, l::float AS l, m::float AS m, s::float AS s
     FROM oms_referencia
     WHERE sexo = $1 AND edad_dias = ANY($2::int[])
     ORDER BY indicador, edad_dias`,
    [sexo, dias]
  );

  const curvas = { peso_edad: [], talla_edad: [] };
  for (const fila of rows) {
    const punto = { edad_meses: Math.round(fila.edad_dias / DIAS_POR_MES) };
    for (const [nombre, z] of Object.entries(Z_CURVAS)) {
      punto[nombre] = Math.round(valorDesdeZ(z, fila.l, fila.m, fila.s) * 100) / 100;
    }
    curvas[fila.indicador].push(punto);
  }
  return curvas;
}

module.exports = { DIAS_POR_MES, calcular, curvasReferencia };
