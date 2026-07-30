/**
 * POST /api/auth/rotate
 *
 * Rotates the authenticated user's API key.
 * Requires authentication (API key or JWT).
 * Returns the new API key (only shown once).
 */

import { NextRequest, NextResponse } from 'next/server';
import { startTiming, applyTimingHeaders, timedWrite } from '@/lib/timing-headers';
import { requireAuth, generateApiKey, AuthError } from '@/lib/auth';
import { PrismaClient } from '@prisma/client';

function freshDb() { return new PrismaClient({ log: [] }); }

export async function POST(request: NextRequest) {
  const t = startTiming(request);
  const db = freshDb();

  try {
    const auth = await requireAuth(request);

    const { plain, hashed } = generateApiKey();
    await timedWrite(t, () => db.user.update({
      where: { id: auth.userId },
      data: { apiKeyHash: hashed },
    }));

    // Audit log
    await timedWrite(t, () => db.auditLog.create({
      data: {
        userId: auth.userId,
        action: 'api_key_rotated',
        resource: 'user',
        details: JSON.stringify({ method: auth.method, requestId: t.requestId }),
        ipAddress: t.clientIp,
        userAgent: t.userAgent,
      },
    }));

    await db.$disconnect();
    return applyTimingHeaders(NextResponse.json({
      status: 'rotated',
      message: 'API key rotated. Save this key — it will not be shown again.',
      apiKey: plain,
    }), t);

  } catch (err) {
    await db.$disconnect();
    const status = err instanceof AuthError ? err.statusCode : 500;
    return applyTimingHeaders(
      NextResponse.json({ error: err instanceof Error ? err.message : 'Rotation failed' }, { status }),
      t,
    );
  }
}