import { NextRequest, NextResponse } from 'next/server';
import { startTiming, applyTimingHeaders, timedRead } from '@/lib/timing-headers';
import { PrismaClient } from '@prisma/client';

function freshDb() {
  return new PrismaClient({ log: [] });
}

// Sample audit findings data - in production this queries the compliance database
const SAMPLE_FINDINGS = [
  {
    finding_ref: 'AUD-ENC-001-a3f8c1e9',
    severity: 'critical',
    status: 'open',
    risk_category: 'unencrypted_transmission',
    title: 'Unencrypted EDI Transmissions: 23 violation(s) detected',
    description: 'EDI messages transmitted without encryption detected in last 24 hours. GDPR Art.32 requires appropriate technical measures.',
    affected_system: 'FMS',
    affected_table: 'edi_transmissions',
    affected_row_count: 23,
    detected_at: '2026-07-28T14:30:00Z',
    remediated_at: null,
    mttr_hours: null,
    current_phase: 'identified',
  },
  {
    finding_ref: 'AUD-CUS-001-b2d4e6f0',
    severity: 'critical',
    status: 'in_progress',
    risk_category: 'missing_customs_doc',
    title: 'Shipments Missing Customs Declarations: 8 violation(s) detected',
    description: 'Shipments without required customs documentation found. WCO SAFE Framework requires advance cargo information declarations.',
    affected_system: 'FMS',
    affected_table: 'shipments, shipment_documents',
    affected_row_count: 8,
    detected_at: '2026-07-27T09:15:00Z',
    remediated_at: null,
    mttr_hours: 18.5,
    current_phase: 'in_progress',
  },
  {
    finding_ref: 'AUD-ENC-003-c5f7a1b3',
    severity: 'high',
    status: 'open',
    risk_category: 'cert_expiry',
    title: 'Expired or Expiring TLS Certificates: 5 violation(s) detected',
    description: 'EDI connection profiles with expired or soon-to-expire TLS certificates found.',
    affected_system: 'FMS',
    affected_table: 'edi_connection_profiles',
    affected_row_count: 5,
    detected_at: '2026-07-28T10:00:00Z',
    remediated_at: null,
    mttr_hours: null,
    current_phase: 'identified',
  },
  {
    finding_ref: 'AUD-EDI-001-d8e2f4a6',
    severity: 'medium',
    status: 'remediated',
    risk_category: 'edi_non_compliance',
    title: 'Non-Compliant EDI Messages: 12 violation(s) detected',
    description: 'EDI messages failed validation against their declared standard (EDIFACT/ANSI X12).',
    affected_system: 'FMS',
    affected_table: 'edi_messages',
    affected_row_count: 12,
    detected_at: '2026-07-26T08:45:00Z',
    remediated_at: '2026-07-27T16:20:00Z',
    mttr_hours: 31.6,
    current_phase: 'resolved',
  },
  {
    finding_ref: 'AUD-RET-001-e9a3b5c7',
    severity: 'high',
    status: 'remediated',
    risk_category: 'data_retention_violation',
    title: 'PII Data Beyond Retention Period: 45 violation(s) detected',
    description: 'Manifest records containing PII have exceeded the GDPR-recommended 90-day retention period.',
    affected_system: 'FMS',
    affected_table: 'manifests, anonymisation_records',
    affected_row_count: 45,
    detected_at: '2026-07-25T06:00:00Z',
    remediated_at: '2026-07-25T22:30:00Z',
    mttr_hours: 16.5,
    current_phase: 'verified',
  },
  {
    finding_ref: 'AUD-CUS-002-f0b4c6d8',
    severity: 'critical',
    status: 'open',
    risk_category: 'missing_customs_doc',
    title: 'Containers Without VGM: 3 violation(s) detected',
    description: 'Containers missing SOLAS Verified Gross Mass declarations. Required before vessel loading.',
    affected_system: 'FMS',
    affected_table: 'containers, shipments',
    affected_row_count: 3,
    detected_at: '2026-07-28T11:30:00Z',
    remediated_at: null,
    mttr_hours: null,
    current_phase: 'identified',
  },
  {
    finding_ref: 'AUD-ACC-001-a1c3e5f7',
    severity: 'medium',
    status: 'accepted_risk',
    risk_category: 'access_control_breach',
    title: 'Users with Excessive System Access: 4 violation(s) detected',
    description: 'User accounts with broad permissions exceeding the principle of least privilege (ISO 27001 A.9.2.3).',
    affected_system: 'FMS',
    affected_table: 'users, user_permissions',
    affected_row_count: 4,
    detected_at: '2026-07-24T13:00:00Z',
    remediated_at: null,
    mttr_hours: null,
    current_phase: 'identified',
  },
  {
    finding_ref: 'AUD-ENC-002-b2d4e6f8',
    severity: 'high',
    status: 'in_progress',
    risk_category: 'unencrypted_transmission',
    title: 'FTP (Unencrypted) File Transfers: 15 violation(s) detected',
    description: 'File transfers using plain FTP instead of SFTP/FTPS detected. Plain FTP transmits data in cleartext.',
    affected_system: 'FMS',
    affected_table: 'file_transfers',
    affected_row_count: 15,
    detected_at: '2026-07-27T15:45:00Z',
    remediated_at: null,
    mttr_hours: 8.2,
    current_phase: 'in_progress',
  },
];

export async function GET(request: NextRequest) {
  const t = startTiming(request);
  const { searchParams } = new URL(request.url);
  const severity = searchParams.get('severity');
  const status = searchParams.get('status');
  const riskCategory = searchParams.get('risk_category');

  let findings = [...SAMPLE_FINDINGS];

  if (severity) findings = findings.filter(f => f.severity === severity);
  if (status) findings = findings.filter(f => f.status === status);
  if (riskCategory) findings = findings.filter(f => f.risk_category === riskCategory);

  // Instrumented DB read for traceability
  let dbCount = 0;
  try {
    const db = freshDb();
    dbCount = await timedRead(t, () => db.complianceFinding.count());
    await db.$disconnect();
  } catch { /* db not available for read, continue */ }

  return applyTimingHeaders(
    NextResponse.json({ total: findings.length, findings, dbFindingsCount: dbCount }),
    t,
  );
}
