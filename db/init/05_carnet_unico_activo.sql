-- =====================================================================
-- SCCVI - Un nino solo puede tener UN carnet QR activo a la vez.
-- Al generar uno nuevo, el sistema revoca el anterior; este indice es la
-- garantia final en la base de datos por si dos personas generan al mismo tiempo.
-- Es seguro ejecutarlo mas de una vez.
-- =====================================================================
CREATE UNIQUE INDEX IF NOT EXISTS uq_carnet_activo_por_nino
  ON carnet_qr (nino_id)
  WHERE estado = 'activo';

CREATE INDEX IF NOT EXISTS idx_carnet_nino ON carnet_qr (nino_id);
