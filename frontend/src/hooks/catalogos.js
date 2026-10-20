// Catalogos pequenos que usan varios formularios y filtros (se cachean 5 minutos).
import { useQuery } from '@tanstack/react-query';
import { comunidades, vacunas } from '../api/recursos';

export function useComunidades() {
  const consulta = useQuery({ queryKey: ['comunidades'], queryFn: () => comunidades.listar(), staleTime: 5 * 60 * 1000 });
  const opciones = (consulta.data || []).map((c) => ({ valor: c.id, texto: c.nombre }));
  return { ...consulta, opciones };
}

export function useVacunas() {
  const consulta = useQuery({ queryKey: ['vacunas'], queryFn: () => vacunas.listar(), staleTime: 5 * 60 * 1000 });
  const opciones = (consulta.data || []).map((v) => ({ valor: v.id, texto: v.nombre }));
  return { ...consulta, opciones };
}
