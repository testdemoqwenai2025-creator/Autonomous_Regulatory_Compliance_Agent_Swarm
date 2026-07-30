'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  Shield, ShieldAlert, ShieldCheck, Clock, Activity,
  FileKey, FileSearch, Wrench, Timer, AlertTriangle,
  CheckCircle2, XCircle, Loader2, RefreshCw, Lock,
  Unlock, TrendingDown, Server, Database,
  Globe, ArrowRight, Zap, Layers, Monitor,
  Send, CircuitBoard, Wifi, Check, Fingerprint, Thermometer, GanttChart, Gauge,
  ArrowDownLeft, Network, Eye, History, BarChart3,
  MousePointerClick, Radio, FileClock, Flame, ShieldAlert as ShieldAlertIcon,
  Key, Settings, Heart, TimerReset,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { useRequestTracer, ObservedResource } from '@/hooks/useRequestTracer';
import { useEndpointTracer, StoredEndpointTrace, TraceSummary, StoredSpan } from '@/hooks/useEndpointTracer';

// ═══════════════════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════════════════

interface Finding {
  finding_ref: string; severity: string; status: string;
  risk_category: string; title: string; affected_row_count: number;
  detected_at: string; mttr_hours: number | null; current_phase: string;
}
interface Profile {
  partner_id: string; partner_name: string; edi_standard: string;
  encrypted: boolean; protocol: string; last_audit: string;
  compliant: boolean; issues: string[];
}
interface Policy {
  id: string; name: string; field_name: string; action: string;
  category: string | null; gdpr_article: string;
  enabled: boolean; auto_generated: boolean;
}
interface MTTRCategory {
  category: string; total: number; resolved: number;
  avg_mttr_hours: number; p95_mttr_hours: number; median_mttr_hours: number;
}
interface MTTRTrend { date: string; avg_mttr: number; new_findings: number; resolved: number; }
interface MTTRData {
  report: { risk_categories: MTTRCategory[]; overall: { total_findings: number; resolved_findings: number; open_findings: number; avg_mttr_hours: number; p95_mttr_hours: number; median_mttr_hours: number; compliance_rate: number; }; };
  trend: MTTRTrend[];
}

interface PingData {
  status: string; message: string;
  client: Record<string, unknown>;
  server: {
    middleware: { status: string; startTs: string; endTs: string; durationMs: number; requestId: string; clientIp: string; headersInjected: string[] };
    handler: { status: string; endpoint: string; method: string; startTs: string; endTs: string; durationMs: number };
    database: { status: string; engine: string; writeMs: number; readMs: number; recordsWritten: number; recordsRead: number };
  };
  correlation: {
    clockDeltaMs: number; totalEndToEndMs: number; serverTotalMs: number;
    browserOverheadMs: number | null; networkTransitMs: number | null;
    tracePersisted: boolean;
  };
  stats: {
    totalTrackedEvents: number; totalHealthChecks: number; totalCorrelatedTraces: number;
    recentEvents: Array<{ id: string; path: string; method: string; statusCode: number; dbReadMs: number | null; createdAt: string }>;
  };
}

interface StoredTrace {
  id: string; requestId: string; path: string; method: string; statusCode: number;
  clientFetchStart: string; clientTtfbMs: number; clientRoundTripMs: number;
  clientJsonParseMs: number; clientRenderStartMs: number; clientNetworkProtocol: string;
  serverMiddlewareStartTs: string; serverMiddlewareEndTs: string; serverMiddlewareMs: number;
  serverHandlerStartTs: string; serverHandlerEndTs: string; serverHandlerMs: number;
  serverDbWriteMs: number; serverDbReadMs: number;
  clientServerDeltaMs: number; totalEndToEndMs: number;
  clientTimingJson: string;
  createdAt: string;
}

interface CorrelatedTraceResult {
  status: string; message: string; traceId: string; requestId: string;
  clientTimingJson: string;
  client: {
    fetchStart: string; ttfbMs: number; roundTripMs: number; jsonParseMs: number;
    renderStartMs: number; networkProtocol: string; navigationType: string;
    connectionType: string; source: string; component: string;
    resourceTiming?: { dnsMs: number; tcpMs: number; sslMs: number; requestMs: number; responseMs: number; transferSize: number; encodedBodySize: number; decodedBodySize: number };
    observedResources: number;
  };
  server: {
    middleware: { status: string; startTs: string; endTs: string; durationMs: number; requestId: string; clientIp: string; headersInjected: string[] };
    handler: { status: string; endpoint: string; method: string; startTs: string; endTs: string; durationMs: number; bodyParseMs: number };
    database: { status: string; engine: string; writeMs: number; readMs: number; recordsWritten: number; recordsRead: number };
  };
  correlation: {
    clockDeltaMs: number; totalEndToEndMs: number; serverTotalMs: number;
    browserOverheadMs: number | null; networkTransitMs: number | null;
    tracePersisted: boolean;
  };
  stats: { totalTrackedEvents: number; totalHealthChecks: number; totalCorrelatedTraces: number };
}

// ═══════════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════════

const severityColor = (s: string) => {
  switch (s) {
    case 'critical': return 'bg-red-100 text-red-800 border-red-200';
    case 'high': return 'bg-amber-100 text-amber-800 border-amber-200';
    case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    default: return 'bg-slate-100 text-slate-800 border-slate-200';
  }
};
const statusColor = (s: string) => {
  switch (s) {
    case 'open': return 'bg-red-100 text-red-800';
    case 'in_progress': return 'bg-amber-100 text-amber-800';
    case 'remediated': return 'bg-emerald-100 text-emerald-800';
    case 'accepted_risk': return 'bg-slate-100 text-slate-600';
    default: return 'bg-slate-100 text-slate-600';
  }
};
const statusIcon = (s: string) => {
  switch (s) {
    case 'open': return <XCircle className="w-3.5 h-3.5 text-red-500" />;
    case 'in_progress': return <Loader2 className="w-3.5 h-3.5 text-amber-500 animate-spin" />;
    case 'remediated': return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />;
    default: return <Shield className="w-3.5 h-3.5 text-slate-400" />;
  }
};
const categoryLabel = (c: string) => c.split('_').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');

function KPISkeleton() { return <Skeleton className="h-24 w-full rounded-lg" />; }

function KPICard({ icon: Icon, label, value, sub, color = 'text-slate-900' }: {
  icon: React.ElementType; label: string; value: string | number; sub?: string; color?: string;
}) {
  return (
    <Card className="relative overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-slate-500">{label}</p>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
            {sub && <p className="text-xs text-slate-400">{sub}</p>}
          </div>
          <div className="rounded-lg bg-slate-100 p-2.5"><Icon className="w-5 h-5 text-slate-600" /></div>
        </div>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  WATERFALL CHART COMPONENT
// ═══════════════════════════════════════════════════════════════════

interface WaterfallRow {
  label: string; color: string; startMs: number; widthMs: number; detail: string;
}

function WaterfallChart({ rows, totalMs }: { rows: WaterfallRow[]; totalMs: number }) {
  const scale = totalMs > 0 ? 100 / totalMs : 1;
  return (
    <div className="space-y-1.5">
      {/* Time axis */}
      <div className="flex text-[9px] text-slate-400 font-mono pl-[120px] pr-2">
        <span>0ms</span>
        <span className="ml-auto">{totalMs}ms</span>
      </div>
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-[10px] font-medium text-slate-600 w-[115px] text-right flex-shrink-0 truncate" title={r.label}>{r.label}</span>
          <div className="flex-1 relative h-5 bg-slate-100 rounded-sm overflow-hidden">
            <div
              className={`absolute top-0 h-full rounded-sm ${r.color} transition-all duration-500`}
              style={{ left: `${Math.min(r.startMs * scale, 100)}%`, width: `${Math.max(r.widthMs * scale, 0.5)}%` }}
              title={`${r.label}: ${r.widthMs}ms (starts at ${r.startMs}ms)`}
            />
          </div>
          <span className="text-[10px] font-mono text-slate-500 w-[48px] text-right flex-shrink-0">{r.widthMs}ms</span>
        </div>
      ))}
    </div>
  );
}

function FlowArrow() { return <ArrowRight className="w-5 h-5 text-slate-300 flex-shrink-0 mt-1" />; }

// ═══════════════════════════════════════════════════════════════════
//  MAIN DASHBOARD
// ═══════════════════════════════════════════════════════════════════

export default function ComplianceDashboard() {
  const [findings, setFindings] = useState<Finding[]>([]);
  const [mttr, setMttr] = useState<MTTRData | null>(null);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [auditing, setAuditing] = useState(false);

  // Pipeline / trace state
  const [pingData, setPingData] = useState<PingData | null>(null);
  const [pingLoading, setPingLoading] = useState(false);
  const [pingError, setPingError] = useState<string | null>(null);
  const [postPayload, setPostPayload] = useState('');
  const [postResult, setPostResult] = useState<string | null>(null);
  const [responseHeaders, setResponseHeaders] = useState<Record<string, string>>({});
  const [traceHistory, setTraceHistory] = useState<StoredTrace[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const renderStartRef = useRef<number>(0);

  // ── Frontend Trace state (new) ──
  const {
    observedResources, stats: tracerStats,
    traceAndPersist, getResourceTiming,
  } = useRequestTracer();
  const [correlatedResult, setCorrelatedResult] = useState<CorrelatedTraceResult | null>(null);
  const [correlatedLoading, setCorrelatedLoading] = useState(false);
  const [correlatedError, setCorrelatedError] = useState<string | null>(null);
  const [traceSummary, setTraceSummary] = useState<Record<string, unknown> | null>(null);
  const [traceSummaryLoading, setTraceSummaryLoading] = useState(false);
  const [fullTraceHistory, setFullTraceHistory] = useState<StoredTrace[]>([]);
  const [fullHistoryLoading, setFullHistoryLoading] = useState(false);

  // ── Full-Site Observability (ep-trace) ──
  const {
    runFullTrace, isTracing: epTracing,
    lastTraceResult: epResult,
    traceHistory: epHistory,
    traceSummary: epSummary,
    loadTraceHistory: loadEpHistory,
    loadTraceSummary: loadEpSummary,
  } = useEndpointTracer();
  const [epHistoryLoaded, setEpHistoryLoaded] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [fRes, mRes, pRes, prRes] = await Promise.all([
        fetch('/api/compliance/findings'), fetch('/api/compliance/mttr'),
        fetch('/api/compliance/policies'), fetch('/api/compliance/profiles'),
      ]);
      const [fData, mData, pData, prData] = await Promise.all([
        fRes.json(), mRes.json(), pRes.json(), prRes.json(),
      ]);
      setFindings(fData.findings); setMttr(mData);
      setPolicies(pData.policies); setProfiles(prData.profiles);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const loadTraceHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch('/api/system/ping?trace=history');
      const data = await res.json();
      setTraceHistory(data.traces ?? []);
    } catch (e) { console.error(e); }
    finally { setLoadingHistory(false); }
  }, []);

  const runAudit = async () => {
    setAuditing(true);
    try {
      const res = await fetch('/api/compliance/audit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      const data = await res.json();
      if (data.status === 'audit_complete') await fetchData();
    } catch (e) { console.error(e); }
    finally { setAuditing(false); }
  };

  // ── Instrumented ping with browser-side Performance API ──
  const runPing = useCallback(async () => {
    setPingLoading(true);
    setPingError(null);
    setPostResult(null);
    renderStartRef.current = 0;

    const fetchStart = performance.now();
    const fetchStartIso = new Date().toISOString();

    // Connection info (only available in some browsers)
    const nav = navigator as unknown as Record<string, unknown>;
    const connection = (nav.connection as Record<string, unknown>) ?? {};
    const connectionType = (connection.effectiveType as string) ?? 'unknown';

    // Try to get navigation type
    let navigationType = 'unknown';
    try {
      const entries = performance.getEntriesByType?.('navigation') as unknown as Array<{ type: string }> | undefined;
      if (entries?.[0]) navigationType = entries[0].type;
    } catch { /* not available */ }

    try {
      const res = await fetch('/api/system/ping');
      const ttfbMs = Math.round(performance.now() - fetchStart);

      const jsonStart = performance.now();
      const data: PingData = await res.json();
      const jsonParseMs = Math.round(performance.now() - jsonStart);

      const renderMark = performance.now();
      const renderStartMs = Math.round(renderMark - fetchStart);
      const roundTripMs = renderStartMs;

      // Capture response headers
      const headers: Record<string, string> = {};
      res.headers.forEach((v, k) => { headers[k] = v; });
      setResponseHeaders(headers);

      // Now schedule state update timing measurement
      requestAnimationFrame(() => {
        const afterRender = Math.round(performance.now() - fetchStart);
        renderStartRef.current = afterRender;
      });

      // Attach client timing to data so the waterfall can use it immediately
      const clientTimingData = {
        fetchStartIso,
        ttfbMs,
        roundTripMs,
        jsonParseMs,
        renderStartMs,
        networkProtocol: '',
        navigationType,
        connectionType,
      };

      // Merge into pingData for immediate waterfall display
      (data as unknown as Record<string, unknown>)._clientTimingRaw = clientTimingData;
      setPingData(data);

      // ── NOW re-send the client timing to a secondary endpoint for persistence ──
      // We fire-and-forget a POST that carries the browser timings as a header
      // so the server can persist a CorrelatedTrace.
      // (The GET already ran, so we POST the timing separately.)
      fetch('/api/system/ping', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-client-timing': JSON.stringify(clientTimingData),
        },
        body: JSON.stringify({ _timingOnly: true, _originalRequestId: data.server?.middleware?.requestId }),
      }).then(r => r.json()).then(d => {
        setPostResult(JSON.stringify(d, null, 2));
      }).catch(() => {});

      // Refresh trace history
      setTimeout(() => loadTraceHistory(), 300);

    } catch (e) {
      setPingError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setPingLoading(false);
    }
  }, [loadTraceHistory]);

  // ── POST with timing ──
  const runPostPing = useCallback(async () => {
    setPingLoading(true);
    setPingError(null);
    setPostResult(null);
    const fetchStart = performance.now();
    const fetchStartIso = new Date().toISOString();
    try {
      const payload = postPayload.trim() ? JSON.parse(postPayload) : { test: true, timestamp: new Date().toISOString() };
      const res = await fetch('/api/system/ping', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-client-timing': JSON.stringify({
            fetchStartIso,
            ttfbMs: 0,
            roundTripMs: Math.round(performance.now() - fetchStart),
            jsonParseMs: 0,
            renderStartMs: Math.round(performance.now() - fetchStart),
            networkProtocol: '', navigationType: 'fetch', connectionType: 'unknown',
          }),
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      setPostResult(JSON.stringify(data, null, 2));
      setTimeout(() => loadTraceHistory(), 300);
    } catch (e) {
      setPingError(e instanceof Error ? e.message : 'POST failed');
    } finally {
      setPingLoading(false);
    }
  }, [postPayload, loadTraceHistory]);

  // ── CORRELATED TRACE: trace+persist using the useRequestTracer hook ──
  const runCorrelatedTrace = useCallback(async () => {
    setCorrelatedLoading(true);
    setCorrelatedError(null);
    try {
      const result = await traceAndPersist<CorrelatedTraceResult>(
        '/api/system/correlated-trace',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source: 'frontend_trace_tab', component: 'CorrelatedTracePanel' }),
          source: 'frontend_trace_tab',
          component: 'CorrelatedTracePanel',
        },
      );
      setCorrelatedResult(result.data);
    } catch (e) {
      setCorrelatedError(e instanceof Error ? e.message : 'Correlated trace failed');
    } finally {
      setCorrelatedLoading(false);
    }
  }, [traceAndPersist]);

  // ── Batch trace: trace ALL compliance endpoints at once ──
  const [batchResults, setBatchResults] = useState<Array<{ url: string; ttfbMs: number; roundTripMs: number; protocol: string }>>([]);
  const [batchLoading, setBatchLoading] = useState(false);

  const runBatchTrace = useCallback(async () => {
    setBatchLoading(true);
    try {
      const endpoints = [
        '/api/compliance/health',
        '/api/compliance/findings',
        '/api/compliance/mttr',
        '/api/compliance/policies',
        '/api/compliance/profiles',
      ];
      const start = performance.now();
      const results = await Promise.all(
        endpoints.map(async (url) => {
          const fetchStart = performance.now();
          const fetchStartIso = new Date().toISOString();
          try {
            const perfAny = performance as unknown as { clearResourceTimings?: (name?: string) => void };
            perfAny.clearResourceTimings?.(url);
          } catch { /* ignore */ }
          const res = await fetch(url);
          const ttfbMs = Math.round(performance.now() - fetchStart);
          const _ = await res.json(); // consume body
          const roundTripMs = Math.round(performance.now() - fetchStart);
          const rt = getResourceTiming(url);
          return { url, ttfbMs, roundTripMs, protocol: rt?.nextHopProtocol ?? '' };
        }),
      );
      const batchTotal = Math.round(performance.now() - start);
      setBatchResults([...results, { url: `TOTAL (${endpoints.length} parallel)`, ttfbMs: batchTotal, roundTripMs: batchTotal, protocol: '' }]);
    } catch (e) {
      console.error('Batch trace error', e);
    } finally {
      setBatchLoading(false);
    }
  }, [getResourceTiming]);

  const loadTraceSummary = useCallback(async () => {
    setTraceSummaryLoading(true);
    try {
      const res = await fetch('/api/system/correlated-trace?mode=summary');
      setTraceSummary(await res.json());
    } catch (e) { console.error(e); }
    finally { setTraceSummaryLoading(false); }
  }, []);

  const loadFullTraceHistory = useCallback(async () => {
    setFullHistoryLoading(true);
    try {
      const res = await fetch('/api/system/correlated-trace?mode=history');
      const data = await res.json();
      setFullTraceHistory(data.traces ?? []);
    } catch (e) { console.error(e); }
    finally { setFullHistoryLoading(false); }
  }, []);

  const overall = mttr?.report.overall;
  const openCritical = findings.filter(f => f.severity === 'critical' && (f.status === 'open' || f.status === 'in_progress')).length;

  // ── Build waterfall rows from pingData ──
  const buildWaterfall = (data: PingData): WaterfallRow[] => {
    const clientRaw = (data as unknown as Record<string, unknown>)._clientTimingRaw as Record<string, number> | undefined;
    const client = data.client;
    const srv = data.server;
    const corr = data.correlation;

    const rows: WaterfallRow[] = [];

    // Client-side rows
    const cTtfb = (clientRaw?.ttfbMs ?? (client.ttfbMs as number) ?? 0);
    const cRoundTrip = (clientRaw?.roundTripMs ?? (client.roundTripMs as number) ?? 0);
    const cJson = (clientRaw?.jsonParseMs ?? (client.jsonParseMs as number) ?? 0);
    const cRender = (clientRaw?.renderStartMs ?? (client.renderStartMs as number) ?? 0);

    // Browser: Queue/Network wait (before TTFB)
    const mwMs = srv.middleware.durationMs;
    const handlerMs = srv.handler.durationMs;
    const serverTotalEstimate = mwMs + handlerMs;
    const networkWait = Math.max(0, cTtfb - serverTotalEstimate);

    rows.push({ label: 'Browser: fetch() call', color: 'bg-sky-400', startMs: 0, widthMs: Math.max(1, networkWait), detail: `Network queue + transit` });
    rows.push({ label: 'Middleware', color: 'bg-amber-400', startMs: networkWait, widthMs: mwMs, detail: `${srv.middleware.status} (${mwMs}ms)` });
    rows.push({ label: 'API Handler', color: 'bg-violet-500', startMs: networkWait + mwMs, widthMs: handlerMs, detail: `${srv.handler.endpoint}` });
    rows.push({ label: 'DB Write', color: 'bg-emerald-500', startMs: networkWait + mwMs + 2, widthMs: srv.database.writeMs, detail: `${srv.database.recordsWritten} records` });
    rows.push({ label: 'DB Read', color: 'bg-teal-500', startMs: networkWait + mwMs + 2 + srv.database.writeMs + 1, widthMs: srv.database.readMs, detail: `${srv.database.recordsRead} records` });
    rows.push({ label: 'Server → Browser', color: 'bg-sky-300', startMs: cTtfb, widthMs: Math.max(1, cJson + Math.max(0, cRender - cTtfb - cJson)), detail: 'Response transfer + parse' });
    rows.push({ label: 'JSON Parse', color: 'bg-orange-400', startMs: cTtfb, widthMs: Math.max(1, cJson), detail: `${cJson}ms` });
    rows.push({ label: 'React Render', color: 'bg-rose-400', startMs: cRender - 1, widthMs: Math.max(1, cRoundTrip - cRender + 1), detail: 'State update + paint' });

    return rows;
  };

  const pingWaterfall = pingData ? buildWaterfall(pingData) : [];
  const pingTotalMs = pingData
    ? ((pingData as unknown as Record<string, unknown>)._clientTimingRaw as Record<string, number>)?.roundTripMs
      ?? (pingData.client.roundTripMs as number) ?? pingData.correlation.serverTotalMs
    : 0;

  // Build waterfall for history traces
  const buildHistoryWaterfall = (t: StoredTrace): WaterfallRow[] => {
    const netWait = Math.max(0, t.clientTtfbMs - t.serverMiddlewareMs - t.serverHandlerMs);
    return [
      { label: 'Browser: fetch()', color: 'bg-sky-400', startMs: 0, widthMs: Math.max(1, netWait), detail: 'Network wait' },
      { label: 'Middleware', color: 'bg-amber-400', startMs: netWait, widthMs: t.serverMiddlewareMs, detail: `${t.serverMiddlewareMs}ms` },
      { label: 'API Handler', color: 'bg-violet-500', startMs: netWait + t.serverMiddlewareMs, widthMs: t.serverHandlerMs, detail: `${t.serverHandlerMs}ms` },
      { label: 'DB Write', color: 'bg-emerald-500', startMs: netWait + t.serverMiddlewareMs + 2, widthMs: t.serverDbWriteMs, detail: `${t.serverDbWriteMs}ms` },
      { label: 'DB Read', color: 'bg-teal-500', startMs: netWait + t.serverMiddlewareMs + 2 + t.serverDbWriteMs + 1, widthMs: t.serverDbReadMs, detail: `${t.serverDbReadMs}ms` },
      { label: 'Response + Parse', color: 'bg-sky-300', startMs: t.clientTtfbMs, widthMs: Math.max(1, t.clientJsonParseMs), detail: `${t.clientJsonParseMs}ms` },
      { label: 'Render', color: 'bg-rose-400', startMs: t.clientRenderStartMs - 1, widthMs: Math.max(1, t.clientRoundTripMs - t.clientRenderStartMs + 1), detail: `${t.clientRoundTripMs - t.clientRenderStartMs}ms` },
    ];
  };

  // Build waterfall from CorrelatedTraceResult (the new dedicated endpoint)
  const buildCorrelatedWaterfall = (r: CorrelatedTraceResult): WaterfallRow[] => {
    const c = r.client;
    const s = r.server;
    const corr = r.correlation;
    const rows: WaterfallRow[] = [];
    const totalMs = Math.max(c.roundTripMs, corr.serverTotalMs, 1);
    const mwMs = s.middleware.durationMs;
    const handlerMs = s.handler.durationMs;
    const serverTotalEstimate = mwMs + handlerMs;
    const networkWait = Math.max(0, c.ttfbMs - serverTotalEstimate);

    // Browser-side phases
    rows.push({ label: 'Browser: fetch()', color: 'bg-sky-400', startMs: 0, widthMs: Math.max(1, networkWait), detail: 'Network queue + transit' });
    rows.push({ label: 'Middleware', color: 'bg-amber-400', startMs: networkWait, widthMs: mwMs, detail: `${s.middleware.status} (${mwMs}ms)` });
    rows.push({ label: 'API Handler', color: 'bg-violet-500', startMs: networkWait + mwMs, widthMs: handlerMs, detail: `${s.handler.endpoint}` });
    rows.push({ label: 'DB Write', color: 'bg-emerald-500', startMs: networkWait + mwMs + 2, widthMs: s.database.writeMs, detail: `${s.database.recordsWritten} records` });
    // Resource Timing phases (if available)
    if (c.resourceTiming) {
      const rt = c.resourceTiming;
      if (rt.dnsMs > 0) rows.push({ label: 'DNS Lookup', color: 'bg-pink-300', startMs: 0, widthMs: rt.dnsMs, detail: `${rt.dnsMs}ms` });
      if (rt.tcpMs > 0) rows.push({ label: 'TCP Connect', color: 'bg-indigo-300', startMs: rt.dnsMs, widthMs: rt.tcpMs, detail: `${rt.tcpMs}ms` });
      if (rt.sslMs > 0) rows.push({ label: 'TLS/SSL', color: 'bg-yellow-300', startMs: rt.dnsMs + rt.tcpMs, widthMs: rt.sslMs, detail: `${rt.sslMs}ms` });
      if (rt.requestMs > 0) rows.push({ label: 'Server Wait', color: 'bg-orange-300', startMs: c.ttfbMs - rt.requestMs, widthMs: rt.requestMs, detail: `${rt.requestMs}ms` });
      if (rt.responseMs > 0) rows.push({ label: 'Download', color: 'bg-cyan-300', startMs: c.ttfbMs, widthMs: rt.responseMs, detail: `${rt.transferSize}B` });
    }
    rows.push({ label: 'JSON Parse', color: 'bg-orange-400', startMs: c.ttfbMs, widthMs: Math.max(1, c.jsonParseMs), detail: `${c.jsonParseMs}ms` });
    rows.push({ label: 'React Render', color: 'bg-rose-400', startMs: c.renderStartMs - 1, widthMs: Math.max(1, c.roundTripMs - c.renderStartMs + 1), detail: 'State update + paint' });
    return rows;
  };

  const correlatedWaterfall = correlatedResult ? buildCorrelatedWaterfall(correlatedResult) : [];

  // Memoize observed resources sorted by duration (slowest first)
  const sortedObserved = useMemo(
    () => [...observedResources].sort((a, b) => b.duration - a.duration),
    [observedResources],
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/80 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900"><Shield className="h-5 w-5 text-white" /></div>
              <div>
                <h1 className="text-lg font-bold text-slate-900 leading-tight">Maritime Compliance Swarm</h1>
                <p className="text-xs text-slate-500">GDPR / PII / EDI Governance Platform</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}><RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />Refresh</Button>
              <Button size="sm" onClick={runAudit} disabled={auditing}>{auditing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <FileSearch className="mr-1.5 h-3.5 w-3.5" />}Run Audit</Button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* KPI Row */}
        {loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{Array.from({ length: 4 }).map((_, i) => <KPISkeleton key={i} />)}</div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KPICard icon={ShieldAlert} label="Open Findings" value={overall?.open_findings ?? '-'} sub={`${openCritical} critical`} color={openCritical > 0 ? 'text-red-700' : 'text-slate-900'} />
            <KPICard icon={ShieldCheck} label="Compliance Rate" value={`${overall?.compliance_rate ?? 0}%`} sub={`${overall?.resolved_findings ?? 0} resolved`} color={(overall?.compliance_rate ?? 0) >= 80 ? 'text-emerald-700' : 'text-amber-700'} />
            <KPICard icon={Clock} label="Avg MTTR" value={`${overall?.avg_mttr_hours ?? 0}h`} sub={`P95: ${overall?.p95_mttr_hours ?? 0}h`} />
            <KPICard icon={Database} label="Correlated Traces" value={pingData?.stats.totalCorrelatedTraces ?? 0} sub={`${traceHistory.length} loaded`} />
          </div>
        )}

        {/* Tool Status Bar */}
        <Card><CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2 text-sm"><Server className="w-4 h-4 text-slate-400" /><span className="font-medium text-slate-700">Swarm Tools:</span></div>
            {[{ name: 'PII Anonymiser', icon: FileKey, lang: 'Python' },{ name: 'EDI Auditor', icon: FileSearch, lang: 'Python' },{ name: 'Remediation', icon: Wrench, lang: 'Python' },{ name: 'MTTR Tracker', icon: Timer, lang: 'Go' }].map(tool => (
              <Badge key={tool.name} variant="outline" className="gap-1.5 font-mono text-xs"><tool.icon className="w-3 h-3" />{tool.name}<span className="text-slate-400">({tool.lang})</span></Badge>
            ))}
          </div>
        </CardContent></Card>

        {/* Tabs */}
        <Tabs defaultValue="pipeline" className="space-y-4">
          <TabsList className="grid w-full grid-cols-8">
            <TabsTrigger value="pipeline" className="text-xs sm:text-sm">Pipeline</TabsTrigger>
            <TabsTrigger value="frontend-trace" className="text-xs sm:text-sm flex items-center gap-1"><MousePointerClick className="w-3 h-3" />Frontend</TabsTrigger>
            <TabsTrigger value="observability" className="text-xs sm:text-sm flex items-center gap-1"><Thermometer className="w-3 h-3" />Observe</TabsTrigger>
            <TabsTrigger value="findings" className="text-xs sm:text-sm">Findings</TabsTrigger>
            <TabsTrigger value="mttr" className="text-xs sm:text-sm">MTTR</TabsTrigger>
            <TabsTrigger value="profiles" className="text-xs sm:text-sm">EDI Profiles</TabsTrigger>
            <TabsTrigger value="policies" className="text-xs sm:text-sm">Policies</TabsTrigger>
            <TabsTrigger value="endpoints" className="text-xs sm:text-sm">API</TabsTrigger>
          </TabsList>

          {/* ══════════ PIPELINE TAB ══════════ */}
          <TabsContent value="pipeline" className="space-y-4">

            {/* ── Action Bar ── */}
            <Card><CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <CardTitle className="text-base flex items-center gap-2"><CircuitBoard className="w-4 h-4" />Correlated Endpoint Trace</CardTitle>
                  <CardDescription>Browser Performance API + Middleware + API Handler + Database — all timed and joined per request</CardDescription>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" onClick={runPing} disabled={pingLoading}>{pingLoading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Zap className="mr-1.5 h-3.5 w-3.5" />}Trace GET</Button>
                  <Button size="sm" variant="outline" onClick={loadTraceHistory} disabled={loadingHistory}><History className="mr-1.5 h-3.5 w-3.5" />Load History</Button>
                </div>
              </div>
            </CardHeader></Card>

            {pingError && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700"><AlertTriangle className="w-4 h-4 inline mr-2" />{pingError}</div>}

            {/* ── CORRELATED WATERFALL (the hero) ── */}
            {pingData && (
              <Card><CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="w-4 h-4" />Correlated Waterfall — Request {pingData.server.middleware.requestId.slice(-10)}</CardTitle>
                <CardDescription>Client-side timing (Performance API) correlated with server-side middleware/handler/DB traces</CardDescription>
              </CardHeader><CardContent className="space-y-4">

                {/* Summary KPIs */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-sky-50 border border-sky-200 rounded-lg p-3 text-center"><p className="text-[10px] text-sky-600 font-medium uppercase">Browser Round-Trip</p><p className="text-xl font-bold text-sky-800 font-mono">{pingTotalMs}<span className="text-xs font-normal">ms</span></p></div>
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-center"><p className="text-[10px] text-amber-600 font-medium uppercase">Middleware</p><p className="text-xl font-bold text-amber-800 font-mono">{pingData.server.middleware.durationMs}<span className="text-xs font-normal">ms</span></p></div>
                  <div className="bg-violet-50 border border-violet-200 rounded-lg p-3 text-center"><p className="text-[10px] text-violet-600 font-medium uppercase">Handler + DB</p><p className="text-xl font-bold text-violet-800 font-mono">{pingData.server.handler.durationMs}<span className="text-xs font-normal">ms</span></p></div>
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-center"><p className="text-[10px] text-emerald-600 font-medium uppercase">Clock Delta</p><p className="text-xl font-bold text-emerald-800 font-mono">{pingData.correlation.clockDeltaMs}<span className="text-xs font-normal">ms</span></p></div>
                </div>

                {/* Waterfall chart */}
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <p className="text-xs font-medium text-slate-500 mb-3">TIMELINE (left = request start, right = response received by browser)</p>
                  <WaterfallChart rows={pingWaterfall} totalMs={Math.max(pingTotalMs, 1)} />
                </div>

                {/* Legend */}
                <div className="flex flex-wrap gap-3 text-[10px]">
                  {[{c:'bg-sky-400',l:'Browser'},{c:'bg-amber-400',l:'Middleware'},{c:'bg-violet-500',l:'API Handler'},{c:'bg-emerald-500',l:'DB Write'},{c:'bg-teal-500',l:'DB Read'},{c:'bg-orange-400',l:'JSON Parse'},{c:'bg-rose-400',l:'React Render'}].map(x => (
                    <span key={x.l} className="flex items-center gap-1"><span className={`w-3 h-2 rounded-sm ${x.c}`} />{x.l}</span>
                  ))}
                </div>

                {/* Correlation detail */}
                <div className="grid gap-3 sm:grid-cols-2">
                  <Card className="border-slate-200"><CardHeader className="pb-1"><CardTitle className="text-xs flex items-center gap-1.5"><Globe className="w-3.5 h-3.5" />Browser Perspective</CardTitle></CardHeader><CardContent className="text-[11px] space-y-1">
                    <div className="flex justify-between"><span className="text-slate-500">fetch() called</span><span className="font-mono">{(pingData.client.fetchStart as string)?.slice(11,23) ?? 'n/a'}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">TTFB (first byte)</span><span className="font-mono font-bold">{(pingData.client.ttfbMs as number) || 0}ms</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">JSON parse</span><span className="font-mono">{(pingData.client.jsonParseMs as number) || 0}ms</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Total round-trip</span><span className="font-mono font-bold text-sky-700">{pingTotalMs}ms</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Navigation type</span><span className="font-mono">{String(pingData.client.navigationType ?? 'n/a')}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Connection</span><span className="font-mono">{String(pingData.client.connectionType ?? 'n/a')}</span></div>
                  </CardContent></Card>

                  <Card className="border-slate-200"><CardHeader className="pb-1"><CardTitle className="text-xs flex items-center gap-1.5"><Server className="w-3.5 h-3.5" />Server Perspective</CardTitle></CardHeader><CardContent className="text-[11px] space-y-1">
                    <div className="flex justify-between"><span className="text-slate-500">Middleware</span><span className="font-mono">{pingData.server.middleware.startTs?.slice(11,23)} → {pingData.server.middleware.endTs?.slice(11,23)} <span className="font-bold">({pingData.server.middleware.durationMs}ms)</span></span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Handler</span><span className="font-mono">{pingData.server.handler.durationMs}ms</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">DB write</span><span className="font-mono text-emerald-700">{pingData.server.database.writeMs}ms</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">DB read</span><span className="font-mono text-emerald-700">{pingData.server.database.readMs}ms</span></div>
                    <Separator className="my-1" />
                    <div className="flex justify-between"><span className="text-slate-500">Server total</span><span className="font-mono font-bold">{pingData.correlation.serverTotalMs}ms</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Browser overhead</span><span className="font-mono">{pingData.correlation.browserOverheadMs ?? 0}ms</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Network transit</span><span className="font-mono">{pingData.correlation.networkTransitMs ?? 0}ms</span></div>
                  </CardContent></Card>
                </div>

                {/* Response headers proof */}
                <details className="text-xs"><summary className="text-slate-500 cursor-pointer hover:text-slate-700">Response Headers (middleware proof)</summary>
                  <div className="mt-2 bg-slate-900 text-emerald-400 rounded-lg p-3 font-mono text-[10px] max-h-32 overflow-y-auto">
                    {Object.entries(responseHeaders).filter(([k]) => k.startsWith('x-')).map(([k, v]) => (
                      <div key={k}><span className="text-slate-500">{k}:</span> {String(v).slice(0, 60)}</div>
                    ))}
                  </div>
                </details>

                {/* POST test */}
                <Separator />
                <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
                  <p className="text-xs font-medium text-slate-600 flex-shrink-0">POST with timing:</p>
                  <Input placeholder='{{"message": "hello"}}' value={postPayload} onChange={e => setPostPayload(e.target.value)} className="font-mono text-xs max-w-sm" />
                  <Button size="sm" variant="outline" onClick={runPostPing} disabled={pingLoading}><Send className="mr-1.5 h-3.5 w-3.5" />POST</Button>
                </div>
                {postResult && (
                  <details><summary className="text-xs text-slate-500 cursor-pointer">POST Response (with timing)</summary>
                    <pre className="mt-1 bg-slate-900 text-emerald-400 rounded-lg p-3 text-[10px] font-mono max-h-40 overflow-y-auto">{postResult}</pre>
                  </details>
                )}
              </CardContent></Card>
            )}

            {/* ── TRACE HISTORY ── */}
            {traceHistory.length > 0 && (
              <Card><CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><History className="w-4 h-4" />Stored Correlated Traces ({traceHistory.length})</CardTitle>
                <CardDescription>Persisted in SQLite — client + server timings joined per requestId. Proof of full-stack observability.</CardDescription>
              </CardHeader><CardContent className="space-y-4">
                <div className="max-h-96 overflow-y-auto space-y-3">
                  {traceHistory.map(t => (
                    <div key={t.id} className="border border-slate-200 rounded-lg p-3 space-y-2">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <Badge variant="outline" className={`font-mono text-[10px] ${t.method === 'GET' ? 'text-emerald-700 border-emerald-300' : 'text-amber-700 border-amber-300'}`}>{t.method}</Badge>
                        <span className="font-mono text-slate-600">...{t.requestId.slice(-10)}</span>
                        <Badge variant="outline" className="text-[10px]">{t.statusCode}</Badge>
                        <span className="text-slate-400">{t.createdAt.slice(11, 19)}</span>
                        <span className="ml-auto font-mono font-bold text-slate-700">{t.totalEndToEndMs}ms E2E</span>
                      </div>
                      <WaterfallChart rows={buildHistoryWaterfall(t)} totalMs={Math.max(t.totalEndToEndMs, 1)} />
                      <div className="flex flex-wrap gap-3 text-[9px] text-slate-500">
                        <span>Browser TTFB: <b>{t.clientTtfbMs}ms</b></span>
                        <span>Middleware: <b>{t.serverMiddlewareMs}ms</b></span>
                        <span>Handler: <b>{t.serverHandlerMs}ms</b></span>
                        <span>DB W: <b>{t.serverDbWriteMs}ms</b></span>
                        <span>DB R: <b>{t.serverDbReadMs}ms</b></span>
                        <span>JSON Parse: <b>{t.clientJsonParseMs}ms</b></span>
                        <span>Clock Delta: <b>{t.clientServerDeltaMs}ms</b></span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent></Card>
            )}

            {/* ── Recent DB Events ── */}
            {pingData && (
              <Card><CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><Activity className="w-4 h-4" />Recent DB Events</CardTitle>
              </CardHeader><CardContent>
                <div className="max-h-48 overflow-y-auto">
                  <Table><TableHeader><TableRow className="bg-slate-50">
                    <TableHead className="text-xs">Event ID</TableHead><TableHead className="text-xs">Path</TableHead><TableHead className="text-xs">Method</TableHead><TableHead className="text-xs">Status</TableHead><TableHead className="text-xs">DB Read</TableHead><TableHead className="text-xs">Created</TableHead>
                  </TableRow></TableHeader><TableBody>
                    {pingData.stats.recentEvents.map(ev => (
                      <TableRow key={ev.id} className="hover:bg-slate-50/50">
                        <TableCell className="font-mono text-[11px]">...{ev.id}</TableCell>
                        <TableCell className="font-mono text-[11px]">{ev.path}</TableCell>
                        <TableCell><Badge variant="outline" className={`text-[10px] ${ev.method === 'GET' ? 'text-emerald-700 border-emerald-300' : 'text-amber-700 border-amber-300'}`}>{ev.method}</Badge></TableCell>
                        <TableCell className="text-[11px]">{ev.statusCode}</TableCell>
                        <TableCell className="font-mono text-[11px]">{ev.dbReadMs != null ? `${ev.dbReadMs}ms` : '-'}</TableCell>
                        <TableCell className="text-[11px] text-slate-500">{ev.createdAt.slice(11, 19)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody></Table>
                </div>
              </CardContent></Card>
            )}
          </TabsContent>

          {/* ══════════ FRONTEND TRACE TAB ══════════ */}
          <TabsContent value="frontend-trace" className="space-y-4">

            {/* ── Section Header ── */}
            <Card><CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <CardTitle className="text-base flex items-center gap-2"><MousePointerClick className="w-4 h-4" />Frontend Browser-Side Trace</CardTitle>
                  <CardDescription>Captures browser Performance API timings (Resource Timing, Navigation Timing) and correlates with server-side middleware/handler/DB traces across ALL site components</CardDescription>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" onClick={runCorrelatedTrace} disabled={correlatedLoading}>{correlatedLoading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Radio className="mr-1.5 h-3.5 w-3.5" />}Run Correlated Trace</Button>
                  <Button size="sm" variant="outline" onClick={runBatchTrace} disabled={batchLoading}>{batchLoading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Flame className="mr-1.5 h-3.5 w-3.5" />}Batch Trace All APIs</Button>
                  <Button size="sm" variant="outline" onClick={() => { loadTraceSummary(); loadFullTraceHistory(); }} disabled={traceSummaryLoading || fullHistoryLoading}><History className="mr-1.5 h-3.5 w-3.5" />Load History</Button>
                </div>
              </div>
            </CardHeader></Card>

            {correlatedError && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700"><AlertTriangle className="w-4 h-4 inline mr-2" />{correlatedError}</div>}

            {/* ── PERFORMANCE OBSERVER: Live Observed Resources ── */}
            <Card><CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><Eye className="w-4 h-4" />PerformanceObserver — Live Resource Capture <Badge variant="outline" className="text-[10px] ml-1">{tracerStats.totalObserved} observed</Badge></CardTitle>
              <CardDescription>Automatically captures every fetch/XHR resource timing on this page via the PerformanceObserver API. No manual instrumentation needed.</CardDescription>
            </CardHeader><CardContent>
              {sortedObserved.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No fetch resources observed yet. Interact with the app (click Trace, load data) and resources will appear here automatically.</p>
              ) : (
                <div className="max-h-48 overflow-y-auto">
                  <Table><TableHeader><TableRow className="bg-slate-50">
                    <TableHead className="text-xs">Endpoint</TableHead>
                    <TableHead className="text-xs text-right">Duration</TableHead>
                    <TableHead className="text-xs text-right">Transfer</TableHead>
                    <TableHead className="text-xs">Initiator</TableHead>
                  </TableRow></TableHeader><TableBody>
                    {sortedObserved.map((r, i) => (
                      <TableRow key={`${r.name}-${i}`} className="hover:bg-slate-50/50">
                        <TableCell className="font-mono text-[11px] max-w-[300px] truncate" title={r.name}>{r.name.replace(window.location.origin, '')}</TableCell>
                        <TableCell className="text-right font-mono text-[11px] font-bold">{r.duration}<span className="text-slate-400 font-normal">ms</span></TableCell>
                        <TableCell className="text-right text-[11px] font-mono text-slate-500">{r.transferSize > 0 ? `${(r.transferSize / 1024).toFixed(1)}KB` : 'cache'}</TableCell>
                        <TableCell><Badge variant="outline" className="text-[10px]">{r.initiatorType}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody></Table>
                </div>
              )}
            </CardContent></Card>

            {/* ── BATCH TRACE RESULTS ── */}
            {batchResults.length > 0 && (
              <Card><CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><Flame className="w-4 h-4" />Batch Trace — All Compliance Endpoints (Parallel)</CardTitle>
                <CardDescription>Every API endpoint on the site traced simultaneously with browser-side timing. Shows which components are fast/slow from the browser's perspective.</CardDescription>
              </CardHeader><CardContent className="space-y-3">
                <div className="space-y-2">
                  {batchResults.map((r, i) => {
                    const maxMs = Math.max(...batchResults.map(b => b.roundTripMs), 1);
                    const pct = (r.roundTripMs / maxMs) * 100;
                    const isTotal = r.url.startsWith('TOTAL');
                    return (
                      <div key={i} className="flex items-center gap-3">
                        <span className={`text-[11px] font-mono w-[220px] flex-shrink-0 truncate ${isTotal ? 'font-bold text-slate-900' : 'text-slate-600'}`} title={r.url}>{r.url.replace(window.location.origin, '')}</span>
                        <div className="flex-1 bg-slate-100 rounded-full h-4 relative overflow-hidden">
                          <div className={`h-full rounded-full transition-all duration-500 ${isTotal ? 'bg-slate-800' : r.roundTripMs > 500 ? 'bg-red-400' : r.roundTripMs > 200 ? 'bg-amber-400' : 'bg-emerald-400'}`} style={{ width: `${pct}%` }} />
                          <span className="absolute inset-0 flex items-center justify-center text-[10px] font-mono font-medium text-slate-700">{r.roundTripMs}ms</span>
                        </div>
                        {r.protocol && <Badge variant="outline" className="text-[9px] w-12 justify-center">{r.protocol}</Badge>}
                      </div>
                    );
                  })}
                </div>
                {/* Legend */}
                <div className="flex gap-4 text-[10px] text-slate-500">
                  <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-emerald-400" /> &lt;200ms</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-amber-400" /> 200-500ms</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-red-400" /> &gt;500ms</span>
                </div>
              </CardContent></Card>
            )}

            {/* ── CORRELATED TRACE WATERFALL (the hero) ── */}
            {correlatedResult && (
              <Card><CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="w-4 h-4" />Correlated Waterfall — Request {correlatedResult.requestId.slice(-10)} <Badge variant="outline" className="text-[10px] ml-1">Trace ID: ...{correlatedResult.traceId.slice(-8)}</Badge></CardTitle>
                <CardDescription>Browser Resource Timing (DNS/TCP/SSL/request/response) + Middleware + Handler + DB — all timed and joined per request via shared request ID</CardDescription>
              </CardHeader><CardContent className="space-y-4">

                {/* Summary KPIs */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <div className="bg-sky-50 border border-sky-200 rounded-lg p-3 text-center"><p className="text-[10px] text-sky-600 font-medium uppercase">Round-Trip</p><p className="text-xl font-bold text-sky-800 font-mono">{correlatedResult.client.roundTripMs}<span className="text-xs font-normal">ms</span></p></div>
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-center"><p className="text-[10px] text-amber-600 font-medium uppercase">Middleware</p><p className="text-xl font-bold text-amber-800 font-mono">{correlatedResult.server.middleware.durationMs}<span className="text-xs font-normal">ms</span></p></div>
                  <div className="bg-violet-50 border border-violet-200 rounded-lg p-3 text-center"><p className="text-[10px] text-violet-600 font-medium uppercase">Handler</p><p className="text-xl font-bold text-violet-800 font-mono">{correlatedResult.server.handler.durationMs}<span className="text-xs font-normal">ms</span></p></div>
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-center"><p className="text-[10px] text-emerald-600 font-medium uppercase">DB Write</p><p className="text-xl font-bold text-emerald-800 font-mono">{correlatedResult.server.database.writeMs}<span className="text-xs font-normal">ms</span></p></div>
                  <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 text-center"><p className="text-[10px] text-rose-600 font-medium uppercase">Clock Delta</p><p className="text-xl font-bold text-rose-800 font-mono">{correlatedResult.correlation.clockDeltaMs}<span className="text-xs font-normal">ms</span></p></div>
                </div>

                {/* Waterfall chart */}
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <p className="text-xs font-medium text-slate-500 mb-3">CORRELATED TIMELINE (browser phases + server phases, left = request start)</p>
                  <WaterfallChart rows={correlatedWaterfall} totalMs={Math.max(correlatedResult.client.roundTripMs, 1)} />
                </div>

                {/* Legend */}
                <div className="flex flex-wrap gap-3 text-[10px]">
                  {[{c:'bg-sky-400',l:'Browser fetch'},{c:'bg-amber-400',l:'Middleware'},{c:'bg-violet-500',l:'Handler'},{c:'bg-emerald-500',l:'DB'},{c:'bg-pink-300',l:'DNS'},{c:'bg-indigo-300',l:'TCP'},{c:'bg-yellow-300',l:'TLS/SSL'},{c:'bg-orange-300',l:'Server Wait'},{c:'bg-cyan-300',l:'Download'},{c:'bg-orange-400',l:'JSON Parse'},{c:'bg-rose-400',l:'React Render'}].map(x => (
                    <span key={x.l} className="flex items-center gap-1"><span className={`w-3 h-2 rounded-sm ${x.c}`} />{x.l}</span>
                  ))}
                </div>

                {/* Browser Perspective vs Server Perspective */}
                <div className="grid gap-3 sm:grid-cols-3">
                  {/* Browser Perspective */}
                  <Card className="border-slate-200"><CardHeader className="pb-1"><CardTitle className="text-xs flex items-center gap-1.5"><Globe className="w-3.5 h-3.5" />Browser Perspective</CardTitle></CardHeader><CardContent className="text-[11px] space-y-1">
                    <div className="flex justify-between"><span className="text-slate-500">fetch() called</span><span className="font-mono">{correlatedResult.client.fetchStart?.slice(11,23) ?? 'n/a'}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">TTFB</span><span className="font-mono font-bold text-sky-700">{correlatedResult.client.ttfbMs}ms</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">JSON parse</span><span className="font-mono">{correlatedResult.client.jsonParseMs}ms</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Round-trip</span><span className="font-mono font-bold">{correlatedResult.client.roundTripMs}ms</span></div>
                    <Separator className="my-1" />
                    <div className="flex justify-between"><span className="text-slate-500">Protocol</span><span className="font-mono">{correlatedResult.client.networkProtocol || 'n/a'}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Connection</span><span className="font-mono">{correlatedResult.client.connectionType}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Nav type</span><span className="font-mono">{correlatedResult.client.navigationType}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Observed res.</span><span className="font-mono">{correlatedResult.client.observedResources}</span></div>
                    {correlatedResult.client.resourceTiming && (<>
                      <Separator className="my-1" />
                      <p className="text-[10px] text-slate-400 font-medium">Resource Timing API</p>
                      <div className="flex justify-between"><span className="text-slate-500">DNS</span><span className="font-mono">{correlatedResult.client.resourceTiming.dnsMs}ms</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">TCP</span><span className="font-mono">{correlatedResult.client.resourceTiming.tcpMs}ms</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">SSL/TLS</span><span className="font-mono">{correlatedResult.client.resourceTiming.sslMs}ms</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Request sent</span><span className="font-mono">{correlatedResult.client.resourceTiming.requestMs}ms</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Response recv</span><span className="font-mono">{correlatedResult.client.resourceTiming.responseMs}ms</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Transfer size</span><span className="font-mono">{correlatedResult.client.resourceTiming.transferSize}B</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Encoded body</span><span className="font-mono">{correlatedResult.client.resourceTiming.encodedBodySize}B</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Decoded body</span><span className="font-mono">{correlatedResult.client.resourceTiming.decodedBodySize}B</span></div>
                    </>)}
                  </CardContent></Card>

                  {/* Server Perspective */}
                  <Card className="border-slate-200"><CardHeader className="pb-1"><CardTitle className="text-xs flex items-center gap-1.5"><Server className="w-3.5 h-3.5" />Server Perspective</CardTitle></CardHeader><CardContent className="text-[11px] space-y-1">
                    <div className="flex justify-between"><span className="text-slate-500">Middleware</span><span className="font-mono">{correlatedResult.server.middleware.startTs?.slice(11,23)} → {correlatedResult.server.middleware.endTs?.slice(11,23)} <span className="font-bold">({correlatedResult.server.middleware.durationMs}ms)</span></span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Handler</span><span className="font-mono">{correlatedResult.server.handler.durationMs}ms <span className="text-slate-400">(body parse: {correlatedResult.server.handler.bodyParseMs}ms)</span></span></div>
                    <div className="flex justify-between"><span className="text-slate-500">DB write</span><span className="font-mono text-emerald-700">{correlatedResult.server.database.writeMs}ms</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Records written</span><span className="font-mono">{correlatedResult.server.database.recordsWritten}</span></div>
                    <Separator className="my-1" />
                    <div className="flex justify-between"><span className="text-slate-500">Server total</span><span className="font-mono font-bold">{correlatedResult.correlation.serverTotalMs}ms</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Browser overhead</span><span className="font-mono">{correlatedResult.correlation.browserOverheadMs ?? 0}ms</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Network transit</span><span className="font-mono">{correlatedResult.correlation.networkTransitMs ?? 0}ms</span></div>
                    <Separator className="my-1" />
                    <div className="flex justify-between"><span className="text-slate-500">Request ID</span><span className="font-mono text-[10px]">{correlatedResult.requestId.slice(-12)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Client IP</span><span className="font-mono text-[10px]">{correlatedResult.server.middleware.clientIp}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Trace persisted</span><span className="font-mono text-emerald-600">{correlatedResult.correlation.tracePersisted ? 'Yes' : 'No'}</span></div>
                  </CardContent></Card>

                  {/* Correlation Analysis */}
                  <Card className="border-slate-200"><CardHeader className="pb-1"><CardTitle className="text-xs flex items-center gap-1.5"><Network className="w-3.5 h-3.5" />Correlation Analysis</CardTitle></CardHeader><CardContent className="text-[11px] space-y-1">
                    <div className="flex justify-between"><span className="text-slate-500">Client round-trip</span><span className="font-mono font-bold text-sky-700">{correlatedResult.correlation.totalEndToEndMs}ms</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Server processing</span><span className="font-mono font-bold">{correlatedResult.correlation.serverTotalMs}ms</span></div>
                    <Separator className="my-1" />
                    <div className="flex justify-between"><span className="text-slate-500">Browser overhead</span><span className="font-mono">{correlatedResult.correlation.browserOverheadMs ?? 0}ms</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Network transit</span><span className="font-mono">{correlatedResult.correlation.networkTransitMs ?? 0}ms</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Clock delta</span><span className="font-mono">{correlatedResult.correlation.clockDeltaMs}ms</span></div>
                    <Separator className="my-1" />
                    <p className="text-[10px] text-slate-400 font-medium">How it works:</p>
                    <p className="text-[10px] text-slate-500">The browser captures fetch start, TTFB, JSON parse, and render times using <code className="bg-slate-100 px-0.5 rounded">performance.now()</code>. It also reads the Resource Timing API for DNS/TCP/SSL breakdown. The server reads middleware-injected headers and times its own handler + DB work. Both are joined by the shared <code className="bg-slate-100 px-0.5 rounded">x-request-id</code> and persisted as a single <code className="bg-slate-100 px-0.5 rounded">CorrelatedTrace</code> row in SQLite.</p>
                    <Separator className="my-1" />
                    <p className="text-[10px] text-slate-400 font-medium">Component coverage:</p>
                    <ul className="text-[10px] text-slate-500 space-y-0.5">
                      <li className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-500" />Browser (Performance API)</li>
                      <li className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-500" />Next.js Middleware</li>
                      <li className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-500" />API Route Handler</li>
                      <li className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-500" />SQLite Database (Prisma)</li>
                      <li className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-500" />Component Health Tracker</li>
                      <li className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-500" />PerformanceObserver (auto)</li>
                    </ul>
                  </CardContent></Card>
                </div>

                {/* Raw timing JSON */}
                <details className="text-xs"><summary className="text-slate-500 cursor-pointer hover:text-slate-700">Raw Browser Timing JSON (from Performance API)</summary>
                  <pre className="mt-2 bg-slate-900 text-emerald-400 rounded-lg p-3 text-[10px] font-mono max-h-48 overflow-y-auto">{(() => { try { return JSON.stringify(JSON.parse(correlatedResult.clientTimingJson ?? '{}'), null, 2); } catch { return correlatedResult.clientTimingJson ?? '{}'; } })()}</pre>
                </details>
              </CardContent></Card>
            )}

            {/* ── TRACE SUMMARY (aggregated) ── */}
            {traceSummary && (
              <Card><CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><FileClock className="w-4 h-4" />Aggregated Trace Statistics <Badge variant="outline" className="text-[10px] ml-1">{traceSummary.total as number} total traces</Badge></CardTitle>
              </CardHeader><CardContent className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-slate-50 rounded-lg p-3 text-center"><p className="text-[10px] text-slate-500">Avg TTFB</p><p className="text-lg font-bold font-mono">{Math.round(Number((traceSummary.averages as Record<string, number>)?.clientTtfbMs) || 0)}<span className="text-xs font-normal">ms</span></p></div>
                  <div className="bg-slate-50 rounded-lg p-3 text-center"><p className="text-[10px] text-slate-500">Avg Round-Trip</p><p className="text-lg font-bold font-mono">{Math.round(Number((traceSummary.averages as Record<string, number>)?.clientRoundTripMs) || 0)}<span className="text-xs font-normal">ms</span></p></div>
                  <div className="bg-slate-50 rounded-lg p-3 text-center"><p className="text-[10px] text-slate-500">Avg Handler</p><p className="text-lg font-bold font-mono">{Math.round(Number((traceSummary.averages as Record<string, number>)?.serverHandlerMs) || 0)}<span className="text-xs font-normal">ms</span></p></div>
                  <div className="bg-slate-50 rounded-lg p-3 text-center"><p className="text-[10px] text-slate-500">Avg DB Write</p><p className="text-lg font-bold font-mono">{Math.round(Number((traceSummary.averages as Record<string, number>)?.serverDbWriteMs) || 0)}<span className="text-xs font-normal">ms</span></p></div>
                </div>
                {!!(traceSummary.byPath && Array.isArray(traceSummary.byPath) && (traceSummary.byPath as Array<Record<string, unknown>>).length > 0) && (
                  <div className="max-h-40 overflow-y-auto">
                    <Table><TableHeader><TableRow className="bg-slate-50">
                      <TableHead className="text-xs">Endpoint</TableHead>
                      <TableHead className="text-xs">Method</TableHead>
                      <TableHead className="text-xs text-right">Count</TableHead>
                      <TableHead className="text-xs text-right">Avg Client RT</TableHead>
                      <TableHead className="text-xs text-right">Avg Handler</TableHead>
                    </TableRow></TableHeader><TableBody>
                      {(traceSummary.byPath as Array<Record<string, unknown>>).map((p, i) => (
                        <TableRow key={i} className="hover:bg-slate-50/50">
                          <TableCell className="font-mono text-[11px]">{p.path as string}</TableCell>
                          <TableCell><Badge variant="outline" className="text-[10px]">{p.method as string}</Badge></TableCell>
                          <TableCell className="text-[11px] font-mono text-right">{(p._count as Record<string, number>)?.id ?? 0}</TableCell>
                          <TableCell className="text-[11px] font-mono text-right">{Math.round((p._avg as Record<string, number>)?.clientRoundTripMs ?? 0)}ms</TableCell>
                          <TableCell className="text-[11px] font-mono text-right">{Math.round((p._avg as Record<string, number>)?.serverHandlerMs ?? 0)}ms</TableCell>
                        </TableRow>
                      ))}
                    </TableBody></Table>
                  </div>
                )}
              </CardContent></Card>
            )}

            {/* ── FULL TRACE HISTORY ── */}
            {fullTraceHistory.length > 0 && (
              <Card><CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><History className="w-4 h-4" />Correlated Trace History ({fullTraceHistory.length})</CardTitle>
                <CardDescription>All persisted client+server traces from the dedicated correlated-trace endpoint, sorted newest first</CardDescription>
              </CardHeader><CardContent className="space-y-4">
                <div className="max-h-96 overflow-y-auto space-y-3">
                  {fullTraceHistory.map(t => (
                    <div key={t.id} className="border border-slate-200 rounded-lg p-3 space-y-2">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <Badge variant="outline" className="font-mono text-[10px] text-emerald-700 border-emerald-300">{t.method}</Badge>
                        <span className="font-mono text-slate-600">...{t.requestId.slice(-10)}</span>
                        <Badge variant="outline" className="text-[10px]">{t.statusCode}</Badge>
                        <span className="text-slate-400">{t.createdAt.slice(11, 19)}</span>
                        <span className="ml-auto font-mono font-bold text-slate-700">{t.totalEndToEndMs}ms E2E</span>
                        {t.clientNetworkProtocol && <Badge variant="outline" className="text-[9px]">{t.clientNetworkProtocol}</Badge>}
                      </div>
                      <WaterfallChart rows={buildHistoryWaterfall(t)} totalMs={Math.max(t.totalEndToEndMs, 1)} />
                      <div className="flex flex-wrap gap-3 text-[9px] text-slate-500">
                        <span>TTFB: <b>{t.clientTtfbMs}ms</b></span>
                        <span>Middleware: <b>{t.serverMiddlewareMs}ms</b></span>
                        <span>Handler: <b>{t.serverHandlerMs}ms</b></span>
                        <span>DB W: <b>{t.serverDbWriteMs}ms</b></span>
                        <span>JSON Parse: <b>{t.clientJsonParseMs}ms</b></span>
                        <span>Clock Delta: <b>{t.clientServerDeltaMs}ms</b></span>
                        <span>Round-Trip: <b className="text-sky-700">{t.clientRoundTripMs}ms</b></span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent></Card>
            )}

            {/* ── EMPTY STATE ── */}
            {!correlatedResult && batchResults.length === 0 && !traceSummary && fullTraceHistory.length === 0 && (
              <Card className="border-dashed"><CardContent className="py-12 text-center">
                <MousePointerClick className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="text-sm font-medium text-slate-600">No frontend traces yet</p>
                <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">Click "Run Correlated Trace" to capture a full browser-side timing profile and correlate it with server-side middleware, handler, and database traces. Use "Batch Trace All APIs" to profile every endpoint on the site at once.</p>
              </CardContent></Card>
            )}
          </TabsContent>

          {/* ══════════ OBSERVABILITY TAB (Full-Site Ep Trace) ══════════ */}
          <TabsContent value="observability" className="space-y-4">
            {/* Top bar: Run trace + summary button */}
            <div className="flex items-center gap-3 flex-wrap">
              <Button
                size="sm"
                onClick={async () => { const r = await runFullTrace(); if (r) setTimeout(() => loadEpHistory(10), 400); }}
                disabled={epTracing}
              >
                {epTracing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <GanttChart className="mr-1.5 h-3.5 w-3.5" />}
                {epTracing ? `Tracing ${epResult?.summary.endpointsHit ?? '...'} endpoints...` : 'Run Full-Site Trace'}
              </Button>
              <Button size="sm" variant="outline" onClick={() => { loadEpHistory(10); setEpHistoryLoaded(true); }} disabled={epHistoryLoaded}>
                <History className="mr-1.5 h-3.5 w-3.5" />Load History
              </Button>
              <Button size="sm" variant="outline" onClick={loadEpSummary}>
                <BarChart3 className="mr-1.5 h-3.5 w-3.5" />Summary
              </Button>
              {epResult && (
                <Badge variant="outline" className="font-mono text-xs text-emerald-700 border-emerald-300">
                  Last: {epResult.summary.endpointsHit} eps, {epResult.summary.avgRoundTripMs}ms avg RTT
                </Badge>
              )}
            </div>

            {/* KPIs from last trace result */}
            {epResult && (
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                <KPICard icon={Zap} label="Endpoints Hit" value={epResult.summary.endpointsHit} sub={`${epResult.summary.endpointsOk} OK / ${epResult.summary.endpointsFailed} fail`} />
                <KPICard icon={Gauge} label="Avg TTFB" value={`${epResult.summary.avgTtfbMs}ms`} sub="Time to first byte" />
                <KPICard icon={Activity} label="Avg Round Trip" value={`${epResult.summary.avgRoundTripMs}ms`} sub="Browser-side total" />
                <KPICard icon={Layers} label="Avg Middleware" value={`${epResult.summary.avgMiddlewareMs}ms`} sub="Edge processing" />
                <KPICard icon={Monitor} label="Avg Handler" value={`${epResult.summary.avgHandlerMs}ms`} sub="Server handler" />
                <KPICard icon={Database} label="Avg DB Write" value={`${epResult.summary.avgDbWriteMs}ms`} sub="SQLite persist" />
              </div>
            )}

            {/* Browser-level metrics from last trace */}
            {epResult && (
              <Card><CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Eye className="w-4 h-4" />Browser Environment (at trace time)</CardTitle></CardHeader><CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                  <div><span className="text-slate-500">Memory Used</span><p className="font-semibold">{String(epResult.browserMetrics.memoryUsedMb || 0)} MB</p><p className="text-xs text-slate-400">of {String(epResult.browserMetrics.memoryLimitMb || 0)} MB limit</p></div>
                  <div><span className="text-slate-500">DOM Nodes</span><p className="font-semibold">{String(epResult.browserMetrics.domNodes || 0)}</p></div>
                  <div><span className="text-slate-500">Long Tasks</span><p className="font-semibold">{String(epResult.browserMetrics.longTaskCount || 0)}</p><p className="text-xs text-slate-400">{String(epResult.browserMetrics.longTaskTotalMs || 0)}ms total</p></div>
                  <div><span className="text-slate-500">Resources</span><p className="font-semibold">{String(epResult.browserMetrics.resourceCount || 0)}</p><p className="text-xs text-slate-400">tracked by browser</p></div>
                  <div><span className="text-slate-500">Connection</span><p className="font-semibold">{epResult.browserMetrics.roundTripAvgMs > 0 ? '' : 'N/A'}</p><p className="text-xs text-slate-400">{typeof window !== 'undefined' ? String(((navigator as unknown as Record<string, unknown>).connection as Record<string, unknown>)?.effectiveType || 'unknown') : ''}</p></div>
                  <div><span className="text-slate-500">Trace ID</span><p className="font-mono text-xs font-semibold text-emerald-700 truncate">{epResult.traceId}</p></div>
                  <div><span className="text-slate-500">Server Timing</span><p className="font-semibold">{epResult.serverTiming.handlerMs}ms</p><p className="text-xs text-slate-400">handler | {epResult.serverTiming.dbWriteMs}ms db write</p></div>
                  <div><span className="text-slate-500">Total Traces</span><p className="font-semibold">{epResult.stats.totalEpTraces}</p><p className="text-xs text-slate-400">{epResult.stats.totalEpSpans} spans</p></div>
                </div>
              </CardContent></Card>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card><CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><ShieldAlertIcon className="w-4 h-4" />Rate Limiter</CardTitle><CardDescription>Token-bucket per IP per endpoint. Health probes bypassed.</CardDescription></CardHeader><CardContent>
                <div className="text-xs font-mono space-y-1 text-slate-600">
                  <div className="flex justify-between"><span>/api/compliance/health</span><span>120/min</span></div>
                  <div className="flex justify-between"><span>/api/compliance/findings</span><span>60/min</span></div>
                  <div className="flex justify-between"><span>/api/compliance/mttr</span><span>60/min</span></div>
                  <div className="flex justify-between"><span>/api/compliance/policies</span><span>60/min</span></div>
                  <div className="flex justify-between"><span>/api/compliance/profiles</span><span>60/min</span></div>
                  <div className="flex justify-between"><span>/api/compliance/audit</span><span className="text-amber-600 font-medium">10/min</span></div>
                  <div className="flex justify-between"><span>/api/compliance/remediate</span><span className="text-amber-600 font-medium">10/min</span></div>
                  <div className="flex justify-between"><span>/api/system/observability/ep-trace</span><span>30/min</span></div>
                  <div className="flex justify-between text-slate-400"><span>other (default)</span><span>60/min</span></div>
                </div>
              </CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Settings className="w-4 h-4" />Phase 1 Security Stack</CardTitle></CardHeader><CardContent className="space-y-2">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-500" /><span>Rate Limiting</span></div>
                  <div className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-500" /><span>CSP Headers</span></div>
                  <div className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-500" /><span>X-Frame-Options</span></div>
                  <div className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-500" /><span>X-Content-Type-Options</span></div>
                  <div className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-500" /><span>HSTS (prod)</span></div>
                  <div className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-500" /><span>CORS Lockdown</span></div>
                  <div className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-500" /><span>API Key Auth</span></div>
                  <div className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-500" /><span>JWT + RBAC</span></div>
                  <div className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-500" /><span>Key Rotation</span></div>
                  <div className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-500" /><span>Health Probes</span></div>
                  <div className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-500" /><span>JSON Logging</span></div>
                  <div className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-500" /><span>Config Validation</span></div>
                </div>
                <div className="mt-2 pt-2 border-t border-slate-100 text-[10px] text-slate-400 space-y-0.5">
                  <p><strong>Auth:</strong> X-API-Key / Bearer JWT | Roles: viewer, analyst, operator, admin</p>
                  <p><strong>Health:</strong> /health/live (liveness) + /health/ready (DB+deps)</p>
                  <p><strong>Config:</strong> /api/system/config | <strong>Limits:</strong> /api/system/rate-limits</p>
                </div>
              </CardContent></Card>
            </div>
            {epResult && epResult.summary.endpointsHit > 0 && (
              <Card><CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Flame className="w-4 h-4" />Endpoint Waterfall — All Components Correlated</CardTitle><CardDescription>Browser timing (TTFB, round-trip, DNS, TCP, SSL, transfer) correlated with server middleware, handler, and DB timings per endpoint.</CardDescription></CardHeader><CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="border-b border-slate-200 text-slate-500">
                      <th className="text-left py-2 pr-3 font-medium">Endpoint</th>
                      <th className="text-right py-2 px-1 font-medium">Status</th>
                      <th className="text-right py-2 px-1 font-medium w-[60px]">TTFB</th>
                      <th className="text-right py-2 px-1 font-medium w-[60px]">RT</th>
                      <th className="text-right py-2 px-1 font-medium w-[50px]">MW</th>
                      <th className="text-right py-2 px-1 font-medium w-[50px]">Handler</th>
                      <th className="text-right py-2 px-1 font-medium w-[50px]">DB-W</th>
                      <th className="text-right py-2 px-1 font-medium w-[50px]">Net</th>
                      <th className="text-right py-2 px-1 font-medium w-[50px]">Parse</th>
                      <th className="text-right py-2 px-1 font-medium w-[60px]">Size</th>
                      <th className="text-left py-2 pl-1 font-medium w-[200px]">Waterfall</th>
                    </tr></thead>
                    <tbody>
                      {/* We need spans from the trace result — they're in the DB, so we show what the summary tells us */}
                      <tr className="border-b border-slate-100"><td colSpan={11} className="py-6 text-center text-slate-400">Trace spans persisted. Click "Load History" to view detailed per-endpoint waterfall breakdowns.</td></tr>
                    </tbody>
                  </table>
                </div>
              </CardContent></Card>
            )}

            {/* Summary stats from aggregate endpoint */}
            {epSummary && (
              <Card><CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="w-4 h-4" />Aggregate Summary (All Traces)</CardTitle></CardHeader><CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                  <div><span className="text-slate-500">Total Traces</span><p className="font-semibold">{epSummary.traces.total}</p></div>
                  <div><span className="text-slate-500">Total Spans</span><p className="font-semibold">{epSummary.spans.total}</p><p className="text-xs text-slate-400">{epSummary.spans.errorRate} error rate</p></div>
                  <div><span className="text-slate-500">Avg TTFB</span><p className="font-semibold">{Math.round(((epSummary.spans.aggregates as any)?._avg?.clientTtfbMs ?? 0))}ms</p></div>
                  <div><span className="text-slate-500">Avg Round Trip</span><p className="font-semibold">{Math.round(((epSummary.spans.aggregates as any)?._avg?.clientRoundTripMs ?? 0))}ms</p></div>
                </div>
                {/* Per-endpoint breakdown */}
                {epSummary.byEndpoint.length > 0 && (
                  <div className="mt-4 overflow-x-auto">
                    <p className="text-xs font-medium text-slate-500 mb-2">Per-Endpoint Breakdown</p>
                    <table className="w-full text-xs">
                      <thead><tr className="border-b border-slate-200 text-slate-500">
                        <th className="text-left py-1.5 pr-3">Endpoint</th>
                        <th className="text-right py-1.5 px-2">Calls</th>
                        <th className="text-right py-1.5 px-2">Avg TTFB</th>
                        <th className="text-right py-1.5 px-2">Avg RT</th>
                        <th className="text-right py-1.5 px-2">Min RT</th>
                        <th className="text-right py-1.5 px-2">Max RT</th>
                        <th className="text-right py-1.5 px-2">Avg Handler</th>
                        <th className="text-right py-1.5 px-2">Avg MW</th>
                      </tr></thead>
                      <tbody>
                        {epSummary.byEndpoint.map((ep, i) => (
                          <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                            <td className="py-1.5 pr-3 font-mono text-slate-700 truncate max-w-[280px]" title={ep.endpoint}>{ep.endpoint.replace('/api/', '')}</td>
                            <td className="text-right py-1.5 px-2">{ep._count.id}</td>
                            <td className="text-right py-1.5 px-2">{Math.round(ep._avg.clientTtfbMs ?? 0)}ms</td>
                            <td className="text-right py-1.5 px-2 font-semibold">{Math.round(ep._avg.clientRoundTripMs ?? 0)}ms</td>
                            <td className="text-right py-1.5 px-2 text-emerald-600">{Math.round(ep._min.clientRoundTripMs ?? 0)}ms</td>
                            <td className="text-right py-1.5 px-2 text-red-500">{Math.round(ep._max.clientRoundTripMs ?? 0)}ms</td>
                            <td className="text-right py-1.5 px-2">{Math.round(ep._avg.serverHandlerMs ?? 0)}ms</td>
                            <td className="text-right py-1.5 px-2">{Math.round(ep._avg.serverMiddlewareMs ?? 0)}ms</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent></Card>
            )}

            {/* History: stored traces with spans */}
            {epHistory.length > 0 && (
              <Card><CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><History className="w-4 h-4" />Trace History</CardTitle></CardHeader><CardContent className="space-y-3">
                {epHistory.map((trace: StoredEndpointTrace) => (
                  <div key={trace.id} className="border border-slate-200 rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="font-mono text-[10px]">{trace.traceId.slice(0, 20)}</Badge>
                        <Badge variant="secondary" className="text-[10px]">{trace.initiatedBy}</Badge>
                        <span className="text-[10px] text-slate-400">{new Date(trace.createdAt).toLocaleString()}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-slate-500">{trace.totalEndpointsHit} endpoints</span>
                        <span className={trace.totalEndpointsFail > 0 ? 'text-red-500 font-medium' : 'text-emerald-600'}>{trace.totalEndpointsOk} OK{trace.totalEndpointsFail > 0 ? ` / ${trace.totalEndpointsFail} fail` : ''}</span>
                        <span className="text-slate-500">Avg RT: {Math.round(trace.browserRoundTripAvgMs)}ms</span>
                        {trace.memoryUsedMb > 0 && <span className="text-slate-400">Mem: {trace.memoryUsedMb}MB</span>}
                        {trace.longTaskCount > 0 && <span className="text-amber-500">{trace.longTaskCount} long tasks ({trace.longTaskTotalMs}ms)</span>}
                      </div>
                    </div>
                    {/* Per-span waterfall for this trace */}
                    {trace.spans.length > 0 && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-[10px]">
                          <thead><tr className="border-b border-slate-100 text-slate-400">
                            <th className="text-left py-1 pr-2">Endpoint</th>
                            <th className="text-right py-1 px-1">Code</th>
                            <th className="text-right py-1 px-1">TTFB</th>
                            <th className="text-right py-1 px-1">RT</th>
                            <th className="text-right py-1 px-1">MW</th>
                            <th className="text-right py-1 px-1">Hnd</th>
                            <th className="text-right py-1 px-1">DBW</th>
                            <th className="text-right py-1 px-1">Net</th>
                            <th className="text-right py-1 px-1">Brow</th>
                            <th className="text-right py-1 px-1">Size</th>
                            <th className="text-left py-1 pl-1 w-[180px]">Waterfall</th>
                          </tr></thead>
                          <tbody>
                            {trace.spans.map((span: StoredSpan) => {
                              const maxMs = Math.max(...trace.spans.map(s => s.clientRoundTripMs), 1);
                              const netPct = (span.networkTransitMs / maxMs) * 100;
                              const mwPct = (span.serverMiddlewareMs / maxMs) * 100;
                              const hndPct = (span.serverHandlerMs / maxMs) * 100;
                              const dbwPct = (span.serverDbWriteMs / maxMs) * 100;
                              const parsePct = (span.clientJsonParseMs / maxMs) * 100;
                              const browPct = (span.browserOverheadMs / maxMs) * 100;
                              return (
                                <tr key={span.id} className="border-b border-slate-50 hover:bg-slate-50">
                                  <td className="py-1 pr-2 font-mono text-slate-600 truncate max-w-[200px]" title={span.endpoint}>{span.endpoint.replace('/api/', '')}</td>
                                  <td className={`text-right py-1 px-1 font-medium ${span.statusCode < 400 ? 'text-emerald-600' : 'text-red-500'}`}>{span.statusCode}</td>
                                  <td className="text-right py-1 px-1">{span.clientTtfbMs}</td>
                                  <td className="text-right py-1 px-1 font-semibold">{span.clientRoundTripMs}</td>
                                  <td className="text-right py-1 px-1">{span.serverMiddlewareMs}</td>
                                  <td className="text-right py-1 px-1">{span.serverHandlerMs}</td>
                                  <td className="text-right py-1 px-1">{span.serverDbWriteMs}</td>
                                  <td className="text-right py-1 px-1">{span.networkTransitMs}</td>
                                  <td className="text-right py-1 px-1">{span.browserOverheadMs}</td>
                                  <td className="text-right py-1 px-1">{span.clientTransferSize > 0 ? `${(span.clientTransferSize / 1024).toFixed(1)}K` : '-'}</td>
                                  <td className="py-1 pl-1">
                                    <div className="flex h-3 rounded-sm overflow-hidden bg-slate-100 w-full">
                                      <div className="bg-sky-300" style={{ width: `${netPct}%` }} title={`Net: ${span.networkTransitMs}ms`} />
                                      <div className="bg-amber-400" style={{ width: `${mwPct}%` }} title={`MW: ${span.serverMiddlewareMs}ms`} />
                                      <div className="bg-violet-500" style={{ width: `${hndPct}%` }} title={`Handler: ${span.serverHandlerMs}ms`} />
                                      <div className="bg-emerald-500" style={{ width: `${dbwPct}%` }} title={`DB: ${span.serverDbWriteMs}ms`} />
                                      <div className="bg-orange-400" style={{ width: `${parsePct}%` }} title={`Parse: ${span.clientJsonParseMs}ms`} />
                                      <div className="bg-rose-400" style={{ width: `${browPct}%` }} title={`Browser: ${span.browserOverheadMs}ms`} />
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        {/* Legend */}
                        <div className="flex items-center gap-3 mt-1.5 text-[9px] text-slate-400">
                          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-sky-300" />Network</span>
                          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-amber-400" />Middleware</span>
                          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-violet-500" />Handler</span>
                          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />DB</span>
                          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-orange-400" />Parse</span>
                          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-rose-400" />Browser</span>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </CardContent></Card>
            )}

            {/* Empty state */}
            {!epResult && epHistory.length === 0 && !epTracing && (
              <Card><CardContent className="p-8 text-center">
                <GanttChart className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="text-sm text-slate-500">Click <strong>"Run Full-Site Trace"</strong> to hit every endpoint in the system, capture browser-side Performance API timings (DNS, TCP, SSL, TTFB, round-trip, transfer size), read server-side timing from response headers (middleware, handler, DB), and persist the correlated trace.</p>
                <p className="text-xs text-slate-400 mt-2">All timing data is collected client-side using the Resource Timing API and Server Timing headers, then sent to <code className="bg-slate-100 px-1 rounded">/api/system/observability/ep-trace</code> for persistence and analysis.</p>
              </CardContent></Card>
            )}
          </TabsContent>

          {/* ══════════ FINDINGS TAB ══════════ */}
          <TabsContent value="findings"><Card><CardHeader className="pb-3"><div className="flex items-center justify-between"><div><CardTitle className="text-base">Audit Findings</CardTitle><CardDescription>{findings.length} findings from 11 compliance queries</CardDescription></div><div className="flex gap-2"><Badge variant="outline" className="text-xs">Critical: {findings.filter(f => f.severity === 'critical').length}</Badge><Badge variant="outline" className="text-xs">High: {findings.filter(f => f.severity === 'high').length}</Badge></div></div></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><Table><TableHeader><TableRow className="bg-slate-50"><TableHead className="w-[180px]">Ref</TableHead><TableHead className="w-[80px]">Severity</TableHead><TableHead className="w-[100px]">Status</TableHead><TableHead className="w-[100px]">Risk</TableHead><TableHead>Title</TableHead><TableHead className="w-[60px] text-right">Rows</TableHead><TableHead className="w-[80px] text-right">MTTR</TableHead></TableRow></TableHeader><TableBody>{findings.map(f => (
                  <TableRow key={f.finding_ref} className="hover:bg-slate-50/50">
                    <TableCell className="font-mono text-xs">{f.finding_ref.slice(-12)}</TableCell>
                    <TableCell><Badge variant="outline" className={`text-xs ${severityColor(f.severity)}`}>{f.severity}</Badge></TableCell>
                    <TableCell><div className="flex items-center gap-1.5">{statusIcon(f.status)}<span className="text-xs capitalize">{f.status.replace('_', ' ')}</span></div></TableCell>
                    <TableCell className="text-xs text-slate-600 max-w-[100px] truncate">{categoryLabel(f.risk_category)}</TableCell>
                    <TableCell className="text-sm max-w-[300px] truncate">{f.title}</TableCell>
                    <TableCell className="text-right text-xs font-mono">{f.affected_row_count}</TableCell>
                    <TableCell className="text-right text-xs font-mono">{f.mttr_hours ? `${f.mttr_hours}h` : '-'}</TableCell>
                  </TableRow>
                ))}</TableBody></Table></div></CardContent></Card></TabsContent>

          {/* ══════════ MTTR TAB ══════════ */}
          <TabsContent value="mttr"><div className="grid gap-4 lg:grid-cols-2">
            <Card><CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><TrendingDown className="w-4 h-4" /> MTTR by Risk Category</CardTitle><CardDescription>Mean time to resolution in hours</CardDescription></CardHeader><CardContent className="space-y-3">
              {mttr?.report.risk_categories.map(cat => { const pct = cat.total > 0 ? (cat.resolved / cat.total) * 100 : 0; return (
                <div key={cat.category} className="space-y-1"><div className="flex items-center justify-between text-sm"><span className="text-slate-700 font-medium">{categoryLabel(cat.category)}</span><span className="text-xs text-slate-500">{cat.resolved}/{cat.total} resolved</span></div><div className="flex items-center gap-3"><Progress value={pct} className="h-2 flex-1" /><span className="text-xs font-mono text-slate-600 w-16 text-right">{cat.avg_mttr_hours}h avg</span></div></div>
              ); })}
            </CardContent></Card>
            <Card><CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Activity className="w-4 h-4" /> 7-Day Trend</CardTitle><CardDescription>Daily MTTR and finding velocity</CardDescription></CardHeader><CardContent className="space-y-2">
              {mttr?.trend.map(day => (
                <div key={day.date} className="flex items-center gap-3 text-sm"><span className="text-xs font-mono text-slate-500 w-20">{day.date.slice(5)}</span><div className="flex-1 flex items-center gap-2"><div className="flex-1 bg-slate-100 rounded-full h-2 relative overflow-hidden"><div className="bg-slate-600 h-full rounded-full" style={{ width: `${(day.avg_mttr / 30) * 100}%` }} /></div><span className="text-xs font-mono w-10 text-right">{day.avg_mttr}h</span></div><div className="flex items-center gap-1 text-xs text-slate-500 w-20"><span className="text-amber-600">+{day.new_findings}</span><span>/</span><span className="text-emerald-600">-{day.resolved}</span></div></div>
              ))}
            </CardContent></Card>
          </div></TabsContent>

          {/* ══════════ EDI PROFILES TAB ══════════ */}
          <TabsContent value="profiles"><Card><CardHeader className="pb-3"><div className="flex items-center justify-between"><div><CardTitle className="text-base">EDI Connection Profiles</CardTitle><CardDescription>{profiles.filter(p => p.compliant).length}/{profiles.length} partners compliant</CardDescription></div></div></CardHeader><CardContent className="p-0"><Table><TableHeader><TableRow className="bg-slate-50"><TableHead>Partner</TableHead><TableHead>Standard</TableHead><TableHead>Encryption</TableHead><TableHead>Protocol</TableHead><TableHead>Status</TableHead><TableHead>Issues</TableHead></TableRow></TableHeader><TableBody>{profiles.map(p => (
                <TableRow key={p.partner_id} className="hover:bg-slate-50/50">
                  <TableCell className="font-medium">{p.partner_name}</TableCell>
                  <TableCell><Badge variant="outline" className="text-xs font-mono">{p.edi_standard}</Badge></TableCell>
                  <TableCell>{p.encrypted ? <Lock className="w-4 h-4 text-emerald-600" /> : <Unlock className="w-4 h-4 text-red-500" />}</TableCell>
                  <TableCell className="text-xs font-mono">{p.protocol}</TableCell>
                  <TableCell><Badge className={`text-xs ${p.compliant ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>{p.compliant ? 'Compliant' : 'Non-Compliant'}</Badge></TableCell>
                  <TableCell className="text-xs text-red-600">{p.issues.join('; ') || '-'}</TableCell>
                </TableRow>
              ))}</TableBody></Table></CardContent></Card></TabsContent>

          {/* ══════════ POLICIES TAB ══════════ */}
          <TabsContent value="policies"><Card><CardHeader className="pb-3"><div className="flex items-center justify-between"><div><CardTitle className="text-base">Masking Policies</CardTitle><CardDescription>{policies.filter(p => p.enabled).length} active / {policies.filter(p => p.auto_generated).length} auto-generated</CardDescription></div><Button size="sm" variant="outline" onClick={async () => { await fetch('/api/compliance/remediate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'dry-run' }) }); await fetchData(); }}><Wrench className="mr-1.5 h-3.5 w-3.5" />Generate Policies</Button></div></CardHeader><CardContent className="p-0"><Table><TableHeader><TableRow className="bg-slate-50"><TableHead>Policy Name</TableHead><TableHead>Field</TableHead><TableHead>Action</TableHead><TableHead>GDPR</TableHead><TableHead>Enabled</TableHead><TableHead>Source</TableHead></TableRow></TableHeader><TableBody>{policies.map(p => (
                <TableRow key={p.id} className="hover:bg-slate-50/50">
                  <TableCell className="font-mono text-xs">{p.name}</TableCell>
                  <TableCell className="text-xs font-mono">{p.field_name}</TableCell>
                  <TableCell><Badge variant="outline" className="text-xs">{p.action}</Badge></TableCell>
                  <TableCell className="text-xs">{p.gdpr_article}</TableCell>
                  <TableCell><Badge className={`text-xs ${p.enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}>{p.enabled ? 'Active' : 'Staged'}</Badge></TableCell>
                  <TableCell>{p.auto_generated ? <Badge variant="outline" className="text-xs">Auto</Badge> : <Badge variant="outline" className="text-xs">Manual</Badge>}</TableCell>
                </TableRow>
              ))}</TableBody></Table></CardContent></Card></TabsContent>

          {/* ══════════ API ENDPOINTS TAB ══════════ */}
          <TabsContent value="endpoints"><Card><CardHeader className="pb-3"><CardTitle className="text-base">API Endpoints</CardTitle><CardDescription>All compliance swarm endpoints available to the frontend</CardDescription></CardHeader><CardContent className="space-y-2">
            {[
              { method: 'GET', path: '/api/system/correlated-trace', desc: '[FRONTEND TRACE] API info and availability check', live: true },
              { method: 'POST', path: '/api/system/correlated-trace', desc: '[FRONTEND TRACE] Ingest browser Resource Timing + correlate with server, persist', live: true },
              { method: 'GET', path: '/api/system/correlated-trace?mode=history', desc: '[FRONTEND TRACE] Retrieve stored correlated traces', live: true },
              { method: 'GET', path: '/api/system/correlated-trace?mode=summary', desc: '[FRONTEND TRACE] Aggregated stats (avg TTFB, per-path breakdown)', live: true },
              { method: 'GET', path: '/api/system/ping', desc: '[CORRELATED] Full client+server trace with Performance API timing', live: true },
              { method: 'GET', path: '/api/system/ping?trace=history', desc: '[CORRELATED] Load stored trace history from DB', live: true },
              { method: 'POST', path: '/api/system/ping', desc: '[CORRELATED] Write event + browser timing to DB', live: true },
              { method: 'GET', path: '/api/compliance/health', desc: 'Health check + tool status', live: false },
              { method: 'GET', path: '/api/compliance/findings', desc: 'List audit findings', live: false },
              { method: 'GET', path: '/api/compliance/mttr', desc: 'MTTR report by risk category + 7-day trend', live: false },
              { method: 'GET', path: '/api/compliance/policies', desc: 'List masking policies', live: false },
              { method: 'GET', path: '/api/compliance/profiles', desc: 'EDI connection profiles audit', live: false },
              { method: 'POST', path: '/api/compliance/audit', desc: 'Run full EDI compliance audit', live: false },
              { method: 'POST', path: '/api/compliance/remediate', desc: 'Generate remediation policies', live: false },
              { method: 'GET', path: '/api/system/observability/ep-trace', desc: 'Full-site observability trace (all endpoints)', live: true },
              { method: 'GET', path: '/api/system/observability/ep-trace?mode=summary', desc: 'Aggregate stats across all traces', live: false },
              { method: 'GET', path: '/health/live', desc: 'Liveness probe (no DB)', live: false },
              { method: 'GET', path: '/health/ready', desc: 'Readiness probe (DB + deps check)', live: false },
              { method: 'POST', path: '/api/auth/login', desc: 'Authenticate, get JWT + API key', live: false },
              { method: 'GET', path: '/api/auth/me', desc: 'Current user profile (auth required)', live: false },
              { method: 'POST', path: '/api/auth/rotate', desc: 'Rotate API key (auth required)', live: false },
              { method: 'GET', path: '/api/system/rate-limits', desc: 'Rate limiter config + live bucket stats', live: false },
              { method: 'GET', path: '/api/system/config', desc: 'Runtime config validation', live: false },
            ].map(ep => (
              <div key={ep.path + ep.method} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-slate-50">
                <Badge variant="outline" className={`font-mono text-xs w-14 justify-center ${ep.method === 'GET' ? 'text-emerald-700 border-emerald-300' : 'text-blue-700 border-blue-300'}`}>{ep.method}</Badge>
                <code className={`text-sm font-mono flex-1 ${ep.live ? 'text-slate-900 font-semibold' : 'text-slate-800'}`}>{ep.path}</code>
                {ep.live && <Badge className="text-[9px] bg-emerald-100 text-emerald-700 border-emerald-200">{ep.desc.includes('FRONTEND TRACE') ? 'FRONTEND TRACE' : 'CORRELATED'}</Badge>}
                <span className="text-xs text-slate-500 max-w-[250px] truncate hidden sm:inline">{ep.desc}</span>
              </div>
            ))}
            <Separator className="my-3" />
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3"><p className="text-xs text-emerald-800 font-medium">CORRELATED endpoints capture browser Performance API timings (fetch start, TTFB, JSON parse, render) and join them with server-side middleware/handler/DB traces via a shared request ID. All traces are persisted in SQLite. The <strong>Observe</strong> tab runs a full-site trace across ALL endpoints.</p></div>
          </CardContent></Card></TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
