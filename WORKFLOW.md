# Implementation Workflow

> Phased implementation plan for the Maritime Global Compliance Swarm evolution, derived from the strategic analysis in THOUGHTS.md.

---

## Workflow Overview

```
Phase 1: Production Hardening     ──►  Phase 2: Intelligence Layer
  (0-3 months)                            (3-6 months)
       │                                         │
       ▼                                         ▼
Phase 3: Data Source Expansion   ◄──  Phase 4: Geographic Expansion
  (6-12 months)                           (12-18 months)
       │
       ▼
Phase 5: Autonomous Operations
  (18-24 months)
       │
       ▼
Phase 6: Ecosystem & Standards
  (24-36 months)
```

---

## Phase 1: Production Hardening (0-3 months)

> **Goal**: Make the swarm safe for production deployment behind a real domain with real data.

### 1.1 Gateway Authentication
- [ ] Implement API key middleware (FastAPI dependency injection)
- [ ] Add JWT support for user authentication
- [ ] RBAC roles: `viewer` (read-only), `analyst` (audit + remediation dry-run), `operator` (staged + apply)
- [ ] API key rotation endpoint
- [ ] Auth bypass for health/readiness probes

### 1.2 Rate Limiting
- [ ] Add slowapi (token-bucket) middleware to gateway
- [ ] Per-endpoint rate limit configuration
- [ ] Rate limit headers in responses (`X-RateLimit-Limit`, `X-RateLimit-Remaining`)
- [ ] Bulk endpoint specific limits (anonymise/manifest, audit/run)

### 1.3 CORS and Security Hardening
- [ ] Environment-specific CORS origins (dev: `*`, prod: specific domain)
- [ ] Add `X-Content-Type-Options: nosniff`
- [ ] Add `X-Frame-Options: DENY`
- [ ] Add `Content-Security-Policy` header
- [ ] Add `Strict-Transport-Security` header

### 1.4 TLS and Deployment
- [ ] Caddy reverse proxy configuration for Python gateway
- [ ] Caddy reverse proxy configuration for Go MTTR service
- [ ] Docker Compose with TLS termination
- [ ] Health check endpoints: liveness (`/health/live`) and readiness (`/health/ready`)

### 1.5 Configuration Validation
- [ ] Convert shared/config.py to Pydantic BaseSettings
- [ ] Strict validation at startup (fail-fast)
- [ ] Environment variable documentation (.env.example)
- [ ] Config schema export endpoint

### 1.6 Integration Tests
- [ ] pytest setup with test database
- [ ] Test: full finding lifecycle (detect -> triage -> assign -> remediate -> verify -> close)
- [ ] Test: event bus publish -> reaction engine fires
- [ ] Test: state machine timeout auto-escalation
- [ ] Test: MTTR calculation accuracy
- [ ] Test: Python -> Go bridge event forwarding
- [ ] GitHub Actions CI pipeline

### 1.7 Logging Standardisation
- [ ] Structured JSON logging (python-json-logger)
- [ ] Correlation ID propagation across all services
- [ ] Log levels: DEBUG, INFO, WARNING, ERROR, CRITICAL
- [ ] Go service structured logging (slog or zerolog)

### 1.8 Deliverables
- [ ] Production-ready Docker Compose stack
- [ ] CI/CD pipeline with tests
- [ ] Deployment runbook
- [ ] Security hardening checklist

---

## Phase 2: Intelligence Augmentation (3-6 months)

> **Goal**: Reduce manual intervention through ML-driven detection, prediction, and automated reporting.

### 2.1 ML-Based Anomaly Detection
- [ ] Statistical baseline engine for EDI message volumes per partner
- [ ] PII density analysis per manifest type
- [ ] Z-score and IQR-based outlier detection
- [ ] Alert generation when metrics exceed 2 standard deviations
- [ ] Dashboard panel for anomaly trends

### 2.2 Context-Aware Risk Scoring
- [ ] Re-identification difficulty scoring for PII fields
- [ ] Weather-correlated severity adjustment (reduce severity during force majeure)
- [ ] Jurisdiction-specific risk weightings
- [ ] Composite risk score API endpoint

### 2.3 Predictive MTTR
- [ ] Historical MTTR dataset preparation
- [ ] Regression model (linear or gradient boosting) for MTTR prediction
- [ ] Feature engineering: severity, category, jurisdiction, weather, time-of-day
- [ ] MTTR prediction API endpoint
- [ ] Resource allocation suggestions based on predicted MTTR

### 2.4 Automated Compliance Reports
- [ ] Scheduled report generation (daily, weekly, monthly)
- [ ] PDF report with executive summary, trend charts, top findings
- [ ] Report delivery via email webhook
- [ ] Report templates per audience (executives, auditors, operators)

### 2.5 Closed-Loop Remediation
- [ ] Auto re-audit trigger after remediation completion
- [ ] Escalation if re-audit still finds violations
- [ ] Root-cause analysis logging
- [ ] Remediation effectiveness metrics

### 2.6 Query Registry Maturity
- [ ] Full CRUD API for audit queries
- [ ] Query versioning with rollback
- [ ] Query testing sandbox (run against test data before activating)
- [ ] Query import/export (JSON/YAML)

### 2.7 Deliverables
- [ ] Anomaly detection service
- [ ] Predictive MTTR model
- [ ] Automated report generation pipeline
- [ ] Enhanced query registry with versioning

---

## Phase 3: Data Source Expansion (6-12 months)

> **Goal**: Integrate the broader maritime data ecosystem beyond EDI and manifests.

### 3.1 AIS Data Compliance
- [ ] AIS message parser (NMEA 0183 VDM/VDO)
- [ ] Positional integrity checks (impossible speed, position jumps)
- [ ] Spoofing detection (flag mismatch, trajectory anomalies)
- [ ] Reporting gap detection (missing position reports > 15 min)
- [ ] AIS-specific compliance dashboard panel

### 3.2 EU ETS Carbon Reporting
- [ ] New compliance domain: carbon_emissions
- [ ] MRV (Monitoring, Reporting, Verification) data validation
- [ ] Carbon credit registry reconciliation
- [ ] Emissions threshold alerting
- [ ] EU ETS compliance report template

### 3.3 Blockchain eBL Integration
- [ ] Smart contract event listener (Ethereum-compatible chains)
- [ ] Bill of Lading integrity verification
- [ ] Chain-of-custody audit trail
- [ ] eBL compliance findings generation

### 3.4 IoT Container Sensors
- [ ] MQTT broker connection (Mosquitto/EMQX)
- [ ] Cold-chain temperature excursion detection
- [ ] Shock/tilt threshold monitoring
- [ ] Sensor data compliance findings

### 3.5 Cross-DB Federation
- [ ] SQLAlchemy multi-engine support
- [ ] Federated query executor
- [ ] Unified compliance view across data sources
- [ ] Connection health monitoring per data source

### 3.6 Satellite Imagery Integration
- [ ] Weather event detection from satellite feeds
- [ ] Port closure event generation
- [ ] Storm track correlation with vessel positions
- [ ] Weather-hold compliance mode triggers

### 3.7 Deliverables
- [ ] AIS compliance module
- [ ] EU ETS reporting module
- [ ] Blockchain eBL connector
- [ ] IoT sensor integration
- [ ] Federated query engine

---

## Phase 4: Geographic and Regulatory Expansion (12-18 months)

> **Goal**: Full multi-jurisdiction, multi-region compliance coverage.

### 4.1 BRICS+ PII Formats
- [ ] China Resident ID (18-digit) detection and masking
- [ ] India Aadhaar (12-digit) detection and masking
- [ ] Brazil CPF (11-digit) detection and masking
- [ ] Russia INN (10/12-digit) detection and masking
- [ ] Locale-specific anonymisation rules per jurisdiction

### 4.2 Arctic Compliance Profile
- [ ] Extended SLA configuration for Arctic routes
- [ ] Ice-route customs pre-clearance workflows
- [ ] Satellite-optimised EDI retry logic
- [ ] Arctic-specific compliance dashboard

### 4.3 PostGIS Geo-Fencing
- [ ] Spatial compliance zones (Arctic, piracy high-risk, EEZ boundaries)
- [ ] Vessel position-based rule selection
- [ ] Geo-fenced SLA adjustments
- [ ] Map-based compliance visualisation

### 4.4 Multi-Party Orchestration
- [ ] Workflow engine for cross-organisational compliance
- [ ] Carrier + customs + port authority coordination workflows
- [ ] Shared finding visibility with permission controls
- [ ] Multi-party remediation tracking

### 4.5 Sanctions Screening
- [ ] Real-time sanctions list API integration
- [ ] Route deviation classification (weather vs. piracy vs. sanctions)
- [ ] Automatic sanctions re-screening on route changes
- [ ] Sanctions compliance findings and reporting

### 4.6 Deliverables
- [ ] BRICS+ PII anonymisation rules
- [ ] Arctic compliance profile
- [ ] PostGIS spatial compliance engine
- [ ] Multi-party orchestration workflows
- [ ] Sanctions screening module

---

## Phase 5: Autonomous Operations (18-24 months)

> **Goal**: Self-healing compliance that reduces human intervention for routine findings.

### 5.1 Self-Healing Compliance
- [ ] Auto-detect, auto-remediate, auto-verify for low-risk findings
- [ ] Human approval workflow for medium-risk findings
- [ ] Full human-in-the-loop for high/critical findings
- [ ] Confidence scoring for automated decisions

### 5.2 Learned Decision Matrix
- [ ] Historical outcome dataset preparation
- [ ] ML model training on finding-remediation-verification outcomes
- [ ] A/B testing framework for remediation strategies
- [ ] Model performance monitoring and retraining pipeline

### 5.3 Natural Language Interface
- [ ] LLM integration for compliance queries
- [ ] Text-to-SQL for ad-hoc compliance reporting
- [ ] Chat-based finding investigation
- [ ] Natural language remediation policy generation

### 5.4 Compliance Digital Twin
- [ ] Real-time compliance posture simulation
- [ ] What-if scenario analysis (new regulation, route change, data source)
- [ ] Risk projection modelling
- [ ] Compliance maturity scoring

### 5.5 Deliverables
- [ ] Self-healing compliance engine
- [ ] ML-powered decision matrix
- [ ] Natural language compliance interface
- [ ] Compliance digital twin

---

## Phase 6: Ecosystem and Standards (24-36 months)

> **Goal**: Transform the swarm from a product into an industry ecosystem.

### 6.1 Open Standards Publication
- [ ] Publish finding state machine specification
- [ ] Publish event bus schema specification
- [ ] Publish compliance finding data model
- [ ] Submit to maritime standards bodies (IMO, BIMCO)

### 6.2 Multi-Tenant SaaS
- [ ] Tenant isolation (database, config, events)
- [ ] Per-tenant compliance profiles
- [ ] Usage metering and billing integration
- [ ] Tenant onboarding API

### 6.3 Plugin Marketplace
- [ ] Plugin SDK for third-party audit rules
- [ ] Plugin SDK for reaction rules
- [ ] Plugin SDK for data source connectors
- [ ] Marketplace frontend (browse, install, review)
- [ ] Plugin signing and security review

### 6.4 Regulatory Change Feed
- [ ] Regulatory publication monitoring service
- [ ] NLP-based regulation change detection
- [ ] Automatic compliance rule suggestion
- [ ] Human review and approval workflow for suggested rules

### 6.5 Deliverables
- [ ] Open standards documentation
- [ ] Multi-tenant SaaS platform
- [ ] Plugin marketplace MVP
- [ ] Regulatory change monitoring service

---

## Cross-Phase Practices

### Development Workflow

```
1. Create feature branch: `git checkout -b phase-X/feature-name`
2. Write code with tests
3. Run local validation: `make lint && make test`
4. Build and verify: `docker compose build && docker compose up -d`
5. Run integration tests: `make test-integration`
6. Commit with conventional commits: `git commit -m "feat(auditor): add AIS positional integrity check"`
7. Push and create PR
8. CI pipeline: lint -> unit test -> integration test -> build -> security scan
9. Code review and merge to main
10. Auto-deploy to staging, manual promote to production
```

### Commit Convention

| Prefix | Usage |
|--------|-------|
| `feat(scope):` | New feature |
| `fix(scope):` | Bug fix |
| `docs(scope):` | Documentation only |
| `refactor(scope):` | Code restructuring without behaviour change |
| `test(scope):` | Adding or updating tests |
| `chore(scope):` | Build, CI, dependencies |
| `security(scope):` | Security-related changes |

### Quality Gates (Every Phase)

- [ ] All new endpoints have authentication and rate limiting
- [ ] All new database operations use parameterised queries
- [ ] All new event types have corresponding reaction rules documented
- [ ] All new findings types have state machine coverage
- [ ] All new data sources have anonymisation policies
- [ ] Integration test covers the new capability end-to-end
- [ ] Documentation updated (SKILLS.md, README.md, API docs)
- [ ] No regressions in existing test suite

---

## Dependencies Between Phases

```
Phase 1 (Hardening)
  └──► Phase 2 (Intelligence) — needs auth, logging, tests
        └──► Phase 3 (Data Sources) — needs anomaly detection baseline
              └──► Phase 4 (Geographic) — needs data source federation
                    └──► Phase 5 (Autonomous) — needs ML models + multi-jurisdiction
                          └──► Phase 6 (Ecosystem) — needs mature, battle-tested platform
```

Each phase builds on the previous. Phase 1 is the non-negotiable foundation. Phase 2 can begin in parallel with late Phase 1 items (logging, config validation). Phases 3 and 4 can partially overlap once the data source abstraction layer is in place.
