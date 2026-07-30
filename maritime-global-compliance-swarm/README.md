# Maritime Global Compliance Swarm

> Autonomous regulatory compliance agent swarm for global maritime freight. Automates GDPR/PII anonymisation, EDI compliance audits, remediation policy generation, MTTR telemetry, finding state machine governance, and event-driven reactive compliance — all exposed via a unified Python FastAPI gateway with an interactive HTML dashboard.

---

## Functioning Preview Endpoint

The live frontend-backend communication can be verified at any time via the **Frontend Status** endpoint. This is the single endpoint that confirms the frontend can reach every backend component and proves end-to-end event flow:

```bash
curl -s http://localhost:8000/api/v1/system/frontend-status | python3 -m json.tool
```

**What it tests (10 components):**

| # | Component | Test Performed | Expected Status |
|---|-----------|---------------|----------------|
| 1 | **Database** | `SELECT 1` read/write probe | `ok` |
| 2 | **State Machine** | Load full definition (10 states, 20+ transitions), callback bridge active | `ok` |
| 3 | **Event Bus** | Retrieve statistics — transport type, event count, subscriber count | `ok` or `degraded` |
| 4 | **Reaction Engine** | Retrieve statistics — active rules count, actions fired | `ok` |
| 5 | **Anonymiser** | Execute HMAC-SHA256 tokenisation probe | `ok` |
| 6 | **NER Detector** | Query spaCy availability and layer count | `ok` |
| 7 | **EDI Auditor** | Execute rule engine match probe | `ok` |
| 8 | **Remediation** | Load decision matrix (7 remediation routes) | `ok` |
| 9 | **MTTR Tracker (Go)** | HTTP GET to Golang service health endpoint | `ok` or `unavailable` (expected in dev without Go) |
| 10 | **Event Flow** | Publish a real `SYSTEM_HEALTH_CHANGED` event, process through subscriber pipeline | `ok` |

**Sample response:**
```json
{
  "status": "operational",
  "timestamp": "2026-07-30T10:15:00+00:00",
  "gateway_version": "3.0.0",
  "services": {
    "database": {"status": "ok", "detail": "read/write verified"},
    "state_machine": {"status": "ok", "states": 10, "transitions": 20, "detail": "10 states, 20 transitions, callback bridge active"},
    "event_bus": {"status": "ok", "transport": "in-process", "events_stored": 42, "subscribers": 7, "detail": "in-process, 42 events, 7 subscribers"},
    "reaction_engine": {"status": "ok", "active_rules": 7, "actions_fired": 3, "detail": "7 active rules, 3 actions executed"},
    "anonymiser": {"status": "ok", "detail": "HMAC-SHA256 tokeniser operational"},
    "ner_detector": {"status": "ok", "layers": 3, "detail": "spaCy: False, layers: 3"},
    "auditor": {"status": "ok", "detail": "rule engine + audit queries loaded"},
    "remediation": {"status": "ok", "policies": 7, "detail": "7 remediation routes loaded"},
    "mttr_tracker": {"status": "unavailable", "detail": "Cannot reach Go MTTR tracker at http://localhost:8080"},
    "event_flow": {"status": "ok", "detail": "Published event a1b2c3d4... and processed through subscriber pipeline"}
  }
}
```

> **Note:** `mttr_tracker` shows `unavailable` in local development (without the Go service running) — this is expected. In Docker deployment, it shows `ok`. The overall status remains `operational` as long as all Python services and the database are healthy.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                    Maritime Compliance Swarm v3.0                    │
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌──────────────────────┐  ┌───────────────────────────────┐         │
│  │ Manifest_PII_         │  │ Logistics_EDI_SQL_            │         │
│  │ Anonymiser      [Py]  │  │ Auditor                [Py]  │         │
│  │ • HMAC-SHA256 tokens  │  │ • 11 audit queries           │         │
│  │ • Fernet encryption   │  │ • 5 compliance domains       │         │
│  │ • ML NER (spaCy)      │  │ • Pluggable query registry    │         │
│  └──────────┬────────────┘  └──────────┬────────────────────┘         │
│             │                         │                            │
│             ▼                         ▼                            │
│  ┌───────────────────────────────────────────────────────────┐      │
│  │               Shared Compliance Database                    │      │
│  │          (SQLite dev / PostgreSQL + PostGIS prod)           │      │
│  │                                                            │      │
│  │  • anonymisation_records  • audit_findings                 │      │
│  │  • masking_policies      • edi_connection_profiles         │      │
│  │  • mttr_events           • compliance_reports              │      │
│  │  • finding_transitions   • event_log                       │      │
│  │  • audit_query_registry                                     │      │
│  └──────────┬────────────────────┬───────────────────────────┘      │
│             │                    │                                  │
│             ▼                    ▼                                  │
│  ┌──────────────────────┐  ┌───────────────────────────────┐         │
│  │ Remediation_Route_   │  │ Telemetry_MTTR_               │         │
│  │ Generator       [Py]  │  │ Tracker                  [Go] │         │
│  │ • Decision matrix     │  │ • Buffered event ingestion    │         │
│  │ • EDI profile updates │  │ • MTTR metrics (avg/P95)      │         │
│  └──────────────────────┘  └───────────────────────────────┘         │
│                                                                       │
│  ┌───────────────────────────────────────────────────────────┐      │
│  │  ★ Finding State Machine     ★ Event Bus                    │      │
│  │  10 states, 20+ transitions, guard conditions             │      │
│  │  ★ Reaction Engine — 7 autonomous rules                    │      │
│  │  ★ Composite Risk Scoring (5-dimensional)                   │      │
│  │  ★ Compliance Knowledge Graph (in-memory / Neo4j prod)      │      │
│  │  ★ Middleware Pipeline (auth, rate-limit, audit-log, validation)│   │
│  │  ★ Structured Observability (health, metrics, logging)      │      │
│  │  ★ Satellite AIS Ingestion (foundation module)              │      │
│  │  PostgreSQL LISTEN/NOTIFY (prod) / in-process (dev)         │      │
│  └───────────────────────────────────────────────────────────┘      │
│                                                                       │
│  ┌───────────────────────────────────────────────────────────┐      │
│  │         FastAPI Gateway + HTML Dashboard            [Py]   │      │
│  │         Port 8000 — 45 REST routes + /docs                 │      │
│  │         ★ Frontend Status: /api/v1/system/frontend-status  │      │
│  └───────────────────────────────────────────────────────────┘      │
│                                                                       │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Quick Start

### Option A: Run with Docker (recommended)

```bash
git clone https://github.com/testdemoqwenai2025-creator/Autonomous_Regulatory_Compliance_Agent_Swarm.git
cd Autonomous_Regulatory_Compliance_Agent_Swarm
cp .env.example .env

# Start gateway + PostgreSQL + Golang MTTR tracker
docker compose up --build -d

# Verify frontend-backend communication
curl -s http://localhost:8000/api/v1/system/frontend-status | python3 -m json.tool

# Open the dashboard
open http://localhost:8000
```

### Option B: Run locally (Python + SQLite)

```bash
git clone https://github.com/testdemoqwenai2025-creator/Autonomous_Regulatory_Compliance_Agent_Swarm.git
cd Autonomous_Regulatory_Compliance_Agent_Swarm
cp .env.example .env

# Install dependencies
pip install -r python/requirements.txt

# Initialise SQLite database
make init

# Start the gateway (serves API + dashboard on port 8000)
make gateway

# Verify frontend-backend communication
curl -s http://localhost:8000/api/v1/system/frontend-status | python3 -m json.tool

# Open http://localhost:8000
```

---

## API Reference (45 routes)

The FastAPI gateway exposes all tools plus the state machine, event bus, reactions, composite scoring, and knowledge graph under a unified REST API. Interactive documentation is available at `/docs` (Swagger) and `/redoc` (ReDoc) when the gateway is running.

### Health & Frontend Status

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Liveness probe — status of all tools |
| GET | `/api/v1/system/frontend-status` | **Frontend status endpoint** — lightweight confirmation that the UI can reach every backend component, including an end-to-end event flow proof. Call this first from any frontend to confirm backend communication. |
| GET | `/api/v1/system/connectivity` | Full connectivity diagnostics (10 components, per-component latency ms, verbose detail) |

### 1. PII Anonymiser

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/anonymise/manifest` | Tokenise all PII fields in a shipping manifest |
| POST | `/api/v1/anonymise/free-text` | Detect and tokenise PII in free-text content |
| POST | `/api/v1/anonymise/scan` | Scan a manifest for PII without modifying data |
| POST | `/api/v1/anonymise/ner/scan` | ML NER detection (spaCy) for free-text PII |
| POST | `/api/v1/anonymise/ner/anonymise` | ML NER + anonymise in one step |

**Example — Scan a manifest:**
```bash
curl -X POST http://localhost:8000/api/v1/anonymise/scan \
  -H 'Content-Type: application/json' \
  -d '{"manifest": {"consignee_name": "John Doe", "consignee_email": "john@ship.com"}}'
```

**Example — Anonymise:**
```bash
curl -X POST http://localhost:8000/api/v1/anonymise/manifest \
  -H 'Content-Type: application/json' \
  -d '{
    "manifest_id": "BL-SG-001",
    "manifest": {
      "consignee_name": "John Doe",
      "consignee_email": "john@ship.com",
      "container_id": "MSKU1234567"
    }
  }'
```

### 2. EDI SQL Auditor

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/audit/run` | Execute compliance audit queries against FMS database |
| GET | `/api/v1/audit/profiles` | Audit all EDI connection profiles for encryption compliance |
| GET | `/api/v1/audit/queries` | List all 11 audit queries with metadata |

### 3. Remediation Generator

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/remediation/policies` | Generate masking policies from open findings |
| POST | `/api/v1/remediation/edi-profiles` | Update EDI profiles based on findings |

### 4. MTTR Tracker (Golang proxy)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/mttr/events` | Record a telemetry event for a finding |
| POST | `/api/v1/events/sm` | Go MTTR SM bridge — receives state machine transitions directly |
| GET | `/api/v1/mttr/findings/{id}` | Get MTTR timeline for a specific finding |
| GET | `/api/v1/mttr/report` | Aggregate MTTR report (avg, P95, by severity) |
| GET | `/api/v1/mttr/open` | All open findings with current MTTR metrics |

### Shared Queries

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/findings` | List audit findings (filter by severity, status, state, risk) |
| GET | `/api/v1/policies` | List masking policies |
| GET | `/api/v1/reports` | List compliance reports |

### 5. Finding State Machine

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/state-machine/definition` | Full state machine (10 states, 20+ transitions, timeouts) |
| GET | `/api/v1/state-machine/transitions/{id}/available` | Valid next states for a finding |
| POST | `/api/v1/state-machine/transitions/{id}` | Execute a state transition (with guards, audit) |
| GET | `/api/v1/state-machine/transitions/{id}/timeline` | Full transition history for a finding |
| POST | `/api/v1/state-machine/timeout-check` | Check all findings for SLA breaches, auto-escalate |

**Example — Transition a finding:**
```bash
curl -X POST http://localhost:8000/api/v1/state-machine/transitions/{finding_id} \
  -H 'Content-Type: application/json' \
  -d '{
    "target_state": "assigned",
    "trigger": "manual_assign",
    "actor": "user:john.smith",
    "context": {"assignee": "compliance-team-lead"}
  }'
```

### 6. Event Bus & Reaction Engine

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/events/stats` | Event bus statistics (transport, queue depth, counts) |
| GET | `/api/v1/events` | List recent events (filter by type, correlation ID) |
| POST | `/api/v1/events/publish` | Manually publish an event (testing, integration) |
| GET | `/api/v1/reactions/rules` | List all 7 reaction rules with status |
| GET | `/api/v1/reactions/stats` | Reaction engine statistics |
| GET | `/api/v1/reactions/log` | Recent reaction execution log |
| PUT | `/api/v1/reactions/rules/{id}/toggle` | Enable/disable a specific reaction rule |

### 7. Audit Query Registry

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/audit/registry/queries` | List all registered audit queries (built-in + custom) |
| POST | `/api/v1/audit/registry/queries` | Add a custom audit query to the registry |
| PUT | `/api/v1/audit/registry/queries/{id}` | Update an existing registry query |
| DELETE | `/api/v1/audit/registry/queries/{id}` | Remove a query from the registry |

---

## Frontend Integration Layer

The FastAPI gateway at port 8000 is the **sole integration point** for any frontend, middleware, or external consumer. The **Frontend Status endpoint** (`GET /api/v1/system/frontend-status`) is the primary way to verify that the frontend can communicate with every backend component.

```
Frontend / Middleware / External System
        │
        │  HTTP/REST (JSON)
        ▼
┌──────────────────────────────────────┐
│   FastAPI Gateway  (port 8000)        │
│   ┌──────────────────────────────┐   │
│   │ Middleware Pipeline           │   │
│   │  • Auth (JWT / API key)      │   │
│   │  • Rate Limiting (token bucket)│  │
│   │  • Request Validation         │   │
│   │  • Structured Audit Logging   │   │
│   └──────────┬───────────────────┘   │
│              │                       │
│    ┌─────────┼─────────┐             │
│    ▼         ▼         ▼             │
│ Anonymiser  Auditor  Remediation     │
│ (Python)    (Python) (Python)        │
│              │                       │
│              ▼                       │
│         MTTR Tracker (Go:8080)       │
│         via httpx proxy              │
└──────────────────────────────────────┘
```

### Integration Patterns

| Pattern | How | Use Case |
|---------|-----|----------|
| **Frontend Status** | `GET /api/v1/system/frontend-status` | **Primary integration check** — call this first from any frontend to confirm all 10 backend services are reachable + end-to-end event flow proof |
| **Direct REST** | Frontend calls `GET/POST /api/v1/*` | Dashboard data, user actions |
| **Python SDK** | `from client import ComplianceSwarmClient` | Backend-to-backend, scripting |
| **MTTR Proxy** | Gateway proxies `/api/v1/mttr/*` → `Go:8080` | Transparent language boundary |
| **CORS** | `Access-Control-Allow-Origin` configurable | SPA, mobile apps |
| **OpenAPI** | Auto-generated at `/docs` | API exploration, codegen |
| **Connectivity Check** | `GET /api/v1/system/connectivity` | Verbose per-component health (latency, detail) |
| **SM→EventBus bridge** | Auto-emit callback on every transition | State changes trigger reaction rules immediately |
| **SM→Go MTTR bridge** | Async HTTP POST on every transition | Telemetry stays in sync across Python and Go |

---

## Interactive Dashboard

The gateway serves a built-in HTML dashboard at `/` (port 8000) with 10 tabs:

| Tab | Endpoint Called | Description |
|-----|----------------|-------------|
| **Tools** | — | Overview of all 6 tools with click-through navigation |
| **Backend Status** | `GET /api/v1/system/frontend-status` | Live status grid of all 10 backend services with operational/degraded badges. Auto-refreshes on tab selection. Confirms frontend-to-backend communication for every component. |
| **Connectivity** | `GET /api/v1/system/connectivity` | Per-component health check with latency measurements and verbose detail |
| **Anonymiser** | `POST /api/v1/anonymise/scan`, `/api/v1/anonymise/manifest` | PII scan and tokenise manifests interactively |
| **Auditor** | `POST /api/v1/audit/run`, `GET /api/v1/audit/profiles` | Run compliance audits by domain, view EDI profile compliance |
| **Remediation** | `POST /api/v1/remediation/policies`, `/api/v1/remediation/edi-profiles` | Generate masking policies and update EDI profiles |
| **MTTR Tracker** | `GET /api/v1/mttr/report`, `/api/v1/mttr/open` | MTTR avg/P95 metrics, open finding tracking |
| **Findings** | `GET /api/v1/findings`, `/api/v1/policies`, `/api/v1/reports` | Browse findings (with state column), policies, and reports |
| **State Machine** | `GET /api/v1/state-machine/definition`, `POST /api/v1/state-machine/transitions/{id}` | Visual state flow, transition explorer, timeline viewer, timeout check |
| **Event Bus** | `GET /api/v1/events/stats`, `/api/v1/events`, `/api/v1/reactions/rules` | Event bus stats, recent events, reaction rules with toggles, test publisher |

---

## Python Client SDK

A typed client is included for frontend and integration use:

```python
from client import ComplianceSwarmClient, ComplianceDomain, RemediationMode

api = ComplianceSwarmClient(base_url="http://localhost:8000")

# Verify frontend-backend communication
status = api.get_frontend_status()
print(f"System status: {status['status']}")
for name, svc in status['services'].items():
    print(f"  {name}: {svc['status']}")

# Scan a manifest for PII
scan = api.scan_manifest({"consignee_name": "John Doe", "consignee_email": "john@ship.com"})
print(f"Found {scan.pii_fields_found} PII fields")

# Anonymise
result = api.anonymise_manifest(
    manifest_id="BL-SG-001",
    manifest={"consignee_name": "John Doe", "container_id": "MSKU123"},
)
print(result.anonymised_manifest)  # PII replaced with MTS_CONS_xxxx tokens

# Run an audit
audit = api.run_audit(domain=ComplianceDomain.ENCRYPTION)
print(f"{audit.findings_count} findings from {audit.queries_executed} queries")

# Generate remediation policies (dry-run)
policies = api.generate_policies(mode=RemediationMode.DRY_RUN)

# MTTR report
report = api.get_mttr_report()
print(f"Avg MTTR: {report.avg_mttr_hours}h, P95: {report.p95_mttr_hours}h")

api.close()
```

---

## v3.0 Capabilities

### Core Tools

| Tool | Language | Purpose |
|------|----------|---------|
| **Manifest PII Anonymiser** | Python | HMAC-SHA256 deterministic tokenisation, Fernet encryption, multi-jurisdiction rules (GDPR, CCPA, LGPD, PDPA, PIPA), ML NER (spaCy) |
| **Logistics EDI SQL Auditor** | Python | 11 parametric SQL queries, 5 compliance domains, pluggable query registry, finding persistence |
| **Remediation Route Generator** | Python | Decision matrix mapping risk categories to masking actions, EDI profile updater, state machine integration |
| **Telemetry MTTR Tracker** | Golang | Buffered event ingestion, 10-phase lifecycle model, SM event endpoint, MTTR avg/P95 metrics |

### Governance Layer (v3.0)

| Component | Language | Purpose |
|-----------|----------|---------|
| **Finding State Machine** | Python | 10-state lifecycle with guard conditions, timeout SLAs, audit trail, legacy bridge, auto-emit callback |
| **Event Bus** | Python | Database-backed event store, PostgreSQL LISTEN/NOTIFY, in-process queue (dev), 7 subscriber rules |
| **Reaction Engine** | Python | 7 autonomous reaction rules, conditional evaluation, runtime toggle |
| **Composite Risk Scoring** | Python | 5-dimensional weighted model (severity 30%, jurisdiction 20%, sensitivity 20%, exposure 15%, urgency 15%) → CRS [0.0, 1.0] |
| **Compliance Knowledge Graph** | Python | In-memory adjacency-list graph with BFS traversal, conflict detection, gap analysis (Neo4j for prod) |
| **Middleware Pipeline** | Python | Auth (JWT/API key), rate limiting (token bucket), request validation, structured audit logging |
| **Observability** | Python | Structured JSON logging, health aggregator, metrics collector (counters, gauges, histograms) |
| **Satellite AIS Ingestion** | Python | Foundation module for satellite AIS data pipeline (Kafka + PostGIS target) |
| **API Gateway + Dashboard** | Python (FastAPI) | Unified REST API (45 routes), 10-tab HTML dashboard, OpenAPI docs, Python SDK |

---

## Compliance Domains

| Domain | Queries | Key Standards |
|--------|---------|---------------|
| **Encryption** | 3 | GDPR Art.32, ISM Code |
| **Customs Documentation** | 3 | WCO SAFE Framework, SOLAS VGM, IMDG Code |
| **EDI Format** | 2 | UN/EDIFACT D.21A, ANSI X12 8.6 |
| **Data Retention** | 2 | GDPR Art.5(1)(e), Art.17 |
| **Access Control** | 1 | ISO 27001 A.9 |

---

## CLI Reference

```bash
make gateway          # Start API gateway + dashboard (port 8000)
make gateway-prod      # Start gateway without auto-reload
make init             # Initialise SQLite schema
make scan DIR=data/    # Scan manifests for PII
make audit            # Run full EDI compliance audit
make audit-profiles   # Audit EDI connection profiles
make remediate        # Generate remediation policies (dry-run)
make update-edi       # Update EDI profiles (dry-run)
make mttr             # Build and run Golang MTTR tracker
make seed-policies    # Seed default masking policies
make test             # Run Python tests
make lint             # Lint Python + Go code
make docker-up        # Docker: gateway + DB + MTTR
make docker-up-all    # Docker: everything including one-shot CLI tools
make docker-down      # Stop all Docker services
```

---

## Docker Services

| Service | Port | Description |
|---------|------|-------------|
| `gateway` | 8000 | FastAPI gateway + HTML dashboard + OpenAPI docs + state machine bridge |
| `mttr-tracker` | 8080 | Golang MTTR telemetry service (10-phase model, SM event ingestion) |
| `db` | 5432 | PostgreSQL 16 + PostGIS 3.4 |
| `anonymiser` | — | One-shot PII anonymisation (profile: `tools`) |
| `auditor` | — | One-shot EDI audit (profile: `tools`) |
| `remediation` | — | One-shot remediation (profile: `tools`) |

---

## Project Structure

```
maritime-global-compliance-swarm/
├── python/
│   ├── shared/                # Config, ORM models (9 tables, 8 enums), database layer
│   │   ├── models.py          # 9 ORM tables including finding_transitions, event_log
│   │   ├── state_machine.py   # 10-state finding lifecycle, guard conditions, timeouts
│   │   ├── event_bus.py       # Event store, pub/sub, PG LISTEN/NOTIFY
│   │   ├── reactions.py       # 7 autonomous reaction rules engine
│   │   ├── risk_scorer.py     # ★ Composite risk scoring (5 dimensions, weighted CRS)
│   │   ├── knowledge_graph.py # ★ Compliance knowledge graph (10 node types, 11 edge types)
│   │   ├── middleware.py      # ★ Composable middleware pipeline (auth, rate-limit, audit, validation)
│   │   ├── observability.py   # ★ Structured logging, health aggregator, metrics collector
│   │   ├── satellite_ingest.py # ★ Satellite AIS ingestion foundation
│   │   └── config.py          # Centralised SwarmConfig
│   ├── anonymiser/            # Manifest PII Anonymiser
│   ├── edi_auditor/           # Logistics EDI SQL Auditor
│   ├── remediation/           # Remediation Route Generator
│   ├── gateway/               # FastAPI gateway + 10-tab HTML dashboard
│   ├── client/                # Python SDK for frontend integration
│   ├── requirements.txt
│   └── Dockerfile
├── golang/
│   ├── cmd/mttr_tracker/      # CLI entrypoint
│   ├── internal/
│   │   ├── config/            # Environment configuration
│   │   ├── models/            # Data structures (10 EventPhase constants)
│   │   ├── database/          # DB operations (SQLite + Postgres)
│   │   └── tracker/           # Buffered event engine + 10-phase model
│   ├── pkg/api/               # HTTP REST API + /api/v1/events/sm
│   ├── go.mod
│   └── Dockerfile
├── docs/
│   ├── Strategic_Analysis_Maritime_Compliance_Swarm.docx
│   ├── workflow_diagram.mmd
│   └── workflow_diagram.png
├── .github/workflows/ci.yml
├── docker-compose.yml
├── Makefile
├── .env.example
├── SKILLS.md
└── README.md
```

---

## Operational Workflow

See `docs/workflow_diagram.mmd` (Mermaid) or `docs/workflow_diagram.png` (rendered).

The swarm operates in 10 phases:

1. **Ingestion** — Raw manifests from FMS/EDI/satellite/IoT streams
2. **Detection** — PII rule engine + ML NER classifies fields by jurisdiction
3. **Tokenisation** — HMAC-SHA256 vault replaces PII with deterministic tokens
4. **Audit** — 11 SQL queries detect encryption, customs, and EDI violations
5. **Risk Scoring** — 5-dimensional composite risk scoring (severity, jurisdiction, sensitivity, exposure, urgency)
6. **State Machine Governance** — Finding lifecycle managed through 10 validated states with guard conditions, timeout SLAs, and dual-emit callback (EventBus + Go MTTR)
7. **Event-Driven Reactions** — 7 autonomous rules react to findings (CRITICAL alerts, PII auto-scan, cert checks, timeout escalation)
8. **Remediation** — Decision matrix auto-generates masking policies and EDI fixes
9. **Telemetry** — Golang service tracks MTTR across all findings, synced via SM bridge
10. **Observability** — Structured JSON logs, health aggregation, metrics collection, middleware audit trail

### Finding State Machine

Every compliance finding follows a validated lifecycle:

```
DETECTED → TRIAGED → ASSIGNED → IN_REMEDIATION → AWAITING_VERIFICATION → VERIFIED → CLOSED
    │          │           │              │                    │                    │
    │          └── FALSE_POSITIVE     │              │                    └── IN_REMEDIATION (regression)
    │                              └── ESCALATED ←───┘                    │
    │                                  │                                    │
    └────────────────────────── RISK_ACCEPTED ────────────────────── CLOSED
```

**Key features:**
- **Guard conditions**: CRITICAL findings cannot transition to RISK_ACCEPTED without sign-off
- **Timeout rules**: CRITICAL = 1hr per state, HIGH = 4hr, MEDIUM = 24hr (configurable per state)
- **Auto-escalation**: Timeout breaches automatically transition to ESCALATED via timer actor
- **Audit trail**: Every transition recorded in `finding_transitions` table with trigger, actor, context
- **Dual-emit callback**: Every successful transition publishes to event bus AND forwards to Go MTTR tracker
- **Legacy bridge**: Maps old 5-state `AuditStatus` to new 10-state `FindingState` for backward compatibility

### Event-Driven Reactions

The swarm reacts autonomously to compliance events through 7 built-in rules:

| Rule | Event | Action |
|------|-------|--------|
| Critical Notification | `finding.created` (CRITICAL) | Emit high-priority alert for immediate assignment |
| PII Auto-Scan | `finding.created` (PII_EXPOSURE) | Queue related manifests for anonymisation scan |
| Cert Renewal Check | `finding.created` (CERT_EXPIRY) | Schedule 24hr cert renewal check |
| Timeout Escalation | `finding.timeout_breach` | Auto-escalate via state machine |
| Verification Reminder | `finding.state_changed` → awaiting_verification | Emit reminder with timeout window |
| Audit Summary | `audit.completed` | Log severity breakdown |
| MTTR Baseline | `finding.created` (CRITICAL/HIGH) | Create MTTR tracking baseline |

---

## Strategic Evolution Roadmap

A comprehensive strategic roadmap document is available at `docs/Strategic_Analysis_Maritime_Compliance_Swarm.docx` covering the six-horizon evolution plan from 2025 to 2035. The roadmap is structured as a three-tier analysis:

- **Tier 1:** Current state assessment — architecture maturity, composite risk scoring, middleware, observability
- **Tier 2:** Competitive and market positioning — regulatory landscape evolution, data repository proliferation
- **Tier 3:** Technology evolution trajectory — satellite integration, AI/ML, event sourcing, CQRS

### Six Evolution Horizons

| Horizon | Period | Focus |
|---------|--------|-------|
| **H1: Foundation Hardening** | 2025-2026 | PostgreSQL+PostGIS, EU ETS auditing, satellite AIS pipeline, JWT auth |
| **H2: Intelligence Augmentation** | 2026-2027 | ML anomaly detection, knowledge graph (Neo4j), weather-aware compliance |
| **H3: Autonomous Operations** | 2027-2029 | Closed-loop remediation, multi-party orchestration, streaming MTTR (SSE) |
| **H4: Predictive Intelligence** | 2029-2031 | Violation prediction, NLP regulatory monitoring, digital twin compliance modelling |
| **H5: Ecosystem Integration** | 2031-2033 | Federated learning, regulatory sandboxes, cross-border data governance automation |
| **H6: Autonomous Governance** | 2033-2035 | Self-healing compliance, quantum-resistant cryptography, autonomous decision authority |

See SKILLS.md for the detailed capability-by-capability evolution path, and the strategic roadmap DOCX for the full analysis.

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

## Security Considerations

- **HMAC key** — drives all tokenisation determinism; rotating it invalidates every token. Treat as a root CA key.
- **Fernet keys** — generated per-session by default; for production, rotate via a key management service.
- **Gateway auth** — JWT/API key middleware available in middleware pipeline (disabled in dev, enable in prod).
- **CORS** — currently wildcard; lock to your frontend domain in production.
- **Rate limiting** — token-bucket middleware available (100 req/min default, configurable).
- **Audit logging** — structured audit log middleware captures every request with request ID, timestamp, and response status.

---

## License

MIT
