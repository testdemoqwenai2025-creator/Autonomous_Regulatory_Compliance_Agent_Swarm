import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

function freshDb() {
  return new PrismaClient({ log: [] });
}

/**
 * ═══════════════════════════════════════════════════════════════
 *  /api/system/observability/ep-trace
 * ═══════════════════════════════════════════════════════════════
 *
 *  The master observability endpoint. Accepts a full-site trace payload
 *  from the browser (via useEndpointTracer hook) that contains:
 *
 *    1. Page-level browser metrics (memory, DOM nodes, long tasks, resources)
 *    2. Per-endpoint browser-side timing (TTFB, round-trip, DNS, TCP, SSL,
 *       transfer size, protocol) extracted from the Performance API
 *    3. Per-endpoint server-side timing read from response headers
 *       (x-middleware-ms, x-handler-ms, x-db-write-ms, x-db-read-ms)
 *    4. Derived correlation fields (network transit, browser overhead)
 *
 *  GET  ?mode=history   → last N stored traces with spans
 *  GET  ?mode=latest    → most recent trace with spans
 *  GET  ?mode=summary   → aggregate stats across all traces
 *  POST                → ingest a full-site trace (spans array)
 *
 *  Expected POST body:
 *  {
 *    traceId: string,          // client-generated UUID for correlation
 *    initiatedBy: string,      // 'manual' | 'auto_page_load' | 'auto_interval'
 *    spans: [{
 *      endpoint, method, statusCode,
 *      clientDnsMs, clientTcpMs, clientSslMs,
 *      clientTtfbMs, clientResponseMs, clientRoundTripMs,
 *      clientJsonParseMs, clientTransferSize, clientEncodedSize, clientDecodedSize,
 *      clientProtocol,
 *      serverMiddlewareMs, serverHandlerMs, serverDbWriteMs, serverDbReadMs,
 *      error?
 *    }],
 *    browserMetrics: {
 *      ttfbAvgMs, roundTripAvgMs,
 *      longTaskCount, longTaskTotalMs,
 *      memoryUsedMb, memoryLimitMb,
 *      domNodes, resourceCount
 *    },
 *    navigationType, connectionType, pageUrl
 *  }
 */

// ── GET: retrieve stored traces ──
export async function GET(request: NextRequest) {
  const db = freshDb();
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('mode');

  try {
    // ?mode=latest → single most recent trace with all spans
    if (mode === 'latest') {
      const trace = await db.endpointTrace.findFirst({
        orderBy: { createdAt: 'desc' },
        include: { spans: { orderBy: { clientRoundTripMs: 'desc' } } },
      });
      const totalTraces = await db.endpointTrace.count();
      await db.$disconnect();
      return NextResponse.json({ trace, totalTraces });
    }

    // ?mode=summary → aggregate statistics
    if (mode === 'summary') {
      const totalTraces = await db.endpointTrace.count();
      const totalSpans = await db.endpointTraceSpan.count();

      // Average timing across all spans
      const spanAgg = await db.endpointTraceSpan.aggregate({
        _avg: {
          clientTtfbMs: true,
          clientRoundTripMs: true,
          clientDnsMs: true,
          clientTcpMs: true,
          clientSslMs: true,
          clientJsonParseMs: true,
          serverMiddlewareMs: true,
          serverHandlerMs: true,
          serverDbWriteMs: true,
          serverDbReadMs: true,
          networkTransitMs: true,
          browserOverheadMs: true,
          clientTransferSize: true,
        },
        _count: true,
      });

      // Per-endpoint breakdown
      const byEndpoint = await db.endpointTraceSpan.groupBy({
        by: ['endpoint', 'method'],
        _count: true,
        _avg: {
          clientTtfbMs: true,
          clientRoundTripMs: true,
          serverHandlerMs: true,
          serverMiddlewareMs: true,
        },
        _min: { clientRoundTripMs: true },
        _max: { clientRoundTripMs: true },
        orderBy: { _count: { id: 'desc' } },
        take: 30,
      });

      // Error rate
      const errorSpans = await db.endpointTraceSpan.count({
        where: { statusCode: { gte: 400 } },
      });
      const errorRate = totalSpans > 0 ? ((errorSpans / totalSpans) * 100).toFixed(1) : '0';

      // Trace-level aggregates
      const traceAgg = await db.endpointTrace.aggregate({
        _avg: {
          browserTtfbAvgMs: true,
          browserRoundTripAvgMs: true,
          serverMiddlewareAvgMs: true,
          serverHandlerAvgMs: true,
          serverDbWriteAvgMs: true,
          serverDbReadAvgMs: true,
          totalEndToEndMs: true,
          memoryUsedMb: true,
          longTaskTotalMs: true,
        },
        _max: { totalEndpointsHit: true },
      });

      await db.$disconnect();
      return NextResponse.json({
        traces: { total: totalTraces, aggregates: traceAgg },
        spans: { total: totalSpans, aggregates: spanAgg, errorCount: errorSpans, errorRate: `${errorRate}%` },
        byEndpoint,
      });
    }

    // ?mode=history (default) → last N traces with spans
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '10', 10), 50);
    const traces = await db.endpointTrace.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { spans: true },
    });
    const totalTraces = await db.endpointTrace.count();
    await db.$disconnect();
    return NextResponse.json({ traces, total: totalTraces });

  } catch (err) {
    await db.$disconnect();
    return NextResponse.json(
      { error: 'Failed to retrieve traces', detail: String(err) },
      { status: 500 },
    );
  }
}

// ── POST: ingest full-site trace ──
export async function POST(request: NextRequest) {
  const db = freshDb();
  const handlerStart = performance.now();
  const handlerStartTs = new Date().toISOString();

  // Read middleware headers
  const requestId = request.headers.get('x-request-id') ?? 'no-middleware';
  const mwMs = parseInt(request.headers.get('x-middleware-ms') ?? '0', 10);
  const clientIp = request.headers.get('x-client-ip') ?? '';
  const userAgent = request.headers.get('x-client-user-agent') ?? '';

  // Parse body
  let body: Record<string, unknown> = {};
  try { body = await request.json(); } catch { /* empty */ }

  const bodyParseMs = Math.round(performance.now() - handlerStart);

  const traceId = (body.traceId as string) ?? `ep_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const initiatedBy = (body.initiatedBy as string) ?? 'manual';
  const spans = (body.spans as Array<Record<string, unknown>>) ?? [];
  const browserMetrics = (body.browserMetrics as Record<string, unknown>) ?? {};
  const navigationType = (body.navigationType as string) ?? '';
  const connectionType = (body.connectionType as string) ?? '';
  const pageUrl = (body.pageUrl as string) ?? '';

  // Compute aggregate values from spans
  const okSpans = spans.filter(s => (s.statusCode as number) < 400);
  const failSpans = spans.filter(s => (s.statusCode as number) >= 400);
  const ttfbValues = spans.map(s => (s.clientTtfbMs as number) ?? 0).filter(v => v > 0);
  const roundTripValues = spans.map(s => (s.clientRoundTripMs as number) ?? 0).filter(v => v > 0);
  const mwValues = spans.map(s => (s.serverMiddlewareMs as number) ?? 0).filter(v => v > 0);
  const handlerValues = spans.map(s => (s.serverHandlerMs as number) ?? 0).filter(v => v > 0);
  const dbWriteValues = spans.map(s => (s.serverDbWriteMs as number) ?? 0).filter(v => v > 0);
  const dbReadValues = spans.map(s => (s.serverDbReadMs as number) ?? 0).filter(v => v > 0);

  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  // ── DB WRITE: persist trace + spans ──
  const dbWriteStart = performance.now();

  const traceRecord = await db.endpointTrace.create({
    data: {
      traceId,
      requestId,
      initiatedBy,
      clientIp,
      userAgent,
      navigationType,
      connectionType,
      pageUrl,
      browserTtfbAvgMs: (browserMetrics.ttfbAvgMs as number) ?? avg(ttfbValues),
      browserRoundTripAvgMs: (browserMetrics.roundTripAvgMs as number) ?? avg(roundTripValues),
      longTaskCount: (browserMetrics.longTaskCount as number) ?? 0,
      longTaskTotalMs: (browserMetrics.longTaskTotalMs as number) ?? 0,
      memoryUsedMb: (browserMetrics.memoryUsedMb as number) ?? 0,
      memoryLimitMb: (browserMetrics.memoryLimitMb as number) ?? 0,
      domNodes: (browserMetrics.domNodes as number) ?? 0,
      resourceCount: (browserMetrics.resourceCount as number) ?? 0,
      totalEndpointsHit: spans.length,
      totalEndpointsOk: okSpans.length,
      totalEndpointsFail: failSpans.length,
      serverMiddlewareAvgMs: avg(mwValues),
      serverHandlerAvgMs: avg(handlerValues),
      serverDbWriteAvgMs: avg(dbWriteValues),
      serverDbReadAvgMs: avg(dbReadValues),
      totalEndToEndMs: (browserMetrics.roundTripAvgMs as number) ?? Math.round(avg(roundTripValues)),
      authMethod: (body.authMethod as string) ?? '',
      authUserId: (body.authUserId as string) ?? '',
      authRole: (body.authRole as string) ?? '',
      rateLimitLimit: parseInt(request.headers.get('x-ratelimit-limit') ?? '0', 10),
      rateLimitRemaining: parseInt(request.headers.get('x-ratelimit-remaining') ?? '0', 10),
      configValid: true,
      spans: {
        create: spans.map(s => {
          const ttfb = (s.clientTtfbMs as number) ?? 0;
          const sMw = (s.serverMiddlewareMs as number) ?? 0;
          const sHandler = (s.serverHandlerMs as number) ?? 0;
          const rt = (s.clientRoundTripMs as number) ?? 0;
          return {
            endpoint: (s.endpoint as string) ?? '',
            method: (s.method as string) ?? 'GET',
            statusCode: (s.statusCode as number) ?? 0,
            clientFetchStartMs: (s.clientFetchStartMs as number) ?? 0,
            clientDnsMs: (s.clientDnsMs as number) ?? 0,
            clientTcpMs: (s.clientTcpMs as number) ?? 0,
            clientSslMs: (s.clientSslMs as number) ?? 0,
            clientTtfbMs: ttfb,
            clientResponseMs: (s.clientResponseMs as number) ?? 0,
            clientRoundTripMs: rt,
            clientJsonParseMs: (s.clientJsonParseMs as number) ?? 0,
            clientTransferSize: (s.clientTransferSize as number) ?? 0,
            clientEncodedSize: (s.clientEncodedSize as number) ?? 0,
            clientDecodedSize: (s.clientDecodedSize as number) ?? 0,
            clientProtocol: (s.clientProtocol as string) ?? '',
            serverMiddlewareMs: sMw,
            serverHandlerMs: sHandler,
            serverDbWriteMs: (s.serverDbWriteMs as number) ?? 0,
            serverDbReadMs: (s.serverDbReadMs as number) ?? 0,
            networkTransitMs: Math.max(0, ttfb - sMw - sHandler),
            browserOverheadMs: Math.max(0, rt - ttfb),
            error: (s.error as string) ?? '',
            rateLimitLimit: (s.rateLimitLimit as number) ?? 0,
            rateLimitRemaining: (s.rateLimitRemaining as number) ?? 0,
            authMethod: (s.authMethod as string) ?? '',
          };
        }),
      },
    },
  });

  const dbWriteMs = Math.round(performance.now() - dbWriteStart);
  const handlerEndTs = new Date().toISOString();
  const handlerMs = Math.round(performance.now() - handlerStart);

  // Write ComponentHealth for the observability system itself
  await db.componentHealth.create({
    data: {
      component: 'observability_ep_trace',
      status: 'healthy',
      latencyMs: handlerMs,
      details: JSON.stringify({
        traceId, spanCount: spans.length, dbWriteMs, bodyParseMs,
        endpoint: '/api/system/observability/ep-trace',
      }),
    },
  });

  // Write SystemEvent
  await db.systemEvent.create({
    data: {
      requestId,
      path: '/api/system/observability/ep-trace',
      method: 'POST',
      middlewareTs: new Date(),
      handlerTs: new Date(handlerStartTs),
      dbWriteTs: new Date(),
      statusCode: 201,
      clientIp,
      userAgent,
      layerTrace: JSON.stringify({
        browser: 'full_site_trace_submitted',
        middleware: 'intercepted',
        api_handler: 'ep_trace_persisted',
        database: `${spans.length + 2}_records_written`,
        traceId,
        endpoints_traced: spans.length,
      }),
    },
  });

  // Count totals
  const [totalTraces, totalSpans] = await Promise.all([
    db.endpointTrace.count(),
    db.endpointTraceSpan.count(),
  ]);

  await db.$disconnect();

  const response = NextResponse.json({
    status: 'ep_trace_stored',
    message: `Full-site observability trace persisted: ${spans.length} endpoints traced`,
    traceId: traceRecord.traceId,
    id: traceRecord.id,
    serverTiming: {
      middlewareMs: mwMs,
      handlerMs,
      bodyParseMs,
      dbWriteMs,
    },
    summary: {
      endpointsHit: spans.length,
      endpointsOk: okSpans.length,
      endpointsFailed: failSpans.length,
      avgTtfbMs: Math.round(avg(ttfbValues)),
      avgRoundTripMs: Math.round(avg(roundTripValues)),
      avgMiddlewareMs: Math.round(avg(mwValues)),
      avgHandlerMs: Math.round(avg(handlerValues)),
      avgDbWriteMs: Math.round(avg(dbWriteValues)),
      avgDbReadMs: Math.round(avg(dbReadValues)),
    },
    browserMetrics: {
      ...(browserMetrics ?? {}),
      ttfbAvgMs: Math.round(avg(ttfbValues)),
      roundTripAvgMs: Math.round(avg(roundTripValues)),
    },
    stats: {
      totalEpTraces: totalTraces,
      totalEpSpans: totalSpans,
    },
  }, { status: 201 });

  // Forward timing headers
  response.headers.set('x-request-id', requestId);
  response.headers.set('x-handler-ms', String(handlerMs));
  response.headers.set('x-db-write-ms', String(dbWriteMs));

  return response;
}
