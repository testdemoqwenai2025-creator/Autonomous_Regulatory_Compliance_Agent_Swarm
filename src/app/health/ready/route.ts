/**
 * GET /health/ready
 *
 * Readiness probe: is the service ready to accept traffic?
 * Checks: database connectivity, table existence, basic query.
 * Returns 503 if any dependency is unhealthy.
 */

import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

export async function GET() {
  const checks: Array<{ name: string; status: 'healthy' | 'degraded' | 'down'; latencyMs: number; detail?: string }> = [];
  let overallHealthy = true;

  // Database check
  const dbStart = performance.now();
  try {
    const db = new PrismaClient({ log: [] });
    const count = await db.complianceFinding.count();
    const eventCount = await db.systemEvent.count();
    const dbMs = Math.round(performance.now() - dbStart);
    checks.push({
      name: 'database',
      status: dbMs < 500 ? 'healthy' : 'degraded',
      latencyMs: dbMs,
      detail: `findings: ${count}, events: ${eventCount}`,
    });
    if (dbMs >= 1000) overallHealthy = false;
    await db.$disconnect();
  } catch (err) {
    checks.push({
      name: 'database',
      status: 'down',
      latencyMs: Math.round(performance.now() - dbStart),
      detail: String(err),
    });
    overallHealthy = false;
  }

  // Rate limiter check (module loaded)
  const rlStart = performance.now();
  try {
    // Dynamic import to verify the module loads
    const { getBucketStats } = await import('@/lib/rate-limiter');
    const stats = getBucketStats();
    checks.push({
      name: 'rate_limiter',
      status: 'healthy',
      latencyMs: Math.round(performance.now() - rlStart),
      detail: `${stats.totalBuckets} active buckets`,
    });
  } catch (err) {
    checks.push({
      name: 'rate_limiter',
      status: 'down',
      latencyMs: Math.round(performance.now() - rlStart),
      detail: String(err),
    });
    overallHealthy = false;
  }

  // Auth module check
  const authStart = performance.now();
  try {
    const secret = process.env.AUTH_SECRET;
    const devMode = process.env.AUTH_DEV_MODE;
    checks.push({
      name: 'auth',
      status: (secret && secret !== 'change-me-to-a-random-32-byte-hex-string') || devMode === 'true' ? 'healthy' : 'degraded',
      latencyMs: Math.round(performance.now() - authStart),
      detail: `dev_mode: ${devMode ?? 'false'}, secret_set: ${!!secret && secret.length > 20}`,
    });
  } catch (err) {
    checks.push({
      name: 'auth',
      status: 'down',
      latencyMs: Math.round(performance.now() - authStart),
      detail: String(err),
    });
    overallHealthy = false;
  }

  const statusCode = overallHealthy ? 200 : 503;
  return NextResponse.json({
    status: overallHealthy ? 'ready' : 'not_ready',
    timestamp: new Date().toISOString(),
    checks,
  }, { status: statusCode });
}