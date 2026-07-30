/**
 * POST /api/intelligence/risk-score
 *
 * Phase 2.2: Context-Aware Risk Scoring.
 * Accepts a finding and returns an adjusted risk score
 * based on multiple context factors.
 *
 * Body: { findingRef, severity, riskCategory, jurisdiction?, weatherContext? }
 * Returns: { baseScore, adjustedScore, factors, compositeScore }
 */

import { NextRequest, NextResponse } from 'next/server';
import { startTiming, applyTimingHeaders } from '@/lib/timing-headers';

// Re-identification difficulty weights (higher = harder to re-identify, lower risk)
const REID_DIFFICULTY: Record<string, number> = {
  passport_number: 3, national_id: 3,
  email: 7, phone: 6, name: 8,
  address: 5, date_of_birth: 4,
};

// Jurisdiction-specific multipliers
const JURISDICTION_WEIGHT: Record<string, number> = {
  GDPR: 1.5,
  CCPA: 1.3,
  LGPD: 1.4,
  PDPA: 1.3,
  default: 1.0,
};

// Severity base scores
const SEVERITY_BASE: Record<string, number> = {
  critical: 9, high: 7, medium: 4, low: 2, info: 1,
};

export async function POST(request: NextRequest) {
  const t = startTiming(request);

  try {
    const body = await request.json();
    const severity = (body.severity as string) ?? 'medium';
    const riskCategory = (body.riskCategory as string) ?? 'pii_exposure';
    const jurisdiction = (body.jurisdiction as string) ?? 'GDPR';
    const weatherContext = (body.weatherContext as string) ?? 'null';

    const baseScore = SEVERITY_BASE[severity] ?? 4;
    const jurisdictionMult = JURISDICTION_WEIGHT[jurisdiction] ?? 1.0;

    // Weather reduction (force majeure)
    let weatherMult = 1.0;
    if (weatherContext !== 'null') {
      try {
        const wx = JSON.parse(weatherContext);
        if (wx.severity === 'severe' || wx.force_majeure) weatherMult = 0.5;
        else if (wx.severity === 'moderate') weatherMult = 0.8;
      } catch { /* ignore */ }
    }

    // Category-specific adjustments
    const categoryMult: Record<string, number> = {
      pii_exposure: 1.3, unencrypted_transmission: 1.2, missing_customs_doc: 1.1,
      edi_non_compliance: 1.0, data_retention_violation: 1.2, access_control_breach: 1.4,
      cert_expiry: 0.9, carbon_reporting: 0.8,
    };

    const compositeScore = Math.min(10, Math.round(baseScore * jurisdictionMult * weatherMult * (categoryMult[riskCategory] ?? 1.0) * 10) / 10);

    return applyTimingHeaders(NextResponse.json({
      findingRef: body.findingRef ?? 'unknown',
      severity, riskCategory, jurisdiction,
      baseScore,
      adjustedScore: compositeScore,
      factors: {
        baseSeverity: baseScore,
        jurisdictionMultiplier: jurisdictionMult,
        weatherMultiplier: weatherMult,
        categoryMultiplier: categoryMult[riskCategory] ?? 1.0,
      },
      compositeScore,
    }), t);

  } catch (err) {
    return applyTimingHeaders(NextResponse.json({ error: String(err) }, { status: 500 }), t);
  }
}
