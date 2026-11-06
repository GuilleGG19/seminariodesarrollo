// Cifrado de datos personales (seccion 5 del documento: "Cifrado de datos personales").
//
//  - cifrar/descifrar: AES-256-GCM con IV aleatorio. El mismo texto produce un
//    resultado distinto cada vez, por eso no sirve para buscar ni para UNIQUE.
//  - hashBusqueda: HMAC-SHA256 con otra clave. Siempre da el mismo resultado para
//    el mismo texto: se usa para el UNIQUE del DPI y para buscar por DPI exacto.
//
// Formato guardado: "enc:v1:" + base64url(iv[12] + tag[16] + texto cifrado)
// Un valor sin ese prefijo se considera texto plano (datos anteriores al cifrado).
const crypto = require('crypto');

const PREFIJO = 'enc:v1:';
const ALGORITMO = 'aes-256-gcm';

const claveDe = (nombre) => Buffer.from(process.env[nombre] || '', 'hex');

function cifrar(texto) {
  if (texto === null || texto === undefined || texto === '') return texto ?? null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITMO, claveDe('DATA_ENCRYPTION_KEY'), iv);
  const cifrado = Buffer.concat([cipher.update(String(texto), 'utf8'), cipher.final()]);
  return PREFIJO + Buffer.concat([iv, cipher.getAuthTag(), cifrado]).toString('base64url');
}

function descifrar(valor) {
  if (typeof valor !== 'string' || !valor.startsWith(PREFIJO)) return valor ?? null;
  const datos = Buffer.from(valor.slice(PREFIJO.length), 'base64url');
  const decipher = crypto.createDecipheriv(ALGORITMO, claveDe('DATA_ENCRYPTION_KEY'), datos.subarray(0, 12));
  decipher.setAuthTag(datos.subarray(12, 28));
  return Buffer.concat([decipher.update(datos.subarray(28)), decipher.final()]).toString('utf8');
}

const estaCifrado = (valor) => typeof valor === 'string' && valor.startsWith(PREFIJO);

function hashBusqueda(texto) {
  return crypto.createHmac('sha256', claveDe('DATA_HASH_KEY')).update(String(texto)).digest('hex');
}

// "1234567890101" -> "•••••••••0101"
const enmascarar = (texto, visibles = 4) =>
  texto ? '•'.repeat(Math.max(texto.length - visibles, 0)) + texto.slice(-visibles) : texto;

module.exports = { cifrar, descifrar, estaCifrado, hashBusqueda, enmascarar };
