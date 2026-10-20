// Paginacion de listados: ?pagina=1&limite=50
// Las listas paginadas responden { datos, total, pagina, limite, total_paginas }.
const LIMITE_DEFECTO = 50;
const LIMITE_MAXIMO = 200;

// Lee "pagina" y "limite" de la query. Devuelve { paginacion } o { error }.
function leerPaginacion(query) {
  const leer = (valor, porDefecto) => {
    if (valor === undefined || valor === '') return porDefecto;
    const n = Number(valor);
    return Number.isInteger(n) ? n : NaN;
  };
  const pagina = leer(query.pagina, 1);
  const limite = leer(query.limite, LIMITE_DEFECTO);

  if (!(pagina >= 1)) {
    return { error: 'pagina debe ser un entero mayor o igual a 1' };
  }
  if (!(limite >= 1 && limite <= LIMITE_MAXIMO)) {
    return { error: `limite debe ser un entero entre 1 y ${LIMITE_MAXIMO}` };
  }
  return { paginacion: { pagina, limite, offset: (pagina - 1) * limite } };
}

// Ejecuta "sql" (sin ORDER BY) ordenado por "orden" (columnas de t).
// Sin paginacion devuelve todas las filas; con paginacion devuelve el sobre.
async function consultar(ejecutor, { sql, params, orden }, paginacion) {
  if (!paginacion) {
    const { rows } = await ejecutor.query(`SELECT t.* FROM (${sql}) t ORDER BY ${orden}`, params);
    return rows;
  }

  const n = params.length;
  const { rows } = await ejecutor.query(
    `SELECT t.*, count(*) OVER()::int AS total_filas
     FROM (${sql}) t
     ORDER BY ${orden}
     LIMIT $${n + 1} OFFSET $${n + 2}`,
    [...params, paginacion.limite, paginacion.offset]
  );

  let total = rows.length > 0 ? rows[0].total_filas : 0;
  if (rows.length === 0 && paginacion.offset > 0) {
    // Pagina fuera de rango: se cuenta aparte para informar el total real
    const conteo = await ejecutor.query(`SELECT count(*)::int AS total FROM (${sql}) t`, params);
    total = conteo.rows[0].total;
  }

  return {
    datos: rows.map(({ total_filas, ...fila }) => fila),
    total,
    pagina: paginacion.pagina,
    limite: paginacion.limite,
    total_paginas: Math.ceil(total / paginacion.limite),
  };
}

module.exports = { leerPaginacion, consultar, LIMITE_MAXIMO };
