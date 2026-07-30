import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

function freshDb() {
  return new PrismaClient({ log: [] });
}

/**
 * POST /api/system/correlated-trace
 *
 * Dedicated endpoint for ingesting **rich browser-side timing** collected
 * via the Performance API (PerformanceObserver, Resource Timing, Navigation Timing)
 * and correlating it with the server-side middleware / handler / DB trace.
 *
 * Expected request body (JSON):
 * {
 *   // Core timing (from performance.now())
 *   fetchStartIso, ttfbMs, roundTripMs, jsonParseMs, renderStartMs,
 *
 *   // Resource Timing API fields (from PerformanceResourceTiming)
 *   dnsMs, tcpMs, sslMs, requestMs, responseMs, transferSize, encodedBodySize, decodedBodySize,
 *
 *   // Navigation Timing fields
 *   navigationType, connectionType, protocol,
 *
 *   // Which page/component initiated the trace
 *   source, component,
 *
 *   // All other API calls observed on the page in the same window
 *   observedResources: [{ name, duration, transferSize, initiatorType, startTime }]
 * }
 *
 * The server reads its own middleware headers, times handler + DB work,
 * and persists a full CorrelatedTrace row in SQLite.
 *
 * ?mode=history  →  GET returns last 50 stored correlated traces
 */

// ── GET: trace history ──
export async function GET(request: NextRequest) {
  const db = freshDb();
  const { searchParams } = new URL(request.url);

  const mode = searchParams.get('mode');
  if (mode === 'history') {
    const since = searchParams.get('since');
    const where = since ? { createdAt: { gte: new Date(since) } } : {};
    const traces = await db.correlatedTrace.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    const count = await db.correlatedTrace.count();
    await db.$disconnect();
    return NextResponse.json({ traces, total: count });
  }

  // ?mode=summary → aggregate stats
  if (mode === 'summary') {
    const total = await db.correlatedTrace.count();
    const latest = await db.correlatedTrace.findFirst({
      orderBy: { createdAt: 'desc' },
    });
    const agg = await db.correlatedTrace.aggregate({
      _avg: {
        clientTtfbMs: true,
        clientRoundTripMs: true,
        serverMiddlewareMs: true,
        serverHandlerMs: true,
        serverDbWriteMs: true,
        serverDbReadMs: true,
        clientServerDeltaMs: true,
        totalEndToEndMs: true,
      },
      _min: { clientTtfbMs: true, totalEndToEndMs: true },
      _max: { clientTtfbMs: true, totalEndToEndMs: true },
    });
    // Per-path breakdown
    const byPath = await db.correlatedTrace.groupBy({
      by: ['path', 'method'],
      _count: true,
      _avg: { clientRoundTripMs: true, serverHandlerMs: true },
      orderBy: { _count: { id: 'desc' } },
      take: 20,
    });
    await db.$disconnect();
    return NextResponse.json({
      total, latest,
      averages: agg._avg,
      min: agg._min,
      max: agg._max,
      byPath,
    });
  }

  // Default: return API info
  await db.$disconnect();
  const requestId = request.headers.get('x-request-id') ?? 'no-id';
  return NextResponse.json({
    endpoint: '/api/system/correlated-trace',
    status: 'available',
    description: 'Dedicated correlated client+server trace endpoint',
    usage: {
      POST: 'Send browser timing data for correlation and persistence',
      'GET?mode=history': 'Retrieve stored traces',
      'GET?mode=summary': 'Aggregate statistics',
    },
    requestId,
    middlewareHit: request.headers.get('x-middleware-hit'),
  });
}

// ── POST: ingest browser timing + produce correlated trace ──
export async function POST(request: NextRequest) {
  const db = freshDb();
  const handlerStart = performance.now();
  const handlerStartTs = new Date().toISOString();

  // Read middleware-injected headers
  const requestId = request.headers.get('x-request-id') ?? 'no-middleware';
  const mwStart = request.headers.get('x-middleware-start') ?? 'n/a';
  const mwEnd = request.headers.get('x-middleware-end') ?? 'n/a';
  const mwHit = request.headers.get('x-middleware-hit') ?? 'false';
  const mwMs = parseInt(request.headers.get('x-middleware-ms') ?? '0', 10);
  const clientIp = request.headers.get('x-client-ip') ?? 'unknown';
  const userAgent = request.headers.get('x-client-user-agent') ?? 'unknown';

  // Parse request body (browser timing payload)
  let body: Record<string, unknown> = {};
  try { body = await request.json(); } catch { /* empty body */ }

  const bodyEnd = performance.now();
  const bodyParseMs = Math.round(bodyEnd - handlerStart);

  // ── DB WRITE: persist the correlated trace ──
  const dbWriteStart = performance.now();
  const clientTiming = body as Record<string, unknown>;
  const observedResources = (body.observedResources as Array<Record<string, unknown>>) ?? [];

  // Extract all timing fields
  const clientFetchStart = (clientTiming.fetchStartIso as string) ?? '';
  const clientTtfbMs = (clientTiming.ttfbMs as number) ?? 0;
  const clientRoundTripMs = (clientTiming.roundTripMs as number) ?? 0;
  const clientJsonParseMs = (clientTiming.jsonParseMs as number) ?? 0;
  const clientRenderStartMs = (clientTiming.renderStartMs as number) ?? 0;
  const clientNetworkProtocol = (clientTiming.protocol as string) ?? '';

  // Enrich with Resource Timing fields if available
  const resourceTiming = body.resourceTiming as Record<string, unknown> | undefined;
  const dnsMs = (resourceTiming?.dnsMs as number) ?? 0;
  const tcpMs = (resourceTiming?.tcpMs as number) ?? 0;
  const sslMs = (resourceTiming?.sslMs as number) ?? 0;
  const requestMs = (resourceTiming?.requestMs as number) ?? 0;
  const responseMs = (resourceTiming?.responseMs as number) ?? 0;
  const transferSize = (resourceTiming?.transferSize as number) ?? 0;
  const encodedBodySize = (resourceTiming?.encodedBodySize as number) ?? 0;
  const decodedBodySize = (resourceTiming?.decodedBodySize as number) ?? 0;

  // Compute clock delta
  let clockDeltaMs = 0;
  if (clientFetchStart && clientTtfbMs > 0) {
    const clientTtfbInstant = new Date(clientFetchStart).getTime() + clientTtfbMs;
    clockDeltaMs = Math.round(new Date(handlerStartTs).getTime() - clientTtfbInstant);
  }

  // Build enriched timing JSON
  const enrichedTiming = {
    ...clientTiming,
    resourceTiming: { dnsMs, tcpMs, sslMs, requestMs, responseMs, transferSize, encodedBodySize, decodedBodySize },
    bodyParseMs,
    source: (clientTiming.source as string) ?? 'unknown',
    component: (clientTiming.component as string) ?? 'unknown',
    navigationType: (clientTiming.navigationType as string) ?? 'unknown',
    connectionType: (clientTiming.connectionType as string) ?? 'unknown',
    observedResourceCount: observedResources.length,
  };

  // Write ComponentHealth for all observed components
  const componentsToTrack = [
    { component: 'browser', status: 'healthy' as const, latencyMs: clientRoundTripMs, details: JSON.stringify({ clientTtfbMs, source: (clientTiming.source as string) ?? 'trace' }) },
    { component: 'middleware', status: mwHit === 'true' ? 'healthy' as const : 'degraded' as const, latencyMs: mwMs, details: JSON.stringify({ requestId, mwStart, mwEnd }) },
    { component: 'correlated_trace_api', status: 'healthy' as const, latencyMs: bodyParseMs, details: JSON.stringify({ handlerStartTs, endpoint: '/api/system/correlated-trace' }) },
  ];

  await db.componentHealth.createMany({ data: componentsToTrack });

  // Write SystemEvent for this trace request
  await db.systemEvent.create({
    data: {
      requestId,
      path: '/api/system/correlated-trace',
      method: 'POST',
      middlewareTs: mwStart !== 'n/a' ? new Date(mwStart) : new Date(),
      handlerTs: new Date(handlerStartTs),
      dbWriteTs: new Date(),
      dbReadMs: 0,
      statusCode: 201,
      clientIp,
      userAgent,
      layerTrace: JSON.stringify({
        browser: 'timing_collected',
        middleware: mwHit === 'true' ? 'intercepted' : 'bypassed',
        api_handler: 'correlated_trace_processed',
        database_write: 'trace_persisted',
        component_health: `${componentsToTrack.length}_records`,
      }),
    },
  });

  // Write the CorrelatedTrace (the main record)
  const traceRecord = await db.correlatedTrace.create({
    data: {
      requestId,
      path: '/api/system/correlated-trace',
      method: 'POST',
      statusCode: 201,
      // Client-side
      clientFetchStart,
      clientTtfbMs,
      clientRoundTripMs,
      clientJsonParseMs,
      clientRenderStartMs,
      clientNetworkProtocol: clientNetworkProtocol || (clientTiming.networkProtocol as string) || '',
      clientTimingJson: JSON.stringify(enrichedTiming),
      // Server-side
      serverMiddlewareStartTs: mwStart,
      serverMiddlewareEndTs: mwEnd,
      serverMiddlewareMs: mwMs,
      serverHandlerStartTs: handlerStartTs,
      serverHandlerEndTs: new Date().toISOString(),
      serverHandlerMs: Math.round(performance.now() - handlerStart),
      serverDbWriteMs: Math.round(performance.now() - dbWriteStart),
      serverDbReadMs: 0,
      // Correlation
      clientServerDeltaMs: clockDeltaMs,
      totalEndToEndMs: clientRoundTripMs || Math.round(performance.now() - handlerStart),
    },
  });

  const dbWriteMs = Math.round(performance.now() - dbWriteStart);
  const handlerEndTs = new Date().toISOString();
  const handlerMs = Math.round(new Date(handlerEndTs).getTime() - new Date(handlerStartTs).getTime());

  // Count totals
  const [totalEvents, totalHealth, totalTraces] = await Promise.all([
    db.systemEvent.count(),
    db.componentHealth.count(),
    db.correlatedTrace.count(),
  ]);

  await db.$disconnect();

  const response = NextResponse.json({
    status: 'correlated_trace_stored',
    message: 'Browser timing correlated with server-side trace and persisted',
    traceId: traceRecord.id,
    requestId,
    clientTimingJson: JSON.stringify(enrichedTiming),
    client: {
      fetchStart: clientFetchStart,
      ttfbMs: clientTtfbMs,
      roundTripMs: clientRoundTripMs,
      jsonParseMs: clientJsonParseMs,
      renderStartMs: clientRenderStartMs,
      networkProtocol: clientNetworkProtocol,
      navigationType: (clientTiming.navigationType as string) ?? 'n/a',
      connectionType: (clientTiming.connectionType as string) ?? 'n/a',
      source: (clientTiming.source as string) ?? 'unknown',
      component: (clientTiming.component as string) ?? 'unknown',
      resourceTiming: { dnsMs, tcpMs, sslMs, requestMs, responseMs, transferSize, encodedBodySize, decodedBodySize },
      observedResources: observedResources.length,
    },
    server: {
      middleware: {
        status: mwHit === 'true' ? 'intercepted' : 'bypassed',
        startTs: mwStart, endTs: mwEnd,
        durationMs: mwMs,
        requestId, clientIp,
        headersInjected: ['x-request-id', 'x-middleware-start', 'x-middleware-end', 'x-middleware-ms', 'x-client-ip', 'x-middleware-hit'],
      },
      handler: {
        status: 'processed',
        endpoint: '/api/system/correlated-trace',
        method: 'POST',
        startTs: handlerStartTs,
        endTs: handlerEndTs,
        durationMs: handlerMs,
        bodyParseMs,
      },
      database: {
        status: 'trace_persisted',
        engine: 'SQLite via Prisma ORM',
        writeMs: dbWriteMs,
        readMs: 0,
        recordsWritten: 2 + componentsToTrack.length,
        recordsRead: 3,
      },
    },
    correlation: {
      clockDeltaMs,
      totalEndToEndMs: clientRoundTripMs || handlerMs,
      serverTotalMs: handlerMs,
      browserOverheadMs: clientRoundTripMs ? clientRoundTripMs - handlerMs : null,
      networkTransitMs: clientTtfbMs ? clientTtfbMs - mwMs - handlerMs : null,
      tracePersisted: true,
    },
    stats: {
      totalTrackedEvents: totalEvents,
      totalHealthChecks: totalHealth,
      totalCorrelatedTraces: totalTraces,
    },
  }, { status: 201 });

  // Forward middleware headers in response
  response.headers.set('x-request-id', requestId);
  response.headers.set('x-middleware-hit', mwHit);
  response.headers.set('x-middleware-start', mwStart);
  response.headers.set('x-middleware-end', mwEnd);
  response.headers.set('x-middleware-ms', String(mwMs));
  response.headers.set('x-handler-ms', String(handlerMs));
  response.headers.set('x-db-write-ms', String(dbWriteMs));

  return response;
}
