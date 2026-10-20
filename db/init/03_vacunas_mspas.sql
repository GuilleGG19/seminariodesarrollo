-- =====================================================================
-- SCCVI - Catalogo de vacunas segun el Esquema Nacional de Vacunacion
-- del MSPAS de Guatemala (ninos menores de 7 anios), version 2026
-- (con vacuna Hexavalente).
--
-- Formato de la tabla vacuna:
--   edad_recomendada_meses = edad de la PRIMERA dosis (0 = al nacer)
--   dosis_total            = numero total de dosis, refuerzos incluidos
--
-- El sistema guarda solo la edad de la primera dosis. Las fechas de las dosis
-- siguientes las programa el personal con "proxima_dosis" al registrar cada dosis.
--
-- Dosis de cada vacuna (edad en que corresponde):
--   BCG ................... dosis 1: al nacer (hasta antes de cumplir 1 anio)
--   Hexavalente ........... dosis 1: 2 m | dosis 2: 4 m | dosis 3: 6 m | dosis 4 (refuerzo): 18 m
--   Neumococo ............. dosis 1: 2 m | dosis 2: 4 m | dosis 3 (refuerzo): 12 m
--   Rotavirus ............. dosis 1: 2 m | dosis 2: 4 m
--   Poliomielitis oral .... dosis 1: 4 m | dosis 2 (1er refuerzo): 18 m | dosis 3 (2o refuerzo): 4 anios
--   SPR ................... dosis 1: 12 m | dosis 2: 18 m
--   Varicela .............. dosis 1: 15 m | dosis 2 (refuerzo): 4 anios
--   DPT ................... dosis 1 (refuerzo): 4 anios
--
-- NO incluidas (las fuentes consultadas no coinciden en sus edades o dosis):
--   Influenza estacional y Hepatitis B del recien nacido. Si hacen falta,
--   se agregan desde la API (POST /api/vacunas) con los datos del documento oficial.
--
-- IMPORTANTE: verificar contra el documento oficial vigente del MSPAS
-- (Cuaderno de Vacunacion / Esquema Nacional), que se actualiza cada anio.
--
-- Es seguro ejecutarlo mas de una vez: no inserta vacunas que ya existan
-- (compara el nombre sin importar mayusculas).
-- =====================================================================

INSERT INTO vacuna (nombre, edad_recomendada_meses, dosis_total)
SELECT v.nombre, v.edad_recomendada_meses, v.dosis_total
FROM (VALUES
  ('BCG (tuberculosis)',                          0, 1),
  ('Hexavalente',                                 2, 4),
  ('Neumococo',                                   2, 3),
  ('Rotavirus',                                   2, 2),
  ('Poliomielitis oral (OPV)',                    4, 3),
  ('SPR (sarampión, paperas y rubéola)',         12, 2),
  ('Varicela',                                   15, 2),
  ('DPT (difteria, tos ferina y tétanos)',       48, 1)
) AS v(nombre, edad_recomendada_meses, dosis_total)
WHERE NOT EXISTS (
  SELECT 1 FROM vacuna x WHERE lower(x.nombre) = lower(v.nombre)
);
