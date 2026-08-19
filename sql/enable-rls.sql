-- RomaDe usa Nest + TypeORM con el rol postgres (bypasea RLS).
-- PostgREST (anon / authenticated) no debe leer ni escribir estas tablas.
-- Ejecutar en: Supabase → SQL Editor → Run
-- No uses FORCE ROW LEVEL SECURITY: rompería el backend.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users',
    'memberships',
    'admins',
    'integrity_sessions',
    'dash_events',
    'remote_verify_requests'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', t);
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM authenticated', t);
    END IF;
  END LOOP;
END $$;
