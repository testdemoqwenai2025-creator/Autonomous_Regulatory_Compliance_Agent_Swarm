const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, PageNumber, AlignmentType, HeadingLevel,
  WidthType, BorderStyle, ShadingType, SectionType, PageBreak,
  TableOfContents, NumberFormat } = require('docx');
const fs = require('fs');

// ── Palette: Cool Dawn Mist ──
const P = {
  bg: '101820', primary: '101820', body: '182030',
  secondary: '506070', accent: '4C6EF5', surface: 'F5F7FA',
  titleColor: 'FFFFFF', subtitleColor: 'B0B8C8', metaColor: '8899AA', footerColor: '808080'
};
const c = h => h.replace('#','');
const NB = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const noBorders = { top: NB, bottom: NB, left: NB, right: NB };
const allNoBorders = { top: NB, bottom: NB, left: NB, right: NB, insideHorizontal: NB, insideVertical: NB };

// ── Helpers ──
function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    alignment: AlignmentType.CENTER,
    spacing: { before: 480, after: 200, line: 312 },
    children: [new TextRun({ text, bold: true, size: 32, color: c(P.primary),
      font: { ascii: 'Times New Roman', eastAsia: 'SimHei' } })]
  });
}

function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 360, after: 160, line: 312 },
    children: [new TextRun({ text, bold: true, size: 30, color: c(P.primary),
      font: { ascii: 'Times New Roman', eastAsia: 'SimHei' } })]
  });
}

function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 280, after: 120, line: 312 },
    children: [new TextRun({ text, bold: true, size: 28, color: c(P.primary),
      font: { ascii: 'Times New Roman', eastAsia: 'SimHei' } })]
  });
}

function body(text) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: 120, line: 312 },
    indent: { firstLine: 480 },
    children: [new TextRun({ text, size: 24, color: c(P.body),
      font: { ascii: 'Times New Roman', eastAsia: 'SimSun' } })]
  });
}

function bodyNoIndent(text) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: 120, line: 312 },
    children: [new TextRun({ text, size: 24, color: c(P.body),
      font: { ascii: 'Times New Roman', eastAsia: 'SimSun' } })]
  });
}

function bullet(text) {
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { after: 80, line: 312 },
    indent: { left: 480, hanging: 240 },
    children: [
      new TextRun({ text: '\u2022  ', size: 24, color: c(P.accent),
        font: { ascii: 'Times New Roman' } }),
      new TextRun({ text, size: 24, color: c(P.body),
        font: { ascii: 'Times New Roman', eastAsia: 'SimSun' } })
    ]
  });
}

function makeRow(cells, isHeader = false) {
  return new TableRow({
    tableHeader: isHeader,
    cantSplit: true,
    children: cells.map(text => new TableCell({
      width: { size: Math.floor(100 / cells.length), type: WidthType.PERCENTAGE },
      shading: isHeader
        ? { type: ShadingType.CLEAR, fill: c(P.accent) }
        : { type: ShadingType.CLEAR, fill: 'FFFFFF' },
      borders: {
        top: { style: BorderStyle.SINGLE, size: 1, color: isHeader ? c(P.accent) : 'D0D5DD' },
        bottom: { style: BorderStyle.SINGLE, size: 1, color: isHeader ? c(P.accent) : 'D0D5DD' },
        left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }
      },
      margins: { top: 60, bottom: 60, left: 120, right: 120 },
      children: [new Paragraph({
        children: [new TextRun({ text, bold: isHeader, size: 21,
          color: isHeader ? 'FFFFFF' : c(P.body),
          font: { ascii: 'Times New Roman' } })]
      })]
    }))
  });
}

function makeTable(headers, rows) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [makeRow(headers, true), ...rows.map(r => makeRow(r))]
  });
}

// ── Cover (R1 Pure Paragraph Left, Dark Navy) ──
function buildCover() {
  const children = [];
  const padL = 1200;
  const accentLeft = { style: BorderStyle.SINGLE, size: 8, color: c(P.accent), space: 12 };

  // Vertical spacing
  children.push(new Paragraph({ spacing: { before: 4800 } }));

  // Accent label
  children.push(new Paragraph({
    indent: { left: padL },
    spacing: { after: 500 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: c(P.accent), space: 8 } },
    children: [new TextRun({ text: 'S T R A T E G I C   R O A D M A P', size: 18, color: c(P.accent),
      font: { ascii: 'Times New Roman' }, characterSpacing: 40 })]
  }));

  // Title
  children.push(new Paragraph({
    indent: { left: padL },
    spacing: { after: 200, line: 920, lineRule: 'atLeast' },
    children: [new TextRun({ text: 'Strategic Evolution Roadmap', size: 72, bold: true,
      color: P.titleColor, font: { ascii: 'Times New Roman' } })]
  }));

  // Subtitle
  children.push(new Paragraph({
    indent: { left: padL },
    spacing: { after: 800 },
    children: [new TextRun({ text: 'Maritime Global Compliance Swarm  v2.0 \u2192 v5.0', size: 24,
      color: P.subtitleColor, font: { ascii: 'Times New Roman' } })]
  }));

  // Meta lines
  const metaLines = [
    'Autonomous Regulatory Compliance Agent Swarm',
    'Global Maritime Freight Operations',
    'July 2026'
  ];
  for (const line of metaLines) {
    children.push(new Paragraph({
      indent: { left: padL + 200 },
      spacing: { after: 80 },
      border: { left: accentLeft },
      children: [new TextRun({ text: line, size: 24, color: P.metaColor,
        font: { ascii: 'Times New Roman' } })]
    }));
  }

  // Bottom line
  children.push(new Paragraph({ spacing: { before: 3000 } }));
  children.push(new Paragraph({
    indent: { left: padL },
    border: { top: { style: BorderStyle.SINGLE, size: 2, color: c(P.accent), space: 8 } },
    children: [new TextRun({ text: 'Maritime Global Compliance Swarm  |  Confidential', size: 16,
      color: P.footerColor, font: { ascii: 'Times New Roman' } })]
  }));

  return [new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: { type: 'FIXED' },
    borders: allNoBorders,
    rows: [new TableRow({
      height: { value: 16838, rule: 'exact' },
      children: [new TableCell({
        shading: { type: ShadingType.CLEAR, fill: P.bg },
        borders: noBorders,
        children
      })]
    })]
  })];
}

// ── Body Content ──
const bodyContent = [
  // ── 3. Executive Summary ──
  h1('3. Executive Summary'),
  body('This roadmap presents a structured, three-tier evolution strategy for the Maritime Global Compliance Swarm, charting a course from the current reactive compliance automation platform (v2.0) to a predictive, knowledge-driven regulatory intelligence system (v5.0). The strategy is grounded in the existing architecture, specifically the event-driven backbone, the 10-state finding lifecycle state machine, and the polyglot microservice boundary between the Python FastAPI gateway and the Go MTTR tracker service. Each tier compounds upon the investments of the prior tier, ensuring that architectural decisions made today create optionality rather than technical debt.'),
  body('Tier 1 delivers immediate, high-return improvements that integrate directly with the current event bus and state machine. Composite risk scoring introduces multi-dimensional weighted heuristics to replace static severity labels, while the compliance knowledge graph transforms flat finding records into a queryable relational network. Parallel state tracks extend the finding lifecycle to accommodate real-world compliance workflows involving legal review, evidence collection, and regulatory notification. These three initiatives require no new infrastructure and maintain full backward compatibility with the existing 45 REST routes and 7 reaction rules.'),
  body('Tier 2 establishes the structural foundation required for long-term platform resilience. Event sourcing with CQRS converts the existing EventLog and FindingTransition tables into an immutable audit trail with separate read and write models, mirroring patterns proven in financial trading platforms. A composable middleware pipeline replaces the current sequential reaction evaluation with a testable, independently deployable chain of enrichment, deduplication, and routing concerns. An integrated observability stack provides the operational visibility essential for managing a polyglot system across multiple services.'),
  body('Tier 3 pursues transformative capabilities that position the platform at the frontier of maritime compliance technology. Satellite and AIS data integration enables real-time vessel tracking correlation with compliance events, predictive compliance intelligence applies machine learning to historical data for proactive risk identification, and digital twin compliance simulation creates a virtual environment for what-if analysis of regulatory changes and operational scenarios.'),

  // ── 4. Current Architecture Assessment ──
  h1('4. Current Architecture Assessment'),
  body('The Maritime Global Compliance Swarm operates through four core autonomous agents coordinated by an event-driven architecture. The PII Anonymiser scans EDI payloads for personally identifiable information using a hybrid detection engine combining regex pattern matching with spaCy NER fallback for free-text fields. The EDI Auditor validates message structures, mandatory field presence, and code-list compliance against jurisdiction-specific regulatory profiles. The Remediation Generator produces corrective policy recommendations and EDI update scripts tailored to each finding type and affected partner. The MTTR Tracker, implemented in Go for throughput-sensitive telemetry ingestion, maintains buffered write pipelines with background flushing to record resolution times across finding categories.'),
  body('The 10-state finding lifecycle state machine is the architectural backbone. States span the full compliance arc from DETECTED through TRIAGED, ASSIGNED, IN_REMEDIATION, AWAITING_VERIFICATION, VERIFIED, and CLOSED, with ESCALATED, RISK_ACCEPTED, and FALSE_POSITIVE as terminal or exception paths. Twenty validated transitions connect these states, enforced by guard conditions that prevent invalid state changes. Seven trigger types initiate transitions, and timeout SLA rules enable automatic escalation when resolution windows are breached. The FindingTransition table records every state change with timestamps, actor identities, and contextual payloads, providing the audit trail that maritime regulators require.'),
  body('The FastAPI gateway exposes 45 REST routes covering finding management, agent orchestration, MTTR reporting, and system health. An in-process event bus bridges the state machine to the reaction engine, which evaluates seven autonomous reaction rules on each state transition. The Go MTTR tracker receives events via a lightweight HTTP bridge, demonstrating a viable polyglot service boundary. The interactive HTML dashboard consumes aggregated data from both services.'),
  body('Despite these strengths, the architecture exhibits three structural limitations that constrain its evolution. First, findings carry a static severity classification (critical, high, medium, low, info) that does not account for risk velocity, recurrence probability, jurisdictional exposure, or data sensitivity gradients. Two findings labelled "high" may represent vastly different actual risk profiles yet are treated identically by the state machine. Second, findings exist as isolated records without relational context; recurring patterns across partners, routes, data domains, and regulatory frameworks cannot be expressed or queried efficiently. Third, the operational database serves both write and read workloads, a coupling that will degrade performance as event volume and query complexity grow.'),

  // ── 5. Tier 1 ──
  h1('5. Tier 1: Immediate High-Value Iterations'),
  h2('5.1 Composite Risk Scoring'),
  body('The most impactful near-term enhancement is the introduction of a composite risk score that replaces the static severity label as the primary triage signal. This score combines five weighted dimensions into a single numeric value, computed as each finding enters the TRIAGED state and updated dynamically as new evidence accumulates. The five dimensions are: severity (the original classifier output, weighted at approximately 25%), jurisdictional exposure (penalty severity weighted by regulatory regime, approximately 20%), data sensitivity gradient (financial identifiers and government-issued documents carrying higher re-identification risk than contact information, approximately 20%), exposure breadth (number of partners, routes, and data domains affected by the same underlying issue, approximately 20%), and temporal urgency (proximity to regulatory filing deadlines and SLA windows, approximately 15%).'),
  body('Integration with the existing 10-state FSM is straightforward. The composite score is computed by a dedicated scoring service that subscribes to the event bus and attaches its output to the finding record before the TRIAGED-to-ASSIGNED transition is evaluated. Guard conditions are then extended to reference the composite score: a finding with a score exceeding a configurable threshold can be automatically escalated to ESCALATED without waiting for the timeout SLA to expire. This enables risk-proportional response times where genuinely critical findings receive immediate attention while lower-risk findings follow the standard workflow. Crucially, each factor contribution remains individually queryable, ensuring that the scoring logic remains explainable to regulators and compliance officers.'),
  body('The implementation requires no new infrastructure. The scoring service is a Python module that reads from the existing event bus and writes to the finding record. Historical finding data can be backfilled to establish baseline score distributions and calibrate weight thresholds. The initial weights are heuristically derived from regulatory penalty structures and can be refined empirically as the system accumulates resolved finding outcomes.'),

  h2('5.2 Compliance Knowledge Graph'),
  body('A compliance knowledge graph transforms the system from a record-keeping tool into an analytical platform capable of reasoning about cross-jurisdictional regulatory relationships. The graph structure connects five core entity types: regulations (GDPR articles, LGPD requirements, CBP mandates, SOLAS provisions), jurisdictions (EU, Brazil, US, Singapore, with their specific enforcement patterns), data categories (PII types from the anonymiser taxonomy, EDI field classifications), compliance obligations (data retention limits, encryption standards, consent requirements, notification duties), and findings (linked to all preceding entities through their evidence payloads).'),
  body('Key query patterns that this graph enables include cross-jurisdictional conflict detection (identifying where obligations from different regulatory regimes impose contradictory requirements on the same data element), recurrence analysis (tracing repeated findings across partners, routes, and jurisdictions to identify systemic compliance gaps), remediation effectiveness measurement (correlating remediation policies with downstream finding recurrence rates), and regulatory impact assessment (evaluating how a proposed regulation change would propagate through the existing finding and obligation network). These queries are either impossible or prohibitively expensive with the current flat relational schema.'),
  body('The initial implementation can use SQLite-backed adjacency tables without requiring a dedicated graph database. Three edge types provide immediate value: Finding-to-Partner (via EDI connection profiles), Finding-to-DataField (via evidence payloads), and Remediation-to-Finding (via policy identifiers stored on findings). Additional edge types for route correlation, jurisdiction mapping, and temporal patterns are added incrementally as analytical needs evolve. The graph data is maintained by lightweight event bus subscribers that update adjacency tables in response to state transitions and new finding creation, ensuring consistency with the primary data store.'),

  h2('5.3 Parallel State Tracks'),
  body('Real compliance workflows frequently require concurrent processing tracks that the current single-state model cannot represent. A finding in IN_REMEDIATION may simultaneously require legal review approval, regulatory agency notification, stakeholder communication, and documentary evidence collection. The current architecture forces these parallel processes into sequential dependencies, introducing artificial delays and creating incomplete audit trails for activities that occur alongside but independently of the main finding lifecycle.'),
  body('The recommended approach introduces parallel state machines that run alongside the primary 10-state lifecycle. Three secondary tracks address the most common workflow requirements: an approval workflow (DRAFT, UNDER_REVIEW, APPROVED, REJECTED), an evidence collection workflow (COLLECTING, SUBMITTED, ACCEPTED, INSUFFICIENT), and a regulatory notification workflow (NOTIFICATION_DUE, SENT, ACKNOWLEDGED, DISPUTE_OPEN). Each track is stored in a dedicated junction table linked to the parent finding, preserving complete backward compatibility with the existing state machine implementation.'),
  body('The parallel tracks subscribe to the same event bus and transition based on events from the primary state machine or from external triggers (legal review completion, evidence submission, regulatory acknowledgement). Guard conditions can reference parallel track states: for example, the IN_REMEDIATION to VERIFIED transition might require both the evidence track to be in ACCEPTED and the approval track to be in APPROVED. This compositional approach allows workflow complexity to grow without modifying the core state machine, maintaining the architectural invariant that the 10-state model remains the single source of truth for finding status.'),

  // ── 6. Tier 2 ──
  h1('6. Tier 2: Structural Foundation Upgrades'),
  h2('6.1 Event Sourcing and CQRS'),
  body('The project already maintains an EventLog table and a FindingTransition table that collectively record the full history of state changes. Event sourcing elevates this existing pattern into an architectural invariant: the event log becomes the single authoritative source of truth, and all other data representations are derived materialised projections. Under this model, the current state of any finding is computed by replaying its event history rather than stored as a mutable field. This is the pattern used by financial trading platforms such as LMAX Disruptor and incident management systems such as PagerDuty, where complete auditability and temporal queryability are non-negotiable requirements.'),
  body('The benefits for a compliance platform are substantial. Every state change exists as an immutable event with a timestamp, actor, context payload, and sequence number, providing complete auditability by construction rather than by convention. Time-travel queries become possible: the system can answer "what was the state of all EU-route findings on June 1st?" by replaying events up to that point. Debugging is simplified because the full causal chain of any finding state is a single ordered event stream. Data corruption resilience is inherent because any projection can be discarded and rebuilt from the event log.'),
  body('The CQRS (Command Query Responsibility Segregation) complement separates write and read models. The event store accepts all writes (state transitions, new findings, reaction executions), while denormalised read projections serve queries independently. The Go MTTR tracker already demonstrates this pattern: it receives events via HTTP and maintains its own read model. This separation is extended to dashboard statistics, compliance summaries, and partner-level analytics. Write performance is never degraded by complex read queries, and read models can be independently optimised for their specific access patterns. The migration path is incremental: a state_version field tracks the last applied event, new writes go through the event store first, and existing data is backfilled by replaying historical transitions.'),

  h2('6.2 Middleware Pipeline Architecture'),
  body('The current seven reaction rules are loaded at startup and evaluated sequentially in response to each event. A middleware pipeline architecture replaces this monolithic evaluation with a composable chain of independently testable processing stages. Each middleware in the chain receives an event, performs a specific cross-cutting concern, and passes a (potentially modified) event to the next stage. The pipeline operates between event publication and reaction execution, providing a clean separation of concerns.'),
  body('Five initial middleware stages address the most pressing cross-cutting needs. An authentication and authorisation middleware validates the event source and verifies that the originating agent has permission to trigger the requested transition. A rate-limiting middleware caps escalation frequency per partner to prevent notification fatigue and operational overload. An enrichment middleware augments events with partner context, jurisdiction weights, historical finding counts, and composite risk scores before reactions evaluate them. A deduplication middleware suppresses duplicate alerts within a configurable time window, collapsing repeated similar findings into a single escalated notification. A routing middleware dispatches enriched events to the correct reaction handler based on the augmented data, replacing the current linear evaluation with targeted dispatch.'),
  body('Each middleware is independently testable with mock events, independently deployable without modifying the reaction rules, and reorderable without code changes through configuration. This is the pattern used by production event processing systems including Kafka Streams processors and AWS EventBridge Pipes. The interface contract is simple: each middleware receives an event context and returns either a modified event (enrichment), a suppressed event (deduplication), or a passthrough event (no-op), along with a status indicator that determines whether downstream processing continues.'),

  h2('6.3 Observability Stack'),
  body('The polyglot architecture spanning Python and Go services demands a unified observability layer that transcends language-specific logging. The recommended stack comprises four pillars: structured logging using JSON-formatted output with correlation IDs that trace a single finding across both services, distributed tracing using OpenTelemetry instrumentation that follows requests from the FastAPI gateway through the event bus to the Go MTTR tracker, metrics collection exposing Prometheus-format counters and histograms for finding throughput, transition latency, reaction execution time, and composite risk score distributions, and health dashboards consolidating service status, SLA compliance rates, and alerting thresholds into a single operational view.'),
  body('Structured logging is the highest-priority pillar because it provides immediate debugging value with minimal implementation effort. Each log entry includes the finding ID, transition type, actor, timestamp, and service identity, enabling cross-service correlation through simple log aggregation. Distributed tracing is added incrementally by instrumenting the HTTP bridge between Python and Go services, providing end-to-end request latency visibility. Metrics collection extends the existing MTTR telemetry with system-level operational metrics, enabling proactive capacity planning and performance anomaly detection before they impact compliance SLAs.'),

  // ── 7. Tier 3 ──
  h1('7. Tier 3: Transformative Vision'),
  h2('7.1 Satellite and AIS Data Integration'),
  body('Maritime compliance does not exist in a purely digital context. Vessel movements, port calls, transshipment operations, and environmental conditions create a rich operational data layer that directly correlates with compliance events. Integrating real-time Automatic Identification System (AIS) vessel tracking data with the compliance swarm enables spatiotemporal correlation between physical operations and regulatory findings. A finding flagged during vessel transit through EU territorial waters carries different urgency and jurisdictional implications than one generated while the vessel is in international waters.'),
  body('The integration architecture extends the event bus with external data source adapters. An AIS feed processor ingests vessel position reports, port arrival and departure events, and route deviation alerts. A weather data adapter provides environmental context that affects certain compliance categories, such as temperature-sensitive cargo documentation and emissions reporting. An environmental monitoring adapter captures real-time data on emission zones, ballast water exchange requirements, and protected marine area proximity. Each adapter publishes events to the existing event bus, making external data available to the reaction engine, composite risk scorer, and knowledge graph without modifying their internal logic.'),
  body('Practical applications include jurisdiction-aware finding routing (automatically assigning findings based on the vessel current or recent port calls), voyage-contextual risk scoring (adjusting composite scores based on route complexity and environmental conditions), and regulatory deadline tracking (correlating filing deadlines with estimated port arrival times to trigger proactive compliance actions). The existing 45 REST routes are extended with vessel-centric query endpoints, while the dashboard gains a map layer showing real-time compliance status alongside vessel positions.'),

  h2('7.2 Predictive Compliance Intelligence'),
  body('Predictive compliance intelligence applies machine learning models to historical compliance data to identify risks before they manifest as findings. The foundation is a labelled dataset of resolved findings with known outcomes (resolved without recurrence, recurred within 90 days, escalated to regulatory body, resolved as false positive). The Tier 1 knowledge graph and Tier 2 event store provide the structured training data required for meaningful model development, which is why this capability is positioned in Tier 3 rather than earlier.'),
  body('Three model categories address distinct prediction targets. A recurrence prediction model estimates the probability that a remediated finding will reappear within a given time window, enabling compliance teams to prioritise partners and data domains with the highest recurrence risk. An anomaly detection model identifies unusual patterns in EDI message flows, partner behaviour, and finding distributions that may indicate emerging compliance risks before they trigger formal findings. A risk trajectory model projects the composite risk score evolution for active findings based on historical resolution patterns, enabling proactive resource allocation to findings likely to escalate.'),
  body('Model outputs are integrated into the existing workflow as advisory signals rather than autonomous actions. A predicted recurrence probability above a configurable threshold triggers a notification to the compliance team alongside the finding, providing human decision-makers with additional context without removing their authority. Model predictions are logged alongside the events that informed them, maintaining the audit trail and explainability requirements that maritime regulators demand. The models are retrained on a scheduled cadence using the event store as the training data source, ensuring that predictions reflect current operational patterns rather than stale historical baselines.'),

  h2('7.3 Digital Twin Compliance Simulation'),
  body('A digital twin of the compliance posture creates a virtual replica of the entire regulatory compliance landscape that can be subjected to what-if analysis without affecting the operational system. The twin mirrors the current state of all findings, partner profiles, jurisdiction mappings, and regulatory obligations derived from the event store and knowledge graph. It supports scenario simulation where proposed regulatory changes, partner onboarding events, or operational procedure modifications are applied to the twin and their cascading effects observed across the compliance network.'),
  body('Regulation impact simulation evaluates how a proposed regulatory change would propagate through the existing finding and obligation graph, identifying affected partners, data categories, and remediation policies before the regulation takes effect. Partner risk simulation models the compliance impact of onboarding a new trading partner by injecting their EDI profile into the twin and observing predicted finding patterns. Operational scenario testing simulates the effect of changes to detection rules, remediation policies, or escalation thresholds on system-wide metrics such as MTTR, false positive rates, and SLA compliance. The twin is rebuilt from the event store on demand, ensuring it reflects the latest operational state while remaining isolated from production traffic.'),

  // ── 8. Implementation Roadmap ──
  h1('8. Implementation Roadmap'),
  body('The implementation follows a phased timeline aligned with the three-tier structure, with each phase building on the completed investments of the prior phase. Dependencies between initiatives within each tier are minimised to enable parallel development streams, while dependencies across tiers are explicit and gate subsequent work.'),
  bodyNoIndent('Tier 1 (Months 1 to 3) delivers the three immediate initiatives in parallel development streams. Composite risk scoring leads the timeline because it integrates most directly with the existing state machine and provides the foundational scoring signal used by subsequent tiers. The compliance knowledge graph follows in parallel, beginning with the three core edge types and expanding based on early analytical usage patterns. Parallel state tracks begin in month two after the risk scoring integration is stable, allowing the parallel track guard conditions to reference composite scores from the start. Estimated team allocation is two to three engineers. Key milestones include composite risk score production deployment by end of month one, knowledge graph v1 with partner and data field edges by end of month two, and approval and evidence workflow tracks operational by end of month three.'),
  bodyNoIndent('Tier 2 (Months 4 to 9) addresses the structural foundation. Event sourcing migration begins in month four with the introduction of the event store as the canonical write target, followed by CQRS read projection implementation in months five and six. The middleware pipeline is developed in months five through seven, with each middleware stage introduced incrementally and validated against the existing reaction rule suite. The observability stack is deployed progressively: structured logging in month four, distributed tracing instrumentation in months six and seven, and metrics collection with dashboard integration in months eight and nine. Estimated team allocation expands to three to four engineers. The key milestone is full event sourcing migration completion by end of month six, after which all Tier 3 capabilities can rely on a complete, immutable audit trail as their data foundation.'),
  bodyNoIndent('Tier 3 (Months 10 to 24) pursues the transformative capabilities. Satellite and AIS data integration begins in month ten with the external adapter framework, followed by vessel tracking feed integration in months eleven and twelve. Predictive compliance intelligence development starts in month thirteen, after the event store and knowledge graph have accumulated sufficient historical data to support meaningful model training. Digital twin simulation is the final capability, developed in months eighteen through twenty-four, because it depends on the full maturity of the knowledge graph, event store, and predictive models. Team allocation at this stage includes two to three engineers plus a data scientist for the ML components.'),

  // ── Roadmap Table ──
  makeTable(
    ['Tier', 'Initiative', 'Timeline', 'Key Milestone'],
    [
      ['1', 'Composite Risk Scoring', 'Month 1', 'Score in production, guard conditions active'],
      ['1', 'Compliance Knowledge Graph', 'Month 2', 'Partner and data field edges operational'],
      ['1', 'Parallel State Tracks', 'Month 3', 'Approval and evidence workflows live'],
      ['2', 'Event Sourcing + CQRS', 'Month 4-6', 'Event store as canonical source, read projections active'],
      ['2', 'Middleware Pipeline', 'Month 5-7', 'Five middleware stages in production'],
      ['2', 'Observability Stack', 'Month 4-9', 'Structured logging, tracing, metrics, dashboards'],
      ['3', 'Satellite & AIS Integration', 'Month 10-12', 'Vessel tracking feed correlated with findings'],
      ['3', 'Predictive Compliance Intelligence', 'Month 13-18', 'Recurrence and anomaly models deployed'],
      ['3', 'Digital Twin Simulation', 'Month 18-24', 'What-if analysis for regulation impact'],
    ]
  ),

  // ── 9. Risk Analysis ──
  h1('9. Risk Analysis and Mitigation'),
  body('Four primary risks attend this evolutionary roadmap, each requiring explicit mitigation strategies. Complexity creep is the most insidious risk: each tier adds architectural sophistication, and without disciplined governance the system may become harder to operate than the compliance problems it solves. Mitigation requires that every new component must demonstrably simplify an existing operational pain point, not merely add capability. The middleware pipeline and event sourcing architecture both serve this test because they replace implicit coupling with explicit, testable contracts. Architectural decision records must document the rationale for each addition, and quarterly architecture reviews should evaluate whether any component should be simplified or removed.'),
  body('Data quality risk affects Tier 1 (risk scoring) and Tier 3 (predictive intelligence) most directly. The composite risk score is only as reliable as the input dimensions, and predictive models trained on noisy or incomplete historical data will produce unreliable projections. Mitigation involves establishing data quality metrics for each scoring dimension, implementing automated data quality checks as part of the Tier 2 observability stack, and designing predictive models with explicit confidence intervals that degrade gracefully when input data quality is below threshold. The event sourcing architecture in Tier 2 provides the data lineage tracking required to diagnose data quality issues at their source.'),
  body('Regulatory uncertainty is inherent in maritime compliance, where frameworks evolve in response to geopolitical events, environmental concerns, and technological change. The knowledge graph and digital twin capabilities are specifically designed to absorb regulatory change gracefully, but the initial graph schema and twin model must be sufficiently flexible to accommodate regulation types that do not yet exist. Mitigation involves designing the graph with a generic obligation entity type rather than encoding specific regulatory structures, and maintaining a regulatory change monitoring feed that triggers graph updates when new regulations are promulgated.'),
  body('Team skills gap risk emerges primarily in Tier 2 and Tier 3, where event sourcing, CQRS, distributed tracing, and machine learning require specialised expertise not present in the current team composition. Mitigation involves phased hiring aligned with tier timelines, investment in training programmes during Tier 1 (while the technical complexity is manageable), and strategic use of consultant expertise for the initial event sourcing migration and ML model architecture, transitioning knowledge to the internal team through pair programming and documented decision records.'),

  // ── 10. Expected Benefits ──
  h1('10. Expected Benefits and Success Metrics'),
  body('The three-tier evolution strategy targets measurable improvements across four compliance performance dimensions. Mean time to remediation (MTTR) is expected to decrease through faster triage (composite risk scoring prioritises genuinely critical findings), reduced false positive overhead (knowledge graph contextualisation prevents unnecessary escalation), and proactive issue identification (predictive intelligence catches emerging risks before they become formal findings). The current MTTR tracked by the Go service establishes the baseline; a reduction of 20 to 40 percent is projected within the first twelve months as Tier 1 and Tier 2 capabilities reach maturity.'),
  body('False positive rate improvement is driven by the composite risk score and knowledge graph working in tandem. The risk score weights recurrence probability, so first-time minor discrepancies from compliant partners receive lower priority than recurring issues from problematic partners. The knowledge graph enables partner-level and route-level baseline profiling that distinguishes systematic non-compliance from isolated anomalies. A false positive rate reduction of 30 to 50 percent is projected as these systems accumulate historical data and calibrate their scoring weights against actual outcomes.'),
  body('Cross-jurisdictional compliance coverage expands from the current single-jurisdiction audit model to a unified multi-jurisdictional view. The knowledge graph maps regulatory obligations across jurisdictions and identifies conflicts, enabling the system to flag findings that satisfy one jurisdiction but violate another. Satellite and AIS integration adds operational context that determines which jurisdiction applies based on vessel position and route. The target is coverage of the five primary maritime regulatory regimes (EU GDPR, LGPD, US CBP, Singapore PDPA, and IMO SOLAS) with automated conflict detection between them.'),
  body('Predictive accuracy is the long-term success metric for Tier 3 capabilities. The recurrence prediction model targets a precision of at least 70 percent (meaning at least 70 percent of predicted recurrences actually recur) with recall above 60 percent (catching at least 60 percent of actual recurrences). These thresholds are calibrated against the baseline recurrence rate in historical data and are designed to provide meaningful decision support without generating excessive false alarms. The digital twin capability is measured by its simulation fidelity: the gap between simulated and actual compliance outcomes for historical scenarios should narrow below 15 percent within six months of deployment.'),
];

// ── Document Assembly ──
const doc = new Document({
  styles: {
    default: {
      document: {
        run: { font: { ascii: 'Times New Roman', eastAsia: 'SimSun' }, size: 24, color: c(P.body) },
        paragraph: { spacing: { line: 312 } }
      }
    },
    heading1: {
      run: { font: { ascii: 'Times New Roman', eastAsia: 'SimHei' }, size: 32, bold: true, color: c(P.primary) },
      paragraph: { alignment: AlignmentType.CENTER, spacing: { before: 480, after: 200, line: 312 } }
    },
    heading2: {
      run: { font: { ascii: 'Times New Roman', eastAsia: 'SimHei' }, size: 30, bold: true, color: c(P.primary) },
      paragraph: { spacing: { before: 360, after: 160, line: 312 } }
    },
    heading3: {
      run: { font: { ascii: 'Times New Roman', eastAsia: 'SimHei' }, size: 28, bold: true, color: c(P.primary) },
      paragraph: { spacing: { before: 280, after: 120, line: 312 } }
    }
  },
  sections: [
    // Section 1: Cover (no page number, no header/footer)
    {
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 0, bottom: 0, left: 0, right: 0 }
        }
      },
      children: buildCover()
    },
    // Section 2: TOC (Roman page numbers)
    {
      properties: {
        type: SectionType.NEXT_PAGE,
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 1440, bottom: 1440, left: 1701, right: 1417 },
          pageNumbers: { start: 1, formatType: NumberFormat.UPPER_ROMAN }
        }
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ size: 18, color: P.footerColor,
              children: [{ type: 'instrText', text: 'PAGE \\* ROMAN \\* MERGEFORMAT' }] })]
          })]
        })
      },
      children: [
        new Paragraph({
          spacing: { before: 200, after: 200, line: 312 },
          children: [new TextRun({ text: 'Contents', bold: true, size: 36, color: c(P.primary),
            font: { ascii: 'Times New Roman', eastAsia: 'SimHei' } })]
        }),
        new TableOfContents('Table of Contents', {
          hyperlink: true,
          headingStyleRange: '1-2'
        }),
        new Paragraph({
          spacing: { before: 200, after: 200 },
          children: [new TextRun({ text: 'Right-click the table of contents and select \u201cUpdate Field\u201d to refresh page numbers.',
            italics: true, size: 20, color: '808080',
            font: { ascii: 'Times New Roman' } })]
        }),
        new Paragraph({ children: [new PageBreak()] })
      ]
    },
    // Section 3: Body (Arabic page numbers from 1)
    {
      properties: {
        type: SectionType.NEXT_PAGE,
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 1440, bottom: 1440, left: 1701, right: 1417 },
          pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL }
        }
      },
      headers: {
        default: new Header({
          children: [new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: 'Strategic Evolution Roadmap', size: 18, color: '808080',
              font: { ascii: 'Times New Roman' } })]
          })]
        })
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ children: [PageNumber.CURRENT], size: 18, color: '808080' })]
          })]
        })
      },
      children: bodyContent
    }
  ]
});

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync('/home/z/my-project/download/Strategic_Roadmap_Maritime_Compliance_Swarm.docx', buf);
  console.log('DOCX generated successfully');
}).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
