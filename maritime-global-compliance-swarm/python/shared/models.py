"""Shared domain models for the Maritime Compliance Swarm.

Defines SQLAlchemy ORM models for audit logs, masking policies,
EDI connection profiles, and MTTR telemetry events.
All tools share these models to ensure data consistency.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
)
from sqlalchemy.orm import DeclarativeBase, relationship


class Base(DeclarativeBase):
    """Base class for all ORM models."""
    pass


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _new_uuid() -> str:
    return str(uuid.uuid4())


# ── Enums ──────────────────────────────────────────────────────────────────

class PIIFieldCategory(enum.Enum):
    """Categories of PII found in shipping manifests."""
    CONSIGNEE_IDENTITY = "consignee_identity"
    SHIPPER_IDENTITY = "shipper_identity"
    CONTACT_INFO = "contact_info"
    FINANCIAL_ID = "financial_id"
    GOVERNMENT_ID = "government_id"
    LOCATION = "location"


class AuditSeverity(enum.Enum):
    """Severity levels for compliance audit findings."""
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFO = "info"


class EmissionsReportingDomain(enum.Enum):
    """Emerging compliance domain for emissions reporting."""
    EU_ETS = "eu_ets"
    IMO_DCS = "imo_dcs"
    MRV = "mrv"
    CARBON_CREDIT = "carbon_credit"
    FUEL_EU_MARITIME = "fuel_eu_maritime"


class AuditStatus(enum.Enum):
    """Status of an audit finding."""
    OPEN = "open"
    IN_PROGRESS = "in_progress"
    REMEDIATED = "remediated"
    ACCEPTED_RISK = "accepted_risk"
    FALSE_POSITIVE = "false_positive"


class EDIStandard(enum.Enum):
    """Supported EDI message standards in maritime logistics."""
    EDIFACT = "EDIFACT"
    ANSI_X12 = "ANSI_X12"
    BAPLIE = "BAPLIE"
    VGM = "VGM"
    COPARN = "COPARN"
    IFTMBC = "IFTMBC"
    CUSTOMS = "CUSTOMS"


class PolicyAction(enum.Enum):
    """Actions a masking policy can take."""
    TOKENISE = "tokenise"
    REDACT = "redact"
    GENERALISE = "generalise"
    PSEUDONYMISE = "pseudonymise"
    ENCRYPT = "encrypt"
    TRUNCATE = "truncate"


class RiskCategory(enum.Enum):
    """Categories of maritime compliance risks."""
    PII_EXPOSURE = "pii_exposure"
    UNENCRYPTED_TRANSIMISSION = "unencrypted_transmission"
    MISSING_CUSTOMS_DOC = "missing_customs_doc"
    EDI_NON_COMPLIANCE = "edi_non_compliance"
    DATA_RETENTION_VIOLATION = "data_retention_violation"
    ACCESS_CONTROL_BREACH = "access_control_breach"
    CERT_EXPIRY = "cert_expiry"


# ── ORM Models ─────────────────────────────────────────────────────────────

class AnonymisationRecord(Base):
    """Audit trail for every PII field that has been anonymised."""
    __tablename__ = "anonymisation_records"

    id = Column(String(36), primary_key=True, default=_new_uuid)
    manifest_id = Column(String(64), nullable=False, index=True)
    field_name = Column(String(128), nullable=False)
    field_category = Column(Enum(PIIFieldCategory), nullable=False)
    original_hash = Column(String(64), nullable=False)  # SHA-256 of original value (never stored)
    token = Column(String(128), nullable=False)
    masking_policy_id = Column(String(36), ForeignKey("masking_policies.id"), nullable=True)
    anonymised_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)
    tool_version = Column(String(32), default="1.0.0")
    operator = Column(String(64), default="swarm_anonymiser")

    policy = relationship("MaskingPolicy", back_populates="anonymisation_records")


class MaskingPolicy(Base):
    """Defines how specific PII fields should be masked."""
    __tablename__ = "masking_policies"

    id = Column(String(36), primary_key=True, default=_new_uuid)
    name = Column(String(128), nullable=False, unique=True)
    field_name = Column(String(128), nullable=False)
    field_category = Column(Enum(PIIFieldCategory), nullable=False)
    action = Column(Enum(PolicyAction), nullable=False)
    parameters = Column(JSON, default=dict)  # e.g. {"preserve_domain": true, "prefix": "MTS"}
    gdpr_article = Column(String(32), default="Art.25")
    enabled = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=_utcnow)
    updated_at = Column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

    anonymisation_records = relationship("AnonymisationRecord", back_populates="policy")


class AuditFinding(Base):
    """A single compliance issue found by the EDI SQL Auditor."""
    __tablename__ = "audit_findings"

    id = Column(String(36), primary_key=True, default=_new_uuid)
    finding_ref = Column(String(64), unique=True, nullable=False, index=True)
    severity = Column(Enum(AuditSeverity), nullable=False, index=True)
    status = Column(Enum(AuditStatus), default=AuditStatus.OPEN, index=True)
    risk_category = Column(Enum(RiskCategory), nullable=False)
    title = Column(String(256), nullable=False)
    description = Column(Text, nullable=False)
    affected_system = Column(String(128))
    affected_table = Column(String(128))
    affected_row_count = Column(Integer, default=0)
    edi_standard = Column(Enum(EDIStandard), nullable=True)
    evidence = Column(JSON, default=list)  # raw query results, row samples
    detected_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)
    remediated_at = Column(DateTime(timezone=True), nullable=True)
    remediation_policy_id = Column(String(36), ForeignKey("masking_policies.id"), nullable=True)

    policy = relationship("MaskingPolicy")


class EDIConnectionProfile(Base):
    """Configuration for an EDI connection to a Freight Management System."""
    __tablename__ = "edi_connection_profiles"

    id = Column(String(36), primary_key=True, default=_new_uuid)
    partner_id = Column(String(64), nullable=False, index=True)
    partner_name = Column(String(128), nullable=False)
    edi_standard = Column(Enum(EDIStandard), nullable=False)
    endpoint_url = Column(String(512))
    encryption_enabled = Column(Boolean, default=False)
    encryption_protocol = Column(String(32))  # TLS 1.2, TLS 1.3, AS2, SFTP
    auth_method = Column(String(32))
    customs_doc_required = Column(Boolean, default=True)
    last_audit_at = Column(DateTime(timezone=True), nullable=True)
    last_audit_passed = Column(Boolean, nullable=True)
    config = Column(JSON, default=dict)
    created_at = Column(DateTime(timezone=True), default=_utcnow)
    updated_at = Column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)


class MTTRTrackingEvent(Base):
    """Telemetry event tracking the lifecycle of a risk from identification to resolution.

    Written by the Golang MTTR Tracker; read by Python tools for reporting.
    """
    __tablename__ = "mttr_events"

    id = Column(String(36), primary_key=True, default=_new_uuid)
    finding_id = Column(String(36), ForeignKey("audit_findings.id"), nullable=False, index=True)
    phase = Column(String(32), nullable=False)  # identified | assigned | in_progress | resolved | verified
    timestamp = Column(DateTime(timezone=True), default=_utcnow, nullable=False, index=True)
    assignee = Column(String(64), nullable=True)
    duration_seconds = Column(Float, nullable=True)
    meta_data = Column(JSON, default=dict)

    finding = relationship("AuditFinding")


class AuditQueryRegistry(Base):
    """Pluggable audit query registry — database-backed, versioned queries.

    Each query can have multiple versions. Only the active version
    is used during audit runs. Old versions are retained for
    historical comparison.
    """
    __tablename__ = "audit_query_registry"

    id = Column(String(36), primary_key=True, default=_new_uuid)
    query_id = Column(String(32), nullable=False, index=True)
    version = Column(Integer, nullable=False, default=1)
    name = Column(String(256), nullable=False)
    domain = Column(String(64), nullable=False, index=True)
    description = Column(Text, nullable=False, default="")
    sql_template = Column(Text, nullable=False)
    severity = Column(String(16), nullable=False, default="high")
    risk_category = Column(String(64), nullable=False, default="edi_non_compliance")
    affected_tables = Column(JSON, default=list)
    parameters = Column(JSON, default=dict)
    remediation_hint = Column(Text, nullable=False, default="")
    is_active = Column(Boolean, default=True, index=True)
    is_builtin = Column(Boolean, default=False)
    content_hash = Column(String(64), nullable=False)
    created_by = Column(String(64), default="system")
    created_at = Column(DateTime(timezone=True), default=_utcnow)
    updated_at = Column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)


class ComplianceReport(Base):
    """Periodic compliance summary generated from audit findings."""
    __tablename__ = "compliance_reports"

    id = Column(String(36), primary_key=True, default=_new_uuid)
    report_period_start = Column(DateTime(timezone=True), nullable=False)
    report_period_end = Column(DateTime(timezone=True), nullable=False)
    total_findings = Column(Integer, default=0)
    critical_count = Column(Integer, default=0)
    high_count = Column(Integer, default=0)
    medium_count = Column(Integer, default=0)
    low_count = Column(Integer, default=0)
    remediated_count = Column(Integer, default=0)
    avg_mttr_hours = Column(Float, default=0.0)
    generated_at = Column(DateTime(timezone=True), default=_utcnow)
    summary = Column(Text, nullable=True)
