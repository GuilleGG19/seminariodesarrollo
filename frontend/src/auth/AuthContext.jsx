// Estado de la sesion. Al abrir la app se pregunta al backend quien es el usuario
// (GET /auth/perfil): si la cookie es valida, la sesion continua.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { auth } from '../api/recursos';
import { alExpirarSesion } from '../api/cliente';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [cargando, setCargando] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    auth
      .perfil()
      .then((r) => setUsuario(r.usuario))
      .catch(() => setUsuario(null))
      .finally(() => setCargando(false));
  }, []);

  // Si cualquier peticion responde 401, la sesion termino (expiro o se cerro en otro lado)
  useEffect(() => {
    alExpirarSesion(() => {
      setUsuario((actual) => {
        if (actual) toast.warning('Tu sesión terminó. Inicia sesión de nuevo.');
        return null;
      });
      queryClient.clear();
    });
  }, [queryClient]);

  const login = useCallback(async (correo, password) => {
    const r = await auth.login(correo, password);
    setUsuario(r.usuario);
    return r.usuario;
  }, []);

  const logout = useCallback(async () => {
    try {
      await auth.logout();
    } finally {
      setUsuario(null);
      queryClient.clear();
    }
  }, [queryClient]);

  // tiene('administrador', 'encargado') -> true si el usuario tiene alguno de esos roles
  const tiene = useCallback((...roles) => Boolean(usuario && roles.flat().includes(usuario.rol)), [usuario]);

  const valor = useMemo(() => ({ usuario, cargando, login, logout, tiene }), [usuario, cargando, login, logout, tiene]);
  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
