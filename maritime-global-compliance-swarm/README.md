# Maritime Global Compliance Swarm

> Automates international maritime mandate ingestion, continuous GDPR/PII anonymisation audits, and logistics configuration loops.

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
└─────────────────────────────────────────────────────────────────┘
```

## Tools

| Tool | Language | Purpose |
|------|----------|---------|
| **Manifest_PII_Anonymiser** | Python | Cryptographic tokenisation of consignee/shipper PII in shipping manifests |
| **Logistics_EDI_SQL_Auditor** | Python | Queries FMS to identify unencrypted transmissions or missing customs documentation |
| **Remediation_Route_Generator** | Python | Generates automated data masking policies or updates EDI connection profiles |
| **Telemetry_MTTR_Tracker** | Golang | Logs timestamps for maritime risk identification to automated resolution |

## Quick Start

### 1. Clone and configure

```bash
git clone <repo-url> maritime-global-compliance-swarm
cd maritime-global-compliance-swarm
cp .env.example .env
# Edit .env - set HMAC_KEY to a strong random value
```

### 2. Install dependencies

```bash
# Python
pip install -r python/requirements.txt

# Golang (optional, for MTTR tracker)
cd golang && go mod download
```

### 3. Initialise database

```bash
# Development (SQLite - no Docker required)
make init

# Production (PostgreSQL + PostGIS)
docker run --name maritime-db \
  -e POSTGRES_PASSWORD=mysecretpassword \
  -p 5432:5432 -d postgis/postgis:16-3.4
# Then set DB_DRIVER=postgres in .env
```

### 4. Run tools

```bash
# Seed default masking policies
make seed-policies

# Scan manifests for PII
make scan DIR=data/manifests

# Run full EDI compliance audit
make audit

# Generate remediation policies (dry-run)
make remediate

# Start MTTR tracker service
make mttr
```

### 5. Docker (all-in-one)

```bash
# Start database + MTTR tracker
docker compose up --build -d

# Run one-off tools
docker compose run --rm auditor
docker compose run --rm anonymiser
```

## CLI Reference

### PII Anonymiser

```bash
# Anonymise a single manifest
python -m anonymiser.cli anonymise --manifest path/to/manifest.json

# Preview changes without writing
python -m anonymiser.cli anonymise --manifest manifest.json --dry-run

# Scan directory for PII fields
python -m anonymiser.cli scan --input-dir data/raw_manifests/ --recursive

# List PII detection rules
python -m anonymiser.cli list-rules --jurisdiction GDPR

# Seed default masking policies
python -m anonymiser.cli seed-policies
```

### EDI SQL Auditor

```bash
# Run all audit queries
python -m edi_auditor.cli run --all

# Audit a specific domain
python -m edi_auditor.cli run --domain encryption
python -m edi_auditor.cli run --domain customs_documentation

# Audit EDI connection profiles
python -m edi_auditor.cli profiles

# List all available queries
python -m edi_auditor.cli list-queries
```

### Remediation Route Generator

```bash
# Generate policies (dry-run)
python -m remediation.cli generate-policies --mode dry-run

# Generate and apply policies
python -m remediation.cli generate-policies --mode apply

# Update EDI profiles
python -m remediation.cli update-edi --mode dry-run

# Status report
python -m remediation.cli report
```

### MTTR Tracker (Golang)

```bash
# Build and run
make mttr

# CLI flags
./bin/mttr-tracker --init-db    # Initialise schema only
./bin/mttr-tracker --purge      # Purge old events
./bin/mttr-tracker --version    # Print version

# HTTP API
POST /api/v1/events          # Ingest a telemetry event
GET  /api/v1/findings/{id}     # Get finding timeline + MTTR
GET  /api/v1/mttr/report       # Aggregate MTTR report
GET  /api/v1/mttr/open         # Open findings with MTTR data
GET  /health                  # Health check
```

## Compliance Domains

| Domain | Queries | Key Standards |
|--------|---------|---------------|
| **Encryption** | 3 queries | GDPR Art.32, ISM Code |
| **Customs Documentation** | 3 queries | WCO SAFE Framework, SOLAS VGM, IMDG Code |
| **EDI Format** | 2 queries | UN/EDIFACT D.21A, ANSI X12 8.6 |
| **Data Retention** | 2 queries | GDPR Art.5(1)(e), Art.17 |
| **Access Control** | 1 query | ISO 27001 A.9 |

## Operational Workflow

See `docs/workflow_diagram.mmd` (Mermaid) or `docs/workflow_diagram.png` (rendered).

The swarm operates in 6 phases:

1. **Ingestion** - Raw manifests from FMS/EDI streams
2. **Detection** - PII rule engine classifies fields
3. **Tokenisation** - HMAC-SHA256 vault replaces PII with deterministic tokens
4. **Audit** - 11 SQL queries detect encryption, customs, and EDI violations
5. **Remediation** - Decision matrix auto-generates masking policies and EDI fixes
6. **Telemetry** - Golang service tracks MTTR across all findings

## Project Structure

```
maritime-global-compliance-swarm/
├── python/
│   ├── shared/              # Config, ORM models, database layer
│   │   ├── config.py        # Environment-based configuration
│   │   ├── models.py        # SQLAlchemy models (6 tables, 7 enums)
│   │   └── database.py      # Engine creation, session management
│   ├── anonymiser/          # Manifest_PII_Anonymiser
│   │   ├── tokeniser.py     # HMAC vault, Fernet encryptor, PII engine
│   │   ├── rules.py         # PII detection rules (5 jurisdictions)
│   │   └── cli.py           # Click CLI (anonymise, scan, list-rules)
│   ├── edi_auditor/         # Logistics_EDI_SQL_Auditor
│   │   ├── queries.py       # 11 parametric audit queries
│   │   ├── auditor.py       # Query executor + finding persister
│   │   └── cli.py           # Click CLI (run, profiles, list-queries)
│   ├── remediation/         # Remediation_Route_Generator
│   │   ├── policy_gen.py    # Decision matrix + policy creation
│   │   ├── edi_updater.py   # EDI profile security updates
│   │   └── cli.py           # Click CLI (generate-policies, update-edi, report)
│   ├── requirements.txt
│   └── Dockerfile
├── golang/
│   ├── cmd/mttr_tracker/    # CLI entrypoint
│   ├── internal/
│   │   ├── config/          # Environment configuration
│   │   ├── models/          # Data structures
│   │   ├── database/        # Database operations (SQLite + Postgres)
│   │   └── tracker/         # Buffered event engine
│   ├── pkg/api/             # HTTP REST API
│   ├── go.mod
│   └── Dockerfile
├── docs/
│   ├── workflow_diagram.mmd # Mermaid source
│   └── workflow_diagram.png # Rendered PNG
├── .github/workflows/ci.yml
├── docker-compose.yml
├── Makefile
├── .env.example
└── .gitignore
```

## License

MIT
