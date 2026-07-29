"""Data models for the Compliance Swarm client SDK.

Pydantic models mirroring the gateway schemas so the frontend
can work with typed objects without importing the backend.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field


class RemediationMode(str, Enum):
    DRY_RUN = "dry-run"
    STAGED = "staged"
    APPLY = "apply"


class EventPhase(str, Enum):
    IDENTIFIED = "identified"
    ASSIGNED = "assigned"
    IN_PROGRESS = "in_progress"
    RESOLVED = "resolved"
    VERIFIED = "verified"


class ComplianceDomain(str, Enum):
    ENCRYPTION = "encryption"
    CUSTOMS_DOCUMENTATION = "customs_documentation"
    EDI_FORMAT = "edi_format"
    DATA_RETENTION = "data_retention"
    ACCESS_CONTROL = "access_control"


class AuditSeverity(str, Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFO = "info"


class Jurisdiction(str, Enum):
    GDPR = "GDPR"
    CCPA = "CCPA"
    LGPD = "LGPD"
    PDPA = "PDPA"
    PIPA = "PIPA"


# ── Response models ────────────────────────────────────────────

class AnonymisedField(BaseModel):
    field_name: str
    field_category: str
    token: str
    original_hash: str


class ManifestAnonymiseResponse(BaseModel):
    manifest_id: str
    anonymised_manifest: dict[str, Any]
    fields_processed: int
    records: list[AnonymisedField]


class ScanMatch(BaseModel):
    field_name: str
    category: str
    description: str
    mandatory: bool
    retention_max_days: int
    jurisdictions: list[str]


class ScanResponse(BaseModel):
    total_fields: int
    pii_fields_found: int
    matches: dict[str, list[ScanMatch]]


class FreeTextAnonymiseResponse(BaseModel):
    manifest_id: str
    anonymised_text: str
    patterns_found: int
    records: list[AnonymisedField]


class AuditFindingSummary(BaseModel):
    finding_ref: str
    severity: str
    affected_row_count: int
    title: str
    query_id: Optional[str] = None
    error: Optional[str] = None


class RunAuditResponse(BaseModel):
    queries_executed: int
    findings_count: int
    findings: list[AuditFindingSummary]


class ProfileComplianceInfo(BaseModel):
    partner_id: str
    partner_name: str
    edi_standard: Optional[str] = None
    encryption_enabled: bool
    encryption_protocol: Optional[str] = None
    issues: list[str]
    last_audit_at: Optional[str] = None
    compliant: bool


class AuditQueryInfo(BaseModel):
    query_id: str
    name: str
    domain: str
    severity: str
    risk_category: str
    affected_tables: list[str]
    description: str
    remediation_hint: str


class GeneratedPolicy(BaseModel):
    policy_id: Optional[str] = None
    name: str
    action: Optional[str] = None
    enabled: Optional[bool] = None
    status: str
    mode: str
    finding_ref: Optional[str] = None
    severity: Optional[str] = None


class GeneratePoliciesResponse(BaseModel):
    findings_processed: int
    policies_generated: int
    mode: str
    policies: list[GeneratedPolicy]


class ProfileChange(BaseModel):
    from_value: Any
    to_value: Any


class ProfileUpdateResult(BaseModel):
    partner_id: str
    partner_name: Optional[str] = None
    action: str
    changes: dict[str, ProfileChange]
    mode: str


class UpdateEDIResponse(BaseModel):
    profiles_processed: int
    mode: str
    results: list[ProfileUpdateResult]


class MTTRTimelineEvent(BaseModel):
    id: str
    finding_id: str
    phase: str
    timestamp: str
    assignee: Optional[str] = None
    duration_seconds: Optional[float] = None


class FindingMTTRResponse(BaseModel):
    finding_id: str
    mttr_hours: Optional[float] = None
    event_count: int
    events: list[MTTRTimelineEvent]


class MTTRReportResponse(BaseModel):
    total_findings: int = 0
    avg_mttr_hours: float = 0.0
    p95_mttr_hours: float = 0.0
    by_severity: dict[str, Any] = Field(default_factory=dict)
    by_risk_category: dict[str, Any] = Field(default_factory=dict)
    period_from: Optional[str] = None
    period_to: Optional[str] = None


class OpenFindingMTTR(BaseModel):
    finding_id: str
    finding_ref: str
    severity: str
    risk_category: str
    title: str
    mttr_hours: float
    current_phase: str
    age_hours: float


class FindingsListResponse(BaseModel):
    total: int
    findings: list[dict[str, Any]]


class PoliciesListResponse(BaseModel):
    total: int
    policies: list[dict[str, Any]]


class ComplianceReportResponse(BaseModel):
    id: str
    report_period_start: str
    report_period_end: str
    total_findings: int
    critical_count: int
    high_count: int
    medium_count: int
    low_count: int
    remediated_count: int
    avg_mttr_hours: float
    summary: Optional[str] = None


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str = "1.0.0"
    tools: dict[str, str]
