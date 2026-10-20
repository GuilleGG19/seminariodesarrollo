import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import RutaProtegida from './auth/RutaProtegida';
import Layout from './components/layout/Layout';
import { CargandoPagina } from './components/ui/Cargando';
import { ADMIN, GESTION } from './utils/roles';

// Cada pagina se descarga solo cuando se visita (carga inicial mas rapida)
const Login = lazy(() => import('./pages/Login'));
const CarnetPublico = lazy(() => import('./pages/publico/CarnetPublico'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Ninos = lazy(() => import('./pages/ninos/Ninos'));
const NinoDetalle = lazy(() => import('./pages/ninos/NinoDetalle'));
const Padres = lazy(() => import('./pages/padres/Padres'));
const Comunidades = lazy(() => import('./pages/Comunidades'));
const Vacunas = lazy(() => import('./pages/Vacunas'));
const Alertas = lazy(() => import('./pages/Alertas'));
const Campanas = lazy(() => import('./pages/campanas/Campanas'));
const Reportes = lazy(() => import('./pages/Reportes'));
const Notificaciones = lazy(() => import('./pages/Notificaciones'));
const Usuarios = lazy(() => import('./pages/Usuarios'));
const Auditoria = lazy(() => import('./pages/Auditoria'));
const MiCuenta = lazy(() => import('./pages/MiCuenta'));

export default function App() {
  return (
    <Suspense fallback={<CargandoPagina />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        {/* Pagina publica a la que lleva el QR del carnet (padres, sin sesion) */}
        <Route path="/carnet/:token" element={<CarnetPublico />} />

        <Route
          element={
            <RutaProtegida>
              <Layout />
            </RutaProtegida>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="ninos" element={<Ninos />} />
          <Route path="ninos/:id" element={<NinoDetalle />} />
          <Route path="padres" element={<Padres />} />
          <Route path="comunidades" element={<Comunidades />} />
          <Route path="vacunas" element={<Vacunas />} />
          <Route path="alertas" element={<Alertas />} />
          <Route path="notificaciones" element={<Notificaciones />} />
          <Route path="cuenta" element={<MiCuenta />} />
          <Route path="campanas" element={<RutaProtegida roles={GESTION}><Campanas /></RutaProtegida>} />
          <Route path="reportes" element={<RutaProtegida roles={GESTION}><Reportes /></RutaProtegida>} />
          <Route path="usuarios" element={<RutaProtegida roles={ADMIN}><Usuarios /></RutaProtegida>} />
          <Route path="auditoria" element={<RutaProtegida roles={ADMIN}><Auditoria /></RutaProtegida>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
