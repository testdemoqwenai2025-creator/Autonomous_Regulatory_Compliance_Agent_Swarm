/**
 * Runtime configuration validation.
 * Called at app startup (layout.tsx or a dedicated init endpoint)
 * to fail-fast if critical configuration is missing or invalid.
 */

export interface AppConfig {
  database: { url: string; type: 'sqlite' | 'postgresql' };
  auth: { secret: string; devMode: boolean; secretStrong: boolean };
  cors: { origins: string[] };
  env: string;
  port: number;
}

export interface ValidationWarning {
  field: string;
  message: string;
  severity: 'warn' | 'error';
}

export function validateConfig(): { config: AppConfig; warnings: ValidationWarning[]; valid: boolean } {
  const warnings: ValidationWarning[] = [];

  const dbUrl = process.env.DATABASE_URL ?? '';
  const dbType = dbUrl.startsWith('postgresql') ? 'postgresql' : 'sqlite';

  if (!dbUrl) {
    warnings.push({ field: 'DATABASE_URL', message: 'DATABASE_URL is not set', severity: 'error' });
  }

  const authSecret = process.env.AUTH_SECRET ?? '';
  const authDevMode = process.env.AUTH_DEV_MODE === 'true';
  const secretStrong = authSecret.length >= 32 && authSecret !== 'dev-secret-change-in-production' && authSecret !== 'change-me-to-a-random-32-byte-hex-string';

  if (!authSecret) {
    warnings.push({ field: 'AUTH_SECRET', message: 'AUTH_SECRET is not set. JWT signing will use insecure default.', severity: 'warn' });
  } else if (!secretStrong && !authDevMode) {
    warnings.push({ field: 'AUTH_SECRET', message: 'AUTH_SECRET appears to be a default/weak value. Change it in production.', severity: 'error' });
  }

  if (authDevMode && process.env.NODE_ENV === 'production') {
    warnings.push({ field: 'AUTH_DEV_MODE', message: 'AUTH_DEV_MODE=true is not safe in production. Set to false.', severity: 'error' });
  }

  const corsOrigins = process.env.NEXT_PUBLIC_CORS_ORIGINS?.split(',').map(s => s.trim()).filter(Boolean) ?? ['*'];
  if (corsOrigins.includes('*') && process.env.NODE_ENV === 'production') {
    warnings.push({ field: 'NEXT_PUBLIC_CORS_ORIGINS', message: 'Wildcard CORS origin is not safe in production. Specify exact domains.', severity: 'warn' });
  }

  const config: AppConfig = {
    database: { url: dbUrl, type: dbType },
    auth: { secret: authSecret, devMode: authDevMode, secretStrong },
    cors: { origins: corsOrigins },
    env: process.env.NODE_ENV ?? 'development',
    port: parseInt(process.env.PORT ?? '3000', 10),
  };

  const valid = !warnings.some(w => w.severity === 'error');
  return { config, warnings, valid };
}
