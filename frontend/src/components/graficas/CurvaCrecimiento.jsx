// Curva de crecimiento (seccion 3.4): mediciones del nino sobre las curvas OMS.
//  - Banda clara: percentiles 5 a 95 (rango normal)
//  - Banda media: percentiles 25 a 75
//  - Linea punteada: mediana (percentil 50)
//  - Linea azul con puntos: el nino
import { useMemo } from 'react';
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { COLORES, EJE, CajaTooltip, ConTabla, Leyenda, TablaSimple } from './comun';
import { fecha, numero } from '../../utils/formato';

const REF_EXTERNA = 'var(--ref-banda-externa)';
const REF_INTERNA = 'var(--ref-banda-interna)';
const REF_MEDIANA = 'var(--ref-mediana)';

// Interpola linealmente las curvas de referencia en una edad con decimales
function interpolar(referencia, edad) {
  const i = referencia.findIndex((r) => r.edad_meses >= edad);
  if (i <= 0) return referencia[Math.max(i, 0)];
  const a = referencia[i - 1];
  const b = referencia[i];
  const t = (edad - a.edad_meses) / (b.edad_meses - a.edad_meses);
  const mezcla = (k) => a[k] + (b[k] - a[k]) * t;
  return { p5: mezcla('p5'), p25: mezcla('p25'), p50: mezcla('p50'), p75: mezcla('p75'), p95: mezcla('p95') };
}

// Marcas "redondas" para el eje Y (pasos de 1, 2, 5 o 10 x 10^n)
function marcasEje(min, max, cantidad = 5) {
  const crudo = (max - min) / cantidad;
  const potencia = 10 ** Math.floor(Math.log10(crudo));
  const paso = [1, 2, 2.5, 5, 10].map((m) => m * potencia).find((p) => p >= crudo);
  const inicio = Math.floor(min / paso) * paso;
  const fin = Math.ceil(max / paso) * paso;
  const marcas = [];
  for (let v = inicio; v <= fin + paso / 2; v += paso) marcas.push(Math.round(v * 100) / 100);
  return marcas;
}

function TooltipCurva({ active, payload, unidad }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const filas = [];
  if (p.valor !== undefined) {
    filas.push({ valor: `${numero(p.valor, unidad === 'kg' ? 2 : 1)} ${unidad}`, etiqueta: `Niño · ${fecha(p.fecha)}`, color: COLORES.serie1 });
    if (p.percentil !== null && p.percentil !== undefined) {
      filas.push({ valor: `P${numero(p.percentil, 1)}`, etiqueta: 'percentil' });
    }
  }
  filas.push({ valor: `${numero(p.p50, 1)} ${unidad}`, etiqueta: 'Mediana OMS', color: REF_MEDIANA, tipo: 'punteada' });
  filas.push({ valor: `${numero(p.p5, 1)}–${numero(p.p95, 1)}`, etiqueta: 'Rango P5–P95', color: REF_EXTERNA, tipo: 'rect' });
  return <CajaTooltip titulo={`${numero(p.edad, 1)} meses`} filas={filas} />;
}

// referencia: [{ edad_meses, p5, p25, p50, p75, p95 }]
// mediciones: [{ edad_meses_exacta, fecha_medicion, valor, percentil }]
export default function CurvaCrecimiento({ titulo, unidad, referencia = [], mediciones = [], alto = 300 }) {
  const { datos, maxX, marcasY } = useMemo(() => {
    const ultimaEdad = mediciones.length ? Math.max(...mediciones.map((m) => m.edad_meses_exacta)) : 0;
    const max = Math.min(60, Math.max(24, Math.ceil((ultimaEdad + 6) / 6) * 6));
    const ref = referencia.filter((r) => r.edad_meses <= max);

    const puntosRef = ref.map((r) => ({ edad: r.edad_meses, ...r }));
    const puntosNino = mediciones
      .filter((m) => m.edad_meses_exacta <= max)
      .map((m) => ({
        edad: m.edad_meses_exacta,
        ...interpolar(ref, m.edad_meses_exacta),
        valor: m.valor,
        fecha: m.fecha_medicion,
        percentil: m.percentil,
      }));
    const todos = [...puntosRef, ...puntosNino]
      .sort((a, b) => a.edad - b.edad || (a.valor === undefined ? -1 : 1))
      .map((p) => ({ ...p, banda95: [p.p5, p.p95], banda75: [p.p25, p.p75] }));

    const valores = [...ref.flatMap((r) => [r.p5, r.p95]), ...puntosNino.map((p) => p.valor)];
    const marcas = marcasEje(Math.max(0, Math.min(...valores)), Math.max(...valores));
    return { datos: todos, maxX: max, marcasY: marcas };
  }, [referencia, mediciones]);

  const ticks = Array.from({ length: maxX / 6 + 1 }, (_, i) => i * 6);
  const fueraDeRango = mediciones.some((m) => m.edad_meses_exacta > 60);

  const grafica =
    referencia.length === 0 ? (
      <p className="py-10 text-center text-sm text-slate-500">No hay curvas de referencia disponibles.</p>
    ) : (
      <>
        <div style={{ height: alto }} role="img" aria-label={`${titulo}: ${mediciones.length} mediciones del niño comparadas con las curvas OMS`}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={datos} margin={{ top: 8, right: 12, bottom: 4, left: -8 }}>
              <CartesianGrid stroke={COLORES.cuadricula} strokeDasharray="0" vertical={false} />
              <XAxis
                dataKey="edad"
                type="number"
                domain={[0, maxX]}
                ticks={ticks}
                {...EJE}
                label={{ value: 'Edad (meses)', position: 'insideBottomRight', offset: -2, fill: COLORES.tenue, fontSize: 11 }}
              />
              <YAxis
                domain={[marcasY[0], marcasY[marcasY.length - 1]]}
                ticks={marcasY}
                interval={0}
                {...EJE}
                axisLine={false}
                width={52}
                unit={` ${unidad}`}
              />
              <Tooltip content={<TooltipCurva unidad={unidad} />} cursor={{ stroke: COLORES.eje, strokeWidth: 1 }} />
              <Area dataKey="banda95" stroke="none" fill={REF_EXTERNA} fillOpacity={1} isAnimationActive={false} connectNulls activeDot={false} />
              <Area dataKey="banda75" stroke="none" fill={REF_INTERNA} fillOpacity={1} isAnimationActive={false} connectNulls activeDot={false} />
              <Line dataKey="p50" stroke={REF_MEDIANA} strokeWidth={1.5} strokeDasharray="4 3" dot={false} activeDot={false} isAnimationActive={false} connectNulls />
              <Line
                dataKey="valor"
                stroke={COLORES.serie1}
                strokeWidth={2}
                connectNulls
                isAnimationActive={false}
                dot={{ r: 4, fill: COLORES.serie1, stroke: '#fff', strokeWidth: 2 }}
                activeDot={{ r: 6, fill: COLORES.serie1, stroke: '#fff', strokeWidth: 2 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <Leyenda
          elementos={[
            { texto: 'Niño', color: COLORES.serie1 },
            { texto: 'Mediana OMS (P50)', color: REF_MEDIANA, tipo: 'punteada' },
            { texto: 'P25–P75', color: REF_INTERNA, tipo: 'rect' },
            { texto: 'P5–P95 (rango normal)', color: REF_EXTERNA, tipo: 'rect' },
          ]}
        />
        {fueraDeRango && (
          <p className="mt-2 text-xs text-slate-500">Las tablas de la OMS cubren hasta los 5 años; las mediciones posteriores solo aparecen en la tabla.</p>
        )}
      </>
    );

  const tabla =
    mediciones.length === 0 ? (
      <p className="py-6 text-center text-sm text-slate-500">Sin mediciones.</p>
    ) : (
      <TablaSimple
        columnas={[
          { clave: 'fecha_medicion', titulo: 'Fecha', render: (m) => fecha(m.fecha_medicion) },
          { clave: 'edad', titulo: 'Edad (meses)', derecha: true, render: (m) => numero(m.edad_meses_exacta, 1) },
          { clave: 'valor', titulo: `Valor (${unidad})`, derecha: true, render: (m) => numero(m.valor, unidad === 'kg' ? 2 : 1) },
          { clave: 'percentil', titulo: 'Percentil', derecha: true, render: (m) => (m.percentil === null ? '—' : numero(m.percentil, 1)) },
        ]}
        filas={[...mediciones].reverse()}
      />
    );

  return <ConTabla titulo={titulo} subtitulo="Comparado con los estándares de crecimiento de la OMS" grafica={grafica} tabla={tabla} />;
}
