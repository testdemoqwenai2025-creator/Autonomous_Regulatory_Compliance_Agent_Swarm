#!/bin/bash
# This script writes the page.tsx file

cat > /home/z/my-project/src/app/page.tsx << 'ENDOFFILE'
'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Shield, ShieldAlert, ShieldCheck, Clock, Activity,
  FileKey, FileSearch, Wrench, Timer, AlertTriangle,
  CheckCircle2, XCircle, Loader2, RefreshCw, Lock,
  Unlock, ExternalLink, TrendingDown, Server, Database,
  Globe, ArrowRight, Zap, Layers, Monitor, ArrowDown,
  Send, CircuitBoard, HardDrive, Wifi, Check, Fingerprint,
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

// ── Types ──────────────────────────────────────────────────────

interface Finding {
  finding_ref: string;
  severity: string;
  status: string;
  risk_category: string;
  title: string;
  affected_row_count: number;
  detected_at: string;
  mttr_hours: number | null;
  current_phase: string;
}

interface Profile {
  partner_id: string;
  partner_name: string;
  edi_standard: string;
  encrypted: boolean;
  protocol: string;
  last_audit: string;
  compliant: boolean;
  issues: string[];
}

interface Policy {
  id: string;
  name: string;
  field_name: string;
  action: string;
  category: string | null;
  gdpr_article: string;
  enabled: boolean;
  auto_generated: boolean;
}

interface MTTRCategory {
  category: string;
  total: number;
  resolved: number;
  avg_mttr_hours: number;
  p95_mttr_hours: number;
  median_mttr_hours: number;
}

interface MTTRTrend {
  date: string;
  avg_mttr: number;
  new_findings: number;
  resolved: number;
}

interface MTTRData {
  report: {
    risk_categories: MTTRCategory[];
    overall: {
      total_findings: number;
      resolved_findings: number;
      open_findings: number;
      avg_mttr_hours: number;
      p95_mttr_hours: number;
      median_mttr_hours: number;
      compliance_rate: number;
    };
  };
  trend: MTTRTrend[];
}

interface PingTrace {
  browser: { status: string; note: string };
  middleware: {
    status: string;
    requestId: string;
    timestamp: string;
    clientIp: string;
    userAgent: string;
    headersInjected: string[];
  };
  api_handler: {
    status: string;
    endpoint: string;
    method: string;
    timestamp: string;
    totalLatencyMs: number;
  };
  database: {
    status: string;
    engine: string;
    dbWriteLatencyMs: number;
    dbReadLatencyMs: number;
    recordsWritten: number;
    recordsRead: number;
  };
}

interface PingData {
  status: string;
  message: string;
  trace: PingTrace;
  stats: {
    totalTrackedEvents: number;
    totalHealthChecks: number;
    recentEvents: Array<{
      id: string;
      path: string;
      method: string;
      statusCode: number;
      dbReadMs: number | null;
      createdAt: string;
    }>;
    healthByComponent: Array<{
      component: string;
      status: string;
      _count: Record<string, number>;
      _max: Record<string, string | null>;
    }>;
  };
  timing: {
    middlewareOverheadMs: number | null;
    dbWriteMs: number;
    dbReadMs: number;
    totalHandlerMs: number;
  };
}

// ── Helpers ─────────────────────────────────────────────────────

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

// ── Skeleton components ─────────────────────────────────────────

function KPISkeleton() {
  return <Skeleton className="h-24 w-full rounded-lg" />;
}

// ── KPI Card ────────────────────────────────────────────────────

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
          <div className="rounded-lg bg-slate-100 p-2.5">
            <Icon className="w-5 h-5 text-slate-600" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Pipeline Flow Diagram ───────────────────────────────────────

function PipelineNode({ icon: Icon, label, status, detail, borderColor, bg, latency }: {
  icon: React.ElementType; label: string; status: string; detail: string; borderColor: string; bg: string; latency?: string;
}) {
  return (
    <div className="flex flex-col items-center text-center min-w-[110px]">
      <div className={`${borderColor} ${bg} rounded-xl p-3 shadow-sm border-2 transition-all`}>
        <Icon className="w-5 h-5" />
      </div>
      <p className="mt-2 text-xs font-semibold text-slate-800">{label}</p>
      <Badge variant="outline" className={`mt-1 text-[10px] ${status === 'intercepted' || status === 'processed' || status === 'read_write_verified' || status === 'request_sent' ? 'border-emerald-300 text-emerald-700 bg-emerald-50' : 'border-slate-300 text-slate-500'}`}>
        {status.replace(/_/g, ' ')}
      </Badge>
      <p className="mt-1 text-[10px] text-slate-500 max-w-[130px]">{detail}</p>
      {latency && <p className="mt-0.5 text-[10px] font-mono text-slate-400">{latency}</p>}
    </div>
  );
}

function FlowArrow() {
  return <ArrowRight className="w-5 h-5 text-slate-300 flex-shrink-0 mt-1" />;
}

// ── Main Dashboard ──────────────────────────────────────────────

export default function ComplianceDashboard() {
  const [findings, setFindings] = useState<Finding[]>([]);
  const [mttr, setMttr] = useState<MTTRData | null>(null);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [auditing, setAuditing] = useState(false);

  // Pipeline state
  const [pingData, setPingData] = useState<PingData | null>(null);
  const [pingLoading, setPingLoading] = useState(false);
  const [pingError, setPingError] = useState<string | null>(null);
  const [postPayload, setPostPayload] = useState('');
  const [postResult, setPostResult] = useState<string | null>(null);
  const [responseHeaders, setResponseHeaders] = useState<Record<string, string>>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [fRes, mRes, pRes, prRes] = await Promise.all([
        fetch('/api/compliance/findings'),
        fetch('/api/compliance/mttr'),
        fetch('/api/compliance/policies'),
        fetch('/api/compliance/profiles'),
      ]);
      const fData = await fRes.json();
      const mData = await mRes.json();
      const pData = await pRes.json();
      const prData = await prRes.json();
      setFindings(fData.findings);
      setMttr(mData);
      setPolicies(pData.policies);
      setProfiles(prData.profiles);
    } catch (e) {
      console.error('Failed to fetch compliance data:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const runAudit = async () => {
    setAuditing(true);
    try {
      const res = await fetch('/api/compliance/audit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      const data = await res.json();
      if (data.status === 'audit_complete') await fetchData();
    } catch (e) { console.error(e); }
    finally { setAuditing(false); }
  };

  // ── Pipeline: call /api/system/ping (GET) ──
  const runPing = useCallback(async () => {
    setPingLoading(true);
    setPingError(null);
    setPostResult(null);
    try {
      const res = await fetch('/api/system/ping');
      // Capture response headers to prove middleware set them
      const headers: Record<string, string> = {};
      res.headers.forEach((v, k) => { headers[k] = v; });
      setResponseHeaders(headers);
      const data: PingData = await res.json();
      setPingData(data);
    } catch (e) {
      setPingError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setPingLoading(false);
    }
  }, []);

  // ── Pipeline: call /api/system/ping (POST) ──
  const runPostPing = useCallback(async () => {
    setPingLoading(true);
    setPingError(null);
    setPostResult(null);
    try {
      const payload = postPayload.trim() ? JSON.parse(postPayload) : { test: true, timestamp: new Date().toISOString() };
      const res = await fetch('/api/system/ping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      setPostResult(JSON.stringify(data, null, 2));
      // Also refresh GET data to see the new event
      await runPing();
    } catch (e) {
      setPingError(e instanceof Error ? e.message : 'POST failed');
    } finally {
      setPingLoading(false);
    }
  }, [postPayload, runPing]);

  const overall = mttr?.report.overall;
  const openCritical = findings.filter(f => f.severity === 'critical' && (f.status === 'open' || f.status === 'in_progress')).length;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/80 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900">
                <Shield className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-slate-900 leading-tight">Maritime Compliance Swarm</h1>
                <p className="text-xs text-slate-500">GDPR / PII / EDI Governance Platform</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
                <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button size="sm" onClick={runAudit} disabled={auditing}>
                {auditing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <FileSearch className="mr-1.5 h-3.5 w-3.5" />}
                Run Audit
              </Button>
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
            <KPICard icon={Database} label="Active Policies" value={policies.filter(p => p.enabled).length} sub={`${policies.length} total`} />
          </div>
        )}

        {/* Tool Status Bar */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2 text-sm"><Server className="w-4 h-4 text-slate-400" /><span className="font-medium text-slate-700">Swarm Tools:</span></div>
              {[
                { name: 'PII Anonymiser', icon: FileKey, lang: 'Python' },
                { name: 'EDI Auditor', icon: FileSearch, lang: 'Python' },
                { name: 'Remediation', icon: Wrench, lang: 'Python' },
                { name: 'MTTR Tracker', icon: Timer, lang: 'Go' },
              ].map(tool => (
                <Badge key={tool.name} variant="outline" className="gap-1.5 font-mono text-xs">
                  <tool.icon className="w-3 h-3" />
                  {tool.name}
                  <span className="text-slate-400">({tool.lang})</span>
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

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

          {/* ═══════════════════════ PIPELINE TAB ═══════════════════════ */}
          <TabsContent value="pipeline" className="space-y-4">
            {/* Hero: flow diagram */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <CircuitBoard className="w-4 h-4" />
                      Endpoint Communication Pipeline
                    </CardTitle>
                    <CardDescription>Real-time proof: Browser → Middleware → API Handler → Database → Response</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={runPing} disabled={pingLoading}>
                      {pingLoading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Zap className="mr-1.5 h-3.5 w-3.5" />}
                      Send GET /api/system/ping
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Flow Diagram */}
                <div className="flex flex-wrap items-start justify-center gap-2 sm:gap-4">
                  <PipelineNode
                    icon={Globe}
                    label="Browser"
                    status={pingData?.trace.browser.status ?? 'idle'}
                    detail={pingData?.trace.browser.note ?? 'Click button to send request'}
                    borderColor={pingData ? 'border-emerald-400' : 'border-slate-200'}
                    bg={pingData ? 'bg-emerald-50' : 'bg-white'}
                  />
                  <FlowArrow />
                  <PipelineNode
                    icon={Layers}
                    label="Middleware"
                    status={pingData?.trace.middleware.status ?? 'idle'}
                    detail={pingData ? `ID: ...${pingData.trace.middleware.requestId.slice(-8)}` : 'Waiting for request'}
                    borderColor={pingData?.trace.middleware.status === 'intercepted' ? 'border-emerald-400' : 'border-slate-200'}
                    bg={pingData?.trace.middleware.status === 'intercepted' ? 'bg-emerald-50' : 'bg-white'}
                    latency={pingData?.timing.middlewareOverheadMs ? `${pingData.timing.middlewareOverheadMs}ms` : undefined}
                  />
                  <FlowArrow />
                  <PipelineNode
                    icon={Server}
                    label="API Handler"
                    status={pingData?.trace.api_handler.status ?? 'idle'}
                    detail={pingData?.trace.api_handler.endpoint ?? '/api/system/ping'}
                    borderColor={pingData?.trace.api_handler.status === 'processed' ? 'border-emerald-400' : 'border-slate-200'}
                    bg={pingData?.trace.api_handler.status === 'processed' ? 'bg-emerald-50' : 'bg-white'}
                    latency={pingData?.timing.totalHandlerMs ? `${pingData.timing.totalHandlerMs}ms` : undefined}
                  />
                  <FlowArrow />
                  <PipelineNode
                    icon={Database}
                    label="Database"
                    status={pingData?.trace.database.status ?? 'idle'}
                    detail={pingData?.trace.database.engine ?? 'SQLite + Prisma'}
                    borderColor={pingData?.trace.database.status === 'read_write_verified' ? 'border-emerald-400' : 'border-slate-200'}
                    bg={pingData?.trace.database.status === 'read_write_verified' ? 'bg-emerald-50' : 'bg-white'}
                    latency={pingData ? `W:${pingData.timing.dbWriteMs}ms R:${pingData.timing.dbReadMs}ms` : undefined}
                  />
                  <FlowArrow />
                  <PipelineNode
                    icon={Monitor}
                    label="Response"
                    status={pingData ? 'delivered' : 'idle'}
                    detail={pingData?.message?.slice(0, 40) ?? 'Awaiting response'}
                    borderColor={pingData ? 'border-emerald-400' : 'border-slate-200'}
                    bg={pingData ? 'bg-emerald-50' : 'bg-white'}
                  />
                </div>

                {pingError && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                    <AlertTriangle className="w-4 h-4 inline mr-2" />
                    {pingError}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Detail panels: shown after ping */}
            {pingData && (
              <div className="grid gap-4 lg:grid-cols-2">
                {/* Middleware Detail */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2"><Layers className="w-4 h-4" /> Middleware Detail</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-xs">
                    <div className="flex justify-between"><span className="text-slate-500">Request ID</span><span className="font-mono text-slate-800">{pingData.trace.middleware.requestId}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Intercepted</span><Badge variant="outline" className="text-[10px]">{pingData.trace.middleware.timestamp}</Badge></div>
                    <div className="flex justify-between"><span className="text-slate-500">Client IP</span><span className="font-mono text-slate-800">{pingData.trace.middleware.clientIp}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">User-Agent</span><span className="font-mono text-slate-800 max-w-[200px] truncate" title={pingData.trace.middleware.userAgent}>{pingData.trace.middleware.userAgent.slice(0, 60)}...</span></div>
                    <Separator className="my-2" />
                    <p className="text-slate-500">Headers injected by middleware:</p>
                    <div className="flex flex-wrap gap-1">
                      {pingData.trace.middleware.headersInjected.map(h => (
                        <Badge key={h} variant="outline" className="text-[10px] font-mono border-slate-300">{h}</Badge>
                      ))}
                    </div>
                    <Separator className="my-2" />
                    <p className="text-slate-500">Response headers (visible in browser):</p>
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(responseHeaders).filter(([k]) => k.startsWith('x-')).map(([k, v]) => (
                        <Badge key={k} variant="outline" className="text-[10px] font-mono border-slate-300">{k}: {typeof v === 'string' ? v.slice(0, 20) : v}</Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Database Detail */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2"><Database className="w-4 h-4" /> Database Detail</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-xs">
                    <div className="flex justify-between"><span className="text-slate-500">Engine</span><span className="font-mono text-slate-800">{pingData.trace.database.engine}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Records Written</span><span className="font-mono text-emerald-700 font-bold">{pingData.trace.database.recordsWritten}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Records Read</span><span className="font-mono text-emerald-700 font-bold">{pingData.trace.database.recordsRead}</span></div>
                    <Separator className="my-2" />
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-slate-50 rounded-lg p-2"><p className="text-slate-500">DB Write</p><p className="text-lg font-bold font-mono text-slate-800">{pingData.timing.dbWriteMs}<span className="text-xs font-normal">ms</span></p></div>
                      <div className="bg-slate-50 rounded-lg p-2"><p className="text-slate-500">DB Read</p><p className="text-lg font-bold font-mono text-slate-800">{pingData.timing.dbReadMs}<span className="text-xs font-normal">ms</span></p></div>
                      <div className="bg-slate-50 rounded-lg p-2"><p className="text-slate-500">Middleware</p><p className="text-lg font-bold font-mono text-slate-800">{pingData.timing.middlewareOverheadMs ?? '-'}<span className="text-xs font-normal">ms</span></p></div>
                      <div className="bg-slate-50 rounded-lg p-2"><p className="text-slate-500">Total Handler</p><p className="text-lg font-bold font-mono text-slate-800">{pingData.timing.totalHandlerMs}<span className="text-xs font-normal">ms</span></p></div>
                    </div>
                    <Separator className="my-2" />
                    <p className="text-slate-500">Tracked Events: <span className="font-bold text-slate-800">{pingData.stats.totalTrackedEvents}</span> | Health Checks: <span className="font-bold text-slate-800">{pingData.stats.totalHealthChecks}</span></p>
                  </CardContent>
                </Card>

                {/* POST Test */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2"><Send className="w-4 h-4" /> POST Test (Browser → Middleware → API → DB Write)</CardTitle>
                    <CardDescription>Send a custom payload through the full pipeline. The event is persisted in the database.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex gap-2">
                      <Input
                        placeholder='{"message": "hello", "from": "browser"}'
                        value={postPayload}
                        onChange={e => setPostPayload(e.target.value)}
                        className="font-mono text-xs"
                      />
                      <Button size="sm" onClick={runPostPing} disabled={pingLoading}>
                        <Send className="mr-1.5 h-3.5 w-3.5" /> POST
                      </Button>
                    </div>
                    {postResult && (
                      <pre className="bg-slate-900 text-emerald-400 rounded-lg p-3 text-[11px] font-mono overflow-x-auto max-h-48 overflow-y-auto">
                        {postResult}
                      </pre>
                    )}
                  </CardContent>
                </Card>

                {/* Recent Events */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2"><Activity className="w-4 h-4" /> Recent DB Events (proves persistence)</CardTitle>
                    <CardDescription>These are real records read from SQLite, written by previous GET/POST calls.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="max-h-64 overflow-y-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-slate-50">
                            <TableHead className="text-xs">Event ID</TableHead>
                            <TableHead className="text-xs">Path</TableHead>
                            <TableHead className="text-xs">Method</TableHead>
                            <TableHead className="text-xs">Status</TableHead>
                            <TableHead className="text-xs">DB Read</TableHead>
                            <TableHead className="text-xs">Created</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
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
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          {/* ─── Findings Tab ─── */}
          <TabsContent value="findings">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Audit Findings</CardTitle>
                    <CardDescription>{findings.length} findings from 11 compliance queries</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Badge variant="outline" className="text-xs">Critical: {findings.filter(f => f.severity === 'critical').length}</Badge>
                    <Badge variant="outline" className="text-xs">High: {findings.filter(f => f.severity === 'high').length}</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50">
                        <TableHead className="w-[180px]">Ref</TableHead>
                        <TableHead className="w-[80px]">Severity</TableHead>
                        <TableHead className="w-[100px]">Status</TableHead>
                        <TableHead className="w-[100px]">Risk</TableHead>
                        <TableHead>Title</TableHead>
                        <TableHead className="w-[60px] text-right">Rows</TableHead>
                        <TableHead className="w-[80px] text-right">MTTR</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {findings.map(f => (
                        <TableRow key={f.finding_ref} className="hover:bg-slate-50/50">
                          <TableCell className="font-mono text-xs">{f.finding_ref.slice(-12)}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`text-xs ${severityColor(f.severity)}`}>{f.severity}</Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              {statusIcon(f.status)}
                              <span className="text-xs capitalize">{f.status.replace('_', ' ')}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs text-slate-600 max-w-[100px] truncate">{categoryLabel(f.risk_category)}</TableCell>
                          <TableCell className="text-sm max-w-[300px] truncate">{f.title}</TableCell>
                          <TableCell className="text-right text-xs font-mono">{f.affected_row_count}</TableCell>
                          <TableCell className="text-right text-xs font-mono">{f.mttr_hours ? `${f.mttr_hours}h` : '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ─── MTTR Tab ─── */}
          <TabsContent value="mttr">
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2"><TrendingDown className="w-4 h-4" /> MTTR by Risk Category</CardTitle>
                  <CardDescription>Mean time to resolution in hours</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {mttr?.report.risk_categories.map(cat => {
                    const pct = cat.total > 0 ? (cat.resolved / cat.total) * 100 : 0;
                    return (
                      <div key={cat.category} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-slate-700 font-medium">{categoryLabel(cat.category)}</span>
                          <span className="text-xs text-slate-500">{cat.resolved}/{cat.total} resolved</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <Progress value={pct} className="h-2 flex-1" />
                          <span className="text-xs font-mono text-slate-600 w-16 text-right">{cat.avg_mttr_hours}h avg</span>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2"><Activity className="w-4 h-4" /> 7-Day Trend</CardTitle>
                  <CardDescription>Daily MTTR and finding velocity</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {mttr?.trend.map(day => (
                    <div key={day.date} className="flex items-center gap-3 text-sm">
                      <span className="text-xs font-mono text-slate-500 w-20">{day.date.slice(5)}</span>
                      <div className="flex-1 flex items-center gap-2">
                        <div className="flex-1 bg-slate-100 rounded-full h-2 relative overflow-hidden">
                          <div className="bg-slate-600 h-full rounded-full" style={{ width: `${(day.avg_mttr / 30) * 100}%` }} />
                        </div>
                        <span className="text-xs font-mono w-10 text-right">{day.avg_mttr}h</span>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-slate-500 w-20">
                        <span className="text-amber-600">+{day.new_findings}</span>
                        <span>/</span>
                        <span className="text-emerald-600">-{day.resolved}</span>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ─── EDI Profiles Tab ─── */}
          <TabsContent value="profiles">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">EDI Connection Profiles</CardTitle>
                    <CardDescription>{profiles.filter(p => p.compliant).length}/{profiles.length} partners compliant</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead>Partner</TableHead>
                      <TableHead>Standard</TableHead>
                      <TableHead>Encryption</TableHead>
                      <TableHead>Protocol</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Issues</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {profiles.map(p => (
                      <TableRow key={p.partner_id} className="hover:bg-slate-50/50">
                        <TableCell className="font-medium">{p.partner_name}</TableCell>
                        <TableCell><Badge variant="outline" className="text-xs font-mono">{p.edi_standard}</Badge></TableCell>
                        <TableCell>
                          {p.encrypted ? <Lock className="w-4 h-4 text-emerald-600" /> : <Unlock className="w-4 h-4 text-red-500" />}
                        </TableCell>
                        <TableCell className="text-xs font-mono">{p.protocol}</TableCell>
                        <TableCell>
                          <Badge className={`text-xs ${p.compliant ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                            {p.compliant ? 'Compliant' : 'Non-Compliant'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-red-600">{p.issues.join('; ') || '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ─── Policies Tab ─── */}
          <TabsContent value="policies">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Masking Policies</CardTitle>
                    <CardDescription>{policies.filter(p => p.enabled).length} active / {policies.filter(p => p.auto_generated).length} auto-generated</CardDescription>
                  </div>
                  <Button size="sm" variant="outline" onClick={async () => {
                    await fetch('/api/compliance/remediate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'dry-run' }) });
                    await fetchData();
                  }}>
                    <Wrench className="mr-1.5 h-3.5 w-3.5" /> Generate Policies
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead>Policy Name</TableHead>
                      <TableHead>Field</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>GDPR</TableHead>
                      <TableHead>Enabled</TableHead>
                      <TableHead>Source</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {policies.map(p => (
                      <TableRow key={p.id} className="hover:bg-slate-50/50">
                        <TableCell className="font-mono text-xs">{p.name}</TableCell>
                        <TableCell className="text-xs font-mono">{p.field_name}</TableCell>
                        <TableCell><Badge variant="outline" className="text-xs">{p.action}</Badge></TableCell>
                        <TableCell className="text-xs">{p.gdpr_article}</TableCell>
                        <TableCell>
                          <Badge className={`text-xs ${p.enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}>
                            {p.enabled ? 'Active' : 'Staged'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {p.auto_generated ? <Badge variant="outline" className="text-xs">Auto</Badge> : <Badge variant="outline" className="text-xs">Manual</Badge>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ─── API Endpoints Tab ─── */}
          <TabsContent value="endpoints">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">API Endpoints</CardTitle>
                <CardDescription>All compliance swarm endpoints available to the frontend</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {[
                  { method: 'GET', path: '/api/system/ping', desc: '[LIVE] Full-stack pipeline health — proves browser/middleware/API/DB communication' },
                  { method: 'POST', path: '/api/system/ping', desc: '[LIVE] Write a custom event through the full pipeline to the database' },
                  { method: 'GET', path: '/api/compliance/health', desc: 'Health check + tool status' },
                  { method: 'GET', path: '/api/compliance/findings', desc: 'List audit findings (filter: severity, status, risk_category)' },
                  { method: 'GET', path: '/api/compliance/mttr', desc: 'MTTR report by risk category + 7-day trend' },
                  { method: 'GET', path: '/api/compliance/policies', desc: 'List masking policies' },
                  { method: 'POST', path: '/api/compliance/policies', desc: 'Generate new remediation policies' },
                  { method: 'GET', path: '/api/compliance/profiles', desc: 'EDI connection profiles audit' },
                  { method: 'POST', path: '/api/compliance/anonymise', desc: 'Run PII Anonymiser on a manifest' },
                  { method: 'POST', path: '/api/compliance/audit', desc: 'Run full EDI compliance audit' },
                  { method: 'POST', path: '/api/compliance/remediate', desc: 'Generate remediation policies + update EDI profiles' },
                ].map(ep => (
                  <div key={ep.path + ep.method} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-slate-50">
                    <Badge variant="outline" className={`font-mono text-xs w-14 justify-center ${ep.method === 'GET' ? 'text-emerald-700 border-emerald-300' : 'text-blue-700 border-blue-300'}`}>
                      {ep.method}
                    </Badge>
                    <code className={`text-sm font-mono flex-1 ${ep.path.includes('/system/') ? 'text-slate-900 font-semibold' : 'text-slate-800'}`}>{ep.path}</code>
                    <span className="text-xs text-slate-500 max-w-[280px] truncate hidden sm:inline">{ep.desc}</span>
                  </div>
                ))}
                <Separator className="my-3" />
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                  <p className="text-xs text-emerald-800 font-medium">The /api/system/ping endpoints communicate through all layers: Next.js middleware injects tracking headers, the API handler reads/writes to SQLite via Prisma ORM, and the response includes proof from every layer.</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
ENDOFFILE
echo "Done writing page.tsx"