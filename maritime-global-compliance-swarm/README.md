# Maritime Global Compliance Swarm

> Autonomous regulatory compliance agent swarm for global maritime freight. Automates GDPR/PII anonymisation, EDI compliance audits, remediation policy generation, and MTTR telemetry — all exposed via a unified Python FastAPI gateway with an interactive HTML dashboard.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                  Maritime Compliance Swarm                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────┐  ┌──────────────────────────────┐    │
│  │ Manifest_PII_        │  │ Logistics_EDI_SQL_           │    │
│  │ Anonymiser     [Py]  │  │ Auditor               [Py]  │    │
│  │                      │  │                              │    │
│  │ • HMAC-SHA256 tokens │  │ • 11 audit queries          │    │
│  │ • Fernet encryption  │  │ • 5 compliance domains      │    │
│  │ • Multi-jurisdiction │  │ • EDI profile scanning      │    │
│  └──────────┬───────────┘  └──────────┬───────────────────┘    │
│             │                         │                        │
│             ▼                         ▼                        │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │              Shared Compliance Database                  │  │
│  │         (SQLite dev / PostgreSQL + PostGIS prod)         │  │
│  │                                                         │  │
│  │  • anonymisation_records  • audit_findings              │  │
│  │  • masking_policies      • edi_connection_profiles      │  │
│  │  • mttr_events           • compliance_reports           │  │
│  └──────────┬──────────────────────────┬────────────────────┘  │
│             │                          │                        │
│             ▼                          ▼                        │
│  ┌──────────────────────┐  ┌──────────────────────────────┐    │
│  │ Remediation_Route_   │  │ Telemetry_MTTR_             │    │
│  │ Generator      [Py]  │  │ Tracker                [Go] │    │
│  │                      │  │                              │    │
│  │ • Policy generation  │  │ • Buffered event ingestion  │    │
│  │ • EDI profile updates│  │ • HTTP REST API             │    │
│  │ • Decision matrix    │  │ • MTTR metrics (avg/P95)    │    │
│  └──────────────────────┘  └──────────────────────────────┘    │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │          FastAPI Gateway + HTML Dashboard          [Py] │  │
│  │          Port 8000 — 20 REST routes + /docs             │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
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

# Open http://localhost:8000
```

---

## API Reference (20 routes)

The FastAPI gateway exposes all four tools under a unified REST API. Interactive documentation is available at `/docs` (Swagger) and `/redoc` (ReDoc) when the gateway is running.

### Health

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Liveness probe — status of all four tools |

### 1. PII Anonymiser

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/anonymise/manifest` | Tokenise all PII fields in a shipping manifest |
| POST | `/api/v1/anonymise/free-text` | Detect and tokenise PII in free-text content |
| POST | `/api/v1/anonymise/scan` | Scan a manifest for PII without modifying data |

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
| GET | `/api/v1/mttr/findings/{id}` | Get MTTR timeline for a specific finding |
| GET | `/api/v1/mttr/report` | Aggregate MTTR report (avg, P95, by severity) |
| GET | `/api/v1/mttr/open` | All open findings with current MTTR metrics |

### Shared Queries

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/findings` | List audit findings (filter by severity, status, risk) |
| GET | `/api/v1/policies` | List masking policies |
| GET | `/api/v1/reports` | List compliance reports |

---

## Frontend Integration Layer

The FastAPI gateway at port 8000 is the **sole integration point** for any frontend, middleware, or external consumer. All communication follows a clean REST contract:

```
Frontend / Middleware / External System
        │
        │  HTTP/REST (JSON)
        ▼
┌──────────────────────────────────────┐
│   FastAPI Gateway  (port 8000)        │
│   ┌──────────────────────────────┐   │
│   │ CORS middleware              │   │
│   │ Request validation (Pydantic)│   │
│   │ OpenAPI /docs + /redoc       │   │
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
| **Direct REST** | Frontend calls `GET/POST /api/v1/*` | Dashboard data, user actions |
| **Python SDK** | `from client import ComplianceSwarmClient` | Backend-to-backend, scripting |
| **MTTR Proxy** | Gateway proxies `/api/v1/mttr/*` → `Go:8080` | Transparent language boundary |
| **CORS** | `Access-Control-Allow-Origin` configurable | SPA, mobile apps |
| **OpenAPI** | Auto-generated at `/docs` | API exploration, codegen |

### Frontend Middleware Communication Guide

The gateway is designed to be the **single API contract** between frontend and backend. Middleware layers (message queues, caching, auth) sit between the frontend and this gateway:

```
Frontend SPA / Mobile
      │
      ▼
API Gateway / Reverse Proxy (Nginx, Caddy, Kong)
      │  • SSL termination
      │  • Rate limiting
      │  • JWT / API key validation
      ▼
FastAPI Gateway (port 8000)
      │  • Request validation
      │  • Tool orchestration
      │  • MTTR proxy to Go
      ▼
PostgreSQL + PostGIS
      │  • Compliance data
      │  • Geospatial queries
      ▼
Golang MTTR Tracker (port 8080)
      │  • Buffered telemetry
      │  • Background goroutine flush
```

**Key integration points:**
- All 20 routes return consistent JSON with Pydantic-validated schemas
- Error responses follow `{"detail": "..."}` pattern (FastAPI default)
- MTTR routes proxy transparently — the frontend never needs to know about the Golang service
- The Python SDK (`python/client/`) provides typed models for all request/response shapes

---

## Python Client SDK

A typed client is included for frontend and integration use:

```python
from client import ComplianceSwarmClient, ComplianceDomain, RemediationMode

api = ComplianceSwarmClient(base_url="http://localhost:8000")

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

## Tools

| Tool | Language | Purpose |
|------|----------|---------|
| **Manifest_PII_Anonymiser** | Python | HMAC-SHA256 deterministic tokenisation, Fernet encryption, multi-jurisdiction rules (GDPR, CCPA, LGPD, PDPA, PIPA) |
| **Logistics_EDI_SQL_Auditor** | Python | 11 parametric SQL queries across 5 compliance domains, finding persistence |
| **Remediation_Route_Generator** | Python | Decision matrix mapping risk categories to masking actions, EDI profile updater |
| **Telemetry_MTTR_Tracker** | Golang | Buffered event ingestion with background flush, MTTR avg/P95 metrics |
| **API Gateway + Dashboard** | Python (FastAPI) | Unified REST API, static HTML dashboard, OpenAPI docs |

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
| `gateway` | 8000 | FastAPI gateway + HTML dashboard + OpenAPI docs |
| `mttr-tracker` | 8080 | Golang MTTR telemetry service |
| `db` | 5432 | PostgreSQL 16 + PostGIS 3.4 |
| `anonymiser` | — | One-shot PII anonymisation (profile: `tools`) |
| `auditor` | — | One-shot EDI audit (profile: `tools`) |
| `remediation` | — | One-shot remediation (profile: `tools`) |

---

## Project Structure

```
maritime-global-compliance-swarm/
├── python/
│   ├── shared/              # Config, ORM models (6 tables, 7 enums), database layer
│   ├── anonymiser/          # Manifest_PII_Anonymiser
│   │   ├── tokeniser.py     # HMAC vault, Fernet encryptor, PII engine
│   │   ├── rules.py         # PII detection rules (5 jurisdictions)
│   │   └── cli.py           # Click CLI
│   ├── edi_auditor/         # Logistics_EDI_SQL_Auditor
│   │   ├── queries.py       # 11 parametric audit queries
│   │   ├── auditor.py       # Query executor + finding persister
│   │   └── cli.py           # Click CLI
│   ├── remediation/         # Remediation_Route_Generator
│   │   ├── policy_gen.py    # Decision matrix + policy creation
│   │   ├── edi_updater.py   # EDI profile security updates
│   │   └── cli.py           # Click CLI
│   ├── gateway/             # FastAPI gateway
│   │   ├── app.py           # 20 REST routes + static file serving
│   │   ├── schemas.py       # 30+ Pydantic request/response models
│   │   └── static/           # HTML dashboard (index.html)
│   ├── client/              # Python SDK for frontend integration
│   │   ├── sync_client.py   # Typed httpx client wrapping all endpoints
│   │   └── models.py        # Pydantic response models (frontend-safe)
│   ├── requirements.txt
│   └── Dockerfile
├── golang/
│   ├── cmd/mttr_tracker/    # CLI entrypoint
│   ├── internal/
│   │   ├── config/          # Environment configuration
│   │   ├── models/          # Data structures
│   │   ├── database/        # DB operations (SQLite + Postgres)
│   │   └── tracker/         # Buffered event engine
│   ├── pkg/api/             # HTTP REST API
│   ├── go.mod
│   └── Dockerfile
├── docs/
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

The swarm operates in 6 phases:

1. **Ingestion** — Raw manifests from FMS/EDI streams
2. **Detection** — PII rule engine classifies fields by jurisdiction
3. **Tokenisation** — HMAC-SHA256 vault replaces PII with deterministic tokens
4. **Audit** — 11 SQL queries detect encryption, customs, and EDI violations
5. **Remediation** — Decision matrix auto-generates masking policies and EDI fixes
6. **Telemetry** — Golang service tracks MTTR across all findings

---

## Next-Level Improvement Roadmap

This section outlines how each component can evolve to meet the demands of rapidly changing data landscapes, emerging technologies, expanding data repositories, and operational challenges like extreme weather in special maritime regions.

### 1. PII Anonymiser — Next Level

**Current state:** Regex-based field-name matching, 7 rules, 5 jurisdictions, HMAC-SHA256 + Fernet.

**Evolving data challenges:**
- Shipping manifests increasingly contain unstructured data (remarks, special instructions, free-text hazmat descriptions) where PII is embedded in narrative text rather than labelled fields
- New data repositories — blockchain-based Bills of Lading, electronic sea waybills, and digital twins — introduce PII in non-traditional formats (JSON-LD, CBOR, protobuf serialised payloads)
- Multi-script PII (CJK names, Arabic script, Cyrillic addresses) defeats ASCII-only regex patterns

**Recommended upgrades:**

| Upgrade | Description | Impact |
|---------|-------------|--------|
| **ML-based NER layer** | Integrate a lightweight named-entity recognition model (e.g., spaCy with custom maritime NER) alongside regex. The ML model catches PII that field-name heuristics miss, such as names buried in free-text remarks like "Contact John at Maersk for delivery". | 30-40% improvement in free-text PII recall |
| **Multi-script Unicode support** | Extend regex engine with Unicode property classes (`\p{L}`, `\p{N}`) and locale-aware patterns for CJK, Arabic, Devanagari, Cyrillic name/email/phone formats. Add jurisdiction-specific ID formats (China Resident Identity Card 18-digit, India Aadhaar 12-digit, Brazil CPF 11-digit). | Expands coverage to 15+ additional identity document formats |
| **Format-agnostic parser** | Add parsers for JSON-LD, CBOR, protobuf, and Avro manifest payloads. The anonymiser should detect the serialisation format from content headers and apply the same PII rules regardless of encoding. | Supports blockchain eBL, IoT sensor data, digital twin payloads |
| **Context-aware tokenisation** | Not all PII is equal — a container ID like "MSKU1234567" is semi-identifiable but not personally identifying. Implement a risk-scoring layer that grades PII by re-identification difficulty and applies proportionate masking (tokenise high-risk, generalise low-risk). | Reduces over-masking, preserves data utility |
| **Key rotation without re-tokenisation** | Implement key versioning in the HMAC vault so that key rotation creates new tokens without breaking existing token-to-record mappings. Maintain a reverse lookup table (encrypted) for the previous key version during a transition window. | Zero-downtime cryptographic key rotation |

### 2. EDI SQL Auditor — Next Level

**Current state:** 11 parametric SQL queries, 5 compliance domains, static query templates.

**Evolving data challenges:**
- Maritime regulations change frequently — new IMO amendments, EU ETS (Emissions Trading System) requirements for shipping, and emerging carbon reporting mandates mean audit queries must be continuously updated
- New EDI standards and versions (UN/EDIFACT transitions, ANSI X12 evolution) require the auditor to adapt to schema changes without code deployment
- Data repositories are expanding to include port community systems (PCS), single-window customs platforms, and AIS (Automatic Identification System) data feeds

**Recommended upgrades:**

| Upgrade | Description | Impact |
|---------|-------------|--------|
| **Pluggable query registry** | Move audit queries from hardcoded Python to a database-backed registry. New queries can be added, modified, or retired via API calls or a configuration UI without redeploying the service. Support versioned queries so regulatory updates create a new version while the old one remains for historical comparison. | Queries update in real-time as regulations change |
| **AIS data compliance audit** | Add audit queries for AIS (Automatic Identification System) data feeds — verify positional data integrity, flag vessels broadcasting spoofed locations, detect data gaps exceeding regulatory thresholds (e.g., SOLAS Chapter V mandatory reporting intervals). | Covers the fastest-growing maritime data source |
| **EU ETS and carbon reporting domain** | Add a 6th compliance domain: **Emissions Reporting**. Audit queries that verify EU ETS reporting completeness, detect missing MRV (Monitoring, Reporting, Verification) data, flag vessels without assigned EU registry numbers, and check carbon credit documentation. | Addresses the 2024+ EU ETS mandate for maritime |
| **Cross-database federation** | The auditor currently runs against a single FMS database. Extend it to federate queries across multiple data sources — the FMS, a port community system, a customs single-window, and an AIS data warehouse — using SQLAlchemy's multi-engine support or a query federation layer. | Unified audit across all maritime data repositories |
| **Anomaly detection** | Add statistical anomaly detection to audit results. Instead of just running deterministic queries, compute baseline distributions (e.g., average transmission encryption rate per partner, typical document turnaround times) and flag statistical outliers as potential compliance risks before they become violations. | Shift from reactive to proactive compliance |
| **Weather-aware audit scheduling** | Integrate meteorological data feeds (NOAA GFS, ECMWF ERA5) to correlate compliance gaps with severe weather events. During hurricanes, typhoons, or polar storms, EDI transmissions and customs filings frequently fail. The auditor should tag weather-affected findings differently and adjust SLA expectations. | Reduces false-positive critical findings by 20-30% |

### 3. Remediation Generator — Next Level

**Current state:** Decision matrix with 7 risk categories, 3 execution modes (dry-run/staged/apply), EDI profile updater.

**Evolving challenges:**
- Remediation is currently one-directional (finding → policy). Real-world compliance requires feedback loops — did the policy actually fix the issue? Is the partner now compliant? Should the policy be retired?
- Special regions (Arctic shipping lanes, piracy zones, sanctioned territories) require different remediation strategies
- The decision matrix is static and cannot learn from past remediation outcomes

**Recommended upgrades:**

| Upgrade | Description | Impact |
|---------|-------------|--------|
| **Closed-loop remediation verification** | After a policy is applied, automatically schedule a re-audit after a configurable delay (e.g., 24h for EDI fixes, 72h for partner onboarding changes). If the re-audit still detects the same issue, escalate to a higher severity and notify the compliance officer. | Ensures remediation actually resolves the root cause |
| **Region-aware remediation policies** | Implement a geo-fencing layer using PostGIS that associates trade lanes and port pairs with regional regulatory requirements. Arctic routes (Northern Sea Route) have different customs, environmental, and data sovereignty rules than standard lanes. Sanctioned territories require additional export control checks. The decision matrix selects different remediation actions based on the geographic context of the finding. | Compliant operations in Arctic, sanctioned, and special economic zones |
| **Weather-disruption remediation mode** | When a severe weather event is active in a region, the remediation generator should automatically enter a "weather-hold" mode for affected findings. Instead of generating enforcement policies for EDI failures caused by a hurricane, it should generate "grace-period" policies that document the weather event as a justifiable cause and auto-expire when the weather clears. | Prevents inappropriate enforcement during force majeure |
| **Machine-learned decision matrix** | Train a lightweight model on historical finding → remediation → verification outcomes. The model learns which remediation actions actually work for which risk categories, partner types, and regions. Over time, it replaces the static decision matrix with a probability-ranked set of recommended actions. | Continuously improving remediation accuracy |
| **Multi-party orchestration** | Some findings require coordinated action across multiple parties (carrier, customs broker, port authority). Add a workflow engine that breaks complex findings into sub-tasks, assigns them to different parties, and tracks completion across all parties before marking the finding as remediated. | Handles cross-organisational compliance issues |

### 4. MTTR Tracker (Golang) — Next Level

**Current state:** Buffered event ingestion, background goroutine flush, avg/P95 metrics, 5 lifecycle phases.

**Evolving challenges:**
- MTTR metrics are point-in-time snapshots — they don't capture trends, seasonal patterns, or the compounding effect of simultaneous incidents
- Weather events create burst patterns (many findings at once) that distort MTTR — a hurricane affecting 50 vessels simultaneously shouldn't count the same as 50 isolated findings
- Different regions and trade lanes have fundamentally different remediation timelines

**Recommended upgrades:**

| Upgrade | Description | Impact |
|---------|-------------|--------|
| **Time-series MTTR analytics** | Store MTTR calculations as time-series data and expose trend endpoints (`/api/v1/mttr/trend?period=90d`). Use Go's excellent concurrency to compute rolling averages, exponential moving averages, and seasonal decomposition. Identify whether MTTR is improving or degrading over time. | Data-driven compliance performance tracking |
| **Weather-correlated MTTR adjustment** | Ingest weather event data (storm tracks, port closures, canal blockages) and correlate with MTTR spikes. The report endpoint should offer a "weather-adjusted MTTR" that excludes time periods affected by force majeure events, giving a more accurate picture of operational MTTR vs. environmental MTTR. | Fair and accurate compliance performance measurement |
| **Regional MTTR breakdown** | Break down MTTR by geographic region, trade lane, or port pair. Arctic routes, trans-Pacific, and intra-Asia lanes have fundamentally different remediation timelines. Expose `/api/v1/mttr/report?region=arctic` for regional analysis. | Identifies regional compliance bottlenecks |
| **Burst detection and clustering** | Implement an algorithm that detects when multiple related findings appear simultaneously (e.g., a partner's EDI system goes down affecting 30 shipments). Cluster these into a single "incident" and track MTTR at the incident level rather than the individual finding level. | Prevents MTTR distortion from correlated failures |
| **Predictive MTTR estimation** | When a new finding is created, estimate its expected MTTR based on historical data for the same risk category, severity, partner, and region. Display this as "predicted resolution: 4.2h" on the dashboard. Uses a simple regression model trained on historical MTTR data — no heavy ML infrastructure required. | Sets realistic expectations, enables proactive resource allocation |
| **Streaming MTTR via Server-Sent Events** | Expose a real-time MTTR feed via SSE (`/api/v1/mttr/stream`). The Golang service pushes MTTR updates as findings progress through lifecycle phases. This enables live dashboards without polling. | Real-time compliance visibility |

### 5. API Gateway — Next Level

**Current state:** FastAPI with 20 routes, CORS middleware, static HTML dashboard, MTTR proxy to Go.

**Recommended upgrades:**

| Upgrade | Description | Impact |
|---------|-------------|--------|
| **WebSocket support** | Add WebSocket endpoints for real-time compliance event streaming. The frontend subscribes to `/ws/compliance` and receives live finding notifications, MTTR updates, and audit completion events. Python's `websockets` library integrates cleanly with FastAPI's ASGI lifecycle. | Eliminates polling, enables live compliance dashboards |
| **Authentication and authorisation** | Add JWT-based authentication with role-based access control (RBAC). Roles: `compliance_officer`, `auditor`, `remediator`, `viewer`. The `apply` mode endpoints require `compliance_officer` role. | Production-ready security |
| **Rate limiting and circuit breaker** | Add `slowapi` for rate limiting and a circuit breaker pattern for the MTTR proxy. If the Golang service is unreachable, the circuit breaker returns cached MTTR data rather than 502 errors. | Resilient gateway operation |
| **API versioning** | Implement proper API versioning with `/api/v2/` that supports breaking schema changes. Maintain backward compatibility with v1 for existing integrations. | Smooth upgrades for consumers |
| **Request/response caching** | Add Redis-backed caching for read-heavy endpoints (findings list, policies, reports). Cache invalidation triggers on write operations. | 10-100x latency improvement for dashboard queries |
| **Structured audit logging** | Log every API request with request ID, user, timestamp, and response status to an append-only audit log. This log itself becomes a compliance artifact for ISO 27001 and GDPR accountability requirements. | Meets regulatory audit trail requirements |

### 6. Cross-Cutting: Weather and Special Regions

Maritime compliance is uniquely affected by weather and geography. The following table maps special regions to their compliance challenges:

| Region | Weather Challenge | Compliance Impact | Recommended System Response |
|--------|------------------|-------------------|--------------------------|
| **Arctic (NSR)** | Sea ice, polar lows, -40°C temperatures, limited communication (satellite only) | EDI transmissions delayed or lost, customs deadlines missed, crew safety data required | Extended SLA windows, satellite-optimised EDI retry, ice-route-specific customs pre-clearance |
| **Gulf of Aden / Red Sea** | Extreme heat (50°C+), piracy risk, Houthi disruptions | Route deviations, partner communication blackouts, sanctioned territory proximity | Sanction screening on route changes, automatic grace-period policies, security-finding escalation |
| **Bay of Bengal** | Cyclone season (Apr–Dec), monsoon flooding, port closures | Mass customs filing delays, container weight re-verification (VGM) after storm damage | Weather-hold mode for findings, bulk VGM re-submission automation, port-closure event correlation |
| **Caribbean / Gulf of Mexico** | Hurricane season (Jun–Nov), storm surge, port evacuations | Extended data retention needed for insurance claims, multiple partners affected simultaneously | Burst-mode MTTR clustering, insurance documentation auto-generation, regional weather-adjusted SLAs |
| **Strait of Malacca** | Tropical thunderstorms, high traffic density, AIS congestion | EDI collisions, duplicate messages, positional data gaps | Deduplication audit queries, AIS gap detection, high-throughput message queue |
| **English Channel / North Sea** | Fog, rough seas, wind farm interference with AIS | Container loss events, hazardous cargo exposure, delayed customs clearance | Container-loss incident finding template, hazmat exposure audit, weather-correlated MTTR |

**System-wide weather integration architecture:**

```
┌─────────────────────────────────────────────────────┐
│            Weather Data Providers                     │
│  NOAA GFS │ ECMWF ERA5 │ Windy API │ StormGeo      │
└─────────────┬──────────────────┬───────────────────┘
              │                  │
              ▼                  ▼
┌─────────────────────────────────────────────────────┐
│       Weather Ingestion Service (Python)              │
│  • Poll weather APIs every 15 minutes                 │
│  • Store marine zone forecasts in PostgreSQL          │
│  • Emit events: WEATHER_ALERT, PORT_CLOSURE,          │
│    STORM_TRACK, CANAL_BLOCKAGE                        │
└─────────────┬───────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────┐
│       Compliance Event Bus (Redis Streams)            │
│  • Weather events join with compliance events         │
│  • Downstream consumers: Auditor, Remediation, MTTR   │
└─────────────┬───────────────────────────────────────┘
              │
    ┌─────────┼─────────┐
    ▼         ▼         ▼
 Auditor   Remediation  MTTR
 │          │            │
 ▼          ▼            ▼
Tag        Weather-     Weather-
findings   hold mode    adjusted
with       for          MTTR
weather    affected     calculation
context    findings
```

### 7. Data Repository Evolution

As maritime data ecosystems grow, the swarm must connect to new data sources:

| Data Source | Integration Method | Compliance Relevance |
|-------------|-------------------|---------------------|
| **Port Community Systems (PCS)** | REST API adapter + webhook receiver | Customs pre-clearance, port fee compliance |
| **Single-Window Customs Platforms** | EDI adapter (UN/EDIFACT CUSCAR/CUSRES) | Real-time customs filing verification |
| **AIS Data Feeds** | Kafka/UDP stream consumer | Vessel tracking compliance, positional integrity |
| **Blockchain eBL Platforms** | Smart contract event listener | Bill of Lading data integrity, chain-of-custody |
| **IoT Container Sensors** | MQTT broker consumer | Temperature compliance (cold chain), shock detection |
| **Container Terminal Operating Systems (TOS)** | EDIFACT COPARN/COARRI integration | Container movement compliance, storage deadline |
| **Emissions Monitoring Systems** | MRV data API consumer | EU ETS, IMO DCS carbon reporting compliance |
| **Crew Management Systems** | REST API + SSO | Crew data privacy, MLC 2006 compliance |

---

## Security Considerations

- **HMAC key** — drives all tokenisation determinism; rotating it invalidates every token. Treat as a root CA key.
- **Fernet keys** — generated per-session by default; for production, rotate via a key management service.
- **Gateway auth** — add API key or JWT middleware before production exposure (especially `apply` mode endpoints).
- **CORS** — currently wildcard; lock to your frontend domain in production.
- **Rate limiting** — not yet implemented; bulk manifest uploads could spike DB writes.

---

## License

MIT