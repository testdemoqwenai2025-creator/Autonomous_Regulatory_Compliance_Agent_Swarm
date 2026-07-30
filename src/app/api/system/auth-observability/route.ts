/**
 * /api/system/auth-observability
 *
 * Auth observability endpoint — captures and correlates:
 *   - Frontend: login timing, token storage latency, auth header injection overhead
 *   - Server-side: middleware auth verification latency, RBAC check latency, JWT
 *     verification timing, role hierarchy lookup timing
 *
 * GET  ?mode=summary  → aggregate auth metrics across all requests
 * GET  ?mode=history  → recent auth events (successes + failures)
 * GET  ?mode=stats    → auth method breakdown (api_key vs jwt vs none)
 * POST              → ingest a frontend auth trace (login flow timing)
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { startTiming, applyTimingHeaders, timedWrite, timedRead } from '@/lib/timing-headers';
import { parseAndValidate, authTraceSchema, ValidationError } from '@/lib/validation';

function freshDb() { return new PrismaClient({ log: [] }); }

// In-memory auth event buffer (circular, last 200 events)
const AUTH_EVENT_BUFFER: Array<Record<string, unknown>> = [];
const MAX_BUFFER = 200;
let totalAuthSuccesses = 0;
let totalAuthFailures = 0;
let totalRbacDenials = 0;
const authMethodCounts: Record<string, number> = { jwt: 0, api_key: 0, none: 0 };
const authLatencyBuckets: number[] = [];
const MAX_LATENCY_BUCKETS = 500;

// ── GET: retrieve auth metrics ──
export async function GET(request: NextRequest) {
  const t = startTiming(request);
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('mode') ?? 'summary';

  try {
    // ?mode=summary → aggregate auth metrics
    if (mode === 'summary') {
      const avgLatencyMs = authLatencyBuckets.length > 0
        ? Math.round(authLatencyBuckets.reduce((a, b) => a + b, 0) / authLatencyBuckets.length)
        : 0;
      const p50LatencyMs = authLatencyBuckets.length > 0
        ? authLatencyBuckets.sort((a, b) => a - b)[Math.floor(authLatencyBuckets.length * 0.5)]
        : 0;
      const p99LatencyMs = authLatencyBuckets.length > 0
        ? authLatencyBuckets.sort((a, b) => a - b)[Math.floor(authLatencyBuckets.length * 0.99)]
        : 0;

      await freshDb().$disconnect();
      return applyTimingHeaders(NextResponse.json({
        period: 'since_startup',
        totals: {
          successes: totalAuthSuccesses,
          failures: totalAuthFailures,
          rbacDenials: totalRbacDenials,
          total: totalAuthSuccesses + totalAuthFailures,
        },
        successRate: (totalAuthSuccesses + totalAuthFailures) > 0
          ? ((totalAuthSuccesses / (totalAuthSuccesses + totalAuthFailures)) * 100).toFixed(1) + '%'
          : 'N/A',
        methods: { ...authMethodCounts },
        latency: {
          avgMs: avgLatencyMs,
          p50Ms: p50LatencyMs,
          p99Ms: p99LatencyMs,
          samples: authLatencyBuckets.length,
        },
        bufferSize: AUTH_EVENT_BUFFER.length,
      }), t);
    }

    // ?mode=stats → auth method breakdown
    if (mode === 'stats') {
      await freshDb().$disconnect();
      return applyTimingHeaders(NextResponse.json({
        methods: { ...authMethodCounts },
        total: Object.values(authMethodCounts).reduce((a, b) => a + b, 0),
        failures: totalAuthFailures,
        rbacDenials: totalRbacDenials,
      }), t);
    }

    // ?mode=history (default) → recent auth events
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '20', 10), 100);
    const events = AUTH_EVENT_BUFFER.slice(-limit).reverse();
    await freshDb().$disconnect();
    return applyTimingHeaders(NextResponse.json({
      events,
      total: AUTH_EVENT_BUFFER.length,
      returned: events.length,
    }), t);

  } catch (err) {
    return applyTimingHeaders(
      NextResponse.json(
        { error: 'Failed to retrieve auth metrics', detail: String(err) },
        { status: 500 },
      ),
      t,
    );
  }
}

// ── POST: ingest frontend auth trace ──
export async function POST(request: NextRequest) {
  const t = startTiming(request);
  const db = freshDb();

  try {
    let body: Record<string, unknown> = {};
    try {
      body = parseAndValidate(authTraceSchema, await request.json().catch(() => ({})));
    } catch (err) {
      if (err instanceof ValidationError) {
        return applyTimingHeaders(
          NextResponse.json({ error: err.message, details: err.details }, { status: 400 }),
          t,
        );
      }
    }

    const requestId = request.headers.get('x-request-id') ?? 'no-middleware';
    const mwMs = parseInt(request.headers.get('x-middleware-ms') ?? '0', 10);
    const authMethod = request.headers.get('x-auth-method') ?? 'none';
    const authRole = request.headers.get('x-auth-role') ?? '';
    const authLatencyMs = parseInt(request.headers.get('x-auth-latency-ms') ?? '0', 10);

    // Frontend-reported timing
    const frontendLoginMs = (body.frontendLoginMs as number) ?? 0;
    const frontendTokenStorageMs = (body.frontendTokenStorageMs as number) ?? 0;
    const frontendAuthHeaderInjectMs = (body.frontendAuthHeaderInjectMs as number) ?? 0;
    const frontendTotalAuthFlowMs = (body.frontendTotalAuthFlowMs as number) ?? 0;
    const loginMethod = (body.loginMethod as string) ?? 'unknown';
    const loginSuccess = (body.loginSuccess as boolean) ?? false;
    const loginError = (body.loginError as string) ?? '';

    // Build auth event
    const event: Record<string, unknown> = {
      ts: new Date().toISOString(),
      requestId,
      loginMethod,
      loginSuccess,
      loginError: loginError || undefined,
      frontend: {
        loginMs: frontendLoginMs,
        tokenStorageMs: frontendTokenStorageMs,
        authHeaderInjectMs: frontendAuthHeaderInjectMs,
        totalAuthFlowMs: frontendTotalAuthFlowMs,
      },
      server: {
        middlewareMs: mwMs,
        authMethod,
        authRole,
        authLatencyMs,
      },
      correlation: {
        frontendToServerDeltaMs: frontendLoginMs > 0 && mwMs > 0
          ? Math.round(frontendLoginMs - mwMs)
          : null,
        totalEndToEndMs: frontendTotalAuthFlowMs,
      },
    };

    // Push to in-memory buffer
    AUTH_EVENT_BUFFER.push(event);
    if (AUTH_EVENT_BUFFER.length > MAX_BUFFER) AUTH_EVENT_BUFFER.shift();

    // Update counters
    if (loginSuccess) {
      totalAuthSuccesses++;
      authMethodCounts[authMethod] = (authMethodCounts[authMethod] ?? 0) + 1;
    } else {
      totalAuthFailures++;
    }

    // Track latency
    if (authLatencyMs > 0) {
      authLatencyBuckets.push(authLatencyMs);
      if (authLatencyBuckets.length > MAX_LATENCY_BUCKETS) authLatencyBuckets.shift();
    }

    // Persist to DB for long-term storage
    await timedWrite(t, () => db.systemEvent.create({
      data: {
        requestId,
        path: '/api/system/auth-observability',
        method: 'POST',
        middlewareTs: new Date(),
        handlerTs: new Date(),
        dbWriteTs: new Date(),
        statusCode: 201,
        clientIp: request.headers.get('x-client-ip') ?? '',
        userAgent: request.headers.get('x-client-user-agent') ?? '',
        layerTrace: JSON.stringify({
          auth_method: authMethod,
          auth_role: authRole,
          auth_latency_ms: authLatencyMs,
          frontend_login_ms: frontendLoginMs,
          frontend_total_ms: frontendTotalAuthFlowMs,
          login_success: loginSuccess,
        }),
      },
    }));

    await db.$disconnect();
    return applyTimingHeaders(NextResponse.json({
      status: 'auth_trace_stored',
      requestId,
      eventCaptured: true,
    }, { status: 201 }), t);

  } catch (err) {
    await db.$disconnect();
    return applyTimingHeaders(
      NextResponse.json(
        { error: 'Failed to store auth trace', detail: String(err) },
        { status: 500 },
      ),
      t,
    );
  }
}
