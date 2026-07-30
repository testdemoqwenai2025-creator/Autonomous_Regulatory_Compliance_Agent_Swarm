/**
 * Shared server-timing utilities.
 *
 * Wrap any API route handler to automatically:
 *  1. Time the handler execution
 *  2. Time DB writes/reads (if caller provides callbacks)
 *  3. Inject x-handler-ms, x-db-write-ms, x-db-read-ms into the response
 *  4. Read middleware headers and forward them
 *
 * Usage:
 *   const t = startTiming(request);
 *   // ... do DB work ...
 *   t.dbWriteMs = dbWriteTime;  // optional
 *   t.dbReadMs = dbReadTime;    // optional
 *   const response = NextResponse.json(data);
 *   return applyTimingHeaders(response, t);
 */

import { NextRequest, NextResponse } from 'next/server';

export interface TimingContext {
  request: NextRequest;
  handlerStart: number;
  handlerStartTs: string;
  dbWriteMs: number;
  dbReadMs: number;
  // Middleware headers (read from request)
  requestId: string;
  mwStart: string;
  mwEnd: string;
  mwHit: string;
  mwMs: number;
  clientIp: string;
  userAgent: string;
}

export function startTiming(request: NextRequest): TimingContext {
  return {
    request,
    handlerStart: performance.now(),
    handlerStartTs: new Date().toISOString(),
    dbWriteMs: 0,
    dbReadMs: 0,
    requestId: request.headers.get('x-request-id') ?? 'no-middleware',
    mwStart: request.headers.get('x-middleware-start') ?? 'n/a',
    mwEnd: request.headers.get('x-middleware-end') ?? 'n/a',
    mwHit: request.headers.get('x-middleware-hit') ?? 'false',
    mwMs: parseInt(request.headers.get('x-middleware-ms') ?? '0', 10),
    clientIp: request.headers.get('x-client-ip') ?? 'unknown',
    userAgent: request.headers.get('x-client-user-agent') ?? 'unknown',
  };
}

export function finalizeTiming(t: TimingContext): number {
  return Math.round(performance.now() - t.handlerStart);
}

export function applyTimingHeaders(response: NextResponse, t: TimingContext): NextResponse {
  const handlerMs = finalizeTiming(t);
  response.headers.set('x-request-id', t.requestId);
  response.headers.set('x-middleware-hit', t.mwHit);
  response.headers.set('x-middleware-start', t.mwStart);
  response.headers.set('x-middleware-end', t.mwEnd);
  response.headers.set('x-middleware-ms', String(t.mwMs));
  response.headers.set('x-handler-ms', String(handlerMs));
  response.headers.set('x-db-write-ms', String(t.dbWriteMs));
  response.headers.set('x-db-read-ms', String(t.dbReadMs));
  return response;
}

/**
 * Instrumented DB write — wraps an async function and records the duration.
 */
export async function timedWrite<T>(t: TimingContext, fn: () => Promise<T>): Promise<T> {
  const start = performance.now();
  try {
    return await fn();
  } finally {
    t.dbWriteMs = Math.round(performance.now() - start);
  }
}

/**
 * Instrumented DB read — wraps an async function and records the duration.
 */
export async function timedRead<T>(t: TimingContext, fn: () => Promise<T>): Promise<T> {
  const start = performance.now();
  try {
    return await fn();
  } finally {
    t.dbReadMs = Math.round(performance.now() - start);
  }
}