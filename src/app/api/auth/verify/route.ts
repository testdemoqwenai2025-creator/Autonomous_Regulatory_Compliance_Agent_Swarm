/**
 * POST /api/auth/verify
 *
 * Verifies a JWT token or API key without performing a full login.
 * Returns the token's claims / user info if valid.
 */

import { NextRequest, NextResponse } from 'next/server';
import { startTiming, applyTimingHeaders } from '@/lib/timing-headers';
import { authenticate } from '@/lib/auth';

export async function POST(request: NextRequest) {
  const t = startTiming(request);

  const auth = await authenticate(request);

  return applyTimingHeaders(NextResponse.json({
    valid: auth.authenticated,
    method: auth.method,
    userId: auth.userId,
    email: auth.email,
    role: auth.role,
    permissions: auth.permissions,
  }), t);
}
