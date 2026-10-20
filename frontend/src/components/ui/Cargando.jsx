import { Loader2 } from 'lucide-react';

export function Spinner({ className = 'size-5' }) {
  return <Loader2 className={`animate-spin text-marca-600 ${className}`} aria-hidden />;
}

export function CargandoPagina() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center" role="status" aria-live="polite">
      <Spinner className="size-8" />
      <span className="sr-only">Cargando…</span>
    </div>
  );
}

export function CargandoBloque({ texto = 'Cargando…' }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500" role="status">
      <Spinner /> {texto}
    </div>
  );
}
