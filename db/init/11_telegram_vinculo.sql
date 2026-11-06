-- =====================================================================
-- SCCVI - Vinculacion de padres con el bot de Telegram
--
-- Un bot solo puede escribir a quien le hablo primero. Flujo:
--  1) El personal genera un enlace t.me/<bot>?start=<codigo> para el padre.
--     Se guarda solo el HASH del codigo (telegram_codigo_hash) y su vencimiento.
--  2) El padre abre el enlace y toca "Iniciar": el bot recibe el codigo, lo
--     busca por su hash y guarda el chat del padre (cifrado).
--  3) telegram_chat_hash (HMAC del chat) permite encontrar al padre cuando
--     escribe /baja, sin descifrar todos los registros.
--
-- Es seguro ejecutarlo mas de una vez.
-- =====================================================================

ALTER TABLE padre
  ADD COLUMN IF NOT EXISTS telegram_chat_hash     varchar(64),
  ADD COLUMN IF NOT EXISTS telegram_codigo_hash   varchar(64),
  ADD COLUMN IF NOT EXISTS telegram_codigo_expira timestamptz,
  ADD COLUMN IF NOT EXISTS telegram_vinculado_en  timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS uq_padre_telegram_codigo ON padre (telegram_codigo_hash);
CREATE INDEX IF NOT EXISTS idx_padre_telegram_chat ON padre (telegram_chat_hash);
