/**
 * POST /api/intelligence/anomaly-detect
 *
 * Phase 2.1: ML-Based Anomaly Detection.
 * Ingests a metric value, updates the rolling baseline (mean/stddev),
 * computes z-score, and returns anomaly status.
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { startTiming, applyTimingHeaders, timedWrite, timedRead } from '@/lib/timing-headers';

function freshDb() { return new PrismaClient({ log: [] }); }

// Welford's online algorithm for running mean/variance
const baselines = new Map<string, { mean: number; m2: number; n: number }>();

function updateBaseline(key: string, value: number) {
  let b = baselines.get(key);
  if (!b) b = { mean: value, m2: 0, n: 0 };
  b.n += 1;
  const delta = value - b.mean;
  b.mean += delta / b.n;
  const delta2 = value - b.mean;
  b.m2 += delta * delta2;
  baselines.set(key, b);
  return { mean: b.mean, stdDev: b.n > 1 ? Math.sqrt(b.m2 / (b.n - 1)) : 0, n: b.n };
}
export async function POST(request: NextRequest) {
  const t = startTiming(request);
  const db = freshDb();
  try {
    const body = await request.json();
    const metricName = (body.metricName as string) ?? 'unknown';
    const value = (body.value as number) ?? 0;
    const dataSource = (body.dataSource as string) ?? '';
    const threshold = (body.threshold as number) ?? 2.0;
    const { mean, stdDev, n } = updateBaseline(metricName, value);
    const zScore = stdDev > 0 ? Math.abs((value - mean) / stdDev) : 0;
    const isAnomaly = zScore > threshold;
    const direction = value >= mean ? 'above' : 'below';
    const severity = zScore > 3 ? 'critical' : zScore > 2 ? 'warning' : 'info';

    // Persist baseline
    await db.anomalyBaseline.upsert({
      where: { metricName },
      update: { meanValue: mean, stdDev, sampleCount: n, lastUpdated: new Date(), windowMinutes: 60, dataSource },
      create: { metricName, meanValue: mean, stdDev, sampleCount: n, windowMinutes: 60, dataSource },
    });

    // Persist detection if anomalous
    if (isAnomaly) {
      await db.anomalyDetection.create({
        data: {
          metricName, observedValue: value, baselineMean: mean,
          baselineStdDev: stdDev, zScore, threshold, severity, direction, dataSource,
          contextPayload: JSON.stringify({ sampleCount: n }),
        },
      });
    }

    const totalAnomalies = await db.anomalyDetection.count({ where: { acknowledged: false } });
    await db.$disconnect();
    return applyTimingHeaders(NextResponse.json({
      metricName, value, baseline: { mean, stdDev, sampleCount: n },
      zScore: Math.round(zScore * 100) / 100,
      isAnomaly, severity: isAnomaly ? severity : 'normal',
      direction, unacknowledgedAnomalies: totalAnomalies,
    }), t);
  } catch (err) {
    await db.$disconnect();
    return applyTimingHeaders(NextResponse.json({ error: String(err) }, { status: 500 }), t);
  }
}

export async function GET(request: NextRequest) {
  const t = startTiming(request);
  const db = freshDb();
  const { searchParams } = new URL(request.url);

  if (searchParams.get('mode') === 'baselines') {
    const bl = await db.anomalyBaseline.findMany({ orderBy: { lastUpdated: 'desc' }, take: 50 });
    await db.$disconnect();
    return applyTimingHeaders(NextResponse.json({ baselines: bl }), t);
  }

  const detections = await db.anomalyDetection.findMany({
    orderBy: { createdAt: 'desc' }, take: 50,
    where: searchParams.get('unacked') === 'true' ? { acknowledged: false } : undefined,
  });
  const total = await db.anomalyDetection.count();
  const unacked = await db.anomalyDetection.count({ where: { acknowledged: false } });
  await db.$disconnect();
  return applyTimingHeaders(NextResponse.json({ detections, total, unacknowledged: unacked }), t);
}
