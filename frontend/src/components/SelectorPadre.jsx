// Busca y elige un padre/tutor (puede haber miles: se busca en el servidor).
import { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, X } from 'lucide-react';
import { padres } from '../api/recursos';
import { useRetrasado } from '../hooks/utiles';
import { Spinner } from './ui/Cargando';

// valor: { id, nombre_completo, comunidad } | null
export default function SelectorPadre({ valor, alCambiar, required }) {
  const id = useId();
  const [texto, setTexto] = useState('');
  const [abierto, setAbierto] = useState(false);
  const buscar = useRetrasado(texto.trim());

  const { data, isFetching } = useQuery({
    queryKey: ['padres', 'selector', buscar],
    queryFn: () => padres.listar({ buscar, limite: 8 }),
    enabled: abierto && buscar.length >= 2,
  });

  if (valor) {
    return (
      <div>
        <span className="mb-1 block text-sm font-medium text-slate-700">Padre, madre o tutor{required && <span className="text-red-600"> *</span>}</span>
        <div className="flex items-center justify-between rounded-lg bg-marca-50 px-3 py-2 ring-1 ring-marca-100">
          <div>
            <p className="text-sm font-medium text-slate-800">{valor.nombre_completo}</p>
            {valor.comunidad && <p className="text-xs text-slate-500">{valor.comunidad} · el niño quedará en esta comunidad</p>}
          </div>
          <button type="button" onClick={() => alCambiar(null)} className="rounded p-1 text-slate-500 hover:bg-white" aria-label="Cambiar padre o tutor">
            <X className="size-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">
        Padre, madre o tutor{required && <span className="text-red-600"> *</span>}
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
        <input
          id={id}
          type="search"
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            setAbierto(true);
          }}
          onFocus={() => setAbierto(true)}
          placeholder="Escribe el nombre o el DPI completo"
          autoComplete="off"
          className="block w-full rounded-lg border-0 py-2 pr-3 pl-9 text-sm ring-1 ring-slate-300 ring-inset focus:ring-2 focus:ring-marca-600"
          role="combobox"
          aria-expanded={abierto}
          aria-controls={`${id}-lista`}
        />
      </div>
      {abierto && buscar.length >= 2 && (
        <ul id={`${id}-lista`} role="listbox" className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-lg bg-white py-1 shadow-lg ring-1 ring-slate-200">
          {isFetching && (
            <li className="flex items-center gap-2 px-3 py-2 text-sm text-slate-500"><Spinner className="size-4" /> Buscando…</li>
          )}
          {!isFetching && data?.datos.length === 0 && (
            <li className="px-3 py-2 text-sm text-slate-500">Sin resultados. Registra primero al padre o tutor.</li>
          )}
          {data?.datos.map((p) => (
            <li key={p.id} role="option" aria-selected={false}>
              <button
                type="button"
                onClick={() => {
                  alCambiar(p);
                  setTexto('');
                  setAbierto(false);
                }}
                className="w-full px-3 py-2 text-left hover:bg-marca-50"
              >
                <p className="text-sm text-slate-800">{p.nombre_completo}</p>
                <p className="text-xs text-slate-500">DPI {p.dpi} · {p.comunidad}</p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
