"""Synchronous HTTP client for the Maritime Compliance Swarm gateway.

Wraps every gateway endpoint in a typed method so the frontend
can call the swarm without knowing HTTP details.

Usage::

    from client import ComplianceSwarmClient

    api = ComplianceSwarmClient(base_url="http://localhost:8000")

    # Scan a manifest for PII
    scan = api.scan_manifest({"consignee_name": "John Doe"})

    # Anonymise it
    result = api.anonymise_manifest(
        manifest_id="BL-001",
        manifest={"consignee_name": "John Doe", "container_id": "MSKU123"},
    )

    # Run an audit
    audit = api.run_audit(domain=ComplianceDomain.ENCRYPTION)

    # Generate remediation policies
    policies = api.generate_policies(mode=RemediationMode.DRY_RUN)

    # Record MTTR event
    api.ingest_event(finding_id="abc", phase=EventPhase.ASSIGNED)

    # Get MTTR report
    report = api.get_mttr_report()
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Optional

import httpx

from .models import (
    AuditQueryInfo,
    AuditSeverity,
    ComplianceDomain,
    ComplianceReportResponse,
    EventPhase,
    FindingMTTRResponse,
    FindingsListResponse,
    FreeTextAnonymiseResponse,
    GeneratePoliciesResponse,
    HealthResponse,
    Jurisdiction,
    ManifestAnonymiseResponse,
    MTTRReportResponse,
    OpenFindingMTTR,
    PoliciesListResponse,
    ProfileComplianceInfo,
    RemediationMode,
    RunAuditResponse,
    ScanResponse,
    UpdateEDIResponse,
)

logger = logging.getLogger(__name__)


class ComplianceSwarmError(Exception):
    """Raised when the gateway returns a non-2xx status."""
    def __init__(self, status_code: int, detail: str):
        self.status_code = status_code
        self.detail = detail
        super().__init__(f"HTTP {status_code}: {detail}")


class ComplianceSwarmClient:
    """Synchronous client for all Compliance Swarm gateway endpoints.

    Parameters:
        base_url: Gateway root URL (default http://localhost:8000).
        timeout: Request timeout in seconds (default 30).
        api_key: Optional Bearer token for authenticated gateways.
    """

    def __init__(
        self,
        base_url: str = "http://localhost:8000",
        timeout: float = 30.0,
        api_key: Optional[str] = None,
    ):
        self._base = base_url.rstrip("/")
        self._timeout = timeout
        headers = {"Content-Type": "application/json"}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
        self._client = httpx.Client(
            base_url=self._base,
            timeout=timeout,
            headers=headers,
        )

    def __enter__(self) -> "ComplianceSwarmClient":
        return self

    def __exit__(self, *exc):
        self.close()

    def close(self):
        self._client.close()

    # ── internal helpers ───────────────────────────────────────

    def _get(self, path: str, params: Optional[dict] = None) -> dict:
        r = self._client.get(path, params=params)
        if r.status_code >= 400:
            raise ComplianceSwarmError(r.status_code, r.text)
        return r.json()

    def _post(self, path: str, json: Any = None) -> dict:
        r = self._client.post(path, json=json)
        if r.status_code >= 400:
            raise ComplianceSwarmError(r.status_code, r.text)
        return r.json()

    # ═══════════════════════════════════════════════════════════
    #  HEALTH
    # ═══════════════════════════════════════════════════════════

    def health(self) -> HealthResponse:
        """Check gateway and all tool health."""
        return HealthResponse(**self._get("/health"))

    # ═══════════════════════════════════════════════════════════
    #  1. PII ANONYMISER
    # ═══════════════════════════════════════════════════════════

    def anonymise_manifest(
        self,
        manifest_id: str,
        manifest: dict[str, Any],
        free_text_fields: Optional[list[str]] = None,
    ) -> ManifestAnonymiseResponse:
        """Tokenise all PII fields in a shipping manifest.

        Args:
            manifest_id: Unique identifier (e.g. B/L number).
            manifest: Dict of field names to values.
            free_text_fields: Keys containing free-text to also scan.

        Returns:
            Anonymised manifest with tokenised PII and audit records.
        """
        return ManifestAnonymiseResponse(**self._post("/api/v1/anonymise/manifest", {
            "manifest_id": manifest_id,
            "manifest": manifest,
            "free_text_fields": free_text_fields or [],
        }))

    def anonymise_free_text(
        self,
        manifest_id: str,
        text: str,
    ) -> FreeTextAnonymiseResponse:
        """Detect and tokenise PII patterns in free-text content.

        Scans for emails, phone numbers, passport numbers, and tax IDs.
        """
        return FreeTextAnonymiseResponse(**self._post("/api/v1/anonymise/free-text", {
            "manifest_id": manifest_id,
            "text": text,
        }))

    def scan_manifest(
        self,
        manifest: dict[str, Any],
        jurisdiction: Optional[Jurisdiction] = None,
    ) -> ScanResponse:
        """Scan a manifest for PII fields without modifying data.

        Args:
            manifest: Dict of field names to values.
            jurisdiction: Filter rules by jurisdiction (GDPR, CCPA, etc.).

        Returns:
            Grouped PII matches per field name.
        """
        payload: dict[str, Any] = {"manifest": manifest}
        if jurisdiction:
            payload["jurisdiction"] = jurisdiction.value
        return ScanResponse(**self._post("/api/v1/anonymise/scan", payload))

    # ═══════════════════════════════════════════════════════════
    #  2. EDI SQL AUDITOR
    # ═══════════════════════════════════════════════════════════

    def run_audit(
        self,
        domain: Optional[ComplianceDomain] = None,
        min_severity: Optional[AuditSeverity] = None,
    ) -> RunAuditResponse:
        """Execute compliance audit queries against the FMS database.

        Args:
            domain: Limit to a specific compliance domain.
            min_severity: Minimum severity level to include.

        Returns:
            Audit findings with severity, affected rows, and titles.
        """
        payload: dict[str, Any] = {}
        if domain:
            payload["domain"] = domain.value
        if min_severity:
            payload["min_severity"] = min_severity.value
        return RunAuditResponse(**self._post("/api/v1/audit/run", payload or None))

    def audit_edi_profiles(self) -> list[ProfileComplianceInfo]:
        """Audit all EDI connection profiles for encryption compliance."""
        data = self._get("/api/v1/audit/profiles")
        return [ProfileComplianceInfo(**p) for p in data]

    def list_audit_queries(
        self,
        domain: Optional[str] = None,
    ) -> list[AuditQueryInfo]:
        """List all 11 audit queries with metadata.

        Args:
            domain: Optional domain filter.
        """
        params = {"domain": domain} if domain else None
        data = self._get("/api/v1/audit/queries", params)
        return [AuditQueryInfo(**q) for q in data]

    # ═══════════════════════════════════════════════════════════
    #  3. REMEDIATION GENERATOR
    # ═══════════════════════════════════════════════════════════

    def generate_policies(
        self,
        finding_refs: Optional[list[str]] = None,
        mode: RemediationMode = RemediationMode.DRY_RUN,
    ) -> GeneratePoliciesResponse:
        """Generate remediation masking policies from open audit findings.

        Args:
            finding_refs: Specific findings (None = all open).
            mode: dry-run | staged | apply.
        """
        return GeneratePoliciesResponse(**self._post("/api/v1/remediation/policies", {
            "finding_refs": finding_refs,
            "mode": mode.value,
        }))

    def update_edi_profiles(
        self,
        finding_refs: Optional[list[str]] = None,
        mode: RemediationMode = RemediationMode.DRY_RUN,
    ) -> UpdateEDIResponse:
        """Update EDI profiles based on audit findings (enforce TLS 1.3 etc.)."""
        return UpdateEDIResponse(**self._post("/api/v1/remediation/edi-profiles", {
            "finding_refs": finding_refs,
            "mode": mode.value,
        }))

    # ═══════════════════════════════════════════════════════════
    #  4. MTTR TRACKER (proxy to Golang)
    # ═══════════════════════════════════════════════════════════

    def ingest_event(
        self,
        finding_id: str,
        phase: EventPhase,
        assignee: Optional[str] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> dict:
        """Record a telemetry event for MTTR tracking.

        Phases: identified -> assigned -> in_progress -> resolved -> verified.
        """
        return self._post("/api/v1/mttr/events", {
            "finding_id": finding_id,
            "phase": phase.value,
            "assignee": assignee,
            "metadata": metadata or {},
        })

    def get_finding_mttr(self, finding_id: str) -> FindingMTTRResponse:
        """Get MTTR timeline and metrics for a specific finding."""
        return FindingMTTRResponse(**self._get(f"/api/v1/mttr/findings/{finding_id}"))

    def get_mttr_report(
        self,
        from_date: Optional[str] = None,
        to_date: Optional[str] = None,
        risk_category: Optional[str] = None,
    ) -> MTTRReportResponse:
        """Get aggregate MTTR report with avg and P95 metrics."""
        params: dict[str, str] = {}
        if from_date:
            params["from"] = from_date
        if to_date:
            params["to"] = to_date
        if risk_category:
            params["risk_category"] = risk_category
        return MTTRReportResponse(**self._get("/api/v1/mttr/report", params or None))

    def get_open_findings_mttr(self) -> list[OpenFindingMTTR]:
        """Get all open findings with current MTTR metrics."""
        data = self._get("/api/v1/mttr/open")
        return [OpenFindingMTTR(**f) for f in data]

    # ═══════════════════════════════════════════════════════════
    #  SHARED QUERY ENDPOINTS
    # ═══════════════════════════════════════════════════════════

    def list_findings(
        self,
        severity: Optional[str] = None,
        status: Optional[str] = None,
        risk_category: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> FindingsListResponse:
        """List audit findings with filtering and pagination."""
        params: dict[str, Any] = {"limit": limit, "offset": offset}
        if severity:
            params["severity"] = severity
        if status:
            params["status"] = status
        if risk_category:
            params["risk_category"] = risk_category
        return FindingsListResponse(**self._get("/api/v1/findings", params))

    def list_policies(
        self,
        enabled_only: bool = False,
        limit: int = 50,
        offset: int = 0,
    ) -> PoliciesListResponse:
        """List masking policies with filtering and pagination."""
        params: dict[str, Any] = {"limit": limit, "offset": offset}
        if enabled_only:
            params["enabled_only"] = "true"
        return PoliciesListResponse(**self._get("/api/v1/policies", params))

    def list_reports(self, limit: int = 20) -> list[ComplianceReportResponse]:
        """List compliance summary reports."""
        data = self._get("/api/v1/reports", {"limit": limit})
        return [ComplianceReportResponse(**r) for r in data]
