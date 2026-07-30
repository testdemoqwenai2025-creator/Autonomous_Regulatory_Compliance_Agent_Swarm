"""
Compliance Knowledge Graph Foundation Module.

Provides the data structures and query interface for a compliance knowledge
graph that connects regulations, jurisdictions, data categories, compliance
obligations, and enforcement actions. This module implements the foundational
schema and in-memory graph store; in production, this would connect to a
graph database (Neo4j, Amazon Neptune, or PostgreSQL with Apache AGE).

The knowledge graph enables:
- Cross-jurisdictional conflict detection
- Obligation chaining (one regulation triggers another)
- Impact analysis for regulatory changes
- Compliance gap detection across jurisdictions
"""

from __future__ import annotations

import hashlib
import uuid
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional


# ---------------------------------------------------------------------------
# Node and Edge Types
# ---------------------------------------------------------------------------

class NodeType(str, Enum):
    """Types of nodes in the compliance knowledge graph."""
    REGULATION = "regulation"           # e.g., GDPR Art. 25
    JURISDICTION = "jurisdiction"       # e.g., EU, California, Brazil
    DATA_CATEGORY = "data_category"     # e.g., PII, financial, health
    OBLIGATION = "obligation"           # e.g., data protection by design
    ENFORCEMENT_ACTION = "enforcement"  # e.g., fine, warning, injunction
    DATA_SOURCE = "data_source"         # e.g., AIS, FMS, EDI
    RISK_CATEGORY = "risk_category"     # e.g., pii_exposure
    COMPLIANCE_CONTROL = "control"      # e.g., encryption, anonymisation
    ORGANISATION_UNIT = "org_unit"      # e.g., carrier, port, customs
    MARITIME_REGION = "region"          # e.g., Arctic NSR, Gulf of Aden


class EdgeType(str, Enum):
    """Types of relationships between nodes."""
    REGULATED_BY = "regulated_by"           # data_category -> regulation
    APPLIES_IN = "applies_in"               # regulation -> jurisdiction
    REQUIRES = "requires"                   # obligation -> control
    TRIGGERS = "triggers"                   # regulation -> obligation
    ENFORCED_VIA = "enforced_via"           # jurisdiction -> enforcement
    CONFLICTS_WITH = "conflicts_with"       # regulation -> regulation
    CONTAINS = "contains"                   # jurisdiction -> region
    PROCESSED_BY = "processed_by"           # data_source -> org_unit
    MITIGATES = "mitigates"                 # control -> risk_category
    SUPERSEDES = "supersedes"               # regulation -> regulation
    REFERENCES = "references"               # obligation -> regulation


# ---------------------------------------------------------------------------
# Graph Data Structures
# ---------------------------------------------------------------------------

@dataclass
class GraphNode:
    """A node in the compliance knowledge graph."""
    id: str
    node_type: NodeType
    label: str
    properties: dict = field(default_factory=dict)
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    def __post_init__(self):
        if not self.id:
            self.id = str(uuid.uuid4())


@dataclass
class GraphEdge:
    """A directed edge in the compliance knowledge graph."""
    id: str
    source_id: str
    target_id: str
    edge_type: EdgeType
    properties: dict = field(default_factory=dict)
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    def __post_init__(self):
        if not self.id:
            self.id = str(uuid.uuid4())


@dataclass
class PathResult:
    """Result of a graph traversal query."""
    source_id: str
    target_id: str
    path: list[str]          # Ordered list of node IDs
    edge_types: list[str]    # Edge types along the path
    total_weight: float = 0.0


# ---------------------------------------------------------------------------
# In-Memory Knowledge Graph Store
# ---------------------------------------------------------------------------

class ComplianceKnowledgeGraph:
    """In-memory compliance knowledge graph with traversal query support.

    This implementation uses adjacency lists for O(1) edge lookups and
    BFS/DFS for path queries. In production, this would be replaced with
    a graph database backend.

    Example usage:
        kg = ComplianceKnowledgeGraph()
        gdpr = kg.add_node(NodeType.REGULATION, "GDPR", {"article": "25"})
        eu = kg.add_node(NodeType.JURISDICTION, "European Union")
        kg.add_edge(gdpr.id, eu.id, EdgeType.APPLIES_IN)
    """

    def __init__(self):
        self._nodes: dict[str, GraphNode] = {}
        self._edges: dict[str, GraphEdge] = {}
        # Adjacency lists: {node_id: {edge_type: [target_node_ids]}}
        self._outgoing: dict[str, dict[str, list[str]]] = defaultdict(lambda: defaultdict(list))
        self._incoming: dict[str, dict[str, list[str]]] = defaultdict(lambda: defaultdict(list))

    # -- Mutation operations --

    def add_node(self, node_type: NodeType, label: str,
                 properties: Optional[dict] = None, node_id: Optional[str] = None) -> GraphNode:
        """Add a node to the graph. Returns the created node."""
        node = GraphNode(
            id=node_id or str(uuid.uuid4()),
            node_type=node_type,
            label=label,
            properties=properties or {},
        )
        self._nodes[node.id] = node
        return node

    def add_edge(self, source_id: str, target_id: str, edge_type: EdgeType,
                 properties: Optional[dict] = None) -> Optional[GraphEdge]:
        """Add a directed edge. Returns None if source or target doesn't exist."""
        if source_id not in self._nodes or target_id not in self._nodes:
            return None

        edge = GraphEdge(
            source_id=source_id,
            target_id=target_id,
            edge_type=edge_type,
            properties=properties or {},
        )
        self._edges[edge.id] = edge
        self._outgoing[source_id][edge_type.value].append(target_id)
        self._incoming[target_id][edge_type.value].append(source_id)
        return edge

    def remove_node(self, node_id: str) -> bool:
        """Remove a node and all its connected edges."""
        if node_id not in self._nodes:
            return False

        # Remove all outgoing edges
        for edge_type, targets in self._outgoing.get(node_id, {}).items():
            for target_id in targets:
                self._incoming[target_id][edge_type].remove(node_id)

        # Remove all incoming edges
        for edge_type, sources in self._incoming.get(node_id, {}).items():
            for source_id in sources:
                self._outgoing[source_id][edge_type].remove(node_id)

        # Remove edges from store
        edge_ids_to_remove = [
            eid for eid, e in self._edges.items()
            if e.source_id == node_id or e.target_id == node_id
        ]
        for eid in edge_ids_to_remove:
            del self._edges[eid]

        del self._nodes[node_id]
        del self._outgoing[node_id]
        del self._incoming[node_id]
        return True

    # -- Query operations --

    def get_node(self, node_id: str) -> Optional[GraphNode]:
        return self._nodes.get(node_id)

    def get_nodes_by_type(self, node_type: NodeType) -> list[GraphNode]:
        return [n for n in self._nodes.values() if n.node_type == node_type]

    def get_neighbors(self, node_id: str, edge_type: Optional[str] = None,
                      direction: str = "outgoing") -> list[GraphNode]:
        """Get neighboring nodes. Direction: 'outgoing', 'incoming', or 'both'."""
        result_ids = set()

        if direction in ("outgoing", "both"):
            adj = self._outgoing.get(node_id, {})
            if edge_type:
                result_ids.update(adj.get(edge_type, []))
            else:
                for targets in adj.values():
                    result_ids.update(targets)

        if direction in ("incoming", "both"):
            adj = self._incoming.get(node_id, {})
            if edge_type:
                result_ids.update(adj.get(edge_type, []))
            else:
                for sources in adj.values():
                    result_ids.update(sources)

        return [self._nodes[nid] for nid in result_ids if nid in self._nodes]

    def find_path(self, source_id: str, target_id: str,
                  max_depth: int = 10) -> Optional[PathResult]:
        """BFS to find shortest path between two nodes."""
        if source_id not in self._nodes or target_id not in self._nodes:
            return None
        if source_id == target_id:
            return PathResult(source_id, target_id, [source_id], [], 0.0)

        # BFS with path tracking
        from collections import deque
        queue = deque([(source_id, [source_id], [])])
        visited = {source_id}

        while queue:
            current, path, edges = queue.popleft()
            if len(path) > max_depth:
                break

            for edge_type, targets in self._outgoing.get(current, {}).items():
                for target in targets:
                    if target == target_id:
                        return PathResult(
                            source_id=source_id,
                            target_id=target_id,
                            path=path + [target],
                            edge_types=edges + [edge_type],
                        )
                    if target not in visited:
                        visited.add(target)
                        queue.append((
                            target,
                            path + [target],
                            edges + [edge_type],
                        ))

        return None  # No path found

    def find_conflicts(self, jurisdiction: str) -> list[dict]:
        """Find regulations that conflict within a jurisdiction."""
        # Get all regulations in this jurisdiction
        jur_node = None
        for n in self._nodes.values():
            if n.node_type == NodeType.JURISDICTION and jurisdiction.lower() in n.label.lower():
                jur_node = n
                break

        if not jur_node:
            return []

        regulations = self.get_neighbors(jur_node.id, EdgeType.APPLIES_IN.value, "incoming")
        conflicts = []

        for reg_a in regulations:
            for reg_b in regulations:
                if reg_a.id >= reg_b.id:
                    continue
                # Check for CONFLICTS_WITH edge
                for edge in self._edges.values():
                    if (edge.edge_type == EdgeType.CONFLICTS_WITH and
                            ((edge.source_id == reg_a.id and edge.target_id == reg_b.id) or
                             (edge.source_id == reg_b.id and edge.target_id == reg_a.id))):
                        conflicts.append({
                            "regulation_a": reg_a.label,
                            "regulation_b": reg_b.label,
                            "edge_properties": edge.properties,
                        })

        return conflicts

    def get_compliance_gaps(self, org_node_id: str) -> list[dict]:
        """Identify compliance gaps for an organisation node.

        Returns obligations that are required but not yet connected
        to a compliance control for the given organisation.
        """
        gaps = []

        # Find all obligations applicable to this org's jurisdictions
        jurisdictions = self.get_neighbors(org_node_id, EdgeType.APPLIES_IN.value, "outgoing")

        for jur in jurisdictions:
            obligations = self.get_neighbors(jur.id, EdgeType.TRIGGERS.value, "incoming")
            for obl in obligations:
                # Check if org has a control for this obligation
                controls = self.get_neighbors(org_node_id, EdgeType.REQUIRES.value, "incoming")
                has_control = any(
                    c.id in [ctrl.id for ctrl in controls]
                    for ctrl in self.get_neighbors(obl.id, EdgeType.REQUIRES.value, "outgoing")
                )
                if not has_control:
                    gaps.append({
                        "obligation": obl.label,
                        "obligation_id": obl.id,
                        "jurisdiction": jur.label,
                        "regulation": self._get_connected_regulation(obl.id),
                    })

        return gaps

    def _get_connected_regulation(self, obligation_id: str) -> Optional[str]:
        """Get the regulation that triggers this obligation."""
        regs = self.get_neighbors(obligation_id, EdgeType.TRIGGERS.value, "outgoing")
        return regs[0].label if regs else None

    # -- Graph statistics --

    def stats(self) -> dict:
        return {
            "node_count": len(self._nodes),
            "edge_count": len(self._edges),
            "node_types": dict(defaultdict(
                int,
                {n.node_type.value: sum(1 for x in self._nodes.values() if x.node_type == n.node_type)
                 for n in NodeType}
            )),
            "edge_types": dict(defaultdict(
                int,
                {e.edge_type.value: sum(1 for x in self._edges.values() if x.edge_type == e.edge_type)
                 for e in EdgeType}
            )),
        }


# ---------------------------------------------------------------------------
# Maritime Compliance Seed Data
# ---------------------------------------------------------------------------

def seed_maritime_knowledge_graph() -> ComplianceKnowledgeGraph:
    """Create and populate a knowledge graph with maritime compliance data."""
    kg = ComplianceKnowledgeGraph()

    # --- Jurisdictions ---
    jurisdictions = {
        "gdpr": kg.add_node(NodeType.JURISDICTION, "European Union (GDPR)",
                            {"code": "EU", "effective": "2018-05-25", "max_fine_pct": 4}),
        "ccpa": kg.add_node(NodeType.JURISDICTION, "California (CCPA)",
                            {"code": "US-CA", "effective": "2020-01-01", "max_fine": 7500}),
        "lgpd": kg.add_node(NodeType.JURISDICTION, "Brazil (LGPD)",
                            {"code": "BR", "effective": "2020-09-18", "authority": "ANPD"}),
        "pdpa": kg.add_node(NodeType.JURISDICTION, "Singapore (PDPA)",
                            {"code": "SG", "effective": "2012-07-02", "authority": "PDPC"}),
        "pipa": kg.add_node(NodeType.JURISDICTION, "South Korea (PIPA)",
                            {"code": "KR", "effective": "2011-09-30", "authority": "PIPC"}),
    }

    # --- Regulations ---
    regs = {
        "gdpr_art25": kg.add_node(NodeType.REGULATION, "GDPR Article 25 - Data Protection by Design",
                                   {"article": "25", "topic": "privacy by design", "jurisdiction": "gdpr"}),
        "gdpr_art32": kg.add_node(NodeType.REGULATION, "GDPR Article 32 - Security of Processing",
                                   {"article": "32", "topic": "security measures", "jurisdiction": "gdpr"}),
        "gdpr_art5": kg.add_node(NodeType.REGULATION, "GDPR Article 5 - Storage Limitation",
                                  {"article": "5(1)(e)", "topic": "data retention", "jurisdiction": "gdpr"}),
        "ccpa_1798": kg.add_node(NodeType.REGULATION, "CCPA 1798.100 - Right to Know",
                                  {"section": "1798.100", "topic": "data access", "jurisdiction": "ccpa"}),
        "ccpa_1798_105": kg.add_node(NodeType.REGULATION, "CCPA 1798.105 - Right to Delete",
                                      {"section": "1798.105", "topic": "data deletion", "jurisdiction": "ccpa"}),
        "lgpd_art46": kg.add_node(NodeType.REGULATION, "LGPD Article 46 - Legal Basis",
                                   {"article": "46", "topic": "consent", "jurisdiction": "lgpd"}),
        "pdpa_20": kg.add_node(NodeType.REGULATION, "PDPA Section 20 - Protection Obligation",
                                {"section": "20", "topic": "security", "jurisdiction": "pdpa"}),
        "pipa_15": kg.add_node(NodeType.REGULATION, "PIPA Article 15 - Consent",
                                {"article": "15", "topic": "consent", "jurisdiction": "pipa"}),
        "imo_ims": kg.add_node(NodeType.REGULATION, "IMO IMS Code - Information Security",
                                {"code": "IMS", "topic": "maritime cyber security", "jurisdiction": "international"}),
        "solas_vgm": kg.add_node(NodeType.REGULATION, "SOLAS VI/2 - Verified Gross Mass",
                                  {"regulation": "VI/2", "topic": "container weight", "jurisdiction": "international"}),
    }

    # --- Data Categories ---
    data_cats = {
        "pii": kg.add_node(NodeType.DATA_CATEGORY, "Personally Identifiable Information",
                           {"sensitivity": "high", "examples": "name, email, phone, address"}),
        "financial": kg.add_node(NodeType.DATA_CATEGORY, "Financial Data",
                                  {"sensitivity": "high", "examples": "bank account, credit card, freight rate"}),
        "gov_id": kg.add_node(NodeType.DATA_CATEGORY, "Government-Issued ID",
                               {"sensitivity": "critical", "examples": "passport, national ID, visa"}),
        "health": kg.add_node(NodeType.DATA_CATEGORY, "Health Data",
                               {"sensitivity": "critical", "examples": "medical, vaccination, disability"}),
        "location": kg.add_node(NodeType.DATA_CATEGORY, "Location Data",
                                {"sensitivity": "medium", "examples": "GPS, port, vessel route"}),
        "commercial": kg.add_node(NodeType.DATA_CATEGORY, "Commercial Data",
                                  {"sensitivity": "medium", "examples": "cargo manifest, trade terms"}),
        "operational": kg.add_node(NodeType.DATA_CATEGORY, "Operational Data",
                                   {"sensitivity": "low", "examples": "EDI config, system params"}),
    }

    # --- Obligations ---
    obligations = {
        "anon": kg.add_node(NodeType.OBLIGATION, "Anonymise or Pseudonymise PII",
                            {"priority": "high", "automated": True}),
        "encrypt": kg.add_node(NodeType.OBLIGATION, "Encrypt Data in Transit and at Rest",
                               {"priority": "critical", "automated": True}),
        "retain": kg.add_node(NodeType.OBLIGATION, "Respect Data Retention Periods",
                              {"priority": "high", "automated": True}),
        "access": kg.add_node(NodeType.OBLIGATION, "Provide Data Access Mechanism",
                              {"priority": "medium", "automated": False}),
        "delete": kg.add_node(NodeType.OBLIGATION, "Enable Data Deletion on Request",
                              {"priority": "medium", "automated": False}),
        "consent": kg.add_node(NodeType.OBLIGATION, "Obtain and Record Consent",
                               {"priority": "high", "automated": False}),
        "audit": kg.add_node(NodeType.OBLIGATION, "Maintain Compliance Audit Trail",
                             {"priority": "high", "automated": True}),
        "notify": kg.add_node(NodeType.OBLIGATION, "Notify Authorities of Breaches within 72h",
                              {"priority": "critical", "automated": True}),
    }

    # --- Controls ---
    controls = {
        "hmac": kg.add_node(NodeType.COMPLIANCE_CONTROL, "HMAC-SHA256 Tokenisation",
                            {"type": "pseudonymisation", "implementation": "anonymiser"}),
        "fernet": kg.add_node(NodeType.COMPLIANCE_CONTROL, "Fernet Encryption",
                              {"type": "encryption", "implementation": "anonymiser"}),
        "tls13": kg.add_node(NodeType.COMPLIANCE_CONTROL, "TLS 1.3 Enforcement",
                             {"type": "transport_security", "implementation": "edi_updater"}),
        "state_machine": kg.add_node(NodeType.COMPLIANCE_CONTROL, "Finding State Machine",
                                     {"type": "governance", "implementation": "state_machine"}),
        "event_bus": kg.add_node(NodeType.COMPLIANCE_CONTROL, "Event-Driven Audit Trail",
                                 {"type": "audit", "implementation": "event_bus"}),
        "mttr": kg.add_node(NodeType.COMPLIANCE_CONTROL, "MTTR Telemetry Tracking",
                            {"type": "monitoring", "implementation": "mttr_tracker"}),
    }

    # --- Maritime Regions ---
    regions = {
        "arctic": kg.add_node(NodeType.MARITIME_REGION, "Arctic Northern Sea Route",
                              {"risks": "sea_ice, polar_lows", "satellite_only": True}),
        "gulf_aden": kg.add_node(NodeType.MARITIME_REGION, "Gulf of Aden / Red Sea",
                                  {"risks": "piracy, extreme_heat", "special_compliance": True}),
        "bay_bengal": kg.add_node(NodeType.MARITIME_REGION, "Bay of Bengal",
                                  {"risks": "cyclones, monsoons", "port_closure_risk": True}),
        "caribbean": kg.add_node(NodeType.MARITIME_REGION, "Caribbean / Gulf of Mexico",
                                 {"risks": "hurricanes, storm_surge", "insurance_impact": True}),
        "malacca": kg.add_node(NodeType.MARITIME_REGION, "Strait of Malacca",
                               {"risks": "traffic_congestion, ais_gaps", "high_throughput": True}),
    }

    # --- Connect regulations to jurisdictions ---
    kg.add_edge(regs["gdpr_art25"].id, jurisdictions["gdpr"].id, EdgeType.APPLIES_IN)
    kg.add_edge(regs["gdpr_art32"].id, jurisdictions["gdpr"].id, EdgeType.APPLIES_IN)
    kg.add_edge(regs["gdpr_art5"].id, jurisdictions["gdpr"].id, EdgeType.APPLIES_IN)
    kg.add_edge(regs["ccpa_1798"].id, jurisdictions["ccpa"].id, EdgeType.APPLIES_IN)
    kg.add_edge(regs["ccpa_1798_105"].id, jurisdictions["ccpa"].id, EdgeType.APPLIES_IN)
    kg.add_edge(regs["lgpd_art46"].id, jurisdictions["lgpd"].id, EdgeType.APPLIES_IN)
    kg.add_edge(regs["pdpa_20"].id, jurisdictions["pdpa"].id, EdgeType.APPLIES_IN)
    kg.add_edge(regs["pipa_15"].id, jurisdictions["pipa"].id, EdgeType.APPLIES_IN)
    kg.add_edge(regs["imo_ims"].id, jurisdictions["gdpr"].id, EdgeType.APPLIES_IN)
    kg.add_edge(regs["imo_ims"].id, jurisdictions["pdpa"].id, EdgeType.APPLIES_IN)

    # --- Connect data categories to regulations ---
    kg.add_edge(data_cats["pii"].id, regs["gdpr_art25"].id, EdgeType.REGULATED_BY)
    kg.add_edge(data_cats["pii"].id, regs["ccpa_1798"].id, EdgeType.REGULATED_BY)
    kg.add_edge(data_cats["financial"].id, regs["gdpr_art32"].id, EdgeType.REGULATED_BY)
    kg.add_edge(data_cats["gov_id"].id, regs["gdpr_art25"].id, EdgeType.REGULATED_BY)
    kg.add_edge(data_cats["health"].id, regs["gdpr_art25"].id, EdgeType.REGULATED_BY)

    # --- Connect obligations to controls ---
    kg.add_edge(obligations["anon"].id, controls["hmac"].id, EdgeType.REQUIRES)
    kg.add_edge(obligations["anon"].id, controls["fernet"].id, EdgeType.REQUIRES)
    kg.add_edge(obligations["encrypt"].id, controls["tls13"].id, EdgeType.REQUIRES)
    kg.add_edge(obligations["audit"].id, controls["state_machine"].id, EdgeType.REQUIRES)
    kg.add_edge(obligations["audit"].id, controls["event_bus"].id, EdgeType.REQUIRES)

    # --- Connect regulations to obligations ---
    kg.add_edge(regs["gdpr_art25"].id, obligations["anon"].id, EdgeType.TRIGGERS)
    kg.add_edge(regs["gdpr_art32"].id, obligations["encrypt"].id, EdgeType.TRIGGERS)
    kg.add_edge(regs["gdpr_art5"].id, obligations["retain"].id, EdgeType.TRIGGERS)
    kg.add_edge(regs["ccpa_1798"].id, obligations["access"].id, EdgeType.TRIGGERS)
    kg.add_edge(regs["ccpa_1798_105"].id, obligations["delete"].id, EdgeType.TRIGGERS)
    kg.add_edge(regs["lgpd_art46"].id, obligations["consent"].id, EdgeType.TRIGGERS)

    # --- Connect jurisdictions to regions ---
    for region_node in regions.values():
        kg.add_edge(jurisdictions["gdpr"].id, region_node.id, EdgeType.CONTAINS)

    return kg