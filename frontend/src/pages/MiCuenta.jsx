// Datos del usuario y cambio de su propia contrasena.
import { useState } from 'react';
import { toast } from 'sonner';
import { auth } from '../api/recursos';
import { mensajeError } from '../api/cliente';
import { useAuth } from '../auth/AuthContext';
import { Dato, EncabezadoPagina, Tarjeta, CajaError } from '../components/ui/Elementos';
import { Entrada } from '../components/ui/Campos';
import Boton from '../components/ui/Boton';
import { ROLES } from '../utils/roles';

export default function MiCuenta() {
  const { usuario } = useAuth();
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const enviar = async (e) => {
    e.preventDefault();
    setError('');
    if (nueva !== confirmacion) {
      setError('La confirmación no coincide con la nueva contraseña');
      return;
    }
    setGuardando(true);
    try {
      const r = await auth.cambiarPassword(actual, nueva);
      toast.success(r.mensaje);
      setActual('');
      setNueva('');
      setConfirmacion('');
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <>
      <EncabezadoPagina titulo="Mi cuenta" />
      <div className="grid max-w-3xl gap-4 md:grid-cols-2">
        <Tarjeta titulo="Mis datos">
          <dl className="space-y-3">
            <Dato etiqueta="Nombre">{usuario.nombre_completo}</Dato>
            <Dato etiqueta="Correo">{usuario.correo}</Dato>
            <Dato etiqueta="Rol">{ROLES[usuario.rol]}</Dato>
          </dl>
        </Tarjeta>
        <Tarjeta titulo="Cambiar contraseña">
          <form onSubmit={enviar} className="space-y-4">
            {error && <CajaError mensaje={error} />}
            <Entrada etiqueta="Contraseña actual" type="password" autoComplete="current-password" value={actual} onChange={(e) => setActual(e.target.value)} required />
            <Entrada etiqueta="Nueva contraseña" type="password" autoComplete="new-password" value={nueva} onChange={(e) => setNueva(e.target.value)} required minLength={8} ayuda="Mínimo 8 caracteres, con letras y números" />
            <Entrada etiqueta="Confirmar nueva contraseña" type="password" autoComplete="new-password" value={confirmacion} onChange={(e) => setConfirmacion(e.target.value)} required />
            <Boton type="submit" cargando={guardando}>Cambiar contraseña</Boton>
            <p className="text-xs text-slate-500">Se cerrará tu sesión en los demás dispositivos.</p>
          </form>
        </Tarjeta>
      </div>
    </>
  );
}
