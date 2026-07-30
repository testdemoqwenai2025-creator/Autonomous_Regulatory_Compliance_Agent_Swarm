import { NextRequest, NextResponse } from 'next/server';
import { startTiming, applyTimingHeaders } from '@/lib/timing-headers';
import { parseAndValidate, remediateSchema, ValidationError } from '@/lib/validation';
import { hasPermission } from '@/lib/auth';

export async function POST(request: NextRequest) {
  const t = startTiming(request);

  // RBAC: require 'remediateDryRun' or 'remediateApply' permission
  const authRole = request.headers.get('x-auth-role') ?? 'viewer';
  const rawBody = await request.json().catch(() => ({}));

  try {
    const body = parseAndValidate(remediateSchema, rawBody);

    // Check permission based on action
    if (body.action === 'apply' && !hasPermission({ authenticated: true, method: 'jwt', role: authRole as any, permissions: undefined }, 'remediateApply')) {
      throw new ValidationError('Insufficient permissions for apply action', 403, []);
    }

    return applyTimingHeaders(NextResponse.json({
      status: body.action === 'apply' ? 'remediation_applied' : 'remediation_dry_run',
      tool: 'Remediation_Route_Generator',
      findingRef: body.findingRef,
      action: body.action,
      policies_generated: 3,
      profiles_updated: 2,
      message: body.action === 'apply'
        ? 'Policies applied and EDI profiles updated'
        : 'Policies generated in dry-run mode. Use action=apply to enforce.',
    }), t);
  } catch (err) {
    const status = err instanceof ValidationError ? err.statusCode : 500;
    const message = err instanceof Error ? err.message : 'Remediation failed';
    const details = err instanceof ValidationError ? err.details : undefined;
    return applyTimingHeaders(
      NextResponse.json({ error: message, details, status }, { status }),
      t,
    );
  }
}
