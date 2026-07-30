import { NextRequest, NextResponse } from 'next/server';

const GENERATE_ID = () =>
  'req_' +
  Date.now().toString(36) +
  '_' +
  Math.random().toString(36).slice(2, 10);

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only intercept /api/ requests
  if (!pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  const requestId = GENERATE_ID();
  const middlewareTs = new Date().toISOString();
  const clientIp =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown';
  const userAgent = request.headers.get('user-agent') ?? 'unknown';

  // Clone the request and inject middleware metadata as custom headers
  // These headers will be readable by the downstream API route handler
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-request-id', requestId);
  requestHeaders.set('x-middleware-timestamp', middlewareTs);
  requestHeaders.set('x-client-ip', clientIp);
  requestHeaders.set('x-client-user-agent', userAgent);
  requestHeaders.set('x-middleware-hit', 'true');

  // Also set on the response so the browser can see middleware processed it
  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  // Expose middleware tracking headers to the browser
  response.headers.set('x-request-id', requestId);
  response.headers.set('x-middleware-hit', 'true');
  response.headers.set('x-middleware-timestamp', middlewareTs);

  return response;
}

export const config = {
  matcher: '/api/:path*',
};
