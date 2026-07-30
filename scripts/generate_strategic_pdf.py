# -*- coding: utf-8 -*-
import sys, os, hashlib, subprocess

PDF_SKILL_DIR = '/home/z/my-project/skills/pdf'
_scripts = os.path.join(PDF_SKILL_DIR, 'scripts')
if _scripts not in sys.path:
    sys.path.insert(0, _scripts)

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY, TA_RIGHT
from reportlab.platypus import (
    Paragraph, Spacer, PageBreak, Table, TableStyle,
    KeepTogether, Frame, PageTemplate, BaseDocTemplate, Flowable
)
from reportlab.lib import colors
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily
from reportlab.platypus.tableofcontents import TableOfContents
from pypdf import PdfReader, PdfWriter

# ═══════════════════════════════════════════════════════════════
# FONTS
# ═══════════════════════════════════════════════════════════════
FONT_DIR = '/usr/share/fonts'

pdfmetrics.registerFont(TTFont('NotoSerifSC', f'{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Regular.ttf'))
pdfmetrics.registerFont(TTFont('NotoSerifSC-Bold', f'{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Bold.ttf'))
registerFontFamily('NotoSerifSC', normal='NotoSerifSC', bold='NotoSerifSC-Bold')

pdfmetrics.registerFont(TTFont('DejaVuSans', f'{FONT_DIR}/truetype/dejavu/DejaVuSans.ttf'))
pdfmetrics.registerFont(TTFont('DejaVuSans-Bold', f'{FONT_DIR}/truetype/dejavu/DejaVuSans-Bold.ttf'))
registerFontFamily('DejaVuSans', normal='DejaVuSans', bold='DejaVuSans-Bold')

# ═══════════════════════════════════════════════════════════════
# CASCADE PALETTE
# ═══════════════════════════════════════════════════════════════

PAGE_BG       = colors.HexColor('#f5f4f3')
SECTION_BG    = colors.HexColor('#f0efed')
CARD_BG       = colors.HexColor('#eae8e4')
TABLE_STRIPE  = colors.HexColor('#edebe8')
HEADER_FILL   = colors.HexColor('#3d5a6e')
COVER_BLOCK   = colors.HexColor('#4a6575')
BORDER        = colors.HexColor('#b8c0c7')
ICON          = colors.HexColor('#4e6d7a')
ACCENT        = colors.HexColor('#2f97b9')
ACCENT_2      = colors.HexColor('#3a8a7d')
TEXT_PRIMARY  = colors.HexColor('#252422')
TEXT_MUTED    = colors.HexColor('#8d8981')

TABLE_HEADER_COLOR = HEADER_FILL
TABLE_HEADER_TEXT  = colors.white
TABLE_ROW_EVEN     = colors.white
TABLE_ROW_ODD      = TABLE_STRIPE

# ═══════════════════════════════════════════════════════════════
# STYLES
# ═══════════════════════════════════════════════════════════════

s_h1 = ParagraphStyle('H1Custom', fontName='NotoSerifSC-Bold', fontSize=22, leading=28,
    textColor=TEXT_PRIMARY, spaceAfter=10, spaceBefore=20, alignment=TA_LEFT)
s_h2 = ParagraphStyle('H2Custom', fontName='NotoSerifSC-Bold', fontSize=16, leading=22,
    textColor=HEADER_FILL, spaceAfter=8, spaceBefore=16, alignment=TA_LEFT)
s_h3 = ParagraphStyle('H3Custom', fontName='NotoSerifSC-Bold', fontSize=13, leading=18,
    textColor=ICON, spaceAfter=6, spaceBefore=12, alignment=TA_LEFT)
s_body = ParagraphStyle('BodyCustom', fontName='NotoSerifSC', fontSize=10, leading=16,
    textColor=TEXT_PRIMARY, spaceAfter=8, alignment=TA_JUSTIFY)
s_caption = ParagraphStyle('CaptionCustom', fontName='NotoSerifSC', fontSize=9, leading=13,
    textColor=TEXT_MUTED, spaceAfter=6, spaceBefore=4, alignment=TA_LEFT)
s_table_header = ParagraphStyle('TableHeader', fontName='NotoSerifSC-Bold', fontSize=9, leading=13,
    textColor=TABLE_HEADER_TEXT, alignment=TA_LEFT)
s_table_cell = ParagraphStyle('TableCell', fontName='NotoSerifSC', fontSize=9, leading=13,
    textColor=TEXT_PRIMARY, alignment=TA_LEFT, wordWrap='CJK')

toc_level0 = ParagraphStyle('TOC0', fontName='NotoSerifSC-Bold', fontSize=12, leading=20, leftIndent=0, textColor=TEXT_PRIMARY)
toc_level1 = ParagraphStyle('TOC1', fontName='NotoSerifSC', fontSize=10, leading=18, leftIndent=20, textColor=ICON)

# ═══════════════════════════════════════════════════════════════
# CUSTOM FLOWABLES
# ═══════════════════════════════════════════════════════════════

class ColorBar(Flowable):
    def __init__(self, width, height=2, color=ACCENT):
        Flowable.__init__(self)
        self.width = width
        self.height = height
        self.color = color
    def draw(self):
        self.canv.setFillColor(self.color)
        self.canv.rect(0, 0, self.width, self.height, fill=1, stroke=0)

# ═══════════════════════════════════════════════════════════════
# TOC TEMPLATE
# ═══════════════════════════════════════════════════════════════

class TocDocTemplate(BaseDocTemplate):
    def __init__(self, filename, **kwargs):
        BaseDocTemplate.__init__(self, filename, **kwargs)
    def afterFlowable(self, flowable):
        if hasattr(flowable, 'bookmark_name'):
            level = getattr(flowable, 'bookmark_level', 0)
            text = getattr(flowable, 'bookmark_text', '')
            key = getattr(flowable, 'bookmark_key', '')
            self.notify('TOCEntry', (level, text, self.page, key))

def add_heading(text, style, level=0):
    key = f'h_{hashlib.md5(text.encode()).hexdigest()[:8]}'
    p = Paragraph(f'<a name="{key}"/>{text}', style)
    p.bookmark_name = key
    p.bookmark_level = level
    p.bookmark_text = text
    p.bookmark_key = key
    return p

def make_table(headers, rows, col_widths=None):
    aw = A4[0] - 100
    if col_widths is None:
        n = len(headers)
        col_widths = [aw / n] * n
    header_row = [Paragraph(h, s_table_header) for h in headers]
    data_rows = []
    for row in rows:
        data_rows.append([Paragraph(str(c), s_table_cell) for c in row])
    all_data = [header_row] + data_rows
    t = Table(all_data, colWidths=col_widths, repeatRows=1)
    style_cmds = [
        ('BACKGROUND', (0, 0), (-1, 0), TABLE_HEADER_COLOR),
        ('TEXTCOLOR', (0, 0), (-1, 0), TABLE_HEADER_TEXT),
        ('FONTNAME', (0, 0), (-1, 0), 'NotoSerifSC-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 9),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
        ('TOPPADDING', (0, 0), (-1, 0), 8),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 1), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 1), (-1, -1), 6),
        ('GRID', (0, 0), (-1, -1), 0.5, BORDER),
    ]
    for i in range(1, len(all_data)):
        bg = TABLE_ROW_ODD if i % 2 == 0 else TABLE_ROW_EVEN
        style_cmds.append(('BACKGROUND', (0, i), (-1, i), bg))
    t.setStyle(TableStyle(style_cmds))
    return t

# ═══════════════════════════════════════════════════════════════
# BUILD BODY CONTENT
# ═══════════════════════════════════════════════════════════════

output_body = '/home/z/my-project/download/_body_strategic.pdf'
output_cover = '/home/z/my-project/download/_cover_strategic.pdf'
output_final = '/home/z/my-project/download/Maritime_Compliance_Strategic_Thoughts_Workflow.pdf'

story = []
aw = A4[0] - 100

# --- TOC ---
toc = TableOfContents()
toc.levelStyles = [toc_level0, toc_level1]
story.append(Paragraph('Table of Contents', s_h1))
story.append(ColorBar(aw, 2, ACCENT))
story.append(Spacer(1, 16))
story.append(toc)
story.append(PageBreak())

# ═══════════════════════════════════════════════════════════════
# PART I: STRATEGIC THOUGHTS
# ═══════════════════════════════════════════════════════════════

story.append(add_heading('Part I: Strategic Thoughts', s_h1, level=0))
story.append(ColorBar(aw, 2, ACCENT))
story.append(Spacer(1, 12))

story.append(Paragraph(
    'The Maritime Global Compliance Swarm was born from a critical gap in global maritime logistics: '
    'regulatory compliance is manual, reactive, and fragmented across jurisdictions. A single vessel voyage may touch five or more '
    'regulatory domains (EU GDPR, US CCPA, Brazil LGPD, Singapore PDPA, South Korea PIPA), each with distinct data protection '
    'requirements, yet the industry still relies on compliance officers manually cross-referencing EDI messages against spreadsheets '
    'of regulatory rules.', s_body))

story.append(Paragraph(
    'The core thesis is that compliance can be shifted left — detected, triaged, and remediated at the data-ingestion layer rather than '
    'discovered months later during audits. The swarm architecture treats each compliance concern (anonymisation, auditing, remediation, '
    'telemetry, state governance) as an independent agent that communicates through a shared event bus, enabling autonomous operation while '
    'maintaining human oversight through audit trails and approval workflows.', s_body))

story.append(add_heading('1. Architectural Decisions and Rationale', s_h2, level=1))

story.append(add_heading('1.1 Why a Swarm Architecture?', s_h3, level=1))
story.append(Paragraph(
    'A monolithic compliance engine would create tight coupling between detection, remediation, and measurement concerns. The swarm '
    'pattern isolates each capability into a focused agent. The Anonymiser Agent owns all PII transformation logic and needs no knowledge of '
    'EDI formats or MTTR metrics. The EDI Auditor Agent owns compliance query execution and detects violations but does not fix them. '
    'The Remediation Agent owns policy generation and receives findings to produce corrective actions without knowing how they were detected.',
    s_body))
story.append(Paragraph(
    'The MTTR Tracker is implemented in Go (rather than Python) for high-throughput event ingestion with goroutines and buffered writes, '
    'a separate deployment lifecycle, and memory-safe concurrent processing. The State Machine owns finding lifecycle governance with a '
    'formal 10-state, 20-transition model that prevents invalid state jumps that ad-hoc boolean flags would allow. The Event Bus decouples '
    'all agents so any agent can react to any event without direct API calls to other agents. The Reaction Engine provides 7 built-in event-driven '
    'automation rules that demonstrate how the swarm can autonomously respond to compliance events without human intervention.', s_body))
story.append(Paragraph(
    'This separation means each agent can be deployed, scaled, and updated independently. The Python gateway can be restarted without losing '
    'MTTR events (the Go service has its own buffer). The auditor can be extended with new queries without touching the anonymiser. This loose '
    'coupling is the fundamental architectural advantage that enables the 6-horizon evolution roadmap described later in this document.', s_body))

story.append(add_heading('1.2 Why Python + Go Polyglot?', s_h3, level=1))
story.append(Paragraph(
    'The choice of Python for compliance logic and Go for telemetry was deliberate and strategic. Python provides the rich NLP ecosystem '
    '(spaCy for NER), SQLAlchemy ORM for database abstraction, FastAPI for automatic OpenAPI documentation, and rapid iteration on business '
    'rules. Go provides buffered concurrent writes with goroutines, single binary deployment, lower memory footprint for high-throughput '
    'event ingestion, and native HTTP performance.', s_body))
story.append(Paragraph(
    'The bridge pattern (Python state machine async-POSTs transitions to Go) keeps the polyglot boundary clean and explicitly versioned. '
    'The Go service can be deployed closer to event sources on edge nodes, and teams with Go expertise can own the telemetry layer independently. '
    'This is not just a technology choice — it is an organisational design decision that enables skill diversity across the development team.', s_body))

story.append(add_heading('1.3 Why the Event Bus Over Direct API Calls?', s_h3, level=1))
story.append(Paragraph(
    'Direct API calls between agents create a dependency graph where a slow audit blocks remediation. The event bus provides temporal '
    'decoupling (publishers and subscribers operate at their own pace), extensibility (adding a new reaction rule requires zero changes to '
    'existing agents), auditability (every event is persisted to the event_log table), and resilience (if a subscriber is down, events queue '
    'and process when it recovers). The event bus was not designed as a full event-sourcing system but as a communication backbone with '
    'auditability as a side effect, giving us the benefits of event-driven architecture without the complexity of full event sourcing.', s_body))

story.append(add_heading('1.4 Weather as a First-Class Compliance Signal', s_h3, level=1))
story.append(Paragraph(
    'Most compliance systems treat weather as an operational concern separate from regulatory compliance. The swarm recognises that extreme '
    'weather directly impacts compliance obligations: port closures affect customs filing deadlines, storm disruptions affect EDI transmission '
    'reliability, and route deviations may require sanctions re-screening. By making weather a first-class event on the compliance event bus, '
    'the swarm automatically adjusts SLAs, triggers grace-period policies, and correlates findings with weather context, reducing false-positive '
    'critical findings by an estimated 20-30%. This design philosophy treats compliance as a living system that responds to the physical world, '
    'not just to data artifacts.', s_body))

# ═══════════════════════════════════════════════════════════════
story.append(add_heading('2. Current State Assessment', s_h2, level=1))

story.append(Paragraph(
    'The swarm has reached v2.0 maturity with all core capabilities operational. The table below summarises the current implementation depth '
    'across all system components. Each capability has been developed to production-ready status with comprehensive API coverage, database '
    'persistence, and integration with the event bus and state machine.', s_body))

aw_table = A4[0] - 100
cap_table = make_table(
    ['Capability', 'Status', 'Key Implementation Details'],
    [
        ['PII Anonymiser', 'Production-ready', 'HMAC tokenisation, Fernet encryption, 7 PII rules, spaCy NER, free-text scanning'],
        ['EDI Auditor', 'Production-ready', '11 parametric queries, 5 domains, pluggable registry, EDI profile scanning'],
        ['Remediation Generator', 'Production-ready', 'Decision matrix, 3 execution modes, EDI profile updater'],
        ['MTTR Tracker (Go)', 'Production-ready', 'Buffered ingestion, P95 metrics, severity breakdown, 6 API endpoints'],
        ['Finding State Machine', 'Production-ready', '10 states, 20 transitions, guard conditions, timeout SLAs, audit trail'],
        ['Event Bus', 'Production-ready', 'DB-backed store, PG LISTEN/NOTIFY, background consumer loop'],
        ['Reaction Engine', 'Production-ready', '7 rules, toggle API, statistics, conditional execution'],
        ['API Gateway + Dashboard', 'Production-ready', '45 REST routes, 10-tab HTML dashboard, Python client SDK'],
        ['Next.js Frontend', 'Operational', 'React dashboard with 7 tabs, shadcn/ui, Prisma ORM, request tracing'],
        ['Correlated Tracing', 'Operational', 'Browser PerformanceObserver + server-side timing, waterfall views'],
        ['Composite Risk Scoring', 'Operational', 'Multi-factor risk model with configurable weights'],
        ['Knowledge Graph', 'Operational', 'Entity relationship mapping for compliance domain'],
        ['Satellite AIS Ingestion', 'Operational', 'Vessel position data integration pipeline'],
        ['Middleware Pipeline', 'Operational', 'Request tracing, timing injection, layer tracking'],
    ],
    col_widths=[aw_table*0.20, aw_table*0.16, aw_table*0.64]
)
story.append(cap_table)
story.append(Spacer(1, 12))

story.append(add_heading('2.1 Technical Debt and Known Gaps', s_h3, level=1))
story.append(Paragraph(
    'Despite the comprehensive capabilities, several areas of technical debt must be addressed before production deployment. First, there is no '
    'authentication or authorisation on the gateway — any network-accessible client can call apply-mode remediation endpoints. This is acceptable '
    'for development but must be addressed before production with API keys or JWT middleware. Second, CORS is set to wildcard, allowing any website '
    'to make requests to the gateway. Production must lock this to the specific frontend domain. Third, no rate limiting exists, meaning bulk '
    'manifest uploads could cause database write spikes. A token-bucket or sliding-window rate limiter should be added to the gateway middleware.',
    s_body))
story.append(Paragraph(
    'Additional gaps include: SQLite limitations in development (no native LISTEN/NOTIFY means the event bus falls back to in-process queuing), '
    'no end-to-end test suite (individual CLI tools have manual test paths but no automated integration test exercising the full finding lifecycle), '
    'the Prisma schema in the Next.js frontend is minimal and does not mirror the full Python SQLAlchemy schema, the Go MTTR service has no TLS '
    '(HTTP only, requiring a reverse proxy), and no configuration validation exists (invalid config may surface as runtime errors deep in the '
    'request path). These gaps form the basis of Phase 1 (Production Hardening) in the implementation workflow.', s_body))

# ═══════════════════════════════════════════════════════════════
story.append(add_heading('3. Strategic Evolution Roadmap', s_h2, level=1))

story.append(Paragraph(
    'The 6-horizon roadmap provides a structured path from the current v2.0 state to a fully autonomous, multi-tenant, ecosystem-grade '
    'compliance platform. Each horizon builds on the previous, with clear dependencies and measurable success metrics.', s_body))

story.append(add_heading('3.1 Horizon 1 — Hardening (0-3 months)', s_h3, level=1))
story.append(Paragraph(
    'The immediate priority is production readiness. This unglamorous but essential work enables everything else. Key items include gateway '
    'authentication (API key or JWT middleware with RBAC roles for viewer, analyst, and operator), rate limiting (token-bucket per client IP '
    'with per-endpoint configuration), CORS lockdown, TLS everywhere via Caddy reverse proxy, configuration validation using Pydantic BaseSettings '
    'with strict validation at startup, integration tests exercising the full finding lifecycle, structured JSON logging across all services, '
    'and health check deepening with liveness and readiness probes for Kubernetes readiness.', s_body))

story.append(add_heading('3.2 Horizon 2 — Intelligence Augmentation (3-6 months)', s_h3, level=1))
story.append(Paragraph(
    'With the foundation hardened, the next phase adds intelligence that reduces manual intervention. ML-based anomaly detection uses '
    'statistical baselines for EDI message volumes, PII density, and transmission patterns to detect drift before it becomes a violation. '
    'Context-aware risk scoring grades PII by re-identification difficulty and correlates weather context to adjust severity. Predictive MTTR uses '
    'regression-based estimation for new findings to enable proactive resource allocation. Automated compliance reports with scheduled PDF/HTML '
    'generation, closed-loop remediation with auto re-audit after remediation completion, and query registry maturity with versioning and rollback '
    'round out this horizon.', s_body))

story.append(add_heading('3.3 Horizon 3 — Data Source Expansion (6-12 months)', s_h3, level=1))
story.append(Paragraph(
    'The swarm currently focuses on EDI messages and manifests. The next frontier integrates the broader maritime data ecosystem: AIS data '
    'compliance (positional integrity, spoofing detection, reporting gaps), EU ETS carbon reporting (MRV data, carbon credits, registry verification), '
    'blockchain eBL integration (smart contract event monitoring for Bill of Lading integrity), IoT container sensors (MQTT broker integration '
    'for cold-chain temperature and shock detection), cross-DB federation (query across FMS, PCS, customs single-window, and AIS warehouse), '
    'and satellite imagery integration for weather event detection and automatic compliance hold triggers.', s_body))

horizon_table = make_table(
    ['Horizon', 'Timeline', 'Focus', 'Key Capabilities'],
    [
        ['H1: Hardening', '0-3 months', 'Production readiness', 'Auth, rate limiting, TLS, tests, logging'],
        ['H2: Intelligence', '3-6 months', 'ML-driven automation', 'Anomaly detection, predictive MTTR, auto reports'],
        ['H3: Data Sources', '6-12 months', 'Maritime data ecosystem', 'AIS, EU ETS, blockchain eBL, IoT, satellite'],
        ['H4: Geographic', '12-18 months', 'Multi-jurisdiction coverage', 'BRICS+ PII, Arctic profile, PostGIS, sanctions'],
        ['H5: Autonomous', '18-24 months', 'Self-healing compliance', 'Auto-remediate, learned decisions, NL interface'],
        ['H6: Ecosystem', '24-36 months', 'Industry standards', 'Open standards, multi-tenant, plugin marketplace'],
    ],
    col_widths=[aw_table*0.16, aw_table*0.14, aw_table*0.24, aw_table*0.46]
)
story.append(Spacer(1, 8))
story.append(horizon_table)
story.append(Spacer(1, 12))

story.append(add_heading('3.4 Horizon 4 — Geographic and Regulatory Expansion (12-18 months)', s_h3, level=1))
story.append(Paragraph(
    'Full multi-jurisdiction, multi-region compliance coverage. BRICS+ PII formats add locale-specific detection for China Resident ID '
    '(18-digit), India Aadhaar (12-digit), Brazil CPF (11-digit), and Russia INN (10/12-digit). The Arctic compliance profile extends SLAs, '
    'enables ice-route customs pre-clearance, and optimises EDI retry for satellite-only communications. PostGIS geo-fencing provides region-aware '
    'compliance rules based on vessel position, and multi-party orchestration handles cross-organisational compliance coordination across carriers, '
    'customs authorities, and port operators.', s_body))

story.append(add_heading('3.5 Horizon 5 — Autonomous Operations (18-24 months)', s_h3, level=1))
story.append(Paragraph(
    'The goal is self-healing compliance that reduces human intervention for routine findings. Auto-detect, auto-remediate, and auto-verify '
    'for low-risk findings with human approval workflow for medium-risk and full human-in-the-loop for high/critical findings. A learned decision '
    'matrix trains on historical finding-remediation-verification outcomes with A/B testing for remediation strategies. A natural language interface '
    'powered by LLM enables non-technical stakeholders to query compliance status using conversational language. A compliance digital twin '
    'provides real-time simulation of compliance posture under hypothetical scenarios for risk-free scenario planning.', s_body))

story.append(add_heading('3.6 Horizon 6 — Ecosystem and Standards (24-36 months)', s_h3, level=1))
story.append(Paragraph(
    'The final horizon transforms the swarm from a product into an industry ecosystem. Open standards publication submits the finding state machine '
    'specification, event bus schema, and compliance finding data model to maritime standards bodies (IMO, BIMCO). Multi-tenant SaaS provides '
    'tenant isolation, per-tenant configuration, and usage metering for commercial deployment. A plugin marketplace with SDK for third-party audit '
    'rules, reaction rules, and data source connectors enables community-driven capability expansion. A regulatory change feed monitors '
    'regulatory publications and uses NLP to detect changes, automatically suggesting compliance rule updates with human review workflows.', s_body))

# ═══════════════════════════════════════════════════════════════
story.append(add_heading('4. Risk Assessment', s_h2, level=1))

story.append(Paragraph(
    'A comprehensive risk assessment identifies technical, operational, and strategic risks across three dimensions. Technical risks include HMAC '
    'key compromise (mitigated by key management services and key versioning), event bus overflow under burst conditions (mitigated by back-pressure '
    'mechanisms and dead-letter queues), Go-Python bridge failure (mitigated by retry with exponential backoff), and spaCy model accuracy on '
    'maritime text (mitigated by custom training on maritime corpora with regex fallback).', s_body))

risk_table = make_table(
    ['Risk', 'Likelihood', 'Impact', 'Mitigation'],
    [
        ['HMAC key compromise', 'Low', 'Critical', 'Key management service, key versioning with grace period'],
        ['Event bus overflow', 'Medium', 'High', 'Back-pressure mechanism, dead-letter queue, persistent queuing'],
        ['Go-Python bridge failure', 'Medium', 'Medium', 'Retry with exponential backoff, local buffering in Go service'],
        ['Regulatory change breaking queries', 'High', 'Medium', 'Pluggable query registry with API-based updates'],
        ['Multi-jurisdiction conflict', 'Medium', 'High', 'Jurisdiction priority matrix with human escalation'],
        ['AI regulation affecting automation', 'Medium', 'Medium', 'Human-in-the-loop for apply-mode, full audit trail'],
        ['Climate change altering routes', 'High', 'Medium', 'Modular region profiles, configuration-driven rules'],
    ],
    col_widths=[aw_table*0.22, aw_table*0.12, aw_table*0.10, aw_table*0.56]
)
story.append(risk_table)
story.append(Spacer(1, 12))

story.append(Paragraph(
    'Operational risks include the high likelihood of regulatory changes breaking audit queries (mitigated by the pluggable query registry), '
    'multi-jurisdiction conflicts where GDPR and local law provide contradictory obligations (mitigated by a jurisdiction priority matrix with '
    'human escalation), and vendor lock-in to specific EDI standards (mitigated by an abstract EDI parsing layer with strategy pattern for '
    'standard-specific logic). Strategic risks include industry adoption of competing standards, AI regulation affecting automated compliance '
    'decisions, and climate change altering maritime routes and regulations requiring modular region profiles and configuration-driven rules.', s_body))

# ═══════════════════════════════════════════════════════════════
story.append(add_heading('5. Key Success Metrics', s_h2, level=1))

story.append(Paragraph(
    'The following metrics provide measurable targets for tracking the swarm evolution across all six horizons. Each metric has a current '
    'baseline, a 6-month target aligned with Horizons 1-2, and a 12-month target aligned with Horizons 3-4. The autonomous resolution rate '
    'metric is particularly significant as it directly measures the value of the intelligence and automation investments in Horizons 2 and 5.', s_body))

metrics_table = make_table(
    ['Metric', 'Current Baseline', '6-Month Target', '12-Month Target'],
    [
        ['CRITICAL MTTR (hours)', 'Manual tracking', '< 8 hours', '< 4 hours'],
        ['False-positive rate (weather)', 'Not measured', 'Baseline established', '< 15%'],
        ['Audit query coverage', '5 domains, 11 queries', '6 domains, 20+ queries', '8 domains, 40+ queries'],
        ['Data sources integrated', '2 (FMS, EDI profiles)', '4 (add AIS, PCS)', '7 (add blockchain, IoT, emissions)'],
        ['Jurisdiction-specific PII rules', '1 (generic)', '3 (add China, India)', '5+ (add Brazil, Korea, Russia)'],
        ['Autonomous resolution rate', '0%', '20%', '50%'],
        ['End-to-end test coverage', '0%', '60%', '85%'],
    ],
    col_widths=[aw_table*0.30, aw_table*0.22, aw_table*0.24, aw_table*0.24]
)
story.append(metrics_table)
story.append(Spacer(1, 12))

story.append(add_heading('6. Design Philosophy', s_h2, level=1))

story.append(add_heading('6.1 Correctness Over Speed', s_h3, level=1))
story.append(Paragraph(
    'The finding state machine with 10 states, 20 transitions, guard conditions, and audit trails was deliberately designed to prevent invalid '
    'state mutations. A simple status string field would have been faster to implement but would allow impossible transitions such as jumping from '
    'DETECTED directly to VERIFIED without triage or remediation. The formal state machine enforces that every finding follows a rigorous lifecycle, '
    'which is essential for regulatory auditability. Every transition is persisted with before/after state, trigger type, actor identity, context '
    'payload, and auto-escalation flag, creating an immutable record that regulators can inspect.', s_body))

story.append(add_heading('6.2 The Polyglot Boundary as a Feature', s_h3, level=1))
story.append(Paragraph(
    'The Python-to-Go bridge for MTTR tracking could have been implemented entirely in Python. However, the Go service provides independent '
    'scaling (MTTR events can spike without affecting the Python gateway), memory efficiency (goroutine model handles thousands of concurrent event '
    'writes with minimal memory), deployment flexibility (the Go binary can be deployed closer to event sources on edge nodes), and skill diversity '
    '(teams with Go expertise can own the telemetry layer independently). The explicit HTTP bridge with async POST and phase mapping makes the '
    'boundary visible and versionable rather than an implicit shared-library coupling that would be harder to maintain and evolve.', s_body))

story.append(add_heading('6.3 Event Sourcing as a Side Effect', s_h3, level=1))
story.append(Paragraph(
    'The event bus was not designed as a full event-sourcing system where state is rebuilt from events. Instead, it serves as a communication '
    'backbone with auditability as a side effect. Every event is persisted to the event_log table, creating an immutable log of everything that '
    'happened in the system, but the canonical state lives in the SQLAlchemy tables. This hybrid approach gives us the benefits of event-driven '
    'architecture (decoupling, extensibility) without the complexity of full event sourcing (snapshotting, projections, eventual consistency).', s_body))

# ═══════════════════════════════════════════════════════════════
# PART II: IMPLEMENTATION WORKFLOW
# ═══════════════════════════════════════════════════════════════

story.append(add_heading('Part II: Implementation Workflow', s_h1, level=0))
story.append(ColorBar(aw, 2, ACCENT))
story.append(Spacer(1, 12))

story.append(Paragraph(
    'The implementation workflow follows the 6-horizon roadmap with concrete tasks, deliverables, and quality gates for each phase. Each phase '
    'builds on the previous, with clear dependencies. Phase 1 is the non-negotiable foundation that enables all subsequent phases. Phase 2 can begin '
    'in parallel with late Phase 1 items (logging, config validation). Phases 3 and 4 can partially overlap once the data source abstraction layer '
    'is in place. The workflow includes cross-phase practices covering development workflow, commit conventions, and quality gates that apply to '
    'every phase.', s_body))

story.append(add_heading('7. Phase 1: Production Hardening (0-3 months)', s_h2, level=1))

story.append(Paragraph(
    'Phase 1 is the non-negotiable foundation. The goal is to make the swarm safe for production deployment behind a real domain with real data. '
    'This phase addresses the technical debt identified in the current state assessment and establishes the security, reliability, and operational '
    'practices that all subsequent phases depend on.', s_body))

phase1_table = make_table(
    ['Task', 'Description', 'Impact'],
    [
        ['Gateway Authentication', 'API key or JWT middleware; RBAC roles: viewer, analyst, operator', 'Unblocks production deployment'],
        ['Rate Limiting', 'Token-bucket per client IP; configurable per-endpoint limits', 'Prevents abuse and DB write spikes'],
        ['CORS and Security', 'Environment-specific origins; security headers (CSP, HSTS, X-Frame-Options)', 'Security baseline'],
        ['TLS and Deployment', 'Caddy reverse proxy for Python gateway and Go MTTR service', 'Encryption in transit'],
        ['Config Validation', 'Pydantic BaseSettings with strict startup validation', 'Fail-fast on misconfiguration'],
        ['Integration Tests', 'pytest full finding lifecycle tests; CI pipeline', 'Confidence in deployments'],
        ['Logging Standardisation', 'Structured JSON logging; correlation ID propagation', 'Observability foundation'],
        ['Health Check Deepening', 'Liveness/readiness probes; dependency health in /health', 'Kubernetes-ready'],
    ],
    col_widths=[aw_table*0.22, aw_table*0.52, aw_table*0.26]
)
story.append(phase1_table)
story.append(Spacer(1, 12))

story.append(add_heading('8. Phase 2: Intelligence Augmentation (3-6 months)', s_h2, level=1))
story.append(Paragraph(
    'With the foundation hardened, Phase 2 adds intelligence that reduces manual intervention. ML-based anomaly detection establishes statistical '
    'baselines for EDI message volumes per partner, PII density analysis per manifest type, and Z-score/IQR-based outlier detection with alert '
    'generation when metrics exceed 2 standard deviations. Context-aware risk scoring grades PII by re-identification difficulty, adjusts severity '
    'based on weather correlation, and applies jurisdiction-specific risk weightings. Predictive MTTR uses regression models with feature engineering '
    'on severity, category, jurisdiction, weather, and time-of-day to estimate resolution times for new findings and suggest resource allocation.', s_body))
story.append(Paragraph(
    'Additional Phase 2 capabilities include automated compliance reports with scheduled PDF/HTML generation and email webhook delivery, '
    'closed-loop remediation with automatic re-audit after remediation completion and escalation if violations persist, and query registry maturity '
    'with full CRUD API, query versioning with rollback, a testing sandbox for running queries against test data before activation, and '
    'import/export in JSON/YAML formats.', s_body))

story.append(add_heading('9. Phase 3: Data Source Expansion (6-12 months)', s_h2, level=1))
story.append(Paragraph(
    'Phase 3 integrates the broader maritime data ecosystem. AIS data compliance adds an NMEA 0183 message parser, positional integrity checks '
    '(impossible speed, position jumps), spoofing detection (flag mismatch, trajectory anomalies), and reporting gap detection. EU ETS carbon '
    'reporting introduces a new compliance domain for MRV data validation, carbon credit registry reconciliation, emissions threshold alerting, '
    'and EU ETS compliance report templates. Blockchain eBL integration monitors smart contract events for Bill of Lading integrity and '
    'chain-of-custody audit trails. IoT container sensors connect via MQTT broker for cold-chain temperature excursion and shock/tilt threshold '
    'monitoring. Cross-DB federation enables unified compliance queries across FMS, PCS, customs single-window, and AIS warehouses.', s_body))

story.append(add_heading('10. Phase 4: Geographic Expansion (12-18 months)', s_h2, level=1))
story.append(Paragraph(
    'Phase 4 achieves full multi-jurisdiction, multi-region compliance coverage. BRICS+ PII formats add locale-specific detection and masking for '
    'China Resident ID (18-digit), India Aadhaar (12-digit), Brazil CPF (11-digit), and Russia INN (10/12-digit). The Arctic compliance profile '
    'provides extended SLA configuration, ice-route customs pre-clearance workflows, and satellite-optimised EDI retry logic. PostGIS geo-fencing '
    'creates spatial compliance zones for Arctic routes, piracy high-risk areas, and EEZ boundaries with vessel position-based rule selection. '
    'Multi-party orchestration implements workflow engines for cross-organisational compliance coordination, and sanctions screening integrates '
    'real-time sanctions list checking for route deviation classification.', s_body))

story.append(add_heading('11. Phase 5: Autonomous Operations (18-24 months)', s_h2, level=1))
story.append(Paragraph(
    'Phase 5 achieves self-healing compliance. The system auto-detects, auto-remediates, and auto-verifies low-risk findings without human '
    'intervention, uses human approval workflows for medium-risk findings, and maintains full human-in-the-loop for high/critical findings. A '
    'learned decision matrix trains on historical finding-remediation-verification outcomes with A/B testing for remediation strategies and model '
    'performance monitoring. A natural language interface powered by LLM enables conversational compliance querying, text-to-SQL for ad-hoc reporting, '
    'and natural language remediation policy generation. A compliance digital twin provides real-time simulation of compliance posture under '
    'hypothetical scenarios including new regulations, route changes, and data source additions.', s_body))

story.append(add_heading('12. Phase 6: Ecosystem and Standards (24-36 months)', s_h2, level=1))
story.append(Paragraph(
    'The final phase transforms the swarm from a product into an industry ecosystem. Open standards publication submits the finding state machine '
    'specification, event bus schema, and compliance finding data model to IMO and BIMCO. Multi-tenant SaaS provides tenant isolation with database, '
    'configuration, and event separation, per-tenant compliance profiles, and usage metering for billing integration. A plugin marketplace with SDKs '
    'for third-party audit rules, reaction rules, and data source connectors enables community-driven capability expansion. A regulatory change feed '
    'monitors regulatory publications using NLP-based change detection and automatically suggests compliance rule updates with human review workflows.', s_body))

story.append(add_heading('13. Cross-Phase Practices', s_h2, level=1))

story.append(Paragraph(
    'Every phase follows a consistent development workflow: feature branch creation, code with tests, local validation, Docker build and verify, '
    'integration testing, conventional commit messages, pull request creation, CI pipeline execution (lint, unit test, integration test, build, '
    'security scan), code review, merge to main, and auto-deploy to staging with manual promotion to production. Commit messages follow the conventional '
    'commits format with prefixes: feat, fix, docs, refactor, test, chore, and security, each scoped to the relevant module.', s_body))

quality_table = make_table(
    ['Quality Gate', 'Requirement'],
    [
        ['Authentication', 'All new endpoints have authentication and rate limiting'],
        ['Database Safety', 'All new database operations use parameterised queries'],
        ['Event Coverage', 'All new event types have corresponding reaction rules documented'],
        ['State Machine', 'All new finding types have state machine coverage'],
        ['Anonymisation', 'All new data sources have anonymisation policies'],
        ['Testing', 'Integration test covers the new capability end-to-end'],
        ['Documentation', 'SKILLS.md, README.md, and API docs updated'],
        ['Regression', 'No regressions in existing test suite'],
    ],
    col_widths=[aw_table*0.28, aw_table*0.72]
)
story.append(quality_table)
story.append(Spacer(1, 12))

story.append(Paragraph(
    'Quality gates apply to every phase and every pull request. These non-negotiable checks ensure that each addition maintains the security, '
    'auditability, and reliability standards established in Phase 1. The dependency chain is clear: Phase 1 enables Phase 2 (needs auth, logging, tests), '
    'Phase 2 enables Phase 3 (needs anomaly detection baseline), Phase 3 enables Phase 4 (needs data source federation), Phase 4 enables Phase 5 '
    '(needs ML models and multi-jurisdiction coverage), and Phase 5 enables Phase 6 (needs a mature, battle-tested platform). Each phase builds on the '
    'previous, creating a compounding effect where early investments in hardening and intelligence pay dividends across all subsequent horizons.', s_body))

# ═══════════════════════════════════════════════════════════════
# BUILD BODY PDF
# ═══════════════════════════════════════════════════════════════

doc = TocDocTemplate(
    output_body,
    pagesize=A4,
    leftMargin=50, rightMargin=50,
    topMargin=50, bottomMargin=50,
    title='Maritime Compliance Swarm: Strategic Thoughts and Implementation Workflow',
    author='Z.ai',
    subject='Strategic analysis and phased implementation roadmap for the Maritime Global Compliance Swarm'
)

frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id='normal')

def page_footer(canvas, doc):
    canvas.saveState()
    canvas.setFont('NotoSerifSC', 8)
    canvas.setFillColor(TEXT_MUTED)
    canvas.drawString(50, 25, 'Maritime Global Compliance Swarm — Strategic Thoughts and Workflow')
    canvas.drawRightString(A4[0] - 50, 25, f'Page {doc.page}')
    canvas.setStrokeColor(BORDER)
    canvas.setLineWidth(0.5)
    canvas.line(50, 38, A4[0] - 50, 38)
    canvas.restoreState()

template = PageTemplate(id='body', frames=[frame], onPage=page_footer)
doc.addPageTemplates([template])

doc.multiBuild(story)
print(f'Body PDF generated: {output_body}')

# ═══════════════════════════════════════════════════════════════
# GENERATE COVER HTML
# ═══════════════════════════════════════════════════════════════

cover_html = '''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;900&family=Playfair+Display:wght@400;700;900&display=swap');

@page { size: 794px 1123px; margin: 0; }
html, body { margin: 0; padding: 0; width: 794px; height: 1123px; background: #3d5a6e; font-family: 'Inter', sans-serif; }

.cover-layer-1 {
  position: absolute; inset: 0; overflow: hidden; z-index: 1;
}
.cover-layer-2 {
  position: absolute; inset: 0; z-index: 2;
}
.cover-layer-3 {
  position: absolute; inset: 0; z-index: 3; padding: 0 60px;
}

.bg-block {
  position: absolute; background: #4a6575; border-radius: 4px;
}
.bg-block-1 { width: 400px; height: 500px; top: -80px; right: -100px; transform: rotate(-12deg); opacity: 0.3; }
.bg-block-2 { width: 300px; height: 300px; bottom: 60px; left: -80px; transform: rotate(8deg); opacity: 0.15; }
.bg-block-3 { width: 200px; height: 200px; top: 40%; right: 60px; transform: rotate(-5deg); opacity: 0.1; background: #2f97b9; }

.divider-line {
  position: absolute; left: 60px; width: 80px; height: 3px; background: #2f97b9; top: 52%;
}

.kicker {
  position: absolute; top: 28%; left: 60px;
  font-size: 13pt; font-weight: 400; letter-spacing: 3pt; text-transform: uppercase;
  color: rgba(255,255,255,0.6); line-height: 1.4;
}

.hero-title {
  position: absolute; top: 34%; left: 60px; width: 600px;
  font-family: 'Playfair Display', serif; font-size: 38pt; font-weight: 900;
  color: rgba(255,255,255,1); line-height: 1.15;
}

.summary {
  position: absolute; top: 56%; left: 60px; width: 500px;
  font-size: 13pt; font-weight: 300; color: rgba(255,255,255,0.75); line-height: 1.7;
}

.meta {
  position: absolute; bottom: 80px; left: 60px;
  font-size: 11pt; font-weight: 400; color: rgba(255,255,255,0.5);
}

.footer-line {
  position: absolute; bottom: 55px; left: 60px; width: 674px; height: 1px;
  background: rgba(255,255,255,0.15);
}
.footer-text {
  position: absolute; bottom: 35px; left: 60px;
  font-size: 9pt; font-weight: 300; letter-spacing: 2pt; text-transform: uppercase;
  color: rgba(255,255,255,0.35);
}
</style>
</head>
<body>
<div class="cover-layer-1">
  <div class="bg-block bg-block-1"></div>
  <div class="bg-block bg-block-2"></div>
  <div class="bg-block bg-block-3"></div>
</div>
<div class="cover-layer-2">
  <div class="divider-line"></div>
  <div class="footer-line"></div>
</div>
<div class="cover-layer-3">
  <div class="kicker">Strategic Analysis and Implementation Roadmap</div>
  <div class="hero-title">Maritime Global<br>Compliance Swarm</div>
  <div class="summary">
    Autonomous regulatory compliance agent swarm for global maritime freight.
    Architectural reflections, design rationale, and a 6-horizon evolution
    strategy from production hardening to industry ecosystem.
  </div>
  <div class="meta">July 2025</div>
  <div class="footer-text">Z.ai</div>
</div>
</body>
</html>'''

cover_path = '/home/z/my-project/download/_cover_strategic.html'
with open(cover_path, 'w') as f:
    f.write(cover_html)

print(f'Cover HTML generated: {cover_path}')

# ═══════════════════════════════════════════════════════════════
# MERGE COVER + BODY
# ═══════════════════════════════════════════════════════════════

subprocess.run([
    'node', os.path.join(PDF_SKILL_DIR, 'scripts/html2poster.js'),
    cover_path, '--output', output_cover, '--width', '794px'
], check=True, capture_output=True, text=True)
print(f'Cover PDF generated: {output_cover}')

writer = PdfWriter()
reader_cover = PdfReader(output_cover)
reader_body = PdfReader(output_body)

for page in reader_cover.pages:
    writer.add_page(page)
for page in reader_body.pages:
    writer.add_page(page)

with open(output_final, 'wb') as f:
    writer.write(f)

print(f'Final PDF merged: {output_final}')

# Cleanup temp files
for f in [output_body, output_cover, cover_path]:
    if os.path.exists(f):
        os.remove(f)

print('Done!')
