'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Thermometer, GanttChart, Gauge, Activity, Database, Layers, Monitor,
  Zap, Eye, History, BarChart3, Server, Flame,
  Key, Settings, Heart, Check, Cpu, HardDrive,
  RefreshCw, Loader2,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  useEndpointTracer, StoredEndpointTrace, TraceSummary, StoredSpan,
} from '@/hooks/useEndpointTracer';

function KPICard({ icon: Icon, label, value, sub, color = 'text-slate-900' }: {
  icon: React.ElementType; label: string; value: string | number; sub?: string; color?: string;
}) {
  return (
    <Card className="relative overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs font-medium text-slate-500">{label}</p>
            <p className={`text-xl font-bold ${color}`}>{value}</p>
            {sub && <p className="text-[10px] text-slate-400">{sub}</p>}
          </div>
          <div className="rounded-lg bg-slate-100 p-2"><Icon className="w-4 h-4 text-slate-600" /></div>
        </div>
      </CardContent>
    </Card>
  );
}
const COMPONENT_MATRIX = [
  { component: 'Browser', talksTo: ['Middleware', 'Network', 'DNS/TCP/SSL'], layer: 'client' },
  { component: 'Middleware', talksTo: ['Auth', 'Rate Limiter', 'Handler', 'Security Headers'], layer: 'edge' },
  { component: 'Auth (JWT/API Key)', talksTo: ['Middleware', 'Handler', 'Database'], layer: 'service' },
  { component: 'Rate Limiter', talksTo: ['Middleware', 'Database'], layer: 'service' },
  { component: 'API Handler', talksTo: ['Middleware', 'Database', 'Auth'], layer: 'server' },
  { component: 'Database (SQLite)', talksTo: ['Handler', 'Migrations'], layer: 'data' },
  { component: 'Prisma ORM', talksTo: ['Database', 'Handler'], layer: 'data' },
  { component: 'Structured Logger', talksTo: ['Handler', 'Middleware', 'Auth'], layer: 'infra' },
  { component: 'Config Validator', talksTo: ['Auth', 'CORS', 'Database'], layer: 'infra' },
  { component: 'CORS', talksTo: ['Middleware', 'Browser'], layer: 'edge' },
  { component: 'Security Headers', talksTo: ['Middleware', 'Browser'], layer: 'edge' },
  { component: 'Health Probes', talksTo: ['Database', 'Auth', 'Rate Limiter'], layer: 'ops' },
  { component: 'ep-trace Endpoint', talksTo: ['Database', 'Browser', 'All APIs'], layer: 'service' },
  { component: 'Anomaly Engine', talksTo: ['Database', 'Logger'], layer: 'intelligence' },
  { component: 'Predictive MTTR', talksTo: ['Database', 'Findings'], layer: 'intelligence' },
];

const LAYER_COLORS: Record<string, string> = {
  client: 'bg-sky-100 text-sky-800 border-sky-200',
  edge: 'bg-amber-100 text-amber-800 border-amber-200',
  service: 'bg-violet-100 text-violet-800 border-violet-200',
  server: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  data: 'bg-teal-100 text-teal-800 border-teal-200',
  infra: 'bg-slate-100 text-slate-800 border-slate-200',
  ops: 'bg-orange-100 text-orange-800 border-orange-200',
  intelligence: 'bg-rose-100 text-rose-800 border-rose-200',
};

export default function ObservabilityPage() {
  const {
    runFullTrace, isTracing, lastTraceResult: epResult,
    traceHistory: epHistory, traceSummary: epSummary,
    loadTraceHistory, loadTraceSummary,
  } = useEndpointTracer();
  const [healthReady, setHealthReady] = useState<Record<string, unknown> | null>(null);
  const [healthLive, setHealthLive] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    fetch('/health/live').then(r => r.json()).then(setHealthLive).catch(() => {});
    fetch('/health/ready').then(r => r.json()).then(setHealthReady).catch(() => {});
  }, []);

  const runTrace = useCallback(async () => {
    const r = await runFullTrace();
    if (r) setTimeout(() => loadTraceHistory(10), 400);
  }, [runFullTrace, loadTraceHistory]);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/80 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900"><Thermometer className="h-5 w-5 text-white" /></div>
              <div>
                <h1 className="text-lg font-bold text-slate-900 leading-tight">Full-Site Correlation Observability</h1>
                <p className="text-xs text-slate-500">Browser timing + server traces + infrastructure context</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => {
                setHealthLive(null); setHealthReady(null);
                fetch('/health/live').then(r => r.json()).then(setHealthLive);
                fetch('/health/ready').then(r => r.json()).then(setHealthReady);
              }}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />Refresh Health</Button>
              <Button size="sm" onClick={runTrace} disabled={isTracing}>
                {isTracing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <GanttChart className="mr-1.5 h-3.5 w-3.5" />}
                {isTracing ? `Tracing...` : 'Run Full Correlation Trace'}
              </Button>
              <a href="/" className="text-xs text-slate-500 hover:text-slate-700 underline">Back to Dashboard</a>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <Card className="bg-gradient-to-r from-slate-900 to-slate-800 text-white"><CardContent className="p-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="flex items-start gap-3"><div className="rounded-lg bg-sky-500/20 p-2 mt-0.5"><Eye className="w-4 h-4 text-sky-300" /></div><div><p className="font-semibold text-sky-200">Frontend Perspective</p><p className="text-xs text-slate-300 mt-0.5">Browser Performance API: DNS, TCP, TLS handshake, TTFB, round-trip latency, JSON parse, transfer size, protocol, memory, DOM nodes, long tasks, connection type</p></div></div>
            <div className="flex items-start gap-3"><div className="rounded-lg bg-violet-500/20 p-2 mt-0.5"><Server className="w-4 h-4 text-violet-300" /></div><div><p className="font-semibold text-violet-200">Server-Side Traces</p><p className="text-xs text-slate-300 mt-0.5">Middleware timing, handler duration, DB write/read milliseconds — all via response headers (x-handler-ms, x-middleware-ms, x-db-write-ms, x-db-read-ms)</p></div></div>
            <div className="flex items-start gap-3"><div className="rounded-lg bg-amber-500/20 p-2 mt-0.5"><Settings className="w-4 h-4 text-amber-300" /></div><div><p className="font-semibold text-amber-200">Infrastructure Context</p><p className="text-xs text-slate-300 mt-0.5">Rate limit status (remaining/limit), auth method, config validation, health probes, CSP/HSTS/CORS, security headers</p></div></div>
          </div>
        </CardContent></Card>

        <div className="grid grid-cols-2 gap-3">
          <Card><CardContent className="p-3"><div className="flex items-center gap-2"><Heart className={`w-4 h-4 ${healthLive ? 'text-emerald-500' : 'text-slate-300'}`} /><span className="text-sm font-medium">Liveness</span>{healthLive && <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-300 ml-auto">{String(healthLive.status)}</Badge>}</div></CardContent></Card>
          <Card><CardContent className="p-3"><div className="flex items-center gap-2"><Activity className={`w-4 h-4 ${healthReady?.status === 'ready' ? 'text-emerald-500' : 'text-amber-500'}`} /><span className="text-sm font-medium">Readiness</span>{healthReady && <Badge variant="outline" className={`text-[10px] ml-auto ${healthReady.status === 'ready' ? 'text-emerald-600 border-emerald-300' : 'text-amber-600 border-amber-300'}`}>{String(healthReady.status)}</Badge>}{healthReady?.checks && Array.isArray(healthReady.checks) && <span className="text-[10px] text-slate-400 ml-2">{healthReady.checks.filter((c: {name: string; status: string}) => c.status === 'healthy').length}/{healthReady.checks.length} checks</span>}</div></CardContent></Card>
        </div>

        {epResult && (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            <KPICard icon={Zap} label="Endpoints Hit" value={epResult.summary.endpointsHit} sub={`${epResult.summary.endpointsOk} OK / ${epResult.summary.endpointsFailed} fail`} />
            <KPICard icon={Gauge} label="Avg TTFB" value={`${epResult.summary.avgTtfbMs}ms`} sub="Time to first byte" />
            <KPICard icon={Activity} label="Avg Round Trip" value={`${epResult.summary.avgRoundTripMs}ms`} sub="Browser full cycle" />
            <KPICard icon={Layers} label="Avg Middleware" value={`${epResult.summary.avgMiddlewareMs}ms`} sub="Edge processing" />
            <KPICard icon={Monitor} label="Avg Handler" value={`${epResult.summary.avgHandlerMs}ms`} sub="Server logic" />
            <KPICard icon={Database} label="Avg DB Write" value={`${epResult.summary.avgDbWriteMs}ms`} sub="SQLite persist" />
            <KPICard icon={Clock} label="Server Total" value={`${epResult.serverTiming.handlerMs}ms`} sub={`parse: ${epResult.serverTiming.bodyParseMs}ms`} />
            <KPICard icon={HardDrive} label="DB Persist" value={`${epResult.serverTiming.dbWriteMs}ms`} sub={`${epResult.stats.totalEpSpans} spans stored`} />
          </div>
        )}

        <Tabs defaultValue="waterfall" className="space-y-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="waterfall" className="text-xs sm:text-sm flex items-center gap-1"><GanttChart className="w-3 h-3" />Waterfall</TabsTrigger>
            <TabsTrigger value="browser" className="text-xs sm:text-sm flex items-center gap-1"><Eye className="w-3 h-3" />Browser</TabsTrigger>
            <TabsTrigger value="matrix" className="text-xs sm:text-sm flex items-center gap-1"><Cpu className="w-3 h-3" />Component Map</TabsTrigger>
            <TabsTrigger value="history" className="text-xs sm:text-sm flex items-center gap-1"><History className="w-3 h-3" />History</TabsTrigger>
          </TabsList>

          <TabsContent value="waterfall" className="space-y-4">
            {epResult && (
              <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Endpoint Waterfall</CardTitle></CardHeader><CardContent>
                <div className="overflow-x-auto"><table className="w-full text-xs">
                  <thead><tr className="border-b border-slate-200 text-slate-500">
                    <th className="text-left py-2 pr-3 font-medium">Endpoint</th>
                    <th className="text-right py-2 px-1 font-medium">Code</th>
                    <th className="text-right py-2 px-1 font-medium">TTFB</th>
                    <th className="text-right py-2 px-1 font-medium">RT</th>
                    <th className="text-right py-2 px-1 font-medium">MW</th>
                    <th className="text-right py-2 px-1 font-medium">Hnd</th>
                    <th className="text-right py-2 px-1 font-medium">DB</th>
                    <th className="text-right py-2 px-1 font-medium">RL</th>
                    <th className="text-right py-2 px-1 font-medium">Size</th>
                    <th className="text-left py-2 pl-1 font-medium w-[200px]">Correlation</th>
                  </tr></thead>
                  <tbody>
                    <tr className="border-b border-slate-100"><td colSpan={13} className="py-4 text-center text-slate-400">Run a trace to see the per-endpoint waterfall.</td></tr>
                  </tbody>
                </table></div>
                <div className="flex items-center gap-3 mt-2 text-[9px] text-slate-400">
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-sky-300" />Network</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-amber-400" />Middleware</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-violet-500" />Handler</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />DB</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-orange-400" />Parse</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-rose-400" />Browser</span>
                </div>
              </CardContent></Card>
            )}
          </TabsContent>

          <TabsContent value="browser" className="space-y-4">
            {epResult && (
              <Card><CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Eye className="w-4 h-4" />Browser Environment</CardTitle></CardHeader><CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                  <div><span className="text-slate-500 text-xs">Memory Used</span><p className="font-bold text-lg">{epResult.browserMetrics.memoryUsedMb} <span className="text-sm font-normal text-slate-400">MB</span></p><p className="text-xs text-slate-400">of {epResult.browserMetrics.memoryLimitMb} MB heap limit</p></div>
                  <div><span className="text-slate-500 text-xs">DOM Nodes</span><p className="font-bold text-lg">{epResult.browserMetrics.domNodes}</p></div>
                  <div><span className="text-slate-500 text-xs">Long Tasks</span><p className="font-bold text-lg">{epResult.browserMetrics.longTaskCount}</p><p className="text-xs text-slate-400">{epResult.browserMetrics.longTaskTotalMs}ms total blocking time</p></div>
                  <div><span className="text-slate-500 text-xs">Page Resources</span><p className="font-bold text-lg">{epResult.browserMetrics.resourceCount}</p></div>
                </div>
              </CardContent></Card>
            )}
            {!epResult && <Card><CardContent className="p-8 text-center text-slate-400">Run a trace to capture browser metrics.</CardContent></Card>}
          </TabsContent>

          <TabsContent value="matrix" className="space-y-4">
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Cpu className="w-4 h-4" />Component Dependency Matrix</CardTitle><CardDescription>Every component in the system and what it connects to. All traced via ep-trace.</CardDescription></CardHeader><CardContent>
              <div className="overflow-x-auto"><table className="w-full text-xs">
                <thead><tr className="border-b border-slate-200 text-slate-500">
                  <th className="text-left py-1.5 pr-3 font-medium">Component</th>
                  <th className="text-left py-1.5 font-medium">Talks To</th>
                  <th className="text-center py-1.5 font-medium">Layer</th>
                  <th className="text-center py-1.5 font-medium">Traced</th>
                </tr></thead>
                <tbody>
                  {COMPONENT_MATRIX.map((c, i) => (
                    <tr key={i} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="py-1.5 pr-3 font-medium text-slate-700">{c.component}</td>
                      <td className="py-1.5 text-slate-600">{c.talksTo.join(', ')}</td>
                      <td className="py-1.5 text-center"><Badge variant="outline" className={`text-[10px] ${LAYER_COLORS[c.layer]}`}>{c.layer}</Badge></td>
                      <td className="py-1.5 text-center"><Check className="w-3.5 h-3.5 text-emerald-500 mx-auto" /></td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="history" className="space-y-4">
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => loadTraceHistory(10)}><History className="mr-1.5 h-3.5 w-3.5" />Load History</Button>
              <Button size="sm" variant="outline" onClick={loadTraceSummary}><BarChart3 className="mr-1.5 h-3.5 w-3.5" />Aggregate Summary</Button>
            </div>
            {epSummary && (
              <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Aggregate Statistics</CardTitle></CardHeader><CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                  <div><span className="text-slate-500">Total Traces</span><p className="font-bold">{epSummary.traces.total}</p></div>
                  <div><span className="text-slate-500">Total Spans</span><p className="font-bold">{epSummary.spans.total}</p><p className="text-xs text-slate-400">{epSummary.spans.errorRate} error rate</p></div>
                  <div><span className="text-slate-500">Avg TTFB</span><p className="font-bold">{Math.round((epSummary.spans.aggregates._avg?.clientTtfbMs ?? 0))}ms</p></div>
                  <div><span className="text-slate-500">Avg Round Trip</span><p className="font-bold">{Math.round((epSummary.spans.aggregates._avg?.clientRoundTripMs ?? 0))}ms</p></div>
                </div>
              </CardContent></Card>
            )}
            {epHistory.length > 0 && epHistory.map((trace: StoredEndpointTrace) => (
              <Card key={trace.id}><CardContent className="p-3 space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="font-mono text-[10px]">{trace.traceId.slice(0, 20)}</Badge>
                    <Badge variant="secondary" className="text-[10px]">{trace.initiatedBy}</Badge>
                    <span className="text-[10px] text-slate-400">{new Date(trace.createdAt).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-slate-500">{trace.totalEndpointsHit} eps</span>
                    <span className={trace.totalEndpointsFail > 0 ? 'text-red-500' : 'text-emerald-600'}>{trace.totalEndpointsOk} OK</span>
                    <span className="text-slate-500">Avg RT: {Math.round(trace.browserRoundTripAvgMs)}ms</span>
                    {trace.authMethod && <Badge variant="outline" className="text-[10px]">auth: {trace.authMethod}</Badge>}
                    {trace.rateLimitLimit > 0 && <Badge variant="outline" className="text-[10px]">RL: {trace.rateLimitRemaining}/{trace.rateLimitLimit}</Badge>}
                  </div>
                </div>
                {trace.spans.length > 0 && (
                  <div className="overflow-x-auto"><table className="w-full text-[10px]">
                    <thead><tr className="border-b border-slate-100 text-slate-400">
                      <th className="text-left py-1 pr-2">Endpoint</th>
                      <th className="text-right py-1 px-1">Code</th>
                      <th className="text-right py-1 px-1">TTFB</th>
                      <th className="text-right py-1 px-1">RT</th>
                      <th className="text-right py-1 px-1">MW</th>
                      <th className="text-right py-1 px-1">Hnd</th>
                      <th className="text-right py-1 px-1">DB</th>
                      <th className="text-right py-1 px-1">RL</th>
                      <th className="text-left py-1 pl-1 w-[180px]">Waterfall</th>
                    </tr></thead>
                    <tbody>
                      {trace.spans.map((span: StoredSpan) => {
                        const maxMs = Math.max(...trace.spans.map(s => s.clientRoundTripMs), 1);
                        const p = (v: number) => (v / maxMs) * 100;
                        return (
                          <tr key={span.id} className="border-b border-slate-50 hover:bg-slate-50">
                            <td className="py-1 pr-2 font-mono text-slate-600 truncate max-w-[200px]" title={span.endpoint}>{span.endpoint.replace('/api/', '')}</td>
                            <td className={`text-right py-1 px-1 font-medium ${span.statusCode < 400 ? 'text-emerald-600' : 'text-red-500'}`}>{span.statusCode}</td>
                            <td className="text-right py-1 px-1">{span.clientTtfbMs}</td>
                            <td className="text-right py-1 px-1 font-semibold">{span.clientRoundTripMs}</td>
                            <td className="text-right py-1 px-1">{span.serverMiddlewareMs}</td>
                            <td className="text-right py-1 px-1">{span.serverHandlerMs}</td>
                            <td className="text-right py-1 px-1">{span.serverDbWriteMs}</td>
                            <td className="text-right py-1 px-1">{span.rateLimitLimit > 0 ? String(span.rateLimitRemaining) : '-'}</td>
                            <td className="py-1 pl-1"><div className="flex h-3 rounded-sm overflow-hidden bg-slate-100 w-full">
                              <div className="bg-sky-300" style={{ width: `${p(span.networkTransitMs)}%` }} />
                              <div className="bg-amber-400" style={{ width: `${p(span.serverMiddlewareMs)}%` }} />
                              <div className="bg-violet-500" style={{ width: `${p(span.serverHandlerMs)}%` }} />
                              <div className="bg-emerald-500" style={{ width: `${p(span.serverDbWriteMs)}%` }} />
                              <div className="bg-orange-400" style={{ width: `${p(span.clientJsonParseMs)}%` }} />
                              <div className="bg-rose-400" style={{ width: `${p(span.browserOverheadMs)}%` }} />
                            </div></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table></div>
                )}
              </CardContent></Card>
            ))}
            {epHistory.length === 0 && <Card><CardContent className="p-8 text-center text-slate-400">No traces yet. Click Run Full Correlation Trace and then Load History.</CardContent></Card>}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
