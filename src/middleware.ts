/**
 * Maritime Compliance Swarm — Production Middleware
 *
 * Responsibilities:
 *  1. Request ID generation + propagation (correlation ID)
 *  2. Token-bucket rate limiting with per-endpoint config
 *  3. Security headers (CSP, HSTS, X-Frame-Options, nosniff)
 *  4. CORS lockdown (environment-specific)
 *  5. Timing instrumentation (start/end/ms for observability)
 *  6. Client IP + User-Agent extraction
 *  7. Auth header forwarding (API key / Bearer token)
 *
 * Auth bypass paths: /api/compliance/health, /health/live, /health/ready
 * Rate limit bypass: health probes (counted but never blocked)
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getRateLimitConfig } from '@/lib/rate-limiter';

const GENERATE_ID = () =>
  'req_' +
  Date.now().toString(36) +
  '_' +
  Math.random().toString(36).slice(2, 10);

// Paths that bypass authentication (but still get rate limited + traced)
const AUTH_BYPASS_PATHS = [
  '/api/compliance/health',
  '/api/system/ping',
  '/api/system/correlated-trace',
  '/api/system/observability/ep-trace',
];

// CORS: dev allows all, prod should be set via NEXT_PUBLIC_CORS_ORIGINS env
const CORS_ORIGINS = process.env.NEXT_PUBLIC_CORS_ORIGINS
  ? process.env.NEXT_PUBLIC_CORS_ORIGINS.split(',').map(s => s.trim())
  : ['*']; // dev default

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const middlewareStart = new Date().toISOString();
  const mwStartPerf = performance.now();

  // ── Only intercept /api/ and /health/ requests ──
  if (!pathname.startsWith('/api/') && !pathname.startsWith('/health/')) {
    return NextResponse.next();
  }

  const requestId = GENERATE_ID();
  const clientIp =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown';
  const userAgent = request.headers.get('user-agent') ?? 'unknown';

  // ── 1. CORS handling ──
  if (request.method === 'OPTIONS') {
    const origin = request.headers.get('origin') ?? '';
    const allowed = CORS_ORIGINS.includes('*') || CORS_ORIGINS.includes(origin);
    if (allowed) {
      const res = new NextResponse(null, { status: 204 });
      res.headers.set('Access-Control-Allow-Origin', CORS_ORIGINS.includes('*') ? '*' : origin);
      res.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
      res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key, X-Client-Timing');
      res.headers.set('Access-Control-Max-Age', '86400');
      res.headers.set('Access-Control-Expose-Headers', 'x-request-id, x-middleware-ms, x-handler-ms, x-db-write-ms, x-db-read-ms, x-rate-limit-limit, x-rate-limit-remaining, x-rate-limit-reset');
      return res;
    }
  }

  // ── 2. Rate limiting ──
  const rlConfig = getRateLimitConfig(pathname);
  const rlResult = checkRateLimit(clientIp, pathname);
  const isHealthProbe = AUTH_BYPASS_PATHS.some(p => pathname.startsWith(p));

  // Health probes are never blocked, but rate limit headers are still set
  if (!rlResult.allowed && !isHealthProbe) {
    const blockedResponse = NextResponse.json(
      {
        error: 'rate_limited',
        message: 'Too many requests. Please retry later.',
        retryAfterMs: rlResult.retryAfterMs,
        limit: rlResult.limit,
        path: pathname,
        requestId,
      },
      { status: 429 },
    );
    blockedResponse.headers.set('Retry-After', String(Math.ceil((rlResult.retryAfterMs ?? 1000) / 1000)));
    blockedResponse.headers.set('X-RateLimit-Limit', String(rlResult.limit));
    blockedResponse.headers.set('X-RateLimit-Remaining', '0');
    blockedResponse.headers.set('X-RateLimit-Reset', String(Math.round(rlResult.resetMs / 1000)));
    blockedResponse.headers.set('x-request-id', requestId);
    return blockedResponse;
  }

  // ── 3. Inject request headers for downstream handlers ──
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-request-id', requestId);
  requestHeaders.set('x-middleware-start', middlewareStart);
  requestHeaders.set('x-client-ip', clientIp);
  requestHeaders.set('x-client-user-agent', userAgent);
  requestHeaders.set('x-middleware-hit', 'true');

  // Forward auth headers if present
  const apiKey = request.headers.get('x-api-key');
  const authHeader = request.headers.get('authorization');
  if (apiKey) requestHeaders.set('x-auth-api-key', apiKey);
  if (authHeader) requestHeaders.set('x-auth-authorization', authHeader);

  // ── 4. Build response ──
  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  const middlewareEnd = new Date().toISOString();
  const middlewareMs = Math.round(performance.now() - mwStartPerf);

  // ── 5. Security headers (all API responses) ──
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none';"
  );

  // HSTS (only in production when behind TLS)
  if (process.env.NODE_ENV === 'production') {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }

  // CORS on actual responses
  const origin = request.headers.get('origin') ?? '';
  const allowed = CORS_ORIGINS.includes('*') || CORS_ORIGINS.includes(origin);
  if (allowed) {
    response.headers.set('Access-Control-Allow-Origin', CORS_ORIGINS.includes('*') ? '*' : origin);
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key, X-Client-Timing');
    response.headers.set('Access-Control-Expose-Headers', 'x-request-id, x-middleware-ms, x-handler-ms, x-db-write-ms, x-db-read-ms, x-rate-limit-limit, x-rate-limit-remaining, x-rate-limit-reset');
  }

  // ── 6. Middleware tracing headers ──
  response.headers.set('x-request-id', requestId);
  response.headers.set('x-middleware-hit', 'true');
  response.headers.set('x-middleware-start', middlewareStart);
  response.headers.set('x-middleware-end', middlewareEnd);
  response.headers.set('x-middleware-ms', String(middlewareMs));

  // ── 7. Rate limit headers ──
  response.headers.set('X-RateLimit-Limit', String(rlResult.limit));
  response.headers.set('X-RateLimit-Remaining', String(rlResult.remaining));
  response.headers.set('X-RateLimit-Reset', String(Math.round(rlResult.resetMs / 1000)));

  return response;
}

export const config = {
  matcher: ['/api/:path*', '/health/:path*'],
};
