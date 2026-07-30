import { NextRequest, NextResponse } from 'next/server';
import { startTiming, applyTimingHeaders } from '@/lib/timing-headers';

export async function GET(request: NextRequest) {
  const t = startTiming(request);
  return applyTimingHeaders(NextResponse.json({
    status: 'healthy',
    service: 'maritime-compliance-swarm',
    version: '2.1.0',
    tools: [
      { name: 'Manifest_PII_Anonymiser', language: 'Python', status: 'available' },
      { name: 'Logistics_EDI_SQL_Auditor', language: 'Python', status: 'available' },
      { name: 'Remediation_Route_Generator', language: 'Python', status: 'available' },
      { name: 'Telemetry_MTTR_Tracker', language: 'Golang', status: 'available' },
    ],
    endpoints: {
      findings: '/api/compliance/findings',
      mttr_report: '/api/compliance/mttr',
      policies: '/api/compliance/policies',
      profiles: '/api/compliance/profiles',
      anonymise: '/api/compliance/anonymise',
      audit: '/api/compliance/audit',
      remediate: '/api/compliance/remediate',
      observability: '/api/system/observability/ep-trace',
    },
  }), t);
}
