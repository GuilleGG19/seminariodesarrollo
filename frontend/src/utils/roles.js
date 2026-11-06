// Roles del sistema (seccion 2 del documento) y permisos usados en la interfaz.
// La autorizacion REAL la hace el backend; esto solo oculta lo que no se puede usar.
export const ROLES = {
  administrador: 'Administrador',
  encargado: 'Encargado del centro',
  personal_salud: 'Personal de salud',
};

export const TODOS = ['administrador', 'encargado', 'personal_salud'];
export const GESTION = ['administrador', 'encargado'];
export const ADMIN = ['administrador'];
