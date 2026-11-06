// Tabla de datos con estados de carga/vacio y paginacion.
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { CargandoBloque } from './Cargando';
import { Vacio } from './Elementos';

// columnas: [{ clave, titulo, render?(fila), className? }]
export function Tabla({ columnas, filas = [], cargando, vacio = 'No hay registros', alClicFila, claveFila = 'id' }) {
  if (cargando && filas.length === 0) return <CargandoBloque />;
  if (!cargando && filas.length === 0) return <Vacio texto={vacio} />;

  return (
    <div className={`relative overflow-x-auto ${cargando ? 'opacity-60' : ''}`}>
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>
            {columnas.map((c) => (
              <th
                key={c.clave}
                scope="col"
                className={`px-4 py-2.5 text-left text-xs font-semibold tracking-wide whitespace-nowrap text-slate-500 uppercase ${c.className || ''}`}
              >
                {c.titulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {filas.map((fila, i) => (
            <tr
              key={fila[claveFila] ?? i}
              onClick={alClicFila ? () => alClicFila(fila) : undefined}
              onKeyDown={alClicFila ? (e) => e.key === 'Enter' && alClicFila(fila) : undefined}
              tabIndex={alClicFila ? 0 : undefined}
              className={alClicFila ? 'cursor-pointer hover:bg-marca-50 focus:bg-marca-50 focus:outline-none' : ''}
            >
              {columnas.map((c) => (
                <td key={c.clave} className={`px-4 py-2.5 align-middle text-slate-700 ${c.className || ''}`}>
                  {c.render ? c.render(fila) : fila[c.clave] ?? '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// datos = respuesta paginada del backend: { total, pagina, total_paginas }
export function Paginacion({ datos, alCambiar }) {
  if (!datos || datos.total_paginas <= 1) {
    return datos?.total ? (
      <p className="px-4 py-3 text-xs text-slate-500">{datos.total} registro(s)</p>
    ) : null;
  }
  const { pagina, total_paginas: totalPaginas, total } = datos;
  return (
    <div className="flex items-center justify-between gap-2 border-t border-slate-200 px-4 py-3 text-sm">
      <p className="text-xs text-slate-500">
        Página {pagina} de {totalPaginas} · {total} registros
      </p>
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => alCambiar(pagina - 1)}
          disabled={pagina <= 1}
          className="rounded-lg p-1.5 text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50 disabled:opacity-40"
          aria-label="Página anterior"
        >
          <ChevronLeft className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => alCambiar(pagina + 1)}
          disabled={pagina >= totalPaginas}
          className="rounded-lg p-1.5 text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50 disabled:opacity-40"
          aria-label="Página siguiente"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
    </div>
  );
}
