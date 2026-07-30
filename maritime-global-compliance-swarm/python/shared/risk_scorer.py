"""
Composite Risk Scoring Engine for Maritime Compliance Findings.

Implements a multi-dimensional weighted risk scoring model that combines
severity, jurisdiction, data sensitivity, exposure breadth, and temporal
urgency into a single numeric Composite Risk Score (CRS).

CRS = w_sev * S_sev + w_jur * S_jur + w_sens * S_sens + w_exp * S_exp + w_urg * S_urg

Each sub-score is normalised to [0.0, 1.0], and weights sum to 1.0.
The final CRS is mapped to a risk level: CRITICAL (>=0.8), HIGH (>=0.6),
MEDIUM (>=0.4), LOW (>=0.2), INFO (<0.2).
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from .models import AuditSeverity, FindingState, RiskCategory


# ---------------------------------------------------------------------------
# Sub-score dimension definitions
# ---------------------------------------------------------------------------

class JurisdictionRisk(str, Enum):
    """Risk weight multiplier by jurisdiction — reflects enforcement rigour
    and penalty severity across the five supported jurisdictions."""
    GDPR = "gdpr"          # EU: highest fines (4% global turnover), strict DPA requirements
    CCPA = "ccpa"          # California: high litigative risk, private right of action
    LGPD = "lgpd"          # Brazil: growing enforcement, ANPD active since 2021
    PDPA = "pdpa"          # Singapore: moderate fines, proactive enforcement
    PIPA = "pipa"          # South Korea: PIPC active, criminal penalties possible


class DataSensitivityLevel(str, Enum):
    """Classification of the data types involved in a finding."""
    FINANCIAL = "financial"            # Bank accounts, credit cards, transaction records
    GOVERNMENT_ID = "government_id"    # Passport, national ID, visa, work permit
    HEALTH = "health"                  # Medical records, vaccination status, disability
    SPECIAL_CATEGORY = "special"       # Race, religion, political opinion, biometric
    CONTACT = "contact"                # Email, phone, address
    LOCATION = "location"              # GPS, port of call, vessel route
    COMMERCIAL = "commercial"          # Cargo manifest, freight rates, trade terms
    OPERATIONAL = "operational"        # EDI connection params, system configs


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class RiskWeightConfig:
    """Weights for each risk dimension. Must sum to 1.0."""
    severity: float = 0.30
    jurisdiction: float = 0.20
    data_sensitivity: float = 0.20
    exposure_breadth: float = 0.15
    temporal_urgency: float = 0.15

    def __post_init__(self):
        total = self.severity + self.jurisdiction + self.data_sensitivity + \
                self.exposure_breadth + self.temporal_urgency
        if abs(total - 1.0) > 0.01:
            raise ValueError(f"Risk weights must sum to 1.0, got {total:.4f}")


# Default weight configuration
DEFAULT_WEIGHTS = RiskWeightConfig()


# ---------------------------------------------------------------------------
# Sub-score lookup tables
# ---------------------------------------------------------------------------

SEVERITY_SCORES: dict[str, float] = {
    AuditSeverity.CRITICAL.value: 1.0,
    AuditSeverity.HIGH.value: 0.8,
    AuditSeverity.MEDIUM.value: 0.5,
    AuditSeverity.LOW.value: 0.3,
    AuditSeverity.INFO.value: 0.1,
}

JURISDICTION_SCORES: dict[str, float] = {
    JurisdictionRisk.GDPR.value: 1.0,       # Highest enforcement
    JurisdictionRisk.CCPA.value: 0.85,       # High litigative risk
    JurisdictionRisk.LGPD.value: 0.70,       # Growing enforcement
    JurisdictionRisk.PIPA.value: 0.65,       # Criminal penalties
    JurisdictionRisk.PDPA.value: 0.50,       # Moderate but proactive
}

DATA_SENSITIVITY_SCORES: dict[str, float] = {
    DataSensitivityLevel.SPECIAL_CATEGORY.value: 1.0,   # Highest risk
    DataSensitivityLevel.GOVERNMENT_ID.value: 0.95,
    DataSensitivityLevel.HEALTH.value: 0.90,
    DataSensitivityLevel.FINANCIAL.value: 0.80,
    DataSensitivityLevel.CONTACT.value: 0.60,
    DataSensitivityLevel.LOCATION.value: 0.50,
    DataSensitivityLevel.COMMERCIAL.value: 0.40,
    DataSensitivityLevel.OPERATIONAL.value: 0.25,
}

# Mapping from RiskCategory to approximate data sensitivity
RISK_CATEGORY_SENSITIVITY: dict[str, DataSensitivityLevel] = {
    RiskCategory.PII_EXPOSURE.value: DataSensitivityLevel.GOVERNMENT_ID,
    RiskCategory.UNENCRYPTED_TRANSMISSION.value: DataSensitivityLevel.FINANCIAL,
    RiskCategory.MISSING_CUSTOMS_DOC.value: DataSensitivityLevel.COMMERCIAL,
    RiskCategory.EDI_NON_COMPLIANCE.value: DataSensitivityLevel.OPERATIONAL,
    RiskCategory.DATA_RETENTION_VIOLATION.value: DataSensitivityLevel.CONTACT,
    RiskCategory.ACCESS_CONTROL_BREACH.value: DataSensitivityLevel.FINANCIAL,
    RiskCategory.CERT_EXPIRY.value: DataSensitivityLevel.OPERATIONAL,
}


# ---------------------------------------------------------------------------
# Risk level mapping
# ---------------------------------------------------------------------------

class CompositeRiskLevel(str, Enum):
    CRITICAL = "critical"     # >= 0.80
    HIGH = "high"             # >= 0.60
    MEDIUM = "medium"         # >= 0.40
    LOW = "low"               # >= 0.20
    INFO = "info"             # < 0.20


def _map_risk_level(score: float) -> CompositeRiskLevel:
    if score >= 0.80:
        return CompositeRiskLevel.CRITICAL
    elif score >= 0.60:
        return CompositeRiskLevel.HIGH
    elif score >= 0.40:
        return CompositeRiskLevel.MEDIUM
    elif score >= 0.20:
        return CompositeRiskLevel.LOW
    else:
        return CompositeRiskLevel.INFO


# ---------------------------------------------------------------------------
# Input model
# ---------------------------------------------------------------------------

@dataclass
class RiskScoreInput:
    """All inputs required to compute a composite risk score."""
    severity: str = AuditSeverity.MEDIUM.value
    jurisdiction: str = JurisdictionRisk.GDPR.value
    data_sensitivity: str = DataSensitivityLevel.CONTACT.value
    risk_category: str = RiskCategory.EDI_NON_COMPLIANCE.value
    affected_record_count: int = 1
    affected_partner_count: int = 1
    affected_jurisdiction_count: int = 1
    created_at: Optional[datetime] = None
    sla_deadline: Optional[datetime] = None
    finding_state: str = FindingState.DETECTED.value

    # Optional overrides
    override_weights: Optional[RiskWeightConfig] = None
    override_sensitivity: Optional[str] = None  # explicit data sensitivity


# ---------------------------------------------------------------------------
# Core scorer
# ---------------------------------------------------------------------------

@dataclass
class CompositeRiskScore:
    """Output of the composite risk scoring calculation."""
    score: float                          # Final CRS in [0.0, 1.0]
    risk_level: CompositeRiskLevel        # Mapped risk level
    severity_score: float                 # Sub-score: severity dimension
    jurisdiction_score: float             # Sub-score: jurisdiction dimension
    sensitivity_score: float              # Sub-score: data sensitivity dimension
    exposure_score: float                 # Sub-score: exposure breadth dimension
    urgency_score: float                  # Sub-score: temporal urgency dimension
    weights: RiskWeightConfig             # Weights used for this calculation
    scored_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    input_summary: dict = field(default_factory=dict)


class RiskScorer:
    """Computes composite risk scores for compliance findings.

    The scorer normalises five risk dimensions into [0.0, 1.0] sub-scores,
    applies configurable weights, and produces a single Composite Risk Score.
    """

    def __init__(self, weights: Optional[RiskWeightConfig] = None):
        self.weights = weights or DEFAULT_WEIGHTS

    def score(self, inp: RiskScoreInput) -> CompositeRiskScore:
        """Compute the composite risk score from the given input."""
        w = inp.override_weights or self.weights

        # 1. Severity sub-score (direct lookup)
        s_sev = SEVERITY_SCORES.get(inp.severity.lower(), 0.5)

        # 2. Jurisdiction sub-score (direct lookup)
        s_jur = JURISDICTION_SCORES.get(inp.jurisdiction.lower(), 0.5)

        # 3. Data sensitivity sub-score
        sensitivity_key = (inp.override_sensitivity or
                           RISK_CATEGORY_SENSITIVITY.get(inp.risk_category.lower(),
                                                          DataSensitivityLevel.OPERATIONAL).value)
        s_sens = DATA_SENSITIVITY_SCORES.get(sensitivity_key.lower(), 0.5)

        # 4. Exposure breadth sub-score
        # Combine record count, partner count, and jurisdiction count
        # using logarithmic scaling to prevent any single dimension from
        # dominating
        record_factor = min(1.0, math.log2(max(1, inp.affected_record_count) + 1) / 10.0)
        partner_factor = min(1.0, math.log2(max(1, inp.affected_partner_count) + 1) / 5.0)
        jur_factor = min(1.0, inp.affected_jurisdiction_count / 5.0)
        s_exp = 0.4 * record_factor + 0.3 * partner_factor + 0.3 * jur_factor

        # 5. Temporal urgency sub-score
        now = datetime.now(timezone.utc)
        s_urg = 0.3  # baseline urgency

        if inp.created_at:
            age_hours = max(0, (now - inp.created_at).total_seconds() / 3600)
            # Age factor: ramps up from 0.3 to 1.0 over 72 hours
            age_factor = min(1.0, 0.3 + 0.7 * (age_hours / 72.0))
            s_urg = age_factor

        if inp.sla_deadline:
            remaining_hours = max(0, (inp.sla_deadline - now).total_seconds() / 3600)
            if remaining_hours == 0:
                s_urg = 1.0  # SLA breached
            elif remaining_hours < 4:
                s_urg = max(s_urg, 0.9)  # Imminent breach
            elif remaining_hours < 8:
                s_urg = max(s_urg, 0.7)

        # If already in remediation, reduce urgency slightly
        if inp.finding_state in (FindingState.IN_REMEDIATION.value,
                                  FindingState.AWAITING_VERIFICATION.value,
                                  FindingState.VERIFIED.value):
            s_urg *= 0.6

        # Compute weighted composite
        crs = (w.severity * s_sev +
               w.jurisdiction * s_jur +
               w.data_sensitivity * s_sens +
               w.exposure_breadth * s_exp +
               w.temporal_urgency * s_urg)

        # Clamp to [0.0, 1.0]
        crs = max(0.0, min(1.0, crs))
        risk_level = _map_risk_level(crs)

        return CompositeRiskScore(
            score=round(crs, 4),
            risk_level=risk_level,
            severity_score=round(s_sev, 4),
            jurisdiction_score=round(s_jur, 4),
            sensitivity_score=round(s_sens, 4),
            exposure_score=round(s_exp, 4),
            urgency_score=round(s_urg, 4),
            weights=w,
            input_summary={
                "severity": inp.severity,
                "jurisdiction": inp.jurisdiction,
                "risk_category": inp.risk_category,
                "affected_records": inp.affected_record_count,
                "affected_partners": inp.affected_partner_count,
                "finding_state": inp.finding_state,
            },
        )

    def score_finding(self, finding: object) -> CompositeRiskScore:
        """Convenience method: score an ORM AuditFinding directly."""
        return self.score(RiskScoreInput(
            severity=getattr(finding, "severity", AuditSeverity.MEDIUM.value),
            jurisdiction=getattr(finding, "jurisdiction", JurisdictionRisk.GDPR.value),
            risk_category=getattr(finding, "risk_category", RiskCategory.EDI_NON_COMPLIANCE.value),
            affected_record_count=getattr(finding, "evidence_count", 1),
            finding_state=getattr(finding, "status", FindingState.DETECTED.value),
            created_at=getattr(finding, "created_at", None),
        ))