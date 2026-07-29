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
| GET | `/api/v1/reports` | List compliance summary reports |

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

## License

MIT
