"""PII detection rules and field classification for maritime manifests.

Provides rule-based PII detection using field-name heuristics and regex
pattern matching. Rules are loaded from configuration and can be extended
for jurisdiction-specific requirements (e.g., CCPA, LGPD).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional


class Jurisdiction(Enum):
    """Data protection jurisdictions with specific requirements."""
    GDPR = "GDPR"          # EU General Data Protection Regulation
    CCPA = "CCPA"          # California Consumer Privacy Act
    LGPD = "LGPD"          # Brazil Lei Geral de Proteção de Dados
    PDPA = "PDPA"          # Singapore Personal Data Protection Act
    PIPA = "PIPA"          # South Korea Personal Information Protection Act


@dataclass
class PIIRule:
    """A single rule for detecting and classifying PII in manifest data."""
    field_pattern: str
    category: str
    regex: Optional[re.Pattern] = None
    jurisdictions: list[Jurisdiction] = field(default_factory=lambda: list(Jurisdiction))
    mandatory: bool = True           # If True, always anonymise regardless of jurisdiction
    retention_max_days: int = 90    # GDPR default: minimise retention
    description: str = ""


# Standard maritime manifest PII rules
DEFAULT_RULES: list[PIIRule] = [
    PIIRule(
        field_pattern=r"consignee_(name|address|email|phone|fax|tax_id)",
        category="consignee_identity",
        regex=re.compile(r"^consignee", re.IGNORECASE),
        jurisdictions=[Jurisdiction.GDPR, Jurisdiction.CCPA, Jurisdiction.LGPD],
        retention_max_days=90,
        description="Consignee personal identifiers in Bill of Lading",
    ),
    PIIRule(
        field_pattern=r"shipper_(name|address|email|phone|fax|tax_id)",
        category="shipper_identity",
        regex=re.compile(r"^shipper", re.IGNORECASE),
        jurisdictions=[Jurisdiction.GDPR, Jurisdiction.CCPA, Jurisdiction.LGPD],
        retention_max_days=90,
        description="Shipper personal identifiers in Bill of Lading",
    ),
    PIIRule(
        field_pattern=r"(email|e_mail|mail)",
        category="contact_info",
        regex=re.compile(r"[\w.-]+@[\w.-]+\.\w{2,}"),
        mandatory=True,
        retention_max_days=60,
        description="Email addresses found in any manifest field",
    ),
    PIIRule(
        field_pattern=r"(phone|tel|fax|mobile)",
        category="contact_info",
        regex=re.compile(r"\+?\d[\d\s-]{7,}"),
        mandatory=True,
        retention_max_days=60,
        description="Phone/fax numbers in any manifest field",
    ),
    PIIRule(
        field_pattern=r"(passport|national_id|ssn|social_security)",
        category="government_id",
        regex=re.compile(r"[A-Z]{2}\d{7,}"),
        jurisdictions=[Jurisdiction.GDPR, Jurisdiction.PDPA, Jurisdiction.PIPA],
        mandatory=True,
        retention_max_days=30,
        description="Government-issued identity document numbers",
    ),
    PIIRule(
        field_pattern=r"(tax_id|vat|ein|iban|bank_account)",
        category="financial_id",
        regex=re.compile(r"[A-Z]{2}\d{2}[A-Z0-9]{10,}"),
        jurisdictions=[Jurisdiction.GDPR, Jurisdiction.LGPD],
        retention_max_days=90,
        description="Financial identifiers subject to PCI-DSS and local tax regulations",
    ),
    PIIRule(
        field_pattern=r"(notify_party|agent_name|forwarder_contact)",
        category="contact_info",
        jurisdictions=[Jurisdiction.GDPR, Jurisdiction.CCPA],
        retention_max_days=90,
        description="Third-party contact information in shipping documents",
    ),
]


class RuleEngine:
    """Evaluates PII rules against manifest field names and values.

    Supports filtering by jurisdiction and field-specific matching.
    """

    def __init__(self, rules: Optional[list[PIIRule]] = None):
        self._rules = rules or DEFAULT_RULES
        self._compiled = [
            (rule, re.compile(rule.field_pattern))
            for rule in self._rules
        ]

    def find_matching_rules(self, field_name: str, jurisdiction: Optional[Jurisdiction] = None) -> list[PIIRule]:
        """Return all rules that match a given field name."""
        matches = []
        for rule, pattern in self._compiled:
            if pattern.search(field_name):
                if rule.mandatory or (jurisdiction and jurisdiction in rule.jurisdictions):
                    matches.append(rule)
        return matches

    def scan_value(self, value: str, field_name: str = "") -> list[PIIRule]:
        """Scan a value for embedded PII using regex patterns."""
        matches = []
        for rule, _ in self._compiled:
            if rule.regex and rule.regex.search(value):
                matches.append(rule)
        return matches

    def get_fields_for_manifest(self, manifest: dict, jurisdiction: Optional[Jurisdiction] = None) -> dict[str, list[PIIRule]]:
        """Return a mapping of field name -> matching rules for an entire manifest."""
        result = {}
        for field_name in manifest:
            matching = self.find_matching_rules(field_name, jurisdiction)
            if matching:
                result[field_name] = matching
        return result
