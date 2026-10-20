// Estructura de la aplicacion: menu lateral (segun el rol) + barra superior.
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard, Baby, Users, MapPin, Syringe, Bell, Megaphone, FileBarChart, Send,
  UserCog, ScrollText, Menu, X, LogOut, KeyRound, HeartPulse,
} from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { alertas } from '../../api/recursos';
import { ROLES, TODOS, GESTION, ADMIN } from '../../utils/roles';

const SECCIONES = [
  {
    titulo: 'Atención',
    enlaces: [
      { a: '/', texto: 'Inicio', icono: LayoutDashboard, roles: TODOS, exacto: true },
      { a: '/ninos', texto: 'Niños', icono: Baby, roles: TODOS },
      { a: '/padres', texto: 'Padres y tutores', icono: Users, roles: TODOS },
      { a: '/alertas', texto: 'Alertas', icono: Bell, roles: TODOS, contador: true },
    ],
  },
  {
    titulo: 'Gestión',
    enlaces: [
      { a: '/comunidades', texto: 'Comunidades', icono: MapPin, roles: TODOS },
      { a: '/vacunas', texto: 'Catálogo de vacunas', icono: Syringe, roles: TODOS },
      { a: '/campanas', texto: 'Campañas', icono: Megaphone, roles: GESTION },
      { a: '/notificaciones', texto: 'Notificaciones', icono: Send, roles: TODOS },
      { a: '/reportes', texto: 'Reportes', icono: FileBarChart, roles: GESTION },
    ],
  },
  {
    titulo: 'Administración',
    enlaces: [
      { a: '/usuarios', texto: 'Usuarios', icono: UserCog, roles: ADMIN },
      { a: '/auditoria', texto: 'Auditoría', icono: ScrollText, roles: ADMIN },
    ],
  },
];

function MenuLateral({ alNavegar }) {
  const { tiene } = useAuth();
  // Numero de alertas criticas abiertas (se refresca cada 2 minutos)
  const { data: criticas } = useQuery({
    queryKey: ['alertas', 'contador-criticas'],
    queryFn: () => alertas.listar({ atendida: 'false', nivel: 'critica', limite: 1 }),
    refetchInterval: 2 * 60 * 1000,
  });

  return (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4" aria-label="Menú principal">
      {SECCIONES.map((seccion) => {
        const visibles = seccion.enlaces.filter((e) => tiene(e.roles));
        if (visibles.length === 0) return null;
        return (
          <div key={seccion.titulo}>
            <p className="px-3 pb-1 text-xs font-semibold tracking-wide text-marca-200 uppercase">{seccion.titulo}</p>
            <ul className="space-y-0.5">
              {visibles.map((e) => (
                <li key={e.a}>
                  <NavLink
                    to={e.a}
                    end={e.exacto}
                    onClick={alNavegar}
                    className={({ isActive }) =>
                      `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                        isActive ? 'bg-white/15 text-white' : 'text-marca-100 hover:bg-white/10 hover:text-white'
                      }`
                    }
                  >
                    <e.icono className="size-4.5 shrink-0" aria-hidden />
                    <span className="flex-1">{e.texto}</span>
                    {e.contador && criticas?.total > 0 && (
                      <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-xs font-semibold text-white" title="Alertas críticas abiertas">
                        {criticas.total}
                      </span>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

function Marca() {
  return (
    <div className="flex items-center gap-2.5 px-5 py-4">
      <div className="flex size-9 items-center justify-center rounded-lg bg-white/15">
        <HeartPulse className="size-5 text-white" aria-hidden />
      </div>
      <div className="leading-tight">
        <p className="text-sm font-bold text-white">SCCVI</p>
        <p className="text-xs text-marca-200">Crecimiento y vacunación</p>
      </div>
    </div>
  );
}

export default function Layout() {
  const { usuario, logout } = useAuth();
  const navegar = useNavigate();
  const ubicacion = useLocation();
  const [menuAbierto, setMenuAbierto] = useState(false);

  // Cierra el menu movil al cambiar de pagina
  useEffect(() => setMenuAbierto(false), [ubicacion.pathname]);

  const salir = async () => {
    await logout();
    navegar('/login', { replace: true });
  };

  const iniciales = usuario.nombre_completo
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');

  return (
    <div className="min-h-screen">
      {/* Menu lateral fijo (escritorio) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-marca-700 lg:flex">
        <Marca />
        <MenuLateral />
      </aside>

      {/* Menu deslizable (movil) */}
      {menuAbierto && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setMenuAbierto(false)} aria-hidden />
          <aside className="relative flex h-full w-72 max-w-[85%] flex-col bg-marca-700">
            <div className="flex items-center justify-between pr-3">
              <Marca />
              <button type="button" onClick={() => setMenuAbierto(false)} className="rounded-lg p-1.5 text-marca-100 hover:bg-white/10" aria-label="Cerrar menú">
                <X className="size-5" />
              </button>
            </div>
            <MenuLateral alNavegar={() => setMenuAbierto(false)} />
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="no-imprimir sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6">
          <button type="button" onClick={() => setMenuAbierto(true)} className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 lg:hidden" aria-label="Abrir menú">
            <Menu className="size-5" />
          </button>
          <div className="flex-1" />
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-slate-800">{usuario.nombre_completo}</p>
              <p className="text-xs text-slate-500">{ROLES[usuario.rol]}</p>
            </div>
            <div className="flex size-8 items-center justify-center rounded-full bg-marca-100 text-xs font-semibold text-marca-700" aria-hidden>
              {iniciales}
            </div>
            <NavLink to="/cuenta" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700" title="Mi cuenta" aria-label="Mi cuenta">
              <KeyRound className="size-5" />
            </NavLink>
            <button type="button" onClick={salir} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700" title="Cerrar sesión" aria-label="Cerrar sesión">
              <LogOut className="size-5" />
            </button>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
