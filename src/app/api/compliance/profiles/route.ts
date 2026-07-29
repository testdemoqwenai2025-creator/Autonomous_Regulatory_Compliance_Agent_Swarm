import { NextResponse } from 'next/server';

const SAMPLE_PROFILES = [
  { partner_id: 'MSCU', partner_name: 'MSC Mediterranean', edi_standard: 'EDIFACT', encrypted: true, protocol: 'TLS 1.3', last_audit: '2026-07-28T14:00:00Z', compliant: true, issues: [] },
  { partner_id: 'MAERSK', partner_name: 'Maersk Line', edi_standard: 'EDIFACT', encrypted: false, protocol: 'None', last_audit: '2026-07-28T14:00:00Z', compliant: false, issues: ['Encryption not enabled'] },
  { partner_id: 'CMA-CGM', partner_name: 'CMA CGM', edi_standard: 'ANSI_X12', encrypted: true, protocol: 'TLS 1.2', last_audit: '2026-07-28T14:00:00Z', compliant: true, issues: [] },
  { partner_id: 'COSCO', partner_name: 'COSCO Shipping', edi_standard: 'EDIFACT', encrypted: true, protocol: 'TLS 1.2', last_audit: '2026-07-28T10:05:00Z', compliant: false, issues: ['Certificate expires in 5 days'] },
  { partner_id: 'HAPAG', partner_name: 'Hapag-Lloyd', edi_standard: 'BAPLIE', encrypted: true, protocol: 'TLS 1.3', last_audit: '2026-07-27T16:00:00Z', compliant: true, issues: [] },
  { partner_id: 'ONE', partner_name: 'Ocean Network Express', edi_standard: 'EDIFACT', encrypted: false, protocol: 'FTP', last_audit: '2026-07-28T14:00:00Z', compliant: false, issues: ['Encryption not enabled', 'Plain FTP protocol'] },
  { partner_id: 'EVERGREEN', partner_name: 'Evergreen Marine', edi_standard: 'EDIFACT', encrypted: true, protocol: 'TLS 1.2', last_audit: '2026-07-28T14:00:00Z', compliant: true, issues: [] },
  { partner_id: 'YANGMING', partner_name: 'Yang Ming Marine', edi_standard: 'ANSI_X12', encrypted: true, protocol: 'TLS 1.3', last_audit: '2026-07-26T08:00:00Z', compliant: true, issues: [] },
];

export async function GET() {
  const total = SAMPLE_PROFILES.length;
  const compliant = SAMPLE_PROFILES.filter(p => p.compliant).length;
  return NextResponse.json({ total, compliant, non_compliant: total - compliant, profiles: SAMPLE_PROFILES });
}
