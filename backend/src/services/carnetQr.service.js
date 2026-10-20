// Carnet digital con QR. Los padres NO tienen cuenta: acceden con
//   token (va dentro del QR) + PIN de 6 digitos (se entrega aparte).
//
// Seguridad:
//   - El token es aleatorio de 256 bits (imposible de adivinar).
//   - El PIN se guarda con bcrypt, nunca en texto plano.
//   - Cada intento de PIN se "reserva" de forma atomica ANTES de verificarlo,
//     asi nadie puede probar muchos PIN en paralelo para saltarse el limite.
//   - Tras MAX_INTENTOS fallos el carnet se bloquea MINUTOS_BLOQUEO minutos.
//   - Un carnet puede expirar o ser revocado; un nino solo tiene uno activo.
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const QRCode = require('qrcode');
const { pool } = require('../config/db');
const registroService = require('./registroCrecimiento.service');
const vacunacionService = require('./vacunacion.service');
const alertaService = require('./alerta.service');

const MAX_INTENTOS = 5;
const MINUTOS_BLOQUEO = 15;
const DIAS_VIGENCIA_DEFECTO = 365;
const MENSAJE_NO_DISPONIBLE = 'Carnet no disponible. Solicita uno nuevo en tu centro de salud.';

const crearError = (status, mensaje, extra = {}) => Object.assign(new Error(mensaje), { status, ...extra });

// Direccion que se codifica dentro del QR (la pagina del frontend)
const urlCarnet = (token) => `${process.env.FRONTEND_URL || 'http://localhost:5173'}/carnet/${token}`;

// ---------------------------------------------------------------------
// Uso interno del personal (requiere sesion)
// ---------------------------------------------------------------------

// Crea un carnet nuevo y revoca el anterior. El token y el PIN solo se muestran AHORA.
async function generar({ ninoId, diasVigencia }) {
  const nino = await pool.query('SELECT id FROM nino WHERE id = $1', [ninoId]);
  if (!nino.rows[0]) {
    throw crearError(404, 'Niño no encontrado');
  }

  const token = crypto.randomBytes(32).toString('base64url'); // 43 caracteres
  const pin = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  const pinHash = await bcrypt.hash(pin, 10);

  const client = await pool.connect();
  let carnet;
  try {
    await client.query('BEGIN');
    await client.query("UPDATE carnet_qr SET estado = 'revocado' WHERE nino_id = $1 AND estado = 'activo'", [
      ninoId,
    ]);
    const { rows } = await client.query(
      `INSERT INTO carnet_qr (nino_id, token, pin, fecha_expiracion)
       VALUES ($1, $2, $3, now() + ($4::int * interval '1 day'))
       RETURNING id, nino_id, fecha_generado, fecha_expiracion, estado`,
      [ninoId, token, pinHash, diasVigencia || DIAS_VIGENCIA_DEFECTO]
    );
    carnet = rows[0];
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  const url = urlCarnet(token);
  const qr = await QRCode.toDataURL(url, { errorCorrectionLevel: 'M', margin: 2, width: 320 });
  return { ...carnet, token, pin, url, qr_data_url: qr };
}

// Lista carnets SIN token ni PIN. El estado "expirado" se calcula al consultar.
async function listar({ ninoId }) {
  const { rows } = await pool.query(
    `SELECT c.id, c.nino_id, n.nombre AS nino, c.fecha_generado, c.fecha_expiracion,
            CASE WHEN c.estado = 'activo' AND c.fecha_expiracion <= now()
                 THEN 'expirado' ELSE c.estado END AS estado,
            (c.bloqueado_hasta IS NOT NULL AND c.bloqueado_hasta > now()) AS bloqueado,
            c.intentos_fallidos
     FROM carnet_qr c
     JOIN nino n ON n.id = c.nino_id
     WHERE ($1::uuid IS NULL OR c.nino_id = $1)
     ORDER BY c.fecha_generado DESC`,
    [ninoId || null]
  );
  return rows;
}

async function revocar(id) {
  const { rowCount } = await pool.query(
    "UPDATE carnet_qr SET estado = 'revocado' WHERE id = $1 AND estado = 'activo'",
    [id]
  );
  if (rowCount === 0) {
    const existe = await pool.query('SELECT estado FROM carnet_qr WHERE id = $1', [id]);
    if (!existe.rows[0]) throw crearError(404, 'Carnet no encontrado');
    throw crearError(409, `El carnet ya esta ${existe.rows[0].estado}`);
  }
  return { mensaje: 'Carnet revocado' };
}

// ---------------------------------------------------------------------
// Acceso publico de los padres (sin sesion)
// ---------------------------------------------------------------------

// Indica si el token corresponde a un carnet utilizable (sin revelar datos)
async function verificarDisponible(token) {
  const { rows } = await pool.query(
    `SELECT (bloqueado_hasta IS NOT NULL AND bloqueado_hasta > now()) AS bloqueado
     FROM carnet_qr
     WHERE token = $1 AND estado = 'activo' AND fecha_expiracion > now()`,
    [token]
  );
  if (!rows[0]) throw crearError(404, MENSAJE_NO_DISPONIBLE);
  return { disponible: true, bloqueado: rows[0].bloqueado };
}

// Valida token + PIN y devuelve el carnet completo del nino
async function acceder(token, pin) {
  // Si el bloqueo ya termino, se reinicia el contador
  await pool.query(
    `UPDATE carnet_qr SET intentos_fallidos = 0, bloqueado_hasta = NULL
     WHERE token = $1 AND bloqueado_hasta IS NOT NULL AND bloqueado_hasta <= now()`,
    [token]
  );

  // Se reserva un intento de forma atomica. Si no queda ninguno, no se prueba el PIN.
  const reserva = await pool.query(
    `UPDATE carnet_qr SET intentos_fallidos = intentos_fallidos + 1
     WHERE token = $1
       AND estado = 'activo'
       AND fecha_expiracion > now()
       AND bloqueado_hasta IS NULL
       AND intentos_fallidos < $2
     RETURNING id, nino_id, pin, fecha_expiracion`,
    [token, MAX_INTENTOS]
  );

  if (reserva.rowCount === 0) {
    // Se averigua por que no hubo intento disponible
    const { rows } = await pool.query(
      `UPDATE carnet_qr
       SET bloqueado_hasta = COALESCE(bloqueado_hasta, now() + ($2::int * interval '1 minute'))
       WHERE token = $1 AND estado = 'activo' AND fecha_expiracion > now()
         AND intentos_fallidos >= $3
       RETURNING ceil(extract(epoch FROM (bloqueado_hasta - now())) / 60)::int AS minutos`,
      [token, MINUTOS_BLOQUEO, MAX_INTENTOS]
    );
    if (rows[0]) {
      throw crearError(
        429,
        `Carnet bloqueado por demasiados intentos. Intenta de nuevo en ${Math.max(rows[0].minutos, 1)} minutos.`
      );
    }
    // Tambien cubre un bloqueo vigente con menos de MAX_INTENTOS (no deberia ocurrir)
    const bloqueado = await pool.query(
      `SELECT ceil(extract(epoch FROM (bloqueado_hasta - now())) / 60)::int AS minutos
       FROM carnet_qr
       WHERE token = $1 AND estado = 'activo' AND fecha_expiracion > now() AND bloqueado_hasta > now()`,
      [token]
    );
    if (bloqueado.rows[0]) {
      throw crearError(
        429,
        `Carnet bloqueado por demasiados intentos. Intenta de nuevo en ${Math.max(bloqueado.rows[0].minutos, 1)} minutos.`
      );
    }
    throw crearError(404, MENSAJE_NO_DISPONIBLE); // no existe, expirado o revocado
  }

  const carnet = reserva.rows[0];
  const correcto = await bcrypt.compare(pin, carnet.pin);

  if (!correcto) {
    const { rows } = await pool.query(
      `UPDATE carnet_qr
       SET bloqueado_hasta = CASE WHEN intentos_fallidos >= $2
                                  THEN now() + ($3::int * interval '1 minute')
                                  ELSE bloqueado_hasta END
       WHERE id = $1
       RETURNING intentos_fallidos, (bloqueado_hasta IS NOT NULL) AS bloqueado`,
      [carnet.id, MAX_INTENTOS, MINUTOS_BLOQUEO]
    );
    if (rows[0].bloqueado) {
      throw crearError(429, `PIN incorrecto. Carnet bloqueado por ${MINUTOS_BLOQUEO} minutos.`);
    }
    const restantes = Math.max(MAX_INTENTOS - rows[0].intentos_fallidos, 0);
    throw crearError(401, `PIN incorrecto. Te quedan ${restantes} intentos.`, { intentos_restantes: restantes });
  }

  // PIN correcto: se reinicia el contador
  await pool.query('UPDATE carnet_qr SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = $1', [
    carnet.id,
  ]);

  return armarCarnet(carnet.nino_id, carnet.fecha_expiracion);
}

// Datos que ven los padres. No incluye DPI, telefono ni correo.
async function armarCarnet(ninoId, fechaExpiracion) {
  const { rows } = await pool.query(
    `SELECT n.nombre, n.sexo, n.fecha_nacimiento, c.nombre AS comunidad
     FROM nino n JOIN comunidad c ON c.id = n.comunidad_id
     WHERE n.id = $1`,
    [ninoId]
  );
  const [curva, vacunaciones, alertas] = await Promise.all([
    registroService.obtenerCurva(ninoId),
    vacunacionService.listar({ ninoId }),
    alertaService.listar({ ninoId, atendida: false }),
  ]);

  return {
    nino: rows[0],
    carnet: { fecha_expiracion: fechaExpiracion },
    crecimiento: {
      mediciones: curva.mediciones.map((m) => ({
        fecha_medicion: m.fecha_medicion,
        edad_meses: m.edad_meses,
        edad_meses_exacta: m.edad_meses_exacta,
        peso_kg: m.peso_kg,
        talla_cm: m.talla_cm,
        percentil_peso: m.percentil_peso,
        percentil_talla: m.percentil_talla,
      })),
      referencia: curva.referencia,
    },
    vacunas: vacunaciones.map((v) => ({
      vacuna: v.vacuna,
      numero_dosis: v.numero_dosis,
      dosis_total: v.dosis_total,
      fecha_aplicada: v.fecha_aplicada,
      proxima_dosis: v.proxima_dosis,
      estado: v.estado,
    })),
    alertas: alertas.map((a) => ({
      tipo: a.tipo,
      nivel: a.nivel,
      mensaje: a.mensaje,
      fecha_generada: a.fecha_generada,
    })),
  };
}

module.exports = { generar, listar, revocar, verificarDisponible, acceder, MAX_INTENTOS, MINUTOS_BLOQUEO };
