// Cliente HTTP de la API. La sesion viaja en una cookie httpOnly (el frontend
// nunca ve el token), por eso todas las peticiones van con withCredentials.
import axios from 'axios';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: true,
  timeout: 30000,
});

// Lo que hay que hacer cuando la sesion expira (lo registra AuthContext)
let alExpirar = null;
export const alExpirarSesion = (fn) => {
  alExpirar = fn;
};

api.interceptors.response.use(
  (respuesta) => respuesta,
  (error) => {
    // sinRedireccion: peticiones donde un 401 es una respuesta esperada (login, perfil, carnet publico)
    if (error.response?.status === 401 && !error.config?.sinRedireccion && alExpirar) {
      alExpirar();
    }
    return Promise.reject(error);
  }
);

// Mensaje legible para mostrar al usuario
export function mensajeError(error) {
  if (error?.response?.data?.error) return error.response.data.error;
  if (error?.code === 'ERR_NETWORK') return 'No se pudo conectar con el servidor. Verifica que el backend esté encendido.';
  if (error?.code === 'ECONNABORTED') return 'El servidor tardó demasiado en responder.';
  return 'Ocurrió un error inesperado.';
}

// Quita filtros vacios para no enviar "?buscar=&comunidad_id="
export const limpiar = (params = {}) =>
  Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v !== undefined && v !== null));

export const datos = (promesa) => promesa.then((r) => r.data);
