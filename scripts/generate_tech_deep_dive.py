#!/usr/bin/env python3
"""
Generate Maritime Compliance Technology Evolution Deep Dive PDF (Phase 3)
ReportLab pipeline: Cover (HTML/Playwright) + Body (ReportLab) + Merge (pypdf)
"""

import os
import sys
import hashlib

import subprocess

# ━━ Paths ━━
PDF_SKILL_DIR = "/home/z/my-project/skills/pdf"
OUTPUT_DIR = "/home/z/my-project/download"
PROJECT_DOCS = "/home/z/my-project/maritime-global-compliance-swarm/docs"
os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(PROJECT_DOCS, exist_ok=True)

OUTPUT_BODY = os.path.join(OUTPUT_DIR, "tech_deep_dive_body.pdf")
OUTPUT_COVER = os.path.join(OUTPUT_DIR, "tech_deep_dive_cover.pdf")
OUTPUT_FINAL = os.path.join(OUTPUT_DIR, "Maritime_Compliance_Technology_Deep_Dive_2025-2035.pdf")

# ━━ Cascade Palette ━━
from reportlab.lib import colors

PAGE_BG       = colors.HexColor('#f5f5f6')
SECTION_BG    = colors.HexColor('#ebeded')
CARD_BG       = colors.HexColor('#e5e7e8')
TABLE_STRIPE  = colors.HexColor('#f1f2f3')
HEADER_FILL   = colors.HexColor('#476b7d')
COVER_BLOCK   = colors.HexColor('#48575f')
BORDER        = colors.HexColor('#c3d0d6')
ICON          = colors.HexColor('#497388')
ACCENT        = colors.HexColor('#238ec3')
ACCENT_2      = colors.HexColor('#bb5a3a')
TEXT_PRIMARY   = colors.HexColor('#222526')
TEXT_MUTED     = colors.HexColor('#6e7477')
SEM_SUCCESS   = colors.HexColor('#528b65')
SEM_WARNING   = colors.HexColor('#977f50')
SEM_ERROR     = colors.HexColor('#95524c')
SEM_INFO      = colors.HexColor('#52779c')

# ━━ Font Registration ━━
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.fonts import addMapping

pdfmetrics.registerFont(TTFont('NotoSans', '/usr/share/fonts/truetype/chinese/LiberationSans-Regular.ttf'))
pdfmetrics.registerFont(TTFont('NotoSansB', '/usr/share/fonts/truetype/english/Carlito-Bold.ttf'))
pdfmetrics.registerFont(TTFont('FreeSerif', '/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf'))
pdfmetrics.registerFont(TTFont('FreeSerifB', '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf'))
pdfmetrics.registerFont(TTFont('FreeSerifI', '/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf'))
pdfmetrics.registerFont(TTFont('DejaVuSans', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'))

addMapping('NotoSans', 0, 0, 'NotoSans')
addMapping('NotoSans', 1, 0, 'NotoSansB')
addMapping('FreeSerif', 0, 0, 'FreeSerif')
addMapping('FreeSerif', 1, 0, 'FreeSerifB')
addMapping('FreeSerif', 0, 1, 'FreeSerifI')

from reportlab.pdfbase.pdfmetrics import registerFontFamily
registerFontFamily('NotoSans', normal='NotoSans', bold='NotoSansB')
registerFontFamily('FreeSerif', normal='FreeSerif', bold='FreeSerifB', italic='FreeSerifI')

# ━━ Install fallback to prevent Helvetica garbling ━━
from reportlab.pdfbase.pdfmetrics import _fonts
if 'Helvetica' not in _fonts:
    pdfmetrics.registerFont(TTFont('Helvetica', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'))

# ━━ Styles ━━
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY

PAGE_W, PAGE_H = A4
MARGIN = 60
CONTENT_W = PAGE_W - 2 * MARGIN

s_h1 = ParagraphStyle('H1', fontName='FreeSerifB', fontSize=26, leading=32, textColor=TEXT_PRIMARY, spaceAfter=12, spaceBefore=24)
s_h2 = ParagraphStyle('H2', fontName='FreeSerifB', fontSize=17, leading=22, textColor=HEADER_FILL, spaceAfter=8, spaceBefore=18)
s_h3 = ParagraphStyle('H3', fontName='FreeSerifB', fontSize=13, leading=17, textColor=ICON, spaceAfter=6, spaceBefore=12)
s_body = ParagraphStyle('Body', fontName='FreeSerif', fontSize=10.5, leading=16, textColor=TEXT_PRIMARY, alignment=TA_JUSTIFY, spaceAfter=8, firstLineIndent=0)
s_body_indent = ParagraphStyle('BodyIndent', fontName='FreeSerif', fontSize=10.5, leading=16, textColor=TEXT_PRIMARY, alignment=TA_JUSTIFY, spaceAfter=8, leftIndent=20)
s_bullet = ParagraphStyle('Bullet', fontName='FreeSerif', fontSize=10.5, leading=16, textColor=TEXT_PRIMARY, alignment=TA_LEFT, spaceAfter=4, leftIndent=28, bulletIndent=14)
s_caption = ParagraphStyle('Caption', fontName='FreeSerifI', fontSize=9, leading=12, textColor=TEXT_MUTED, alignment=TA_CENTER, spaceAfter=12, spaceBefore=4)
s_kicker = ParagraphStyle('Kicker', fontName='FreeSerif', fontSize=9, leading=12, textColor=TEXT_MUTED, alignment=TA_LEFT, spaceAfter=4)
s_callout_label = ParagraphStyle('CalloutLabel', fontName='FreeSerif', fontSize=9, leading=12, textColor=TEXT_MUTED, alignment=TA_CENTER)
s_callout_val = ParagraphStyle('CalloutVal', fontName='FreeSerifB', fontSize=20, leading=24, textColor=ACCENT, alignment=TA_CENTER)
s_toc0 = ParagraphStyle('TOC0', fontName='FreeSerifB', fontSize=12, leading=20, textColor=TEXT_PRIMARY, leftIndent=0, spaceBefore=6)
s_toc1 = ParagraphStyle('TOC1', fontName='FreeSerif', fontSize=10.5, leading=16, textColor=TEXT_MUTED, leftIndent=20, spaceBefore=2)

# ━━ TOC support ━━
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, PageBreak,
                                 Table, TableStyle, KeepTogether, HRFlowable, CondPageBreak)
from reportlab.platypus.tableofcontents import TableOfContents

class TocDocTemplate(SimpleDocTemplate):
    def afterFlowable(self, flowable):
        if hasattr(flowable, 'bookmark_name'):
            level = getattr(flowable, 'bookmark_level', 0)
            text = getattr(flowable, 'bookmark_text', '')
            key = getattr(flowable, 'bookmark_key', '')
            self.notify('TOCEntry', (level, text, self.page, key))

heading_counter = {0: 0}

def add_heading(text, style, level=0):
    if level == 0:
        heading_counter[0] += 1
    key = f'h_{hashlib.md5(text.encode()).hexdigest()[:8]}'
    p = Paragraph(f'<a name="{key}"/>{text}', style)
    p.bookmark_name = key
    p.bookmark_level = level
    p.bookmark_text = text
    p.bookmark_key = key
    return p

# ━━ Helpers ━━
def make_table(headers, rows, col_widths=None):
    if col_widths is None:
        n = len(headers)
        col_widths = [CONTENT_W / n] * n
    header_para = [Paragraph(f'<b>{h}</b>', ParagraphStyle('TH', fontName='FreeSerifB', fontSize=9.5, leading=13, textColor=colors.white)) for h in headers]
    data = [header_para]
    for row in rows:
        data.append([Paragraph(str(c), ParagraphStyle('TD', fontName='FreeSerif', fontSize=9.5, leading=13, textColor=TEXT_PRIMARY)) for c in row])
    t = Table(data, colWidths=col_widths, hAlign='CENTER')
    style_cmds = [
        ('BACKGROUND', (0, 0), (-1, 0), HEADER_FILL),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('BOX', (0, 0), (-1, -1), 0.5, BORDER),
        ('INNERGRID', (0, 0), (-1, -1), 0.25, BORDER),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ]
    for i in range(1, len(data)):
        bg = colors.white if i % 2 == 1 else TABLE_STRIPE
        style_cmds.append(('BACKGROUND', (0, i), (-1, i), bg))
    t.setStyle(TableStyle(style_cmds))
    return t

def callout_box(value, label):
    data = [[Paragraph(f'<b>{value}</b>', s_callout_val)], [Paragraph(label, s_callout_label)]]
    t = Table(data, colWidths=[120], hAlign='CENTER')
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), CARD_BG),
        ('BOX', (0, 0), (-1, -1), 1, ACCENT),
        ('TOPPADDING', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    return t

def body(text):
    return Paragraph(text, s_body)

def bullet(text):
    return Paragraph(f'<bullet>•</bullet> {text}', s_bullet)

def divider():
    return HRFlowable(width='100%', thickness=0.5, color=BORDER, spaceAfter=6, spaceBefore=6)

# ━━ Build Story ━━
story = []

# TOC
toc = TableOfContents()
toc.levelStyles = [s_toc0, s_toc1]
story.append(toc)
story.append(PageBreak())

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Chapter 1: The Shifting Technology Landscape
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
story.append(add_heading('1. The Shifting Technology Landscape', s_h1, level=0))

story.append(body(
    'The maritime compliance domain stands at a convergence point where regulatory pressure, technological maturity, and data proliferation are simultaneously accelerating. Over the next decade, the technologies underpinning compliance systems will undergo fundamental transformation. What today operates as a Python-and-Go microservice architecture with an in-memory event bus will evolve into a distributed, AI-augmented, satellite-fed autonomous governance platform. This chapter examines the three foundational technology shifts that will drive this evolution: event sourcing and CQRS for immutable compliance records, artificial intelligence for regulatory intelligence, and quantum-resistant cryptography for long-lived maritime data protection.'
))

# Callout row
story.append(Spacer(1, 8))
callout_data = [
    [callout_box('6', 'Evolution Horizons'), callout_box('10+', 'Data Repositories'), callout_box('3', 'Satellite Modalities')]
]
ct = Table(callout_data, colWidths=[CONTENT_W/3]*3, hAlign='CENTER')
ct.setStyle(TableStyle([
    ('ALIGN', (0,0), (-1,-1), 'CENTER'),
    ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ('TOPPADDING', (0,0), (-1,-1), 4),
    ('BOTTOMPADDING', (0,0), (-1,-1), 4),
]))
story.append(ct)
story.append(Spacer(1, 8))

# 1.1
story.append(add_heading('1.1 Event Sourcing and CQRS: Immutable Compliance', s_h2, level=1))

story.append(body(
    'Event sourcing represents a paradigm shift from the current mutable-state database architecture to an immutable, append-only event store where every compliance action is recorded as a discrete event. In the current Maritime Compliance Swarm v3.1, the event_log table serves as a rudimentary event store, but it lacks the temporal query capabilities, event replay, and separated read models that a full event-sourced architecture provides. The transition to event sourcing is targeted for Horizon 4 (2029-2031) and will fundamentally transform how compliance investigations are conducted.'
))

story.append(body(
    'Under event sourcing, every state change in the compliance lifecycle becomes an immutable event: a finding is created, a PII field is tokenised, an EDI audit query detects a violation, a state machine transition fires, a remediation policy is generated, and an MTTR telemetry point is recorded. Each event carries a timestamp, correlation ID, actor, and full payload. The current state of any entity (a finding, a policy, a manifest) is derived by replaying its event history from the beginning. This means that at any point in time, auditors can reconstruct exactly what the system knew and what decisions it made, which is invaluable for regulatory investigations that often require explaining compliance decisions made months or years earlier.'
))

story.append(body(
    'The CQRS (Command Query Responsibility Segregation) pattern complements event sourcing by separating the write model (commands that produce events) from the read model (query-optimised views). In practice, this means the compliance dashboard can maintain denormalised, pre-computed views for fast querying (such as "show all CRITICAL findings from the last 30 days grouped by jurisdiction") without impacting the write path. The current system already shows early signs of this pattern: the MTTR tracker in Go maintains its own read model of finding lifecycles, while the Python gateway serves real-time queries. Formalising this separation will enable independent scaling of read and write paths, which is critical as data volumes grow from thousands to millions of events per day.'
))

story.append(body(
    'The practical impact for maritime compliance is profound. When a regulator requests evidence of compliance actions taken for a specific vessel over a specific period, the system can replay the exact sequence of events, including the risk scores computed, the jurisdiction-specific rules applied, the remediation actions taken, and the verification outcomes. This level of auditability goes far beyond what traditional CRUD-based compliance systems can provide. Combined with the 10-state finding state machine, event sourcing creates a complete, tamper-evident compliance narrative that satisfies the most stringent regulatory requirements, including GDPR Article 30 (records of processing activities) and the forthcoming EU ETS maritime monitoring requirements.'
))

# 1.2
story.append(add_heading('1.2 AI/ML-Driven Regulatory Intelligence', s_h2, level=1))

story.append(body(
    'Artificial intelligence and machine learning will transform maritime compliance from a reactive, audit-driven model to a proactive, prediction-driven model. The current system detects violations after they occur through 11 parametric SQL queries and PII scanning rules. By Horizon 4 (2029-2031), ML models trained on the event-sourced history of the compliance swarm will predict violations before they occur, enabling preventive compliance that reduces finding volume by an estimated 30 percent or more.'
))

story.append(body(
    'The ML evolution follows a clear maturity progression. In Horizon 2 (2026-2027), statistical anomaly detection establishes baseline distributions for EDI transmission patterns, PII exposure rates, and remediation completion times. Outliers from these baselines trigger proactive investigations before they become formal findings. For example, if a shipping partner historically encrypts 98 percent of EDI transmissions but drops to 85 percent over two weeks, the anomaly detector flags this trend for review before any unencrypted transmission reaches a sensitive jurisdiction. This phase requires no deep learning; statistical methods (z-score analysis, exponential moving averages, isolation forests) provide sufficient detection capability while maintaining explainability.'
))

story.append(body(
    'By Horizon 3 (2027-2029), the system advances to learned decision matrices where historical finding-remediation-verification outcomes train models that improve remediation accuracy over time. The current remediation generator uses a static 7-route decision matrix mapping risk categories to masking actions. The learned version incorporates success rates, time-to-verification, regression frequency, and jurisdiction-specific effectiveness to recommend the optimal remediation strategy for each new finding. A reinforcement learning agent (Horizon 6, 2033-2035) will further optimise this by treating remediation as a sequential decision problem, balancing MTTR minimisation against first-pass verification rate.'
))

story.append(body(
    'Natural language processing for regulatory monitoring represents another critical AI capability. Regulatory bodies worldwide continuously publish new guidance, amended articles, and enforcement actions. The current system requires manual updates to audit queries and risk scoring weights when regulations change. An LLM-based regulatory monitoring system (Horizon 4) will continuously ingest regulatory publications from the EU Official Journal, US Federal Register, Brazilian DOU, Singapore Gazette, and Korean MOJ notices, automatically assess their impact on the compliance swarm configuration, and generate recommended changes to audit queries, risk weights, and SLA timeouts. This capability is essential for maintaining compliance across five jurisdictions as regulations evolve at an accelerating pace.'
))

# AI evolution table
story.append(Spacer(1, 6))
story.append(make_table(
    ['Horizon', 'AI Capability', 'Method', 'Compliance Impact'],
    [
        ['H2 (2026-2027)', 'Anomaly Detection', 'Statistical baselines, isolation forests', 'Proactive finding detection before violations occur'],
        ['H3 (2027-2029)', 'Learned Remediation', 'Historical outcome-based model training', 'Continuously improving remediation accuracy and MTTR'],
        ['H4 (2029-2031)', 'Violation Prediction', 'Event-sourced history, classification models', '30%+ findings predicted before occurrence'],
        ['H4 (2029-2031)', 'NLP Regulatory Monitor', 'LLM-based publication analysis', 'Real-time regulatory change impact assessment'],
        ['H6 (2033-2035)', 'RL Remediation Agent', 'Sequential decision, reward optimisation', 'Minimise MTTR while maximising first-pass verification'],
    ],
    [CONTENT_W*0.14, CONTENT_W*0.18, CONTENT_W*0.32, CONTENT_W*0.36]
))
story.append(Paragraph('Table 1: AI/ML capability evolution across the six horizons', s_caption))

# 1.3
story.append(add_heading('1.3 Quantum-Resistant Cryptography for Maritime Data', s_h2, level=1))

story.append(body(
    'Maritime compliance records have exceptionally long retention requirements. Bills of Lading, customs declarations, and PII tokenisation records must often be maintained for 7 to 10 years for regulatory compliance, while some jurisdictions require 20-year retention for certain maritime safety records. This long retention horizon creates a unique vulnerability: data encrypted today using classical algorithms (RSA-2048, AES-128, HMAC-SHA256) may become readable by quantum computers within the retention period. NIST finalised its post-quantum cryptography (PQC) standards in 2024 (FIPS 203, 204, 205), making this a timely concern for maritime compliance systems.'
))

story.append(body(
    'The current system uses HMAC-SHA256 for deterministic PII tokenisation and Fernet (AES-128-CBC + HMAC-SHA256) for reversible pseudonymisation. Both are considered secure against classical attacks but vulnerable to future quantum adversaries using Grover algorithm (which provides quadratic speedup for key search) and, in the case of RSA-based components, Shor algorithm (which provides exponential speedup for integer factorisation). The migration strategy adopts a hybrid approach: classical and PQC algorithms operate in parallel during the transition period, ensuring backward compatibility while providing quantum resistance. Specifically, ML-KEM (Module-Lattice-Based Key-Encapsulation Mechanism, FIPS 203) replaces the key exchange layer, while ML-DSA (Module-Lattice-Based Digital Signature Algorithm, FIPS 204) provides quantum-resistant digital signatures for audit trail integrity.'
))

story.append(body(
    'The implementation timeline aligns with Horizon 6 (2033-2035), when quantum computing capability is projected to reach levels that threaten classical maritime encryption. The hybrid approach means existing HMAC tokens remain valid (backward compatibility for cross-referencing), while new tokenisation operations use a combined classical-plus-PQC scheme. This is critical for the deterministic tokenisation model: rotating the HMAC key invalidates every existing token, so the transition must be managed as a dual-key period where both old and new tokens are accepted during a migration window. The compliance knowledge graph will need to track which encryption scheme protects each data element, enabling jurisdiction-aware cryptographic enforcement (GDPR may mandate PQC earlier than other jurisdictions).'
))

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Chapter 2: Data Repository Evolution
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
story.append(add_heading('2. Data Repository Evolution', s_h1, level=0))

story.append(body(
    'The Maritime Compliance Swarm currently operates against a single data source: the Freight Management System (FMS) accessed via direct SQLAlchemy database connection. Over the next decade, the system must integrate with more than ten distinct data repositories spanning port community systems, satellite feeds, blockchain networks, IoT sensor streams, and government customs platforms. This chapter traces the evolution from single-database auditing to federated, cross-repository compliance intelligence.'
))

# 2.1
story.append(add_heading('2.1 From Freight Management Systems to Federated Data Lakes', s_h2, level=1))

story.append(body(
    'The current architecture treats the FMS as the single source of truth for compliance data. The EDI auditor runs 11 SQL queries against FMS tables to detect encryption violations, missing customs documentation, expired certificates, and data retention breaches. The anonymiser reads manifest data from FMS to detect and tokenise PII fields. This single-database model is sufficient for the current deployment but creates a fundamental limitation: compliance visibility is restricted to data that has already entered the FMS. If a shipping partner transmits an unencrypted EDI message that fails before reaching the FMS, the auditor never sees it. If a port community system records a customs clearance that contradicts the FMS records, the discrepancy goes undetected.'
))

story.append(body(
    'The evolution to federated data follows three phases. In Horizon 1 (2025-2026), PostgreSQL with PostGIS replaces SQLite as the primary database, and the satellite AIS pipeline (Kafka + PostGIS) is established as a second data repository. The compliance swarm gains spatial awareness: vessel positions, route trajectories, and port proximity become queryable alongside traditional FMS data. In Horizon 2 (2026-2027), cross-database federation enables queries that span FMS, Port Community Systems (PCS), Single-Window Customs platforms, and the AIS warehouse. A single compliance audit can now check whether a vessel declared route matches its actual AIS track, whether customs filings match PCS records, and whether EDI transmissions to all partners meet encryption standards.'
))

story.append(body(
    'By Horizon 5 (2031-2033), the system reaches full ecosystem integration where blockchain electronic Bills of Lading (eBL) provide immutable chain-of-custody verification, and IoT MQTT streams deliver real-time container sensor data (temperature, shock, humidity) for cold-chain and hazardous materials compliance. The compliance swarm becomes an intelligent data fabric that correlates events across all repositories in real-time, maintaining a unified compliance posture that no single data source could provide independently. The knowledge graph, which currently operates as an in-memory adjacency list, migrates to Neo4j or Amazon Neptune to handle the complexity of cross-repository relationship traversal at scale.'
))

# Data repository evolution table
story.append(Spacer(1, 6))
story.append(make_table(
    ['Data Repository', 'Protocol', 'Integration Horizon', 'Compliance Value'],
    [
        ['Freight Management System', 'Direct DB (SQLAlchemy)', 'Current', 'Core compliance data, EDI records, manifests'],
        ['Port Community Systems', 'REST API + webhooks', 'H1 (2025-2026)', 'Customs pre-clearance, port fee compliance'],
        ['Single-Window Customs', 'EDIFACT CUSCAR/CUSRES', 'H1 (2025-2026)', 'Real-time customs filing verification'],
        ['Satellite AIS Feeds', 'Kafka / UDP stream', 'H1 (2025-2026)', 'Vessel tracking, route deviation, positional integrity'],
        ['Emissions Monitoring', 'MRV data API', 'H1 (2025-2026)', 'EU ETS, IMO DCS carbon reporting'],
        ['Terminal Operating System', 'EDIFACT COPARN/COARRI', 'H2 (2026-2027)', 'Container movement, storage deadline compliance'],
        ['Crew Management System', 'REST API + SSO', 'H2 (2026-2027)', 'Crew privacy, MLC 2006 compliance'],
        ['SAR Satellite Imagery', 'Imagery pipeline', 'H4 (2029-2031)', 'AIS spoofing detection, dark ship identification'],
        ['Optical Satellite', 'Imagery pipeline', 'H4 (2029-2031)', 'Port operation verification, environmental violation'],
        ['Blockchain eBL', 'Smart contract events', 'H5 (2031-2033)', 'Bill of Lading integrity, chain-of-custody'],
        ['IoT Container Sensors', 'MQTT broker', 'H5 (2031-2033)', 'Cold-chain temperature, shock detection compliance'],
    ],
    [CONTENT_W*0.22, CONTENT_W*0.18, CONTENT_W*0.18, CONTENT_W*0.42]
))
story.append(Paragraph('Table 2: Data repository integration map across evolution horizons', s_caption))

# 2.2
story.append(add_heading('2.2 Satellite AIS and Spatial Data at Scale', s_h2, level=1))

story.append(body(
    'Satellite-based Automatic Identification System (AIS) data represents a transformative data source for maritime compliance. Unlike terrestrial AIS receivers that cover only coastal waters (typically within 40-60 nautical miles), satellite AIS provides global coverage including open ocean transits, polar routes, and remote anchorages where compliance violations are most likely to occur undetected. The current satellite_ingest.py module provides the foundational framework, but the full pipeline requires substantial infrastructure investment.'
))

story.append(body(
    'The target architecture processes AIS messages through a multi-stage pipeline. Raw AIS messages arrive via UDP stream or REST API from satellite providers (exactEarth, Spire, ORBCOMM) at rates of 1-10 million messages per day for a mid-size shipping company. These messages are ingested into Apache Kafka for high-throughput, fault-tolerant buffering, then processed by stream consumers that decode the NMEA payload, extract position vectors (MMSI, latitude, longitude, heading, speed, timestamp), and write to PostgreSQL with PostGIS for spatial indexing. The PostGIS extension enables spatial queries that are impossible with traditional relational databases: detecting when a vessel enters an exclusion zone, computing the great-circle distance between actual and declared routes, and identifying AIS gap patterns that indicate potential signal manipulation.'
))

story.append(body(
    'The compliance use cases for satellite AIS data are extensive and directly address regulatory requirements. Route deviation detection compares a vessel declared voyage plan (from the FMS) against its actual AIS track, flagging deviations exceeding configurable thresholds (e.g., 50 nautical miles from the declared route). This is relevant for sanctions compliance (ensuring vessels do not call at prohibited ports), customs compliance (verifying port of call sequences match declared itineraries), and environmental compliance (detecting when vessels take shortcuts through protected marine areas). AIS gap detection identifies periods where a vessel stops broadcasting its position, which may indicate intentional signal suppression for illicit activities. Positional integrity verification cross-references AIS-reported positions with satellite imagery to detect AIS spoofing, where a vessel broadcasts false position data to disguise its actual location.'
))

# 2.3
story.append(add_heading('2.3 Blockchain eBL and IoT Streaming Compliance', s_h2, level=1))

story.append(body(
    'Blockchain-based electronic Bills of Lading and IoT sensor networks represent the most transformative data sources on the long-term horizon. Blockchain eBL (targeting Horizon 5, 2031-2033) replaces the paper-based Bill of Lading, a document that has been the cornerstone of international trade for centuries, with an immutable, digitally transferable smart contract. For compliance, this means the chain of custody for every shipment becomes cryptographically verifiable at every handoff point: shipper to carrier, carrier to terminal, terminal to consignee. The compliance swarm will monitor smart contract events to verify that each transfer includes the required compliance checks ( customs pre-clearance confirmation, PII anonymisation attestation, EDI encryption verification).'
))

story.append(body(
    'IoT container sensors streaming via MQTT (also Horizon 5) enable continuous compliance monitoring for temperature-sensitive and hazardous cargo. The current system has no visibility into container conditions during transit; it can only audit manifest data after the fact. With IoT integration, the compliance swarm receives real-time temperature, humidity, shock, and door-opening events from container sensors, enabling immediate detection of cold-chain breaches (critical for pharmaceutical and food cargo under GDP and FSMA regulations) and handling incidents (relevant for IMDG Code compliance for dangerous goods). The event bus gains new event types (TEMPERATURE_BREACH, SHOCK_EXCEEDED, DOOR_ANOMALY) that trigger the reaction engine to generate findings, notify relevant parties, and adjust MTTR calculations to exclude sensor-grace periods.'
))

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Chapter 3: Satellite and Vision Integration
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
story.append(add_heading('3. Satellite and Vision Integration', s_h1, level=0))

story.append(body(
    'Beyond AIS data, satellite-based Earth observation provides an entirely new modality for compliance verification: visual and radar-based evidence that operates independently of any data voluntarily reported by shipping entities. This chapter examines the three satellite and vision capabilities that will transform maritime compliance from a data-processing discipline into a multi-modal intelligence operation.'
))

# 3.1
story.append(add_heading('3.1 Satellite AIS for Vessel Tracking Compliance', s_h2, level=1))

story.append(body(
    'Satellite AIS reception has evolved dramatically over the past decade. Modern satellites (exactEarth, Spire, ORBCOMM) carry dedicated AIS receivers capable of decoding signals from thousands of vessels simultaneously, with global revisit times as short as 15 minutes for dense satellite constellations. For the Maritime Compliance Swarm, satellite AIS serves as the ground truth layer that validates or contradicts self-reported data. When a vessel reports its position via terrestrial AIS while in port, and the satellite AIS track shows it was actually 200 nautical miles away, this discrepancy triggers a compliance investigation for potential sanctions evasion, customs fraud, or AIS manipulation.'
))

story.append(body(
    'The technical implementation requires careful attention to AIS message quality. Satellite-received AIS messages have higher error rates than terrestrial receptions due to signal collision (multiple vessels transmitting simultaneously in the satellite field of view), Doppler shift (satellites moving at 7.5 km/s relative to vessels), and atmospheric interference. The ingestion pipeline must implement message deduplication (the same transmission may be received by multiple satellites), temporal interpolation (filling gaps between position reports), and confidence scoring (assigning reliability weights based on reception quality). The compliance implications are significant: a finding generated from low-confidence AIS data must be tagged appropriately, and the state machine guard conditions must account for evidence quality when determining escalation paths.'
))

# 3.2
story.append(add_heading('3.2 SAR and Optical Satellite Imagery', s_h2, level=1))

story.append(body(
    'Synthetic Aperture Radar (SAR) and optical satellite imagery provide visual verification capabilities that complement AIS data. SAR is particularly valuable for maritime compliance because it operates day and night, through cloud cover, and independent of vessel cooperation. A SAR image can detect vessel presence, estimate vessel size and heading, and identify port infrastructure activity even when the vessel has disabled its AIS transponder (a practice known as "going dark" that is frequently associated with sanctions evasion, illegal fishing, or contraband smuggling).'
))

story.append(body(
    'The integration architecture processes satellite imagery through a multi-stage pipeline. Raw imagery arrives from providers (Capella Space, ICEYE for SAR; Planet, Maxar for optical) via API or secure file transfer. A pre-processing stage handles georectification, noise reduction, and cloud masking (for optical). A vessel detection algorithm (CNN-based for SAR, object detection for optical) identifies vessel positions and characteristics in the imagery. These detected positions are then correlated with AIS-reported positions: vessels detected in imagery but not in AIS are flagged as potential dark ships, while vessels in AIS but not detected in imagery may indicate AIS spoofing (false position broadcasts). The compliance swarm generates findings with evidence packages that include the imagery, detection confidence scores, and AIS correlation results.'
))

story.append(body(
    'Optical satellite imagery provides additional capabilities that SAR cannot: visual identification of vessel type, cargo handling activity, and environmental conditions. High-resolution optical imagery (Planet SkySat at 50cm, Maxar WorldView at 30cm) can identify whether a vessel is conducting at-sea transfers (ship-to-ship operations often associated with sanctions evasion), whether port operations match declared activities, and whether environmental violations such as bilge dumping or excessive emissions are visible. The compliance use cases map directly to regulatory requirements: MARPOL Annex I (oil pollution), EU Port State Control directives, and IMO regulations on vessel identification and tracking.'
))

# Satellite comparison table
story.append(Spacer(1, 6))
story.append(make_table(
    ['Modality', 'Providers', 'Resolution', 'Conditions', 'Compliance Use Cases'],
    [
        ['Satellite AIS', 'exactEarth, Spire, ORBCOMM', 'N/A (message data)', 'All weather, global', 'Route deviation, gap detection, sanctions verification'],
        ['SAR', 'Capella Space, ICEYE', '0.25-1m', 'All weather, day/night', 'Dark ship detection, vessel presence verification'],
        ['Optical', 'Planet, Maxar', '0.3-3m', 'Daylight, clear sky', 'Port operations, environmental violations, ship-to-ship transfer'],
    ],
    [CONTENT_W*0.12, CONTENT_W*0.22, CONTENT_W*0.12, CONTENT_W*0.18, CONTENT_W*0.36]
))
story.append(Paragraph('Table 3: Satellite modalities comparison for compliance verification', s_caption))

# 3.3
story.append(add_heading('3.3 Computer Vision for Compliance Verification', s_h2, level=1))

story.append(body(
    'Computer vision, powered by deep learning models, bridges the gap between raw satellite imagery and actionable compliance findings. While satellite imagery provides the visual data, computer vision algorithms extract structured compliance intelligence from that data. This capability, targeted for Horizon 4 (2029-2031), transforms the compliance swarm from a purely data-processing system into a multi-modal intelligence platform that can see, detect, and reason about maritime operations.'
))

story.append(body(
    'The computer vision pipeline for maritime compliance operates at three levels. The first level is vessel detection and classification: convolutional neural networks (CNNs) trained on maritime vessel imagery can identify vessel type (container ship, tanker, bulk carrier, general cargo), estimate vessel size (length, beam, draft), and determine cargo loading condition (loaded vs. ballast). This information is cross-referenced with AIS-reported vessel characteristics and FMS manifest data to detect discrepancies. A vessel reporting as a 300-meter container carrier in AIS but appearing as a 150-meter tanker in satellite imagery triggers an immediate compliance investigation for identity fraud or sanctions evasion.'
))

story.append(body(
    'The second level is activity detection: temporal analysis of sequential satellite images at the same location can identify operational activities such as at-sea transfers (two vessels in close proximity for extended periods), anchorage patterns (vessels waiting outside port for extended durations that may indicate customs or sanctions issues), and port operation intensity (number of cranes active, container throughput rate). The third level is environmental monitoring: detecting oil slicks (dark patches on SAR imagery with characteristic shape and backscatter patterns), excessive wake patterns (indicating speed violations in sensitive areas), and land-use changes near ports (indicating illegal port development or environmental encroachment).'
))

story.append(body(
    'The integration with the existing compliance swarm architecture follows the event-driven pattern established in v3.1. A satellite imagery analysis pipeline publishes events (VESSEL_DETECTED, ANOMALY_FOUND, ACTIVITY_DETECTED, ENVIRONMENTAL_VIOLATION) to the event bus. The reaction engine processes these events through existing and new reaction rules. For example, a VESSEL_DETECTED event for a vessel not in the AIS database triggers the existing PII auto-scan rule to check if any manifest data references this vessel, and the existing timeout escalation rule applies appropriate SLAs. This event-driven integration means satellite vision capabilities plug into the existing architecture without requiring changes to the state machine, risk scoring, or remediation components.'
))

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Chapter 4: Architecture Resilience
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
story.append(add_heading('4. Architecture Resilience: Designing for a Decade', s_h1, level=0))

story.append(body(
    'The Maritime Compliance Swarm must not only adopt new technologies but maintain architectural resilience as the underlying technology landscape evolves. This chapter examines the design principles and patterns that ensure the system remains maintainable, extensible, and performant over a ten-year horizon, even as individual components are replaced, upgraded, or entirely rewritten.'
))

# 4.1
story.append(add_heading('4.1 The Event-Driven Backbone', s_h2, level=1))

story.append(body(
    'The event-driven architecture established in v3.0 and reinforced in v3.1 is the single most important architectural decision for long-term resilience. The event bus, currently implemented as an in-process queue with SQLite persistence, provides a decoupling layer that allows individual components to evolve independently. The anonymiser can be rewritten in Rust (Horizon 3) without affecting the auditor. The knowledge graph can migrate from in-memory to Neo4j (Horizon 2) without changing how the event bus delivers events. The state machine can add new states or transitions without modifying any downstream consumers that react to its events.'
))

story.append(body(
    'The event bus evolution path itself demonstrates this resilience. In the current implementation, events are stored in the event_log table and processed by a background consumer loop. When PostgreSQL is introduced (Horizon 1), the bus gains PG LISTEN/NOTIFY for real-time pub/sub without application-level polling. When Kafka is introduced for satellite AIS ingestion (Horizon 1), the bus gains a high-throughput ingestion path that feeds into the same event processing pipeline. When Redis Streams are introduced for weather event processing (Horizon 2), the bus gains another transport without disrupting existing subscribers. The key insight is that the event schema (event_type, source, correlation_id, payload) remains stable across all transport implementations, providing a contract that survives technology changes.'
))

story.append(body(
    'The 7 reaction rules demonstrate how the event-driven architecture absorbs new capabilities. When satellite vision events are introduced (Horizon 4), new reaction rules are added (e.g., "VESSEL_DETECTED without AIS match triggers sanctions screening") without modifying existing rules. When IoT sensor events arrive (Horizon 5), additional rules handle temperature breaches and shock events. The reaction engine pattern of condition-evaluation-action is inherently extensible: each rule is an independent, toggle-able unit that can be added, modified, or disabled at runtime without affecting other rules. This is fundamentally more resilient than a monolithic compliance engine where adding a new data source requires modifying the core processing logic.'
))

# 4.2
story.append(add_heading('4.2 Multi-Language Service Evolution', s_h2, level=1))

story.append(body(
    'The current Python-and-Go architecture is not accidental. Python provides rapid development velocity for the compliance logic (anonymiser, auditor, remediation, state machine, event bus, reactions, knowledge graph) while Go provides performance-critical telemetry tracking (MTTR tracker) with efficient concurrency and low memory footprint. This multi-language approach will expand over the decade as new requirements demand different performance and safety characteristics.'
))

story.append(body(
    'Rust enters the architecture in Horizon 3 (2027-2029) for performance-sensitive components where memory safety is paramount. The composite risk scorer, which computes a 5-dimensional weighted model for every finding, is a candidate for Rust implementation when the scoring computation becomes a bottleneck (currently processing sub-second, but quantum-resistant cryptographic operations in the scoring pipeline may increase computational cost). The knowledge graph query optimiser is another candidate: BFS traversal over millions of nodes with 11 edge types benefits from Rust zero-cost abstractions and memory safety guarantees. The key principle is that Rust components expose the same HTTP API as their Python predecessors, maintaining the interface contract while improving performance.'
))

story.append(body(
    'The multi-language strategy requires disciplined interface management. Every inter-service communication follows the established patterns: the Python gateway proxies requests to Go via httpx (as demonstrated by the MTTR proxy), event bus bridges carry events across language boundaries (as demonstrated by the SM-to-Go-MTTR bridge), and gRPC may replace HTTP for internal service-to-service communication in later horizons when latency and schema enforcement become critical. The preview endpoint (GET /api/v1/system/frontend-status) provides the integration health contract that must be maintained regardless of which language implements each component. This contract-based approach means the system can absorb new languages and retire old ones without disrupting the overall architecture.'
))

# 4.3
story.append(add_heading('4.3 Investment and Migration Framework', s_h2, level=1))

story.append(body(
    'The six-horizon evolution plan requires disciplined investment prioritisation. Each horizon builds upon the capabilities established in the previous one, creating a dependency chain that must be respected. Foundation hardening (Horizon 1) is a prerequisite for all subsequent horizons: without PostgreSQL and PostGIS, the satellite AIS pipeline cannot store spatial data; without the satellite pipeline, intelligence augmentation (Horizon 2) has no spatial data to analyse; without spatial intelligence, predictive models (Horizon 4) lack the training data needed for violation prediction. Attempting to skip a horizon creates technical debt that compounds over time.'
))

story.append(body(
    'The investment framework allocates resources across three categories: infrastructure (database, message brokers, satellite data contracts), capability development (new features, ML models, satellite integration), and operational resilience (monitoring, disaster recovery, compliance with the compliance system itself). A recommended allocation is 40 percent infrastructure, 40 percent capability, and 20 percent operational resilience during the early horizons (H1-H2), shifting to 25-55-20 during the middle horizons (H3-H4) as the infrastructure matures, and 15-50-35 during the late horizons (H5-H6) when operational resilience becomes critical for autonomous governance. The key metric for investment effectiveness is the composite risk score distribution shift: successful investment should show a measurable decrease in average CRS scores across all findings over each horizon period, indicating that the system is preventing more severe findings from occurring.'
))

# Investment framework table
story.append(Spacer(1, 6))
story.append(make_table(
    ['Horizon', 'Infrastructure', 'Capability', 'Resilience', 'Key Milestone'],
    [
        ['H1 (2025-2026)', '40%', '40%', '20%', 'PostgreSQL + PostGIS operational, AIS pipeline active'],
        ['H2 (2026-2027)', '35%', '45%', '20%', 'Neo4j knowledge graph, anomaly detection in production'],
        ['H3 (2027-2029)', '25%', '55%', '20%', 'Closed-loop remediation, Rust components deployed'],
        ['H4 (2029-2031)', '20%', '60%', '20%', 'Violation prediction, satellite vision pipeline active'],
        ['H5 (2031-2033)', '15%', '50%', '35%', 'Federated learning, blockchain eBL integration'],
        ['H6 (2033-2035)', '10%', '50%', '40%', 'Self-healing compliance, quantum-resistant crypto operational'],
    ],
    [CONTENT_W*0.14, CONTENT_W*0.14, CONTENT_W*0.14, CONTENT_W*0.14, CONTENT_W*0.44]
))
story.append(Paragraph('Table 4: Investment allocation framework across six horizons', s_caption))

story.append(body(
    'Migration between horizons follows a blue-green deployment pattern where the new capability runs alongside the existing system until it achieves parity. The state machine already demonstrates this pattern: the 10-state FindingState coexists with the legacy 5-state AuditStatus through a bridge that maps between them. The same approach will apply when migrating the event bus (in-process to PostgreSQL LISTEN/NOTIFY to Kafka), the knowledge graph (in-memory to Neo4j), and the database (SQLite to PostgreSQL). Each migration has a defined transition period where both systems operate in parallel, a validation phase where results are compared, and a cutover phase where the old system is deprecated. This approach minimises risk and ensures that compliance operations continue uninterrupted during technology transitions.'
))

# ━━ Page numbering and header/footer ━━
def add_page_number(canvas, doc):
    canvas.saveState()
    # Footer
    canvas.setFont('FreeSerif', 8)
    canvas.setFillColor(TEXT_MUTED)
    canvas.drawString(MARGIN, 30, 'Maritime Compliance Swarm Technology Deep Dive')
    canvas.drawRightString(PAGE_W - MARGIN, 30, f'Page {doc.page}')
    # Header rule
    canvas.setStrokeColor(BORDER)
    canvas.setLineWidth(0.5)
    canvas.line(MARGIN, PAGE_H - 40, PAGE_W - MARGIN, PAGE_H - 40)
    # Footer rule
    canvas.line(MARGIN, 42, PAGE_W - MARGIN, 42)
    canvas.restoreState()

def add_cover_page_number(canvas, doc):
    pass  # No page number on cover

# ━━ Build ━━
from reportlab.platypus import PageTemplate, Frame

frame = Frame(MARGIN, 50, CONTENT_W, PAGE_H - 100, id='body')
cover_frame = Frame(MARGIN, 50, CONTENT_W, PAGE_H - 100, id='cover')

doc = TocDocTemplate(
    OUTPUT_BODY,
    pagesize=A4,
    leftMargin=MARGIN, rightMargin=MARGIN,
    topMargin=50, bottomMargin=50,
    title='Maritime Compliance Technology Evolution Deep Dive 2025-2035',
    author='Z.ai',
    subject='Technology evolution deep dive for maritime compliance systems',
)

doc.addPageTemplates([
    PageTemplate(id='cover', frames=[cover_frame], onPage=add_cover_page_number),
    PageTemplate(id='body', frames=[frame], onPage=add_page_number),
])

doc.multiBuild(story)
print(f'Body PDF generated: {OUTPUT_BODY}')
