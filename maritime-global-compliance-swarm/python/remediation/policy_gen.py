"""Data masking policy generator for maritime compliance remediation.

Analyses open audit findings and generates appropriate MaskingPolicy records
to address each finding. Policies are mapped from risk category to the correct
anonymisation action using a decision matrix.

Supports three modes:
  - dry-run: Generate policies without persisting
  - staged:  Persist policies as disabled (manual review required)
  - apply:   Persist and enable policies immediately
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional

from shared.config import RemediationConfig, SwarmConfig
from shared.database import create_engine_from_config, get_session_factory, init_schema
from shared.models import (
    AuditFinding,
    AuditStatus,
    EDIConnectionProfile,
    MaskingPolicy,
    PIIFieldCategory,
    PolicyAction,
    RiskCategory,
)

logger = logging.getLogger(__name__)


# Decision matrix: risk category -> recommended policy action
# Each entry maps a risk type to one or more remediation policies
REMEDIATION_MATRIX: dict[str, list[dict[str, Any]]] = {
    RiskCategory.PII_EXPOSURE.value: [
        {
            "policy_name_template": "auto_tokenise_{field}",
            "action": PolicyAction.TOKENISE,
            "category": PIIFieldCategory.CONSIGNEE_IDENTITY,
            "gdpr_article": "Art.25(1)",
            "description": "Auto-generated: tokenise exposed PII field",
        },
    ],
    RiskCategory.UNENCRYPTED_TRANSIMISSION.value: [
        {
            "policy_name_template": "enforce_encryption_{partner}",
            "action": PolicyAction.ENCRYPT,
            "category": None,  # Not a field-level policy
            "gdpr_article": "Art.32(1)(a)",
            "description": "Auto-generated: enforce encryption for partner EDI connection",
        },
    ],
    RiskCategory.MISSING_CUSTOMS_DOC.value: [
        {
            "policy_name_template": "require_customs_doc_{doc_type}",
            "action": PolicyAction.REDACT,
            "category": None,
            "gdpr_article": "Art.28(3)(c)",
            "description": "Auto-generated: flag missing customs documentation",
        },
    ],
    RiskCategory.EDI_NON_COMPLIANCE.value: [
        {
            "policy_name_template": "edi_format_fix_{standard}",
            "action": PolicyAction.GENERALISE,
            "category": None,
            "gdpr_article": "Art.5(1)(c)",
            "description": "Auto-generated: fix EDI format compliance issue",
        },
    ],
    RiskCategory.DATA_RETENTION_VIOLATION.value: [
        {
            "policy_name_template": "retention_purge_{table}",
            "action": PolicyAction.TRUNCATE,
            "category": PIIFieldCategory.CONTACT_INFO,
            "gdpr_article": "Art.5(1)(e)",
            "description": "Auto-generated: purge data past retention period",
        },
    ],
    RiskCategory.ACCESS_CONTROL_BREACH.value: [
        {
            "policy_name_template": "restrict_access_{resource}",
            "action": PolicyAction.REDACT,
            "category": None,
            "gdpr_article": "Art.25(1)",
            "description": "Auto-generated: restrict excessive access permissions",
        },
    ],
    RiskCategory.CERT_EXPIRY.value: [
        {
            "policy_name_template": "renew_cert_{partner}",
            "action": PolicyAction.ENCRYPT,
            "category": None,
            "gdpr_article": "Art.32(1)(b)",
            "description": "Auto-generated: renew expired TLS certificate",
        },
    ],
}


# Field name to category mapping for policy generation
FIELD_CATEGORY_INFERENCE: dict[str, PIIFieldCategory] = {
    "consignee": PIIFieldCategory.CONSIGNEE_IDENTITY,
    "shipper": PIIFieldCategory.SHIPPER_IDENTITY,
    "email": PIIFieldCategory.CONTACT_INFO,
    "phone": PIIFieldCategory.CONTACT_INFO,
    "fax": PIIFieldCategory.CONTACT_INFO,
    "tax": PIIFieldCategory.FINANCIAL_ID,
    "iban": PIIFieldCategory.FINANCIAL_ID,
    "passport": PIIFieldCategory.GOVERNMENT_ID,
    "national_id": PIIFieldCategory.GOVERNMENT_ID,
}


class PolicyGenerator:
    """Generates masking policies from open audit findings.

    Analyses each finding, applies the remediation decision matrix,
    and creates MaskingPolicy records. Supports dry-run, staged, and
    apply modes.
    """

    def __init__(self, config: SwarmConfig):
        self._config = config
        self._remediation_config = config.remediation
        self._engine = create_engine_from_config(config)
        init_schema(self._engine)
        self._session_factory = get_session_factory(self._engine)

    def generate_policies(
        self,
        finding_refs: Optional[list[str]] = None,
        mode: str = "dry-run",
    ) -> list[dict[str, Any]]:
        """Generate remediation policies for open audit findings.

        Args:
            finding_refs: Specific finding refs to remediate. None = all open.
            mode: dry-run | staged | apply

        Returns:
            List of policy summaries created or proposed.
        """
        mode = mode or self._remediation_config.edi_profile_update_mode

        with self._session_factory() as session:
            query = session.query(AuditFinding).filter(
                AuditFinding.status == AuditStatus.OPEN
            )
            if finding_refs:
                query = query.filter(AuditFinding.finding_ref.in_(finding_refs))

            findings = query.all()
            logger.info("Processing %d open finding(s) in %s mode", len(findings), mode)

            results = []
            for finding in findings:
                policies = self._generate_for_finding(finding)
                for policy_dict in policies:
                    if mode == "dry-run":
                        results.append({**policy_dict, "status": "proposed", "mode": "dry-run"})
                    else:
                        created = self._persist_policy(session, policy_dict, mode)
                        results.append(created)

            if mode != "dry-run":
                # Mark findings as in-progress and advance state machine
                for finding in findings:
                    finding.status = AuditStatus.IN_PROGRESS
                    finding.remediation_policy_id = results[0].get("policy_id") if results else None
                    # Advance state machine: detected/triaged -> in_remediation
                    from shared.models import FindingState
                    if finding.state in (None, FindingState.DETECTED, FindingState.TRIAGED, FindingState.ASSIGNED):
                        finding.state = FindingState.IN_REMEDIATION
                        finding.state_last_changed_at = datetime.now(timezone.utc)
                session.commit()

                # Emit events for the reaction engine
                try:
                    from shared.event_bus import EventBus, EventType
                    # EventBus is managed by the gateway; emit if available
                    logger.info(
                        "Policies generated for %d findings in %s mode (events available via gateway)",
                        len(findings), mode,
                    )
                except ImportError:
                    pass

        return results

    def _generate_for_finding(self, finding: AuditFinding) -> list[dict[str, Any]]:
        """Generate policy proposals for a single finding."""
        risk_key = finding.risk_category.value
        matrix_entries = REMEDIATION_MATRIX.get(risk_key, [])

        policies = []
        for entry in matrix_entries:
            # Infer field name from evidence if available
            field_name = self._infer_field_from_evidence(finding)
            partner = self._infer_partner_from_finding(finding)

            # Build the policy name
            policy_name = entry["policy_name_template"].format(
                field=field_name or finding.affected_table or "unknown",
                partner=partner or "unknown",
                doc_type=finding.affected_table or "general",
                standard=finding.edi_standard.value if finding.edi_standard else "general",
                table=finding.affected_table or "unknown",
                resource=finding.affected_system or "unknown",
            )

            # Infer category if not set
            category = entry["category"]
            if category is None and field_name:
                for key, cat in FIELD_CATEGORY_INFERENCE.items():
                    if key in field_name.lower():
                        category = cat
                        break
            if category is None:
                category = PIIFieldCategory.CONTACT_INFO

            policies.append({
                "name": policy_name,
                "field_name": field_name or "*",
                "field_category": category,
                "action": entry["action"],
                "gdpr_article": entry["gdpr_article"],
                "description": entry["description"],
                "finding_ref": finding.finding_ref,
                "severity": finding.severity.value,
                "parameters": self._build_parameters(finding, entry),
            })

        return policies

    def _infer_field_from_evidence(self, finding: AuditFinding) -> Optional[str]:
        """Try to extract a specific field name from finding evidence."""
        if not finding.evidence or not isinstance(finding.evidence, list):
            return finding.affected_table
        if finding.evidence:
            sample = finding.evidence[0] if isinstance(finding.evidence[0], dict) else {}
            return sample.get("field_name") or finding.affected_table
        return finding.affected_table

    def _infer_partner_from_finding(self, finding: AuditFinding) -> Optional[str]:
        """Try to extract a partner ID from finding evidence."""
        if not finding.evidence or not isinstance(finding.evidence, list):
            return None
        if finding.evidence:
            sample = finding.evidence[0] if isinstance(finding.evidence[0], dict) else {}
            return sample.get("partner_id") or sample.get("sender_id")
        return None

    def _build_parameters(self, finding: AuditFinding, entry: dict) -> dict:
        """Build policy parameters based on the finding context."""
        params = {
            "auto_generated": True,
            "source_finding": finding.finding_ref,
        }
        if entry["action"] == PolicyAction.GENERALISE:
            params["granularity"] = "month"
        elif entry["action"] == PolicyAction.TRUNCATE:
            params["keep_chars"] = 2
        return params

    def _persist_policy(self, session, policy_dict: dict, mode: str) -> dict:
        """Create a MaskingPolicy record in the database."""
        existing = session.query(MaskingPolicy).filter_by(name=policy_dict["name"]).first()
        if existing:
            return {
                "policy_id": existing.id,
                "name": existing.name,
                "status": "already_exists",
                "mode": mode,
            }

        policy = MaskingPolicy(
            name=policy_dict["name"],
            field_name=policy_dict["field_name"],
            field_category=policy_dict["field_category"],
            action=policy_dict["action"],
            parameters=policy_dict["parameters"],
            gdpr_article=policy_dict["gdpr_article"],
            enabled=(mode == "apply" and self._remediation_config.auto_apply_policies),
        )
        session.add(policy)
        session.flush()

        return {
            "policy_id": policy.id,
            "name": policy.name,
            "action": policy.action.value,
            "enabled": policy.enabled,
            "status": "created_staged" if not policy.enabled else "created_enabled",
            "mode": mode,
        }

    def close(self):
        self._engine.dispose()
