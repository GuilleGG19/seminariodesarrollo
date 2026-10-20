-- =====================================================================
-- SCCVI - Sistema de Control de Crecimiento y Vacunacion Infantil
-- Esquema completo para PostgreSQL (version con ajustes integrados)
-- Archivo 01: se ejecuta antes que 02_oms_referencia.sql (orden alfabetico)
--
-- Usar en una base de datos NUEVA/VACIA.
-- Si ya creaste las tablas con el script anterior, primero elimina
-- las tablas viejas (o crea una base de datos nueva).
--
-- Nota: gen_random_uuid() viene incluido desde PostgreSQL 13.
-- En versiones anteriores ejecutar antes:
--   CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- =====================================================================


-- ---------------------------------------------------------------------
-- Usuarios del sistema (personal). Los padres NO tienen usuario:
-- acceden al carnet solo con token (QR) + PIN.
-- ---------------------------------------------------------------------
CREATE TABLE rol (
  id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre varchar(50) UNIQUE NOT NULL
);

CREATE TABLE usuario (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rol_id         uuid NOT NULL REFERENCES rol(id),
  nombre_completo varchar(150) NOT NULL,
  correo         varchar(150) UNIQUE NOT NULL,
  password_hash  varchar NOT NULL,
  estado         varchar(20) NOT NULL DEFAULT 'activo',
  fecha_creacion timestamp NOT NULL DEFAULT now(),
  CONSTRAINT chk_usuario_estado CHECK (estado IN ('activo', 'inactivo'))
);


-- ---------------------------------------------------------------------
-- Comunidades, padres y ninos
-- ---------------------------------------------------------------------
CREATE TABLE comunidad (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre                varchar(150) NOT NULL,
  ubicacion             varchar(255) NOT NULL,
  num_familias_estimado int
);

CREATE TABLE padre (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comunidad_id      uuid NOT NULL REFERENCES comunidad(id),
  nombre_completo   varchar(150) NOT NULL,
  dpi               varchar(20) UNIQUE NOT NULL,
  telefono          varchar(20),
  correo            varchar(150),
  canal_preferido   varchar(20) NOT NULL DEFAULT 'Email',
  telegram_chat_id  varchar(50),
  CONSTRAINT chk_padre_canal CHECK (canal_preferido IN ('Email', 'Telegram'))
);

CREATE TABLE nino (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comunidad_id     uuid NOT NULL REFERENCES comunidad(id),
  padre_id         uuid NOT NULL REFERENCES padre(id),
  nombre           varchar(150) NOT NULL,
  fecha_nacimiento date NOT NULL,
  sexo             char(1) NOT NULL,
  CONSTRAINT chk_nino_sexo CHECK (sexo IN ('M', 'F'))
);


-- ---------------------------------------------------------------------
-- Control de crecimiento
-- ---------------------------------------------------------------------
CREATE TABLE registro_crecimiento (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nino_id         uuid NOT NULL REFERENCES nino(id),
  peso_kg         decimal(5,2) NOT NULL,
  talla_cm        decimal(5,2) NOT NULL,
  fecha_medicion  date NOT NULL DEFAULT CURRENT_DATE,
  percentil_peso  decimal(5,2),
  percentil_talla decimal(5,2),
  CONSTRAINT chk_peso  CHECK (peso_kg > 0),
  CONSTRAINT chk_talla CHECK (talla_cm > 0)
);

-- La tabla de referencia OMS (oms_referencia) se crea y se llena en
-- 02_oms_referencia.sql, porque necesita los datos oficiales de la OMS.


-- ---------------------------------------------------------------------
-- Vacunacion
-- ---------------------------------------------------------------------
CREATE TABLE vacuna (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre                 varchar(150) NOT NULL,
  edad_recomendada_meses int NOT NULL,
  dosis_total            int NOT NULL DEFAULT 1
);

CREATE TABLE vacunacion (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nino_id        uuid NOT NULL REFERENCES nino(id),
  vacuna_id      uuid NOT NULL REFERENCES vacuna(id),
  numero_dosis   int NOT NULL DEFAULT 1,
  fecha_aplicada date,
  proxima_dosis  date,
  estado         varchar(20) NOT NULL DEFAULT 'pendiente',
  CONSTRAINT chk_vacunacion_estado CHECK (estado IN ('completa', 'pendiente', 'atrasada')),
  CONSTRAINT uq_vacunacion UNIQUE (nino_id, vacuna_id, numero_dosis)
);


-- ---------------------------------------------------------------------
-- Alertas, campanas y notificaciones
-- ---------------------------------------------------------------------
CREATE TABLE alerta (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nino_id        uuid NOT NULL REFERENCES nino(id),
  tipo           varchar(30) NOT NULL,
  nivel          varchar(20) NOT NULL,
  mensaje        text NOT NULL,
  fecha_generada timestamp NOT NULL DEFAULT now(),
  CONSTRAINT chk_alerta_tipo  CHECK (tipo IN ('desnutricion', 'sobrepeso', 'sin_registros', 'vacuna_atrasada')),
  CONSTRAINT chk_alerta_nivel CHECK (nivel IN ('preventiva', 'critica'))
);

CREATE TABLE campana (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id           uuid NOT NULL REFERENCES usuario(id),
  mensaje              text NOT NULL,
  comunidad_id         uuid REFERENCES comunidad(id),
  vacuna_id            uuid REFERENCES vacuna(id),
  edad_min_meses       int,
  edad_max_meses       int,
  estado_vacunacion    varchar(20),
  sin_control_reciente boolean NOT NULL DEFAULT false,
  fecha_programada     date,
  total_destinatarios  int NOT NULL DEFAULT 0,
  fecha_envio          timestamp NOT NULL DEFAULT now(),
  CONSTRAINT chk_campana_estado CHECK (estado_vacunacion IS NULL OR estado_vacunacion IN ('pendiente', 'atrasada'))
);

CREATE TABLE notificacion (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nino_id      uuid NOT NULL REFERENCES nino(id),
  alerta_id    uuid REFERENCES alerta(id),
  campana_id   uuid REFERENCES campana(id),
  canal        varchar(20) NOT NULL,
  estado_envio varchar(20) NOT NULL DEFAULT 'pendiente',
  fecha_envio  timestamp,
  CONSTRAINT chk_notif_canal  CHECK (canal IN ('Email', 'Telegram')),
  CONSTRAINT chk_notif_estado CHECK (estado_envio IN ('enviado', 'fallido', 'pendiente'))
);


-- ---------------------------------------------------------------------
-- Carnet digital con QR (acceso por token + PIN)
-- El PIN se guarda como hash (bcrypt), nunca en texto plano.
-- ---------------------------------------------------------------------
CREATE TABLE carnet_qr (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nino_id           uuid NOT NULL REFERENCES nino(id),
  token             varchar UNIQUE NOT NULL,
  pin               varchar(60) NOT NULL,
  fecha_generado    timestamp NOT NULL DEFAULT now(),
  fecha_expiracion  timestamp NOT NULL,
  estado            varchar(20) NOT NULL DEFAULT 'activo',
  intentos_fallidos int NOT NULL DEFAULT 0,
  bloqueado_hasta   timestamp,
  CONSTRAINT chk_carnet_estado CHECK (estado IN ('activo', 'expirado', 'revocado'))
);


-- ---------------------------------------------------------------------
-- Indices
-- ---------------------------------------------------------------------
CREATE INDEX idx_padre_comunidad       ON padre (comunidad_id);
CREATE INDEX idx_nino_comunidad        ON nino (comunidad_id);
CREATE INDEX idx_nino_padre            ON nino (padre_id);
CREATE INDEX idx_registro_nino_fecha   ON registro_crecimiento (nino_id, fecha_medicion DESC);
CREATE INDEX idx_vacunacion_nino       ON vacunacion (nino_id);
CREATE INDEX idx_alerta_nino           ON alerta (nino_id);
CREATE INDEX idx_notificacion_campana  ON notificacion (campana_id);


-- ---------------------------------------------------------------------
-- Datos iniciales: roles del personal
-- ---------------------------------------------------------------------
INSERT INTO rol (nombre) VALUES
  ('administrador'),
  ('personal_salud'),
  ('encargado');
