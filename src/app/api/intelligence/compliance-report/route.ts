/**
 * POST /api/intelligence/compliance-report
 *
 * Phase 2.4: Automated Compliance Report Generation.
 * Generates a report for a given period, computing
 * aggregate statistics from the database.
 *
 * Body: { reportType: 'daily' | 'weekly' | 'monthly' }
 * Returns: { report, findings, mttr, anomalies }
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { startTiming, applyTimingHeaders, timedRead, timedWrite } from '@/lib/timing-headers';

function freshDb() { return new PrismaClient({ log: [] }); }

function getPeriodDates(reportType: string) {
    const now = new Date();
    const end = new Date(now);
    const start = new Date(now);

    switch (reportType) {
      case 'daily':
        start.setHours(0, 0, 0, 0);
        break;
      case 'weekly':
        start.setDate(start.getDate() - 7);
        start.setHours(0, 0, 0, 0);
        break;
      case 'monthly':
        start.setMonth(start.getMonth() - 1);
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
        break;
    }
    return { start, end };
  }

export async function POST(request: NextRequest) {
  const t = startTiming(request);
  const db = freshDb();

  try {
    const body = await request.json();
    const reportType = (body.reportType as string) ?? 'daily';
    const { start, end } = getPeriodDates(reportType);

    // Gather stats for the period
    const [totalFindings, openFindings, resolvedFindings, criticalOpen, anomalies] = await Promise.all([
      timedRead(t, () => db.complianceFinding.count({ where: { detectedAt: { gte: start, lte: end } } })),
      timedRead(t, () => db.complianceFinding.count({ where: { detectedAt: { gte: start, lte: end }, status: 'open' } })),
      timedRead(t, () => db.complianceFinding.count({ where: { detectedAt: { gte: start, lte: end }, status: 'remediated' } })),
      timedRead(t, () => db.complianceFinding.count({ where: { detectedAt: { gte: start, lte: end }, severity: 'critical', status: 'open' } })),
      timedRead(t, () => db.anomalyDetection.count({ where: { createdAt: { gte: start, lte: end } } })),
    ]);

    // Average MTTR
    const resolved = await timedRead(t, () => db.complianceFinding.findMany({
      where: { detectedAt: { gte: start, lte: end }, mttrHours: { not: null, gt: 0 } },
      select: { mttrHours: true },
    }));
    const avgMttr = resolved.length > 0 ? resolved.reduce((s, f) => s + (f.mttrHours as number), 0) / resolved.length : 0;
    const complianceRate = totalFindings > 0 ? ((resolvedFindings / totalFindings) * 100) : 100;

    // Top risk categories
    const byCategory = await timedRead(t, () => db.complianceFinding.groupBy({
      by: ['riskCategory'],
      where: { detectedAt: { gte: start, lte: end } },
      _count: true,
      orderBy: { _count: { id: 'desc' } },
      take: 10,
    }));

    // Persist report
    const report = await timedWrite(t, () => db.complianceReport.create({
      data: {
        reportType, periodStart: start, periodEnd: end,
        totalFindings, resolvedFindings, openFindings,
        avgMttrHours: Math.round(avgMttr * 10) / 10,
        complianceRate: Math.round(complianceRate * 10) / 10,
        topRiskCategories: JSON.stringify(byCategory.map(c => ({ category: c.riskCategory, count: c._count.id }))),
        anomaliesInPeriod: anomalies,
      },
    }));

    await db.$disconnect();
    return applyTimingHeaders(NextResponse.json({
      report: { id: report.id, type: reportType, period: { start: start.toISOString(), end: end.toISOString() } },
      summary: { totalFindings, openFindings, resolvedFindings, criticalOpen, avgMttrHours: Math.round(avgMttr * 10) / 10, complianceRate: Math.round(complianceRate * 10) / 10, anomaliesInPeriod: anomalies },
      topRiskCategories: byCategory.map(c => ({ category: c.riskCategory, count: c._count.id })),
    }), t);

  } catch (err) {
    await db.$disconnect();
    return applyTimingHeaders(NextResponse.json({ error: String(err) }, { status: 500 }), t);
  }
}

export async function GET(request: NextRequest) {
  const t = startTiming(request);
  const db = freshDb();

  const reports = await timedRead(t, () => db.complianceReport.findMany({
    orderBy: { generatedAt: 'desc' }, take: 20,
  }));
  const total = await timedRead(t, () => db.complianceReport.count());

  await db.$disconnect();
  return applyTimingHeaders(NextResponse.json({ reports, total }), t);
}
