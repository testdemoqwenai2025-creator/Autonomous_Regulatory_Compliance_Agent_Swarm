# Skill: Global Maritime Data Governance & Privacy Swarm

## Overview

Autonomous regulatory compliance agent swarm for global maritime freight operations. The swarm automates GDPR/PII anonymisation, EDI compliance auditing, remediation policy generation, and MTTR telemetry tracking across five international jurisdictions. Designed to evolve with emerging regulations, expanding data repositories, satellite AIS feeds, and the unique challenges of extreme weather and special maritime regions.

## When to Use This Skill

- Building compliance automation for maritime logistics, shipping, or freight forwarding
- Implementing PII anonymisation pipelines for Bills of Lading, manifests, or customs declarations
- Auditing EDI connections (EDIFACT, ANSI X12, BAPLIE, VGM) for encryption and format compliance
- Generating automated remediation policies from audit findings
- Tracking Mean Time To Remediate (MTTR) for compliance incidents
- Multi-jurisdiction data governance (GDPR, CCPA, LGPD, PDPA, PIPA)
- Weather-aware compliance operations in extreme maritime environments
- Integrating compliance across diverse maritime data repositories (AIS, PCS, IoT, blockchain eBL)
- Satellite-based vessel tracking compliance and route deviation detection
- Carbon emissions reporting compliance (EU ETS, IMO DCS, MRV)

---

## Current Capabilities (v3.1)

> **v3.1 changes (Phase 2):** Added strategic roadmap document (`docs/Strategic_Analysis_Maritime_Compliance_Swarm.docx`) with 6-horizon evolution plan, three-tier strategic analysis (current state, competitive positioning, technology trajectory), and investment framework. Enhanced Frontend-Backend Integration Verification section with always-on preview endpoint contract. Updated project documentation to reflect production-ready integration patterns.

### 1. Manifest PII Anonymiser (Python)

- **HMAC-SHA256 deterministic tokenisation** — produces consistent tokens for the same input across runs, enabling cross-referencing without exposing original data
- **Fernet symmetric encryption** — reversible pseudonymisation for customs DPA-covered use cases (AES-128-CBC + HMAC-SHA256)
- **Multi-jurisdiction PII rules** — 7 default rules covering consignee identity, shipper identity, contact info, government IDs, and financial IDs
- **Free-text PII scanning** — regex-based detection of emails, phone numbers, passport numbers, and tax IDs embedded in free-text fields
- **ML NER detection** — spaCy-based named entity recognition for PII in unstructured free-text (remarks, special instructions, hazmat descriptions)
- **Six masking actions** — tokenise, redact, generalise (date granularity), pseudonymise, encrypt, truncate
- **Token format** — `{PREFIX}_{CATEGORY}_{HMAC_TRUNCATED}` (e.g., `MTS_CONS_a3f8c1e9b2d4`)

### 2. Logistics EDI SQL Auditor (Python)

- **11 parametric SQL audit queries** across 5 compliance domains
- **Domain: Encryption** (3 queries) — unencrypted EDI transmissions, FTP file transfers, expired TLS certificates
- **Domain: Customs Documentation** (3 queries) — missing customs declarations, missing VGM, expiring dangerous goods docs
- **Domain: EDI Format** (2 queries) — failed validation messages, orphaned references
- **Domain: Data Retention** (2 queries) — PII past retention period, unanonymised historical manifests
- **Domain: Access Control** (1 query) — excessive user permissions
- **Pluggable query registry** — database-backed, versioned queries updatable via API without redeployment
- **Finding persistence** — all results stored as `AuditFinding` records with severity, risk category, and evidence samples
- **EDI profile scanning** — checks each partner connection for encryption status and TLS version

### 3. Remediation Route Generator (Python)

- **Decision matrix** — maps 7 risk categories to recommended policy actions automatically
- **Three execution modes** — dry-run (propose only), staged (persist as disabled), apply (persist and enable)
- **Field category inference** — infers PII category from field names when evidence is ambiguous
- **EDI profile updater** — enforces TLS 1.3 and enables encryption on non-compliant partner connections
- **Finding status tracking** — marks findings as in-progress or remediated when policies are generated

### 4. Telemetry MTTR Tracker (Golang)

- **Buffered event ingestion** — in-memory buffer with configurable flush interval (default 10s)
- **Background goroutine** — non-blocking writes to the database
- **Ten lifecycle phases** — aligned with Python FindingState: identified, triaged, assigned, in_progress, awaiting_verification, resolved, verified, escalated, risk_accepted, closed, false_positive
- **MTTR calculation** — average and P95 metrics, broken down by severity and risk category; accepts both "resolved" and "verified" as MTTR end points
- **SQLite (dev) / PostgreSQL (prod)** — driver-agnostic via configuration swap
- **HTTP API** — 6 endpoints including `/api/v1/events/sm` for receiving state machine transition payloads
- **Phase mapping** — `FindingStateToPhase` map translates all 10 Python FindingState values to Go EventPhase constants

### 5. Finding State Machine (Python)

- **10 states** — DETECTED, TRIAGED, ASSIGNED, IN_REMEDIATION, AWAITING_VERIFICATION, VERIFIED, CLOSED, ESCALATED, RISK_ACCEPTED, FALSE_POSITIVE
- **20 transitions** — each with trigger, actor, guard conditions, timeout rules, and context payloads
- **7 trigger types** — manual_triage, manual_assign, remediation_submitted, verification_passed, verification_failed, auto_escalate_timeout, manual_close, risk_accept, mark_false_positive
- **Guard conditions** — e.g., CLOSURE requires no open remediation tasks; ESCALATION requires sign-off for CRITICAL findings
- **Timeout SLAs** — per-severity auto-escalation (CRITICAL: 1h detected/triaged, 4h assigned, 8h remediation; HIGH: 4h/8h/24h; MEDIUM: 24h/48h/72h)
- **Callback bridge** — registered callback on every successful transition auto-emits FINDING_STATE_CHANGED event to the event bus
- **Go MTTR bridge** — async HTTP POST forwards every transition to Go service via `map_go_phase()` static method
- **Full audit trail** — every transition persisted to `finding_transitions` table with before/after state, trigger, actor, context payload, and auto-escalation flag
- **Manual timeout check** — `POST /api/v1/state-machine/timeout-check` endpoint scans all open findings and auto-escalates SLA breaches

### 6. Event Bus (Python)

- **Database-backed event store** — all events persisted to `event_log` table with full metadata
- **PG LISTEN/NOTIFY fallback** — uses PostgreSQL real-time notifications when available; falls back to in-process queue for SQLite
- **Background consumer loop** — processes queued events and dispatches to subscribers
- **Subscriber API** — register handlers for specific event types with optional correlation ID filtering
- **Statistics endpoint** — `GET /api/v1/events/stats` returns total events, processed count, queue depth, transport type, subscriber count
- **Event log query** — `GET /api/v1/events` returns recent events with filtering
- **Manual publish** — `POST /api/v1/events/publish` for testing and external integration

### 7. Reaction Engine (Python)

- **7 built-in reaction rules** with conditions and actions:
  1. `react_critical_notification` — CRITICAL findings trigger EDI partner notification and auto-escalation
  2. `react_pii_auto_scan` — PII exposure findings trigger automatic anonymisation scan
  3. `react_cert_expiry_check` — certificate expiry findings trigger compliance audit re-run
  4. `react_timeout_escalation` — timeout events trigger escalation with SLA context
  5. `react_remediation_verification` — remediation completion triggers verification workflow
  6. `react_audit_summary` — audit completion triggers summary report generation
  7. `react_mttr_baseline` — new finding creation triggers MTTR baseline establishment
- **Conditional execution** — each rule evaluates event type, severity, risk category, and payload fields before firing
- **Toggle API** — `PUT /api/v1/reactions/rules/{rule_id}/toggle` enables or disables individual rules at runtime
- **Statistics endpoint** — `GET /api/v1/reactions/stats` returns enabled count, total actions executed, and per-rule action counts
- **Reaction log** — `GET /api/v1/reactions/log` shows recent reaction activity with full context

### 8. Composite Risk Scoring Engine (Python) ★ NEW in v3.0

- **5-dimensional weighted model** — CRS = 0.30*S_sev + 0.20*S_jur + 0.20*S_sens + 0.15*S_exp + 0.15*S_urg
- **Severity sub-score** — direct lookup (CRITICAL=1.0, HIGH=0.8, MEDIUM=0.5, LOW=0.3, INFO=0.1)
- **Jurisdiction sub-score** — enforcement rigour weighting (GDPR=1.0, CCPA=0.85, LGPD=0.70, PIPA=0.65, PDPA=0.50)
- **Data sensitivity sub-score** — 8 levels from special_category=1.0 to operational=0.25
- **Exposure breadth sub-score** — logarithmic scaling combining record count, partner count, and jurisdiction count
- **Temporal urgency sub-score** — age-based ramping (0-72h), SLA deadline proximity, state-dependent reduction
- **Risk level mapping** — CRS >= 0.80 CRITICAL, >= 0.60 HIGH, >= 0.40 MEDIUM, >= 0.20 LOW, < 0.20 INFO
- **ORM convenience** — `score_finding(audit_finding)` method for direct scoring from database objects

### 9. Compliance Knowledge Graph (Python) ★ NEW in v3.0

- **10 node types** — regulation, jurisdiction, data_category, obligation, enforcement, data_source, risk_category, compliance_control, org_unit, maritime_region
- **11 edge types** — regulated_by, applies_in, requires, triggers, enforced_via, conflicts_with, contains, processed_by, mitigates, supersedes, references
- **Graph operations** — add/remove nodes and edges, neighbor queries (outgoing/incoming/both), BFS path finding with max depth
- **Conflict detection** — `find_conflicts(jurisdiction)` identifies conflicting regulations within a jurisdiction
- **Compliance gap analysis** — `get_compliance_gaps(org_node)` identifies missing controls for applicable obligations
- **Seed data** — pre-populated with 5 jurisdictions, 10 regulations, 7 data categories, 8 obligations, 6 controls, 5 maritime regions
- **Production path** — designed for migration to Neo4j, Amazon Neptune, or PostgreSQL Apache AGE

### 10. Middleware Pipeline (Python) ★ NEW in v3.0

- **Chain-of-responsibility pattern** — composable middleware with priority-ordered execution
- **Authentication middleware** — API key and JWT validation, configurable exempt paths, per-request principal tracking
- **Rate limiting middleware** — token-bucket algorithm, per-IP tracking, configurable window (100 req/60s default, 150 burst)
- **Request validation middleware** — payload size enforcement (10 MB max), content type validation
- **Audit log middleware** — structured JSON logging with request ID, duration, status code, auth principal; X-Request-ID and X-Duration-Ms response headers
- **Priority system** — CORS(10) → AUTH(20) → RATE_LIMIT(30) → VALIDATION(40) → AUDIT_LOG(50)

### 11. Structured Observability (Python) ★ NEW in v3.0

- **Structured JSON logging** — `StructuredFormatter` outputs JSON with timestamp, level, module, function, line, correlation_id, request_id
- **Health aggregator** — registers health check functions per component, computes overall status (healthy/degraded/unhealthy), maintains 1000-snapshot history
- **Metrics collector** — thread-safe counters, gauges, and histograms with percentile computation (p50, p95, p99)
- **Service filter** — adds `service` field to all log entries for multi-service log aggregation

### 12. Satellite AIS Ingestion (Python) ★ NEW in v3.0

- **Foundation module** — `shared/satellite_ingest.py` provides the framework for satellite AIS data pipeline
- **Target architecture** — Apache Kafka for high-throughput ingestion, PostgreSQL with PostGIS for spatial indexing
- **Compliance use cases** — route deviation detection, AIS gap identification, positional integrity verification
- **Production target** — multi-provider failover (exactEarth, Spire, ORBCOMM), back-pressure management, error recovery

### 13. API Gateway + Dashboard (Python FastAPI) ★ UPDATED in v3.1

- **45 REST routes** covering all tools, state machine, event bus, reactions, knowledge graph, composite scoring, query registry
- **Frontend-Backend Integration Verification** — `GET /api/v1/system/frontend-status` is the **always-on preview endpoint** that confirms frontend-backend and all component communication. This endpoint MUST always feature in README.md and is the single source of truth for integration health.
- **10-component health contract** — the preview endpoint tests: (1) Database read/write, (2) State Machine definition + callback bridge, (3) Event Bus statistics + transport, (4) Reaction Engine rules + actions, (5) Anonymiser HMAC-SHA256 tokenisation, (6) NER Detector spaCy availability, (7) EDI Auditor rule engine, (8) Remediation decision matrix, (9) MTTR Tracker Go service reachability, (10) End-to-end event flow proof (publishes real event, processes through subscriber pipeline)
- **Connectivity diagnostic** — `GET /api/v1/system/connectivity` provides per-component latency, status, and detail for all 10 components
- **State machine bridge** — callback on every successful transition auto-publishes `FINDING_STATE_CHANGED` event with full transition context
- **State machine to Go MTTR bridge** — async HTTP POST forwards transitions to Go service at `/api/v1/events/sm`
- **Static HTML dashboard** — interactive dark-theme UI with 10 tabs (Tools, Backend Status, Connectivity, Anonymiser, Auditor, Remediation, MTTR Tracker, Findings, State Machine, Event Bus)
- **Backend Status panel** — visual grid showing live status of all 10 backend services, auto-refreshes on tab selection
- **Python Client SDK** — typed `httpx` client with Pydantic models for programmatic integration
- **OpenAPI documentation** — auto-generated Swagger UI at `/docs` and ReDoc at `/redoc`
- **CORS middleware** — configured for cross-origin frontend access
- **MTTR proxy** — transparently proxies MTTR requests to the Golang service

---

## Frontend-Backend Integration Verification ★ NEW in v3.1

The **preview endpoint** is the contract between the frontend and all backend components. It MUST always be present and functioning in README.md as the primary proof of integration progress.

### Preview Endpoint

```
GET /api/v1/system/frontend-status
```

### 10-Component Health Contract

| # | Component | Test Performed | Expected | Dev Without Go |
|---|-----------|---------------|----------|----------------|
| 1 | Database | `SELECT 1` read/write probe | `ok` | Required |
| 2 | State Machine | Load 10-state definition, 20+ transitions, callback bridge | `ok` | Required |
| 3 | Event Bus | Transport type, event count, subscriber count | `ok` | Required |
| 4 | Reaction Engine | Active rules count, actions fired | `ok` | Required |
| 5 | Anonymiser | HMAC-SHA256 tokenisation of probe value | `ok` | Required |
| 6 | NER Detector | spaCy availability, layer count | `ok` | Required |
| 7 | EDI Auditor | Rule engine match probe | `ok` | Required |
| 8 | Remediation | Decision matrix route count | `ok` | Required |
| 9 | MTTR Tracker (Go) | HTTP GET to Go service `/health` | `ok` | `unavailable` acceptable |
| 10 | Event Flow | Publish `SYSTEM_HEALTH_CHANGED`, process through subscribers | `ok` | Required |

### Usage

```bash
# Verify all 10 components and end-to-end event flow
curl -s http://localhost:8000/api/v1/system/frontend-status | python3 -m json.tool

# Python SDK
from client import ComplianceSwarmClient
api = ComplianceSwarmClient(base_url="http://localhost:8000")
status = api.get_frontend_status()
print(f"System: {status['status']}, Version: {status['gateway_version']}")
for name, svc in status['services'].items():
    print(f"  {name}: {svc['status']} — {svc['detail']}")
```

### Response Contract

```json
{
  "status": "operational" | "degraded",
  "timestamp": "2025-07-30T12:00:00+00:00",
  "gateway_version": "3.1.0",
  "services": {
    "database": {"status": "ok", "detail": "read/write verified"},
    "state_machine": {"status": "ok", "states": 10, "transitions": 20, "detail": "..."},
    "event_bus": {"status": "ok", "transport": "sqlite", "events_stored": 42, "subscribers": 7, "detail": "..."},
    "reaction_engine": {"status": "ok", "active_rules": 7, "actions_fired": 15, "detail": "..."},
    "anonymiser": {"status": "ok", "detail": "HMAC-SHA256 tokeniser operational"},
    "ner_detector": {"status": "ok", "layers": 4, "detail": "..."},
    "auditor": {"status": "ok", "detail": "rule engine + audit queries loaded"},
    "remediation": {"status": "ok", "policies": 7, "detail": "..."},
    "mttr_tracker": {"status": "unavailable", "detail": "Cannot reach Go MTTR tracker at http://localhost:8080"},
    "event_flow": {"status": "ok", "detail": "Published event abc123... and processed through subscriber pipeline"}
  }
}
```

### Integration Rules

1. **Always present in README.md** — the preview endpoint section must be the first technical section after the project description
2. **Version-gated** — `gateway_version` field allows frontend to detect API version compatibility
3. **MTTR graceful degradation** — `unavailable` status for Go service is acceptable in dev (9/10 `ok` = `operational`)
4. **Event flow proof** — component #10 is NOT a passive check; it publishes a real event and verifies it processes through the subscriber pipeline
5. **Dashboard integration** — the Backend Status tab calls this endpoint on every tab selection with auto-refresh

---

## Strategic Evolution Path (6 Horizons, 2025-2035)

The full strategic roadmap with three-tier analysis (current state assessment, competitive positioning, technology trajectory) and investment framework is in `docs/Strategic_Analysis_Maritime_Compliance_Swarm.docx`.

### Horizon 1: Foundation Hardening (2025-2026)

| Evolution | Description | Target Capability |
|-----------|-------------|-------------------|
| PostgreSQL + PostGIS migration | Replace SQLite dev with PostgreSQL 16 + PostGIS 3.4 for production spatial queries | Foundation for AIS ingestion and region-aware compliance |
| EU ETS audit domain | Add 6th compliance domain for carbon reporting (MRV data, registry, credits) | Address 2024+ EU ETS maritime mandate |
| Satellite AIS pipeline | Kafka + PostGIS pipeline ingesting satellite AIS feeds (exactEarth, Spire, ORBCOMB) | Vessel tracking compliance, route deviation detection |
| JWT authentication | Enable middleware pipeline auth (JWT + API key, RBAC roles) | Production-ready API security |
| Distributed rate limiting | Redis-backed rate limiting replacing in-memory token bucket | Multi-instance deployment support |

### Horizon 2: Intelligence Augmentation (2026-2027)

| Evolution | Description | Target Capability |
|-----------|-------------|-------------------|
| ML anomaly detection | Statistical baseline distributions, flag outliers before violations | Proactive vs. reactive compliance |
| Knowledge graph (Neo4j) | Migrate from in-memory to Neo4j/Neptune for complex multi-hop queries | Cross-jurisdictional conflict detection, impact analysis |
| Weather-aware compliance | NOAA GFS + ECMWF ERA5 ingestion, weather event types on event bus | Weather-hold remediation, weather-adjusted MTTR |
| Cross-DB federation | Query across FMS + PCS + customs single-window + AIS warehouse | Unified compliance audit across all data repositories |
| Multi-script PII | Unicode property classes for CJK, Arabic, Devanagari, Cyrillic | Full BRICS+ shipping corridor coverage |

### Horizon 3: Autonomous Operations (2027-2029)

| Evolution | Description | Target Capability |
|-----------|-------------|-------------------|
| Closed-loop remediation | Auto re-audit after remediation, escalate if still failing | Ensure root-cause resolution |
| Multi-party orchestration | BPMN 2.0 workflow engine for cross-organisational compliance | Carrier + customs + port authority coordination |
| Streaming MTTR (SSE) | Real-time MTTR feed via Server-Sent Events from Go service | Live compliance dashboards without polling |
| Learned decision matrix | Train on historical finding-remediation-verification outcomes | Continuously improving remediation accuracy |
| Rust performance components | Rewrite risk scorer and graph query optimiser in Rust | Memory safety for crypto operations, zero-cost abstractions |

### Horizon 4: Predictive Intelligence (2029-2031)

| Evolution | Description | Target Capability |
|-----------|-------------|-------------------|
| Violation prediction | ML model trained on event-sourced history to predict compliance failures | Preventive compliance (>30% findings predicted before occurrence) |
| NLP regulatory monitoring | LLM-based analysis of regulatory publications, automated impact assessment | Real-time regulatory change response |
| Digital twin compliance | Virtual compliance posture for what-if analysis of operational changes | Risk simulation before opening new trade lanes |
| Event sourcing + CQRS | Immutable event store with separated read model | Complete temporal query capability for regulatory investigations |
| SAR + optical satellite | Synthetic aperture radar and optical imagery for vessel verification | Detect AIS spoofing, verify port operations, visual compliance |

### Horizon 5: Ecosystem Integration (2031-2033)

| Evolution | Description | Target Capability |
|-----------|-------------|-------------------|
| Federated learning | Privacy-preserving cross-operator compliance pattern learning | Industry-wide intelligence without data exposure |
| Regulatory sandboxes | Partnership with FCA, MAS sandbox programmes for rule testing | Reduce risk of unintended compliance gaps |
| Cross-border data governance | Automated SCC/BCR/TIA generation for GDPR Chapter V data transfers | Multi-jurisdiction data flow compliance |
| Blockchain eBL integration | Smart contract event monitoring, hash-based integrity verification | Bill of Lading chain-of-custody compliance |
| IoT streaming compliance | MQTT-based continuous sensor data compliance (cold-chain, hazmat) | Real-time temperature/shock deviation detection |

### Horizon 6: Autonomous Governance (2033-2035)

| Evolution | Description | Target Capability |
|-----------|-------------|-------------------|
| Self-healing compliance | Auto-refine audit queries, update risk scoring weights, deploy changes | >80% autonomous resolution for routine findings |
| Quantum-resistant cryptography | NIST 2024 PQC algorithms alongside classical (hybrid approach) | Decade-scale data protection for maritime records |
| Autonomous decision authority | Bounded decision-making with risk threshold triggers for human review | Human-on-the-loop for routine, human-in-the-loop for novel |
| LLM guardrail architecture | LLM-generated assessments validated against rule engine before action | AI-augmented compliance with hallucination protection |
| Reinforcement learning remediation | Sequential decision model optimising remediation strategy selection | Minimise MTTR while maximising first-pass verification |

---

## Weather and Special Regions Intelligence

### Supported Region Profiles

| Region | Weather Risks | Compliance Adjustments |
|--------|--------------|----------------------|
| **Arctic (Northern Sea Route)** | Sea ice, polar lows, -40C, satellite-only comms | Extended SLAs, ice-route customs pre-clearance, satellite-optimised EDI retry |
| **Gulf of Aden / Red Sea** | Extreme heat 50C+, piracy, Houthi disruptions | Sanction screening on route changes, automatic grace-period, security escalation |
| **Bay of Bengal** | Cyclone season Apr-Dec, monsoon flooding, port closures | Weather-hold mode, bulk VGM re-submission, port-closure event correlation |
| **Caribbean / Gulf of Mexico** | Hurricane season Jun-Nov, storm surge, port evacuations | Burst-mode MTTR clustering, insurance doc auto-gen, regional weather-adjusted SLAs |
| **Strait of Malacca** | Tropical thunderstorms, high traffic, AIS congestion | Deduplication audit, AIS gap detection, high-throughput message queue |
| **English Channel / North Sea** | Fog, rough seas, wind farm AIS interference | Container-loss incident templates, hazmat exposure audit, weather-correlated MTTR |

### Weather Integration Architecture

1. **Weather Ingestion Service** — Polls NOAA GFS, ECMWF ERA5, and commercial APIs every 15 minutes
2. **Marine Zone Forecast Storage** — Weather data stored in PostgreSQL with PostGIS spatial indexing
3. **Compliance Event Bus** — Weather events (PORT_CLOSURE, STORM_TRACK, CANAL_BLOCKAGE) join with compliance events via Redis Streams
4. **Downstream Consumers** — Auditor tags findings with weather context, Remediation enters weather-hold mode, MTTR excludes force majeure periods

### Weather-Aware Compliance Patterns

| Pattern | Trigger | System Response |
|---------|---------|-----------------|
| **Weather hold** | Active storm within 200nm of affected port | Pause remediation SLA clocks, generate grace-period policies |
| **Weather-adjusted MTTR** | Finding created during active weather event | Exclude weather duration from MTTR calculation |
| **Bulk re-filing** | Port reopens after closure | Auto-generate customs re-filing tasks for affected shipments |
| **Route deviation audit** | Vessel deviates from declared route | Cross-reference with weather/piracy/sanction events to classify deviation type |
| **Environmental compliance** | Temperature excursion in cold-chain container | Generate hazmat compliance finding, notify food/pharma regulatory contacts |

---

## Data Repository Integration Map

| Data Source | Protocol | Compliance Value | Evolution Horizon |
|-------------|----------|-----------------|-----------------|
| **Freight Management System** | Direct DB (SQLAlchemy) | Core compliance data, EDI records, manifests | Current |
| **Port Community Systems** | REST API + webhooks | Customs pre-clearance, port fee compliance | H1 |
| **Single-Window Customs** | UN/EDIFACT CUSCAR/CUSRES | Real-time customs filing verification | H1 |
| **AIS Feeds (Satellite)** | Kafka/UDP stream | Vessel tracking compliance, positional integrity, route deviation | H1 |
| **Emissions Monitoring** | MRV data API | EU ETS, IMO DCS carbon reporting | H1 |
| **Blockchain eBL** | Smart contract events | Bill of Lading integrity, chain-of-custody | H5 |
| **IoT Container Sensors** | MQTT broker | Cold-chain temperature, shock detection compliance | H5 |
| **Terminal OS (TOS)** | EDIFACT COPARN/COARRI | Container movement, storage deadline compliance | H2 |
| **Crew Management** | REST API + SSO | Crew privacy, MLC 2006 compliance | H2 |
| **SAR Satellite** | Imagery pipeline | AIS spoofing detection, dark ship identification | H4 |
| **Optical Satellite** | Imagery pipeline | Port operation verification, environmental violation detection | H4 |

---

## Jurisdictions Supported

| Jurisdiction | Regulation | Key Requirements |
|-------------|------------|-------------------|
| **GDPR** | EU General Data Protection Regulation | Art.25 (data protection by design), Art.32 (security), Art.5(1)(e) (storage limitation) |
| **CCPA** | California Consumer Privacy Act | Consumer data access and deletion rights |
| **LGPD** | Brazil Lei Geral de Protecao de Dados | Consent-based processing, DPO requirements |
| **PDPA** | Singapore Personal Data Protection Act | Purpose limitation, consent obligations |
| **PIPA** | South Korea Personal Information Protection Act | Consent and data minimisation |

---

## Supported EDI Standards

- **EDIFACT** (UN/EDIFACT D.21A)
- **ANSI X12** (Version 8.6)
- **BAPLIE** (Bay Plan / Stowage)
- **VGM** (Verified Gross Mass, SOLAS VI/2)
- **COPARN** (Container movement)
- **IFTMBC** (Booking confirmation)
- **CUSTOMS** (Customs declarations)

---

## Database Schema

9 SQLAlchemy ORM tables:

1. `anonymisation_records` — audit trail for every PII field anonymised
2. `masking_policies` — field-level masking rules with GDPR article references
3. `audit_findings` — compliance issues found by the EDI auditor
4. `edi_connection_profiles` — partner EDI connection configurations
5. `mttr_events` — telemetry events tracking finding lifecycle phases
6. `compliance_reports` — periodic compliance summary reports
7. `finding_transitions` — complete audit trail of every state machine transition (from_state, to_state, trigger, actor, context_payload, auto_escalated, timeout_hours)
8. `event_log` — immutable event store for all system events (event_type, source, correlation_id, payload, created_at)
9. `audit_query_registry` — pluggable, versioned audit queries (domain, name, sql_template, parameters, version, is_active)

7 Enum types:

- `FindingState` — detected, triaged, assigned, in_remediation, awaiting_verification, verified, closed, escalated, risk_accepted, false_positive
- `PIIFieldCategory` — consignee_identity, shipper_identity, contact_info, financial_id, government_id, location
- `AuditSeverity` — critical, high, medium, low, info
- `AuditStatus` — open, in_progress, remediated, accepted_risk, false_positive
- `EDIStandard` — EDIFACT, ANSI_X12, BAPLIE, VGM, COPARN, IFTMBC, CUSTOMS
- `PolicyAction` — tokenise, redact, generalise, pseudonymise, encrypt, truncate
- `RiskCategory` — pii_exposure, unencrypted_transmission, missing_customs_doc, edi_non_compliance, data_retention_violation, access_control_breach, cert_expiry

---

## API Endpoints (45 routes)

| Method | Path | Tool |
|--------|------|------|
| GET | `/` | Dashboard (HTML) |
| GET | `/health` | Health check |
| GET | `/api/v1/system/frontend-status` | Frontend Status (10-service check + event flow proof) |
| GET | `/api/v1/system/connectivity` | Connectivity Diagnostic (verbose, latency per component) |
| POST | `/api/v1/anonymise/manifest` | Anonymiser |
| POST | `/api/v1/anonymise/free-text` | Anonymiser |
| POST | `/api/v1/anonymise/scan` | Anonymiser |
| POST | `/api/v1/anonymise/ner/scan` | NER Detector |
| POST | `/api/v1/anonymise/ner/anonymise` | NER Anonymiser |
| POST | `/api/v1/audit/run` | Auditor |
| GET | `/api/v1/audit/profiles` | Auditor |
| GET | `/api/v1/audit/queries` | Auditor |
| GET | `/api/v1/audit/registry/queries` | Query Registry |
| POST | `/api/v1/audit/registry/queries` | Query Registry |
| PUT | `/api/v1/audit/registry/queries/{id}` | Query Registry |
| DELETE | `/api/v1/audit/registry/queries/{id}` | Query Registry |
| POST | `/api/v1/remediation/policies` | Remediation |
| POST | `/api/v1/remediation/edi-profiles` | Remediation |
| POST | `/api/v1/mttr/events` | MTTR (Go) |
| POST | `/api/v1/events/sm` | MTTR SM Bridge (Go) |
| GET | `/api/v1/mttr/findings/{id}` | MTTR (Go) |
| GET | `/api/v1/mttr/report` | MTTR (Go) |
| GET | `/api/v1/mttr/open` | MTTR (Go) |
| GET | `/api/v1/findings` | Shared |
| GET | `/api/v1/policies` | Shared |
| GET | `/api/v1/reports` | Shared |
| GET | `/api/v1/state-machine/definition` | State Machine |
| GET | `/api/v1/state-machine/transitions/{id}/available` | State Machine |
| POST | `/api/v1/state-machine/transitions/{id}` | State Machine |
| GET | `/api/v1/state-machine/transitions/{id}/timeline` | State Machine |
| POST | `/api/v1/state-machine/timeout-check` | State Machine |
| GET | `/api/v1/events/stats` | Event Bus |
| GET | `/api/v1/events` | Event Bus |
| POST | `/api/v1/events/publish` | Event Bus |
| GET | `/api/v1/reactions/rules` | Reactions |
| GET | `/api/v1/reactions/stats` | Reactions |
| GET | `/api/v1/reactions/log` | Reactions |
| PUT | `/api/v1/reactions/rules/{id}/toggle` | Reactions |
| GET | `/docs` | Swagger UI |
| GET | `/redoc` | ReDoc |

---

## Documentation Artifacts

| Document | Path | Description |
|----------|------|-------------|
| Strategic Roadmap | `docs/Strategic_Analysis_Maritime_Compliance_Swarm.docx` | 6-horizon evolution plan (2025-2035), three-tier strategic analysis, investment framework |
| Technology Deep Dive | `docs/Technology_Deep_Dive_2025-2035.pdf` | Deep-dive on event sourcing, AI/ML, quantum crypto, satellite AIS, SAR/optical vision, data repository evolution |
| Workflow Diagram | `docs/workflow_diagram.mmd` / `.png` | Mermaid source and rendered 10-phase operational workflow |
| Skills Reference | `SKILLS.md` | Full capability catalogue, evolution horizons, data repository map |
| Integration Proof | README.md (Preview Endpoint section) | Always-on 10-component frontend-backend health verification |

---

## Technology Stack

| Component | Technology | Version |
|-----------|------------|---------|
| API Gateway | Python, FastAPI, uvicorn, httpx | 3.12+ |
| PII Anonymiser | Python, cryptography (HMAC-SHA256, Fernet), spaCy | 3.12+ |
| EDI Auditor | Python, SQLAlchemy 2.0 | 3.12+ |
| Remediation | Python, SQLAlchemy 2.0 | 3.12+ |
| State Machine | Python, shared/state_machine.py | 3.12+ |
| Event Bus | Python, shared/event_bus.py | 3.12+ |
| Reaction Engine | Python, shared/reactions.py | 3.12+ |
| Composite Risk Scoring | Python, shared/risk_scorer.py | 3.12+ |
| Knowledge Graph | Python, shared/knowledge_graph.py | 3.12+ |
| Middleware Pipeline | Python, shared/middleware.py | 3.12+ |
| Observability | Python, shared/observability.py | 3.12+ |
| Satellite AIS Ingestion | Python, shared/satellite_ingest.py | 3.12+ |
| MTTR Tracker | Golang, net/http, database/sql | 1.22+ |
| Database (dev) | SQLite with WAL mode | — |
| Database (prod) | PostgreSQL 16 + PostGIS 3.4 | — |
| Containerisation | Docker multi-stage, docker-compose | — |
| CI/CD | GitHub Actions (5 jobs) | — |

---

## Deployment

```bash
# Docker (gateway + DB + MTTR tracker)
docker compose up --build -d

# Local development (Python gateway only, SQLite)
make init && make gateway

# Run one-shot CLI tools via Docker
docker compose --profile tools run --rm auditor
docker compose --profile tools run --rm anonymiser
```

---

## Security Considerations

- **HMAC key** — drives all tokenisation determinism; rotating it invalidates every token. Treat as a root CA key.
- **Fernet keys** — generated per-session by default; for production, rotate via a key management service.
- **Gateway auth** — JWT/API key middleware available in pipeline (enable via SwarmConfig for production).
- **CORS** — currently wildcard; lock to your frontend domain in production.
- **Rate limiting** — token-bucket middleware (100 req/60s, 150 burst); production should use Redis-backed distributed limiting.
- **Audit logging** — structured audit log middleware in pipeline captures every request with request ID, user, timestamp, and response status.
