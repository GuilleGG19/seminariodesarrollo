// Barras horizontales de un solo color (magnitud), con el valor escrito al lado.
// Hechas en HTML: cada barra es legible, accesible y muestra su valor sin hover.
import { ConTabla, TablaSimple } from './comun';
import { numero } from '../../utils/formato';

// filas: [{ etiqueta, valor, detalle? }]; maximo: valor de la barra completa (por defecto el mayor)
export default function BarrasHorizontales({ titulo, subtitulo, filas = [], maximo, sufijo = '', vacio = 'Sin datos' }) {
  const tope = maximo ?? Math.max(1, ...filas.map((f) => f.valor ?? 0));

  const grafica =
    filas.length === 0 ? (
      <p className="py-8 text-center text-sm text-slate-500">{vacio}</p>
    ) : (
      <ul className="space-y-2.5">
        {filas.map((f) => {
          const ancho = f.valor === null || f.valor === undefined ? 0 : Math.max((f.valor / tope) * 100, f.valor > 0 ? 1.5 : 0);
          return (
            <li key={f.etiqueta} className="group" title={f.detalle ? `${f.etiqueta}: ${f.detalle}` : undefined}>
              <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
                <span className="truncate text-slate-600">{f.etiqueta}</span>
                <span className="tabular font-semibold text-slate-900">
                  {f.valor === null || f.valor === undefined ? '—' : `${numero(f.valor, sufijo === '%' ? 1 : 0)}${sufijo}`}
                </span>
              </div>
              <div className="h-2 rounded-full bg-slate-100">
                <div
                  className="h-2 rounded-r-[4px] rounded-l-full transition-opacity group-hover:opacity-80"
                  style={{ width: `${ancho}%`, background: 'var(--serie-1)' }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    );

  const tabla = (
    <TablaSimple
      columnas={[
        { clave: 'etiqueta', titulo: 'Categoría' },
        { clave: 'valor', titulo: 'Valor', derecha: true, render: (f) => (f.valor === null ? '—' : `${numero(f.valor, sufijo === '%' ? 1 : 0)}${sufijo}`) },
        ...(filas.some((f) => f.detalle) ? [{ clave: 'detalle', titulo: 'Detalle' }] : []),
      ]}
      filas={filas}
    />
  );

  return <ConTabla titulo={titulo} subtitulo={subtitulo} grafica={grafica} tabla={tabla} />;
}
