import { NextRequest, NextResponse } from 'next/server';
import { startTiming, applyTimingHeaders } from '@/lib/timing-headers';

export async function POST(request: NextRequest) {
  const t = startTiming(request);
  const body = await request.json();
  // In production: delegates to Manifest_PII_Anonymiser
  return applyTimingHeaders(NextResponse.json({
    status: 'processed',
    tool: 'Manifest_PII_Anonymiser',
    manifest_id: body.manifest_id || 'unknown',
    fields_anonymised: 6,
    tokens_generated: 6,
    audit_records: 6,
    mode: body.dry_run ? 'dry-run' : 'applied',
  }), t);
}
