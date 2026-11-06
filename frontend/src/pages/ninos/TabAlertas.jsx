import { useQuery } from '@tanstack/react-query';
import { alertas } from '../../api/recursos';
import { mensajeError } from '../../api/cliente';
import { CajaError, Tarjeta } from '../../components/ui/Elementos';
import { CargandoBloque } from '../../components/ui/Cargando';
import ListaAlertas from '../../components/ListaAlertas';

export default function TabAlertas({ ninoId }) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['alertas', { nino_id: ninoId }],
    queryFn: () => alertas.listar({ nino_id: ninoId, limite: 100 }),
  });

  if (isLoading) return <CargandoBloque />;
  if (error) return <CajaError mensaje={mensajeError(error)} alReintentar={refetch} />;

  return (
    <Tarjeta titulo="Historial de alertas" sinRelleno>
      <ListaAlertas alertas={data.datos} mostrarNino={false} vacio="Este niño no tiene alertas." />
    </Tarjeta>
  );
}
