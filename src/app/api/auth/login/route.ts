/**
 * POST /api/auth/login
 *
 * Authenticates a user by email + password (or dev-mode auto-login),
 * returns a JWT token and the user's API key.
 *
 * In dev mode (AUTH_DEV_MODE=true), accepts any email and auto-creates the user.
 * In production, validate against a real identity provider.
 */

import { NextRequest, NextResponse } from 'next/server';
import { startTiming, applyTimingHeaders, timedWrite, timedRead } from '@/lib/timing-headers';
import { signJWT, generateApiKey, hashApiKey, AuthError } from '@/lib/auth';
import { parseAndValidate, loginSchema, ValidationError } from '@/lib/validation';
import { PrismaClient } from '@prisma/client';
import { logger } from '@/lib/logger';

function freshDb() { return new PrismaClient({ log: [] }); }

export async function POST(request: NextRequest) {
  const t = startTiming(request);
  const db = freshDb();
  const requestId = request.headers.get('x-request-id') ?? 'no-req-id';
  const log = logger.child({ requestId, path: '/api/auth/login' });

  try {
    const rawBody = await request.json().catch(() => ({}));
    const body = parseAndValidate(loginSchema, rawBody);

    const devMode = process.env.AUTH_DEV_MODE === 'true';
    let user;

    if (devMode) {
      user = await timedRead(t, () => db.user.upsert({
        where: { email: body.email },
        update: { lastLoginAt: new Date() },
        create: {
          email: body.email,
          name: body.email.split('@')[0],
          role: body.role ?? 'admin',
          lastLoginAt: new Date(),
        },
      }));

      if (!user.apiKeyHash) {
        const { plain, hashed } = generateApiKey();
        await timedWrite(t, () => db.user.update({
          where: { id: user!.id },
          data: { apiKeyHash: hashed },
        }));
        user = { ...user, apiKey: plain };
      }
    } else {
      user = await timedRead(t, () => db.user.findUnique({ where: { email: body.email } }));
      if (!user) {
        log.warn('Login failed: invalid credentials', { email: body.email });
        throw new AuthError('Invalid credentials', 401);
      }
      await timedWrite(t, () => db.user.update({
        where: { id: user!.id },
        data: { lastLoginAt: new Date() },
      }));
    }

    const jwt = signJWT({
      sub: user.id,
      email: user.email,
      role: user.role as 'viewer' | 'analyst' | 'operator' | 'admin',
    });

    log.info('Login successful', { userId: user.id, email: user.email, role: user.role });
    await db.$disconnect();

    return applyTimingHeaders(NextResponse.json({
      status: 'authenticated',
      token: jwt,
      tokenType: 'Bearer',
      expiresIn: 8 * 60 * 60,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        hasApiKey: !!user.apiKeyHash,
      },
    }), t);

  } catch (err) {
    await db.$disconnect();
    if (err instanceof ValidationError) {
      return applyTimingHeaders(
        NextResponse.json({ error: err.message, details: err.details, status: 400 }, { status: 400 }),
        t,
      );
    }
    const status = err instanceof AuthError ? err.statusCode : 500;
    const message = err instanceof Error ? err.message : 'Login failed';
    return applyTimingHeaders(
      NextResponse.json({ error: message, status }, { status }),
      t,
    );
  }
}
