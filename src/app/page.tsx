'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Shield, ShieldAlert, ShieldCheck, Clock, Activity,
  FileKey, FileSearch, Wrench, Timer, AlertTriangle,
  CheckCircle2, XCircle, Loader2, RefreshCw, Lock,
  Unlock, ExternalLink, TrendingDown, Server, Database,
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

// ── Main Dashboard ──────────────────────────────────────────────

export default function ComplianceDashboard() {
  const [findings, setFindings] = useState<Finding[]>([]);
  const [mttr, setMttr] = useState<MTTRData | null>(null);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [auditing, setAuditing] = useState(false);

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
        <Tabs defaultValue="findings" className="space-y-4">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="findings" className="text-xs sm:text-sm">Findings</TabsTrigger>
            <TabsTrigger value="mttr" className="text-xs sm:text-sm">MTTR</TabsTrigger>
            <TabsTrigger value="profiles" className="text-xs sm:text-sm">EDI Profiles</TabsTrigger>
            <TabsTrigger value="policies" className="text-xs sm:text-sm">Policies</TabsTrigger>
            <TabsTrigger value="endpoints" className="text-xs sm:text-sm">API</TabsTrigger>
          </TabsList>

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
              {/* MTTR by Category */}
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

              {/* MTTR Trend */}
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
                  <div key={ep.path} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-slate-50">
                    <Badge variant="outline" className={`font-mono text-xs w-14 justify-center ${ep.method === 'GET' ? 'text-emerald-700 border-emerald-300' : 'text-blue-700 border-blue-300'}`}>
                      {ep.method}
                    </Badge>
                    <code className="text-sm font-mono text-slate-800 flex-1">{ep.path}</code>
                    <span className="text-xs text-slate-500 max-w-[250px] truncate hidden sm:inline">{ep.desc}</span>
                  </div>
                ))}
                <Separator className="my-3" />
                <p className="text-xs text-slate-400">Production mode: API routes proxy to the Python/Golang backend services via internal ports. See docker-compose.yml for service configuration.</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}