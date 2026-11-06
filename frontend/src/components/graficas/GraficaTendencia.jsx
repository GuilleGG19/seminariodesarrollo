// Actividad de los ultimos meses (dashboard): varias series de conteos en un solo eje.
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { COLORES, EJE, CajaTooltip, ConTabla, Leyenda, TablaSimple } from './comun';
import { numero } from '../../utils/formato';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const etiquetaMes = (aaaamm) => {
  const [a, m] = aaaamm.split('-').map(Number);
  return `${MESES[m - 1]} ${String(a).slice(2)}`;
};

// series: [{ clave, texto }] en orden fijo; los colores siguen ese orden
const COLORES_SERIE = [COLORES.serie1, COLORES.serie2, COLORES.serie3];

export default function GraficaTendencia({ titulo, subtitulo, datos = [], series }) {
  const conEtiqueta = datos.map((d) => ({ ...d, etiqueta: etiquetaMes(d.mes) }));

  const TooltipTendencia = ({ active, payload, label }) =>
    active && payload?.length ? (
      <CajaTooltip
        titulo={label}
        filas={series.map((s, i) => ({ valor: numero(payload[0].payload[s.clave]), etiqueta: s.texto, color: COLORES_SERIE[i] }))}
      />
    ) : null;

  const grafica = (
    <>
      <div className="h-64" role="img" aria-label={`${titulo}: ${series.map((s) => s.texto).join(', ')} por mes`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={conEtiqueta} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
            <CartesianGrid stroke={COLORES.cuadricula} vertical={false} />
            <XAxis dataKey="etiqueta" {...EJE} />
            <YAxis allowDecimals={false} {...EJE} axisLine={false} width={40} />
            <Tooltip content={<TooltipTendencia />} cursor={{ stroke: COLORES.eje, strokeWidth: 1 }} />
            {series.map((s, i) => (
              <Line
                key={s.clave}
                dataKey={s.clave}
                name={s.texto}
                stroke={COLORES_SERIE[i]}
                strokeWidth={2}
                isAnimationActive={false}
                dot={{ r: 4, fill: COLORES_SERIE[i], stroke: '#fff', strokeWidth: 2 }}
                activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <Leyenda elementos={series.map((s, i) => ({ texto: s.texto, color: COLORES_SERIE[i] }))} />
    </>
  );

  const tabla = (
    <TablaSimple
      columnas={[
        { clave: 'etiqueta', titulo: 'Mes' },
        ...series.map((s) => ({ clave: s.clave, titulo: s.texto, derecha: true, render: (f) => numero(f[s.clave]) })),
      ]}
      filas={conEtiqueta}
    />
  );

  return <ConTabla titulo={titulo} subtitulo={subtitulo} grafica={grafica} tabla={tabla} />;
}
