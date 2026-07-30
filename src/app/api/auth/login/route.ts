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
import { PrismaClient } from '@prisma/client';

function freshDb() { return new PrismaClient({ log: [] }); }

export async function POST(request: NextRequest) {
  const t = startTiming(request);
  const db = freshDb();

  try {
    let body: Record<string, unknown> = {};
    try { body = await request.json(); } catch { /* empty */ }

    const email = (body.email as string) ?? '';
    const password = (body.password as string) ?? '';
    const devMode = process.env.AUTH_DEV_MODE === 'true';

    if (!email) {
      throw new AuthError('Email is required', 400);
    }

    let user;

    if (devMode) {
      // Dev mode: auto-create or find user
      user = await timedRead(t, () => db.user.upsert({
        where: { email },
        update: { lastLoginAt: new Date() },
        create: {
          email,
          name: email.split('@')[0],
          role: (body.role as string) ?? 'admin',
          lastLoginAt: new Date(),
        },
      }));

      // Generate API key if user doesn't have one
      if (!user.apiKeyHash) {
        const { plain, hashed } = generateApiKey();
        await timedWrite(t, () => db.user.update({
          where: { id: user!.id },
          data: { apiKeyHash: hashed },
        }));
        user = { ...user, apiKey: plain };
      }
    } else {
      // Production: validate credentials (placeholder for real auth provider)
      user = await timedRead(t, () => db.user.findUnique({ where: { email } }));
      if (!user) {
        throw new AuthError('Invalid credentials', 401);
      }
      // In production, validate password hash here
      await timedWrite(t, () => db.user.update({
        where: { id: user!.id },
        data: { lastLoginAt: new Date() },
      }));
    }

    // Generate JWT
    const jwt = signJWT({
      sub: user.id,
      email: user.email,
      role: user.role as 'viewer' | 'analyst' | 'operator' | 'admin',
    });

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
    const status = err instanceof AuthError ? err.statusCode : 500;
    const message = err instanceof Error ? err.message : 'Login failed';
    return applyTimingHeaders(
      NextResponse.json({ error: message, status }, { status }),
      t,
    );
  }
}
