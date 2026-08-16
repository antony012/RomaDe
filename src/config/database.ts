import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { Admin } from '../admins/entities/admin.entity';
import { Membership } from '../memberships/entities/membership.entity';
import { User } from '../users/entities/user.entity';

function projectRefFromSupabaseUrl(supabaseUrl: string): string | null {
  try {
    const host = new URL(supabaseUrl).hostname;
    const ref = host.split('.')[0];
    return ref || null;
  } catch {
    return null;
  }
}

export function typeormOptions(config: ConfigService): TypeOrmModuleOptions {
  const entities = [User, Membership, Admin];
  const logging = config.get<string>('DB_LOGGING') === 'true';
  const ssl = { rejectUnauthorized: false };

  const databaseUrl =
    config.get<string>('DATABASE_URL') ??
    config.get<string>('SUPABASE_DB_URL') ??
    config.get<string>('POSTGRES_URL');

  if (databaseUrl) {
    return {
      type: 'postgres',
      url: databaseUrl,
      entities,
      synchronize: true,
      logging,
      ssl,
      extra: { ssl, max: 5 },
    };
  }

  const supabaseUrl =
    config.get<string>('SUPABASE_URL') ??
    config.get<string>('NEXT_PUBLIC_SUPABASE_URL');
  const supabasePassword =
    config.get<string>('SUPABASE_DB_PASSWORD') ??
    config.get<string>('DB_PASSWORD');

  if (supabaseUrl && supabasePassword) {
    const ref = projectRefFromSupabaseUrl(supabaseUrl);
    if (ref) {
      const region = config.get<string>('SUPABASE_REGION', 'us-west-2');
      const poolerHost =
        config.get<string>('SUPABASE_POOLER_HOST') ??
        `aws-0-${region}.pooler.supabase.com`;
      return {
        type: 'postgres',
        host: poolerHost,
        port: Number(config.get<string>('DB_PORT', '6543')),
        username: `postgres.${ref}`,
        password: supabasePassword,
        database: config.get<string>('DB_DATABASE', 'postgres'),
        entities,
        synchronize: true,
        logging,
        ssl,
        extra: { ssl, max: 5 },
      };
    }
  }

  const host = config.get<string>('DB_HOST', 'localhost');
  const isRemote = host !== 'localhost' && host !== '127.0.0.1';

  return {
    type: 'postgres',
    host,
    port: Number(config.get<string>('DB_PORT', '5432')),
    username: config.get<string>('DB_USERNAME', 'postgres'),
    password: config.get<string>('DB_PASSWORD', 'postgres'),
    database: config.get<string>('DB_DATABASE', 'postgres'),
    entities,
    synchronize: true,
    logging,
    ssl: isRemote ? ssl : false,
    extra: isRemote ? { ssl, max: 5 } : undefined,
  };
}
