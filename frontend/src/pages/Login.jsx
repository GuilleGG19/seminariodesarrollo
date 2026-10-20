import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { HeartPulse, LogIn } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { mensajeError } from '../api/cliente';
import Boton from '../components/ui/Boton';
import { Entrada } from '../components/ui/Campos';
import { CajaError } from '../components/ui/Elementos';

export default function Login() {
  const { usuario, login } = useAuth();
  const navegar = useNavigate();
  const ubicacion = useLocation();
  const [correo, setCorreo] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  const destino = ubicacion.state?.desde || '/';
  if (usuario) return <Navigate to={destino} replace />;

  const enviar = async (e) => {
    e.preventDefault();
    setError('');
    setEnviando(true);
    try {
      await login(correo, password);
      navegar(destino, { replace: true });
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-marca-700 to-marca-800 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center text-white">
          <div className="flex size-12 items-center justify-center rounded-xl bg-white/15">
            <HeartPulse className="size-7" aria-hidden />
          </div>
          <h1 className="mt-3 text-xl font-bold">SCCVI</h1>
          <p className="text-sm text-marca-100">Sistema de Control de Crecimiento y Vacunación Infantil</p>
        </div>

        <form onSubmit={enviar} className="space-y-4 rounded-2xl bg-white p-6 shadow-xl">
          <h2 className="text-base font-semibold text-slate-900">Iniciar sesión</h2>
          {error && <CajaError mensaje={error} />}
          <Entrada
            etiqueta="Correo electrónico"
            type="email"
            autoComplete="username"
            value={correo}
            onChange={(e) => setCorreo(e.target.value)}
            required
          />
          <Entrada
            etiqueta="Contraseña"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <Boton type="submit" cargando={enviando} icono={LogIn} className="w-full">
            Entrar
          </Boton>
        </form>
        <p className="mt-4 text-center text-xs text-marca-200">Acceso exclusivo para el personal del centro de salud.</p>
      </div>
    </div>
  );
}
