const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, PageNumber, AlignmentType, HeadingLevel,
  WidthType, BorderStyle, ShadingType, SectionType, PageBreak,
  TableOfContents, NumberFormat } = require('docx');
const fs = require('fs');

// ── Palette: DS-1 Deep Sea (tech report) ──
const P = {
  bg: '0B1C2C', primary: 'FFFFFF', body: '182030',
  secondary: '5B6B7D', accent: '529286', surface: 'F5F7FA',
  titleColor: 'FFFFFF', subtitleColor: 'B0B8C0', metaColor: '90989F', footerColor: '687078',
  table: { headerBg: '529286', headerText: 'FFFFFF', accentLine: '529286', innerLine: 'BECFCC', surface: 'E8ECEB' }
};
const c = h => h.replace('#','');
const NB = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const noBorders = { top: NB, bottom: NB, left: NB, right: NB };
const allNoBorders = { top: NB, bottom: NB, left: NB, right: NB, insideHorizontal: NB, insideVertical: NB };

// ── Helpers ──
function h1(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 480, after: 200, line: 312 },
    children: [new TextRun({ text, bold: true, size: 32, color: c(P.primary), font: { ascii: 'Calibri', eastAsia: 'SimHei' } })] });
}
function h2(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 360, after: 160, line: 312 },
    children: [new TextRun({ text, bold: true, size: 28, color: c(P.primary), font: { ascii: 'Calibri', eastAsia: 'SimHei' } })] });
}
function body(text) {
  return new Paragraph({ alignment: AlignmentType.LEFT, spacing: { after: 120, line: 312 },
    children: [new TextRun({ text, size: 24, color: c(P.body), font: { ascii: 'Times New Roman' } })] });
}
function bodyBold(label, text) {
  return new Paragraph({ alignment: AlignmentType.LEFT, spacing: { after: 120, line: 312 },
    children: [
      new TextRun({ text: label, bold: true, size: 24, color: c(P.primary), font: { ascii: 'Times New Roman' } }),
      new TextRun({ text, size: 24, color: c(P.body), font: { ascii: 'Times New Roman' } }),
    ] });
}
function bullet(text) {
  return new Paragraph({ alignment: AlignmentType.LEFT, spacing: { after: 80, line: 312 },
    indent: { left: 480, hanging: 240 },
    children: [
      new TextRun({ text: '\u2022  ', size: 24, color: c(P.accent), font: { ascii: 'Times New Roman' } }),
      new TextRun({ text, size: 24, color: c(P.body), font: { ascii: 'Times New Roman' } }),
    ] });
}

function makeRow(cells, isHeader = false) {
  return new TableRow({ tableHeader: isHeader, cantSplit: true,
    children: cells.map(text => new TableCell({
      width: { size: Math.floor(100 / cells.length), type: WidthType.PERCENTAGE },
      shading: isHeader
        ? { type: ShadingType.CLEAR, fill: P.table.headerBg }
        : { type: ShadingType.CLEAR, fill: 'FFFFFF' },
      borders: {
        top: { style: BorderStyle.SINGLE, size: 1, color: isHeader ? c(P.table.accentLine) : c(P.table.innerLine) },
        bottom: { style: BorderStyle.SINGLE, size: 1, color: isHeader ? c(P.table.accentLine) : c(P.table.innerLine) },
        left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
      },
      margins: { top: 60, bottom: 60, left: 120, right: 120 },
      children: [new Paragraph({
        children: [new TextRun({ text, bold: isHeader, size: 21,
          color: isHeader ? c(P.table.headerText) : c(P.body), font: { ascii: 'Calibri' } })],
      })],
    })),
  });
}

function makeTable(headers, rows) {
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [makeRow(headers, true), ...rows.map(r => makeRow(r))],
  });
}

// ── Cover (R1 Pure Paragraph Left) ──
function buildCoverR1(config) {
  const children = [];
  const padL = 1200, padR = 800;
  const accentLeft = { style: BorderStyle.SINGLE, size: 8, color: c(P.accent), space: 12 };

  children.push(new Paragraph({ spacing: { before: 4800 } }));
  children.push(new Paragraph({ indent: { left: padL, right: padR }, spacing: { after: 500 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: c(P.accent), space: 8 } },
    children: [new TextRun({ text: 'S T R A T E G I C   A N A L Y S I S', size: 18, color: c(P.accent),
      font: { ascii: 'Calibri' }, characterSpacing: 40 })],
  }));
  children.push(new Paragraph({ indent: { left: padL },
    spacing: { after: 200, line: 920, lineRule: 'atLeast' },
    children: [new TextRun({ text: 'Scaling the Maritime Compliance Swarm', size: 72, bold: true,
      color: P.titleColor, font: { ascii: 'Calibri' } })],
  }));
  children.push(new Paragraph({ indent: { left: padL }, spacing: { after: 800 },
    children: [new TextRun({ text: 'Modernisation Roadmap, Architecture Evolution, and Technology Integration Strategy',
      size: 24, color: P.subtitleColor, font: { ascii: 'Calibri' } })],
  }));
  const metaLines = ['Autonomous Regulatory Compliance Agent Swarm', 'Global Maritime Freight Operations', 'July 2026'];
  for (const line of metaLines) {
    children.push(new Paragraph({ indent: { left: padL + 200 }, spacing: { after: 80 },
      border: { left: accentLeft },
      children: [new TextRun({ text: line, size: 24, color: P.metaColor, font: { ascii: 'Calibri' } })],
    }));
  }
  children.push(new Paragraph({ spacing: { before: 3000 } }));
  children.push(new Paragraph({ indent: { left: padL, right: padR },
    border: { top: { style: BorderStyle.SINGLE, size: 2, color: c(P.accent), space: 8 } },
    children: [new TextRun({ text: 'Maritime Global Compliance Swarm  |  v2.1', size: 16, color: P.footerColor, font: { ascii: 'Calibri' } })],
  }));

  return [new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, layout: { type: 'FIXED' },
    borders: allNoBorders,
    rows: [new TableRow({ height: { value: 16838, rule: 'exact' },
      children: [new TableCell({ shading: { type: ShadingType.CLEAR, fill: P.bg },
        borders: noBorders, children })],
    })],
  })];
}

// ── Body Content ──
const bodyContent = [
  // ── Executive Summary ──
  h1('1. Executive Summary'),
  body('The Maritime Global Compliance Swarm has reached a critical inflection point. The current architecture delivers reactive compliance automation across four core tools: PII anonymisation, EDI auditing, remediation policy generation, and MTTR telemetry tracking. A unified 10-state finding lifecycle state machine governs the flow of compliance issues, while an event-driven backbone with seven autonomous reaction rules enables real-time cascading responses. The Go-based MTTR tracker operates alongside the Python gateway, demonstrating a viable polyglot microservice boundary.'),
  body('This analysis evaluates the project against industry best practices and identifies the highest-value modernisation paths that will endure as both technology and maritime regulations evolve. Rather than chasing trends, we focus on architectural investments that compound in value over time: predictive risk scoring, knowledge graph construction, event sourcing, and middleware-driven extensibility. Each recommendation is grounded in the principle that compliance systems must be explainable, auditable, and resilient to regulatory change.'),
  body('The findings are organised into three tiers. Tier 1 addresses the highest-value, lowest-risk changes that immediately improve triage quality and analytical capability. Tier 2 covers foundational modernisation patterns borrowed from production financial and compliance platforms. Tier 3 identifies common pitfalls to avoid, particularly premature machine learning adoption and premature microservices decomposition.'),

  // ── Current Architecture Assessment ──
  h1('2. Current Architecture Assessment'),
  h2('2.1 Strengths'),
  body('The event-driven architecture is the project\'s most significant architectural asset. The state machine publishes transitions to the event bus via a registered callback bridge, and the reaction engine subscribes to these events to execute autonomous responses. This loose coupling means new reaction rules can be added without modifying the state machine, and the Go MTTR tracker receives events through a lightweight HTTP bridge. The polyglot boundary between Python and Go is well-chosen: Python handles the compliance logic and gateway orchestration, while Go handles high-throughput telemetry ingestion with buffered writes and background flushing.'),
  body('The 10-state finding lifecycle (DETECTED, TRIAGED, ASSIGNED, IN_REMEDIATION, AWAITING_VERIFICATION, VERIFIED, CLOSED, ESCALATED, RISK_ACCEPTED, FALSE_POSITIVE) with 20 transitions, seven trigger types, guard conditions, and timeout SLAs represents a mature state machine design. The guard conditions prevent invalid transitions, the timeout rules enable automatic escalation for SLA breaches, and the full audit trail via the FindingTransition table provides the traceability that regulators demand. The 18 initial transitions have since expanded to 20, and the Go EventPhase model has been aligned to all 10 Python states.'),

  h2('2.2 Current Limitations'),
  body('The primary limitation is that the system is fundamentally deterministic and reactive. Findings enter the state machine at DETECTED with a static severity classification (critical, high, medium, low, info), but there is no concept of risk velocity, recurrence probability, or regulatory exposure weighting. Two findings both labelled "high" may have vastly different actual risk profiles: one might be a recurring encryption failure from a non-compliant partner, while the other might be a first-time minor format discrepancy. The state machine treats them identically.'),
  body('Additionally, findings are treated as isolated records. In reality, maritime compliance findings exist within a rich relational context: the same EDI partner may generate recurring issues across multiple routes, a single data field may trigger simultaneous PII and retention violations, and one remediation policy may address multiple findings. The current flat table structure cannot express these relationships efficiently.'),
  body('The event log and transition history are stored alongside the operational data in the same database, serving both write and read queries. As event volume grows, these workloads will compete. The MTTR proxy pattern already demonstrates the value of separate read models, but this has not been generalised across the system.'),

  // ── Tier 1 ──
  h1('3. Tier 1: High-Value, Timeless Iterations'),
  h2('3.1 Predictive Risk Scoring'),
  body('The single highest-ROI change is introducing a composite risk score that feeds into the state machine\'s guard conditions. Rather than relying solely on the static severity assigned at detection time, this score combines four weighted dimensions: finding velocity (how many similar findings appeared in the last 30 and 90 days from the same partner, route, or data domain), regulatory exposure (weighted by jurisdiction, since GDPR fines scale with revenue while LGPD has specific consent requirements), remediation difficulty (historical MTTR for the risk category), and data sensitivity gradient (financial IDs and government IDs carry higher re-identification risk than contact information or location data).'),
  body('This score would be computed as a weighted sum and attached to each finding as it enters the TRIAGED state. A key design constraint is that the score must remain explainable: regulators and compliance officers must be able to understand why a particular finding received a high risk score. This means each factor\'s contribution must be individually queryable and auditable. The score feeds into guard conditions: a TRIAGED to ASSIGNED transition could automatically escalate to ESCALATED if the composite risk exceeds a configurable threshold, without waiting for the timeout to expire. This is genuinely useful and requires no machine learning infrastructure, only weighted heuristics that improve with tuning against historical outcomes.'),

  h2('3.2 Compliance Knowledge Graph'),
  body('Building a lightweight graph that connects findings to partners, routes, jurisdictions, data fields, PII categories, GDPR articles, and remediation outcomes transforms the system from a record-keeping tool into an analytical platform. Even a SQLite-backed adjacency table implementation (without a dedicated graph database) would enable queries that are currently impossible: "show me all partners where encryption findings have recurred after remediation", or "which GDPR articles are most frequently violated by Singapore-route shipments", or "which remediation policies have the highest false-positive rate by partner region".'),
  body('The graph can be implemented incrementally. Start with three edge types: Finding-to-Partner (via EDI connection profile), Finding-to-DataField (via the evidence payload), and Remediation-to-Finding (via the remediation policy ID stored on findings). Each edge type is a simple junction table. Over time, additional edges for route correlation, jurisdiction mapping, and temporal patterns can be added without disrupting the existing schema.'),

  h2('3.3 Parallel States and Sub-Workflows'),
  body('Real compliance workflows often require parallel processing tracks that the current single-state model cannot express. A finding in IN_REMEDIATION might simultaneously need legal review, regulatory notification, or stakeholder communication. The recommended approach is to introduce composite states: a finding maintains its primary state (the current 10-state model) while optionally being in one or more parallel sub-states (PENDING_LEGAL_REVIEW, NOTIFICATION_REQUIRED, STAKEHOLDER_COORDINATION). These sub-states are tracked in a separate junction table rather than modifying the core state machine, preserving backward compatibility while adding the flexibility that compliance teams require.'),

  // ── Tier 2 ──
  h1('4. Tier 2: Modernisation That Ages Well'),
  h2('4.1 Event Sourcing as the Canonical Data Model'),
  body('The project already stores events in an EventLog table and transitions in a FindingTransition table. The next step is to make the event log the authoritative source of truth, deriving the current state of every finding by replaying its event history rather than storing state separately. This is how financial trading systems (LMAX, Nasdaq) and modern incident management platforms (Datadog, PagerDuty) are built. It provides complete auditability by construction (every state change is an immutable event with a timestamp, actor, and context payload), enables time-travel queries ("what was the state of all findings on June 1st?"), simplifies debugging (you can see exactly what happened and in what order), and makes the system resilient to data corruption (rebuild state from events).'),
  body('The migration path is incremental. Start by adding a "state_version" field to findings that tracks the last applied event. New writes go through the event store first, with the finding table becoming a materialised projection. Existing data can be backfilled by replaying historical transitions as events. The key architectural invariant is: the event log is append-only and never modified. Projections can be rebuilt at any time.'),

  h2('4.2 CQRS with Read-Optimised Projections'),
  body('The current database serves both write operations (state transitions, event publishing, finding creation) and read operations (dashboard queries, MTTR reports, findings lists, compliance summaries). The Go MTTR tracker already demonstrates the CQRS pattern: it receives events via HTTP, maintains its own read model, and serves queries independently. This pattern should be extended to all read-heavy surfaces.'),
  body('The implementation involves three changes. First, introduce a projection layer that subscribes to the event bus and maintains denormalised read models in separate tables. Second, redirect read queries to these projection tables. Third, keep the event store as the single write target. The Go MTTR tracker can continue receiving events via HTTP (it already works this way), while Python-based projections (dashboard stats, compliance summaries) subscribe directly to the in-process event bus. This separation means write performance is never degraded by complex read queries, and read models can be optimised independently for their specific access patterns.'),

  h2('4.3 Pluggable Middleware Pipeline for Reactions'),
  body('The current seven reaction rules are loaded at startup and evaluated sequentially. A more extensible architecture introduces a middleware chain between event publication and reaction execution. Each middleware performs a specific cross-cutting concern: enrichment (adding partner context, jurisdiction weights, and historical finding counts to the event payload before reactions evaluate it), deduplication (suppressing duplicate alerts within a configurable time window to prevent notification fatigue), rate limiting (capping the number of escalations per partner per hour to avoid overwhelming both the partner and the internal team), and routing (dispatching enriched events to the correct reaction based on the augmented data).'),
  body('This is how production event processing systems work (Kafka Streams, AWS EventBridge Pipes, Temporal workflows). Each middleware is independently testable, independently deployable, and can be reordered or disabled without modifying the reaction rules themselves. The interface is simple: each middleware receives an event and returns either a modified event (enrichment), a suppressed event (deduplication), or a passthrough event (no-op).'),

  // ── Tier 3 ──
  h1('5. Tier 3: Cautions and Pitfalls'),
  h2('5.1 Machine Learning: Wait for Data'),
  body('There is a strong temptation to apply machine learning to compliance automation, particularly for anomaly detection and risk prediction. However, deploying ML models before having at least 500 labelled findings with known outcomes (resolved, recurred, false positive) will produce models that are less accurate and less explainable than simple heuristic rules. ML models drift silently: a model trained on winter data may degrade during summer shipping patterns without any visible warning. Heuristic rules, by contrast, are deterministic, auditable, and require no training infrastructure. The NER detector already uses a hybrid approach (regex patterns with spaCy fallback for free-text fields), which is the appropriate level of ML integration for this stage. Scale ML investment proportionally to the volume and quality of available training data.'),

  h2('5.2 Microservices: Respect the Boundary'),
  body('The Python gateway and Go MTTR tracker represent a well-chosen service boundary: Python handles compliance logic and orchestration while Go handles throughput-sensitive telemetry. Adding more services before hitting a real scaling bottleneck will introduce operational complexity (service discovery, inter-service authentication, distributed tracing, deployment orchestration) without proportional benefit. A well-structured monolith with clear module boundaries (which the current codebase already has, with separate packages for anonymiser, auditor, remediation, and shared infrastructure) outperforms a premature microservices architecture for years. Extract a new service only when a specific component has distinct scaling, deployment, or technology requirements.'),

  // ── Prioritised Roadmap ──
  h1('6. Prioritised Implementation Roadmap'),
  body('The following table ranks each initiative by value-to-effort ratio, with estimated implementation time based on the current codebase maturity and team familiarity with the patterns involved.'),
  makeTable(
    ['Priority', 'Initiative', 'Effort', 'Impact', 'Dependencies'],
    [
      ['1', 'Composite risk scoring into guard conditions', '2-3 days', 'Immediately improves triage quality; no new infrastructure', 'None'],
      ['2', 'Finding-partner-jurisdiction graph (SQLite adjacency)', '3-4 days', 'Enables analytical queries auditors actually need', 'None'],
      ['3', 'Event sourcing: derive state from event replay', '4-5 days', 'Complete audit trail by construction; time-travel queries', 'None'],
      ['4', 'Middleware pipeline for reactions', '2-3 days', 'Extensible without code changes; independently testable', 'None'],
      ['5', 'Parallel sub-states (legal review, notifications)', '3-4 days', 'State machine reflects real compliance workflows', 'None'],
      ['6', 'CQRS read projections for dashboard', '3-4 days', 'Write/read isolation; independent query optimisation', 'Event sourcing'],
      ['7', 'ML-based anomaly detection', '2-3 weeks', 'Proactive violation prediction', '500+ labelled findings'],
      ['8', 'Additional microservice extraction', '1-2 weeks', 'Independent scaling for specific components', 'Measurable bottleneck'],
    ]
  ),

  // ── Conclusion ──
  h1('7. Conclusion'),
  body('The Maritime Compliance Swarm\'s event-driven architecture provides a strong foundation for sustained evolution. The recommended modernisation path prioritises composability and explainability over novelty. Each Tier 1 initiative builds directly on the existing event bus and state machine, requiring no new infrastructure and maintaining full backward compatibility. The event sourcing evolution in Tier 2 represents the most significant architectural shift, but it follows a well-established pattern used by financial platforms and incident management systems worldwide, reducing implementation risk.'),
  body('The project\'s greatest long-term advantage is its event backbone. Everything else, from predictive scoring to knowledge graphs to parallel workflows, builds naturally on top of that foundation. The recommended approach is to evolve the system along this axis, adding capability layers that compound in value rather than replacing the underlying architecture.'),
];

// ── Document Assembly ──
const doc = new Document({
  styles: {
    default: { document: {
      run: { font: { ascii: 'Times New Roman', eastAsia: 'SimHei' }, size: 24, color: c(P.body) },
      paragraph: { spacing: { line: 312 } },
    }},
    heading1: { run: { font: { ascii: 'Times New Roman', eastAsia: 'SimHei' }, size: 32, bold: true, color: c(P.primary) } },
    heading2: { run: { font: { ascii: 'Times New Roman', eastAsia: 'SimHei' }, size: 28, bold: true, color: c(P.primary) } },
  },
  sections: [
    // Cover section (margin 0)
    { properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 0, bottom: 0, left: 0, right: 0 } } },
      children: buildCoverR1({}),
    },
    // TOC section
    { properties: { type: SectionType.NEXT_PAGE,
      page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, bottom: 1440, left: 1701, right: 1417 },
        pageNumbers: { start: 1, formatType: NumberFormat.UPPER_ROMAN } },
      },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER,
        children: [new TextRun({ children: [PageNumber.CURRENT], size: 18, color: c(P.secondary) })] })] }) },
      children: [
        new Paragraph({ spacing: { before: 200, after: 200, line: 312 },
          children: [new TextRun({ text: 'Contents', bold: true, size: 36, color: c(P.primary), font: { ascii: 'Times New Roman' } })] }),
        new TableOfContents('Table of Contents', { hyperlink: true, headingStyleRange: '1-2' }),
        new Paragraph({ children: [new PageBreak()] }),
      ],
    },
    // Body section
    { properties: { type: SectionType.NEXT_PAGE,
      page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, bottom: 1440, left: 1701, right: 1417 },
        pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL } },
      },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER,
        children: [new TextRun({ children: [PageNumber.CURRENT], size: 18, color: c(P.secondary) })] })] }) },
      children: bodyContent,
    },
  ],
});

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync('/home/z/my-project/download/Strategic_Analysis_Maritime_Compliance_Swarm.docx', buf);
  console.log('DOCX generated successfully');
});
