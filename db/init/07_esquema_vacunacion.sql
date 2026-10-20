-- =====================================================================
-- SCCVI - Esquema de vacunacion esperado por nino
--
-- Antes, una vacuna solo guardaba la edad de la PRIMERA dosis, por lo que un
-- nino sin ningun registro de vacunas no aparecia como "incompleto".
--
-- 1) vacuna.edades_dosis_meses: edad (en meses) de cada dosis, en orden.
--    Ej. Hexavalente = {2,4,6,18}. Es opcional: si es NULL solo se conoce la
--    edad de la primera dosis (edad_recomendada_meses).
--
-- 2) Vista v_esquema_vacunacion: una fila por nino x vacuna x dosis con
--    su estado calculado a la fecha de hoy (Guatemala):
--      aplicada   : tiene fecha_aplicada
--      atrasada   : no aplicada y su fecha objetivo ya paso
--      pendiente  : no aplicada y su fecha objetivo aun no llega
--      sin_fecha  : no aplicada y no se conoce su edad ni fue programada
--    fecha_objetivo = fecha programada por el personal (proxima_dosis) o, si
--    no fue programada, fecha de nacimiento + edad de la dosis.
--
-- Es seguro ejecutarlo mas de una vez.
-- =====================================================================

ALTER TABLE vacuna ADD COLUMN IF NOT EXISTS edades_dosis_meses int[];

ALTER TABLE vacuna DROP CONSTRAINT IF EXISTS chk_vacuna_edades;
ALTER TABLE vacuna ADD CONSTRAINT chk_vacuna_edades CHECK (
  edades_dosis_meses IS NULL
  OR (cardinality(edades_dosis_meses) = dosis_total
      AND edades_dosis_meses[1] = edad_recomendada_meses)
);

-- Edades del Esquema Nacional del MSPAS (ver 03_vacunas_mspas.sql)
UPDATE vacuna v
SET edades_dosis_meses = e.edades
FROM (VALUES
  ('BCG (tuberculosis)',                     ARRAY[0]),
  ('Hexavalente',                            ARRAY[2, 4, 6, 18]),
  ('Neumococo',                              ARRAY[2, 4, 12]),
  ('Rotavirus',                              ARRAY[2, 4]),
  ('Poliomielitis oral (OPV)',               ARRAY[4, 18, 48]),
  ('SPR (sarampión, paperas y rubéola)',     ARRAY[12, 18]),
  ('Varicela',                               ARRAY[15, 48]),
  ('DPT (difteria, tos ferina y tétanos)',   ARRAY[48])
) AS e(nombre, edades)
WHERE lower(v.nombre) = lower(e.nombre)
  AND v.edades_dosis_meses IS NULL
  AND cardinality(e.edades) = v.dosis_total
  AND e.edades[1] = v.edad_recomendada_meses;

CREATE OR REPLACE VIEW v_esquema_vacunacion AS
WITH hoy AS (
  SELECT (now() AT TIME ZONE 'America/Guatemala')::date AS fecha
),
dosis AS (
  SELECT n.id AS nino_id, n.fecha_nacimiento,
         (extract(year FROM age(h.fecha, n.fecha_nacimiento)) * 12 +
          extract(month FROM age(h.fecha, n.fecha_nacimiento)))::int AS edad_nino_meses,
         va.id AS vacuna_id, va.nombre AS vacuna, va.dosis_total,
         d.numero_dosis,
         CASE
           WHEN va.edades_dosis_meses IS NOT NULL THEN va.edades_dosis_meses[d.numero_dosis]
           WHEN d.numero_dosis = 1 THEN va.edad_recomendada_meses
         END AS edad_dosis_meses
  FROM nino n
  CROSS JOIN hoy h
  CROSS JOIN vacuna va
  CROSS JOIN LATERAL generate_series(1, va.dosis_total) AS d(numero_dosis)
),
calculo AS (
  SELECT d.*, v.id AS vacunacion_id, v.fecha_aplicada,
         (v.id IS NOT NULL AND v.fecha_aplicada IS NULL) AS programada,
         CASE
           WHEN v.fecha_aplicada IS NOT NULL THEN v.fecha_aplicada
           WHEN v.proxima_dosis IS NOT NULL THEN v.proxima_dosis
           WHEN d.edad_dosis_meses IS NOT NULL
             THEN (d.fecha_nacimiento + make_interval(months => d.edad_dosis_meses))::date
         END AS fecha_objetivo
  FROM dosis d
  LEFT JOIN vacunacion v
    ON v.nino_id = d.nino_id AND v.vacuna_id = d.vacuna_id AND v.numero_dosis = d.numero_dosis
)
SELECT c.nino_id, c.edad_nino_meses, c.vacuna_id, c.vacuna, c.dosis_total, c.numero_dosis,
       c.edad_dosis_meses, c.vacunacion_id, c.fecha_aplicada, c.programada, c.fecha_objetivo,
       CASE
         WHEN c.fecha_aplicada IS NOT NULL THEN 'aplicada'
         WHEN c.fecha_objetivo IS NULL THEN 'sin_fecha'
         WHEN c.fecha_objetivo < h.fecha THEN 'atrasada'
         ELSE 'pendiente'
       END AS estado,
       CASE
         WHEN c.fecha_aplicada IS NULL AND c.fecha_objetivo < h.fecha
           THEN (h.fecha - c.fecha_objetivo)
       END AS dias_atraso
FROM calculo c
CROSS JOIN hoy h;
