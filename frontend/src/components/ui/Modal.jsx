// Ventana modal accesible (Esc o clic afuera para cerrar) y dialogo de confirmacion.
import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, AlertTriangle } from 'lucide-react';
import Boton from './Boton';

const ANCHOS = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };

export function Modal({ abierto, alCerrar, titulo, descripcion, ancho = 'md', children, pie }) {
  const idTitulo = useId();
  const panel = useRef(null);
  // Se guarda en una ref para que el efecto no se repita en cada render del padre
  const cerrar = useRef(alCerrar);
  cerrar.current = alCerrar;

  useEffect(() => {
    if (!abierto) return undefined;
    const anterior = document.activeElement;
    const alPresionar = (e) => e.key === 'Escape' && cerrar.current();
    document.addEventListener('keydown', alPresionar);
    document.body.style.overflow = 'hidden';
    // Enfoca el primer campo del formulario (o el panel)
    const primero = panel.current?.querySelector('input, select, textarea, button:not([data-cerrar])');
    (primero || panel.current)?.focus();
    return () => {
      document.removeEventListener('keydown', alPresionar);
      document.body.style.overflow = '';
      anterior?.focus?.();
    };
  }, [abierto]);

  if (!abierto) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-slate-900/50" onClick={alCerrar} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        tabIndex={-1}
        className={`relative flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-xl outline-none sm:rounded-2xl ${ANCHOS[ancho]}`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 id={idTitulo} className="text-base font-semibold text-slate-900">{titulo}</h2>
            {descripcion && <p className="mt-0.5 text-sm text-slate-500">{descripcion}</p>}
          </div>
          <button
            type="button"
            data-cerrar
            onClick={alCerrar}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Cerrar"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {pie && <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-5 py-3">{pie}</div>}
      </div>
    </div>,
    document.body
  );
}

export function Confirmar({ abierto, alCerrar, alConfirmar, titulo, mensaje, textoConfirmar = 'Confirmar', peligro = true, cargando }) {
  return (
    <Modal
      abierto={abierto}
      alCerrar={alCerrar}
      titulo={titulo}
      ancho="sm"
      pie={
        <>
          <Boton variante="secundario" onClick={alCerrar}>Cancelar</Boton>
          <Boton variante={peligro ? 'peligro' : 'primario'} onClick={alConfirmar} cargando={cargando}>
            {textoConfirmar}
          </Boton>
        </>
      }
    >
      <div className="flex gap-3">
        {peligro && <AlertTriangle className="size-5 shrink-0 text-red-600" aria-hidden />}
        <p className="text-sm text-slate-600">{mensaje}</p>
      </div>
    </Modal>
  );
}
