-- =====================================================================
-- SCCVI - Columnas de fecha y hora con zona horaria (timestamptz)
--
-- Problema: las columnas "timestamp" (sin zona) guardan la hora del servidor
-- de base de datos (UTC en Docker), pero Node las interpreta como hora local
-- (Guatemala) y las envia al frontend con 6 horas de diferencia.
-- Con "timestamptz" el instante es inequivoco.
--
-- Los valores existentes se guardaron en UTC (zona del contenedor), por eso
-- se convierten con "AT TIME ZONE 'UTC'".
--
-- Tambien corrige ninos cuya comunidad quedo distinta a la de su padre.
--
-- Es seguro ejecutarlo mas de una vez: solo convierte columnas que aun
-- sean "timestamp without time zone".
-- =====================================================================

DO $$
DECLARE
  col record;
BEGIN
  FOR col IN
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND data_type = 'timestamp without time zone'
      AND (table_name, column_name) IN (
        ('usuario', 'fecha_creacion'),
        ('alerta', 'fecha_generada'),
        ('alerta', 'fecha_atendida'),
        ('campana', 'fecha_envio'),
        ('notificacion', 'fecha_envio'),
        ('carnet_qr', 'fecha_generado'),
        ('carnet_qr', 'fecha_expiracion'),
        ('carnet_qr', 'bloqueado_hasta')
      )
  LOOP
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN %I TYPE timestamptz USING %I AT TIME ZONE ''UTC''',
      col.table_name, col.column_name, col.column_name
    );
  END LOOP;
END $$;

-- Ninos que quedaron en una comunidad distinta a la de su padre
UPDATE nino n
SET comunidad_id = p.comunidad_id
FROM padre p
WHERE p.id = n.padre_id AND n.comunidad_id <> p.comunidad_id;
