# Skill: Global Maritime Data Governance & Privacy Swarm

## Overview

Autonomous regulatory compliance agent swarm for global maritime freight operations. The swarm automates GDPR/PII anonymisation, EDI compliance auditing, remediation policy generation, and MTTR telemetry tracking across five international jurisdictions.

## When to Use This Skill

- Building compliance automation for maritime logistics, shipping, or freight forwarding
- Implementing PII anonymisation pipelines for Bills of Lading, manifests, or customs declarations
- Auditing EDI connections (EDIFACT, ANSI X12, BAPLIE, VGM) for encryption and format compliance
- Generating automated remediation policies from audit findings
- Tracking Mean Time To Remediate (MTTR) for compliance incidents
- Multi-jurisdiction data governance (GDPR, CCPA, LGPD, PDPA, PIPA)

## Capabilities

### 1. Manifest PII Anonymiser (Python)

- **HMAC-SHA256 deterministic tokenisation** — produces consistent tokens for the same input across runs, enabling cross-referencing without exposing original data
- **Fernet symmetric encryption** — reversible pseudonymisation for customs DPA-covered use cases (AES-128-CBC + HMAC-SHA256)
- **Multi-jurisdiction PII rules** — 7 default rules covering consignee identity, shipper identity, contact info, government IDs, and financial IDs
- **Free-text PII scanning** — regex-based detection of emails, phone numbers, passport numbers, and tax IDs embedded in free-text fields
- **Six masking actions** — tokenise, redact, generalise (date granularity), pseudonymise, encrypt, truncate
- **Token format** — `{PREFIX}_{CATEGORY}_{HMAC_TRUNCATED}` (e.g., `MTS_CONS_a3f8c1e9b2d4`)

### 2. Logistics EDI SQL Auditor (Python)

- **11 parametric SQL audit queries** across 5 compliance domains
- **Domain: Encryption** (3 queries) — unencrypted EDI transmissions, FTP file transfers, expired TLS certificates
- **Domain: Customs Documentation** (3 queries) — missing customs declarations, missing VGM, expiring dangerous goods docs
- **Domain: EDI Format** (2 queries) — failed validation messages, orphaned references
- **Domain: Data Retention** (2 queries) — PII past retention period, unanonymised historical manifests
- **Domain: Access Control** (1 query) — excessive user permissions
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
- **Five lifecycle phases** — identified, assigned, in_progress, resolved, verified
- **MTTR calculation** — average and P95 metrics, broken down by severity and risk category
- **SQLite (dev) / PostgreSQL (prod)** — driver-agnostic via configuration swap
- **HTTP API** — 5 endpoints for event ingestion, finding timelines, and aggregate reports

### 5. API Gateway + Dashboard (Python FastAPI)

- **20 REST routes** covering all four tools plus shared query endpoints
- **Static HTML dashboard** — interactive dark-theme UI with tabbed interface for all tools
- **Python Client SDK** — typed `httpx` client with Pydantic models for programmatic frontend integration
- **OpenAPI documentation** — auto-generated Swagger UI at `/docs` and ReDoc at `/redoc`
- **CORS middleware** — configured for cross-origin frontend access
- **MTTR proxy** — transparently proxies MTTR requests to the Golang service

## Jurisdictions Supported

| Jurisdiction | Regulation | Key Requirements |
|-------------|------------|-------------------|
| **GDPR** | EU General Data Protection Regulation | Art.25 (data protection by design), Art.32 (security), Art.5(1)(e) (storage limitation) |
| **CCPA** | California Consumer Privacy Act | Consumer data access and deletion rights |
| **LGPD** | Brazil Lei Geral de Protecao de Dados | Consent-based processing, DPO requirements |
| **PDPA** | Singapore Personal Data Protection Act | Purpose limitation, consent obligations |
| **PIPA** | South Korea Personal Information Protection Act | Consent and data minimisation |

## Supported EDI Standards

- **EDIFACT** (UN/EDIFACT D.21A)
- **ANSI X12** (Version 8.6)
- **BAPLIE** (Bay Plan / Stowage)
- **VGM** (Verified Gross Mass, SOLAS VI/2)
- **COPARN** (Container movement)
- **IFTMBC** (Booking confirmation)
- **CUSTOMS** (Customs declarations)

## Database Schema

6 SQLAlchemy ORM tables:

1. `anonymisation_records` — audit trail for every PII field anonymised
2. `masking_policies` — field-level masking rules with GDPR article references
3. `audit_findings` — compliance issues found by the EDI auditor
4. `edi_connection_profiles` — partner EDI connection configurations
5. `mttr_events` — telemetry events tracking finding lifecycle phases
6. `compliance_reports` — periodic compliance summary reports

## API Endpoints

| Method | Path | Tool |
|--------|------|------|
| GET | `/` | Dashboard (HTML) |
| GET | `/health` | Health check |
| POST | `/api/v1/anonymise/manifest` | Anonymiser |
| POST | `/api/v1/anonymise/free-text` | Anonymiser |
| POST | `/api/v1/anonymise/scan` | Anonymiser |
| POST | `/api/v1/audit/run` | Auditor |
| GET | `/api/v1/audit/profiles` | Auditor |
| GET | `/api/v1/audit/queries` | Auditor |
| POST | `/api/v1/remediation/policies` | Remediation |
| POST | `/api/v1/remediation/edi-profiles` | Remediation |
| POST | `/api/v1/mttr/events` | MTTR (Go) |
| GET | `/api/v1/mttr/findings/{id}` | MTTR (Go) |
| GET | `/api/v1/mttr/report` | MTTR (Go) |
| GET | `/api/v1/mttr/open` | MTTR (Go) |
| GET | `/api/v1/findings` | Shared |
| GET | `/api/v1/policies` | Shared |
| GET | `/api/v1/reports` | Shared |
| GET | `/docs` | Swagger UI |
| GET | `/redoc` | ReDoc |

## Technology Stack

| Component | Technology | Version |
|-----------|------------|---------|
| API Gateway | Python, FastAPI, uvicorn, httpx | 3.12+ |
| PII Anonymiser | Python, cryptography (HMAC-SHA256, Fernet) | 3.12+ |
| EDI Auditor | Python, SQLAlchemy 2.0 | 3.12+ |
| Remediation | Python, SQLAlchemy 2.0 | 3.12+ |
| MTTR Tracker | Golang, net/http, database/sql | 1.22+ |
| Database (dev) | SQLite with WAL mode | — |
| Database (prod) | PostgreSQL 16 + PostGIS 3.4 | — |
| Containerisation | Docker multi-stage, docker-compose | — |
| CI/CD | GitHub Actions (5 jobs) | — |

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

## Security Considerations

- **HMAC key** — drives all tokenisation determinism; rotating it invalidates every token. Treat as a root CA key.
- **Fernet keys** — generated per-session by default; for production, rotate via a key management service.
- **Gateway auth** — add API key or JWT middleware before production exposure (especially `apply` mode endpoints).
- **CORS** — currently wildcard; lock to your frontend domain in production.
- **Rate limiting** — not yet implemented; bulk manifest uploads could spike DB writes.