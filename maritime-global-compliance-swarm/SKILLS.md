# Skill: Global Maritime Data Governance & Privacy Swarm

## Overview

Autonomous regulatory compliance agent swarm for global maritime freight operations. The swarm automates GDPR/PII anonymisation, EDI compliance auditing, remediation policy generation, and MTTR telemetry tracking across five international jurisdictions. Designed to evolve with emerging regulations, expanding data repositories, and the unique challenges of extreme weather and special maritime regions.

## When to Use This Skill

- Building compliance automation for maritime logistics, shipping, or freight forwarding
- Implementing PII anonymisation pipelines for Bills of Lading, manifests, or customs declarations
- Auditing EDI connections (EDIFACT, ANSI X12, BAPLIE, VGM) for encryption and format compliance
- Generating automated remediation policies from audit findings
- Tracking Mean Time To Remediate (MTTR) for compliance incidents
- Multi-jurisdiction data governance (GDPR, CCPA, LGPD, PDPA, PIPA)
- Weather-aware compliance operations in extreme maritime environments
- Integrating compliance across diverse maritime data repositories (AIS, PCS, IoT, blockchain eBL)

---

## Current Capabilities

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

---

## Next-Level Evolution Path

### PII Anonymiser Evolution

| Evolution | Description | Target Capability |
|-----------|-------------|-------------------|
| **ML-based NER** | Integrate spaCy with custom maritime named-entity recognition for free-text fields | Catch PII in remarks, special instructions, hazmat descriptions that regex misses |
| **Multi-script Unicode** | Unicode property classes for CJK, Arabic, Devanagari, Cyrillic name/email/ID formats | Support China Resident ID (18-digit), Aadhaar (12-digit), CPF (11-digit) |
| **Format-agnostic parsing** | JSON-LD, CBOR, protobuf, Avro manifest payload support | Handle blockchain eBL, digital twin, IoT sensor data |
| **Context-aware risk scoring** | Grade PII by re-identification difficulty; proportionate masking | Reduce over-masking, preserve data utility for analytics |
| **Key versioning** | HMAC key rotation without breaking existing token mappings | Zero-downtime cryptographic key rotation |
| **Chinese/Indian/Brazilian ID formats** | Locale-specific regex for national identity documents | Full coverage across BRICS+ shipping corridors |

### EDI Auditor Evolution

| Evolution | Description | Target Capability |
|-----------|-------------|-------------------|
| **Pluggable query registry** | Database-backed queries updatable via API without redeployment | Real-time regulatory update response |
| **AIS data compliance** | Audit AIS positional data integrity, spoofing detection, reporting gaps | Cover the fastest-growing maritime data source |
| **EU ETS domain** | 6th compliance domain for carbon reporting (MRV, registry, credits) | Address 2024+ EU ETS maritime mandate |
| **Cross-DB federation** | Query across FMS + PCS + customs single-window + AIS warehouse | Unified compliance audit across all data repositories |
| **Statistical anomaly detection** | Baseline distributions, flag outliers before they become violations | Proactive vs. reactive compliance |
| **Weather-correlated tagging** | Correlate findings with severe weather to adjust severity | Reduce false-positive critical findings by 20-30% |

### Remediation Generator Evolution

| Evolution | Description | Target Capability |
|-----------|-------------|-------------------|
| **Closed-loop verification** | Auto re-audit after remediation, escalate if still failing | Ensure root-cause resolution |
| **Region-aware policies** | PostGIS geo-fencing; Arctic vs. standard lane rules | Compliant operations in special regions |
| **Weather-hold mode** | Grace-period policies during hurricanes, typhoons, polar storms | Prevent inappropriate enforcement during force majeure |
| **Learned decision matrix** | Train on historical finding-remediation-verification outcomes | Continuously improving remediation accuracy |
| **Multi-party orchestration** | Workflow engine for cross-organisational compliance issues | Handle carrier + customs + port authority coordination |

### MTTR Tracker Evolution

| Evolution | Description | Target Capability |
|-----------|-------------|-------------------|
| **Time-series analytics** | Rolling averages, EMA, seasonal decomposition of MTTR | Trend identification and performance tracking |
| **Weather-adjusted MTTR** | Exclude force majeure periods from MTTR calculation | Fair compliance performance measurement |
| **Regional breakdown** | MTTR by trade lane, port pair, geographic region | Identify regional compliance bottlenecks |
| **Burst detection** | Cluster correlated findings into incidents | Prevent MTTR distortion from systemic failures |
| **Predictive estimation** | Regression-based MTTR prediction for new findings | Proactive resource allocation |
| **SSE streaming** | Real-time MTTR feed via Server-Sent Events | Live compliance dashboards without polling |

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

The swarm is designed to ingest marine weather data and use it as a first-class compliance signal:

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

| Data Source | Protocol | Compliance Value |
|-------------|----------|-----------------|
| **Freight Management System** | Direct DB (SQLAlchemy) | Core compliance data, EDI records, manifests |
| **Port Community Systems** | REST API + webhooks | Customs pre-clearance, port fee compliance |
| **Single-Window Customs** | UN/EDIFACT CUSCAR/CUSRES | Real-time customs filing verification |
| **AIS Feeds** | Kafka/UDP stream | Vessel tracking compliance, positional integrity |
| **Blockchain eBL** | Smart contract events | Bill of Lading integrity, chain-of-custody |
| **IoT Container Sensors** | MQTT broker | Cold-chain temperature, shock detection compliance |
| **Terminal OS (TOS)** | EDIFACT COPARN/COARRI | Container movement, storage deadline compliance |
| **Emissions Monitoring** | MRV data API | EU ETS, IMO DCS carbon reporting |
| **Crew Management** | REST API + SSO | Crew privacy, MLC 2006 compliance |

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

6 SQLAlchemy ORM tables:

1. `anonymisation_records` — audit trail for every PII field anonymised
2. `masking_policies` — field-level masking rules with GDPR article references
3. `audit_findings` — compliance issues found by the EDI auditor
4. `edi_connection_profiles` — partner EDI connection configurations
5. `mttr_events` — telemetry events tracking finding lifecycle phases
6. `compliance_reports` — periodic compliance summary reports

7 Enum types:

- `PIIFieldCategory` — consignee_identity, shipper_identity, contact_info, financial_id, government_id, location
- `AuditSeverity` — critical, high, medium, low, info
- `AuditStatus` — open, in_progress, remediated, accepted_risk, false_positive
- `EDIStandard` — EDIFACT, ANSI_X12, BAPLIE, VGM, COPARN, IFTMBC, CUSTOMS
- `PolicyAction` — tokenise, redact, generalise, pseudonymise, encrypt, truncate
- `RiskCategory` — pii_exposure, unencrypted_transmission, missing_customs_doc, edi_non_compliance, data_retention_violation, access_control_breach, cert_expiry

---

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

---

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
- **Gateway auth** — add API key or JWT middleware before production exposure (especially `apply` mode endpoints).
- **CORS** — currently wildcard; lock to your frontend domain in production.
- **Rate limiting** — not yet implemented; bulk manifest uploads could spike DB writes.
- **Audit logging** — API request audit trail should be added for ISO 27001 and GDPR accountability.
