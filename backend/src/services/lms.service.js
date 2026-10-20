// Calculo del puntaje Z y del percentil con el metodo LMS de la OMS.
// Son funciones puras: no usan la base de datos.
//
// Cada edad y sexo tiene tres parametros (tabla oms_referencia):
//   L = asimetria (Box-Cox), M = mediana, S = coeficiente de variacion.

// Puntajes Z de los percentiles que se dibujan en las curvas de crecimiento
const Z_CURVAS = {
  p5: -1.6448536,
  p25: -0.6744898,
  p50: 0,
  p75: 0.6744898,
  p95: 1.6448536,
};

// Z = ((X / M)^L - 1) / (L * S)      si L es distinto de 0
// Z = ln(X / M) / S                  si L es 0
function calcularZ(valor, l, m, s) {
  if (l === 0) return Math.log(valor / m) / s;
  return (Math.pow(valor / m, l) - 1) / (l * s);
}

// Operacion inversa: que valor (peso o talla) corresponde a un Z dado
function valorDesdeZ(z, l, m, s) {
  if (l === 0) return m * Math.exp(s * z);
  return m * Math.pow(1 + l * s * z, 1 / l);
}

// Funcion de error (Abramowitz y Stegun 7.1.26, error maximo 1.5e-7)
function erf(x) {
  const signo = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-ax * ax);
  return signo * y;
}

// Percentil (0 a 100, con 2 decimales) a partir de Z: es el area bajo la
// curva normal estandar a la izquierda de Z.
function percentilDesdeZ(z) {
  const p = 50 * (1 + erf(z / Math.SQRT2));
  return Math.round(p * 100) / 100;
}

module.exports = { Z_CURVAS, calcularZ, valorDesdeZ, percentilDesdeZ };
