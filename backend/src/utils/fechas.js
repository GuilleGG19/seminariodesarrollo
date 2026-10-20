// Utilidades de fechas compartidas por varios controladores.
const ZONA_HORARIA = 'America/Guatemala';

// Fecha de hoy en Guatemala con formato AAAA-MM-DD ("en-CA" usa ese formato)
const hoyGuatemala = () => new Date().toLocaleDateString('en-CA', { timeZone: ZONA_HORARIA });

// Comprueba que el texto sea una fecha AAAA-MM-DD real (rechaza 2025-02-30, por ejemplo)
function esFechaReal(valor) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const [anio, mes, dia] = valor.split('-').map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  return (
    fecha.getUTCFullYear() === anio &&
    fecha.getUTCMonth() === mes - 1 &&
    fecha.getUTCDate() === dia
  );
}

module.exports = { hoyGuatemala, esFechaReal };
