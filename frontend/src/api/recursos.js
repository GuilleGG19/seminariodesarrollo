// Funciones para cada recurso de la API (ver /api/docs en el backend).
import { api, datos, limpiar } from './cliente';

// CRUD estandar: GET lista, GET :id, POST, PUT :id, DELETE :id
const crud = (ruta) => ({
  listar: (params) => datos(api.get(ruta, { params: limpiar(params) })),
  obtener: (id) => datos(api.get(`${ruta}/${id}`)),
  crear: (cuerpo) => datos(api.post(ruta, cuerpo)),
  actualizar: (id, cuerpo) => datos(api.put(`${ruta}/${id}`, cuerpo)),
  eliminar: (id) => datos(api.delete(`${ruta}/${id}`)),
});

export const auth = {
  login: (correo, password) => datos(api.post('/auth/login', { correo, password }, { sinRedireccion: true })),
  logout: () => datos(api.post('/auth/logout', {}, { sinRedireccion: true })),
  perfil: () => datos(api.get('/auth/perfil', { sinRedireccion: true })),
  cambiarPassword: (password_actual, password_nueva) =>
    datos(api.patch('/auth/password', { password_actual, password_nueva }, { sinRedireccion: true })),
};

export const dashboard = {
  resumen: (params) => datos(api.get('/dashboard', { params: limpiar(params) })),
};

export const comunidades = crud('/comunidades');
export const padres = crud('/padres');
export const vacunas = crud('/vacunas');
export const vacunaciones = crud('/vacunaciones');

export const ninos = {
  ...crud('/ninos'),
  esquema: (id) => datos(api.get(`/ninos/${id}/esquema`)),
};

export const registros = {
  ...crud('/registros-crecimiento'),
  curva: (ninoId) => datos(api.get(`/registros-crecimiento/curva/${ninoId}`)),
};

export const alertas = {
  listar: (params) => datos(api.get('/alertas', { params: limpiar(params) })),
  atender: (id) => datos(api.patch(`/alertas/${id}/atendida`)),
  generar: () => datos(api.post('/alertas/generar')),
};

export const campanas = {
  listar: () => datos(api.get('/campanas')),
  obtener: (id) => datos(api.get(`/campanas/${id}`)),
  vistaPrevia: (filtros) => datos(api.post('/campanas/vista-previa', filtros)),
  crear: (cuerpo) => datos(api.post('/campanas', cuerpo)),
};

export const notificaciones = {
  listar: (params) => datos(api.get('/notificaciones', { params: limpiar(params) })),
  canales: () => datos(api.get('/notificaciones/canales')),
  procesar: () => datos(api.post('/notificaciones/procesar')),
  reintentar: (id) => datos(api.post(`/notificaciones/${id}/reintentar`)),
  prueba: (canal, destino) => datos(api.post('/notificaciones/prueba', { canal, destino })),
};

export const carnets = {
  listar: (params) => datos(api.get('/carnets-qr', { params: limpiar(params) })),
  generar: (nino_id, dias_vigencia) => datos(api.post('/carnets-qr', { nino_id, dias_vigencia })),
  revocar: (id) => datos(api.patch(`/carnets-qr/${id}/revocar`)),
};

export const carnetPublico = {
  estado: (token) => datos(api.get(`/carnet-publico/${token}`, { sinRedireccion: true })),
  acceder: (token, pin) => datos(api.post(`/carnet-publico/${token}/acceso`, { pin }, { sinRedireccion: true })),
};

export const usuarios = {
  listar: () => datos(api.get('/usuarios')),
  roles: () => datos(api.get('/usuarios/roles')),
  crear: (cuerpo) => datos(api.post('/usuarios', cuerpo)),
  actualizar: (id, cuerpo) => datos(api.put(`/usuarios/${id}`, cuerpo)),
  cambiarEstado: (id, estado) => datos(api.patch(`/usuarios/${id}/estado`, { estado })),
  asignarPassword: (id, password) => datos(api.patch(`/usuarios/${id}/password`, { password })),
};

export const auditoria = {
  listar: (params) => datos(api.get('/auditoria', { params: limpiar(params) })),
};

export const reportes = {
  obtener: (tipoRuta, params) => datos(api.get(`/reportes/${tipoRuta}`, { params: limpiar(params) })),
  // Descarga el reporte como archivo (PDF o Excel) con la sesion actual
  async descargar(tipoRuta, params, formato) {
    const respuesta = await api.get(`/reportes/${tipoRuta}`, {
      params: limpiar({ ...params, formato }),
      responseType: 'blob',
    });
    const disposicion = respuesta.headers['content-disposition'] || '';
    const nombre = /filename="([^"]+)"/.exec(disposicion)?.[1] || `reporte.${formato}`;
    const url = URL.createObjectURL(respuesta.data);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = nombre;
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    URL.revokeObjectURL(url);
  },
};
