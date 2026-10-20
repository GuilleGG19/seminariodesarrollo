// Piezas pequenas de interfaz: tarjetas, insignias, encabezados, estados vacios.
import { AlertOctagon, AlertTriangle, CheckCircle2, Clock, Inbox, CircleDashed } from 'lucide-react';

export function Tarjeta({ titulo, acciones, children, className = '', sinRelleno = false }) {
  return (
    <section className={`rounded-xl bg-white shadow-xs ring-1 ring-slate-200 ${className}`}>
      {(titulo || acciones) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          {titulo && <h2 className="text-sm font-semibold text-slate-800">{titulo}</h2>}
          {acciones && <div className="flex flex-wrap gap-2">{acciones}</div>}
        </div>
      )}
      <div className={sinRelleno ? '' : 'p-4'}>{children}</div>
    </section>
  );
}

export function EncabezadoPagina({ titulo, descripcion, acciones }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{titulo}</h1>
        {descripcion && <p className="mt-0.5 text-sm text-slate-500">{descripcion}</p>}
      </div>
      {acciones && <div className="flex flex-wrap gap-2">{acciones}</div>}
    </div>
  );
}

const TONOS = {
  gris: 'bg-slate-100 text-slate-700 ring-slate-200',
  azul: 'bg-marca-50 text-marca-700 ring-marca-100',
  verde: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  ambar: 'bg-amber-50 text-amber-800 ring-amber-200',
  rojo: 'bg-red-50 text-red-700 ring-red-200',
};

export function Insignia({ tono = 'gris', icono: Icono, children }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset ${TONOS[tono]}`}>
      {Icono && <Icono className="size-3.5" aria-hidden />}
      {children}
    </span>
  );
}

// Los estados siempre llevan icono + texto (nunca solo color)
export function NivelAlerta({ nivel }) {
  return nivel === 'critica' ? (
    <Insignia tono="rojo" icono={AlertOctagon}>Crítica</Insignia>
  ) : (
    <Insignia tono="ambar" icono={AlertTriangle}>Preventiva</Insignia>
  );
}

const ESTADOS_DOSIS = {
  aplicada: { tono: 'verde', icono: CheckCircle2, texto: 'Aplicada' },
  completa: { tono: 'verde', icono: CheckCircle2, texto: 'Aplicada' },
  atrasada: { tono: 'rojo', icono: AlertOctagon, texto: 'Atrasada' },
  pendiente: { tono: 'azul', icono: Clock, texto: 'Pendiente' },
  sin_fecha: { tono: 'gris', icono: CircleDashed, texto: 'Sin fecha' },
};

export function EstadoDosis({ estado }) {
  const e = ESTADOS_DOSIS[estado] || ESTADOS_DOSIS.sin_fecha;
  return <Insignia tono={e.tono} icono={e.icono}>{e.texto}</Insignia>;
}

export function Vacio({ texto = 'No hay registros', icono: Icono = Inbox, children }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
      <Icono className="size-8 text-slate-300" aria-hidden />
      <p className="text-sm text-slate-500">{texto}</p>
      {children}
    </div>
  );
}

export function CajaError({ mensaje, alReintentar }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200" role="alert">
      <span>{mensaje}</span>
      {alReintentar && (
        <button type="button" onClick={alReintentar} className="font-medium underline">
          Reintentar
        </button>
      )}
    </div>
  );
}

// Pestanas accesibles (role="tablist")
export function Pestanas({ pestanas, activa, alCambiar }) {
  return (
    <div className="relative -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div role="tablist" className="flex min-w-max gap-1 border-b border-slate-200">
        {pestanas.map((p) => (
          <button
            key={p.clave}
            type="button"
            role="tab"
            aria-selected={activa === p.clave}
            onClick={() => alCambiar(p.clave)}
            className={`-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap ${
              activa === p.clave
                ? 'border-marca-600 text-marca-700'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
            }`}
          >
            {p.icono && <p.icono className="size-4" aria-hidden />}
            {p.titulo}
            {p.contador > 0 && (
              <span className="rounded-full bg-red-100 px-1.5 text-xs text-red-700">{p.contador}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// Dato con etiqueta (para fichas de detalle)
export function Dato({ etiqueta, children }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{etiqueta}</dt>
      <dd className="mt-0.5 text-sm font-medium text-slate-800">{children || '—'}</dd>
    </div>
  );
}
