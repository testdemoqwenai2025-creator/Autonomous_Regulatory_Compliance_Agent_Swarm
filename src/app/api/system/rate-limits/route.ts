/**
 * GET /api/system/rate-limits
 *
 * Returns the current rate limit configuration and live bucket stats.
 * Used by the Observability tab to show rate limiter state.
 * No auth required (read-only operational data).
 */

import { NextRequest, NextResponse } from 'next/server';
import { startTiming, applyTimingHeaders } from '@/lib/timing-headers';
import { getAllRateLimitConfigs, getBucketStats } from '@/lib/rate-limiter';

export async function GET(request: NextRequest) {
  const t = startTiming(request);
  const configs = getAllRateLimitConfigs();
  const stats = getBucketStats();
  return applyTimingHeaders(NextResponse.json({ configs, stats }), t);
}
