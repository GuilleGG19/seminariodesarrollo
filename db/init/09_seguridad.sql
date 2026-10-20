-- =====================================================================
-- SCCVI - Ajustes de seguridad
--
-- 1) padre: los datos personales (DPI, telefono, correo, chat de Telegram)
--    se guardan cifrados por el backend (AES-256-GCM), por eso pasan a "text".
--    dpi_hash (HMAC del DPI) reemplaza al UNIQUE del DPI y permite buscar por
--    DPI exacto sin descifrar. Los datos existentes se cifran con:
--      cd backend && npm run cifrar-datos
--
-- 2) usuario.token_version: al cerrar sesion, cambiar la contrasena o
--    desactivar al usuario se incrementa, y los JWT emitidos antes dejan de
--    ser validos aunque no hayan expirado.
--
-- 3) carnet_qr.intentos_totales: PIN fallidos acumulados (no se reinicia).
--    Al llegar al limite el carnet se revoca.
--
-- 4) auditoria: quien hizo cada cambio (POST/PUT/PATCH/DELETE) y cuando.
--
-- Es seguro ejecutarlo mas de una vez.
-- =====================================================================

-- 1) Datos personales cifrados
ALTER TABLE padre
  ALTER COLUMN dpi              TYPE text,
  ALTER COLUMN telefono         TYPE text,
  ALTER COLUMN correo           TYPE text,
  ALTER COLUMN telegram_chat_id TYPE text,
  ADD COLUMN IF NOT EXISTS dpi_hash varchar(64);

-- El UNIQUE sobre el DPI cifrado ya no sirve (cada cifrado es distinto)
DO $$
DECLARE
  restriccion text;
BEGIN
  FOR restriccion IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY (con.conkey)
    WHERE con.conrelid = 'padre'::regclass AND con.contype = 'u' AND att.attname = 'dpi'
  LOOP
    EXECUTE format('ALTER TABLE padre DROP CONSTRAINT %I', restriccion);
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_padre_dpi_hash ON padre (dpi_hash);

-- 2) Invalidacion de sesiones
ALTER TABLE usuario ADD COLUMN IF NOT EXISTS token_version int NOT NULL DEFAULT 0;

-- 3) Limite total de intentos de PIN
ALTER TABLE carnet_qr ADD COLUMN IF NOT EXISTS intentos_totales int NOT NULL DEFAULT 0;

-- 4) Auditoria
CREATE TABLE IF NOT EXISTS auditoria (
  id         bigserial PRIMARY KEY,
  usuario_id uuid REFERENCES usuario(id),
  metodo     varchar(10) NOT NULL,
  ruta       varchar(255) NOT NULL,
  estado     int NOT NULL,
  ip         varchar(64),
  fecha      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auditoria_fecha   ON auditoria (fecha DESC);
CREATE INDEX IF NOT EXISTS idx_auditoria_usuario ON auditoria (usuario_id, fecha DESC);
