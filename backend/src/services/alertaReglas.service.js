// Reglas de negocio de las alertas (seccion 3.5 del documento del proyecto).
// Son funciones puras: reciben datos ya consultados y devuelven las alertas que
// corresponden. No usan la base de datos, asi que son faciles de entender y probar.

const DIAS_POR_MES = 30.4375;

// Todos los umbrales estan aqui: para cambiar una regla, se cambia un numero.
const UMBRALES = {
  // Percentil de peso para la edad (OMS)
  percentilBajoPreventiva: 5, // menor a 5  -> posible desnutricion (preventiva)
  percentilBajoCritica: 1, //    menor a 1  -> critica
  percentilAltoPreventiva: 95, // mayor a 95 -> posible sobrepeso (preventiva)
  percentilAltoCritica: 99, //   mayor a 99 -> critica

  // "No hay registros en X meses" (frecuencias de la seccion 6: mensual y trimestral,
  // mas un mes de margen)
  edadCambioFrecuenciaMeses: 24, // hasta esta edad el control es mensual
  edadMaximaControlMeses: 60, //    a partir de los 5 anios ya no se evalua
  mesesSinRegistroMenor: 2, //      menores de 2 anios
  mesesSinRegistroMayor: 4, //      de 2 a 5 anios
  // Es critica cuando se supera el doble del plazo

  // Vacunas
  diasAtrasoCritico: 30, // dosis atrasada 30 dias o mas -> critica
};

const articulo = (sexo) => (sexo === 'F' ? 'La niña' : 'El niño');
const textoMeses = (n) => `${n} ${n === 1 ? 'mes' : 'meses'}`;
const redondear1 = (n) => Math.round(n * 10) / 10;

// Evalua el ultimo percentil de peso y el tiempo sin mediciones de un nino.
// nino = { nino_id, nombre, sexo, edad_meses, percentil_peso, ultima_medicion, dias_sin_registro }
function evaluarCrecimiento(nino) {
  const alertas = [];
  const quien = `${articulo(nino.sexo)} ${nino.nombre}`;

  // 1) Peso bajo o alto para la edad
  if (nino.percentil_peso !== null && nino.percentil_peso !== undefined) {
    const p = Number(nino.percentil_peso);

    if (p < UMBRALES.percentilBajoPreventiva) {
      alertas.push({
        nino_id: nino.nino_id,
        tipo: 'desnutricion',
        nivel: p < UMBRALES.percentilBajoCritica ? 'critica' : 'preventiva',
        mensaje: `${quien} presenta peso bajo para su edad (percentil ${redondear1(p)}). Se recomienda acudir al centro de salud.`,
      });
    } else if (p > UMBRALES.percentilAltoPreventiva) {
      alertas.push({
        nino_id: nino.nino_id,
        tipo: 'sobrepeso',
        nivel: p > UMBRALES.percentilAltoCritica ? 'critica' : 'preventiva',
        mensaje: `${quien} presenta peso alto para su edad (percentil ${redondear1(p)}). Se recomienda acudir al centro de salud.`,
      });
    }
  }

  // 2) Demasiado tiempo sin mediciones (solo en el rango de edad del control de crecimiento)
  if (nino.edad_meses < UMBRALES.edadMaximaControlMeses) {
    const limiteMeses =
      nino.edad_meses < UMBRALES.edadCambioFrecuenciaMeses
        ? UMBRALES.mesesSinRegistroMenor
        : UMBRALES.mesesSinRegistroMayor;
    const limiteDias = limiteMeses * DIAS_POR_MES;

    if (nino.dias_sin_registro > limiteDias) {
      const meses = Math.floor(nino.dias_sin_registro / DIAS_POR_MES);
      const detalle = nino.ultima_medicion
        ? `no tiene mediciones de peso y talla desde hace ${textoMeses(meses)}`
        : `no tiene ninguna medición de peso y talla registrada (nació hace ${textoMeses(meses)})`;

      alertas.push({
        nino_id: nino.nino_id,
        tipo: 'sin_registros',
        nivel: nino.dias_sin_registro >= 2 * limiteDias ? 'critica' : 'preventiva',
        mensaje: `${quien} ${detalle}. Se recomienda acudir al centro de salud para su control.`,
      });
    }
  }

  return alertas;
}

// Evalua las dosis atrasadas de un nino. Genera UNA sola alerta que las lista todas.
// nino = { nino_id, nombre, sexo }
// dosisAtrasadas = [{ vacuna, numero_dosis, dias_atraso }]
function evaluarVacunas(nino, dosisAtrasadas) {
  if (!dosisAtrasadas || dosisAtrasadas.length === 0) {
    return [];
  }

  const maxAtraso = Math.max(...dosisAtrasadas.map((d) => d.dias_atraso));
  const lista = dosisAtrasadas.map((d) => `${d.vacuna} (dosis ${d.numero_dosis})`).join(', ');

  return [
    {
      nino_id: nino.nino_id,
      tipo: 'vacuna_atrasada',
      nivel: maxAtraso >= UMBRALES.diasAtrasoCritico ? 'critica' : 'preventiva',
      mensaje: `${articulo(nino.sexo)} ${nino.nombre} tiene vacunas atrasadas: ${lista}. Se recomienda acudir al centro de salud para completar su esquema.`,
    },
  ];
}

// Junta las alertas de todos los ninos.
//  ninos   = filas de crecimiento (ver evaluarCrecimiento)
//  atrasos = [{ nino_id, vacuna, numero_dosis, dias_atraso }]
function evaluarTodo(ninos, atrasos) {
  const atrasosPorNino = new Map();
  for (const fila of atrasos) {
    if (!atrasosPorNino.has(fila.nino_id)) atrasosPorNino.set(fila.nino_id, []);
    atrasosPorNino.get(fila.nino_id).push(fila);
  }

  const alertas = [];
  for (const nino of ninos) {
    alertas.push(...evaluarCrecimiento(nino));
    alertas.push(...evaluarVacunas(nino, atrasosPorNino.get(nino.nino_id)));
  }
  return alertas;
}

module.exports = { UMBRALES, evaluarCrecimiento, evaluarVacunas, evaluarTodo };
