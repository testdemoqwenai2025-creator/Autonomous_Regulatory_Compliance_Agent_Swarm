const fs = require('fs');
const { Document, Packer, Paragraph, TextRun, Header, Footer, Table, TableRow, TableCell,
  AlignmentType, HeadingLevel, PageNumber, WidthType, BorderStyle, ShadingType,
  SectionType, TableLayoutType, TableOfContents, PageBreak } = require('docx');

// ─── DM-1 Deep Cyan Palette (Tech/AI) ───
const P = {
  bg: '162235', titleColor: 'FFFFFF', subtitleColor: 'B0B8C0', metaColor: '90989F',
  footerColor: '687078', accent: '37DCF2',
  table: { headerBg: '1B6B7A', headerText: 'FFFFFF', accentLine: '1B6B7A', innerLine: 'C8DDE2', surface: 'EDF3F5' }
};

// ─── Border helpers ───
const NB = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const noBorders = { top: NB, bottom: NB, left: NB, right: NB };
const allNoBorders = { top: NB, bottom: NB, left: NB, right: NB, insideHorizontal: NB, insideVertical: NB };

// ─── Cover helpers ───
function calcTitleLayout(title, maxWidthTwips, preferredPt = 40, minPt = 24) {
  const charWidth = (pt) => pt * 20;
  const charsPerLine = (pt) => Math.floor(maxWidthTwips / charWidth(pt));
  let titlePt = preferredPt;
  let lines;
  while (titlePt >= minPt) {
    const cpl = charsPerLine(titlePt);
    if (cpl < 2) { titlePt -= 2; continue; }
    lines = splitTitleLines(title, cpl);
    if (lines.length <= 3) break;
    titlePt -= 2;
  }
  if (!lines || lines.length > 3) {
    const cpl = charsPerLine(minPt);
    lines = splitTitleLines(title, cpl);
    titlePt = minPt;
  }
  return { titlePt, titleLines: lines };
}

function splitTitleLines(title, charsPerLine) {
  if (title.length <= charsPerLine) return [title];
  const breakAfter = new Set([...' \t', '-', '/', '(', ')', ',', '.', ':', ';']);
  const lines = [];
  let remaining = title;
  while (remaining.length > charsPerLine) {
    let breakAt = -1;
    for (let i = charsPerLine; i >= Math.floor(charsPerLine * 0.6); i--) {
      if (i < remaining.length && breakAfter.has(remaining[i - 1])) { breakAt = i; break; }
    }
    if (breakAt === -1) breakAt = charsPerLine;
    lines.push(remaining.substring(0, breakAt));
    remaining = remaining.substring(breakAt);
  }
  if (remaining.length > 0) lines.push(remaining);
  return lines;
}

function calcCoverSpacing(params) {
  const { titleLineCount = 1, titlePt = 36, hasSubtitle = false, hasEnglishLabel = false,
    metaLineCount = 0, fixedHeight = 800, pageHeight = 16838, marginTop = 0, marginBottom = 0 } = params;
  const SAFETY = 1200;
  const usableHeight = pageHeight - marginTop - marginBottom - SAFETY;
  const titleHeight = titleLineCount * (titlePt * 23 + 200);
  const subtitleHeight = hasSubtitle ? (12 * 23 + 600) : 0;
  const englishLabelHeight = hasEnglishLabel ? (9 * 23 + 600) : 0;
  const metaHeight = metaLineCount * (10 * 23 + 100);
  const implicitParaHeight = 3 * 300;
  const contentHeight = titleHeight + subtitleHeight + englishLabelHeight + metaHeight + fixedHeight + implicitParaHeight;
  const remainingSpace = usableHeight - contentHeight;
  const safeRemaining = Math.max(remainingSpace, 400);
  const FOOTER_MIN = 800;
  const rawTop = Math.floor(safeRemaining * 0.45);
  const rawBottom = Math.floor(safeRemaining * 0.45);
  const bottomSpacing = Math.max(rawBottom, FOOTER_MIN);
  const topSpacing = Math.max(rawTop - Math.max(0, FOOTER_MIN - rawBottom), 400);
  return { topSpacing, bottomSpacing };
}

function buildCoverR1(config) {
  const P = config.palette;
  const padL = 1200, padR = 800;
  const availableWidth = 11906 - padL - padR - 300;
  const { titlePt, titleLines } = calcTitleLayout(config.title, availableWidth, 40, 24);
  const titleSize = titlePt * 2;
  const spacing = calcCoverSpacing({
    titleLineCount: titleLines.length, titlePt,
    hasSubtitle: !!config.subtitle, hasEnglishLabel: !!config.englishLabel,
    metaLineCount: (config.metaLines || []).length, fixedHeight: 400, marginTop: 0, marginBottom: 0,
  });
  const accentLeft = { style: BorderStyle.SINGLE, size: 8, color: P.accent, space: 12 };
  const children = [];
  children.push(new Paragraph({ spacing: { before: spacing.topSpacing } }));
  if (config.englishLabel) {
    children.push(new Paragraph({
      indent: { left: padL, right: padR }, spacing: { after: 500 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: P.accent, space: 8 } },
      children: [new TextRun({ text: config.englishLabel.split('').join('  '),
        size: 18, color: P.accent, font: { ascii: 'Calibri' }, characterSpacing: 40 })],
    }));
  }
  for (let i = 0; i < titleLines.length; i++) {
    children.push(new Paragraph({
      indent: { left: padL },
      spacing: { after: i < titleLines.length - 1 ? 100 : 300, line: Math.ceil(titlePt * 23), lineRule: 'atLeast' },
      children: [new TextRun({ text: titleLines[i], size: titleSize, bold: true,
        color: P.titleColor, font: { ascii: 'Arial' } })],
    }));
  }
  if (config.subtitle) {
    children.push(new Paragraph({
      indent: { left: padL }, spacing: { after: 800 },
      children: [new TextRun({ text: config.subtitle, size: 24, color: P.subtitleColor,
        font: { ascii: 'Arial' } })],
    }));
  }
  for (const line of (config.metaLines || [])) {
    children.push(new Paragraph({
      indent: { left: padL + 200 }, spacing: { after: 80 },
      border: { left: accentLeft },
      children: [new TextRun({ text: line, size: 24, color: P.metaColor, font: { ascii: 'Arial' } })],
    }));
  }
  children.push(new Paragraph({ spacing: { before: spacing.bottomSpacing } }));
  children.push(new Paragraph({
    indent: { left: padL, right: padR },
    border: { top: { style: BorderStyle.SINGLE, size: 2, color: P.accent, space: 8 } },
    spacing: { before: 200 },
    children: [
      new TextRun({ text: config.footerLeft || '', size: 16, color: P.footerColor, font: { ascii: 'Arial' } }),
      new TextRun({ text: '                                                    ' }),
      new TextRun({ text: config.footerRight || '', size: 16, color: P.footerColor, font: { ascii: 'Arial' } }),
    ],
  }));
  return [new Table({
    width: { size: 100, type: WidthType.PERCENTAGE }, layout: TableLayoutType.FIXED,
    borders: allNoBorders,
    rows: [new TableRow({ height: { value: 16838, rule: 'exact' }, children: [new TableCell({
      shading: { type: ShadingType.CLEAR, fill: P.bg }, borders: noBorders, children,
    })] })],
  })];
}

// ─── Body helpers ───
function h1(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 400, after: 200 },
    children: [new TextRun({ text, bold: true, font: { ascii: 'Times New Roman' }, size: 32, color: '162235' })] });
}
function h2(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 300, after: 160 },
    children: [new TextRun({ text, bold: true, font: { ascii: 'Times New Roman' }, size: 28, color: '1B6B7A' })] });
}
function h3(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_3, spacing: { before: 240, after: 120 },
    children: [new TextRun({ text, bold: true, font: { ascii: 'Times New Roman' }, size: 26, color: '162235' })] });
}
function body(text) {
  return new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { line: 312, after: 120 },
    children: [new TextRun({ text, size: 24, color: '000000', font: { ascii: 'Times New Roman' } })] });
}
function bodyBold(text) {
  return new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { line: 312, after: 120 },
    children: [new TextRun({ text, size: 24, color: '000000', font: { ascii: 'Times New Roman' }, bold: true })] });
}
function bullet(text) {
  return new Paragraph({ alignment: AlignmentType.LEFT, spacing: { line: 312, after: 60 },
    indent: { left: 600, hanging: 300 },
    children: [new TextRun({ text: '\u2022  ' + text, size: 24, color: '000000', font: { ascii: 'Times New Roman' } })] });
}

function makeHeaderRow(cells) {
  return new TableRow({ tableHeader: true, cantSplit: true, children: cells.map(t => new TableCell({
    shading: { type: ShadingType.CLEAR, fill: P.table.headerBg },
    children: [new Paragraph({ children: [new TextRun({ text: t, bold: true, size: 21, color: P.table.headerText, font: { ascii: 'Times New Roman' } })] })],
    borders: { top: NB, bottom: { style: BorderStyle.SINGLE, size: 2, color: P.table.headerBg }, left: NB, right: NB },
    margins: { top: 60, bottom: 60, left: 120, right: 120 },
  })) });
}
function makeDataRow(cells, idx) {
  return new TableRow({ cantSplit: true, children: cells.map(t => new TableCell({
    shading: idx % 2 === 0 ? { type: ShadingType.CLEAR, fill: P.table.surface } : undefined,
    children: [new Paragraph({ children: [new TextRun({ text: t, size: 21, color: '000000', font: { ascii: 'Times New Roman' } })] })],
    borders: { top: NB, bottom: { style: BorderStyle.SINGLE, size: 1, color: P.table.innerLine }, left: NB, right: NB },
    margins: { top: 60, bottom: 60, left: 120, right: 120 },
  })) });
}
function makeTable(headers, rows) {
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, layout: TableLayoutType.FIXED,
    borders: { top: { style: BorderStyle.SINGLE, size: 2, color: P.table.accentLine },
      bottom: { style: BorderStyle.SINGLE, size: 2, color: P.table.accentLine },
      left: NB, right: NB, insideVertical: NB },
    rows: [makeHeaderRow(headers), ...rows.map((r, i) => makeDataRow(r, i))],
  });
}

// ─── Document Content ───
const coverConfig = {
  title: 'Maritime Global Compliance Swarm: Strategic Roadmap 2025-2035',
  englishLabel: 'AUTONOMOUS REGULATORY COMPLIANCE AGENT SWARM',
  subtitle: 'Three-Tier Strategic Analysis and Decade Evolution Plan',
  metaLines: ['Version 3.0  |  Event-Driven Architecture  |  10-State Finding Lifecycle',
    'Polyglot Microservices  |  Composite Risk Scoring  |  Knowledge Graph'],
  footerLeft: 'Maritime Compliance Intelligence',
  footerRight: 'July 2026',
  palette: P,
};

const bodyContent = [
  // ─── EXECUTIVE SUMMARY ───
  h1('Executive Summary'),
  body('The Maritime Global Compliance Swarm represents a paradigm shift in how global maritime freight operators manage regulatory compliance across multiple jurisdictions. This strategic roadmap synthesises a three-tier analysis of the current system architecture, market positioning, and technology evolution trajectory to chart a definitive course from the present v3.0 implementation through to a mature, AI-native compliance platform by 2035.'),
  body('The swarm currently automates GDPR, CCPA, LGPD, PDPA, and PIPA compliance through five integrated agents: a PII Anonymiser with HMAC-SHA256 tokenisation and ML-based NER detection, an EDI SQL Auditor with eleven parametric queries across five compliance domains, a Remediation Route Generator with decision-matrix-driven policy creation, a Finding State Machine governing ten lifecycle states with twenty validated transitions, and a Golang-based MTTR Telemetry Tracker providing real-time performance metrics. These agents communicate through an event-driven architecture powered by a database-backed event bus with seven autonomous reaction rules.'),
  body('The three-tier analysis reveals that the maritime compliance technology landscape is undergoing a fundamental transformation driven by satellite AIS densification, blockchain-based electronic Bills of Lading, EU ETS carbon reporting mandates, and the emergence of Arctic shipping corridors. Each of these forces creates new data repositories, new compliance obligations, and new risk vectors that the swarm must evolve to address. This roadmap identifies six strategic evolution horizons, each building upon the previous, to transform the current agent swarm into an autonomous, self-learning compliance intelligence platform.'),

  // ─── TIER 1: CURRENT STATE ASSESSMENT ───
  h1('Tier 1: Current State Assessment'),

  h2('1.1 Architecture Maturity Analysis'),
  body('The current v3.0 architecture operates as a polyglot microservices system with a Python FastAPI gateway on port 8000 and a Golang MTTR tracking service on port 8080, connected through a shared SQLite database in development mode with PostgreSQL and PostGIS targeted for production deployment. The system implements forty-five REST API routes, a ten-tab interactive HTML dashboard, and a Python client SDK with typed Pydantic models for programmatic integration.'),
  body('The event-driven architecture represents the most significant recent advancement. The Finding State Machine, with its ten states and twenty transitions, enforces guard conditions such as CRITICAL findings requiring sign-off before RISK_ACCEPTED transitions, and implements per-severity SLA timeouts that auto-escalate findings from CRITICAL at one hour through INFO at one hundred and sixty-eight hours. Every successful transition triggers two downstream effects: a FINDING_STATE_CHANGED event published to the event bus, and an async HTTP POST to the Golang MTTR tracker, creating a complete dual-write audit trail.'),
  body('The seven reaction rules form the autonomous decision-making layer of the swarm. These rules enable the system to respond to events without human intervention, from triggering EDI partner notifications for CRITICAL findings through initiating automatic anonymisation scans for PII exposure events, to re-running compliance audits when certificate expiry findings are detected. Each rule evaluates event type, severity, risk category, and payload fields before firing, ensuring that reactions are contextually appropriate.'),

  h2('1.2 Composite Risk Scoring Capabilities'),
  body('The recently introduced composite risk scoring engine implements a five-dimensional weighted model that combines severity, jurisdiction, data sensitivity, exposure breadth, and temporal urgency into a single Composite Risk Score normalised to the zero-to-one range. The weighting configuration, with severity at thirty percent, jurisdiction and data sensitivity at twenty percent each, and exposure breadth and temporal urgency at fifteen percent each, reflects the maritime industry\'s regulatory priorities where the nature of the violation and the governing jurisdiction carry the greatest risk weight.'),
  body('The jurisdiction risk scoring differentiates between the five supported regulatory frameworks based on enforcement rigour and penalty severity, with GDPR scoring the maximum one-point-zero due to its four percent global turnover fine capability and strict Data Protection Authority requirements, while PDPA scores zero-point-five reflecting Singapore\'s more moderate but proactive enforcement posture. The data sensitivity dimension maps seven classification levels from special category data at one-point-zero through operational data at zero-point-two-five, enabling proportionate risk assessment that avoids both under-reaction and costly over-compliance.'),

  h2('1.3 Middleware and Observability Infrastructure'),
  body('The middleware pipeline implements a chain-of-responsibility pattern with four composable components: authentication middleware supporting both API key and JWT validation, token-bucket rate limiting with per-IP tracking, request validation enforcing payload size limits, and structured audit logging producing JSON-formatted entries suitable for ELK, Loki, or CloudWatch ingestion. The pipeline executes in priority order, with each middleware able to short-circuit the request chain by returning a response directly.'),
  body('The observability module provides three core capabilities: a structured JSON log formatter with correlation ID propagation across the entire request lifecycle, a health aggregator that registers and executes health check functions for all system components to compute an overall system health status, and a metrics collector supporting counters, gauges, and histograms with thread-safe operations. These foundations enable the swarm to meet the operational visibility requirements of enterprise maritime operators managing compliance across global trade lanes.'),

  // ─── TIER 2: COMPETITIVE AND MARKET POSITIONING ───
  h1('Tier 2: Competitive and Market Positioning'),

  h2('2.1 Regulatory Landscape Evolution'),
  body('The global maritime regulatory environment is accelerating in both breadth and depth. The EU Emissions Trading System maritime extension, effective from 2024, introduces a sixth compliance domain for carbon reporting that requires MRV data integration, emissions registry connectivity, and carbon credit tracking. This mandate affects every vessel calling at EU ports, creating an entirely new category of compliance findings that the current five-domain auditor cannot detect.'),
  body('Simultaneously, the International Maritime Organization\'s 2023 Strategy on Reduction of GHG Emissions from Ships targets net-zero by approximately 2050, with interim checkpoints at 2030 and 2040. This creates a decadal compliance trajectory where carbon reporting requirements will progressively tighten, requiring the swarm\'s audit query registry to evolve from static SQL queries to dynamic, regulation-version-aware compliance checks that can adapt as new IMO guidelines are adopted.'),
  body('The Arctic shipping corridor, increasingly viable due to sea ice retreat, introduces jurisdictional complexity as vessels transit between UNCLOS provisions, Arctic Council guidelines, and the national regulations of Russia, Canada, Denmark, Norway, and the United States. Each Arctic coastal state maintains distinct data reporting requirements, environmental protection mandates, and navigation safety obligations that create overlapping and sometimes conflicting compliance obligations for operators.'),

  h2('2.2 Data Repository Proliferation'),
  body('The maritime data ecosystem is undergoing exponential growth in both volume and variety. Automatic Identification System data, transmitted at rates exceeding twenty million messages per day globally, provides vessel positional intelligence that carries compliance implications for route deviation detection, sanctions screening, and port state control preparation. The swarm\'s current architecture does not yet ingest or process AIS data, representing a significant capability gap.'),
  body('Blockchain-based electronic Bills of Lading, pioneered by platforms such as TradeLens and CargoX, introduce immutable, distributed ledger records that fundamentally change the compliance audit paradigm. Traditional EDI compliance auditing assumes centralised, queryable databases, but blockchain eBL requires a shift towards smart contract event monitoring, hash-based integrity verification, and multi-party consent tracking for data access and modification operations.'),
  body('IoT container sensor networks, transmitting temperature, humidity, shock, and location data via MQTT brokers, create continuous compliance data streams for cold-chain pharmaceutical shipments, perishable food logistics, and dangerous goods monitoring. The swarm\'s current batch-oriented audit model must evolve to support streaming data compliance, where violations are detected and responded to in near-real-time as sensor data deviates from acceptable thresholds.'),

  makeTable(
    ['Data Source', 'Protocol', 'Compliance Value', 'Integration Priority'],
    [
      ['AIS Feeds', 'Kafka / UDP', 'Vessel tracking, route deviation, sanctions', 'P0 - Critical'],
      ['Blockchain eBL', 'Smart contract events', 'Bill of Lading integrity, chain of custody', 'P0 - Critical'],
      ['IoT Container Sensors', 'MQTT broker', 'Cold-chain, hazmat, shock detection', 'P1 - High'],
      ['Emissions Monitoring', 'MRV Data API', 'EU ETS, IMO DCS carbon reporting', 'P1 - High'],
      ['Port Community Systems', 'REST + webhooks', 'Customs pre-clearance, port fees', 'P2 - Medium'],
      ['Single-Window Customs', 'EDIFACT CUSCAR/CUSRES', 'Real-time filing verification', 'P2 - Medium'],
      ['Crew Management', 'REST + SSO', 'Crew privacy, MLC 2006', 'P3 - Standard'],
      ['Terminal OS', 'EDIFACT COPARN/COARRI', 'Container movement, storage deadlines', 'P3 - Standard'],
    ]
  ),
  new Paragraph({ spacing: { before: 80, after: 200 }, children: [new TextRun({ text: 'Table 1: Maritime Data Repository Integration Priority Matrix', size: 21, color: '506070', font: { ascii: 'Times New Roman' }, italics: true })] }),

  // ─── TIER 3: TECHNOLOGY EVOLUTION TRAJECTORY ───
  h1('Tier 3: Technology Evolution Trajectory'),

  h2('3.1 Satellite and Remote Sensing Integration'),
  body('The convergence of satellite AIS, synthetic aperture radar, and optical Earth observation is creating an unprecedented maritime surveillance capability. Satellite AIS providers such as exactEarth, Spire Global, and ORBCOMM operate constellations capable of detecting AIS transmissions from vessels far beyond the reach of shore-based receivers, with global coverage achieved through Low Earth Orbit constellations. For compliance, this means that vessel positional data is becoming near-ubiquitous, enabling compliance systems to detect route deviations, identify potential sanctions-busting voyages, and verify declared port calls against actual vessel movements.'),
  body('Synthetic aperture radar satellites, including the European Space Agency\'s Sentinel-1 constellation and commercial providers like Capella Space and ICEYE, can detect vessels even when AIS transponders are disabled or spoofed, providing a compliance verification layer that is immune to the most common forms of AIS manipulation. The integration of SAR data with AIS feeds creates a multi-modal vessel detection capability that significantly enhances the compliance swarm\'s ability to identify dark shipping operations that may indicate sanctions evasion, illegal fishing, or smuggling.'),
  body('Optical Earth observation satellites, with resolution capabilities reaching sub-metre levels from commercial providers such as Planet Labs and Maxar Technologies, enable visual verification of port operations, cargo handling activities, and environmental conditions. For compliance purposes, optical imagery can verify whether declared cargo operations match actual port activity, detect potential oil spills or environmental violations, and assess port infrastructure damage following natural disasters that may affect compliance obligations under force majeure provisions.'),

  h2('3.2 Artificial Intelligence and Machine Learning Evolution'),
  body('The current system\'s NER-based PII detection using spaCy represents the first step towards AI-native compliance. The next evolution involves transitioning from rule-based audit queries to learned compliance patterns that can identify violations that no human auditor has yet codified into a query. This requires the development of a compliance training pipeline that ingests historical audit findings, regulatory texts, and enforcement actions to train models capable of detecting novel violation patterns.'),
  body('Large Language Models present both an opportunity and a challenge for maritime compliance. On the opportunity side, LLMs can interpret complex regulatory texts across multiple languages, extract compliance obligations from new regulations as they are published, and generate human-readable explanations of compliance findings for non-technical stakeholders. On the challenge side, LLM hallucination risks require a guardrail architecture where LLM-generated compliance assessments are always validated against the authoritative rule engine before being actioned.'),
  body('Reinforcement learning offers a pathway towards autonomous remediation optimisation, where the system learns which remediation strategies are most effective for specific combinations of violation type, jurisdiction, data sensitivity, and partner characteristics. By modelling the remediation process as a sequential decision problem, the system can learn to select remediation actions that minimise MTTR while maximising the probability of first-pass verification, continuously improving its performance through feedback from the verification stage of the finding lifecycle.'),

  h2('3.3 Event Sourcing and CQRS Architecture'),
  body('The current database-backed event log provides the foundation for a full event sourcing architecture, where every state change in the compliance swarm is captured as an immutable event. Event sourcing enables complete temporal querying, allowing compliance officers to reconstruct the exact state of any finding, policy, or audit result at any point in time, which is essential for regulatory investigations that require demonstrating what the system knew and when it knew it.'),
  body('Command Query Responsibility Segregation complements event sourcing by separating the write model, which enforces business rules and validates state transitions through the state machine, from the read model, which is optimised for the diverse query patterns required by the dashboard, reports, and analytics features. The current single-database approach works for development, but as query complexity and event volume grow with new data source integration, a separated read store using materialised views or a dedicated analytics database becomes essential for maintaining performance.'),

  // ─── STRATEGIC ROADMAP 2025-2035 ───
  h1('Strategic Roadmap: Six Evolution Horizons'),

  h2('Horizon 1: Foundation Hardening (2025-2026)'),
  body('The immediate horizon focuses on production readiness and the integration of the most critical missing data sources. This includes migrating from SQLite to PostgreSQL with PostGIS for spatial compliance queries, implementing the EU ETS carbon reporting audit domain with six new compliance queries covering MRV data validation, emissions registry reconciliation, and carbon credit tracking, and deploying the authentication middleware with JWT-based access control to secure the forty-five API endpoints for enterprise deployment.'),
  body('The satellite AIS ingestion pipeline represents the highest-priority new capability. Using Apache Kafka for high-throughput message ingestion and PostgreSQL with PostGIS for spatial indexing, the swarm will be able to correlate vessel positions with declared routes, detect AIS transmission gaps that may indicate deliberate concealment, and cross-reference vessel movements with sanction lists and port state control inspection histories. The satellite_ingest.py module already provides the foundational framework, requiring production-grade hardening with error recovery, back-pressure management, and multi-provider failover.'),

  makeTable(
    ['Capability', 'Current State', 'Horizon 1 Target', 'Effort'],
    [
      ['Database', 'SQLite dev', 'PostgreSQL 16 + PostGIS 3.4', 'Medium'],
      ['Authentication', 'Disabled (dev)', 'JWT + API key, RBAC', 'Medium'],
      ['EU ETS Auditing', 'Not implemented', '6 audit queries, MRV integration', 'High'],
      ['AIS Ingestion', 'Skeleton module', 'Kafka + PostGIS pipeline', 'High'],
      ['Rate Limiting', 'In-memory token bucket', 'Redis-backed distributed', 'Low'],
      ['Audit Logging', 'In-memory list', 'Event bus + persistent store', 'Medium'],
    ]
  ),
  new Paragraph({ spacing: { before: 80, after: 200 }, children: [new TextRun({ text: 'Table 2: Horizon 1 Capability Gap Analysis', size: 21, color: '506070', font: { ascii: 'Times New Roman' }, italics: true })] }),

  h2('Horizon 2: Intelligence Augmentation (2026-2027)'),
  body('The second horizon introduces machine learning models that augment human compliance decision-making. The pluggable audit query registry evolves from a database-backed query store to a hybrid system where traditional SQL queries coexist with ML-based anomaly detectors. Statistical anomaly detection baselines the normal distributions of EDI message volumes, encryption protocol usage, and data retention patterns, flagging statistical outliers as potential compliance violations before they are explicitly codified in regulatory texts.'),
  body('The compliance knowledge graph transitions from its current in-memory adjacency-list implementation to a production graph database such as Neo4j or Amazon Neptune, enabling complex multi-hop queries that identify cross-jurisdictional regulatory conflicts, trace obligation chains through the regulatory hierarchy, and perform impact analysis when new regulations are introduced. The current seed data covering five jurisdictions, ten regulations, seven data categories, eight obligations, and six compliance controls expands to include every applicable maritime regulation across all active trade lanes.'),
  body('Weather-aware compliance intelligence reaches operational maturity in this horizon. The weather ingestion service, polling NOAA GFS and ECMWF ERA5 data every fifteen minutes, feeds into the compliance event bus through dedicated weather event types including PORT_CLOSURE, STORM_TRACK, and CANAL_BLOCKAGE. The reaction engine gains weather-correlated rules that automatically adjust finding severity based on active weather events, enter weather-hold mode for remediation SLAs during hurricanes and typhoons, and exclude force majeure periods from MTTR calculations to ensure fair compliance performance measurement.'),

  h2('Horizon 3: Autonomous Operations (2027-2029)'),
  body('The third horizon marks the transition from human-in-the-loop to human-on-the-loop compliance operations. Closed-loop remediation verification, where the system automatically re-audits after remediation is applied and escalates if the violation persists, becomes the default operational mode. The remediation decision matrix evolves from a static risk-category-to-action mapping to a learned model trained on historical finding-remediation-verification outcome triplets, continuously improving its accuracy through feedback from every completed finding lifecycle.'),
  body('Multi-party orchestration capabilities address the cross-organisational nature of maritime compliance, where a single finding may require coordination between the carrier, the customs broker, the port authority, and the regulatory body. A workflow engine based on BPMN 2.0 or a lightweight statechart implementation manages these multi-party compliance processes, with each participant receiving task assignments, status updates, and deadline reminders through their preferred communication channels.'),
  body('The MTTR tracker evolves from batch-oriented metrics calculation to real-time streaming analytics using Server-Sent Events for live dashboard updates. Time-series analysis capabilities including exponential moving averages, seasonal decomposition, and trend detection enable predictive MTTR estimation for new findings, allowing compliance managers to proactively allocate resources to findings that are predicted to exceed their SLA targets.'),

  h2('Horizon 4: Predictive Intelligence (2029-2031)'),
  body('Predictive compliance represents the most transformative capability in the roadmap. By analysing patterns across historical findings, regulatory changes, enforcement actions, and industry-wide compliance data, the swarm develops the ability to predict compliance violations before they occur. A violation prediction model, trained on the complete event-sourced history of every finding and remediation action, identifies combinations of conditions, such as approaching certificate expiry combined with recent partner onboarding and increased message volumes, that historically precede compliance failures.'),
  body('Regulatory change impact analysis uses natural language processing to monitor regulatory publications from all five supported jurisdictions plus international bodies such as the IMO, the European Commission, and national maritime authorities. When a new regulation or amendment is detected, the system automatically analyses its impact on existing compliance controls, identifies gaps in the current audit query coverage, and generates a prioritised implementation plan that estimates the effort and risk reduction value of each required change.'),
  body('Digital twin compliance modelling creates a virtual replica of the operator\'s compliance posture, enabling what-if analysis of proposed operational changes. Before opening a new trade lane, onboarding a new EDI partner, or changing data handling practices, the compliance team can simulate the impact on their risk profile, predict new finding types that may emerge, and pre-position remediation resources to address anticipated compliance gaps.'),

  h2('Horizon 5: Ecosystem Integration (2031-2033)'),
  body('The fifth horizon extends the compliance swarm beyond the boundaries of a single operator to participate in industry-wide compliance ecosystems. Inter-operator compliance data sharing, governed by privacy-preserving techniques such as federated learning and secure multi-party computation, enables the system to learn from industry-wide compliance patterns without exposing any individual operator\'s sensitive data. This collective intelligence approach significantly improves violation prediction accuracy and remediation effectiveness.'),
  body('Regulatory technology sandbox integration enables the swarm to test compliance rule changes against a representative sample of industry data before formal adoption, reducing the risk of unintended compliance gaps when regulations change. Partnership with regulatory sandbox programmes operated by the UK FCA, Singapore MAS, and other innovation-friendly regulators provides early access to regulatory guidance and enables the swarm to influence the development of compliance technology standards.'),
  body('Cross-border data governance automation addresses the operational complexity of transferring personal data between jurisdictions with different and sometimes conflicting requirements. The system automates the creation and maintenance of Standard Contractual Clauses, Binding Corporate Rules, and Transfer Impact Assessments required under GDPR Chapter V, while simultaneously ensuring compliance with the data localisation requirements that some jurisdictions impose. The compliance knowledge graph models these cross-border transfer rules as traversable paths, enabling automated compliance checking for any proposed data flow.'),

  h2('Horizon 6: Autonomous Governance (2033-2035)'),
  body('The final horizon envisions the compliance swarm as a fully autonomous governance platform that manages the majority of compliance operations without human intervention for routine matters, while escalating genuinely novel or high-stakes situations to human compliance officers. The system\'s decision-making authority is bounded by a compliance governance framework that defines the types of decisions the system can make autonomously, the risk thresholds that trigger human review, and the audit trail requirements that ensure accountability.'),
  body('Self-healing compliance capabilities enable the system to not only detect and remediate violations but also to modify its own configuration, update audit queries, and adjust risk scoring weights in response to observed patterns. For example, if the system detects that a particular audit query is generating a high false-positive rate, it can automatically refine the query parameters, test the refined version against historical data, and deploy the improved version without human intervention, while maintaining a complete audit trail of the modification.'),
  body('Quantum-resistant cryptography preparation addresses the long-term threat that quantum computing poses to the cryptographic primitives underpinning maritime compliance, particularly the HMAC-SHA256 tokenisation and Fernet encryption used by the PII anonymiser. The swarm begins integrating post-quantum cryptographic algorithms, such as those standardised by NIST in 2024, alongside classical algorithms through a hybrid cryptography approach that maintains backward compatibility while providing quantum resistance for data that must remain protected for decades.'),

  // ─── DECISION FRAMEWORK ───
  h1('Investment and Decision Framework'),

  h2('Resource Allocation Strategy'),
  body('Investment across the six horizons follows a front-loaded model, with the most critical capabilities receiving the highest resource allocation in the early horizons. Horizon 1 receives approximately thirty-five percent of the total investment budget, reflecting the urgency of production hardening, EU ETS compliance, and AIS integration. Horizons 2 and 3 each receive approximately twenty percent, covering the transition from rule-based to learning-based compliance and the operationalisation of autonomous remediation. The remaining horizons share the final twenty-five percent, with increasing allocation as the technology matures and ROI becomes more predictable.'),
  body('The technology stack evolution follows a pragmatic progression from the current Python plus Golang polyglot architecture. Python remains the primary language for the gateway, audit, anonymisation, and remediation components due to its rich ecosystem of data processing, machine learning, and NLP libraries. Golang continues to serve the MTTR tracker and will expand to handle the AIS ingestion pipeline and event sourcing components where its concurrency model and performance characteristics provide significant advantages. Rust is introduced in Horizon 3 for performance-critical components such as the composite risk scoring engine and the graph query optimiser, where memory safety and zero-cost abstractions are essential.'),

  makeTable(
    ['Horizon', 'Period', 'Key Investment', 'Expected ROI Indicator'],
    [
      ['H1: Foundation', '2025-2026', 'PostGIS, EU ETS, AIS pipeline', 'Audit coverage: 5 to 8 domains'],
      ['H2: Intelligence', '2026-2027', 'ML anomaly, graph DB, weather', 'False positive reduction: 20-30%'],
      ['H3: Autonomous', '2027-2029', 'Closed-loop, orchestration, SSE', 'MTTR improvement: 40-50%'],
      ['H4: Predictive', '2029-2031', 'Violation prediction, NLP', 'Preventive findings: >30%'],
      ['H5: Ecosystem', '2031-2033', 'Federated learning, sandbox', 'Cross-operator accuracy +25%'],
      ['H6: Governance', '2033-2035', 'Self-healing, quantum crypto', 'Autonomous resolution: >80%'],
    ]
  ),
  new Paragraph({ spacing: { before: 80, after: 200 }, children: [new TextRun({ text: 'Table 3: Investment Allocation and ROI Indicators by Horizon', size: 21, color: '506070', font: { ascii: 'Times New Roman' }, italics: true })] }),

  h2('Risk Mitigation'),
  body('The primary technical risk is the complexity of integrating multiple new data sources without degrading the performance and reliability of existing compliance operations. This is mitigated through a strangler fig migration pattern, where new data source integrations are developed and tested alongside the existing system before gradually redirecting traffic, ensuring that no single integration failure can disrupt established compliance workflows.'),
  body('Regulatory risk is addressed through the knowledge graph\'s impact analysis capability, which enables the system to assess the compliance impact of regulatory changes as soon as they are announced, providing compliance teams with early warning and implementation planning support. The graph\'s traversal queries identify all regulations, obligations, and controls affected by a regulatory change, enabling precise scoping of the required system modifications.'),
  body('Data quality risk, particularly for new data sources such as AIS and IoT sensor data, is mitigated through a data quality framework that classifies incoming data by reliability level, applies appropriate validation rules for each level, and flags data quality issues as potential compliance concerns. AIS data from satellite providers is classified as high-reliability for positional accuracy but lower reliability for vessel identification, while IoT sensor data quality varies by sensor type, manufacturer, and environmental conditions.'),
];

// ─── Build Document ───
const doc = new Document({
  styles: {
    default: { document: {
      run: { font: { ascii: 'Times New Roman' }, size: 24, color: '000000' },
      paragraph: { spacing: { line: 312 } },
    }},
    heading1: { run: { font: { ascii: 'Times New Roman' }, size: 32, bold: true, color: '162235' },
      paragraph: { spacing: { before: 400, after: 200 } } },
    heading2: { run: { font: { ascii: 'Times New Roman' }, size: 28, bold: true, color: '1B6B7A' },
      paragraph: { spacing: { before: 300, after: 160 } } },
    heading3: { run: { font: { ascii: 'Times New Roman' }, size: 26, bold: true, color: '162235' },
      paragraph: { spacing: { before: 240, after: 120 } } },
  },
  sections: [
    // Cover section
    { properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 0, bottom: 0, left: 0, right: 0 } } },
      children: buildCoverR1(coverConfig) },
    // TOC section
    { properties: { type: SectionType.NEXT_PAGE, page: { size: { width: 11906, height: 16838 },
        margin: { top: 1440, bottom: 1440, left: 1701, right: 1417 } } },
      children: [
        new Paragraph({ children: [new TextRun({ text: 'Table of Contents', bold: true, size: 32, color: '162235', font: { ascii: 'Times New Roman' } })], spacing: { after: 200 } }),
        new TableOfContents('TOC', { hyperlink: true, headingStyleRange: '1-3' }),
        new Paragraph({ children: [new TextRun({ text: 'Note: Right-click the table of contents and select "Update Field" to refresh page numbers.', italics: true, size: 21, color: '808080', font: { ascii: 'Times New Roman' } })], spacing: { before: 200 } }),
        new Paragraph({ children: [new PageBreak()] }),
      ]
    },
    // Body section
    { properties: { type: SectionType.NEXT_PAGE, page: { size: { width: 11906, height: 16838 },
        margin: { top: 1440, bottom: 1440, left: 1701, right: 1417 },
        pageNumbers: { start: 1 } } },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: 'Page ', size: 18, color: '506070', font: { ascii: 'Times New Roman' } }),
          new TextRun({ children: [PageNumber.CURRENT], size: 18, color: '506070', font: { ascii: 'Times New Roman' } })] })] }) },
      children: bodyContent,
    },
  ],
});

// Generate
Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync('/home/z/my-project/download/Maritime_Compliance_Swarm_Strategic_Roadmap_2025-2035.docx', buf);
  console.log('Strategic Roadmap DOCX generated successfully.');
});
