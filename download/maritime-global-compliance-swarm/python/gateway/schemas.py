"""Pydantic request/response schemas for the Compliance Swarm API gateway.

All schemas use strict typing and provide OpenAPI documentation.
Schemas mirror the ORM models but are decoupled for API layer cleanliness.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field


# ── Enum wrappers (serialisable as strings) ──────────────────────────────

class PIIFieldCategory(str, Enum):
    CONSIGNEE_IDENTITY = "consignee_identity"
    SHIPPER_IDENTITY = "shipper_identity"
    CONTACT_INFO = "contact_info"
    FINANCIAL_ID = "financial_id"
    GOVERNMENT_ID = "government_id"
    LOCATION = "location"


class AuditSeverity(str, Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFO = "info"


class AuditStatus(str, Enum):
    OPEN = "open"
    IN_PROGRESS = "in_progress"
    REMEDIATED = "remediated"
    ACCEPTED_RISK = "accepted_risk"
    FALSE_POSITIVE = "false_positive"


class EDIStandard(str, Enum):
    EDIFACT = "EDIFACT"
    ANSI_X12 = "ANSI_X12"
    BAPLIE = "BAPLIE"
    VGM = "VGM"
    COPARN = "COPARN"
    IFTMBC = "IFTMBC"
    CUSTOMS = "CUSTOMS"


class PolicyAction(str, Enum):
    TOKENISE = "tokenise"
    REDACT = "redact"
    GENERALISE = "generalise"
    PSEUDONYMISE = "pseudonymise"
    ENCRYPT = "encrypt"
    TRUNCATE = "truncate"


class RiskCategory(str, Enum):
    PII_EXPOSURE = "pii_exposure"
    UNENCRYPTED_TRANSIMISSION = "unencrypted_transmission"
    MISSING_CUSTOMS_DOC = "missing_customs_doc"
    EDI_NON_COMPLIANCE = "edi_non_compliance"
    DATA_RETENTION_VIOLATION = "data_retention_violation"
    ACCESS_CONTROL_BREACH = "access_control_breach"
    CERT_EXPIRY = "cert_expiry"


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


class Jurisdiction(str, Enum):
    GDPR = "GDPR"
    CCPA = "CCPA"
    LGPD = "LGPD"
    PDPA = "PDPA"
    PIPA = "PIPA"


# ── Anonymiser schemas ────────────────────────────────────────────────────

class ManifestAnonymiseRequest(BaseModel):
    """Request to anonymise a shipping manifest."""
    manifest_id: str = Field(..., min_length=1, description="Unique manifest identifier (e.g. B/L number)")
    manifest: dict[str, Any] = Field(..., description="Raw manifest fields with potential PII")
    free_text_fields: list[str] = Field(default_factory=list, description="Keys in manifest containing free-text to scan")


class AnonymisedField(BaseModel):
    """Result of anonymising a single field."""
    field_name: str
    field_category: str
    token: str
    original_hash: str


class ManifestAnonymiseResponse(BaseModel):
    """Response from manifest anonymisation."""
    manifest_id: str
    anonymised_manifest: dict[str, Any]
    fields_processed: int
    records: list[AnonymisedField]


class ScanRequest(BaseModel):
    """Request to scan a manifest for PII without anonymising."""
    manifest: dict[str, Any] = Field(..., description="Manifest fields to scan")
    jurisdiction: Optional[Jurisdiction] = Field(None, description="Filter rules by jurisdiction")


class ScanMatch(BaseModel):
    """A single PII match from scanning."""
    field_name: str
    category: str
    description: str
    mandatory: bool
    retention_max_days: int
    jurisdictions: list[str]


class ScanResponse(BaseModel):
    """PII scan results for a manifest."""
    total_fields: int
    pii_fields_found: int
    matches: dict[str, list[ScanMatch]]


class FreeTextAnonymiseRequest(BaseModel):
    """Request to anonymise free-text content."""
    manifest_id: str = Field(..., min_length=1)
    text: str = Field(..., min_length=1, description="Free-text content to scan and anonymise")


class FreeTextAnonymiseResponse(BaseModel):
    """Response from free-text anonymisation."""
    manifest_id: str
    anonymised_text: str
    patterns_found: int
    records: list[AnonymisedField]


# ── Auditor schemas ──────────────────────────────────────────────────────

class RunAuditRequest(BaseModel):
    """Request to trigger a compliance audit run."""
    domain: Optional[ComplianceDomain] = Field(None, description="Limit to a specific compliance domain")
    min_severity: Optional[AuditSeverity] = Field(None, description="Minimum severity to include")


class AuditFindingSummary(BaseModel):
    """Summary of a single audit finding."""
    finding_ref: str
    severity: str
    affected_row_count: int
    title: str
    query_id: Optional[str] = None
    error: Optional[str] = None


class RunAuditResponse(BaseModel):
    """Response from an audit run."""
    queries_executed: int
    findings_count: int
    findings: list[AuditFindingSummary]


class AuditQueryInfo(BaseModel):
    """Metadata about a single audit query."""
    query_id: str
    name: str
    domain: str
    severity: str
    risk_category: str
    affected_tables: list[str]
    description: str
    remediation_hint: str


class ProfileComplianceInfo(BaseModel):
    """Compliance status of a single EDI connection profile."""
    partner_id: str
    partner_name: str
    edi_standard: Optional[str] = None
    encryption_enabled: bool
    encryption_protocol: Optional[str] = None
    issues: list[str]
    last_audit_at: Optional[datetime] = None
    compliant: bool


# ── Remediation schemas ───────────────────────────────────────────────────

class GeneratePoliciesRequest(BaseModel):
    """Request to generate remediation policies."""
    finding_refs: Optional[list[str]] = Field(None, description="Specific findings to remediate (None = all open)")
    mode: RemediationMode = Field(RemediationMode.DRY_RUN, description="dry-run | staged | apply")


class GeneratedPolicy(BaseModel):
    """Summary of a generated or proposed policy."""
    policy_id: Optional[str] = None
    name: str
    action: Optional[str] = None
    enabled: Optional[bool] = None
    status: str
    mode: str
    finding_ref: Optional[str] = None
    severity: Optional[str] = None


class GeneratePoliciesResponse(BaseModel):
    """Response from policy generation."""
    findings_processed: int
    policies_generated: int
    mode: str
    policies: list[GeneratedPolicy]


class UpdateEDIRequest(BaseModel):
    """Request to update EDI profiles based on findings."""
    finding_refs: Optional[list[str]] = Field(None)
    mode: RemediationMode = Field(RemediationMode.DRY_RUN)


class ProfileChange(BaseModel):
    """A single change applied to a profile."""
    from_value: Any
    to_value: Any


class ProfileUpdateResult(BaseModel):
    """Result of updating a single partner profile."""
    partner_id: str
    partner_name: Optional[str] = None
    action: str
    changes: dict[str, ProfileChange]
    mode: str


class UpdateEDIResponse(BaseModel):
    """Response from EDI profile updates."""
    profiles_processed: int
    mode: str
    results: list[ProfileUpdateResult]


# ── MTTR schemas (proxy to Golang) ───────────────────────────────────────

class IngestEventRequest(BaseModel):
    """Request to record a telemetry event for MTTR tracking."""
    finding_id: str = Field(..., min_length=1)
    phase: EventPhase
    assignee: Optional[str] = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class MTTRTimelineEvent(BaseModel):
    """A single event in a finding's timeline."""
    id: str
    finding_id: str
    phase: str
    timestamp: str
    assignee: Optional[str] = None
    duration_seconds: Optional[float] = None


class FindingMTTRResponse(BaseModel):
    """MTTR data for a single finding."""
    finding_id: str
    mttr_hours: Optional[float] = None
    event_count: int
    events: list[MTTRTimelineEvent]


class MTTRReportResponse(BaseModel):
    """Aggregate MTTR report."""
    total_findings: int = 0
    avg_mttr_hours: float = 0.0
    p95_mttr_hours: float = 0.0
    by_severity: dict[str, Any] = Field(default_factory=dict)
    by_risk_category: dict[str, Any] = Field(default_factory=dict)
    period_from: Optional[str] = None
    period_to: Optional[str] = None


class OpenFindingMTTR(BaseModel):
    """An open finding with its current MTTR."""
    finding_id: str
    finding_ref: str
    severity: str
    risk_category: str
    title: str
    mttr_hours: float
    current_phase: str
    age_hours: float


# ── Findings / Policies query schemas ─────────────────────────────────────

class FindingsListResponse(BaseModel):
    """List of audit findings with optional filtering."""
    total: int
    findings: list[dict[str, Any]]


class PoliciesListResponse(BaseModel):
    """List of masking policies."""
    total: int
    policies: list[dict[str, Any]]


class ComplianceReportResponse(BaseModel):
    """A compliance summary report."""
    id: str
    report_period_start: datetime
    report_period_end: datetime
    total_findings: int
    critical_count: int
    high_count: int
    medium_count: int
    low_count: int
    remediated_count: int
    avg_mttr_hours: float
    summary: Optional[str] = None


# ── Health / generic ──────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    """Health check response."""
    status: str
    service: str
    version: str = "1.0.0"
    tools: dict[str, str]


class ErrorResponse(BaseModel):
    """Standard error response."""
    error: str
    detail: Optional[str] = None
