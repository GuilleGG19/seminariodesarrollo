// Pruebas del bot de Telegram contra la base de PRUEBA, con la API de Telegram simulada.
// Ejecutar: TEST_DB_NAME=sccvi_test npm test
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

require('dotenv').config({ quiet: true });
const BASE_PRUEBA = process.env.TEST_DB_NAME;

if (!BASE_PRUEBA) {
  test('Telegram (omitida: define TEST_DB_NAME con una base de prueba)', { skip: true }, () => {});
} else {
  Object.assign(process.env, {
    DB_NAME: BASE_PRUEBA,
    NODE_ENV: 'test',
    TELEGRAM_BOT_TOKEN: '123:token-de-prueba',
    DATA_ENCRYPTION_KEY: crypto.randomBytes(32).toString('hex'),
    DATA_HASH_KEY: crypto.randomBytes(32).toString('hex'),
  });

  const { pool } = require('../src/config/db');
  const bot = require('../src/services/telegramBot.service');
  const { descifrar } = require('../src/utils/cifrado');

  const fetchOriginal = global.fetch;
  const enviados = []; // mensajes que el bot "envio"
  const porEntregar = []; // mensajes que "escriben" los padres
  let idActualizacion = 1;

  const escribe = (chatId, texto) =>
    porEntregar.push({ update_id: idActualizacion++, message: { chat: { id: chatId, type: 'private' }, from: { first_name: 'Prueba' }, text: texto } });

  // Espera a que el bot responda al chat indicado
  async function respuestaPara(chatId, previas) {
    for (let i = 0; i < 100; i++) {
      const nuevas = enviados.filter((m) => m.chat_id === chatId);
      if (nuevas.length > previas) return nuevas[nuevas.length - 1].text;
      await new Promise((r) => setTimeout(r, 30));
    }
    throw new Error('el bot no respondió');
  }

  let padreId;

  before(async () => {
    global.fetch = async (url, opciones) => {
      const metodo = url.split('/').pop();
      const cuerpo = JSON.parse(opciones.body || '{}');
      const responder = (result) => ({ ok: true, status: 200, json: async () => ({ ok: true, result }) });
      if (metodo === 'getMe') return responder({ username: 'sccvi_prueba_bot', first_name: 'SCCVI' });
      if (metodo === 'getUpdates') {
        await new Promise((r) => setTimeout(r, 20));
        return responder(porEntregar.splice(0));
      }
      if (metodo === 'sendMessage') {
        enviados.push(cuerpo);
        return responder({ message_id: enviados.length });
      }
      return responder(true);
    };

    await pool.query('TRUNCATE notificacion, alerta, carnet_qr, vacunacion, registro_crecimiento, nino, padre, comunidad RESTART IDENTITY CASCADE');
    const c = await pool.query("INSERT INTO comunidad (nombre, ubicacion) VALUES ('Aldea', 'Norte') RETURNING id");
    const p = await pool.query(
      `INSERT INTO padre (comunidad_id, nombre_completo, dpi, dpi_hash, correo, canal_preferido)
       VALUES ($1, 'Rosa Pérez', 'x', 'h1', 'enc', 'Email') RETURNING id`,
      [c.rows[0].id]
    );
    padreId = p.rows[0].id;
    await pool.query(
      "INSERT INTO nino (comunidad_id, padre_id, nombre, fecha_nacimiento, sexo) VALUES ($1, $2, 'Luis Pérez', '2025-01-01', 'M')",
      [c.rows[0].id, padreId]
    );
    await bot.iniciarBot();
  });

  after(async () => {
    bot.detenerBot();
    await new Promise((r) => setTimeout(r, 100));
    global.fetch = fetchOriginal;
    await pool.end();
  });

  test('genera un enlace t.me con codigo y guarda solo su hash', async () => {
    const v = await bot.generarVinculo(padreId);
    assert.match(v.enlace, /^https:\/\/t\.me\/sccvi_prueba_bot\?start=[A-Za-z0-9_-]{32}$/);
    assert.match(v.qr_data_url, /^data:image\/png;base64,/);
    const codigo = v.enlace.split('start=')[1];
    const fila = (await pool.query('SELECT telegram_codigo_hash FROM padre WHERE id = $1', [padreId])).rows[0];
    assert.equal(fila.telegram_codigo_hash, bot.hashCodigo(codigo));
    assert.notEqual(fila.telegram_codigo_hash, codigo);
  });

  test('/start con el codigo vincula el chat (cifrado) y cambia el canal a Telegram', async () => {
    const codigo = (await bot.generarVinculo(padreId)).enlace.split('start=')[1];
    escribe(555001, `/start ${codigo}`);
    const texto = await respuestaPara(555001, 0);
    assert.match(texto, /Hola Rosa Pérez, ¡listo!/);
    assert.match(texto, /Luis Pérez/);

    const fila = (await pool.query('SELECT * FROM padre WHERE id = $1', [padreId])).rows[0];
    assert.equal(fila.canal_preferido, 'Telegram');
    assert.ok(fila.telegram_chat_id.startsWith('enc:v1:'));
    assert.equal(descifrar(fila.telegram_chat_id), '555001');
    assert.equal(fila.telegram_codigo_hash, null); // el codigo es de un solo uso
  });

  test('un codigo usado o inventado no vincula', async () => {
    escribe(555002, '/start codigoInventadoQueNoExiste123');
    assert.match(await respuestaPara(555002, 0), /no es válido o ya venció/);
  });

  test('un codigo vencido no vincula', async () => {
    const codigo = (await bot.generarVinculo(padreId)).enlace.split('start=')[1];
    await pool.query("UPDATE padre SET telegram_codigo_expira = now() - interval '1 minute' WHERE id = $1", [padreId]);
    escribe(555003, `/start ${codigo}`);
    assert.match(await respuestaPara(555003, 0), /no es válido o ya venció/);
  });

  test('/baja desvincula y regresa al correo', async () => {
    const previas = enviados.filter((m) => m.chat_id === 555001).length;
    escribe(555001, '/baja');
    assert.match(await respuestaPara(555001, previas), /ya no recibirás avisos/);
    const fila = (await pool.query('SELECT canal_preferido, telegram_chat_id FROM padre WHERE id = $1', [padreId])).rows[0];
    assert.equal(fila.telegram_chat_id, null);
    assert.equal(fila.canal_preferido, 'Email');
  });

  test('un mensaje cualquiera recibe instrucciones', async () => {
    escribe(555004, 'hola');
    assert.match(await respuestaPara(555004, 0), /pide en el centro de salud tu enlace/);
  });
}
