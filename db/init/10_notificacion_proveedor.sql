-- =====================================================================
-- SCCVI - Id del mensaje en el proveedor de envio
--
-- Guarda el id que devuelve el proveedor (Resend, SMTP o Telegram) al enviar
-- cada notificacion, para poder rastrearla en su panel si un padre dice que
-- no le llego el aviso.
--
-- Es seguro ejecutarlo mas de una vez.
-- =====================================================================

ALTER TABLE notificacion ADD COLUMN IF NOT EXISTS id_proveedor varchar(255);
