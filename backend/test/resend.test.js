// Pruebas del envio de correo con Resend. No se conecta a Resend: se reemplaza fetch.
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const canales = require('../src/services/canales.service');

const fetchOriginal = global.fetch;
let peticiones;

// Simula la respuesta de la API de Resend
function simularResend(status, cuerpo) {
  global.fetch = async (url, opciones) => {
    peticiones.push({ url, opciones, cuerpo: JSON.parse(opciones.body) });
    return { ok: status < 400, status, json: async () => cuerpo };
  };
}

beforeEach(() => {
  peticiones = [];
  process.env.RESEND_API_KEY = 're_prueba_123';
  process.env.EMAIL_FROM = 'SCCVI <alertas@centro.gt>';
  delete process.env.SMTP_HOST;
});

afterEach(() => {
  global.fetch = fetchOriginal;
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;
});

test('Resend: envia con clave, remitente, idempotencia y devuelve el id', async () => {
  simularResend(200, { id: 'email_abc123' });
  const r = await canales.enviarCorreo({
    para: 'maria@correo.gt',
    asunto: 'Aviso de salud',
    texto: 'Hola <María>:\n\nMensaje',
    claveIdempotencia: 'sccvi-1-abc',
  });

  assert.deepEqual(r, { simulado: false, idProveedor: 'email_abc123' });
  const [p] = peticiones;
  assert.equal(p.url, 'https://api.resend.com/emails');
  assert.equal(p.opciones.headers.Authorization, 'Bearer re_prueba_123');
  assert.equal(p.opciones.headers['Idempotency-Key'], 'sccvi-1-abc');
  assert.equal(p.cuerpo.from, 'SCCVI <alertas@centro.gt>');
  assert.deepEqual(p.cuerpo.to, ['maria@correo.gt']);
  assert.equal(p.cuerpo.text, 'Hola <María>:\n\nMensaje');
  // El HTML escapa el texto (viene de la base de datos)
  assert.match(p.cuerpo.html, /Hola &lt;María&gt;:/);
  assert.doesNotMatch(p.cuerpo.html, /<María>/);
});

test('Resend: dominio no verificado da un error con pista', async () => {
  simularResend(403, { statusCode: 403, message: 'The resend.dev domain is not allowed to send to this address. Please verify a domain.' });
  await assert.rejects(
    canales.enviarCorreo({ para: 'x@y.gt', asunto: 'a', texto: 'b' }),
    /Resend respondió 403: .*dominio del remitente no está verificado/
  );
});

test('Resend: clave invalida y limite de envios', async () => {
  simularResend(401, { message: 'API key is invalid' });
  await assert.rejects(canales.enviarCorreo({ para: 'x@y.gt', asunto: 'a', texto: 'b' }), /revisa RESEND_API_KEY/);
  simularResend(429, { message: 'Too many requests' });
  await assert.rejects(canales.enviarCorreo({ para: 'x@y.gt', asunto: 'a', texto: 'b' }), /se reintentará/);
});

test('Sin Resend ni SMTP el correo se simula (fuera de produccion)', async () => {
  delete process.env.RESEND_API_KEY;
  global.fetch = async () => assert.fail('no debe llamar a la red');
  const r = await canales.enviarCorreo({ para: 'x@y.gt', asunto: 'a', texto: 'b' });
  assert.equal(r.simulado, true);
  assert.equal(canales.estadoCanales().correo, 'simulado');
});

test('estadoCanales indica el proveedor y el remitente', () => {
  assert.deepEqual(
    { proveedor: canales.estadoCanales().proveedor_correo, remitente: canales.estadoCanales().remitente },
    { proveedor: 'resend', remitente: 'SCCVI <alertas@centro.gt>' }
  );
});
