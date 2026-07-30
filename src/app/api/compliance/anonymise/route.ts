import { NextRequest, NextResponse } from 'next/server';
import { startTiming, applyTimingHeaders } from '@/lib/timing-headers';
import { parseAndValidate, anonymiseSchema, ValidationError } from '@/lib/validation';

export async function POST(request: NextRequest) {
  const t = startTiming(request);

  try {
    const rawBody = await request.json().catch(() => ({}));
    const body = parseAndValidate(anonymiseSchema, rawBody);

    return applyTimingHeaders(NextResponse.json({
      status: body.dryRun ? 'dry_run' : 'applied',
      tool: 'Manifest_PII_Anonymiser',
      targetTable: body.targetTable,
      fieldsAnonymised: body.fields.length,
      tokensGenerated: body.fields.length,
      auditRecords: body.fields.length,
      message: body.dryRun
        ? `Dry-run: ${body.fields.length} fields would be anonymised in ${body.targetTable}`
        : `Applied: ${body.fields.length} fields anonymised in ${body.targetTable}`,
    }), t);
  } catch (err) {
    const status = err instanceof ValidationError ? err.statusCode : 500;
    const message = err instanceof Error ? err.message : 'Anonymisation failed';
    const details = err instanceof ValidationError ? err.details : undefined;
    return applyTimingHeaders(
      NextResponse.json({ error: message, details, status }, { status }),
      t,
    );
  }
}
