// Protege una ruta: exige sesion y, opcionalmente, uno de los roles indicados.
import { Navigate, useLocation } from 'react-router';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from './AuthContext';
import { CargandoPagina } from '../components/ui/Cargando';

export default function RutaProtegida({ roles, children }) {
  const { usuario, cargando, tiene } = useAuth();
  const ubicacion = useLocation();

  if (cargando) return <CargandoPagina />;
  if (!usuario) return <Navigate to="/login" replace state={{ desde: ubicacion.pathname + ubicacion.search }} />;

  if (roles && !tiene(roles)) {
    return (
      <div className="mx-auto mt-16 max-w-md text-center">
        <ShieldAlert className="mx-auto size-12 text-slate-400" aria-hidden />
        <h1 className="mt-4 text-lg font-semibold">Sin permiso</h1>
        <p className="mt-1 text-sm text-slate-600">Tu rol no tiene acceso a esta sección.</p>
      </div>
    );
  }
  return children;
}
