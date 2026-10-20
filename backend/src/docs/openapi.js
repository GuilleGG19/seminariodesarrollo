// Especificacion OpenAPI 3 de la API REST del SCCVI (seccion 11 del documento).
// Se sirve en /api/docs (interfaz Swagger UI) y /api/docs.json (especificacion).

// ---------- Ayudantes para no repetir ----------
const ref = (nombre) => ({ $ref: `#/components/schemas/${nombre}` });
const json = (schema) => ({ content: { 'application/json': { schema } } });
const cuerpo = (schema) => ({ required: true, ...json(schema) });
const ok = (descripcion, schema) => ({ description: descripcion, ...(schema ? json(schema) : {}) });
const paginado = (item) => ({
  type: 'object',
  properties: {
    datos: { type: 'array', items: ref(item) },
    total: { type: 'integer' },
    pagina: { type: 'integer' },
    limite: { type: 'integer' },
    total_paginas: { type: 'integer' },
  },
});
const lista = (item) => ({ type: 'array', items: ref(item) });

const q = (name, descripcion, schema = { type: 'string' }) => ({ name, in: 'query', description: descripcion, schema });
const uuidQ = (name, descripcion) => q(name, descripcion, { type: 'string', format: 'uuid' });
const idPath = { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } };
const PAGINACION = [
  q('pagina', 'Página (desde 1)', { type: 'integer', minimum: 1, default: 1 }),
  q('limite', 'Elementos por página', { type: 'integer', minimum: 1, maximum: 200, default: 50 }),
];
const FORMATO = q('formato', 'json (por defecto), xlsx o pdf', { type: 'string', enum: ['json', 'xlsx', 'pdf'] });

const ERRORES = {
  400: { description: 'Datos inválidos', ...json(ref('Error')) },
  401: { description: 'No autenticado o sesión expirada', ...json(ref('Error')) },
  403: { description: 'Sin permiso para esta acción', ...json(ref('Error')) },
  404: { description: 'No encontrado', ...json(ref('Error')) },
  409: { description: 'Conflicto con datos existentes', ...json(ref('Error')) },
};
const err = (...codigos) => Object.fromEntries(codigos.map((c) => [c, ERRORES[c]]));

// Operacion con etiqueta, roles permitidos y respuestas de error habituales
function op(tag, summary, { roles, params = [], body, respuestas = {}, publica = false } = {}) {
  return {
    tags: [tag],
    summary,
    description: roles ? `Roles permitidos: ${roles}` : undefined,
    security: publica ? [] : undefined,
    parameters: params.length ? params : undefined,
    requestBody: body,
    responses: { ...respuestas, ...(publica ? {} : err(401, 403)) },
  };
}

const TODOS = 'administrador, encargado, personal_salud';
const GESTION = 'administrador, encargado';
const ADMIN = 'administrador';

// CRUD estandar: GET lista, POST, GET/:id, PUT/:id, DELETE/:id
function crud(tag, base, { item, entrada, filtros = [], paginada = false, rolesEscritura = TODOS, rolesBorrado = ADMIN }) {
  return {
    [base]: {
      get: op(tag, `Listar ${tag.toLowerCase()}`, {
        roles: TODOS,
        params: [...filtros, ...(paginada ? PAGINACION : [])],
        respuestas: { 200: ok('Listado', paginada ? paginado(item) : lista(item)) },
      }),
      post: op(tag, `Crear`, {
        roles: rolesEscritura,
        body: cuerpo(ref(entrada)),
        respuestas: { 201: ok('Creado', ref(item)), ...err(400, 409) },
      }),
    },
    [`${base}/{id}`]: {
      get: op(tag, 'Obtener por id', { roles: TODOS, params: [idPath], respuestas: { 200: ok('Detalle', ref(item)), ...err(404) } }),
      put: op(tag, 'Actualizar', {
        roles: rolesEscritura,
        params: [idPath],
        body: cuerpo(ref(entrada)),
        respuestas: { 200: ok('Actualizado', ref(item)), ...err(400, 404, 409) },
      }),
      delete: op(tag, 'Eliminar', {
        roles: rolesBorrado,
        params: [idPath],
        respuestas: { 200: ok('Eliminado', ref('Mensaje')), ...err(404, 409) },
      }),
    },
  };
}

// ---------- Esquemas ----------
const s = (properties, required) => ({ type: 'object', properties, required });
const str = (extra = {}) => ({ type: 'string', ...extra });
const int = (extra = {}) => ({ type: 'integer', ...extra });
const num = (extra = {}) => ({ type: 'number', ...extra });
const fecha = { type: 'string', format: 'date', example: '2026-01-15' };
const fechaHora = { type: 'string', format: 'date-time' };
const uuid = { type: 'string', format: 'uuid' };
const nullable = (schema) => ({ ...schema, nullable: true });

const schemas = {
  Error: s({ error: str() }),
  Mensaje: s({ mensaje: str() }),
  Usuario: s({ id: uuid, nombre_completo: str(), correo: str(), estado: str({ enum: ['activo', 'inactivo'] }), rol_id: uuid, rol: str(), fecha_creacion: fechaHora }),
  UsuarioEntrada: s({ nombre_completo: str(), correo: str({ format: 'email' }), rol_id: uuid, password: str({ minLength: 8, description: 'Solo al crear. Debe incluir letras y números' }) }, ['nombre_completo', 'correo', 'rol_id']),
  Comunidad: s({ id: uuid, nombre: str(), ubicacion: str(), num_familias_estimado: nullable(int()), total_padres: int(), total_ninos: int() }),
  ComunidadEntrada: s({ nombre: str({ maxLength: 150 }), ubicacion: str({ maxLength: 255 }), num_familias_estimado: nullable(int({ minimum: 0 })) }, ['nombre', 'ubicacion']),
  Padre: s({
    id: uuid, nombre_completo: str(), dpi: str({ description: 'Enmascarado en listados (•••••••••0101); completo en el detalle' }),
    telefono: nullable(str()), correo: nullable(str()), canal_preferido: str({ enum: ['Email', 'Telegram'] }),
    telegram_chat_id: nullable(str()), comunidad_id: uuid, comunidad: str(), total_ninos: int(),
    ninos: { type: 'array', description: 'Solo en el detalle', items: s({ id: uuid, nombre: str(), fecha_nacimiento: fecha, sexo: str() }) },
  }),
  PadreEntrada: s({
    comunidad_id: uuid, nombre_completo: str({ maxLength: 150 }), dpi: str({ pattern: '^\\d{13}$', example: '1234567890101' }),
    telefono: nullable(str({ example: '55551234' })), correo: nullable(str({ format: 'email' })),
    canal_preferido: str({ enum: ['Email', 'Telegram'], default: 'Email' }), telegram_chat_id: nullable(str({ pattern: '^\\d+$' })),
  }, ['comunidad_id', 'nombre_completo', 'dpi']),
  Nino: s({ id: uuid, nombre: str(), fecha_nacimiento: fecha, sexo: str({ enum: ['M', 'F'] }), edad_meses: int(), comunidad_id: uuid, comunidad: str(), padre_id: uuid, padre: str() }),
  NinoEntrada: s({ padre_id: uuid, nombre: str({ maxLength: 150 }), fecha_nacimiento: fecha, sexo: str({ enum: ['M', 'F'] }) }, ['padre_id', 'nombre', 'fecha_nacimiento', 'sexo']),
  Esquema: s({
    nino: s({ id: uuid, nombre: str(), fecha_nacimiento: fecha, edad_meses: int() }),
    resumen: s({ aplicadas: int(), atrasadas: int(), pendientes: int(), sin_fecha: int(), total: int(), al_dia: { type: 'boolean' } }),
    vacunas: { type: 'array', items: s({
      vacuna_id: uuid, vacuna: str(), dosis_total: int(), aplicadas: int(), completa: { type: 'boolean' },
      dosis: { type: 'array', items: s({
        numero_dosis: int(), edad_recomendada_meses: nullable(int()), fecha_objetivo: nullable(fecha), fecha_aplicada: nullable(fecha),
        estado: str({ enum: ['aplicada', 'atrasada', 'pendiente', 'sin_fecha'] }), dias_atraso: nullable(int()),
        programada: { type: 'boolean' }, vacunacion_id: nullable(uuid),
      }) },
    }) },
  }),
  Registro: s({ id: uuid, nino_id: uuid, nino: str(), peso_kg: num(), talla_cm: num(), fecha_medicion: fecha, edad_dias: int(), edad_meses: int(), percentil_peso: nullable(num()), percentil_talla: nullable(num()), advertencias: { type: 'array', items: str() } }),
  RegistroEntrada: s({ nino_id: uuid, peso_kg: num({ minimum: 0.3, maximum: 150 }), talla_cm: num({ minimum: 20, maximum: 220 }), fecha_medicion: { ...fecha, description: 'Opcional al crear (hoy). Obligatoria al actualizar' } }, ['peso_kg', 'talla_cm']),
  Curva: s({
    nino: s({ id: uuid, nombre: str(), sexo: str(), fecha_nacimiento: fecha }),
    mediciones: { type: 'array', items: ref('Registro') },
    referencia: s({
      peso_edad: { type: 'array', items: s({ edad_meses: int(), p5: num(), p25: num(), p50: num(), p75: num(), p95: num() }) },
      talla_edad: { type: 'array', items: s({ edad_meses: int(), p5: num(), p25: num(), p50: num(), p75: num(), p95: num() }) },
    }),
  }),
  Vacuna: s({ id: uuid, nombre: str(), edad_recomendada_meses: int(), dosis_total: int(), edades_dosis_meses: nullable({ type: 'array', items: int() }) }),
  VacunaEntrada: s({ nombre: str(), edad_recomendada_meses: int({ minimum: 0, maximum: 216 }), dosis_total: int({ minimum: 1, maximum: 10, default: 1 }), edades_dosis_meses: nullable({ type: 'array', items: int(), example: [2, 4, 6, 18], description: 'Edad de cada dosis, en orden; la primera = edad_recomendada_meses' }) }, ['nombre', 'edad_recomendada_meses']),
  Vacunacion: s({ id: uuid, nino_id: uuid, nino: str(), vacuna_id: uuid, vacuna: str(), dosis_total: int(), numero_dosis: int(), fecha_aplicada: nullable(fecha), proxima_dosis: nullable(fecha), estado: str({ enum: ['completa', 'pendiente', 'atrasada'] }) }),
  VacunacionEntrada: s({ nino_id: uuid, vacuna_id: uuid, numero_dosis: int({ minimum: 1, default: 1 }), fecha_aplicada: nullable(fecha), proxima_dosis: nullable(fecha) }, ['nino_id', 'vacuna_id']),
  VacunacionFechas: s({ fecha_aplicada: nullable(fecha), proxima_dosis: nullable(fecha) }),
  Alerta: s({ id: uuid, nino_id: uuid, nino: str(), comunidad_id: uuid, tipo: str({ enum: ['desnutricion', 'sobrepeso', 'talla_baja', 'sin_registros', 'vacuna_atrasada'] }), nivel: str({ enum: ['preventiva', 'critica'] }), mensaje: str(), fecha_generada: fechaHora, atendida: { type: 'boolean' }, fecha_atendida: nullable(fechaHora), atendida_por: nullable(uuid), atendida_por_nombre: nullable(str()) }),
  ResumenAlertas: s({ ninos_revisados: int(), creadas: int(), actualizadas: int(), cerradas_automaticamente: int(), silenciadas: int(), avisos_encolados: int() }),
  FiltrosCampana: s({ comunidad_id: uuid, vacuna_id: uuid, edad_min_meses: int({ minimum: 0 }), edad_max_meses: int({ minimum: 0 }), estado_vacunacion: str({ enum: ['pendiente', 'atrasada'], description: 'atrasada = dosis vencidas; pendiente = dosis en los próximos 30 días' }), sin_control_reciente: { type: 'boolean' } }),
  Campana: s({ id: uuid, mensaje: str(), fecha_creacion: fechaHora, fecha_programada: nullable(fecha), total_destinatarios: int(), comunidad: nullable(str()), vacuna: nullable(str()), creada_por: str(), pendientes: int(), enviadas: int(), fallidas: int() }),
  Notificacion: s({ id: uuid, canal: str({ enum: ['Email', 'Telegram'] }), estado_envio: str({ enum: ['pendiente', 'enviado', 'fallido'] }), intentos: int(), ultimo_error: nullable(str()), fecha_creacion: fechaHora, fecha_envio: nullable(fechaHora), nino: str(), padre: str(), origen: str({ enum: ['alerta', 'campana'] }), alerta_id: nullable(uuid), campana_id: nullable(uuid) }),
  Carnet: s({ id: uuid, nino_id: uuid, nino: str(), fecha_generado: fechaHora, fecha_expiracion: fechaHora, estado: str({ enum: ['activo', 'expirado', 'revocado'] }), bloqueado: { type: 'boolean' }, intentos_fallidos: int(), intentos_totales: int() }),
  CarnetGenerado: s({ id: uuid, nino_id: uuid, fecha_expiracion: fechaHora, token: str(), pin: str({ description: 'Solo se muestra esta vez' }), url: str(), qr_data_url: str({ description: 'Imagen PNG en base64 (data URL)' }) }),
  Reporte: s({ titulo: str(), subtitulo: str(), columnas: { type: 'array', items: s({ clave: str(), titulo: str(), ancho: num() }) }, filas: { type: 'array', items: { type: 'object' } } }),
  Auditoria: s({ id: int(), fecha: fechaHora, metodo: str(), ruta: str(), estado: int(), ip: str(), usuario_id: nullable(uuid), usuario: nullable(str()), correo: nullable(str()) }),
};

// ---------- Rutas ----------
const paths = {
  '/auth/login': {
    post: op('Autenticación', 'Iniciar sesión (deja la cookie httpOnly "token")', {
      publica: true,
      body: cuerpo(s({ correo: str({ format: 'email' }), password: str() }, ['correo', 'password'])),
      respuestas: { 200: ok('Sesión iniciada', s({ mensaje: str(), usuario: ref('Usuario') })), ...err(400, 401), 429: { description: 'Demasiados intentos' } },
    }),
  },
  '/auth/logout': { post: op('Autenticación', 'Cerrar sesión (invalida todas las sesiones del usuario)', { publica: true, respuestas: { 200: ok('Sesión cerrada', ref('Mensaje')) } }) },
  '/auth/perfil': { get: op('Autenticación', 'Usuario de la sesión actual', { roles: TODOS, respuestas: { 200: ok('Perfil', s({ usuario: ref('Usuario') })) } }) },
  '/auth/password': {
    patch: op('Autenticación', 'Cambiar mi contraseña', {
      roles: TODOS,
      body: cuerpo(s({ password_actual: str(), password_nueva: str({ minLength: 8 }) }, ['password_actual', 'password_nueva'])),
      respuestas: { 200: ok('Actualizada', ref('Mensaje')), ...err(400) },
    }),
  },

  '/dashboard': {
    get: op('Dashboard', 'Indicadores generales (totales, alertas, nutrición, vacunación, tendencia)', {
      roles: TODOS,
      params: [uuidQ('comunidad_id', 'Filtrar por comunidad')],
      respuestas: { 200: ok('Indicadores', { type: 'object' }) },
    }),
  },

  '/usuarios/roles': { get: op('Usuarios', 'Listar roles', { roles: ADMIN, respuestas: { 200: ok('Roles', { type: 'array', items: s({ id: uuid, nombre: str() }) }) } }) },
  '/usuarios': {
    get: op('Usuarios', 'Listar usuarios', { roles: ADMIN, respuestas: { 200: ok('Usuarios', lista('Usuario')) } }),
    post: op('Usuarios', 'Crear usuario', { roles: ADMIN, body: cuerpo(ref('UsuarioEntrada')), respuestas: { 201: ok('Creado', ref('Usuario')), ...err(400, 409) } }),
  },
  '/usuarios/{id}': {
    get: op('Usuarios', 'Obtener usuario', { roles: ADMIN, params: [idPath], respuestas: { 200: ok('Usuario', ref('Usuario')), ...err(404) } }),
    put: op('Usuarios', 'Actualizar usuario', { roles: ADMIN, params: [idPath], body: cuerpo(ref('UsuarioEntrada')), respuestas: { 200: ok('Actualizado', ref('Usuario')), ...err(400, 404) } }),
  },
  '/usuarios/{id}/estado': {
    patch: op('Usuarios', 'Activar o desactivar', { roles: ADMIN, params: [idPath], body: cuerpo(s({ estado: str({ enum: ['activo', 'inactivo'] }) }, ['estado'])), respuestas: { 200: ok('Actualizado', ref('Usuario')), ...err(400, 404) } }),
  },
  '/usuarios/{id}/password': {
    patch: op('Usuarios', 'Asignar contraseña (cierra las sesiones del usuario)', { roles: ADMIN, params: [idPath], body: cuerpo(s({ password: str({ minLength: 8 }) }, ['password'])), respuestas: { 200: ok('Actualizada', ref('Mensaje')), ...err(400, 404) } }),
  },

  ...crud('Comunidades', '/comunidades', { item: 'Comunidad', entrada: 'ComunidadEntrada', filtros: [q('buscar', 'Texto en el nombre')], rolesEscritura: GESTION }),
  ...crud('Padres', '/padres', {
    item: 'Padre', entrada: 'PadreEntrada', paginada: true,
    filtros: [q('buscar', 'Nombre o DPI completo (13 dígitos)'), uuidQ('comunidad_id', 'Comunidad')],
  }),
  ...crud('Niños', '/ninos', {
    item: 'Nino', entrada: 'NinoEntrada', paginada: true,
    filtros: [q('buscar', 'Texto en el nombre'), uuidQ('comunidad_id', 'Comunidad'), uuidQ('padre_id', 'Padre'), q('sexo', 'M o F', { type: 'string', enum: ['M', 'F'] })],
  }),
  '/ninos/{id}/esquema': {
    get: op('Niños', 'Cartilla de vacunación: esquema esperado vs aplicado', { roles: TODOS, params: [idPath], respuestas: { 200: ok('Esquema', ref('Esquema')), ...err(404) } }),
  },

  ...crud('Crecimiento', '/registros-crecimiento', { item: 'Registro', entrada: 'RegistroEntrada', paginada: true, filtros: [uuidQ('nino_id', 'Niño')] }),
  '/registros-crecimiento/curva/{ninoId}': {
    get: op('Crecimiento', 'Curvas de crecimiento (mediciones + percentiles OMS 5-95)', {
      roles: TODOS,
      params: [{ name: 'ninoId', in: 'path', required: true, schema: uuid }],
      respuestas: { 200: ok('Curva', ref('Curva')), ...err(404) },
    }),
  },

  ...crud('Vacunas', '/vacunas', { item: 'Vacuna', entrada: 'VacunaEntrada', filtros: [q('buscar', 'Texto en el nombre')], rolesEscritura: GESTION }),
  ...crud('Vacunaciones', '/vacunaciones', {
    item: 'Vacunacion', entrada: 'VacunacionEntrada', paginada: true,
    filtros: [uuidQ('nino_id', 'Niño'), uuidQ('vacuna_id', 'Vacuna'), q('estado', 'Estado', { type: 'string', enum: ['completa', 'pendiente', 'atrasada'] })],
  }),

  '/alertas': {
    get: op('Alertas', 'Listar alertas', {
      roles: TODOS,
      params: [
        uuidQ('nino_id', 'Niño'), uuidQ('comunidad_id', 'Comunidad'),
        q('tipo', 'Tipo', { type: 'string', enum: ['desnutricion', 'sobrepeso', 'talla_baja', 'sin_registros', 'vacuna_atrasada'] }),
        q('nivel', 'Nivel', { type: 'string', enum: ['preventiva', 'critica'] }),
        q('atendida', 'true o false', { type: 'string', enum: ['true', 'false'] }),
        ...PAGINACION,
      ],
      respuestas: { 200: ok('Alertas', paginado('Alerta')) },
    }),
  },
  '/alertas/generar': { post: op('Alertas', 'Revisar todas las alertas ahora', { roles: GESTION, respuestas: { 200: ok('Resumen', ref('ResumenAlertas')) } }) },
  '/alertas/{id}': { get: op('Alertas', 'Obtener alerta', { roles: TODOS, params: [idPath], respuestas: { 200: ok('Alerta', ref('Alerta')), ...err(404) } }) },
  '/alertas/{id}/atendida': { patch: op('Alertas', 'Marcar como atendida', { roles: TODOS, params: [idPath], respuestas: { 200: ok('Alerta', ref('Alerta')), ...err(404, 409) } }) },

  '/campanas': {
    get: op('Campañas', 'Listar campañas', { roles: GESTION, respuestas: { 200: ok('Campañas', lista('Campana')) } }),
    post: op('Campañas', 'Crear campaña (encola un aviso por familia)', {
      roles: GESTION,
      body: cuerpo({ allOf: [s({ mensaje: str({ maxLength: 1000 }), fecha_programada: fecha }, ['mensaje']), ref('FiltrosCampana')] }),
      respuestas: { 201: ok('Creada', ref('Campana')), ...err(400, 404), 422: { description: 'Ninguna familia cumple los filtros' } },
    }),
  },
  '/campanas/vista-previa': { post: op('Campañas', 'Ver destinatarios sin guardar', { roles: GESTION, body: cuerpo(ref('FiltrosCampana')), respuestas: { 200: ok('Vista previa', { type: 'object' }), ...err(400, 404) } }) },
  '/campanas/{id}': { get: op('Campañas', 'Detalle con destinatarios', { roles: GESTION, params: [idPath], respuestas: { 200: ok('Campaña', ref('Campana')), ...err(404) } }) },

  '/notificaciones': {
    get: op('Notificaciones', 'Listar notificaciones a padres', {
      roles: TODOS,
      params: [
        q('estado', 'Estado', { type: 'string', enum: ['pendiente', 'enviado', 'fallido'] }),
        q('canal', 'Canal', { type: 'string', enum: ['Email', 'Telegram'] }),
        uuidQ('nino_id', 'Niño'), uuidQ('campana_id', 'Campaña'), uuidQ('alerta_id', 'Alerta'),
        ...PAGINACION,
      ],
      respuestas: { 200: ok('Notificaciones', paginado('Notificacion')) },
    }),
  },
  '/notificaciones/canales': { get: op('Notificaciones', 'Estado de configuración de los canales', { roles: GESTION, respuestas: { 200: ok('Canales', s({ correo: str(), telegram: str() })) } }) },
  '/notificaciones/procesar': { post: op('Notificaciones', 'Enviar ya las pendientes', { roles: GESTION, respuestas: { 200: ok('Resumen', s({ procesadas: int(), enviadas: int(), con_error: int() })) } }) },
  '/notificaciones/prueba': {
    post: op('Notificaciones', 'Enviar un mensaje de prueba', {
      roles: ADMIN,
      body: cuerpo(s({ canal: str({ enum: ['Email', 'Telegram'] }), destino: str({ description: 'Correo o chat_id' }) }, ['canal', 'destino'])),
      respuestas: { 200: ok('Resultado', ref('Mensaje')), ...err(400), 502: { description: 'El canal rechazó el envío' } },
    }),
  },
  '/notificaciones/{id}/reintentar': { post: op('Notificaciones', 'Reintentar una notificación fallida', { roles: GESTION, params: [idPath], respuestas: { 200: ok('En cola', ref('Mensaje')), ...err(404, 409) } }) },

  '/reportes/ninos-riesgo': {
    get: op('Reportes', 'Niños con bajo peso, sobrepeso, talla baja o vacunas incompletas', {
      roles: GESTION,
      params: [{ ...q('tipo', 'Tipo de reporte', { type: 'string', enum: ['bajo_peso', 'sobrepeso', 'talla_baja', 'vacunas_incompletas'] }), required: true }, uuidQ('comunidad_id', 'Comunidad'), FORMATO],
      respuestas: { 200: ok('Reporte (JSON, Excel o PDF)', ref('Reporte')), ...err(400, 404) },
    }),
  },
  '/reportes/cobertura-vacunacion': {
    get: op('Reportes', 'Cobertura de vacunación por comunidad', { roles: GESTION, params: [uuidQ('comunidad_id', 'Comunidad'), uuidQ('vacuna_id', 'Vacuna'), FORMATO], respuestas: { 200: ok('Reporte', ref('Reporte')), ...err(400, 404) } }),
  },
  '/reportes/crecimiento-promedio': {
    get: op('Reportes', 'Crecimiento promedio por región (comunidad)', { roles: GESTION, params: [uuidQ('comunidad_id', 'Comunidad'), FORMATO], respuestas: { 200: ok('Reporte', ref('Reporte')), ...err(400, 404) } }),
  },

  '/carnets-qr': {
    get: op('Carnet QR', 'Listar carnets (sin token ni PIN)', { roles: TODOS, params: [uuidQ('nino_id', 'Niño'), ...PAGINACION], respuestas: { 200: ok('Carnets', paginado('Carnet')) } }),
    post: op('Carnet QR', 'Generar carnet (revoca el anterior). El PIN y el QR solo se devuelven ahora', {
      roles: TODOS,
      body: cuerpo(s({ nino_id: uuid, dias_vigencia: int({ minimum: 1, maximum: 730, default: 365 }) }, ['nino_id'])),
      respuestas: { 201: ok('Generado', ref('CarnetGenerado')), ...err(400, 404) },
    }),
  },
  '/carnets-qr/{id}/revocar': { patch: op('Carnet QR', 'Revocar carnet', { roles: TODOS, params: [idPath], respuestas: { 200: ok('Revocado', ref('Mensaje')), ...err(404, 409) } }) },
  '/carnet-publico/{token}': {
    get: op('Carnet QR', 'Padres: verificar que el carnet esté disponible (sin sesión)', {
      publica: true,
      params: [{ name: 'token', in: 'path', required: true, schema: str() }],
      respuestas: { 200: ok('Disponible', s({ disponible: { type: 'boolean' }, bloqueado: { type: 'boolean' } })), ...err(404) },
    }),
  },
  '/carnet-publico/{token}/acceso': {
    post: op('Carnet QR', 'Padres: ver el carnet con el PIN (sin sesión)', {
      publica: true,
      params: [{ name: 'token', in: 'path', required: true, schema: str() }],
      body: cuerpo(s({ pin: str({ pattern: '^\\d{6}$' }) }, ['pin'])),
      respuestas: { 200: ok('Carnet del niño', { type: 'object' }), ...err(400, 401, 403, 404), 429: { description: 'Carnet bloqueado temporalmente' } },
    }),
  },

  '/auditoria': {
    get: op('Auditoría', 'Registro de cambios', {
      roles: ADMIN,
      params: [uuidQ('usuario_id', 'Usuario'), q('metodo', 'Método HTTP', { type: 'string', enum: ['POST', 'PUT', 'PATCH', 'DELETE'] }), q('desde', 'AAAA-MM-DD'), q('hasta', 'AAAA-MM-DD'), ...PAGINACION],
      respuestas: { 200: ok('Registros', paginado('Auditoria')) },
    }),
  },
};

module.exports = {
  openapi: '3.0.3',
  info: {
    title: 'SCCVI - Sistema de Control de Crecimiento y Vacunación Infantil',
    version: '1.0.0',
    description:
      'API REST del SCCVI. La autenticación usa una cookie httpOnly "token" que se obtiene con POST /auth/login. ' +
      'En Swagger UI, inicia sesión con /auth/login y las demás peticiones usarán la cookie automáticamente.',
  },
  servers: [{ url: '/api' }],
  components: {
    securitySchemes: { cookieAuth: { type: 'apiKey', in: 'cookie', name: 'token' } },
    schemas,
  },
  security: [{ cookieAuth: [] }],
  paths,
};
