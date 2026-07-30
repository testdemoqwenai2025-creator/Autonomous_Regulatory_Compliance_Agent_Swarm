/**
 * GET /api/system/config
 *
 * Returns the runtime configuration validation result.
 * Shows all config values (with secrets masked) and any warnings.
 */

import { NextRequest, NextResponse } from 'next/server';
import { startTiming, applyTimingHeaders } from '@/lib/timing-headers';
import { validateConfig } from '@/lib/config';

export async function GET(request: NextRequest) {
  const t = startTiming(request);
  const { config, warnings, valid } = validateConfig();

  // Mask the secret
  const safeConfig = {
    ...config,
    auth: {
      ...config.auth,
      secret: config.auth.secret ? '********' : '(not set)',
    },
    database: {
      ...config.database,
      url: config.database.url.replace(/:([^@/]+)@/, ':***@'), // mask password
    },
  };

  return applyTimingHeaders(NextResponse.json({ valid, config: safeConfig, warnings }), t);
}
