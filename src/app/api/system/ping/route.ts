import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * GET /api/system/ping
 *
 * This is the unified "full-stack communication" endpoint.
 * It proves the request passed through EVERY layer:
 *
 *   BROWSER  →  MIDDLEWARE  →  API HANDLER  →  DATABASE  →  API HANDLER  →  BROWSER
 *
 * The middleware injects x-request-id, x-middleware-timestamp,
 * x-client-ip, x-client-user-agent, x-middleware-hit headers.
 * This handler reads those headers, queries/writes the DB, and returns
 * a detailed trace so the frontend (browser) can visualise the entire flow.
 */
export async function GET(request: NextRequest) {
  const handlerStart = performance.now();
  const handlerTs = new Date().toISOString();

  // ── 1. Read middleware-injected headers ───────────────────────
  const requestId =
    request.headers.get('x-request-id') ?? 'no-middleware';
  const middlewareTs =
    request.headers.get('x-middleware-timestamp') ?? 'n/a';
  const middlewareHit =
    request.headers.get('x-middleware-hit') ?? 'false';
  const clientIp = request.headers.get('x-client-ip') ?? 'unknown';
  const userAgent = request.headers.get('x-client-user-agent') ?? 'unknown';

  // ── 2. DATABASE: Write component health checks ───────────────
  const dbWriteStart = performance.now();

  // Write middleware health
  await db.componentHealth.create({
    data: {
      component: 'middleware',
      status: middlewareHit === 'true' ? 'healthy' : 'degraded',
      latencyMs: 0,
      details: JSON.stringify({
        requestId,
        middlewareTs,
        clientIp,
        middlewareHit,
      }),
    },
  });

  // Write API handler health
  await db.componentHealth.create({
    data: {
      component: 'api',
      status: 'healthy',
      latencyMs: 0,
      details: JSON.stringify({
        requestId,
        handlerTs,
        endpoint: '/api/system/ping',
        method: 'GET',
      }),
    },
  });

  const dbWriteEnd = performance.now();
  const dbWriteMs = Math.round(dbWriteEnd - dbWriteStart);
  const dbWriteTs = new Date().toISOString();

  // ── 3. DATABASE: Read recent events for stats ────────────────
  const dbReadStart = performance.now();

  const recentEvents = await db.systemEvent.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5,
  });

  const totalEvents = await db.systemEvent.count();
  const totalHealthChecks = await db.componentHealth.count();

  const healthByComponent = await db.componentHealth.groupBy({
    by: ['component', 'status'],
    _count: true,
    _max: { checkedAt: true },
  });

  const dbReadEnd = performance.now();
  const dbReadMs = Math.round(dbReadEnd - dbReadStart);

  // ── 4. DATABASE: Write the full trace as a SystemEvent ───────
  await db.systemEvent.create({
    data: {
      requestId,
      path: '/api/system/ping',
      method: 'GET',
      middlewareTs: middlewareTs !== 'n/a' ? new Date(middlewareTs) : new Date(),
      handlerTs: new Date(handlerTs),
      dbWriteTs: new Date(dbWriteTs),
      dbReadMs,
      statusCode: 200,
      clientIp,
      userAgent,
      layerTrace: JSON.stringify({
        browser: 'request_initiated',
        middleware: middlewareHit === 'true' ? 'intercepted' : 'bypassed',
        api_handler: 'processed',
        database_write: 'completed',
        database_read: 'completed',
        api_response: 'sent',
      }),
    },
  });

  // ── 5. Build the full response ───────────────────────────────
  const handlerEnd = performance.now();
  const totalMs = Math.round(handlerEnd - handlerStart);

  const response = NextResponse.json({
    status: 'ok',
    message: 'Full-stack communication verified — request passed through all layers',

    // -- Layer-by-layer trace --
    trace: {
      browser: {
        status: 'request_sent',
        note: 'Your browser initiated this fetch()',
      },
      middleware: {
        status: middlewareHit === 'true' ? 'intercepted' : 'not_intercepted',
        requestId,
        timestamp: middlewareTs,
        clientIp,
        userAgent: userAgent.slice(0, 80) + (userAgent.length > 80 ? '...' : ''),
        headersInjected: [
          'x-request-id',
          'x-middleware-timestamp',
          'x-client-ip',
          'x-client-user-agent',
          'x-middleware-hit',
        ],
      },
      api_handler: {
        status: 'processed',
        endpoint: '/api/system/ping',
        method: 'GET',
        timestamp: handlerTs,
        totalLatencyMs: totalMs,
      },
      database: {
        status: 'read_write_verified',
        engine: 'SQLite via Prisma ORM',
        dbWriteLatencyMs: dbWriteMs,
        dbReadLatencyMs: dbReadMs,
        recordsWritten: 3,
        recordsRead: recentEvents.length + 3,
      },
    },

    // -- Database statistics --
    stats: {
      totalTrackedEvents: totalEvents + 1,
      totalHealthChecks,
      recentEvents: recentEvents.map((e) => ({
        id: e.id.slice(-8),
        path: e.path,
        method: e.method,
        statusCode: e.statusCode,
        dbReadMs: e.dbReadMs,
        createdAt: e.createdAt.toISOString(),
      })),
      healthByComponent,
    },

    // -- Timing breakdown --
    timing: {
      middlewareOverheadMs: middlewareTs !== 'n/a'
        ? Math.round(new Date(handlerTs).getTime() - new Date(middlewareTs).getTime())
        : null,
      dbWriteMs,
      dbReadMs,
      totalHandlerMs: totalMs,
    },
  });

  // Expose middleware headers on the response for browser inspection
  response.headers.set('x-request-id', requestId);
  response.headers.set('x-middleware-hit', middlewareHit);
  response.headers.set('x-middleware-timestamp', middlewareTs);
  response.headers.set('x-db-write-ms', String(dbWriteMs));
  response.headers.set('x-db-read-ms', String(dbReadMs));

  return response;
}

/**
 * POST /api/system/ping
 *
 * Writes a custom event into the database (browser → middleware → API → DB)
 * and returns confirmation with the DB-generated ID proving the write succeeded.
 */
export async function POST(request: NextRequest) {
  const handlerTs = new Date().toISOString();
  const requestId =
    request.headers.get('x-request-id') ?? 'no-middleware';
  const middlewareTs =
    request.headers.get('x-middleware-timestamp') ?? 'n/a';
  const middlewareHit =
    request.headers.get('x-middleware-hit') ?? 'false';
  const clientIp = request.headers.get('x-client-ip') ?? 'unknown';

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    // empty body is fine
  }

  const dbWriteStart = performance.now();

  // Write the event to the database
  const created = await db.systemEvent.create({
    data: {
      requestId,
      path: '/api/system/ping',
      method: 'POST',
      middlewareTs: middlewareTs !== 'n/a' ? new Date(middlewareTs) : new Date(),
      handlerTs: new Date(handlerTs),
      dbWriteTs: new Date(),
      dbReadMs: null,
      statusCode: 201,
      clientIp,
      userAgent: request.headers.get('x-client-user-agent') ?? 'unknown',
      layerTrace: JSON.stringify({
        browser: 'post_initiated',
        middleware: middlewareHit === 'true' ? 'intercepted' : 'bypassed',
        api_handler: 'processed',
        database_write: 'completed',
        api_response: 'created',
      }),
    },
  });

  const dbWriteMs = Math.round(performance.now() - dbWriteStart);

  const response = NextResponse.json(
    {
      status: 'created',
      message: 'Event written to database via full-stack pipeline',
      event: {
        id: created.id,
        requestId,
        path: created.path,
        method: created.method,
        statusCode: created.statusCode,
        createdAt: created.createdAt.toISOString(),
      },
      trace: {
        middleware: middlewareHit === 'true' ? 'intercepted' : 'bypassed',
        api_handler: 'processed',
        database: 'write_confirmed',
        dbWriteLatencyMs: dbWriteMs,
      },
      payload: body,
    },
    { status: 201 },
  );

  response.headers.set('x-request-id', requestId);
  response.headers.set('x-middleware-hit', middlewareHit);
  return response;
}
