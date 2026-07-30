/**
 * useRequestTracer — captures browser-side Performance API timings for ALL
 * fetch requests on the page, correlates them with server-side traces,
 * and persists via /api/system/correlated-trace.
 *
 * Features:
 *  - PerformanceObserver for Resource Timing (automatic capture of every fetch/XHR)
 *  - Manual trace() method for explicit traced fetch calls
 *  - Collects DNS, TCP, SSL, request, response phases from Resource Timing API
 *  - Gathers navigation type, connection info
 *  - Sends everything to the correlated-trace endpoint for server-side joining
 */

'use client';

import { useEffect, useRef, useCallback, useState } from 'react';

// ── Types ──

export interface ResourceTimingEntry {
  name: string;
  duration: number;
  transferSize: number;
  encodedBodySize: number;
  decodedBodySize: number;
  initiatorType: string;
  startTime: number;
  responseStart: number;
  connectStart: number;
  connectEnd: number;
  dnsStart: number;
  dnsEnd: number;
  secureConnectionStart: number;
  requestStart: number;
  responseEnd: number;
  nextHopProtocol: string;
}

export interface BrowserTimingData {
  fetchStartIso: string;
  ttfbMs: number;
  roundTripMs: number;
  jsonParseMs: number;
  renderStartMs: number;
  networkProtocol: string;
  navigationType: string;
  connectionType: string;
  source: string;
  component: string;
  resourceTiming?: {
    dnsMs: number;
    tcpMs: number;
    sslMs: number;
    requestMs: number;
    responseMs: number;
    transferSize: number;
    encodedBodySize: number;
    decodedBodySize: number;
  };
  observedResources?: ResourceTimingEntry[];
}

export interface TracedResult<T = unknown> {
  data: T;
  browserTiming: BrowserTimingData;
  responseHeaders: Record<string, string>;
}

export interface ObservedResource {
  name: string;
  duration: number;
  transferSize: number;
  initiatorType: string;
  startTime: number;
  method?: string;
  statusCode?: number;
}

export interface TraceStats {
  totalObserved: number;
  tracedCalls: number;
  lastTraceAt: string | null;
}

// ── Connection info helper ──
function getConnectionInfo() {
  const nav = navigator as unknown as Record<string, unknown>;
  const conn = (nav.connection as Record<string, unknown>) ?? {};
  return {
    effectiveType: (conn.effectiveType as string) ?? 'unknown',
    rtt: (conn.rtt as number) ?? 0,
    downlink: (conn.downlink as number) ?? 0,
    saveData: (conn.saveData as boolean) ?? false,
  };
}

// ── Navigation type helper ──
function getNavigationType(): string {
  try {
    const entries = performance.getEntriesByType?.('navigation') as unknown as Array<{ type: string }> | undefined;
    if (entries?.[0]) return entries[0].type;
  } catch { /* not available */ }
  return 'unknown';
}

// ── Hook ──

export function useRequestTracer() {
  const observerRef = useRef<PerformanceObserver | null>(null);
  const [observedResources, setObservedResources] = useState<ObservedResource[]>([]);
  const [stats, setStats] = useState<TraceStats>({
    totalObserved: 0,
    tracedCalls: 0,
    lastTraceAt: null,
  });
  const tracedCountRef = useRef(0);

  // ── Set up PerformanceObserver for automatic resource timing capture ──
  useEffect(() => {
    if (typeof PerformanceObserver === 'undefined') return;

    let resources: ObservedResource[] = [];

    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries() as unknown as PerformanceResourceTiming[];
      const newResources: ObservedResource[] = entries
        .filter((e) => e.initiatorType === 'fetch' || e.initiatorType === 'xmlhttprequest')
        .map((e) => ({
          name: e.name,
          duration: Math.round(e.duration),
          transferSize: e.transferSize,
          encodedBodySize: e.encodedBodySize,
          decodedBodySize: e.decodedBodySize,
          initiatorType: e.initiatorType,
          startTime: Math.round(e.startTime),
        }));

      resources = [...resources, ...newResources].slice(-100); // keep last 100
      setObservedResources(resources);
      setStats((s) => ({ ...s, totalObserved: resources.length }));
    });

    try {
      observer.observe({ type: 'resource', buffered: true });
      observerRef.current = observer;
    } catch {
      // Fallback: try with entryTypes
      try {
        const fallbackObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries() as unknown as PerformanceResourceTiming[];
          const newResources: ObservedResource[] = entries
            .filter((e) => e.initiatorType === 'fetch' || e.initiatorType === 'xmlhttprequest')
            .map((e) => ({
              name: e.name,
              duration: Math.round(e.duration),
              transferSize: e.transferSize,
              encodedBodySize: e.encodedBodySize,
              decodedBodySize: e.decodedBodySize,
              initiatorType: e.initiatorType,
              startTime: Math.round(e.startTime),
            }));
          resources = [...resources, ...newResources].slice(-100);
          setObservedResources(resources);
          setStats((s) => ({ ...s, totalObserved: resources.length }));
        });
        fallbackObserver.observe({ entryTypes: ['resource'] });
        observerRef.current = fallbackObserver;
      } catch {
        // PerformanceObserver not supported for resource timing
      }
    }

    return () => {
      observer.disconnect();
    };
  }, []);

  // ── Extract Resource Timing data for a specific URL ──
  const getResourceTiming = useCallback((url: string): ResourceTimingEntry | null => {
    try {
      const entries = performance.getEntriesByName(url, 'resource') as unknown as Array<Record<string, unknown>>;
      if (!entries.length) return null;
      const e = entries[entries.length - 1] as Record<string, unknown>; // latest
      return {
        name: (e.name as string) ?? url,
        duration: Math.round(e.duration as number),
        transferSize: (e.transferSize as number) ?? 0,
        encodedBodySize: (e.encodedBodySize as number) ?? 0,
        decodedBodySize: (e.decodedBodySize as number) ?? 0,
        initiatorType: (e.initiatorType as string) ?? 'fetch',
        startTime: Math.round(e.startTime as number),
        responseStart: Math.round(e.responseStart as number),
        connectStart: Math.round(e.connectStart as number),
        connectEnd: Math.round(e.connectEnd as number),
        dnsStart: Math.round((e.domainLookupStart ?? e.dnsStart) as number),
        dnsEnd: Math.round((e.domainLookupEnd ?? e.dnsEnd) as number),
        secureConnectionStart: Math.round(e.secureConnectionStart as number),
        requestStart: Math.round(e.requestStart as number),
        responseEnd: Math.round(e.responseEnd as number),
        nextHopProtocol: (e.nextHopProtocol as string) ?? '',
      };
    } catch {
      return null;
    }
  }, []);

  // ── Traced fetch: wraps any API call with full browser timing capture ──
  const traceFetch = useCallback(
    async <T = unknown>(
      url: string,
      options?: RequestInit & { source?: string; component?: string },
    ): Promise<TracedResult<T>> => {
      const fetchStart = performance.now();
      const fetchStartIso = new Date().toISOString();
      const conn = getConnectionInfo();
      const navType = getNavigationType();

      // Clear any previous entry for this URL to ensure we get a fresh one
      try {
        const perfAny = performance as unknown as { clearResourceTimings?: (name?: string) => void };
        perfAny.clearResourceTimings?.(url);
      } catch { /* ignore */ }

      const res = await fetch(url, options);
      const ttfbMs = Math.round(performance.now() - fetchStart);

      // Parse body
      const jsonStart = performance.now();
      const data: T = await res.json();
      const jsonParseMs = Math.round(performance.now() - jsonStart);

      const renderMark = performance.now();
      const roundTripMs = Math.round(renderMark - fetchStart);
      const renderStartMs = roundTripMs;

      // Collect response headers
      const responseHeaders: Record<string, string> = {};
      res.headers.forEach((v, k) => {
        responseHeaders[k] = v;
      });

      // Get Resource Timing entry for this URL
      const rt = getResourceTiming(url);
      const resourceTiming = rt
        ? {
            dnsMs: rt.dnsEnd - rt.dnsStart > 0 ? rt.dnsEnd - rt.dnsStart : 0,
            tcpMs: rt.connectEnd - rt.connectStart > 0 ? rt.connectEnd - rt.connectStart : 0,
            sslMs:
              rt.secureConnectionStart > 0
                ? rt.connectEnd - rt.secureConnectionStart
                : 0,
            requestMs: rt.responseStart - rt.requestStart > 0 ? rt.responseStart - rt.requestStart : 0,
            responseMs: rt.responseEnd - rt.responseStart > 0 ? rt.responseEnd - rt.responseStart : 0,
            transferSize: rt.transferSize,
            encodedBodySize: rt.encodedBodySize,
            decodedBodySize: rt.decodedBodySize,
          }
        : undefined;

      const browserTiming: BrowserTimingData = {
        fetchStartIso,
        ttfbMs,
        roundTripMs,
        jsonParseMs,
        renderStartMs,
        networkProtocol: rt?.nextHopProtocol ?? '',
        navigationType: navType,
        connectionType: conn.effectiveType,
        source: options?.source ?? url,
        component: options?.component ?? 'unknown',
        resourceTiming,
      };

      // Update stats
      tracedCountRef.current += 1;
      setStats((s) => ({
        ...s,
        tracedCalls: tracedCountRef.current,
        lastTraceAt: fetchStartIso,
      }));

      return { data, browserTiming, responseHeaders };
    },
    [getResourceTiming],
  );

  // ── Send a full correlated trace to the server for persistence ──
  const persistCorrelatedTrace = useCallback(
    async (browserTiming: BrowserTimingData, additionalPayload?: Record<string, unknown>) => {
      const res = await fetch('/api/system/correlated-trace', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-client-timing': JSON.stringify(browserTiming),
        },
        body: JSON.stringify({
          ...browserTiming,
          observedResources: observedResources.slice(-20),
          ...additionalPayload,
        }),
      });
      return res.json();
    },
    [observedResources],
  );

  // ── One-shot: trace a URL AND persist the correlation ──
  const traceAndPersist = useCallback(
    async <T = unknown>(
      url: string,
      options?: RequestInit & { source?: string; component?: string },
    ): Promise<TracedResult<T> & { persisted: unknown }> => {
      const result = await traceFetch<T>(url, options);
      const persisted = await persistCorrelatedTrace(result.browserTiming);
      return { ...result, persisted };
    },
    [traceFetch, persistCorrelatedTrace],
  );

  // ── Batch trace: trace multiple endpoints and produce a combined correlation ──
  const traceBatch = useCallback(
    async (calls: Array<{ url: string; options?: RequestInit & { source?: string; component?: string } }>) => {
      const results = await Promise.all(
        calls.map((c) => traceFetch(c.url, c.options)),
      );
      return results;
    },
    [traceFetch],
  );

  return {
    observedResources,
    stats,
    traceFetch,
    traceAndPersist,
    traceBatch,
    persistCorrelatedTrace,
    getResourceTiming,
  };
}
