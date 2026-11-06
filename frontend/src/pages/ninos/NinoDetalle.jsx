// Expediente del nino: datos generales + pestanas de crecimiento, vacunas, alertas y carnet.
import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Bell, LineChart, Pencil, QrCode, Syringe, Trash2 } from 'lucide-react';
import { ninos, alertas } from '../../api/recursos';
import { mensajeError } from '../../api/cliente';
import { useAuth } from '../../auth/AuthContext';
import { useMutacion } from '../../hooks/utiles';
import { CajaError, Dato, Insignia, Pestanas } from '../../components/ui/Elementos';
import { CargandoPagina } from '../../components/ui/Cargando';
import { Confirmar } from '../../components/ui/Modal';
import Boton from '../../components/ui/Boton';
import FormNino from './FormNino';
import TabCrecimiento from './TabCrecimiento';
import TabVacunas from './TabVacunas';
import TabAlertas from './TabAlertas';
import TabCarnet from './TabCarnet';
import { edad, fecha, sexo } from '../../utils/formato';

export default function NinoDetalle() {
  const { id } = useParams();
  const navegar = useNavigate();
  const { tiene } = useAuth();
  const [parametros, setParametros] = useSearchParams();
  const pestana = parametros.get('tab') || 'crecimiento';
  const [editando, setEditando] = useState(false);
  const [borrando, setBorrando] = useState(false);

  const { data: nino, isLoading, error, refetch } = useQuery({ queryKey: ['ninos', id], queryFn: () => ninos.obtener(id) });
  const { data: abiertas } = useQuery({
    queryKey: ['alertas', { nino_id: id, atendida: 'false' }],
    queryFn: () => alertas.listar({ nino_id: id, atendida: 'false', limite: 50 }),
  });

  const eliminar = useMutacion(() => ninos.eliminar(id), {
    exito: 'Niño eliminado',
    invalidar: [['ninos'], ['dashboard']],
    alExito: () => navegar('/ninos', { replace: true }),
  });

  if (isLoading) return <CargandoPagina />;
  if (error) return <CajaError mensaje={mensajeError(error)} alReintentar={refetch} />;

  const criticas = abiertas?.datos.filter((a) => a.nivel === 'critica').length || 0;

  return (
    <>
      <Link to="/ninos" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="size-4" aria-hidden /> Niños
      </Link>

      <section className="mb-5 rounded-xl bg-white p-5 shadow-xs ring-1 ring-slate-200">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-slate-900">{nino.nombre}</h1>
              <Insignia tono="azul">{sexo(nino.sexo)}</Insignia>
              {criticas > 0 && <Insignia tono="rojo" icono={Bell}>{criticas} alerta(s) crítica(s)</Insignia>}
            </div>
            <p className="mt-1 text-sm text-slate-500">{edad(nino.edad_meses)}</p>
          </div>
          <div className="flex gap-2">
            <Boton variante="secundario" icono={Pencil} onClick={() => setEditando(true)}>Editar</Boton>
            {tiene('administrador') && (
              <Boton variante="secundario" icono={Trash2} onClick={() => setBorrando(true)} aria-label="Eliminar niño">
                <span className="hidden sm:inline">Eliminar</span>
              </Boton>
            )}
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Dato etiqueta="Fecha de nacimiento">{fecha(nino.fecha_nacimiento)}</Dato>
          <Dato etiqueta="Edad en meses">{nino.edad_meses}</Dato>
          <Dato etiqueta="Comunidad">{nino.comunidad}</Dato>
          <Dato etiqueta="Padre / tutor">
            <Link to={`/padres?ver=${nino.padre_id}`} className="text-marca-600 hover:underline">{nino.padre}</Link>
          </Dato>
        </dl>
      </section>

      <Pestanas
        activa={pestana}
        alCambiar={(clave) => setParametros({ tab: clave }, { replace: true })}
        pestanas={[
          { clave: 'crecimiento', titulo: 'Crecimiento', icono: LineChart },
          { clave: 'vacunas', titulo: 'Vacunas', icono: Syringe },
          { clave: 'alertas', titulo: 'Alertas', icono: Bell, contador: abiertas?.total },
          { clave: 'carnet', titulo: 'Carnet QR', icono: QrCode },
        ]}
      />

      <div className="mt-5" role="tabpanel">
        {pestana === 'crecimiento' && <TabCrecimiento nino={nino} />}
        {pestana === 'vacunas' && <TabVacunas nino={nino} />}
        {pestana === 'alertas' && <TabAlertas ninoId={id} />}
        {pestana === 'carnet' && <TabCarnet nino={nino} />}
      </div>

      <FormNino abierto={editando} alCerrar={() => setEditando(false)} nino={nino} />
      <Confirmar
        abierto={borrando}
        alCerrar={() => setBorrando(false)}
        alConfirmar={() => eliminar.mutate()}
        cargando={eliminar.isPending}
        titulo="Eliminar niño"
        textoConfirmar="Eliminar"
        mensaje={`Se eliminará a ${nino.nombre}. Solo es posible si no tiene mediciones, vacunas, alertas ni carnet registrados.`}
      />
    </>
  );
}
