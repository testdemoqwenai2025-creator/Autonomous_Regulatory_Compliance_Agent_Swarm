/**
 * Authentication & Authorization utilities for Maritime Compliance Swarm.
 *
 * Supports:
 *  - API Key authentication (X-API-Key header)
 *  - JWT Bearer token authentication (Authorization: Bearer <token>)
 *  - RBAC role-based access control (viewer, analyst, operator, admin)
 *  - API key rotation
 *  - Token generation and verification
 *
 * JWTs are signed with HMAC-SHA256 using AUTH_SECRET env var.
 * API keys are stored hashed (SHA-256) in the User model.
 */

import { PrismaClient } from '@prisma/client';
import { createHash, randomBytes, createHmac, timingSafeEqual } from 'crypto';

export type Role = 'viewer' | 'analyst' | 'operator' | 'admin';

export const ROLE_PERMISSIONS: Record<Role, {
  read: boolean; audit: boolean; remediateDryRun: boolean;
  remediateApply: boolean; admin: boolean; anonymise: boolean;
}> = {
  viewer:           { read: true,  audit: false, remediateDryRun: false, remediateApply: false, admin: false, anonymise: false },
  analyst:          { read: true,  audit: true,  remediateDryRun: true,  remediateApply: false, admin: false, anonymise: true  },
  operator:         { read: true,  audit: true,  remediateDryRun: true,  remediateApply: true,  admin: false, anonymise: true  },
  admin:            { read: true,  audit: true,  remediateDryRun: true,  remediateApply: true,  admin: true,  anonymise: true  },
};

export interface AuthContext {
  authenticated: boolean;
  method: 'api_key' | 'jwt' | 'none';
  userId?: string;
  email?: string;
  role?: Role;
  permissions?: typeof ROLE_PERMISSIONS[Role];
}

export interface JWTPayload {
  sub: string;       // user id
  email: string;
  role: Role;
  iat: number;
  exp: number;
  jti: string;       // JWT ID for revocation
}

const AUTH_SECRET = () => process.env.AUTH_SECRET ?? 'dev-secret-change-in-production';
const JWT_EXPIRY_S = 8 * 60 * 60; // 8 hours

// ── Hash API key for storage ──

export function hashApiKey(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex');
}

// ── Generate new API key ──

export function generateApiKey(): { plain: string; hashed: string } {
  const prefix = 'mcs'; // Maritime Compliance Swarm
  const raw = `${prefix}_${randomBytes(24).toString('base64url')}`;
  return { plain: raw, hashed: hashApiKey(raw) };
}

// ── JWT helpers ──

function base64UrlEncode(data: string): string {
  return Buffer.from(data).toString('base64url');
}

function base64UrlDecode(data: string): string {
  return Buffer.from(data, 'base64url').toString();
}

export function signJWT(payload: Omit<JWTPayload, 'iat' | 'exp' | 'jti'>): string {
  const now = Math.floor(Date.now() / 1000);
  const jwtPayload: JWTPayload = {
    ...payload,
    iat: now,
    exp: now + JWT_EXPIRY_S,
    jti: `jwt_${randomBytes(12).toString('base64url')}`,
  };

  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64UrlEncode(JSON.stringify(jwtPayload));
  const signature = createHmac('sha256', AUTH_SECRET())
    .update(`${header}.${body}`)
    .digest('base64url');

  return `${header}.${body}.${signature}`;
}

export function verifyJWT(token: string): JWTPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [header, body, sig] = parts;
    const expectedSig = createHmac('sha256', AUTH_SECRET())
      .update(`${header}.${body}`)
      .digest('base64url');

    // Timing-safe comparison
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) return null;

    const payload = JSON.parse(base64UrlDecode(body)) as JWTPayload;

    // Check expiry
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;

    return payload;
  } catch {
    return null;
  }
}

// ── Authenticate a request using API key or JWT ──

export async function authenticate(request: Request): Promise<AuthContext> {
  const db = new PrismaClient({ log: [] });

  try {
    // Try API key first
    const apiKey = request.headers.get('x-api-key');
    if (apiKey) {
      const hashed = hashApiKey(apiKey);
      const user = await db.user.findUnique({ where: { apiKeyHash: hashed } });
      if (user) {
        await db.$disconnect();
        return {
          authenticated: true,
          method: 'api_key',
          userId: user.id,
          email: user.email,
          role: user.role as Role,
          permissions: ROLE_PERMISSIONS[user.role as Role],
        };
      }
    }

    // Try JWT
    const authHeader = request.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const payload = verifyJWT(token);
      if (payload) {
        await db.$disconnect();
        return {
          authenticated: true,
          method: 'jwt',
          userId: payload.sub,
          email: payload.email,
          role: payload.role,
          permissions: ROLE_PERMISSIONS[payload.role],
        };
      }
    }

    await db.$disconnect();
    return { authenticated: false, method: 'none' };
  } catch {
    await db.$disconnect();
    return { authenticated: false, method: 'none' };
  }
}

// ── Require authentication (returns 401 if not authenticated) ──

export async function requireAuth(request: Request): Promise<AuthContext & { authenticated: true }> {
  const ctx = await authenticate(request);
  if (!ctx.authenticated) {
    throw new AuthError('Authentication required. Provide X-API-Key or Authorization: Bearer <token>.', 401);
  }
  return ctx as AuthContext & { authenticated: true };
}

// ── Require specific role ──

export async function requireRole(request: Request, minRole: Role): Promise<AuthContext & { authenticated: true }> {
  const ctx = await requireAuth(request);
  const hierarchy: Record<Role, number> = { viewer: 0, analyst: 1, operator: 2, admin: 3 };
  if ((hierarchy[ctx.role ?? 'viewer'] ?? 0) < hierarchy[minRole]) {
    throw new AuthError(`Insufficient permissions. Required role: ${minRole}, your role: ${ctx.role}.`, 403);
  }
  return ctx;
}

// ── Check if a permission is granted ──

export function hasPermission(ctx: AuthContext, permission: keyof typeof ROLE_PERMISSIONS[Role]): boolean {
  if (!ctx.permissions) return false;
  return ctx.permissions[permission] === true;
}

// ── Custom error class ──

export class AuthError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number = 401) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'AuthError';
  }
}
