"""Updates EDI connection profiles based on audit findings.

When the auditor detects an unencrypted transmission or an expired
certificate, this updater modifies the corresponding EDIConnectionProfile
to enforce the correct security settings.

Supports three modes:
  - dry-run: Show what would change without applying
  - staged:  Apply changes but mark for review
  - apply:   Apply changes immediately
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional

from shared.config import SwarmConfig
from shared.database import create_engine_from_config, get_session_factory, init_schema
from shared.models import (
    AuditFinding,
    AuditStatus,
    EDIConnectionProfile,
    RiskCategory,
)

logger = logging.getLogger(__name__)


class EDIProfileUpdater:
    """Updates EDI connection profiles based on audit findings."""

    def __init__(self, config: SwarmConfig):
        self._config = config
        self._remediation_config = config.remediation
        self._engine = create_engine_from_config(config)
        init_schema(self._engine)
        self._session_factory = get_session_factory(self._engine)

    def update_profiles(
        self,
        finding_refs: Optional[list[str]] = None,
        mode: str = None,
    ) -> list[dict[str, Any]]:
        """Update EDI connection profiles based on open findings."""
        mode = mode or self._remediation_config.edi_profile_update_mode
        results = []

        with self._session_factory() as session:
            query = session.query(AuditFinding).filter(
                AuditFinding.status == AuditStatus.OPEN,
                AuditFinding.risk_category.in_([
                    RiskCategory.UNENCRYPTED_TRANSIMISSION,
                    RiskCategory.CERT_EXPIRY,
                ]),
            )
            if finding_refs:
                query = query.filter(AuditFinding.finding_ref.in_(finding_refs))

            findings = query.all()

            # Group findings by partner
            finding_partner_map: dict[str, list[AuditFinding]] = {}
            for f in findings:
                partner_id = self._extract_partner_id(f)
                if partner_id:
                    finding_partner_map.setdefault(partner_id, []).append(f)

            # Process each affected partner profile
            for partner_id, partner_findings in finding_partner_map.items():
                profile = session.query(EDIConnectionProfile).filter_by(
                    partner_id=partner_id
                ).first()

                if not profile:
                    logger.warning("No EDI profile for partner %s - creating new", partner_id)
                    if mode != "dry-run":
                        profile = self._create_default_profile(session, partner_id, partner_findings)
                    else:
                        results.append({
                            "partner_id": partner_id,
                            "action": "create_profile",
                            "changes": self._compute_changes(None, partner_findings),
                            "mode": mode,
                        })
                        continue

                changes = self._compute_changes(profile, partner_findings)

                if mode == "dry-run":
                    results.append({
                        "partner_id": partner_id,
                        "partner_name": profile.partner_name,
                        "action": "update_profile",
                        "changes": changes,
                        "mode": mode,
                    })
                else:
                    self._apply_changes(profile, changes)
                    profile.last_audit_at = datetime.now(timezone.utc)
                    profile.last_audit_passed = len(changes) == 0
                    session.flush()

                    results.append({
                        "partner_id": partner_id,
                        "partner_name": profile.partner_name,
                        "action": "updated" if changes else "no_change",
                        "changes": changes,
                        "mode": mode,
                    })

                    # Mark findings as remediated
                    for f in partner_findings:
                        f.status = AuditStatus.REMEDIATED
                        f.remediated_at = datetime.now(timezone.utc)

            if mode != "dry-run":
                session.commit()

        return results

    def _extract_partner_id(self, finding: AuditFinding) -> Optional[str]:
        """Extract partner ID from finding evidence."""
        if finding.evidence and isinstance(finding.evidence, list):
            sample = finding.evidence[0] if isinstance(finding.evidence[0], dict) else {}
            return sample.get("partner_id") or sample.get("sender_id")
        return None

    def _compute_changes(self, profile: Optional[EDIConnectionProfile], findings: list[AuditFinding]) -> dict[str, Any]:
        """Compute the set of changes needed for a profile."""
        changes = {
            "encryption_enabled": False,
            "encryption_protocol": None,
            "customs_doc_required": True,
        }
        if profile:
            changes["encryption_enabled"] = profile.encryption_enabled
            changes["encryption_protocol"] = profile.encryption_protocol
            changes["customs_doc_required"] = profile.customs_doc_required

        proposed = dict(changes)
        for f in findings:
            if f.risk_category == RiskCategory.UNENCRYPTED_TRANSIMISSION:
                proposed["encryption_enabled"] = True
                proposed["encryption_protocol"] = "TLS 1.3"
            elif f.risk_category == RiskCategory.CERT_EXPIRY:
                proposed["encryption_protocol"] = proposed["encryption_protocol"] or "TLS 1.3"

        # Only return fields that actually changed
        diff = {}
        for key in proposed:
            if proposed[key] != changes[key]:
                diff[key] = {"from": changes[key], "to": proposed[key]}
        return diff

    def _apply_changes(self, profile: EDIConnectionProfile, changes: dict) -> None:
        """Apply computed changes to a profile."""
        for key, change in changes.items():
            new_value = change["to"]
            setattr(profile, key, new_value)
        logger.info("Applied %d change(s) to profile %s", len(changes), profile.partner_id)

    def _create_default_profile(self, session, partner_id: str, findings: list[AuditFinding]) -> EDIConnectionProfile:
        """Create a new EDI profile with secure defaults."""
        profile = EDIConnectionProfile(
            partner_id=partner_id,
            partner_name=partner_id,
            edi_standard=findings[0].edi_standard if findings[0].edi_standard else None,
            encryption_enabled=True,
            encryption_protocol="TLS 1.3",
            customs_doc_required=True,
        )
        session.add(profile)
        session.flush()
        return profile

    def close(self):
        self._engine.dispose()