/**
 * POST /api/intelligence/predictive-mttr
 *
 * Phase 2.3: Predictive MTTR.
 * Uses historical finding data + a simple linear regression
 * to predict MTTR for a given risk category + severity.
 *
 * Body: { riskCategory: string, severity?: string }
 * Returns: { prediction, confidence, features, history }
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { startTiming, applyTimingHeaders, timedRead } from '@/lib/timing-headers';

function freshDb() { return new PrismaClient({ log: [] }); }

// Simple linear regression
function linearRegression(points: { x: number; y: number }[]): { slope: number; intercept: number; r2: number } {
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: points[0]?.y ?? 0, r2: 0 };

  const sumX = points.reduce((s, p) => s + p.x, 0);
  const sumY = points.reduce((s, p) => s + p.y, 0);
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
  const sumX2 = points.reduce((s, p) => s + p.x * p.x, 0);

  const denom = n * sumX2 - sumX * sumX;
  if (Math.abs(denom) < 1e-10) return { slope: 0, intercept: sumY / n, r2: 0 };

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  // R-squared
  const yMean = sumY / n;
  const ssTot = points.reduce((s, p) => s + (p.y - yMean) ** 2, 0);
  const ssRes = points.reduce((s, p) => s + (p.y - (intercept + slope * p.x)) ** 2, 0);
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;

  return { slope, intercept, r2 };
}

export async function POST(request: NextRequest) {
  const t = startTiming(request);
  const db = freshDb();

  try {
    const body = await request.json();
    const riskCategory = (body.riskCategory as string) ?? 'unencrypted_transmission';
    const severity = (body.severity as string);

    // Fetch historical MTTR events for this category
    const where: Record<string, unknown> = { phase: 'resolved' };
    if (riskCategory !== 'all') (where.riskCategory as string) = riskCategory;
    if (severity) (where.severity as string) = severity;

    // Get finding refs with resolved MTTR
    const mttrEvents = await timedRead(t, () => db.mttrEvent.findMany({
      where,
      orderBy: { eventTs: 'asc' },
    }));

    if (mttrEvents.length === 0) {
      await db.$disconnect();
      return applyTimingHeaders(NextResponse.json({
        prediction: null, confidence: 0,
        message: 'No resolved findings for this category',
        riskCategory, severity,
        sampleCount: 0,
    }), t);
    }

    // Build regression: x = index (time proxy), y = mttr_hours
    const points = mttrEvents.map((e, i) => ({ x: i, y: e.eventTs.getTime() }));
    // We need actual MTTR values — from compliance findings
    const findings = await timedRead(t, () => db.complianceFinding.findMany({
      where: { riskCategory, status: 'remediated', mttrHours: { not: null } },
      select: { mttrHours: true, detectedAt: true },
      orderBy: { detectedAt: 'asc' },
    }));

    const validFindings = findings.filter(f => f.mttrHours !== null && f.mttrHours > 0);
    const regressionPoints = validFindings.map((f, i) => ({ x: i, y: f.mttrHours as number }));

    if (regressionPoints.length < 2) {
    const avgMttr = validFindings.length > 0
      ? validFindings.reduce((s, f) => s + (f.mttrHours as number), 0) / validFindings.length
      : 0;
    await db.$disconnect();
    return applyTimingHeaders(NextResponse.json({
      prediction: { mttrHours: Math.round(avgMttr * 10) / 10 },
      confidence: validFindings.length >= 1 ? 0.3 : 0,
      message: 'Insufficient data for regression, using average',
      riskCategory, severity, sampleCount: validFindings.length,
      features: { avg_mttr: Math.round(avgMttr * 10) / 10, sample_count: validFindings.length },
    }), t);
  }

    const { slope, intercept, r2 } = linearRegression(regressionPoints);
    const predictedMttr = Math.max(0.5, intercept + slope * regressionPoints.length);
    const confidence = Math.min(1, Math.max(0, r2));

    // Persist prediction
    await db.predictiveMttr.create({
      data: {
        riskCategory, severity: severity ?? 'all',
        predictedMttrH: Math.round(predictedMttr * 10) / 10,
        confidence: Math.round(confidence * 100) / 100,
        features: JSON.stringify({ avg_mttr: Math.round((regressionPoints.reduce((s, p) => s + p.y, 0) / regressionPoints.length) * 10) / 10, p95: Math.max(...regressionPoints.map(p => p.y)), sample_count: regressionPoints.length, trend_slope: Math.round(slope * 100) / 100 }),
      },
    });

    const total = await timedRead(t, () => db.predictiveMttr.count());

    await db.$disconnect();
    return applyTimingHeaders(NextResponse.json({
      prediction: { mttrHours: Math.round(predictedMttr * 10) / 10 },
      confidence,
      riskCategory, severity: severity ?? 'all',
      sampleCount: regressionPoints.length,
      trend: { slope: Math.round(slope * 100) / 100, r2: Math.round(r2 * 100) / 100, direction: slope > 0 ? 'worsening' : slope < 0 ? 'improving' : 'stable' },
      totalPredictions: total,
    }), t);

  } catch (err) {
    await db.$disconnect();
    return applyTimingHeaders(NextResponse.json({ error: String(err) }, { status: 500 }), t);
  }
}

export async function GET(request: NextRequest) {
  const t = startTiming(request);
  const db = freshDb();

  const predictions = await timedRead(t, () => db.predictiveMttr.findMany({
    orderBy: { createdAt: 'desc' }, take: 50,
  }));
  const total = await timedRead(t, () => db.predictiveMttr.count());

  await db.$disconnect();
  return applyTimingHeaders(NextResponse.json({ predictions, total }), t);
}
