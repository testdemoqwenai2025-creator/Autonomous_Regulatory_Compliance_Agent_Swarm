"""Maritime Compliance Swarm — Python Client SDK.

Provides a typed async client for all gateway endpoints.
Frontend services, notebooks, and integrations should use this
rather than calling raw HTTP.

Usage:
    from client import ComplianceSwarmClient

    async with ComplianceSwarmClient(base_url="http://localhost:8000") as api:
        result = await api.anonymise_manifest(
            manifest_id="BL-001",
            manifest={"consignee_name": "John Doe", ...}
        )
"""

from .sync_client import ComplianceSwarmClient
from .models import (
    ManifestAnonymiseResponse,
    ScanResponse,
    FreeTextAnonymiseResponse,
    RunAuditResponse,
    ProfileComplianceInfo,
    AuditQueryInfo,
    GeneratePoliciesResponse,
    UpdateEDIResponse,
    FindingMTTRResponse,
    MTTRReportResponse,
    OpenFindingMTTR,
    FindingsListResponse,
    PoliciesListResponse,
    ComplianceReportResponse,
    HealthResponse,
    RemediationMode,
    EventPhase,
    ComplianceDomain,
    AuditSeverity,
    Jurisdiction,
)

__all__ = [
    "ComplianceSwarmClient",
    "ManifestAnonymiseResponse",
    "ScanResponse",
    "FreeTextAnonymiseResponse",
    "RunAuditResponse",
    "ProfileComplianceInfo",
    "AuditQueryInfo",
    "GeneratePoliciesResponse",
    "UpdateEDIResponse",
    "FindingMTTRResponse",
    "MTTRReportResponse",
    "OpenFindingMTTR",
    "FindingsListResponse",
    "PoliciesListResponse",
    "ComplianceReportResponse",
    "HealthResponse",
    "RemediationMode",
    "EventPhase",
    "ComplianceDomain",
    "AuditSeverity",
    "Jurisdiction",
]
