// Pruebas de integracion de la API contra una base de datos de PRUEBA.
// NUNCA se ejecutan contra la base real: requieren TEST_DB_NAME y borran sus datos.
//
// Preparar (una vez):
//   docker exec sccvi_postgres psql -U sccvi_admin -d postgres -c "CREATE DATABASE sccvi_test"
//   (aplicar db/init/*.sql en orden sobre sccvi_test)
// Ejecutar:
//   TEST_DB_NAME=sccvi_test npm test
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

require('dotenv').config({ quiet: true });
const BASE_PRUEBA = process.env.TEST_DB_NAME;

if (!BASE_PRUEBA) {
  test('API (omitida: define TEST_DB_NAME con una base de prueba)', { skip: true }, () => {});
} else {
  // Configuracion aislada: base de prueba y claves temporales
  Object.assign(process.env, {
    DB_NAME: BASE_PRUEBA,
    NODE_ENV: 'test',
    JWT_SECRET: crypto.randomBytes(48).toString('hex'),
    DATA_ENCRYPTION_KEY: crypto.randomBytes(32).toString('hex'),
    DATA_HASH_KEY: crypto.randomBytes(32).toString('hex'),
    RATE_LIMIT_GENERAL: '100000',
    SMTP_HOST: '',
    TELEGRAM_BOT_TOKEN: '',
  });

  const bcrypt = require('bcryptjs');
  const app = require('../src/app');
  const { pool } = require('../src/config/db');

  let servidor;
  let base;
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guatemala' });
  const haceMeses = (meses) => {
    const d = new Date(`${hoy}T12:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - meses);
    return d.toISOString().slice(0, 10);
  };

  // Cliente HTTP minimo que guarda la cookie de sesion
  function cliente() {
    let cookie = '';
    const pedir = async (metodo, ruta, cuerpo) => {
      const res = await fetch(`${base}${ruta}`, {
        method: metodo,
        headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
        body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      });
      const nueva = res.headers.get('set-cookie');
      if (nueva) cookie = nueva.split(';')[0];
      const tipo = res.headers.get('content-type') || '';
      return { status: res.status, body: tipo.includes('json') ? await res.json() : await res.text() };
    };
    return {
      get: (r) => pedir('GET', r),
      post: (r, c = {}) => pedir('POST', r, c),
      put: (r, c) => pedir('PUT', r, c),
      patch: (r, c = {}) => pedir('PATCH', r, c),
      del: (r) => pedir('DELETE', r),
      get cookie() { return cookie; },
      set cookie(valor) { cookie = valor; },
    };
  }

  const admin = cliente();
  const datos = {};

  before(async () => {
    await pool.query(
      `TRUNCATE auditoria, notificacion, campana, alerta, carnet_qr, vacunacion, registro_crecimiento,
                nino, padre, comunidad, usuario RESTART IDENTITY CASCADE`
    );
    await pool.query(
      `INSERT INTO usuario (rol_id, nombre_completo, correo, password_hash)
       SELECT id, 'Admin Prueba', 'admin@prueba.gt', $1 FROM rol WHERE nombre = 'administrador'`,
      [await bcrypt.hash('Admin12345', 10)]
    );
    await new Promise((resolve) => {
      servidor = app.listen(0, resolve);
    });
    base = `http://127.0.0.1:${servidor.address().port}/api`;
  });

  after(async () => {
    await new Promise((resolve) => servidor.close(resolve));
    await pool.end();
  });

  test('login y perfil', async () => {
    const r = await admin.post('/auth/login', { correo: 'ADMIN@prueba.gt ', password: 'Admin12345' });
    assert.equal(r.status, 200);
    assert.equal((await admin.get('/auth/perfil')).body.usuario.rol, 'administrador');
    assert.equal((await cliente().get('/auth/perfil')).status, 401);
  });

  test('padres: datos cifrados en la base, DPI enmascarado en listados', async () => {
    datos.comA = (await admin.post('/comunidades', { nombre: 'Aldea A', ubicacion: 'Norte' })).body;
    datos.comB = (await admin.post('/comunidades', { nombre: 'Aldea B', ubicacion: 'Sur' })).body;

    const r = await admin.post('/padres', {
      comunidad_id: datos.comA.id, nombre_completo: 'María López', dpi: '1234 56789 0101',
      telefono: '5555-1234', correo: 'maria@correo.gt', canal_preferido: 'Email',
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.dpi, '1234567890101');
    datos.padre = r.body;

    const crudo = (await pool.query('SELECT dpi, telefono, correo, dpi_hash FROM padre WHERE id = $1', [r.body.id])).rows[0];
    assert.ok(crudo.dpi.startsWith('enc:v1:') && crudo.telefono.startsWith('enc:v1:') && crudo.correo.startsWith('enc:v1:'));
    assert.equal(crudo.dpi_hash.length, 64);

    const lista = await admin.get('/padres?buscar=1234567890101');
    assert.equal(lista.body.total, 1);
    assert.equal(lista.body.datos[0].dpi, '•••••••••0101');
    assert.equal(lista.body.datos[0].correo, 'maria@correo.gt');

    const repetido = await admin.post('/padres', {
      comunidad_id: datos.comA.id, nombre_completo: 'Otra', dpi: '1234567890101', correo: 'x@y.gt',
    });
    assert.equal(repetido.status, 409);
  });

  test('bug 1: al cambiar la comunidad del padre, sus ninos se mueven con el', async () => {
    const nino = await admin.post('/ninos', {
      padre_id: datos.padre.id, nombre: 'Juan López', fecha_nacimiento: haceMeses(8), sexo: 'M',
    });
    assert.equal(nino.status, 201);
    datos.nino = nino.body;
    assert.equal(nino.body.comunidad_id, datos.comA.id);

    const { ninos, total_ninos, comunidad, ...resto } = datos.padre;
    await admin.put(`/padres/${datos.padre.id}`, { ...resto, comunidad_id: datos.comB.id });
    assert.equal((await admin.get(`/ninos/${datos.nino.id}`)).body.comunidad_id, datos.comB.id);
  });

  test('bug 2: un nino sin vacunas registradas aparece con vacunas incompletas', async () => {
    const esquema = await admin.get(`/ninos/${datos.nino.id}/esquema`);
    assert.equal(esquema.status, 200);
    assert.ok(esquema.body.resumen.atrasadas >= 4, JSON.stringify(esquema.body.resumen));
    assert.equal(esquema.body.resumen.al_dia, false);
    assert.equal(esquema.body.vacunas[0].vacuna, 'BCG (tuberculosis)');

    const reporte = await admin.get('/reportes/ninos-riesgo?tipo=vacunas_incompletas');
    assert.equal(reporte.body.filas.length, 1);
    assert.equal(reporte.body.filas[0].telefono, '55551234');
  });

  test('bug 4: una medicion con peso bajo genera la alerta de inmediato', async () => {
    const r = await admin.post('/registros-crecimiento', { nino_id: datos.nino.id, peso_kg: 5, talla_cm: 60 });
    assert.equal(r.status, 201);
    assert.ok(r.body.percentil_peso < 1);

    const alertas = (await admin.get(`/alertas?nino_id=${datos.nino.id}&atendida=false`)).body.datos;
    const tipos = alertas.map((a) => a.tipo).sort();
    assert.deepEqual(tipos, ['desnutricion', 'talla_baja', 'vacuna_atrasada']);
    assert.equal(alertas.find((a) => a.tipo === 'desnutricion').nivel, 'critica');

    // bug 3: la hora llega correcta (no 6 horas corrida)
    const diferencia = Math.abs(Date.now() - new Date(alertas[0].fecha_generada).getTime());
    assert.ok(diferencia < 60 * 1000, `diferencia de ${diferencia} ms`);
  });

  test('bug 5: las dosis respetan su orden', async () => {
    const hexa = (await admin.get('/vacunas?buscar=Hexavalente')).body[0];
    assert.deepEqual(hexa.edades_dosis_meses, [2, 4, 6, 18]);

    const sinPrimera = await admin.post('/vacunaciones', { nino_id: datos.nino.id, vacuna_id: hexa.id, numero_dosis: 2, fecha_aplicada: hoy });
    assert.equal(sinPrimera.status, 400);

    const d1 = await admin.post('/vacunaciones', {
      nino_id: datos.nino.id, vacuna_id: hexa.id, numero_dosis: 1, fecha_aplicada: haceMeses(2), proxima_dosis: hoy,
    });
    assert.equal(d1.status, 201, JSON.stringify(d1.body));
    const programada = (await admin.get(`/vacunaciones?nino_id=${datos.nino.id}`)).body.datos.find((v) => v.numero_dosis === 2);
    assert.equal(programada.estado, 'pendiente');

    const antes = await admin.post('/vacunaciones', {
      nino_id: datos.nino.id, vacuna_id: hexa.id, numero_dosis: 2, fecha_aplicada: haceMeses(3),
    });
    assert.equal(antes.status, 400);

    const borrar = await admin.del(`/vacunaciones/${d1.body.id}`);
    assert.equal(borrar.status, 409);
  });

  test('notificaciones: las alertas se envian (simulado sin SMTP)', async () => {
    const pendientes = (await admin.get('/notificaciones?estado=pendiente')).body;
    assert.ok(pendientes.total >= 1);

    const r = await admin.post('/notificaciones/procesar');
    assert.equal(r.status, 200);
    assert.ok(r.body.enviadas >= 1, JSON.stringify(r.body));
    assert.equal((await admin.get('/notificaciones?estado=pendiente')).body.total, 0);
  });

  test('campana: estado atrasada usa el esquema', async () => {
    const r = await admin.post('/campanas/vista-previa', { estado_vacunacion: 'atrasada' });
    assert.equal(r.body.total_destinatarios, 1);
  });

  test('dashboard y paginacion', async () => {
    const d = await admin.get('/dashboard');
    assert.equal(d.status, 200);
    assert.equal(d.body.totales.ninos, 1);
    assert.equal(d.body.estado_nutricional_menores_5.bajo_peso, 1);
    assert.equal(d.body.tendencia_6_meses.length, 6);

    const p = await admin.get('/ninos?pagina=1&limite=1');
    assert.deepEqual(Object.keys(p.body).sort(), ['datos', 'limite', 'pagina', 'total', 'total_paginas']);
    assert.equal((await admin.get('/ninos?limite=999')).status, 400);
  });

  test('carnet QR: se revoca tras demasiados PIN incorrectos', async () => {
    const carnet = (await admin.post('/carnets-qr', { nino_id: datos.nino.id })).body;
    const publico = cliente();
    const pinMalo = carnet.pin === '000000' ? '111111' : '000000';

    const ok = await publico.post(`/carnet-publico/${carnet.token}/acceso`, { pin: carnet.pin });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.nino.nombre, 'Juan López');

    const malo = await publico.post(`/carnet-publico/${carnet.token}/acceso`, { pin: pinMalo });
    assert.equal(malo.status, 401);
    assert.equal(malo.body.intentos_restantes, 4);

    await pool.query('UPDATE carnet_qr SET intentos_totales = 19 WHERE id = $1', [carnet.id]);
    const revocado = await publico.post(`/carnet-publico/${carnet.token}/acceso`, { pin: pinMalo });
    assert.equal(revocado.status, 403);
    assert.equal((await publico.get(`/carnet-publico/${carnet.token}`)).status, 404);
  });

  test('sesiones: logout y cambio de contrasena invalidan tokens anteriores', async () => {
    const otra = cliente();
    await otra.post('/auth/login', { correo: 'admin@prueba.gt', password: 'Admin12345' });
    const cookieVieja = otra.cookie;

    await otra.post('/auth/logout');
    otra.cookie = cookieVieja; // alguien que copio la cookie antes del logout
    assert.equal((await otra.get('/auth/perfil')).status, 401);

    await admin.post('/auth/login', { correo: 'admin@prueba.gt', password: 'Admin12345' });
    const copia = cliente();
    copia.cookie = admin.cookie;
    const cambio = await admin.patch('/auth/password', { password_actual: 'Admin12345', password_nueva: 'Nueva2026x' });
    assert.equal(cambio.status, 200);
    assert.equal((await admin.get('/auth/perfil')).status, 200);
    assert.equal((await copia.get('/auth/perfil')).status, 401);
  });

  test('auditoria y documentacion', async () => {
    const a = await admin.get('/auditoria?metodo=POST');
    assert.ok(a.body.total > 5);
    assert.ok(a.body.datos.some((x) => x.ruta === '/api/padres' && x.usuario === 'Admin Prueba'));

    const docs = await fetch(`${base}/docs.json`).then((r) => r.json());
    assert.equal(docs.openapi, '3.0.3');
    assert.ok(docs.paths['/ninos/{id}/esquema']);
  });
}
