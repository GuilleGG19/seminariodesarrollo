// Hooks compartidos.
import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { mensajeError } from '../api/cliente';

// Devuelve "valor" solo cuando deja de cambiar durante "ms" (para buscadores)
export function useRetrasado(valor, ms = 350) {
  const [retrasado, setRetrasado] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setRetrasado(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return retrasado;
}

// Mutacion con aviso de exito/error e invalidacion de consultas.
// invalidar: lista de claves de consulta a refrescar, ej. [['ninos'], ['dashboard']]
export function useMutacion(fn, { exito, invalidar = [], alExito } = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (resultado, variables) => {
      invalidar.forEach((clave) => queryClient.invalidateQueries({ queryKey: clave }));
      const texto = typeof exito === 'function' ? exito(resultado, variables) : exito;
      if (texto) toast.success(texto);
      alExito?.(resultado, variables);
    },
    onError: (error) => toast.error(mensajeError(error)),
  });
}

// Estado de un formulario: [valores, cambiar(campo) -> handler de evento, setValores]
export function useFormulario(inicial) {
  const [valores, setValores] = useState(inicial);
  const cambiar = (campo) => (e) => {
    const valor = e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e;
    setValores((v) => ({ ...v, [campo]: valor }));
  };
  return [valores, cambiar, setValores];
}
