// Campos de formulario con etiqueta, ayuda y error accesibles.
import { useId } from 'react';
import { Search } from 'lucide-react';

const BASE =
  'block w-full rounded-lg border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-xs ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-marca-600 disabled:bg-slate-50 disabled:text-slate-500';

function Envoltura({ id, etiqueta, ayuda, error, obligatorio, children, className = '' }) {
  return (
    <div className={className}>
      {etiqueta && (
        <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">
          {etiqueta}
          {obligatorio && <span className="text-red-600"> *</span>}
        </label>
      )}
      {children}
      {error ? (
        <p id={`${id}-ayuda`} className="mt-1 text-xs text-red-600">{error}</p>
      ) : (
        ayuda && <p id={`${id}-ayuda`} className="mt-1 text-xs text-slate-500">{ayuda}</p>
      )}
    </div>
  );
}

export function Entrada({ etiqueta, ayuda, error, className, required, ...props }) {
  const id = useId();
  return (
    <Envoltura id={id} etiqueta={etiqueta} ayuda={ayuda} error={error} obligatorio={required} className={className}>
      <input
        id={id}
        required={required}
        aria-invalid={Boolean(error)}
        aria-describedby={ayuda || error ? `${id}-ayuda` : undefined}
        className={`${BASE} ${error ? 'ring-red-400' : ''}`}
        {...props}
      />
    </Envoltura>
  );
}

export function Selector({ etiqueta, ayuda, error, className, required, opciones = [], vacio, children, ...props }) {
  const id = useId();
  return (
    <Envoltura id={id} etiqueta={etiqueta} ayuda={ayuda} error={error} obligatorio={required} className={className}>
      <select
        id={id}
        required={required}
        aria-describedby={ayuda || error ? `${id}-ayuda` : undefined}
        className={`${BASE} pr-8`}
        {...props}
      >
        {vacio !== undefined && <option value="">{vacio}</option>}
        {opciones.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.texto}
          </option>
        ))}
        {children}
      </select>
    </Envoltura>
  );
}

export function AreaTexto({ etiqueta, ayuda, error, className, required, ...props }) {
  const id = useId();
  return (
    <Envoltura id={id} etiqueta={etiqueta} ayuda={ayuda} error={error} obligatorio={required} className={className}>
      <textarea id={id} required={required} rows={4} className={BASE} {...props} />
    </Envoltura>
  );
}

export function Buscador({ valor, alCambiar, placeholder = 'Buscar…', className = '' }) {
  return (
    <div className={`relative ${className}`}>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
      <input
        type="search"
        value={valor}
        onChange={(e) => alCambiar(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className={`${BASE} pl-9`}
      />
    </div>
  );
}
