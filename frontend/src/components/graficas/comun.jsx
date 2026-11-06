// Piezas comunes de las graficas: tooltip, leyenda y alternar grafica/tabla.
// Reglas: el texto usa tinta neutra (nunca el color de la serie); la serie se
// identifica con una marca de color al lado. Siempre hay vista de tabla.
import { useState } from 'react';
import { BarChart3, Table2 } from 'lucide-react';

export const COLORES = {
  serie1: 'var(--serie-1)',
  serie2: 'var(--serie-2)',
  serie3: 'var(--serie-3)',
  cuadricula: 'var(--grafica-cuadricula)',
  eje: 'var(--grafica-eje)',
  tenue: 'var(--texto-tenue)',
};

export const EJE = { stroke: COLORES.eje, tick: { fill: COLORES.tenue, fontSize: 11 }, tickLine: false };

// Marca de serie en leyenda/tooltip: linea (continua o punteada) o rectangulo
export function Marca({ color, tipo = 'linea' }) {
  if (tipo === 'rect') return <span className="inline-block h-2.5 w-3.5 rounded-sm" style={{ background: color }} aria-hidden />;
  return (
    <svg width="16" height="8" aria-hidden className="shrink-0">
      <line x1="1" y1="4" x2="15" y2="4" stroke={color} strokeWidth="2" strokeDasharray={tipo === 'punteada' ? '3 2' : undefined} strokeLinecap="round" />
    </svg>
  );
}

export function Leyenda({ elementos }) {
  return (
    <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
      {elementos.map((e) => (
        <li key={e.texto} className="flex items-center gap-1.5">
          <Marca color={e.color} tipo={e.tipo} />
          {e.texto}
        </li>
      ))}
    </ul>
  );
}

// Caja del tooltip: el valor va primero y resaltado; la etiqueta despues
export function CajaTooltip({ titulo, filas }) {
  return (
    <div className="min-w-40 rounded-lg bg-white px-3 py-2 text-xs shadow-lg ring-1 ring-slate-200">
      <p className="mb-1 font-medium text-slate-500">{titulo}</p>
      <ul className="space-y-0.5">
        {filas.map((f) => (
          <li key={f.etiqueta} className="flex items-center gap-2">
            {f.color && <Marca color={f.color} tipo={f.tipo} />}
            <span className="tabular font-semibold text-slate-900">{f.valor}</span>
            <span className="text-slate-500">{f.etiqueta}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Tarjeta de grafica con boton para ver los mismos datos en tabla
export function ConTabla({ titulo, subtitulo, grafica, tabla, acciones }) {
  const [verTabla, setVerTabla] = useState(false);
  return (
    <section className="rounded-xl bg-white shadow-xs ring-1 ring-slate-200">
      <div className="flex flex-wrap items-start justify-between gap-2 px-4 pt-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">{titulo}</h2>
          {subtitulo && <p className="text-xs text-slate-500">{subtitulo}</p>}
        </div>
        <div className="flex items-center gap-1">
          {acciones}
          <button
            type="button"
            onClick={() => setVerTabla((v) => !v)}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            aria-pressed={verTabla}
          >
            {verTabla ? <BarChart3 className="size-3.5" aria-hidden /> : <Table2 className="size-3.5" aria-hidden />}
            {verTabla ? 'Ver gráfica' : 'Ver tabla'}
          </button>
        </div>
      </div>
      <div className="p-4 pt-2">{verTabla ? tabla : grafica}</div>
    </section>
  );
}

export function TablaSimple({ columnas, filas }) {
  return (
    <div className="relative max-h-80 overflow-auto">
      <table className="min-w-full text-xs">
        <thead className="sticky top-0 bg-slate-50">
          <tr>
            {columnas.map((c) => (
              <th key={c.clave} className={`px-3 py-2 text-left font-semibold text-slate-500 ${c.derecha ? 'text-right' : ''}`}>{c.titulo}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {filas.map((f, i) => (
            <tr key={i}>
              {columnas.map((c) => (
                <td key={c.clave} className={`px-3 py-1.5 text-slate-700 ${c.derecha ? 'tabular text-right' : ''}`}>
                  {c.render ? c.render(f) : f[c.clave] ?? '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
