"""FastAPI gateway for the Maritime Global Compliance Swarm.

Provides a unified REST API over all four compliance tools:
  1. PII Anonymiser        - Tokenise / redact / encrypt manifest PII
  2. EDI SQL Auditor       - Run compliance queries, profile checks
  3. Remediation Generator - Generate masking policies, update EDI profiles
  4. MTTR Tracker (Go)     - Proxy to the Golang telemetry service

The gateway is a pure-Python process. It communicates with the Golang
MTTR tracker over HTTP (via httpx) and with the database directly
via SQLAlchemy.

Usage:
    uvicorn gateway.app:app --host 0.0.0.0 --port 8000
"""

from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import Field

from shared.config import SwarmConfig
from shared.database import (
    create_engine_from_config,
    get_session_factory,
    init_schema,
)
from shared.models import (
    AnonymisationRecord,
    AuditFinding,
    AuditSeverity,
    AuditStatus,
    ComplianceReport,
    EDIConnectionProfile,
    MaskingPolicy,
    MTTRTrackingEvent,
    PIIFieldCategory,
    RiskCategory,
)
import time

from anonymiser.tokeniser import PIITokeniser
from anonymiser.rules import RuleEngine
from anonymiser.ner_detector import MaritimeNERDetector
from edi_auditor.auditor import EDIAuditor
from edi_auditor.queries import ALL_AUDIT_QUERIES, ComplianceDomain, get_queries_by_domain
from edi_auditor.registry import QueryRegistry
from remediation.policy_gen import PolicyGenerator
from remediation.edi_updater import EDIProfileUpdater

from .schemas import (
    AnonymisedField,
    AuditFindingSummary,
    AuditQueryInfo,
    AuditSeverity as SchemaSeverity,
    ComplianceDomain as SchemaDomain,
    ComplianceReportResponse,
    ComponentStatus,
    ConnectivityResponse,
    CreateQueryRequest,
    ErrorResponse,
    EventPhase,
    FindingsListResponse,
    FreeTextAnonymiseRequest,
    FreeTextAnonymiseResponse,
    GeneratePoliciesRequest,
    GeneratePoliciesResponse,
    GeneratedPolicy,
    HealthResponse,
    IngestEventRequest,
    Jurisdiction,
    ManifestAnonymiseRequest,
    ManifestAnonymiseResponse,
    MTTRReportResponse,
    NERAnonymiseRequest,
    NERAnonymiseResponse,
    NEREntitySchema,
    NERScanRequest,
    NERScanResponse,
    OpenFindingMTTR,
    PoliciesListResponse,
    ProfileChange,
    ProfileComplianceInfo,
    ProfileUpdateResult,
    RegistryQueryInfo,
    RegistryStatsResponse,
    RemediationMode,
    RunAuditRequest,
    RunAuditResponse,
    ScanMatch,
    ScanRequest,
    ScanResponse,
    SeedRegistryResponse,
    UpdateEDIRequest,
    UpdateEDIResponse,
    UpdateQueryRequest,
    FindingMTTRResponse,
    MTTRTimelineEvent,
)

logger = logging.getLogger(__name__)

# ── Module-level singletons (created in create_app) ──────────────────────

_config: Optional[SwarmConfig] = None
_session_factory = None
_anonymiser: Optional[PIITokeniser] = None
_rule_engine: Optional[RuleEngine] = None
_auditor: Optional[EDIAuditor] = None
_policy_generator: Optional[PolicyGenerator] = None
_edi_updater: Optional[EDIProfileUpdater] = None
_ner_detector: Optional[MaritimeNERDetector] = None
_query_registry: Optional[QueryRegistry] = None
_mttr_base_url: str = "http://localhost:8080"


# ── App factory ───────────────────────────────────────────────────────────

def create_app(config: Optional[SwarmConfig] = None) -> FastAPI:
    """Create and configure the FastAPI application.

    Args:
        config: Optional pre-built config. Loads from env if None.
    """
    global _config, _session_factory, _anonymiser, _rule_engine
    global _auditor, _policy_generator, _edi_updater, _mttr_base_url
    global _ner_detector, _query_registry

    _config = config or SwarmConfig.from_env()

    # Logging
    log_level = getattr(logging, _config.log_level, logging.INFO)
    logging.basicConfig(
        level=log_level,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    # Database
    engine = create_engine_from_config(_config)
    init_schema(engine)
    _session_factory = get_session_factory(engine)

    # Tools
    _anonymiser = PIITokeniser(_config.anonymiser)
    _rule_engine = RuleEngine()
    _auditor = EDIAuditor(_config)
    _policy_generator = PolicyGenerator(_config)
    _edi_updater = EDIProfileUpdater(_config)
    _ner_detector = MaritimeNERDetector()
    _query_registry = QueryRegistry(_session_factory)
    _query_registry.seed_defaults()

    # MTTR tracker URL (Golang service)
    _mttr_base_url = os.getenv(
        "MTTR_TRACKER_URL",
        f"http://localhost:{_config.telemetry.http_port}",
    )

    # FastAPI app
    app = FastAPI(
        title="Maritime Global Compliance Swarm",
        description=(
            "Unified API gateway for maritime data governance and privacy compliance. "
            "Exposes four compliance tools: PII Anonymiser, EDI SQL Auditor, "
            "Remediation Route Generator, and MTTR Telemetry Tracker."
        ),
        version="1.0.0",
        docs_url="/docs",
        redoc_url="/redoc",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Serve static frontend
    static_dir = Path(__file__).parent / "static"
    if static_dir.is_dir():
        app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")

        @app.get("/", include_in_schema=False, tags=["frontend"])
        async def serve_frontend():
            return FileResponse(str(static_dir / "index.html"))

    # ── Register routers ──────────────────────────────────────────────

    _register_health_routes(app)
    _register_connectivity_route(app)
    _register_anonymiser_routes(app)
    _register_ner_routes(app)
    _register_auditor_routes(app)
    _register_registry_routes(app)
    _register_remediation_routes(app)
    _register_mttr_routes(app)
    _register_query_routes(app)

    return app


# ══════════════════════════════════════════════════════════════════════════
#  HEALTH
# ══════════════════════════════════════════════════════════════════════════

def _register_health_routes(app: FastAPI):
    @app.get("/health", response_model=HealthResponse, tags=["health"])
    async def health_check():
        """Liveness probe — returns status of all four tools."""
        tool_status = {"anonymiser": "ok", "auditor": "ok", "remediation": "ok"}

        # Check MTTR tracker (Golang)
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                resp = await client.get(f"{_mttr_base_url}/health")
                tool_status["mttr_tracker"] = "ok" if resp.status_code == 200 else "degraded"
        except Exception:
            tool_status["mttr_tracker"] = "unreachable"

        return HealthResponse(
            status="healthy",
            service="compliance-swarm-gateway",
            tools=tool_status,
        )


# ══════════════════════════════════════════════════════════════════════════
#  CONNECTIVITY (frontend -> backend -> middleware diagnostics)
# ══════════════════════════════════════════════════════════════════════════

def _register_connectivity_route(app: FastAPI):

    @app.get(
        "/api/v1/system/connectivity",
        response_model=ConnectivityResponse,
        tags=["system"],
    )
    async def connectivity_check():
        """Comprehensive connectivity diagnostics for the frontend.

        Tests every backend component and middleware connection, returning
        detailed status with latency measurements. The frontend calls this
        endpoint to confirm it can effectively communicate with all backend
        services, tools, and the Golang MTTR tracker.

        Returns per-component status: ok | degraded | unavailable.
        """
        from sqlalchemy import text as sa_text

        ts = datetime.now(timezone.utc).isoformat()
        components = {}
        all_ok = True

        # 1. Database connectivity
        db_status = "ok"
        db_latency = None
        db_detail = None
        try:
            t0 = time.monotonic()
            with _session_factory() as session:
                session.execute(sa_text("SELECT 1")).scalar()
            db_latency = round((time.monotonic() - t0) * 1000, 2)
        except Exception as e:
            db_status = "unavailable"
            db_detail = str(e)[:200]
            all_ok = False
        database_status = ComponentStatus(
            name="Compliance Database",
            status=db_status,
            latency_ms=db_latency,
            detail=db_detail,
        )
        components["database"] = database_status

        # 2. PII Anonymiser
        t0 = time.monotonic()
        try:
            _anonymiser._vault.tokenise("connectivity-test", PIIFieldCategory.CONTACT_INFO)
            anonymiser_status = "ok"
        except Exception:
            anonymiser_status = "unavailable"
            all_ok = False
        anonymiser_latency = round((time.monotonic() - t0) * 1000, 2)
        components["anonymiser"] = ComponentStatus(
            name="PII Anonymiser",
            status=anonymiser_status,
            latency_ms=anonymiser_latency,
        )

        # 3. NER Detector
        t0 = time.monotonic()
        try:
            _ner_detector.detect("Test text")
            ner_status = "ok"
        except Exception:
            ner_status = "unavailable"
            all_ok = False
        ner_latency = round((time.monotonic() - t0) * 1000, 2)
        components["ner_detector"] = ComponentStatus(
            name="NER Detector",
            status=ner_status,
            latency_ms=ner_latency,
            detail=f"layers: {_ner_detector.layers_available}, spacy: {_ner_detector.spacy_available}",
        )

        # 4. EDI Auditor
        t0 = time.monotonic()
        try:
            _rule_engine.find_matching_rules("consignee_name")
            auditor_status = "ok"
        except Exception:
            auditor_status = "unavailable"
            all_ok = False
        auditor_latency = round((time.monotonic() - t0) * 1000, 2)
        components["auditor"] = ComponentStatus(
            name="EDI SQL Auditor",
            status=auditor_status,
            latency_ms=auditor_latency,
        )

        # 5. Remediation Generator
        t0 = time.monotonic()
        try:
            from remediation.policy_gen import REMEDIATION_MATRIX
            _ = len(REMEDIATION_MATRIX)
            remediation_status = "ok"
        except Exception:
            remediation_status = "unavailable"
            all_ok = False
        remediation_latency = round((time.monotonic() - t0) * 1000, 2)
        components["remediation"] = ComponentStatus(
            name="Remediation Generator",
            status=remediation_status,
            latency_ms=remediation_latency,
        )

        # 6. MTTR Proxy (Golang)
        mttr_status = "unavailable"
        mttr_latency = None
        mttr_detail = None
        try:
            t0 = time.monotonic()
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(f"{_mttr_base_url}/health")
                mttr_latency = round((time.monotonic() - t0) * 1000, 2)
                if resp.status_code == 200:
                    mttr_status = "ok"
                else:
                    mttr_status = "degraded"
                    mttr_detail = f"HTTP {resp.status_code}"
        except httpx.ConnectError:
            mttr_detail = f"Cannot connect to {_mttr_base_url}"
        except Exception as e:
            mttr_detail = str(e)[:200]

        if mttr_status == "unavailable":
            all_ok = False

        mttr_component = ComponentStatus(
            name="MTTR Tracker (Go)",
            status=mttr_status,
            latency_ms=mttr_latency,
            detail=mttr_detail,
        )
        components["mttr_tracker"] = mttr_component

        # 7. Query Registry
        t0 = time.monotonic()
        try:
            stats = _query_registry.get_statistics()
            registry_status = "ok"
            registry_detail = f"{stats['active_queries']} active, {stats['builtin_queries']} builtin"
        except Exception as e:
            registry_status = "unavailable"
            registry_detail = str(e)[:200]
            all_ok = False
        registry_latency = round((time.monotonic() - t0) * 1000, 2)
        registry_component = ComponentStatus(
            name="Query Registry",
            status=registry_status,
            latency_ms=registry_latency,
            detail=registry_detail,
        )
        components["query_registry"] = registry_component

        overall = "ok" if all_ok else ("degraded" if db_status == "ok" else "down")

        # Count routes
        total_routes = len(app.routes)
        active_routes = sum(
            1 for r in app.routes
            if hasattr(r, "methods") and hasattr(r, "path")
        )

        return ConnectivityResponse(
            status=overall,
            timestamp=ts,
            gateway_version="1.1.0",
            components=components,
            database=database_status,
            ner_layers=_ner_detector.layers_available,
            mttr_proxy=mttr_component,
            query_registry=registry_component,
            active_routes=active_routes,
            total_routes=total_routes,
        )


# ══════════════════════════════════════════════════════════════════════════
#  1. PII ANONYMISER
# ══════════════════════════════════════════════════════════════════════════

def _register_anonymiser_routes(app: FastAPI):

    @app.post(
        "/api/v1/anonymise/manifest",
        response_model=ManifestAnonymiseResponse,
        responses={500: {"model": ErrorResponse}},
        tags=["1. PII Anonymiser"],
    )
    async def anonymise_manifest(req: ManifestAnonymiseRequest):
        """Tokenise all PII fields in a shipping manifest.

        Accepts a raw manifest dict and replaces PII fields with
        deterministic HMAC-SHA256 tokens. Anonymisation records are
        persisted to the database for audit trail.
        """
        anonymised = _anonymiser.anonymise_manifest(req.manifest, req.manifest_id)

        # Also anonymise any free-text fields
        for ft_key in req.free_text_fields:
            if ft_key in anonymised and isinstance(anonymised[ft_key], str):
                anonymised[ft_key] = _anonymiser.anonymise_free_text(
                    anonymised[ft_key], req.manifest_id
                )

        # Persist records to DB
        records = _anonymiser.flush_records()
        persisted = []
        with _session_factory() as session:
            for rec in records:
                db_rec = AnonymisationRecord(
                    manifest_id=rec["manifest_id"],
                    field_name=rec["field_name"],
                    field_category=rec["field_category"],
                    original_hash=rec["original_hash"],
                    token=rec["token"],
                )
                session.add(db_rec)
                persisted.append(AnonymisedField(
                    field_name=rec["field_name"],
                    field_category=rec["field_category"].value,
                    token=rec["token"],
                    original_hash=rec["original_hash"],
                ))

        return ManifestAnonymiseResponse(
            manifest_id=req.manifest_id,
            anonymised_manifest=anonymised,
            fields_processed=len(persisted),
            records=persisted,
        )

    @app.post(
        "/api/v1/anonymise/free-text",
        response_model=FreeTextAnonymiseResponse,
        responses={500: {"model": ErrorResponse}},
        tags=["1. PII Anonymiser"],
    )
    async def anonymise_free_text(req: FreeTextAnonymiseRequest):
        """Detect and tokenise PII patterns in free-text content.

        Scans for email addresses, phone numbers, passport numbers,
        and tax IDs, replacing matches with deterministic tokens.
        """
        result = _anonymiser.anonymise_free_text(req.text, req.manifest_id)
        records = _anonymiser.flush_records()

        persisted = []
        with _session_factory() as session:
            for rec in records:
                db_rec = AnonymisationRecord(
                    manifest_id=rec["manifest_id"],
                    field_name=rec["field_name"],
                    field_category=rec["field_category"],
                    original_hash=rec["original_hash"],
                    token=rec["token"],
                )
                session.add(db_rec)
                persisted.append(AnonymisedField(
                    field_name=rec["field_name"],
                    field_category=rec["field_category"].value,
                    token=rec["token"],
                    original_hash=rec["original_hash"],
                ))

        return FreeTextAnonymiseResponse(
            manifest_id=req.manifest_id,
            anonymised_text=result,
            patterns_found=len(persisted),
            records=persisted,
        )

    @app.post(
        "/api/v1/anonymise/scan",
        response_model=ScanResponse,
        responses={500: {"model": ErrorResponse}},
        tags=["1. PII Anonymiser"],
    )
    async def scan_manifest(req: ScanRequest):
        """Scan a manifest for PII fields without modifying data.

        Returns all matching PII rules grouped by field name.
        Supports jurisdiction filtering (GDPR, CCPA, LGPD, PDPA, PIPA).
        """
        jurisdiction = req.jurisdiction.value if req.jurisdiction else None
        field_rules = _rule_engine.get_fields_for_manifest(req.manifest, jurisdiction)

        matches: dict[str, list[ScanMatch]] = {}
        for field_name, rules in field_rules.items():
            matches[field_name] = [
                ScanMatch(
                    field_name=field_name,
                    category=r.category,
                    description=r.description,
                    mandatory=r.mandatory,
                    retention_max_days=r.retention_max_days,
                    jurisdictions=[j.value for j in r.jurisdictions],
                )
                for r in rules
            ]

        return ScanResponse(
            total_fields=len(req.manifest),
            pii_fields_found=len(matches),
            matches=matches,
        )


# ══════════════════════════════════════════════════════════════════════════
#  1B. NER-BASED PII DETECTION (ML layer)
# ══════════════════════════════════════════════════════════════════════════

def _register_ner_routes(app: FastAPI):

    @app.post(
        "/api/v1/anonymise/ner/scan",
        response_model=NERScanResponse,
        tags=["1b. NER PII Detection"],
    )
    async def ner_scan(req: NERScanRequest):
        """Scan text with NER for PII entity detection.

        Runs multi-layer NER (maritime patterns, multi-script person names,
        organisation patterns, and spaCy if available). Returns all detected
        entities with positions, labels, and confidence scores.
        """
        if req.pii_only:
            entities = _ner_detector.detect_pii_entities(req.text)
        else:
            entities = _ner_detector.detect(req.text)

        return NERScanResponse(
            text_length=len(req.text),
            entities_found=len(entities),
            layers_used=_ner_detector.layers_available,
            spacy_available=_ner_detector.spacy_available,
            entities=[
                NEREntitySchema(
                    text=e.text,
                    label=e.label,
                    category=e.category,
                    start=e.start,
                    end=e.end,
                    confidence=e.confidence,
                    source=e.source,
                )
                for e in entities
            ],
        )

    @app.post(
        "/api/v1/anonymise/ner/anonymise",
        response_model=NERAnonymiseResponse,
        tags=["1b. NER PII Detection"],
    )
    async def ner_anonymise(req: NERAnonymiseRequest):
        """Anonymise free-text using NER-detected PII entities.

        Detects PERSON and ORG entities via NER and replaces them
        with HMAC-SHA256 tokens. Records are persisted to the database.
        """
        anonymised_text, records = _ner_detector.anonymise_text_with_ner(
            text=req.text,
            tokeniser=_anonymiser,
            manifest_id=req.manifest_id,
        )

        # Persist records
        persisted = []
        with _session_factory() as session:
            for rec in records:
                db_rec = AnonymisationRecord(
                    manifest_id=req.manifest_id,
                    field_name=rec["field_name"],
                    field_category=PIIFieldCategory.CONTACT_INFO,
                    original_hash=_anonymiser._vault.hash_original(rec["text"]),
                    token=rec["token"],
                )
                session.add(db_rec)
                persisted.append(rec)

        return NERAnonymiseResponse(
            manifest_id=req.manifest_id,
            anonymised_text=anonymised_text,
            entities_replaced=len(persisted),
            records=persisted,
        )


# ══════════════════════════════════════════════════════════════════════════
#  2. EDI SQL AUDITOR
# ══════════════════════════════════════════════════════════════════════════

def _register_auditor_routes(app: FastAPI):

    @app.post(
        "/api/v1/audit/run",
        response_model=RunAuditResponse,
        responses={500: {"model": ErrorResponse}},
        tags=["2. EDI SQL Auditor"],
    )
    async def run_audit(req: RunAuditRequest):
        """Execute compliance audit queries against the FMS database.

        Runs 11 parametric SQL queries across 5 compliance domains:
        encryption, customs documentation, EDI format, data retention,
        and access control. Results are persisted as AuditFindings.
        """
        domain = None
        if req.domain:
            domain = ComplianceDomain(req.domain.value)

        min_sev = req.min_severity.value if req.min_severity else None

        findings = _auditor.run_audit(domain=domain, min_severity=min_sev)

        return RunAuditResponse(
            queries_executed=len(ALL_AUDIT_QUERIES),
            findings_count=len(findings),
            findings=[
                AuditFindingSummary(
                    finding_ref=f.get("finding_ref", ""),
                    severity=f.get("severity", ""),
                    affected_row_count=f.get("affected_row_count", 0),
                    title=f.get("title", ""),
                    query_id=f.get("query_id"),
                    error=f.get("error"),
                )
                for f in findings
            ],
        )

    @app.get(
        "/api/v1/audit/profiles",
        response_model=list[ProfileComplianceInfo],
        responses={500: {"model": ErrorResponse}},
        tags=["2. EDI SQL Auditor"],
    )
    async def audit_edi_profiles():
        """Audit all EDI connection profiles for encryption compliance.

        Checks each registered partner connection for encryption
        status, TLS version, and last successful audit timestamp.
        """
        profiles = _auditor.audit_edi_profiles()
        return [
            ProfileComplianceInfo(
                partner_id=p["partner_id"],
                partner_name=p["partner_name"],
                edi_standard=p["edi_standard"],
                encryption_enabled=p["encryption_enabled"],
                encryption_protocol=p["encryption_protocol"],
                issues=p["issues"],
                last_audit_at=p["last_audit_at"],
                compliant=p["compliant"],
            )
            for p in profiles
        ]

    @app.get(
        "/api/v1/audit/queries",
        response_model=list[AuditQueryInfo],
        tags=["2. EDI SQL Auditor"],
    )
    async def list_audit_queries(
        domain: Optional[str] = Query(None, description="Filter by domain"),
    ):
        """List all available audit queries with metadata.

        Returns query IDs, descriptions, severity levels, and
        remediation hints for each of the 11 audit queries.
        """
        if domain:
            queries = get_queries_by_domain(ComplianceDomain(domain))
        else:
            queries = ALL_AUDIT_QUERIES

        return [
            AuditQueryInfo(
                query_id=q.query_id,
                name=q.name,
                domain=q.domain.value,
                severity=q.severity,
                risk_category=q.risk_category,
                affected_tables=q.affected_tables,
                description=q.description,
                remediation_hint=q.remediation_hint,
            )
            for q in queries
        ]


# ══════════════════════════════════════════════════════════════════════════
#  2B. QUERY REGISTRY (pluggable, versioned, DB-backed)
# ══════════════════════════════════════════════════════════════════════════

def _register_registry_routes(app: FastAPI):

    @app.get(
        "/api/v1/audit/registry/queries",
        response_model=list[RegistryQueryInfo],
        tags=["2b. Query Registry"],
    )
    async def registry_list(
        domain: Optional[str] = Query(None),
        include_inactive: bool = Query(False),
    ):
        """List queries from the pluggable registry.

        Returns all active queries (or all including inactive) from
        the database-backed registry. Supports domain filtering.
        """
        queries = _query_registry.get_active_queries(domain=domain)
        if not include_inactive:
            queries = [q for q in queries if q.get("is_active", True)]
        return [RegistryQueryInfo(**q) for q in queries]

    @app.get(
        "/api/v1/audit/registry/queries/{query_id}",
        response_model=RegistryQueryInfo,
        responses={404: {"model": ErrorResponse}},
        tags=["2b. Query Registry"],
    )
    async def registry_get(query_id: str):
        """Get the active version of a specific query from the registry."""
        q = _query_registry.get_query(query_id)
        if not q:
            raise HTTPException(status_code=404, detail=f"Query '{query_id}' not found or inactive")
        return RegistryQueryInfo(**q)

    @app.get(
        "/api/v1/audit/registry/queries/{query_id}/versions",
        response_model=list[RegistryQueryInfo],
        tags=["2b. Query Registry"],
    )
    async def registry_versions(query_id: str):
        """Get all versions of a specific query.

        Useful for comparing regulatory changes across versions.
        """
        versions = _query_registry.get_query_versions(query_id)
        if not versions:
            raise HTTPException(status_code=404, detail=f"Query '{query_id}' not found")
        return [RegistryQueryInfo(**v) for v in versions]

    @app.post(
        "/api/v1/audit/registry/queries",
        response_model=RegistryQueryInfo,
        responses={409: {"model": ErrorResponse}},
        tags=["2b. Query Registry"],
    )
    async def registry_create(req: CreateQueryRequest):
        """Create a new audit query in the registry.

        The query is immediately available for audit runs.
        Version auto-increments if query_id already exists.
        """
        try:
            result = _query_registry.create_query(
                data=req.model_dump(),
                created_by="api",
            )
            return RegistryQueryInfo(**result)
        except Exception as e:
            raise HTTPException(status_code=400, detail=str(e))

    @app.put(
        "/api/v1/audit/registry/queries/{query_id}",
        response_model=RegistryQueryInfo,
        responses={404: {"model": ErrorResponse}},
        tags=["2b. Query Registry"],
    )
    async def registry_update(query_id: str, req: UpdateQueryRequest):
        """Update an existing query (creates a new version).

        The old active version is deactivated. A new version is created
        with the merged fields. This enables regulatory change tracking.
        """
        updates = {k: v for k, v in req.model_dump().items() if v is not None}
        result = _query_registry.update_query(
            query_id=query_id,
            data=updates,
            updated_by="api",
        )
        if not result:
            raise HTTPException(status_code=404, detail=f"Query '{query_id}' not found")
        return RegistryQueryInfo(**result)

    @app.delete(
        "/api/v1/audit/registry/queries/{query_id}",
        tags=["2b. Query Registry"],
    )
    async def registry_retire(query_id: str):
        """Retire (deactivate) a query from the registry.

        The query is soft-deleted — it remains in the database for
        historical reference but will not be used in audit runs.
        """
        retired = _query_registry.retire_query(query_id)
        if not retired:
            raise HTTPException(status_code=404, detail=f"Query '{query_id}' not found")
        return {"status": "retired", "query_id": query_id}

    @app.get(
        "/api/v1/audit/registry/stats",
        response_model=RegistryStatsResponse,
        tags=["2b. Query Registry"],
    )
    async def registry_stats():
        """Get statistics about the query registry.

        Returns counts of total, active, builtin, and custom queries,
        broken down by domain.
        """
        stats = _query_registry.get_statistics()
        return RegistryStatsResponse(
            total_queries=stats["total_queries"],
            active_queries=stats["active_queries"],
            builtin_queries=stats["builtin_queries"],
            custom_queries=stats["custom_queries"],
            by_domain=stats["by_domain"],
        )

    @app.post(
        "/api/v1/audit/registry/seed",
        response_model=SeedRegistryResponse,
        tags=["2b. Query Registry"],
    )
    async def registry_seed():
        """Seed the registry with the 11 default audit queries.

        Only inserts if the registry is empty. Safe to call multiple times.
        """
        count = _query_registry.seed_defaults()
        if count == 0:
            return SeedRegistryResponse(queries_seeded=0, message="Registry already populated")
        return SeedRegistryResponse(queries_seeded=count, message=f"Seeded {count} default queries")


# ══════════════════════════════════════════════════════════════════════════
#  3. REMEDIATION ROUTE GENERATOR
# ══════════════════════════════════════════════════════════════════════════

def _register_remediation_routes(app: FastAPI):

    @app.post(
        "/api/v1/remediation/policies",
        response_model=GeneratePoliciesResponse,
        responses={500: {"model": ErrorResponse}},
        tags=["3. Remediation Generator"],
    )
    async def generate_policies(req: GeneratePoliciesRequest):
        """Generate remediation masking policies from open audit findings.

        Analyses each open finding, applies the decision matrix to map
        risk categories to policy actions, and creates MaskingPolicy records.

        Modes:
          - dry-run: Propose policies without persisting
          - staged:  Persist as disabled (manual review)
          - apply:   Persist and enable immediately
        """
        results = _policy_generator.generate_policies(
            finding_refs=req.finding_refs,
            mode=req.mode.value,
        )

        return GeneratePoliciesResponse(
            findings_processed=len([r for r in results if r.get("finding_ref")]),
            policies_generated=len(results),
            mode=req.mode.value,
            policies=[
                GeneratedPolicy(
                    policy_id=r.get("policy_id"),
                    name=r["name"],
                    action=r.get("action"),
                    enabled=r.get("enabled"),
                    status=r.get("status", "unknown"),
                    mode=r.get("mode", req.mode.value),
                    finding_ref=r.get("finding_ref"),
                    severity=r.get("severity"),
                )
                for r in results
            ],
        )

    @app.post(
        "/api/v1/remediation/edi-profiles",
        response_model=UpdateEDIResponse,
        responses={500: {"model": ErrorResponse}},
        tags=["3. Remediation Generator"],
    )
    async def update_edi_profiles(req: UpdateEDIRequest):
        """Update EDI connection profiles based on audit findings.

        Finds profiles flagged by the auditor and applies security
        updates (e.g., enforce TLS 1.3, enable encryption).
        """
        results = _edi_updater.update_profiles(
            finding_refs=req.finding_refs,
            mode=req.mode.value,
        )

        return UpdateEDIResponse(
            profiles_processed=len(results),
            mode=req.mode.value,
            results=[
                ProfileUpdateResult(
                    partner_id=r["partner_id"],
                    partner_name=r.get("partner_name"),
                    action=r["action"],
                    changes={
                        k: ProfileChange(from_value=v["from"], to_value=v["to"])
                        for k, v in r.get("changes", {}).items()
                    },
                    mode=r.get("mode", req.mode.value),
                )
                for r in results
            ],
        )


# ══════════════════════════════════════════════════════════════════════════
#  4. MTTR TRACKER (proxy to Golang service)
# ══════════════════════════════════════════════════════════════════════════

def _register_mttr_routes(app: FastAPI):

    @app.post(
        "/api/v1/mttr/events",
        responses={
            201: {"description": "Event recorded"},
            400: {"model": ErrorResponse},
            502: {"model": ErrorResponse},
        },
        tags=["4. MTTR Tracker"],
    )
    async def ingest_event(req: IngestEventRequest):
        """Record a telemetry event for MTTR tracking.

        Proxies to the Golang MTTR tracker service. Events track
        the lifecycle of a finding through phases:
        identified -> assigned -> in_progress -> resolved -> verified
        """
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(
                    f"{_mttr_base_url}/api/v1/events",
                    json=req.model_dump(),
                )
                if resp.status_code != 201:
                    raise HTTPException(
                        status_code=resp.status_code,
                        detail=resp.text,
                    )
                return resp.json()
        except httpx.ConnectError:
            raise HTTPException(
                status_code=502,
                detail=f"MTTR tracker unavailable at {_mttr_base_url}",
            )

    @app.get(
        "/api/v1/mttr/findings/{finding_id}",
        response_model=FindingMTTRResponse,
        responses={404: {"model": ErrorResponse}, 502: {"model": ErrorResponse}},
        tags=["4. MTTR Tracker"],
    )
    async def get_finding_mttr(finding_id: str):
        """Get MTTR timeline and metrics for a specific finding.

        Returns all lifecycle events and the computed MTTR in hours.
        """
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(
                    f"{_mttr_base_url}/api/v1/findings/{finding_id}"
                )
                if resp.status_code != 200:
                    raise HTTPException(
                        status_code=resp.status_code,
                        detail=resp.text,
                    )
                data = resp.json()
                return FindingMTTRResponse(
                    finding_id=data["finding_id"],
                    mttr_hours=data.get("mttr_hours"),
                    event_count=data.get("event_count", 0),
                    events=[
                        MTTRTimelineEvent(
                            id=e.get("id", ""),
                            finding_id=e.get("finding_id", ""),
                            phase=e.get("phase", ""),
                            timestamp=e.get("timestamp", ""),
                            assignee=e.get("assignee"),
                            duration_seconds=e.get("duration_seconds"),
                        )
                        for e in data.get("events", [])
                    ],
                )
        except httpx.ConnectError:
            raise HTTPException(
                status_code=502,
                detail=f"MTTR tracker unavailable at {_mttr_base_url}",
            )

    @app.get(
        "/api/v1/mttr/report",
        response_model=MTTRReportResponse,
        responses={502: {"model": ErrorResponse}},
        tags=["4. MTTR Tracker"],
    )
    async def get_mttr_report(
        from_date: Optional[str] = Query(None, description="ISO 8601 start (e.g. 2025-01-01T00:00:00Z)"),
        to_date: Optional[str] = Query(None, description="ISO 8601 end"),
        risk_category: Optional[str] = Query(None, description="Filter by risk category"),
    ):
        """Get aggregate MTTR report with avg and P95 metrics.

        Optionally filter by time range and risk category.
        Proxied to the Golang MTTR tracker.
        """
        try:
            params = {}
            if from_date:
                params["from"] = from_date
            if to_date:
                params["to"] = to_date
            if risk_category:
                params["risk_category"] = risk_category

            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(
                    f"{_mttr_base_url}/api/v1/mttr/report",
                    params=params,
                )
                if resp.status_code != 200:
                    raise HTTPException(
                        status_code=resp.status_code,
                        detail=resp.text,
                    )
                data = resp.json()
                return MTTRReportResponse(
                    total_findings=data.get("total_findings", 0),
                    avg_mttr_hours=data.get("avg_mttr_hours", 0.0),
                    p95_mttr_hours=data.get("p95_mttr_hours", 0.0),
                    by_severity=data.get("by_severity", {}),
                    by_risk_category=data.get("by_risk_category", {}),
                    period_from=from_date,
                    period_to=to_date,
                )
        except httpx.ConnectError:
            raise HTTPException(
                status_code=502,
                detail=f"MTTR tracker unavailable at {_mttr_base_url}",
            )

    @app.get(
        "/api/v1/mttr/open",
        response_model=list[OpenFindingMTTR],
        responses={502: {"model": ErrorResponse}},
        tags=["4. MTTR Tracker"],
    )
    async def get_open_findings_mttr():
        """Get all open findings with their current MTTR metrics.

        Useful for dashboard views showing aging findings.
        """
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(
                    f"{_mttr_base_url}/api/v1/mttr/open"
                )
                if resp.status_code != 200:
                    raise HTTPException(
                        status_code=resp.status_code,
                        detail=resp.text,
                    )
                data = resp.json()
                return [
                    OpenFindingMTTR(
                        finding_id=f.get("finding_id", ""),
                        finding_ref=f.get("finding_ref", ""),
                        severity=f.get("severity", ""),
                        risk_category=f.get("risk_category", ""),
                        title=f.get("title", ""),
                        mttr_hours=f.get("mttr_hours", 0.0),
                        current_phase=f.get("current_phase", ""),
                        age_hours=f.get("age_hours", 0.0),
                    )
                    for f in data
                ]
        except httpx.ConnectError:
            raise HTTPException(
                status_code=502,
                detail=f"MTTR tracker unavailable at {_mttr_base_url}",
            )


# ══════════════════════════════════════════════════════════════════════════
#  SHARED QUERY ENDPOINTS (findings, policies, reports)
# ══════════════════════════════════════════════════════════════════════════

def _register_query_routes(app: FastAPI):

    @app.get(
        "/api/v1/findings",
        response_model=FindingsListResponse,
        tags=["findings"],
    )
    async def list_findings(
        severity: Optional[str] = Query(None),
        status: Optional[str] = Query(None),
        risk_category: Optional[str] = Query(None),
        limit: int = Query(50, ge=1, le=500),
        offset: int = Query(0, ge=0),
    ):
        """List audit findings with optional filtering.

        Query all findings from the compliance database, filtered by
        severity, status, or risk category. Supports pagination.
        """
        with _session_factory() as session:
            query = session.query(AuditFinding)
            if severity:
                try:
                    sev_enum = AuditSeverity(severity)
                    query = query.filter(AuditFinding.severity == sev_enum)
                except ValueError:
                    pass
            if status:
                try:
                    stat_enum = AuditStatus(status)
                    query = query.filter(AuditFinding.status == stat_enum)
                except ValueError:
                    pass
            if risk_category:
                try:
                    risk_enum = RiskCategory(risk_category)
                    query = query.filter(AuditFinding.risk_category == risk_enum)
                except ValueError:
                    pass

            total = query.count()
            findings = query.order_by(AuditFinding.detected_at.desc()).offset(offset).limit(limit).all()

            return FindingsListResponse(
                total=total,
                findings=[
                    {
                        "id": f.id,
                        "finding_ref": f.finding_ref,
                        "severity": f.severity.value if f.severity else None,
                        "status": f.status.value if f.status else None,
                        "risk_category": f.risk_category.value if f.risk_category else None,
                        "title": f.title,
                        "description": f.description,
                        "affected_system": f.affected_system,
                        "affected_table": f.affected_table,
                        "affected_row_count": f.affected_row_count,
                        "edi_standard": f.edi_standard.value if f.edi_standard else None,
                        "detected_at": f.detected_at.isoformat() if f.detected_at else None,
                        "remediated_at": f.remediated_at.isoformat() if f.remediated_at else None,
                    }
                    for f in findings
                ],
            )

    @app.get(
        "/api/v1/policies",
        response_model=PoliciesListResponse,
        tags=["policies"],
    )
    async def list_policies(
        enabled_only: bool = Query(False),
        limit: int = Query(50, ge=1, le=500),
        offset: int = Query(0, ge=0),
    ):
        """List masking policies with optional filtering.

        Returns all MaskingPolicy records from the compliance database.
        """
        with _session_factory() as session:
            query = session.query(MaskingPolicy)
            if enabled_only:
                query = query.filter(MaskingPolicy.enabled == True)  # noqa: E712

            total = query.count()
            policies = query.order_by(MaskingPolicy.created_at.desc()).offset(offset).limit(limit).all()

            return PoliciesListResponse(
                total=total,
                policies=[
                    {
                        "id": p.id,
                        "name": p.name,
                        "field_name": p.field_name,
                        "field_category": p.field_category.value if p.field_category else None,
                        "action": p.action.value if p.action else None,
                        "parameters": p.parameters,
                        "gdpr_article": p.gdpr_article,
                        "enabled": p.enabled,
                        "created_at": p.created_at.isoformat() if p.created_at else None,
                        "updated_at": p.updated_at.isoformat() if p.updated_at else None,
                    }
                    for p in policies
                ],
            )

    @app.get(
        "/api/v1/reports",
        response_model=list[ComplianceReportResponse],
        tags=["reports"],
    )
    async def list_reports(
        limit: int = Query(20, ge=1, le=100),
    ):
        """List compliance summary reports.

        Returns periodic compliance reports with finding counts
        and MTTR metrics.
        """
        with _session_factory() as session:
            reports = (
                session.query(ComplianceReport)
                .order_by(ComplianceReport.generated_at.desc())
                .limit(limit)
                .all()
            )

            return [
                ComplianceReportResponse(
                    id=r.id,
                    report_period_start=r.report_period_start,
                    report_period_end=r.report_period_end,
                    total_findings=r.total_findings,
                    critical_count=r.critical_count,
                    high_count=r.high_count,
                    medium_count=r.medium_count,
                    low_count=r.low_count,
                    remediated_count=r.remediated_count,
                    avg_mttr_hours=r.avg_mttr_hours,
                    summary=r.summary,
                )
                for r in reports
            ]
