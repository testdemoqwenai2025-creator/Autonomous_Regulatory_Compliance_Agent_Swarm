import { NextRequest, NextResponse } from 'next/server';
import { startTiming, applyTimingHeaders } from '@/lib/timing-headers';

// Sample MTTR data - in production this queries the Golang MTTR Tracker
const MTTR_DATA = {
  report: {
    risk_categories: [
      { category: 'pii_exposure', total: 12, resolved: 10, avg_mttr_hours: 14.2, p95_mttr_hours: 28.5, median_mttr_hours: 12.0 },
      { category: 'unencrypted_transmission', total: 38, resolved: 30, avg_mttr_hours: 22.8, p95_mttr_hours: 48.0, median_mttr_hours: 18.5 },
      { category: 'missing_customs_doc', total: 11, resolved: 8, avg_mttr_hours: 8.5, p95_mttr_hours: 16.0, median_mttr_hours: 6.0 },
      { category: 'edi_non_compliance', total: 12, resolved: 12, avg_mttr_hours: 31.6, p95_mttr_hours: 52.0, median_mttr_hours: 28.0 },
      { category: 'data_retention_violation', total: 45, resolved: 45, avg_mttr_hours: 16.5, p95_mttr_hours: 24.0, median_mttr_hours: 15.0 },
      { category: 'access_control_breach', total: 4, resolved: 0, avg_mttr_hours: 0, p95_mttr_hours: 0, median_mttr_hours: 0 },
      { category: 'cert_expiry', total: 5, resolved: 2, avg_mttr_hours: 4.2, p95_mttr_hours: 8.0, median_mttr_hours: 3.5 },
    ],
    overall: {
      total_findings: 127,
      resolved_findings: 107,
      open_findings: 14,
      in_progress: 6,
      avg_mttr_hours: 18.3,
      p95_mttr_hours: 42.0,
      median_mttr_hours: 14.0,
      fastest_resolution_hours: 1.2,
      slowest_resolution_hours: 52.0,
      compliance_rate: 84.3,
    },
    calculated_at: '2026-07-28T23:00:00Z',
  },
  trend: [
    { date: '2026-07-22', avg_mttr: 24.5, new_findings: 18, resolved: 12 },
    { date: '2026-07-23', avg_mttr: 22.1, new_findings: 15, resolved: 16 },
    { date: '2026-07-24', avg_mttr: 20.8, new_findings: 12, resolved: 18 },
    { date: '2026-07-25', avg_mttr: 19.2, new_findings: 20, resolved: 22 },
    { date: '2026-07-26', avg_mttr: 18.6, new_findings: 14, resolved: 20 },
    { date: '2026-07-27', avg_mttr: 17.9, new_findings: 10, resolved: 15 },
    { date: '2026-07-28', avg_mttr: 18.3, new_findings: 8, resolved: 14 },
  ],
};

export async function GET(request: NextRequest) {
  const t = startTiming(request);
  return applyTimingHeaders(NextResponse.json(MTTR_DATA), t);
}
