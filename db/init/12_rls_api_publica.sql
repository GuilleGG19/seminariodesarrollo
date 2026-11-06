-- =====================================================================
-- SCCVI - Bloquear el acceso directo a las tablas desde APIs publicas
--
-- Supabase (y servicios similares) exponen automaticamente las tablas del
-- esquema "public" por una API REST para los roles "anon" y "authenticated".
-- Activar Row Level Security SIN politicas hace que esos roles no vean ni
-- modifiquen ninguna fila. El backend del SCCVI se conecta como DUENO de las
-- tablas, y el dueno no esta sujeto a RLS, asi que sigue funcionando igual.
--
-- En PostgreSQL local (Docker) no cambia nada. Es seguro ejecutarlo mas de una vez.
-- =====================================================================

DO $$
DECLARE
  tabla record;
BEGIN
  FOR tabla IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tabla.relname);
  END LOOP;

  -- Si existen los roles de la API de Supabase, se les quitan tambien los permisos
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated';
  END IF;
END $$;

-- La vista del esquema de vacunacion se ejecuta con los permisos de quien consulta
-- (asi tampoco sirve para saltarse RLS). Requiere PostgreSQL 15 o superior.
ALTER VIEW v_esquema_vacunacion SET (security_invoker = true);
