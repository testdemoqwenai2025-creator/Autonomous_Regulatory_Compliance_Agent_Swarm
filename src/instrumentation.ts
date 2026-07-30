/**
 * Next.js instrumentation hook — runs once at server startup.
 * Validates critical configuration and logs warnings/errors.
 */

import { validateConfig } from '@/lib/config';
import { logger } from '@/lib/logger';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { config, warnings, valid } = validateConfig();

    logger.info('Server starting', {
      env: config.env,
      database: config.database.type,
      authDevMode: config.auth.devMode,
      corsOrigins: config.cors.origins,
      port: config.port,
      configValid: valid,
    });

    for (const w of warnings) {
      if (w.severity === 'error') {
        logger.critical('Config validation error', { field: w.field, message: w.message });
      } else {
        logger.warn('Config validation warning', { field: w.field, message: w.message });
      }
    }
  }
}
