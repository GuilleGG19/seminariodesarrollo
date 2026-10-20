-- =====================================================================
-- SCCVI - Alertas de talla baja y envio de notificaciones
--
-- 1) Nuevo tipo de alerta "talla_baja" (percentil de talla < 5: posible
--    desnutricion cronica).
-- 2) Control de envios en notificacion: cuantos intentos se hicieron, el
--    ultimo error y cuando reintentar. El envio lo hace el backend
--    (services/notificacion.service.js).
--
-- Es seguro ejecutarlo mas de una vez.
-- =====================================================================

ALTER TABLE alerta DROP CONSTRAINT IF EXISTS chk_alerta_tipo;
ALTER TABLE alerta ADD CONSTRAINT chk_alerta_tipo CHECK (
  tipo IN ('desnutricion', 'sobrepeso', 'talla_baja', 'sin_registros', 'vacuna_atrasada')
);

ALTER TABLE notificacion
  ADD COLUMN IF NOT EXISTS intentos         int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ultimo_error     text,
  ADD COLUMN IF NOT EXISTS proximo_intento  timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS fecha_creacion   timestamptz NOT NULL DEFAULT now();

-- Acelera la busqueda de notificaciones por enviar
CREATE INDEX IF NOT EXISTS idx_notificacion_pendientes
  ON notificacion (proximo_intento)
  WHERE estado_envio = 'pendiente';

CREATE INDEX IF NOT EXISTS idx_notificacion_alerta ON notificacion (alerta_id);
