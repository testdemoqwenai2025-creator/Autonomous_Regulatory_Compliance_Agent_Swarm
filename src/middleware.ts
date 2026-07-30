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

  const middlewareStart = new Date().toISOString();
  const requestId = GENERATE_ID();
  const clientIp =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown';
  const userAgent = request.headers.get('user-agent') ?? 'unknown';

  // Clone the request and inject middleware metadata as custom headers.
  // These headers will be readable by the downstream API route handler.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-request-id', requestId);
  requestHeaders.set('x-middleware-start', middlewareStart);
  requestHeaders.set('x-client-ip', clientIp);
  requestHeaders.set('x-client-user-agent', userAgent);
  requestHeaders.set('x-middleware-hit', 'true');

  // Build the response
  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  // Capture middleware end time — this runs synchronously before the response
  // is sent, so it measures the middleware processing duration.
  const middlewareEnd = new Date().toISOString();
  const middlewareMs = Math.round(
    new Date(middlewareEnd).getTime() - new Date(middlewareStart).getTime(),
  );

  // Expose middleware tracking headers to both the API handler and the browser.
  // The API handler reads them from request; the browser reads them from response.
  response.headers.set('x-request-id', requestId);
  response.headers.set('x-middleware-hit', 'true');
  response.headers.set('x-middleware-start', middlewareStart);
  response.headers.set('x-middleware-end', middlewareEnd);
  response.headers.set('x-middleware-ms', String(middlewareMs));

  return response;
}

export const config = {
  matcher: '/api/:path*',
};
