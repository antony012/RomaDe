import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';

const PUBLIC_TABLES = [
  'users',
  'memberships',
  'admins',
  'integrity_sessions',
  'dash_events',
  'remote_verify_requests',
] as const;

@Injectable()
export class DatabaseSecurityService implements OnModuleInit {
  private readonly logger = new Logger(DatabaseSecurityService.name);

  constructor(private readonly dataSource: DataSource) {}

  async onModuleInit() {
    try {
      await this.dataSource.query(`
        DO $$
        DECLARE
          t text;
        BEGIN
          FOREACH t IN ARRAY ARRAY[${PUBLIC_TABLES.map((name) => `'${name}'`).join(', ')}]
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
      `);
      this.logger.log('RLS enabled on public tables (PostgREST locked down)');
    } catch (error) {
      this.logger.warn(
        `Could not enable RLS: ${error instanceof Error ? error.message : error}`,
      );
    }
  }
}
