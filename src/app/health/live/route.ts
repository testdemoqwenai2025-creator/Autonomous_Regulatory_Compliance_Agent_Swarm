/**
 * GET /health/live
 *
 * Liveness probe: is the process responsive?
 * Should return 200 with minimal overhead (no DB queries).
 * Used by container orchestrators (Kubernetes, Docker Compose health checks)
 * to decide whether to restart the container.
 */

import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    service: 'maritime-compliance-swarm',
    version: '2.1.0',
  });
}
