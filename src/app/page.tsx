'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Shield, ShieldAlert, ShieldCheck, Clock, Activity,
  FileKey, FileSearch, Wrench, Timer, AlertTriangle,
  CheckCircle2, XCircle, Loader2, RefreshCw, Lock,
  Unlock, TrendingDown, Server, Database,
  Globe, ArrowRight, Zap, Layers, Monitor,
  Send, CircuitBoard, Wifi, Check, Fingerprint,
  ArrowDownLeft, Network, Eye, History, BarChart3,
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
  createdAt: string;
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
    const nav = navigator as Record<string, unknown>;
    const connection = (nav.connection as Record<string, unknown>) ?? {};
    const connectionType = (connection.effectiveType as string) ?? 'unknown';

    // Try to get navigation type
    let navigationType = 'unknown';
    try {
      const entries = performance.getEntriesByType?.('navigation') as Array<{ type: string }> | undefined;
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
      (data as Record<string, unknown>)._clientTimingRaw = clientTimingData;
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

  const overall = mttr?.report.overall;
  const openCritical = findings.filter(f => f.severity === 'critical' && (f.status === 'open' || f.status === 'in_progress')).length;

  // ── Build waterfall rows from pingData ──
  const buildWaterfall = (data: PingData): WaterfallRow[] => {
    const clientRaw = (data as Record<string, unknown>)._clientTimingRaw as Record<string, number> | undefined;
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
    ? ((pingData as Record<string, unknown>)._clientTimingRaw as Record<string, number>)?.roundTripMs
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
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="pipeline" className="text-xs sm:text-sm">Pipeline</TabsTrigger>
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
                    <div className="flex justify-between"><span className="text-slate-500">TTFB (first byte)</span><span className="font-mono font-bold">{pingData.client.ttfbMs ?? 0}ms</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">JSON parse</span><span className="font-mono">{pingData.client.jsonParseMs ?? 0}ms</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Total round-trip</span><span className="font-mono font-bold text-sky-700">{pingTotalMs}ms</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Navigation type</span><span className="font-mono">{pingData.client.navigationType ?? 'n/a'}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Connection</span><span className="font-mono">{pingData.client.connectionType ?? 'n/a'}</span></div>
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
            ].map(ep => (
              <div key={ep.path + ep.method} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-slate-50">
                <Badge variant="outline" className={`font-mono text-xs w-14 justify-center ${ep.method === 'GET' ? 'text-emerald-700 border-emerald-300' : 'text-blue-700 border-blue-300'}`}>{ep.method}</Badge>
                <code className={`text-sm font-mono flex-1 ${ep.live ? 'text-slate-900 font-semibold' : 'text-slate-800'}`}>{ep.path}</code>
                {ep.live && <Badge className="text-[9px] bg-emerald-100 text-emerald-700 border-emerald-200">CORRELATED</Badge>}
                <span className="text-xs text-slate-500 max-w-[250px] truncate hidden sm:inline">{ep.desc}</span>
              </div>
            ))}
            <Separator className="my-3" />
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3"><p className="text-xs text-emerald-800 font-medium">CORRELATED endpoints capture browser Performance API timings (fetch start, TTFB, JSON parse, render) and join them with server-side middleware/handler/DB traces via a shared request ID. All traces are persisted in SQLite.</p></div>
          </CardContent></Card></TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
