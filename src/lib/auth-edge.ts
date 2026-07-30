/**
 * Edge-compatible auth verification for middleware.
 * Only contains JWT verification using Web Crypto API (no Node.js crypto).
 * No Prisma dependency (Edge doesn't support it).
 */

export type Role = 'viewer' | 'analyst' | 'operator' | 'admin';

export const ROLE_PERMISSIONS: Record<Role, {
  read: boolean; audit: boolean; remediateDryRun: boolean;
  remediateApply: boolean; admin: boolean; anonymise: boolean;
}> = {
  viewer:  { read: true,  audit: false, remediateDryRun: false, remediateApply: false, admin: false, anonymise: false },
  analyst: { read: true,  audit: true,  remediateDryRun: true,  remediateApply: false, admin: false, anonymise: true  },
  operator: { read: true,  audit: true,  remediateDryRun: true,  remediateApply: true,  admin: false, anonymise: true  },
  admin:   { read: true,  audit: true,  remediateDryRun: true,  remediateApply: true,  admin: true,  anonymise: true  },
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
  sub: string;
  email: string;
  role: Role;
  iat: number;
  exp: number;
  jti: string;
}

const AUTH_SECRET = () => process.env.AUTH_SECRET ?? 'dev-secret-change-in-production';

function base64UrlEncode(data: string): string {
  return Buffer.from(data).toString('base64url');
}

function base64UrlDecode(data: string): string {
  return Buffer.from(data, 'base64url').toString();
}

/**
 * Edge-compatible JWT verification using Web Crypto API.
 * Uses crypto.subtle.importKey + HMAC-SHA256.
 */
export async function verifyJWT(token: string): Promise<JWTPayload | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [headerB64, bodyB64, sigB64] = parts;
    const body = base64UrlDecode(bodyB64);
    const payload = JSON.parse(body) as JWTPayload;

    // Check expiry
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;

    // Verify signature using Web Crypto
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(AUTH_SECRET()),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );

    const data = new TextEncoder().encode(`${headerB64}.${bodyB64}`);
    const sig = Uint8Array.from(atob(sigB64.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

    const valid = await crypto.subtle.verify('HMAC', key, sig, data);
    if (!valid) return null;

    return payload;
  } catch {
    return null;
  }
}
