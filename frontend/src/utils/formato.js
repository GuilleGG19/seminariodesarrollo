// Formatos de fecha, edad y numeros para mostrar en pantalla (es-GT).
const ZONA = 'America/Guatemala';
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

// Fecha de hoy en Guatemala, AAAA-MM-DD (para inputs type="date")
export const hoy = () => new Date().toLocaleDateString('en-CA', { timeZone: ZONA });

// "2026-01-15" -> "15 ene 2026". Se separa el texto para no sufrir cambios de zona horaria.
export function fecha(valor) {
  if (!valor) return '—';
  const [a, m, d] = String(valor).slice(0, 10).split('-').map(Number);
  if (!a || !m || !d) return '—';
  return `${d} ${MESES[m - 1]} ${a}`;
}

// Instante ISO -> "15 ene 2026, 14:30" en hora de Guatemala
export function fechaHora(valor) {
  if (!valor) return '—';
  return new Date(valor).toLocaleString('es-GT', {
    timeZone: ZONA,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Instante ISO -> "15 ene 2026" (dia en hora de Guatemala, sin la hora)
export function dia(valor) {
  if (!valor) return '—';
  return new Date(valor).toLocaleDateString('es-GT', { timeZone: ZONA, day: 'numeric', month: 'short', year: 'numeric' });
}

// 27 -> "2 años 3 meses"
export function edad(meses) {
  if (meses === null || meses === undefined) return '—';
  if (meses < 1) return 'Recién nacido';
  const anios = Math.floor(meses / 12);
  const resto = meses % 12;
  const partes = [];
  if (anios) partes.push(`${anios} ${anios === 1 ? 'año' : 'años'}`);
  if (resto) partes.push(`${resto} ${resto === 1 ? 'mes' : 'meses'}`);
  return partes.join(' ');
}

export const sexo = (s) => (s === 'F' ? 'Niña' : s === 'M' ? 'Niño' : '—');

export const numero = (n, decimales = 0) =>
  n === null || n === undefined
    ? '—'
    : Number(n).toLocaleString('es-GT', { minimumFractionDigits: decimales, maximumFractionDigits: decimales });

// Suma meses a una fecha AAAA-MM-DD (para sugerir la fecha de la proxima dosis)
export function sumarMeses(valor, meses) {
  const [a, m, d] = valor.split('-').map(Number);
  const f = new Date(Date.UTC(a, m - 1 + meses, d));
  return f.toISOString().slice(0, 10);
}

// Etiquetas de los tipos de alerta
export const TIPOS_ALERTA = {
  desnutricion: 'Peso bajo',
  sobrepeso: 'Sobrepeso',
  talla_baja: 'Talla baja',
  sin_registros: 'Sin control reciente',
  vacuna_atrasada: 'Vacunas atrasadas',
};
