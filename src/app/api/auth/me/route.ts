/**
 * GET /api/auth/me
 *
 * Returns the current authenticated user's profile.
 * Requires authentication (API key or JWT).
 */

import { NextRequest, NextResponse } from 'next/server';
import { startTiming, applyTimingHeaders, timedRead } from '@/lib/timing-headers';
import { requireAuth, AuthError } from '@/lib/auth';
import { PrismaClient } from '@prisma/client';

function freshDb() { return new PrismaClient({ log: [] }); }

export async function GET(request: NextRequest) {
  const t = startTiming(request);
  const db = freshDb();

  try {
    const auth = await requireAuth(request);
    const user = await timedRead(t, () => db.user.findUnique({
      where: { id: auth.userId },
      select: { id: true, email: true, name: true, role: true, lastLoginAt: true, createdAt: true },
    }));

    await db.$disconnect();
    return applyTimingHeaders(NextResponse.json({
      user,
      auth: { method: auth.method, role: auth.role, permissions: auth.permissions },
    }), t);

  } catch (err) {
    await db.$disconnect();
    const status = err instanceof AuthError ? err.statusCode : 500;
    return applyTimingHeaders(
      NextResponse.json({ error: err instanceof Error ? err.message : 'Auth check failed' }, { status }),
      t,
    );
  }
}
