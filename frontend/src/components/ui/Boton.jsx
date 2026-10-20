import { Loader2 } from 'lucide-react';

const VARIANTES = {
  primario: 'bg-marca-600 text-white hover:bg-marca-700 focus-visible:outline-marca-600',
  secundario: 'bg-white text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 focus-visible:outline-marca-600',
  peligro: 'bg-red-600 text-white hover:bg-red-700 focus-visible:outline-red-600',
  fantasma: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-marca-600',
};

const TAMANOS = {
  sm: 'px-2.5 py-1.5 text-xs gap-1.5',
  md: 'px-3.5 py-2 text-sm gap-2',
};

export default function Boton({
  variante = 'primario',
  tamano = 'md',
  cargando = false,
  icono: Icono,
  className = '',
  children,
  disabled,
  type = 'button',
  ...props
}) {
  return (
    <button
      type={type}
      disabled={disabled || cargando}
      className={`inline-flex items-center justify-center rounded-lg font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${VARIANTES[variante]} ${TAMANOS[tamano]} ${className}`}
      {...props}
    >
      {cargando ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : (
        Icono && <Icono className="size-4 shrink-0" aria-hidden />
      )}
      {children}
    </button>
  );
}
