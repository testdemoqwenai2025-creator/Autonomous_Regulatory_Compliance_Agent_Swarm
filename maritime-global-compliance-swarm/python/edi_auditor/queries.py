"""SQL query definitions for Freight Management System compliance audits.

Each query targets a specific compliance domain:
  1. Unencrypted EDI transmissions (GDPR Art.32, ISM Code)
  2. Missing customs documentation (WCO SAFE Framework)
  3. EDI message format non-compliance (UN/EDIFACT, ANSI X12)
  4. Data retention policy violations (GDPR Art.5(1)(e))
  5. Access control gaps (ISO 27001 A.9)

Queries are written to be database-agnostic where possible, with
PostgreSQL-specific extensions noted in comments.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Optional


class ComplianceDomain(Enum):
    """Compliance domains targeted by audit queries."""
    ENCRYPTION = "encryption"
    CUSTOMS_DOCUMENTATION = "customs_documentation"
    EDI_FORMAT = "edi_format"
    DATA_RETENTION = "data_retention"
    ACCESS_CONTROL = "access_control"
    EMISSIONS_REPORTING = "emissions_reporting"


@dataclass
class AuditQuery:
    """A single audit query with metadata for execution and reporting."""
    query_id: str
    name: str
    domain: ComplianceDomain
    description: str
    sql_template: str
    severity: str = "high"  # critical | high | medium | low
    risk_category: str = "edi_non_compliance"
    affected_tables: list[str] = field(default_factory=list)
    parameters: dict[str, Any] = field(default_factory=dict)
    remediation_hint: str = ""


# ── 1. Unencrypted EDI Transmission Checks ────────────────────────────────

QUERY_UNENCRYPTED_TRANSMISSIONS = AuditQuery(
    query_id="AUD-ENC-001",
    name="Unencrypted EDI Transmissions",
    domain=ComplianceDomain.ENCRYPTION,
    description=(
        "Identifies EDI messages transmitted without encryption. "
        "Under GDPR Art.32 and the ISM Code, personal data in shipping "
        "communications must be protected by appropriate technical measures."    ),
    sql_template="""
    SELECT 
        t.transmission_id,
        t.message_type,
        t.sender_id,
        t.receiver_id,
        t.transmitted_at,
        t.encryption_flag,
        t.file_size_bytes,
        EXTRACT(EPOCH FROM (NOW() - t.transmitted_at)) / 3600 AS age_hours
    FROM edi_transmissions t
    WHERE 
        (t.encryption_flag IS NULL OR t.encryption_flag = false)
        AND t.transmitted_at > NOW() - INTERVAL '{max_age_hours} hours'
    ORDER BY t.transmitted_at DESC
    LIMIT {batch_size}
    """.strip(),
    severity="critical",
    risk_category="unencrypted_transmission",
    affected_tables=["edi_transmissions"],
    parameters={"max_age_hours": 24, "batch_size": 1000},
    remediation_hint=(
        "Enable TLS 1.2+ for all EDI endpoints. Update connection profiles "
        "to enforce encryption. Reference: GDPR Art.32(1)(a)"
    ),
)

QUERY_UNENCRYPTED_FTP_CONNECTIONS = AuditQuery(
    query_id="AUD-ENC-002",
    name="FTP (Unencrypted) File Transfers",
    domain=ComplianceDomain.ENCRYPTION,
    description=(
        "Detects file transfers using plain FTP instead of SFTP/FTPS. "
        "Plain FTP transmits credentials and data in cleartext."
    ),
    sql_template="""
    SELECT 
        f.transfer_id,
        f.partner_id,
        f.protocol,
        f.file_name,
        f.transferred_at,
        f.file_size_bytes
    FROM file_transfers f
    WHERE 
        f.protocol IN ('FTP', 'ftp')
        AND f.transferred_at > NOW() - INTERVAL '30 days'
    ORDER BY f.transferred_at DESC
    LIMIT {batch_size}
    """.strip(),
    severity="high",
    risk_category="unencrypted_transmission",
    affected_tables=["file_transfers"],
    remediation_hint="Migrate all FTP connections to SFTP or FTPS with explicit TLS.",
)

QUERY_EXPIRED_CERTIFICATES = AuditQuery(
    query_id="AUD-ENC-003",
    name="Expired or Expiring TLS Certificates",
    domain=ComplianceDomain.ENCRYPTION,
    description=(
        "Finds EDI connection profiles with expired or soon-to-expire TLS certificates."
    ),
    sql_template="""
    SELECT 
        p.partner_id,
        p.partner_name,
        p.encryption_protocol,
        p.certificate_expiry,
        EXTRACT(DAY FROM (p.certificate_expiry - NOW())) AS days_until_expiry
    FROM edi_connection_profiles p
    WHERE 
        p.encryption_enabled = true
        AND (
            p.certificate_expiry < NOW()
            OR p.certificate_expiry < NOW() + INTERVAL '30 days'
        )
    ORDER BY p.certificate_expiry ASC
    LIMIT {batch_size}
    """.strip(),
    severity="high",
    risk_category="cert_expiry",
    affected_tables=["edi_connection_profiles"],
    remediation_hint="Renew TLS certificates immediately. Automate renewal with ACME/Let's Encrypt.",
)


# ── 2. Missing Customs Documentation Checks ───────────────────────────────

QUERY_MISSING_CUSTOMS_DOCS = AuditQuery(
    query_id="AUD-CUS-001",
    name="Shipments Missing Customs Declarations",
    domain=ComplianceDomain.CUSTOMS_DOCUMENTATION,
    description=(
        "Identifies shipments without required customs documentation. "
        "Under the WCO SAFE Framework, all cargo must be accompanied by "
        "advance cargo information (ACI) declarations."    ),
    sql_template="""
    SELECT 
        s.shipment_id,
        s.bill_of_lading,
        s.origin_port,
        s.destination_port,
        s.estimated_arrival,
        s.customs_status,
        COUNT(d.doc_id) AS document_count
    FROM shipments s
    LEFT JOIN shipment_documents d 
        ON s.shipment_id = d.shipment_id 
        AND d.doc_type IN ('CUSTOMS_ENTRY', 'CUSTOMS_DECLARATION', 'ACI', 'ENS', 'AFR')
    WHERE 
        s.customs_status NOT IN ('CLEARED', 'EXEMPT')
        AND (d.doc_id IS NULL OR COUNT(d.doc_id) = 0)
        AND s.estimated_arrival > NOW() - INTERVAL '60 days'
    GROUP BY s.shipment_id, s.bill_of_lading, s.origin_port, s.destination_port,
             s.estimated_arrival, s.customs_status
    ORDER BY s.estimated_arrival ASC
    LIMIT {batch_size}
    """.strip(),
    severity="critical",
    risk_category="missing_customs_doc",
    affected_tables=["shipments", "shipment_documents"],
    remediation_hint=(
        "File missing customs declarations immediately. Check EDI connection "
        "to customs authority systems. Reference: WCO SAFE Framework A2.1"
    ),
)

QUERY_MISSING_VGM = AuditQuery(
    query_id="AUD-CUS-002",
    name="Containers Without Verified Gross Mass (VGM)",
    domain=ComplianceDomain.CUSTOMS_DOCUMENTATION,
    description=(
        "Finds containers missing SOLAS VGM (Verified Gross Mass) declarations. "
        "Required by IMO amendments to SOLAS Chapter VI."
    ),
    sql_template="""
    SELECT 
        c.container_id,
        c.iso_code,
        c.shipment_id,
        c.booking_ref,
        s.destination_port,
        s.estimated_departure
    FROM containers c
    JOIN shipments s ON c.shipment_id = s.shipment_id
    LEFT JOIN shipment_documents d 
        ON c.container_id = d.container_id 
        AND d.doc_type = 'VGM'
    WHERE 
        d.doc_id IS NULL
        AND s.estimated_departure > NOW() - INTERVAL '7 days'
    ORDER BY s.estimated_departure ASC
    LIMIT {batch_size}
    """.strip(),
    severity="critical",
    risk_category="missing_customs_doc",
    affected_tables=["containers", "shipments", "shipment_documents"],
    remediation_hint=(
        "Submit VGM declarations before cut-off. Method 1: Weigh entire packed container. "
        "Method 2: Sum of cargo + tare + packing. Reference: SOLAS VI/2"
    ),
)

QUERY_EXPIRED_DANGEROUS_GOODS_DECLARATIONS = AuditQuery(
    query_id="AUD-CUS-003",
    name="Dangerous Goods Documents Expiring Soon",
    domain=ComplianceDomain.CUSTOMS_DOCUMENTATION,
    description=(
        "Identifies dangerous goods declarations that are expired or expiring within 14 days."
    ),
    sql_template="""
    SELECT 
        d.doc_id,
        d.shipment_id,
        d.doc_name,
        d.issued_at,
        d.expires_at,
        EXTRACT(DAY FROM (d.expires_at - NOW())) AS days_until_expiry
    FROM shipment_documents d
    WHERE 
        d.doc_type = 'DANGEROUS_GOODS'
        AND (
            d.expires_at < NOW()
            OR d.expires_at < NOW() + INTERVAL '14 days'
        )
    ORDER BY d.expires_at ASC
    LIMIT {batch_size}
    """.strip(),
    severity="high",
    risk_category="missing_customs_doc",
    affected_tables=["shipment_documents"],
    remediation_hint="Renew dangerous goods declarations before expiry. Reference: IMDG Code.",
)


# ── 3. EDI Message Format Compliance ──────────────────────────────────────

QUERY_NON_COMPLIANT_EDI = AuditQuery(
    query_id="AUD-EDI-001",
    name="Non-Compliant EDI Messages",
    domain=ComplianceDomain.EDI_FORMAT,
    description=(
        "Finds EDI messages that failed validation against their declared standard. "
        "Covers EDIFACT, ANSI X12, BAPLIE, and VGM message formats."
    ),
    sql_template="""
    SELECT 
        m.message_id,
        m.message_type,
        m.edi_standard,
        m.sender_id,
        m.validation_status,
        m.validation_errors,
        m.received_at
    FROM edi_messages m
    WHERE 
        m.validation_status = 'FAILED'
        AND m.received_at > NOW() - INTERVAL '30 days'
    ORDER BY m.received_at DESC
    LIMIT {batch_size}
    """.strip(),
    severity="medium",
    risk_category="edi_non_compliance",
    affected_tables=["edi_messages"],
    remediation_hint=(
        "Review failed message validation errors. Coordinate with trading partner "
        "to fix EDI mapping. Reference: UN/EDIFACT D.21A or ANSI X12 8.6"
    ),
)

QUERY_ORPHANED_EDI_REFERENCES = AuditQuery(
    query_id="AUD-EDI-002",
    name="EDI Messages with Orphaned References",
    domain=ComplianceDomain.EDI_FORMAT,
    description=(
        "Detects EDI messages referencing non-existent shipments or containers."
    ),
    sql_template="""
    SELECT 
        m.message_id,
        m.message_type,
        m.edi_standard,
        m.reference_id,
        m.received_at
    FROM edi_messages m
    LEFT JOIN shipments s ON m.reference_id = s.shipment_id
    LEFT JOIN containers c ON m.reference_id = c.container_id
    WHERE 
        s.shipment_id IS NULL 
        AND c.container_id IS NULL
        AND m.received_at > NOW() - INTERVAL '30 days'
    ORDER BY m.received_at DESC
    LIMIT {batch_size}
    """.strip(),
    severity="medium",
    risk_category="edi_non_compliance",
    affected_tables=["edi_messages", "shipments", "containers"],
    remediation_hint="Investigate data synchronisation issues between EDI and core systems.",
)


# ── 4. Data Retention Violations ──────────────────────────────────────────

QUERY_RETENTION_VIOLATIONS = AuditQuery(
    query_id="AUD-RET-001",
    name="PII Data Beyond Retention Period",
    domain=ComplianceDomain.DATA_RETENTION,
    description=(
        "Finds manifest records containing PII that have exceeded the GDPR-recommended "
        "retention period. GDPR Art.5(1)(e) requires personal data be kept no longer than necessary."
    ),
    sql_template="""
    SELECT 
        m.manifest_id,
        m.voyage_number,
        m.discharge_date,
        EXTRACT(DAY FROM (NOW() - m.discharge_date)) AS days_since_discharge,
        a.field_name,
        a.anonymised_at
    FROM manifests m
    JOIN anonymisation_records a ON m.manifest_id = a.manifest_id
    WHERE 
        m.discharge_date IS NOT NULL
        AND m.discharge_date < NOW() - INTERVAL '{retention_days} days'
        AND a.anonymised_at IS NOT NULL
    ORDER BY m.discharge_date ASC
    LIMIT {batch_size}
    """.strip(),
    severity="high",
    risk_category="data_retention_violation",
    affected_tables=["manifests", "anonymisation_records"],
    parameters={"retention_days": 90, "batch_size": 1000},
    remediation_hint=(
        "Delete or further anonymise records past retention period. "
        "Verify legal hold requirements before deletion."
    ),
)

QUERY_UNANONYMISED_HISTORICAL = AuditQuery(
    query_id="AUD-RET-002",
    name="Unanonymised Historical Manifests",
    domain=ComplianceDomain.DATA_RETENTION,
    description=(
        "Identifies manifests older than the grace period that still contain raw PII "
        "and have never been processed by the Anonymiser."
    ),
    sql_template="""
    SELECT 
        m.manifest_id,
        m.voyage_number,
        m.discharge_date,
        EXTRACT(DAY FROM (NOW() - m.discharge_date)) AS days_since_discharge
    FROM manifests m
    LEFT JOIN anonymisation_records a ON m.manifest_id = a.manifest_id
    WHERE 
        m.discharge_date IS NOT NULL
        AND m.discharge_date < NOW() - INTERVAL '{grace_days} days'
        AND a.manifest_id IS NULL
    ORDER BY m.discharge_date ASC
    LIMIT {batch_size}
    """.strip(),
    severity="high",
    risk_category="data_retention_violation",
    affected_tables=["manifests", "anonymisation_records"],
    parameters={"grace_days": 30, "batch_size": 1000},
    remediation_hint=(
        "Run the PII Anonymiser on these manifests immediately. "
        "Configure automated anonymisation for manifests past grace period."
    ),
)


# ── 5. Access Control Checks ─────────────────────────────────────────────

QUERY_EXCESSIVE_ACCESS = AuditQuery(
    query_id="AUD-ACC-001",
    name="Users with Excessive System Access",
    domain=ComplianceDomain.ACCESS_CONTROL,
    description=(
        "Identifies user accounts with broad access permissions that may violate "
        "the principle of least privilege (ISO 27001 A.9.2.3)."
    ),
    sql_template="""
    SELECT 
        u.user_id,
        u.username,
        u.role,
        u.last_login,
        COUNT(DISTINCT a.permission_id) AS permission_count,
        ARRAY_AGG(DISTINCT a.resource_type) AS resource_types
    FROM users u
    JOIN user_permissions a ON u.user_id = a.user_id
    WHERE 
        u.is_active = true
        AND u.last_login > NOW() - INTERVAL '90 days'
    GROUP BY u.user_id, u.username, u.role, u.last_login
    HAVING COUNT(DISTINCT a.permission_id) > {max_permissions}
    ORDER BY permission_count DESC
    LIMIT {batch_size}
    """.strip(),
    severity="medium",
    risk_category="access_control_breach",
    affected_tables=["users", "user_permissions"],
    parameters={"max_permissions": 20, "batch_size": 100},
    remediation_hint=(
        "Review and reduce permissions. Implement role-based access control. "
        "Reference: ISO 27001 A.9.2.3"
    ),
)


# ── 6. Emissions Reporting Checks (EU ETS / IMO DCS) ──────────────────────

QUERY_MISSING_ETS_MONITORING_PLAN = AuditQuery(
    query_id="AUD-ETS-001",
    name="Vessels Missing EU ETS Monitoring Reporting Plan",
    domain=ComplianceDomain.EMISSIONS_REPORTING,
    description=(
        "Identifies vessels subject to EU ETS that do not have an approved "
        "monitoring reporting plan (MRP). Under EU Regulation 2023/959, all "
        "vessels ≥ 5,000 GT calling at EU ports must submit an MRP."
    ),
    sql_template="""
    SELECT 
        v.vessel_id,
        v.imo_number,
        v.vessel_name,
        v.gross_tonnage,
        v.flag_state,
        v.last_eu_port_call
    FROM vessels v
    LEFT JOIN emissions_monitoring_plans emp 
        ON v.vessel_id = emp.vessel_id 
        AND emp.plan_status = 'APPROVED'
        AND emp.reporting_year = EXTRACT(YEAR FROM CURRENT_DATE)
    WHERE 
        v.gross_tonnage >= 5000
        AND v.calls_eu_ports = true
        AND emp.plan_id IS NULL
    ORDER BY v.last_eu_port_call DESC
    LIMIT {batch_size}
    """.strip(),
    severity="critical",
    risk_category="emissions_non_compliance",
    affected_tables=["vessels", "emissions_monitoring_plans"],
    parameters={"batch_size": 500},
    remediation_hint=(
        "Submit EU ETS Monitoring Reporting Plan to the administering authority. "
        "Template available at: https://eur-lex.europa.eu. Reference: EU Regulation 2023/959 Art.8"
    ),
)

QUERY_EMISSIONS_EXCEEDING_ALLOWANCE = AuditQuery(
    query_id="AUD-ETS-002",
    name="Emissions Exceeding Per-Voyage Allowance (MRV)",
    domain=ComplianceDomain.EMISSIONS_REPORTING,
    description=(
        "Detects voyages where reported CO2 emissions exceed the per-voyage "
        "allowance allocated under the EU ETS MRV framework. Exceedances may "
        "indicate monitoring errors, fuel quality issues, or unreported deviations."
    ),
    sql_template="""
    SELECT 
        ev.voyage_id,
        ev.vessel_id,
        ev.voyage_number,
        ev.reported_co2_tonnes,
        ev.allocated_allowance_tonnes,
        (ev.reported_co2_tonnes - ev.allocated_allowance_tonnes) AS excess_tonnes,
        ev.reporting_period,
        ev.verification_status
    FROM emissions_voyages ev
    WHERE 
        ev.reported_co2_tonnes > ev.allocated_allowance_tonnes
        AND ev.reporting_period >= DATE_TRUNC('year', CURRENT_DATE) - INTERVAL '1 year'
        AND (ev.verification_status IS NULL OR ev.verification_status != 'VERIFIED')
    ORDER BY excess_tonnes DESC
    LIMIT {batch_size}
    """.strip(),
    severity="high",
    risk_category="emissions_non_compliance",
    affected_tables=["emissions_voyages"],
    parameters={"batch_size": 500},
    remediation_hint=(
        "Investigate emissions exceedance. Check fuel consumption data quality, "
        "voyage route deviations, and MRV sensor calibration. "
        "Reference: EU MRV Regulation 2017/2402"
    ),
)

QUERY_MISSING_ETS_ALLOWANCE_CERTIFICATES = AuditQuery(
    query_id="AUD-ETS-003",
    name="Missing EU ETS Allowance Certificates for Company",
    domain=ComplianceDomain.EMISSIONS_REPORTING,
    description=(
        "Identifies shipping companies that have not surrendered sufficient "
        "EU ETS allowance certificates to cover their verified emissions. "
        "Under EU ETS Phase 4 (2024+), 70% of allowances must be surrendered by 30 Sept."
    ),
    sql_template="""
    SELECT 
        c.company_id,
        c.company_name,
        c.registry_number,
        ec.verified_emissions_tonnes,
        ec.surrendered_allowances,
        (ec.verified_emissions_tonnes * 0.70 - COALESCE(ec.surrendered_allowances, 0)) 
            AS shortfall_tonnes,
        ec.reporting_year
    FROM shipping_companies c
    JOIN emissions_company_summary ec ON c.company_id = ec.company_id
    WHERE 
        ec.reporting_year = EXTRACT(YEAR FROM CURRENT_DATE) - 1
        AND COALESCE(ec.surrendered_allowances, 0) < (ec.verified_emissions_tonnes * 0.70)
    ORDER BY shortfall_tonnes DESC
    LIMIT {batch_size}
    """.strip(),
    severity="critical",
    risk_category="carbon_credit_mismatch",
    affected_tables=["shipping_companies", "emissions_company_summary"],
    parameters={"batch_size": 200},
    remediation_hint=(
        "Purchase and surrender EU ETS allowances via the Union Registry. "
        "Deadline: 30 September following the reporting year. "
        "Penalties: €100/tonne shortfall. Reference: EU ETS Directive 2003/87/EC"
    ),
)

QUERY_MISSING_IMO_DCS_FUEL_REPORT = AuditQuery(
    query_id="AUD-IMO-001",
    name="IMO DCS Fuel Consumption Not Reported",
    domain=ComplianceDomain.EMISSIONS_REPORTING,
    description=(
        "Finds vessels that have not submitted mandatory IMO Data Collection "
        "System (DCS) fuel consumption reports. Required under IMO Resolution "
        "MEPC.278(70) for vessels ≥ 5,000 GT."
    ),
    sql_template="""
    SELECT 
        v.vessel_id,
        v.imo_number,
        v.vessel_name,
        v.gross_tonnage,
        v.flag_state,
        dcs.report_status,
        dcs.last_submission_date
    FROM vessels v
    LEFT JOIN imo_dcs_reports dcs 
        ON v.imo_number = dcs.imo_number 
        AND dcs.reporting_year = EXTRACT(YEAR FROM CURRENT_DATE) - 1
    WHERE 
        v.gross_tonnage >= 5000
        AND (dcs.report_id IS NULL OR dcs.report_status = 'NOT_SUBMITTED')
    ORDER BY v.vessel_name
    LIMIT {batch_size}
    """.strip(),
    severity="high",
    risk_category="emissions_non_compliance",
    affected_tables=["vessels", "imo_dcs_reports"],
    parameters={"batch_size": 500},
    remediation_hint=(
        "Submit IMO DCS fuel consumption report via the IMO GHG data collection system. "
        "Deadline: 31 March following the reporting year. "
        "Reference: IMO MEPC.278(70), MEPC.333(76)"
    ),
)

QUERY_INCOMPLETE_NOX_SOX_DATA = AuditQuery(
    query_id="AUD-IMO-002",
    name="Incomplete IMO NOx/SOx Emissions Data (SEEMP)",
    domain=ComplianceDomain.EMISSIONS_REPORTING,
    description=(
        "Detects vessels with incomplete NOx and SOx emissions data in their "
        "Ship Energy Efficiency Management Plan (SEEMP) reports. Required for "
        "EEXI/CII compliance tracking under IMO MEPC.364(79)."
    ),
    sql_template="""
    SELECT 
        v.vessel_id,
        v.imo_number,
        v.vessel_name,
        s.seemp_id,
        s.reporting_period,
        CASE WHEN s.nox_emissions_kg IS NULL THEN 'NOx missing' END AS nox_status,
        CASE WHEN s.sox_emissions_kg IS NULL THEN 'SOx missing' END AS sox_status,
        CASE WHEN s.fuel_oil_consumption IS NULL THEN 'Fuel consumption missing' END AS fuel_status
    FROM vessels v
    JOIN seemp_reports s ON v.imo_number = s.imo_number
    WHERE 
        s.reporting_period >= DATE_TRUNC('year', CURRENT_DATE) - INTERVAL '2 years'
        AND (
            s.nox_emissions_kg IS NULL 
            OR s.sox_emissions_kg IS NULL 
            OR s.fuel_oil_consumption IS NULL
        )
    ORDER BY s.reporting_period DESC
    LIMIT {batch_size}
    """.strip(),
    severity="medium",
    risk_category="emissions_non_compliance",
    affected_tables=["vessels", "seemp_reports"],
    parameters={"batch_size": 500},
    remediation_hint=(
        "Complete SEEMP emissions data. Install or calibrate NOx/SOx monitoring equipment. "
        "Reference: IMO MEPC.364(79), MARPOL Annex VI Reg.14"
    ),
)

QUERY_CARBON_CREDIT_REGISTRY_SYNC_FAILURES = AuditQuery(
    query_id="AUD-CRB-001",
    name="Carbon Credit Registry Sync Failures (EU ETS)",
    domain=ComplianceDomain.EMISSIONS_REPORTING,
    description=(
        "Identifies discrepancies between local emissions records and the EU ETS "
        "Union Registry. Sync failures may indicate allowance transfer errors, "
        "registry downtime, or data entry mistakes that could result in compliance gaps."
    ),
    sql_template="""
    SELECT 
        csr.sync_id,
        csr.company_id,
        csr.registry_name,
        csr.last_sync_at,
        csr.sync_status,
        csr.error_details,
        csr.local_allowance_balance,
        csr.registry_allowance_balance,
        ABS(csr.local_allowance_balance - csr.registry_allowance_balance) AS discrepancy
    FROM carbon_registry_sync csr
    WHERE 
        csr.sync_status IN ('FAILED', 'MISMATCH')
        AND csr.last_sync_at > NOW() - INTERVAL '30 days'
    ORDER BY discrepancy DESC
    LIMIT {batch_size}
    """.strip(),
    severity="high",
    risk_category="carbon_credit_mismatch",
    affected_tables=["carbon_registry_sync"],
    parameters={"batch_size": 200},
    remediation_hint=(
        "Investigate registry sync failure. Verify API credentials, check registry "
        "availability, and reconcile allowance balances manually if needed. "
        "Reference: EU ETS Registry Regulation (EU) 2019/1122"
    ),
)


# ── Query Registry ─────────────────────────────────────────────────────────

ALL_AUDIT_QUERIES: list[AuditQuery] = [
    QUERY_UNENCRYPTED_TRANSMISSIONS,
    QUERY_UNENCRYPTED_FTP_CONNECTIONS,
    QUERY_EXPIRED_CERTIFICATES,
    QUERY_MISSING_CUSTOMS_DOCS,
    QUERY_MISSING_VGM,
    QUERY_EXPIRED_DANGEROUS_GOODS_DECLARATIONS,
    QUERY_NON_COMPLIANT_EDI,
    QUERY_ORPHANED_EDI_REFERENCES,
    QUERY_RETENTION_VIOLATIONS,
    QUERY_UNANONYMISED_HISTORICAL,
    QUERY_EXCESSIVE_ACCESS,
    QUERY_MISSING_ETS_MONITORING_PLAN,
    QUERY_EMISSIONS_EXCEEDING_ALLOWANCE,
    QUERY_MISSING_ETS_ALLOWANCE_CERTIFICATES,
    QUERY_MISSING_IMO_DCS_FUEL_REPORT,
    QUERY_INCOMPLETE_NOX_SOX_DATA,
    QUERY_CARBON_CREDIT_REGISTRY_SYNC_FAILURES,
]


def get_queries_by_domain(domain: ComplianceDomain) -> list[AuditQuery]:
    """Filter the query registry by compliance domain."""
    return [q for q in ALL_AUDIT_QUERIES if q.domain == domain]


def get_queries_by_severity(min_severity: str = "low") -> list[AuditQuery]:
    """Filter queries by minimum severity level."""
    severity_order = {"info": 0, "low": 1, "medium": 2, "high": 3, "critical": 4}
    min_level = severity_order.get(min_severity, 0)
    return [
        q for q in ALL_AUDIT_QUERIES
        if severity_order.get(q.severity, 0) >= min_level
    ]
