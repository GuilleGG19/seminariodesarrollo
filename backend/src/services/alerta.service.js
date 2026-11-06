// Logica de alertas: consulta, atencion y generacion. Aqui viven las consultas SQL.
// Las reglas (que genera una alerta) estan en alertaReglas.service.js
const { pool } = require('../config/db');
const reglas = require('./alertaReglas.service');
const { consultar } = require('../utils/paginacion');

const crearError = (status, mensaje) => Object.assign(new Error(mensaje), { status });

// Si una alerta fue marcada como atendida por una persona y la situacion sigue igual,
// no se vuelve a crear durante este numero de dias (evita avisar todos los dias lo mismo).
const DIAS_SILENCIO = 30;

// Numero fijo para el candado que evita dos generaciones al mismo tiempo
const CANDADO_GENERACION = 727001;

const HOY = `(now() at time zone 'America/Guatemala')::date`;

const SELECT_ALERTA = `
  SELECT a.id, a.nino_id, n.nombre AS nino, n.comunidad_id, a.tipo, a.nivel, a.mensaje, a.fecha_generada,
         a.atendida, a.fecha_atendida, a.atendida_por, u.nombre_completo AS atendida_por_nombre
  FROM alerta a
  JOIN nino n ON n.id = a.nino_id
  LEFT JOIN usuario u ON u.id = a.atendida_por`;

// Filtros opcionales. "atendida" es true, false o null (todas).
// "paginacion" es opcional: sin ella se devuelven todas las filas (uso interno).
async function listar({ ninoId, comunidadId, tipo, nivel, atendida }, paginacion) {
  return consultar(
    pool,
    {
      sql: `${SELECT_ALERTA}
            WHERE ($1::uuid IS NULL OR a.nino_id = $1)
              AND ($2::text IS NULL OR a.tipo = $2)
              AND ($3::text IS NULL OR a.nivel = $3)
              AND ($4::boolean IS NULL OR a.atendida = $4)
              AND ($5::uuid IS NULL OR n.comunidad_id = $5)`,
      params: [ninoId || null, tipo || null, nivel || null, atendida === undefined ? null : atendida, comunidadId || null],
      orden: "t.atendida, (t.nivel = 'critica') DESC, t.fecha_generada DESC, t.id",
    },
    paginacion
  );
}

async function obtenerPorId(id) {
  const { rows } = await pool.query(`${SELECT_ALERTA} WHERE a.id = $1`, [id]);
  if (!rows[0]) {
    throw crearError(404, 'Alerta no encontrada');
  }
  return rows[0];
}

// Una persona marca la alerta como atendida (queda registrado quien fue)
async function marcarAtendida(id, usuarioId) {
  const { rowCount } = await pool.query(
    `UPDATE alerta
     SET atendida = true, fecha_atendida = now(), atendida_por = $2
     WHERE id = $1 AND atendida = false`,
    [id, usuarioId]
  );

  if (rowCount === 0) {
    const existente = await obtenerPorId(id); // lanza 404 si no existe
    if (existente.atendida) {
      throw crearError(409, 'La alerta ya fue marcada como atendida');
    }
  }
  return obtenerPorId(id);
}

// Datos de cada nino: edad, ultimos percentiles y dias sin mediciones.
// Si nunca tuvo una medicion, los dias se cuentan desde su nacimiento.
// $1 = id de un nino (o NULL para revisar a todos)
const SQL_NINOS = `
  SELECT n.id AS nino_id, n.nombre, n.sexo,
         (extract(year from age(${HOY}, n.fecha_nacimiento)) * 12 +
          extract(month from age(${HOY}, n.fecha_nacimiento)))::int AS edad_meses,
         u.fecha_medicion AS ultima_medicion,
         u.percentil_peso::float AS percentil_peso,
         u.percentil_talla::float AS percentil_talla,
         (${HOY} - COALESCE(u.fecha_medicion, n.fecha_nacimiento))::int AS dias_sin_registro
  FROM nino n
  LEFT JOIN LATERAL (
    SELECT r.fecha_medicion, r.percentil_peso, r.percentil_talla
    FROM registro_crecimiento r
    WHERE r.nino_id = n.id
    ORDER BY r.fecha_medicion DESC, r.id DESC
    LIMIT 1
  ) u ON true
  WHERE ($1::uuid IS NULL OR n.id = $1)`;

// Dosis del esquema cuya fecha ya paso sin aplicarse (programadas o no),
// solo para ninos dentro de la edad del esquema nacional.
const SQL_VACUNAS_ATRASADAS = `
  SELECT e.nino_id, e.vacuna, e.numero_dosis, e.dias_atraso
  FROM v_esquema_vacunacion e
  WHERE e.estado = 'atrasada'
    AND e.edad_nino_meses < $2
    AND ($1::uuid IS NULL OR e.nino_id = $1)
  ORDER BY e.nino_id, e.fecha_objetivo, e.vacuna, e.numero_dosis`;

const SQL_ABIERTAS = `
  SELECT id, nino_id, tipo, nivel, mensaje
  FROM alerta
  WHERE atendida = false
    AND ($1::uuid IS NULL OR nino_id = $1)`;

// Alertas que una persona atendio hace poco (no se vuelven a crear de inmediato)
const SQL_SILENCIADAS = `
  SELECT DISTINCT nino_id, tipo
  FROM alerta
  WHERE atendida = true
    AND atendida_por IS NOT NULL
    AND fecha_atendida > now() - ($1::int * interval '1 day')
    AND ($2::uuid IS NULL OR nino_id = $2)`;

// Deja en cola un aviso al padre por el canal que prefiere, solo si tiene
// el dato de contacto de ese canal. El envio lo hace notificacion.service.js
const SQL_ENCOLAR_AVISO = `
  INSERT INTO notificacion (nino_id, alerta_id, canal)
  SELECT n.id, $2, p.canal_preferido
  FROM nino n
  JOIN padre p ON p.id = n.padre_id
  WHERE n.id = $1
    AND CASE WHEN p.canal_preferido = 'Email' THEN coalesce(p.correo, '') <> ''
             ELSE coalesce(p.telegram_chat_id, '') <> '' END`;

const clave = (ninoId, tipo) => `${ninoId}|${tipo}`;

// Revisa a los ninos y deja las alertas al dia:
//  - crea las que corresponden y todavia no existen (y avisa al padre)
//  - actualiza nivel y mensaje de las abiertas si la situacion cambio
//    (si sube a critica, avisa de nuevo al padre)
//  - cierra solas (atendida_por = NULL) las que ya no aplican
// Si se indica ninoId solo se revisa ese nino (se usa al registrar mediciones o vacunas).
// Todo ocurre en una transaccion: o se aplica completo o no se aplica nada.
async function generar({ ninoId } = {}) {
  const id = ninoId || null;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Si ya hay otra generacion en curso (por ejemplo la tarea diaria), espera a que termine
    await client.query('SELECT pg_advisory_xact_lock($1)', [CANDADO_GENERACION]);

    const ninos = (await client.query(SQL_NINOS, [id])).rows;
    const atrasos = (
      await client.query(SQL_VACUNAS_ATRASADAS, [id, reglas.UMBRALES.edadMaximaVacunacionMeses])
    ).rows;
    const abiertas = (await client.query(SQL_ABIERTAS, [id])).rows;
    const silenciadas = (await client.query(SQL_SILENCIADAS, [DIAS_SILENCIO, id])).rows;

    const deberianExistir = reglas.evaluarTodo(ninos, atrasos);

    const abiertasPorClave = new Map(abiertas.map((a) => [clave(a.nino_id, a.tipo), a]));
    const silenciadasSet = new Set(silenciadas.map((s) => clave(s.nino_id, s.tipo)));
    const vigentes = new Set();

    const resumen = {
      ninos_revisados: ninos.length,
      creadas: 0,
      actualizadas: 0,
      cerradas_automaticamente: 0,
      silenciadas: 0,
      avisos_encolados: 0,
    };

    const encolarAviso = async (ninoIdAviso, alertaId) => {
      const { rowCount } = await client.query(SQL_ENCOLAR_AVISO, [ninoIdAviso, alertaId]);
      resumen.avisos_encolados += rowCount;
    };

    for (const alerta of deberianExistir) {
      const k = clave(alerta.nino_id, alerta.tipo);
      vigentes.add(k);
      const abierta = abiertasPorClave.get(k);

      if (abierta) {
        if (abierta.nivel !== alerta.nivel || abierta.mensaje !== alerta.mensaje) {
          await client.query('UPDATE alerta SET nivel = $1, mensaje = $2 WHERE id = $3', [
            alerta.nivel,
            alerta.mensaje,
            abierta.id,
          ]);
          resumen.actualizadas += 1;
          if (abierta.nivel !== 'critica' && alerta.nivel === 'critica') {
            await encolarAviso(alerta.nino_id, abierta.id);
          }
        }
      } else if (silenciadasSet.has(k)) {
        resumen.silenciadas += 1;
      } else {
        const { rows } = await client.query(
          'INSERT INTO alerta (nino_id, tipo, nivel, mensaje) VALUES ($1, $2, $3, $4) RETURNING id',
          [alerta.nino_id, alerta.tipo, alerta.nivel, alerta.mensaje]
        );
        resumen.creadas += 1;
        await encolarAviso(alerta.nino_id, rows[0].id);
      }
    }

    // Abiertas cuya situacion ya se resolvio
    const aCerrar = abiertas.filter((a) => !vigentes.has(clave(a.nino_id, a.tipo))).map((a) => a.id);
    if (aCerrar.length > 0) {
      await client.query(
        'UPDATE alerta SET atendida = true, fecha_atendida = now() WHERE id = ANY($1::uuid[])',
        [aCerrar]
      );
      resumen.cerradas_automaticamente = aCerrar.length;
    }

    await client.query('COMMIT');
    return resumen;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Revisa las alertas de un nino justo despues de un cambio en sus datos.
// Si falla, no se revierte el cambio: la tarea diaria lo corregira.
async function revisarNino(ninoId) {
  try {
    return await generar({ ninoId });
  } catch (error) {
    console.error(`[alertas] No se pudieron revisar las alertas del niño ${ninoId}:`, error.message);
    return null;
  }
}

module.exports = { listar, obtenerPorId, marcarAtendida, generar, revisarNino };
