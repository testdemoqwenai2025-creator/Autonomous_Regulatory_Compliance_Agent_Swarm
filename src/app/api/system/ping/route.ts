import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

function freshDb() {
  return new PrismaClient({ log: ['query'] });
}

/**
 * GET /api/system/ping
 *
 * Correlated full-stack trace endpoint.
 * Reads middleware headers + optional browser client-timing header,
 * performs instrumented DB reads/writes, persists a CorrelatedTrace,
 * and returns the full client+server trace.
 *
 * ?trace=history  →  returns last 20 stored traces
 */
export async function GET(request: NextRequest) {
  const db = freshDb();
  const { searchParams } = new URL(request.url);
  const traceLookupId = searchParams.get('trace');

  // ── TRACE HISTORY MODE ──
  if (traceLookupId === 'history') {
    const traces = await db.correlatedTrace.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    await db.$disconnect();
    return NextResponse.json({ traces });
  }

  // ── MAIN PING MODE ──
  const handlerStart = performance.now();
  const handlerStartTs = new Date().toISOString();

  const requestId = request.headers.get('x-request-id') ?? 'no-middleware';
  const mwStart = request.headers.get('x-middleware-start') ?? request.headers.get('x-middleware-timestamp') ?? 'n/a';
  const mwEnd = request.headers.get('x-middleware-end') ?? 'n/a';
  const mwHit = request.headers.get('x-middleware-hit') ?? 'false';
  const mwMs = parseInt(request.headers.get('x-middleware-ms') ?? '0', 10);
  const clientIp = request.headers.get('x-client-ip') ?? 'unknown';
  const userAgent = request.headers.get('x-client-user-agent') ?? 'unknown';

  // Read browser client-timing header
  let clientTiming: Record<string, unknown> | null = null;
  const clientTimingRaw = request.headers.get('x-client-timing');
  if (clientTimingRaw) {
    try { clientTiming = JSON.parse(clientTimingRaw); } catch { /* ignore */ }
  }

  // DATABASE: writes
  const dbWriteStart = performance.now();
  await db.componentHealth.create({
    data: { component: 'middleware', status: mwHit === 'true' ? 'healthy' : 'degraded', latencyMs: mwMs, details: JSON.stringify({ requestId, mwStart, mwEnd, mwHit }) },
  });
  await db.componentHealth.create({
    data: { component: 'api_handler', status: 'healthy', latencyMs: 0, details: JSON.stringify({ requestId, handlerStartTs, endpoint: '/api/system/ping' }) },
  });
  const dbWriteEnd = performance.now();
  const dbWriteMs = Math.round(dbWriteEnd - dbWriteStart);

  // DATABASE: reads
  const dbReadStart = performance.now();
  const recentEvents = await db.systemEvent.findMany({ orderBy: { createdAt: 'desc' }, take: 5 });
  const totalEvents = await db.systemEvent.count();
  const totalHealthChecks = await db.componentHealth.count();
  const totalTraces = await db.correlatedTrace.count();
  const dbReadEnd = performance.now();
  const dbReadMs = Math.round(dbReadEnd - dbReadStart);

  const handlerEnd = performance.now();
  const handlerEndTs = new Date().toISOString();
  const handlerMs = Math.round(handlerEnd - handlerStart);

  // Persist SystemEvent
  await db.systemEvent.create({
    data: {
      requestId, path: '/api/system/ping', method: 'GET',
      middlewareTs: mwStart !== 'n/a' ? new Date(mwStart) : new Date(),
      handlerTs: new Date(handlerStartTs), dbWriteTs: new Date(), dbReadMs,
      statusCode: 200, clientIp, userAgent,
      layerTrace: JSON.stringify({ browser: 'request_initiated', middleware: mwHit === 'true' ? 'intercepted' : 'bypassed', api_handler: 'processed', database_write: 'completed', database_read: 'completed', api_response: 'sent' }),
    },
  });

  // Persist CorrelatedTrace
  let clockDeltaMs = 0;
  let clientRoundTripMs = 0;
  let clientTtfbMs = 0;
  let clientJsonParseMs = 0;
  let clientRenderStartMs = 0;
  let clientFetchStart = '';
  let clientNetworkProtocol = '';

  if (clientTiming) {
    clientRoundTripMs = (clientTiming.roundTripMs as number) ?? 0;
    clientTtfbMs = (clientTiming.ttfbMs as number) ?? 0;
    clientJsonParseMs = (clientTiming.jsonParseMs as number) ?? 0;
    clientRenderStartMs = (clientTiming.renderStartMs as number) ?? 0;
    clientFetchStart = (clientTiming.fetchStartIso as string) ?? '';
    clientNetworkProtocol = (clientTiming.networkProtocol as string) ?? '';
    if (clientFetchStart) {
      const clientTtfbInstant = new Date(clientFetchStart).getTime() + clientTtfbMs;
      clockDeltaMs = Math.round(new Date(handlerStartTs).getTime() - clientTtfbInstant);
    }
    await db.correlatedTrace.create({
      data: {
        requestId, path: '/api/system/ping', method: 'GET', statusCode: 200,
        clientFetchStart, clientTtfbMs, clientRoundTripMs, clientJsonParseMs, clientRenderStartMs, clientNetworkProtocol,
        clientTimingJson: JSON.stringify(clientTiming),
        serverMiddlewareStartTs: mwStart, serverMiddlewareEndTs: mwEnd, serverMiddlewareMs: mwMs,
        serverHandlerStartTs: handlerStartTs, serverHandlerEndTs: handlerEndTs, serverHandlerMs: handlerMs,
        serverDbWriteMs: dbWriteMs, serverDbReadMs: dbReadMs,
        clientServerDeltaMs: clockDeltaMs, totalEndToEndMs: clientRoundTripMs,
      },
    });
  }

  const response = NextResponse.json({
    status: 'ok',
    message: 'Correlated full-stack trace — browser + middleware + handler + database',
    client: clientTiming
      ? { fetchStart: clientTiming.fetchStartIso, ttfbMs: clientTtfbMs, roundTripMs: clientRoundTripMs, jsonParseMs: clientJsonParseMs, renderStartMs: clientRenderStartMs, networkProtocol: clientNetworkProtocol, navigationType: (clientTiming.navigationType as string) ?? 'n/a', connectionType: (clientTiming.connectionType as string) ?? 'n/a' }
      : { note: 'No client timing header received. Ensure browser sends x-client-timing.' },
    server: {
      middleware: { status: mwHit === 'true' ? 'intercepted' : 'bypassed', startTs: mwStart, endTs: mwEnd, durationMs: mwMs, requestId, clientIp, headersInjected: ['x-request-id', 'x-middleware-start', 'x-middleware-end', 'x-middleware-ms', 'x-client-ip', 'x-middleware-hit'] },
      handler: { status: 'processed', endpoint: '/api/system/ping', method: 'GET', startTs: handlerStartTs, endTs: handlerEndTs, durationMs: handlerMs },
      database: { status: 'read_write_verified', engine: 'SQLite via Prisma ORM', writeMs: dbWriteMs, readMs: dbReadMs, recordsWritten: 3, recordsRead: recentEvents.length + 3 },
    },
    correlation: { clockDeltaMs, totalEndToEndMs: clientRoundTripMs || handlerMs, serverTotalMs: handlerMs, browserOverheadMs: clientRoundTripMs ? clientRoundTripMs - handlerMs : null, networkTransitMs: clientTtfbMs ? clientTtfbMs - mwMs - handlerMs : null, tracePersisted: !!clientTiming },
    stats: { totalTrackedEvents: totalEvents + 1, totalHealthChecks, totalCorrelatedTraces: totalTraces + (clientTiming ? 1 : 0), recentEvents: recentEvents.map((e) => ({ id: e.id.slice(-8), path: e.path, method: e.method, statusCode: e.statusCode, dbReadMs: e.dbReadMs, createdAt: e.createdAt.toISOString() })) },
  });

  response.headers.set('x-request-id', requestId);
  response.headers.set('x-middleware-hit', mwHit);
  response.headers.set('x-middleware-start', mwStart);
  response.headers.set('x-middleware-end', mwEnd);
  response.headers.set('x-middleware-ms', String(mwMs));
  response.headers.set('x-handler-ms', String(handlerMs));
  response.headers.set('x-db-write-ms', String(dbWriteMs));
  response.headers.set('x-db-read-ms', String(dbReadMs));

  await db.$disconnect();
  return response;
}

export async function POST(request: NextRequest) {
  const db = freshDb();
  const handlerStartTs = new Date().toISOString();
  const requestId = request.headers.get('x-request-id') ?? 'no-middleware';
  const mwStart = request.headers.get('x-middleware-start') ?? 'n/a';
  const mwEnd = request.headers.get('x-middleware-end') ?? 'n/a';
  const mwHit = request.headers.get('x-middleware-hit') ?? 'false';
  const mwMs = parseInt(request.headers.get('x-middleware-ms') ?? '0', 10);
  const clientIp = request.headers.get('x-client-ip') ?? 'unknown';

  let clientTiming: Record<string, unknown> | null = null;
  const clientTimingRaw = request.headers.get('x-client-timing');
  if (clientTimingRaw) {
    try { clientTiming = JSON.parse(clientTimingRaw); } catch { /* ignore */ }
  }

  let body: Record<string, unknown> = {};
  try { body = await request.json(); } catch { /* empty */ }

  const dbWriteStart = performance.now();
  const created = await db.systemEvent.create({
    data: {
      requestId, path: '/api/system/ping', method: 'POST',
      middlewareTs: mwStart !== 'n/a' ? new Date(mwStart) : new Date(),
      handlerTs: new Date(handlerStartTs), dbWriteTs: new Date(), dbReadMs: null, statusCode: 201, clientIp,
      userAgent: request.headers.get('x-client-user-agent') ?? 'unknown',
      layerTrace: JSON.stringify({ browser: 'post_initiated', middleware: mwHit === 'true' ? 'intercepted' : 'bypassed', api_handler: 'processed', database_write: 'completed', api_response: 'created' }),
    },
  });
  const dbWriteMs = Math.round(performance.now() - dbWriteStart);
  const handlerEndTs = new Date().toISOString();
  const handlerMs = Math.round(new Date(handlerEndTs).getTime() - new Date(handlerStartTs).getTime());

  if (clientTiming) {
    const roundTripMs = (clientTiming.roundTripMs as number) ?? 0;
    let clockDeltaMs = 0;
    const clientFetchStart = (clientTiming.fetchStartIso as string) ?? '';
    if (clientFetchStart) {
      const clientTtfbInstant = new Date(clientFetchStart).getTime() + ((clientTiming.ttfbMs as number) ?? 0);
      clockDeltaMs = Math.round(new Date(handlerStartTs).getTime() - clientTtfbInstant);
    }
    await db.correlatedTrace.create({
      data: {
        requestId, path: '/api/system/ping', method: 'POST', statusCode: 201,
        clientFetchStart, clientTtfbMs: (clientTiming.ttfbMs as number) ?? 0, clientRoundTripMs: roundTripMs,
        clientJsonParseMs: (clientTiming.jsonParseMs as number) ?? 0, clientRenderStartMs: (clientTiming.renderStartMs as number) ?? 0,
        clientNetworkProtocol: (clientTiming.networkProtocol as string) ?? '',
        clientTimingJson: JSON.stringify(clientTiming),
        serverMiddlewareStartTs: mwStart, serverMiddlewareEndTs: mwEnd, serverMiddlewareMs: mwMs,
        serverHandlerStartTs: handlerStartTs, serverHandlerEndTs: handlerEndTs, serverHandlerMs: handlerMs,
        serverDbWriteMs: dbWriteMs, serverDbReadMs: 0,
        clientServerDeltaMs: clockDeltaMs, totalEndToEndMs: roundTripMs,
      },
    });
  }

  const response = NextResponse.json(
    { status: 'created', message: 'Event + correlated trace written to database', event: { id: created.id, requestId, method: 'POST', statusCode: 201, createdAt: created.createdAt.toISOString() }, serverTimings: { middlewareMs: mwMs, handlerMs, dbWriteMs }, clientTimings: clientTiming ?? { note: 'No client timing header' }, payload: body },
    { status: 201 },
  );
  response.headers.set('x-request-id', requestId);
  response.headers.set('x-middleware-hit', mwHit);
  response.headers.set('x-handler-ms', String(handlerMs));

  await db.$disconnect();
  return response;
}
