// Lista de alertas con accion "marcar como atendida" (se usa en Alertas y en el expediente).
import { Link } from 'react-router';
import { CheckCheck } from 'lucide-react';
import { alertas as apiAlertas } from '../api/recursos';
import { useMutacion } from '../hooks/utiles';
import { Insignia, NivelAlerta, Vacio } from './ui/Elementos';
import Boton from './ui/Boton';
import { fechaHora, TIPOS_ALERTA } from '../utils/formato';

export default function ListaAlertas({ alertas = [], mostrarNino = true, vacio = 'No hay alertas' }) {
  const atender = useMutacion((id) => apiAlertas.atender(id), {
    exito: 'Alerta marcada como atendida',
    invalidar: [['alertas'], ['dashboard']],
  });

  if (alertas.length === 0) return <Vacio texto={vacio} icono={CheckCheck} />;

  return (
    <ul className="divide-y divide-slate-100">
      {alertas.map((a) => (
        <li key={a.id} className={`flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start ${a.atendida ? 'opacity-70' : ''}`}>
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <NivelAlerta nivel={a.nivel} />
              <Insignia>{TIPOS_ALERTA[a.tipo] || a.tipo}</Insignia>
              {mostrarNino && (
                <Link to={`/ninos/${a.nino_id}`} className="text-sm font-medium text-marca-700 hover:underline">
                  {a.nino}
                </Link>
              )}
            </div>
            <p className="mt-1 text-sm text-slate-700">{a.mensaje}</p>
            <p className="mt-1 text-xs text-slate-500">
              Generada el {fechaHora(a.fecha_generada)}
              {a.atendida &&
                (a.atendida_por_nombre
                  ? ` · Atendida por ${a.atendida_por_nombre} el ${fechaHora(a.fecha_atendida)}`
                  : ` · Cerrada automáticamente el ${fechaHora(a.fecha_atendida)} (la situación se resolvió)`)}
            </p>
          </div>
          {!a.atendida && (
            <Boton
              variante="secundario"
              tamano="sm"
              icono={CheckCheck}
              onClick={() => atender.mutate(a.id)}
              cargando={atender.isPending && atender.variables === a.id}
            >
              Marcar atendida
            </Boton>
          )}
        </li>
      ))}
    </ul>
  );
}
