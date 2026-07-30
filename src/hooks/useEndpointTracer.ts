/**
 * useEndpointTracer — full-site observability hook.
 *
 * Captures browser-side Performance API timings for ALL fetch/XHR requests
 * on the page, collects page-level metrics (memory, DOM, long tasks, resources),
 * reads server-side timing from response headers (x-middleware-ms, x-handler-ms,
 * x-db-write-ms, x-db-read-ms), and sends the correlated trace to
 * /api/system/observability/ep-trace for persistence.
 *
 * Usage:
 *   const { runFullTrace, lastTraceResult, isTracing, traceHistory } = useEndpointTracer();
 *   const result = await runFullTrace();  // hits ALL endpoints, collects everything
 */

'use client';

import { useEffect, useRef, useCallback, useState } from 'react';

// ── Types ──

export interface SpanInput {
  endpoint: string;
  method: string;
  statusCode: number;
  clientFetchStartMs: number;
  clientDnsMs: number;
  clientTcpMs: number;
  clientSslMs: number;
  clientTtfbMs: number;
  clientResponseMs: number;
  clientRoundTripMs: number;
  clientJsonParseMs: number;
  clientTransferSize: number;
  clientEncodedSize: number;
  clientDecodedSize: number;
  clientProtocol: string;
  serverMiddlewareMs: number;
  serverHandlerMs: number;
  serverDbWriteMs: number;
  serverDbReadMs: number;
  error?: string;
}

export interface BrowserMetrics {
  ttfbAvgMs: number;
  roundTripAvgMs: number;
  longTaskCount: number;
  longTaskTotalMs: number;
  memoryUsedMb: number;
  memoryLimitMb: number;
  domNodes: number;
  resourceCount: number;
}

export interface FullTracePayload {
  traceId: string;
  initiatedBy: string;
  spans: SpanInput[];
  browserMetrics: BrowserMetrics;
  navigationType: string;
  connectionType: string;
  pageUrl: string;
}

export interface TraceResult {
  status: string;
  message: string;
  traceId: string;
  serverTiming: {
    middlewareMs: number;
    handlerMs: number;
    bodyParseMs: number;
    dbWriteMs: number;
  };
  summary: {
    endpointsHit: number;
    endpointsOk: number;
    endpointsFailed: number;
    avgTtfbMs: number;
    avgRoundTripMs: number;
    avgMiddlewareMs: number;
    avgHandlerMs: number;
    avgDbWriteMs: number;
    avgDbReadMs: number;
  };
  browserMetrics: BrowserMetrics & { ttfbAvgMs: number; roundTripAvgMs: number };
  stats: { totalEpTraces: number; totalEpSpans: number };
}

export interface StoredEndpointTrace {
  id: string;
  traceId: string;
  requestId: string;
  initiatedBy: string;
  clientIp: string;
  userAgent: string;
  navigationType: string;
  connectionType: string;
  pageUrl: string;
  browserTtfbAvgMs: number;
  browserRoundTripAvgMs: number;
  longTaskCount: number;
  longTaskTotalMs: number;
  memoryUsedMb: number;
  memoryLimitMb: number;
  domNodes: number;
  resourceCount: number;
  totalEndpointsHit: number;
  totalEndpointsOk: number;
  totalEndpointsFail: number;
  serverMiddlewareAvgMs: number;
  serverHandlerAvgMs: number;
  serverDbWriteAvgMs: number;
  serverDbReadAvgMs: number;
  totalEndToEndMs: number;
  authMethod: string;
  authUserId: string;
  authRole: string;
  rateLimitLimit: number;
  rateLimitRemaining: number;
  configValid: boolean;
  createdAt: string;
  spans: StoredSpan[];
}

export interface StoredSpan {
  id: string;
  endpoint: string;
  method: string;
  statusCode: number;
  clientDnsMs: number;
  clientTcpMs: number;
  clientSslMs: number;
  clientTtfbMs: number;
  clientResponseMs: number;
  clientRoundTripMs: number;
  clientJsonParseMs: number;
  clientTransferSize: number;
  clientEncodedSize: number;
  clientDecodedSize: number;
  clientProtocol: string;
  serverMiddlewareMs: number;
  serverHandlerMs: number;
  serverDbWriteMs: number;
  serverDbReadMs: number;
  networkTransitMs: number;
  browserOverheadMs: number;
  error: string;
  rateLimitLimit: number;
  rateLimitRemaining: number;
  authMethod: string;
}

export interface TraceSummary {
  traces: {
    total: number;
    aggregates: Record<string, { _avg: Record<string, number | null>; _max: Record<string, number | null> }>;
  };
  spans: {
    total: number;
    aggregates: Record<string, { _avg: Record<string, number | null>; _count: number }>;
    errorCount: number;
    errorRate: string;
  };
  byEndpoint: Array<{
    endpoint: string;
    method: string;
    _count: { id: number };
    _avg: Record<string, number | null>;
    _min: Record<string, number | null>;
    _max: Record<string, number | null>;
  }>;
}

// ── Helpers ──

function generateTraceId(): string {
  return `tr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function getConnectionType(): string {
  const nav = navigator as unknown as Record<string, unknown>;
  const conn = (nav.connection as Record<string, unknown>) ?? {};
  return (conn.effectiveType as string) ?? 'unknown';
}

function getNavigationType(): string {
  try {
    const entries = performance.getEntriesByType?.('navigation') as unknown as Array<{ type: string }> | undefined;
    if (entries?.[0]) return entries[0].type;
  } catch { /* not available */ }
  return 'unknown';
}

function getResourceTimingForUrl(url: string) {
  try {
    const entries = performance.getEntriesByName(url, 'resource') as unknown as Array<Record<string, number | string>>;
    if (!entries.length) return null;
    const e = entries[entries.length - 1];
    return {
      dnsMs: Math.max(0, ((e.domainLookupEnd as number) ?? 0) - ((e.domainLookupStart as number) ?? 0)),
      tcpMs: Math.max(0, ((e.connectEnd as number) ?? 0) - ((e.connectStart as number) ?? 0)),
      sslMs: ((e.secureConnectionStart as number) ?? 0) > 0
        ? Math.max(0, ((e.connectEnd as number) ?? 0) - ((e.secureConnectionStart as number) ?? 0))
        : 0,
      responseMs: Math.max(0, ((e.responseEnd as number) ?? 0) - ((e.responseStart as number) ?? 0)),
      transferSize: (e.transferSize as number) ?? 0,
      encodedBodySize: (e.encodedBodySize as number) ?? 0,
      decodedBodySize: (e.decodedBodySize as number) ?? 0,
      protocol: (e.nextHopProtocol as string) ?? '',
    };
  } catch {
    return null;
  }
}

function getBrowserMetrics(): BrowserMetrics {
  // Long tasks
  let longTaskCount = 0;
  let longTaskTotalMs = 0;
  try {
    const tasks = performance.getEntriesByType?.('longtask') as unknown as Array<{ duration: number }> | undefined;
    if (tasks) {
      longTaskCount = tasks.length;
      longTaskTotalMs = Math.round(tasks.reduce((sum, t) => sum + t.duration, 0));
    }
  } catch { /* longtask not supported */ }

  // Memory
  let memoryUsedMb = 0;
  let memoryLimitMb = 0;
  try {
    const perf = performance as unknown as { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } };
    if (perf.memory) {
      memoryUsedMb = Math.round(perf.memory.usedJSHeapSize / (1024 * 1024) * 100) / 100;
      memoryLimitMb = Math.round(perf.memory.jsHeapSizeLimit / (1024 * 1024) * 100) / 100;
    }
  } catch { /* memory not available */ }

  // DOM nodes
  const domNodes = document.querySelectorAll('*').length;

  // Resource count
  let resourceCount = 0;
  try {
    resourceCount = performance.getEntriesByType?.('resource')?.length ?? 0;
  } catch { /* ignore */ }

  return {
    ttfbAvgMs: 0, // filled in after trace
    roundTripAvgMs: 0, // filled in after trace
    longTaskCount,
    longTaskTotalMs,
    memoryUsedMb,
    memoryLimitMb,
    domNodes,
    resourceCount,
  };
}

// ── Hook ──

export function useEndpointTracer() {
  const [isTracing, setIsTracing] = useState(false);
  const [lastTraceResult, setLastTraceResult] = useState<TraceResult | null>(null);
  const [traceHistory, setTraceHistory] = useState<StoredEndpointTrace[]>([]);
  const [traceSummary, setTraceSummary] = useState<TraceSummary | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ── Trace a single endpoint with full timing ──
  const traceEndpoint = useCallback(async (url: string, method: string = 'GET'): Promise<SpanInput> => {
    const fetchStart = performance.now();
    const fetchStartMs = Math.round(fetchStart);

    // Clear any stale entry for this URL
    try {
      (performance as unknown as { clearResourceTimings?: (name?: string) => void }).clearResourceTimings?.(url);
    } catch { /* ignore */ }

    let statusCode = 0;
    let serverMiddlewareMs = 0;
    let serverHandlerMs = 0;
    let serverDbWriteMs = 0;
    let serverDbReadMs = 0;
    let error = '';

    try {
      const res = await fetch(url, {
        method,
        headers: method === 'POST' ? { 'Content-Type': 'application/json' } : undefined,
        body: method === 'POST' ? '{}' : undefined,
        signal: abortRef.current?.signal,
      });
      statusCode = res.status;

      // Read server timing from response headers
      serverMiddlewareMs = parseInt(res.headers.get('x-middleware-ms') ?? '0', 10);
      serverHandlerMs = parseInt(res.headers.get('x-handler-ms') ?? '0', 10);
      serverDbWriteMs = parseInt(res.headers.get('x-db-write-ms') ?? '0', 10);
      serverDbReadMs = parseInt(res.headers.get('x-db-read-ms') ?? '0', 10);

      // Consume body
      const jsonStart = performance.now();
      await res.json();
      const jsonParseMs = Math.round(performance.now() - jsonStart);

      const ttfbMs = Math.round(performance.now() - fetchStart);
      const roundTripMs = ttfbMs + jsonParseMs;

      // Get Resource Timing
      const rt = getResourceTimingForUrl(url);

      const rlLimit = parseInt(res.headers.get('x-ratelimit-limit') ?? '0', 10);
      const rlRemaining = parseInt(res.headers.get('x-ratelimit-remaining') ?? '0', 10);
      return {
        endpoint: url,
        method,
        statusCode,
        clientFetchStartMs: fetchStartMs,
        clientDnsMs: rt?.dnsMs ?? 0,
        clientTcpMs: rt?.tcpMs ?? 0,
        clientSslMs: rt?.sslMs ?? 0,
        clientTtfbMs: ttfbMs,
        clientResponseMs: rt?.responseMs ?? 0,
        clientRoundTripMs: roundTripMs,
        clientJsonParseMs: jsonParseMs,
        clientTransferSize: rt?.transferSize ?? 0,
        clientEncodedSize: rt?.encodedBodySize ?? 0,
        clientDecodedSize: rt?.decodedBodySize ?? 0,
        clientProtocol: rt?.protocol ?? '',
        serverMiddlewareMs,
        serverHandlerMs,
        serverDbWriteMs,
        serverDbReadMs,
        rateLimitLimit: rlLimit,
        rateLimitRemaining: rlRemaining,
        authMethod: '',
      };
    } catch (err) {
      return {
        endpoint: url,
        method,
        statusCode: statusCode || 0,
        clientFetchStartMs: fetchStartMs,
        clientDnsMs: 0, clientTcpMs: 0, clientSslMs: 0,
        clientTtfbMs: 0, clientResponseMs: 0,
        clientRoundTripMs: Math.round(performance.now() - fetchStart),
        clientJsonParseMs: 0, clientTransferSize: 0, clientEncodedSize: 0, clientDecodedSize: 0,
        clientProtocol: '',
        serverMiddlewareMs, serverHandlerMs, serverDbWriteMs, serverDbReadMs,
        rateLimitLimit: 0, rateLimitRemaining: 0, authMethod: '',
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }, []);

  // ── Run a full-site trace: hit ALL endpoints, collect everything, persist ──
  const runFullTrace = useCallback(async (
    customEndpoints?: Array<{ url: string; method?: string }>,
  ): Promise<TraceResult | null> => {
    abortRef.current = new AbortController();
    setIsTracing(true);

    const traceId = generateTraceId();
    const traceStart = performance.now();

    // Default: all site endpoints including Phase 1 auth/rate-limit/health
    const endpoints = customEndpoints ?? [
      // Core compliance
      { url: '/api/compliance/health', method: 'GET' },
      { url: '/api/compliance/findings', method: 'GET' },
      { url: '/api/compliance/mttr', method: 'GET' },
      { url: '/api/compliance/policies', method: 'GET' },
      { url: '/api/compliance/profiles', method: 'GET' },
      { url: '/api/compliance/audit', method: 'POST' },
      { url: '/api/compliance/remediate', method: 'POST' },
      { url: '/api/compliance/anonymise', method: 'POST' },
      // System / observability
      { url: '/api/system/ping', method: 'GET' },
      { url: '/api/system/correlated-trace', method: 'GET' },
      // Phase 1: Auth endpoints
      { url: '/api/auth/login', method: 'POST' },
      { url: '/api/auth/verify', method: 'POST' },
      // Phase 2: Intelligence endpoints
      { url: '/api/intelligence/anomaly-detect', method: 'POST' },
      { url: '/api/intelligence/predictive-mttr', method: 'POST' },
      { url: '/api/intelligence/compliance-report', method: 'POST' },
      { url: '/api/intelligence/risk-score', method: 'POST' },
      // Phase 1: Health probes
      { url: '/health/live', method: 'GET' },
      { url: '/health/ready', method: 'GET' },
    ];

    // Hit all endpoints in parallel and collect spans
    const spans = await Promise.all(
      endpoints.map(ep => traceEndpoint(ep.url, ep.method ?? 'GET')),
    );

    const totalEndToEndMs = Math.round(performance.now() - traceStart);

    // Collect browser-level metrics
    const browserMetrics = getBrowserMetrics();
    const ttfbValues = spans.map(s => s.clientTtfbMs).filter(v => v > 0);
    const rtValues = spans.map(s => s.clientRoundTripMs).filter(v => v > 0);
    browserMetrics.ttfbAvgMs = ttfbValues.length ? Math.round(ttfbValues.reduce((a, b) => a + b, 0) / ttfbValues.length) : 0;
    browserMetrics.roundTripAvgMs = rtValues.length ? Math.round(rtValues.reduce((a, b) => a + b, 0) / rtValues.length) : 0;

    // Build the payload
    const payload: FullTracePayload = {
      traceId,
      initiatedBy: 'manual',
      spans,
      browserMetrics,
      navigationType: getNavigationType(),
      connectionType: getConnectionType(),
      pageUrl: typeof window !== 'undefined' ? window.location.href : '',
    };

    try {
      // Persist to server
      const epRes = await fetch('/api/system/observability/ep-trace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: abortRef.current.signal,
      });
      const result: TraceResult = await epRes.json();
      setLastTraceResult(result);
      return result;
    } catch (err) {
      console.error('Failed to persist full-site trace:', err);
      return null;
    } finally {
      setIsTracing(false);
    }
  }, [traceEndpoint]);

  // ── Load trace history from server ──
  const loadTraceHistory = useCallback(async (limit = 10) => {
    try {
      const res = await fetch(`/api/system/observability/ep-trace?mode=history&limit=${limit}`);
      const data = await res.json();
      setTraceHistory(data.traces ?? []);
    } catch (err) {
      console.error('Failed to load trace history:', err);
    }
  }, []);

  // ── Load trace summary ──
  const loadTraceSummary = useCallback(async () => {
    try {
      const res = await fetch('/api/system/observability/ep-trace?mode=summary');
      const data: TraceSummary = await res.json();
      setTraceSummary(data);
    } catch (err) {
      console.error('Failed to load trace summary:', err);
    }
  }, []);

  return {
    runFullTrace,
    traceEndpoint,
    isTracing,
    lastTraceResult,
    traceHistory,
    traceSummary,
    loadTraceHistory,
    loadTraceSummary,
  };
}
