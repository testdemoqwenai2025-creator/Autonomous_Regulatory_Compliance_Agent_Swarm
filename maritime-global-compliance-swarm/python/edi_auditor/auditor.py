"""Core audit engine for the Logistics EDI SQL Auditor.

Connects to Freight Management Systems (FMS), executes compliance audit
queries, and persists findings to the shared compliance database.

The auditor can run against:
  - The compliance DB (local audit tables)
  - An external FMS database (via separate connection string)
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from shared.config import AuditorConfig, SwarmConfig
from shared.database import create_engine_from_config, get_session_factory, init_schema
from shared.models import (
    AuditFinding,
    AuditSeverity,
    AuditStatus,
    EDIStandard,
    EDIConnectionProfile,
    RiskCategory,
)
from .queries import (
    ALL_AUDIT_QUERIES,
    AuditQuery,
    ComplianceDomain,
    get_queries_by_domain,
    get_queries_by_severity,
)

logger = logging.getLogger(__name__)


# Map query severity strings to enum
_SEVERITY_MAP = {
    "critical": AuditSeverity.CRITICAL,
    "high": AuditSeverity.HIGH,
    "medium": AuditSeverity.MEDIUM,
    "low": AuditSeverity.LOW,
    "info": AuditSeverity.INFO,
}

# Map risk category strings to enum
_RISK_MAP = {
    "unencrypted_transmission": RiskCategory.UNENCRYPTED_TRANSIMISSION,
    "missing_customs_doc": RiskCategory.MISSING_CUSTOMS_DOC,
    "edi_non_compliance": RiskCategory.EDI_NON_COMPLIANCE,
    "data_retention_violation": RiskCategory.DATA_RETENTION_VIOLATION,
    "access_control_breach": RiskCategory.ACCESS_CONTROL_BREACH,
    "cert_expiry": RiskCategory.CERT_EXPIRY,
}


class EDIAuditor:
    """Executes compliance audit queries against an FMS database.

    Results are persisted as AuditFinding records in the compliance database,
    enabling downstream remediation and MTTR tracking.
    """

    def __init__(
        self,
        config: SwarmConfig,
        fms_connection_string: Optional[str] = None,
    ):
        self._config = config
        self._auditor_config = config.auditor

        # Compliance DB (for writing findings)
        self._compliance_engine = create_engine_from_config(config)
        init_schema(self._compliance_engine)
        self._compliance_sessions = get_session_factory(self._compliance_engine)

        # FMS DB (for running audit queries)
        fms_url = fms_connection_string or self._auditor_config.fms_connection_string
        if fms_url:
            self._fms_engine = create_engine(fms_url, pool_pre_ping=True)
            self._has_fms = True
            logger.info("FMS connection established")
        else:
            self._fms_engine = None
            self._has_fms = False
            logger.warning("No FMS connection string - running in local-only mode")

    def run_audit(
        self,
        domain: Optional[ComplianceDomain] = None,
        min_severity: Optional[str] = None,
        custom_queries: Optional[list[AuditQuery]] = None,
    ) -> list[dict[str, Any]]:
        """Execute audit queries and persist findings.

        Args:
            domain: If set, only run queries for this compliance domain.
            min_severity: Minimum severity level to include.
            custom_queries: Override the default query set.

        Returns:
            List of finding summaries created during this audit run.
        """
        if custom_queries:
            queries = custom_queries
        elif domain:
            queries = get_queries_by_domain(domain)
        elif min_severity:
            queries = get_queries_by_severity(min_severity)
        else:
            queries = ALL_AUDIT_QUERIES

        findings: list[dict[str, Any]] = []

        for query in queries:
            if self._should_skip_query(query):
                logger.debug("Skipping query %s (feature disabled)", query.query_id)
                continue

            try:
                results = self._execute_query(query)
                finding = self._persist_finding(query, results)
                if finding:
                    findings.append(finding)
                    logger.info(
                        "Finding %s: %d affected rows (severity=%s)",
                        finding["finding_ref"],
                        finding["affected_row_count"],
                        finding["severity"],
                    )
            except Exception as e:
                logger.error("Query %s failed: %s", query.query_id, e, exc_info=True)
                findings.append({
                    "query_id": query.query_id,
                    "name": query.name,
                    "error": str(e),
                })

        logger.info("Audit complete: %d queries, %d findings", len(queries), len(findings))
        return findings

    def _should_skip_query(self, query: AuditQuery) -> bool:
        """Check if a query should be skipped based on config."""
        if query.domain == ComplianceDomain.ENCRYPTION and not self._auditor_config.check_encryption:
            return True
        if query.domain == ComplianceDomain.CUSTOMS_DOCUMENTATION and not self._auditor_config.check_customs_docs:
            return True
        if query.domain == ComplianceDomain.EDI_FORMAT and not self._auditor_config.check_edi_compliance:
            return True
        return False

    def _execute_query(self, query: AuditQuery) -> list[dict[str, Any]]:
        """Execute a single audit query against the FMS database."""
        if not self._has_fms:
            logger.warning("No FMS connection - returning empty results for %s", query.query_id)
            return []

        # Merge default and query-level parameters
        params = {
            "batch_size": self._auditor_config.audit_batch_size,
            **self._auditor_config.__dict__,
            **query.parameters,
        }

        sql = query.sql_template.format(**params)

        with self._fms_engine.connect() as conn:
            result = conn.execute(text(sql))
            columns = result.keys()
            rows = [dict(zip(columns, row)) for row in result.fetchall()]

        logger.debug("Query %s returned %d rows", query.query_id, len(rows))
        return rows

    def _persist_finding(
        self, query: AuditQuery, results: list[dict[str, Any]]
    ) -> Optional[dict[str, Any]]:
        """Create an AuditFinding record from query results."""
        if not results:
            return None

        finding_ref = f"{query.query_id}-{uuid.uuid4().hex[:8]}"
        severity = _SEVERITY_MAP.get(query.severity, AuditSeverity.MEDIUM)
        risk = _RISK_MAP.get(query.risk_category, RiskCategory.EDI_NON_COMPLIANCE)

        # Take a sample of evidence (max 5 rows)
        evidence_sample = results[:5]

        with self._compliance_sessions() as session:
            finding = AuditFinding(
                finding_ref=finding_ref,
                severity=severity,
                status=AuditStatus.OPEN,
                risk_category=risk,
                title=f"{query.name}: {len(results)} violation(s) detected",
                description=query.description,
                affected_system="FMS",
                affected_table=", ".join(query.affected_tables) if query.affected_tables else None,
                affected_row_count=len(results),
                evidence=evidence_sample,
            )
            session.add(finding)
            session.flush()  # get the ID

            return {
                "finding_ref": finding_ref,
                "severity": query.severity,
                "affected_row_count": len(results),
                "title": finding.title,
            }

    def audit_edi_profiles(self) -> list[dict[str, Any]]:
        """Audit EDI connection profiles for encryption and compliance status.

        Checks each registered partner connection for:
          - Encryption enabled
          - Valid TLS version
          - Last successful audit
        """
        profiles = []

        with self._compliance_sessions() as session:
            all_profiles = session.query(EDIConnectionProfile).all()

            for profile in all_profiles:
                issues = []
                if not profile.encryption_enabled:
                    issues.append("Encryption not enabled")
                if profile.encryption_protocol and profile.encryption_protocol < "TLS 1.2":
                    issues.append(f"Weak protocol: {profile.encryption_protocol}")

                profiles.append({
                    "partner_id": profile.partner_id,
                    "partner_name": profile.partner_name,
                    "edi_standard": profile.edi_standard.value if profile.edi_standard else None,
                    "encryption_enabled": profile.encryption_enabled,
                    "encryption_protocol": profile.encryption_protocol,
                    "issues": issues,
                    "last_audit_at": profile.last_audit_at.isoformat() if profile.last_audit_at else None,
                    "compliant": len(issues) == 0,
                })

        return profiles

    def close(self):
        """Dispose of database engines."""
        if self._compliance_engine:
            self._compliance_engine.dispose()
        if self._fms_engine:
            self._fms_engine.dispose()
