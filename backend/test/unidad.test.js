// Pruebas de funciones puras (no usan la base de datos). Ejecutar: npm test
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

process.env.DATA_ENCRYPTION_KEY = process.env.DATA_ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
process.env.DATA_HASH_KEY = process.env.DATA_HASH_KEY || crypto.randomBytes(32).toString('hex');

const lms = require('../src/services/lms.service');
const reglas = require('../src/services/alertaReglas.service');
const cifrado = require('../src/utils/cifrado');
const { leerPaginacion } = require('../src/utils/paginacion');
const { validarPassword } = require('../src/utils/password');
const { armarMensaje } = require('../src/services/notificacion.service');

test('LMS: la mediana corresponde al percentil 50 y Z=1.645 al 95', () => {
  // Peso de ninos al nacer (OMS): L=0.3487, M=3.3464, S=0.14602
  assert.equal(lms.percentilDesdeZ(lms.calcularZ(3.3464, 0.3487, 3.3464, 0.14602)), 50);
  assert.equal(lms.percentilDesdeZ(1.6448536), 95);
  const valor = lms.valorDesdeZ(-2, 0.3487, 3.3464, 0.14602);
  assert.ok(Math.abs(lms.calcularZ(valor, 0.3487, 3.3464, 0.14602) + 2) < 1e-9);
});

test('Reglas: percentil de peso bajo y critico', () => {
  const base = { nino_id: 'n1', nombre: 'Ana', sexo: 'F', edad_meses: 10, dias_sin_registro: 5, ultima_medicion: '2026-01-01' };
  const preventiva = reglas.evaluarCrecimiento({ ...base, percentil_peso: 3 });
  assert.equal(preventiva[0].tipo, 'desnutricion');
  assert.equal(preventiva[0].nivel, 'preventiva');
  assert.match(preventiva[0].mensaje, /^La niña Ana/);
  assert.equal(reglas.evaluarCrecimiento({ ...base, percentil_peso: 0.5 })[0].nivel, 'critica');
  assert.equal(reglas.evaluarCrecimiento({ ...base, percentil_peso: 97 })[0].tipo, 'sobrepeso');
  assert.equal(reglas.evaluarCrecimiento({ ...base, percentil_peso: 50 }).length, 0);
});

test('Reglas: talla baja genera alerta de desnutricion cronica', () => {
  const alertas = reglas.evaluarCrecimiento({
    nino_id: 'n1', nombre: 'Luis', sexo: 'M', edad_meses: 20, percentil_peso: 40, percentil_talla: 2,
    dias_sin_registro: 5, ultima_medicion: '2026-01-01',
  });
  assert.deepEqual(alertas.map((a) => a.tipo), ['talla_baja']);
});

test('Reglas: mayores de 5 anios no generan alertas de percentil', () => {
  const alertas = reglas.evaluarCrecimiento({
    nino_id: 'n1', nombre: 'Luis', sexo: 'M', edad_meses: 70, percentil_peso: 1, percentil_talla: 1,
    dias_sin_registro: 900, ultima_medicion: '2024-01-01',
  });
  assert.equal(alertas.length, 0);
});

test('Reglas: sin registros segun la frecuencia por edad', () => {
  const menor = { nino_id: 'n1', nombre: 'Ana', sexo: 'F', edad_meses: 10, percentil_peso: null, ultima_medicion: '2026-01-01' };
  assert.equal(reglas.evaluarCrecimiento({ ...menor, dias_sin_registro: 40 }).length, 0);
  assert.equal(reglas.evaluarCrecimiento({ ...menor, dias_sin_registro: 70 })[0].nivel, 'preventiva');
  assert.equal(reglas.evaluarCrecimiento({ ...menor, dias_sin_registro: 130 })[0].nivel, 'critica');
  // De 2 a 5 anios el control es trimestral: 70 dias aun no es alerta
  assert.equal(reglas.evaluarCrecimiento({ ...menor, edad_meses: 30, dias_sin_registro: 70 }).length, 0);
});

test('Reglas: una sola alerta con todas las vacunas atrasadas', () => {
  const [alerta] = reglas.evaluarVacunas({ nino_id: 'n1', nombre: 'Ana', sexo: 'F' }, [
    { vacuna: 'BCG', numero_dosis: 1, dias_atraso: 10 },
    { vacuna: 'Hexavalente', numero_dosis: 2, dias_atraso: 45 },
  ]);
  assert.equal(alerta.nivel, 'critica');
  assert.match(alerta.mensaje, /BCG \(dosis 1\), Hexavalente \(dosis 2\)/);
});

test('Cifrado: ida y vuelta, IV aleatorio y texto plano heredado', () => {
  const a = cifrado.cifrar('1234567890101');
  const b = cifrado.cifrar('1234567890101');
  assert.notEqual(a, b);
  assert.ok(cifrado.estaCifrado(a));
  assert.equal(cifrado.descifrar(a), '1234567890101');
  assert.equal(cifrado.descifrar('texto viejo'), 'texto viejo');
  assert.equal(cifrado.cifrar(null), null);
  assert.equal(cifrado.hashBusqueda('123'), cifrado.hashBusqueda('123'));
  assert.equal(cifrado.enmascarar('1234567890101'), '•••••••••0101');
});

test('Cifrado: un valor alterado se rechaza', () => {
  const valor = cifrado.cifrar('dato');
  const alterado = valor.slice(0, -2) + (valor.endsWith('A') ? 'BB' : 'AA');
  assert.throws(() => cifrado.descifrar(alterado));
});

test('Paginacion: valores por defecto y limites', () => {
  assert.deepEqual(leerPaginacion({}).paginacion, { pagina: 1, limite: 50, offset: 0 });
  assert.deepEqual(leerPaginacion({ pagina: '3', limite: '20' }).paginacion, { pagina: 3, limite: 20, offset: 40 });
  assert.ok(leerPaginacion({ pagina: '0' }).error);
  assert.ok(leerPaginacion({ limite: '500' }).error);
  assert.ok(leerPaginacion({ limite: 'abc' }).error);
});

test('Password: largo, letras y numeros', () => {
  assert.ok(validarPassword('corta1'));
  assert.ok(validarPassword('sololetras'));
  assert.ok(validarPassword('12345678'));
  assert.equal(validarPassword('Segura2026'), null);
});

test('Notificaciones: mensaje de alerta critica', () => {
  const { asunto, texto } = armarMensaje({
    padre: 'María', nino: 'Juan', alerta_id: 'a1', alerta_tipo: 'desnutricion', alerta_nivel: 'critica',
    alerta_mensaje: 'El niño Juan presenta peso bajo para su edad.',
  });
  assert.match(asunto, /^URGENTE: Aviso de salud de Juan \(peso bajo\)/);
  assert.match(texto, /^Hola María:/);
});
