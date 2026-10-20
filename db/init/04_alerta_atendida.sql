-- =====================================================================
-- SCCVI - Seguimiento de alertas: atendida / quien la atendio
--
--   atendida       : true cuando la alerta ya fue revisada o ya no aplica
--   fecha_atendida : cuando se cerro
--   atendida_por   : usuario que la marco como atendida. NULL = la cerro el
--                    sistema solo, porque la situacion ya se resolvio.
--
-- Es seguro ejecutarlo mas de una vez.
-- =====================================================================

ALTER TABLE alerta
  ADD COLUMN IF NOT EXISTS atendida       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fecha_atendida timestamp,
  ADD COLUMN IF NOT EXISTS atendida_por   uuid REFERENCES usuario(id);

-- Acelera la busqueda de alertas abiertas por nino y tipo
CREATE INDEX IF NOT EXISTS idx_alerta_abiertas ON alerta (nino_id, tipo) WHERE atendida = false;
