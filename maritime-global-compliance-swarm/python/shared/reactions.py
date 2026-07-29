"""Event Reaction Rules Engine for the Maritime Compliance Swarm.

Transforms the swarm from a passive tool into an autonomous agent by
defining reactive rules that fire in response to compliance events.
Each rule has a condition, priority, and one or more actions.

Built-in reaction rules:

    1. CRITICAL finding detected -> immediate notification event
    2. PII_EXPOSURE found      -> auto-trigger anonymisation scan on related manifests
    3. CERT_EXPIRY detected    -> schedule cert renewal check
    4. Finding timeout breach -> auto-escalate via state machine
    5. Remediation completed  -> schedule verification reminder
    6. Audit completed        -> generate compliance summary
    7. High-severity finding  -> create MTTR tracking baseline

Rules are evaluated in priority order (lower = higher priority).
Each rule can be enabled/disabled and extended at runtime.

Usage:
    from shared.reactions import ReactionEngine
    from shared.event_bus import EventBus, EventType

    bus = EventBus(session_factory)
    engine = ReactionEngine(bus, state_machine, session_factory)
    engine.register_builtin_rules()
    bus.start()
    # Events published to the bus will now trigger reactions
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable, Optional

from .event_bus import ComplianceEvent, EventBus, EventType

logger = logging.getLogger(__name__)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _new_uuid() -> str:
    return str(uuid.uuid4())


# ── Rule Definition ─────────────────────────────────────────────────────

@dataclass
class ReactionRule:
    """A single reaction rule that fires on matching events."""
    rule_id: str
    name: str
    description: str
    event_types: list[str]
    priority: int = 100
    enabled: bool = True
    condition: Optional[Callable[[ComplianceEvent], bool]] = None
    action: Optional[Callable[[ComplianceEvent, dict[str, Any]], None]] = None
    is_builtin: bool = True
    action_count: int = 0
    last_triggered: Optional[str] = None

    def evaluate(self, event: ComplianceEvent) -> bool:
        """Check if this rule matches the event."""
        if not self.enabled:
            return False
        if event.event_type not in self.event_types:
            return False
        if self.condition and not self.condition(event):
            return False
        return True

    def execute(self, event: ComplianceEvent, context: dict[str, Any]) -> None:
        """Execute the rule's action."""
        if self.action:
            self.action(event, context)
        self.action_count += 1
        self.last_triggered = _utcnow().isoformat()


class ReactionEngine:
    """Evaluates reaction rules against incoming events.

    Subscribes to the event bus and processes each event through
    the rule set in priority order. Supports dynamic rule
    registration and runtime enable/disable.
    """

    def __init__(
        self,
        event_bus: EventBus,
        state_machine=None,
        session_factory=None,
    ):
        self._bus = event_bus
        self._sm = state_machine
        self._session_factory = session_factory
        self._rules: dict[str, ReactionRule] = {}
        self._reaction_log: list[dict[str, Any]] = []
        self._max_log_size = 1000

    def register_rule(self, rule: ReactionRule) -> None:
        """Register a reaction rule."""
        self._rules[rule.rule_id] = rule
        logger.info("Reaction rule registered: %s (%d rules total)", rule.rule_id, len(self._rules))

    def unregister_rule(self, rule_id: str) -> None:
        """Remove a reaction rule."""
        self._rules.pop(rule_id, None)

    def enable_rule(self, rule_id: str) -> bool:
        """Enable a specific rule."""
        rule = self._rules.get(rule_id)
        if rule:
            rule.enabled = True
            return True
        return False

    def disable_rule(self, rule_id: str) -> bool:
        """Disable a specific rule."""
        rule = self._rules.get(rule_id)
        if rule:
            rule.enabled = False
            return True
        return False

    def register_builtin_rules(self) -> None:
        """Register all built-in reaction rules.

        These are the core autonomous behaviours that transform
        the swarm from a passive tool into a reactive agent.
        """
        self.register_rule(ReactionRule(
            rule_id="react_critical_notification",
            name="Critical Finding Notification",
            description="Immediately notify when a CRITICAL severity finding is detected",
            event_types=[EventType.FINDING_CREATED, EventType.FINDING_STATE_CHANGED],
            priority=10,
            condition=self._cond_critical_finding,
            action=self._act_notify_critical,
        ))

        self.register_rule(ReactionRule(
            rule_id="react_pii_auto_scan",
            name="PII Exposure Auto-Scan",
            description="Automatically trigger anonymisation scan when PII exposure is detected",
            event_types=[EventType.FINDING_CREATED],
            priority=20,
            condition=self._cond_pii_exposure,
            action=self._act_trigger_pii_scan,
        ))

        self.register_rule(ReactionRule(
            rule_id="react_cert_expiry_check",
            name="Certificate Expiry Check",
            description="Schedule cert renewal check when cert expiry finding is detected",
            event_types=[EventType.FINDING_CREATED],
            priority=30,
            condition=self._cond_cert_expiry,
            action=self._act_schedule_cert_check,
        ))

        self.register_rule(ReactionRule(
            rule_id="react_timeout_escalation",
            name="Timeout Auto-Escalation",
            description="Auto-escalate findings that breach their SLA timeout window",
            event_types=[EventType.FINDING_TIMEOUT_BREACH],
            priority=5,
            action=self._act_escalate_timeout,
        ))

        self.register_rule(ReactionRule(
            rule_id="react_remediation_verification",
            name="Remediation Verification Reminder",
            description="When remediation completes, emit verification reminder event",
            event_types=[EventType.FINDING_STATE_CHANGED],
            priority=40,
            condition=self._cond_remediation_completed,
            action=self._act_verification_reminder,
        ))

        self.register_rule(ReactionRule(
            rule_id="react_audit_summary",
            name="Audit Completion Summary",
            description="Generate a compliance summary event when an audit run completes",
            event_types=[EventType.AUDIT_COMPLETED],
            priority=50,
            action=self._act_audit_summary,
        ))

        self.register_rule(ReactionRule(
            rule_id="react_mttr_baseline",
            name="MTTR Tracking Baseline",
            description="Create MTTR tracking baseline for high-severity findings",
            event_types=[EventType.FINDING_CREATED],
            priority=25,
            condition=self._cond_high_severity,
            action=self._act_create_mttr_baseline,
        ))

        # Subscribe to all events
        self._bus.subscribe_all(self._on_event)
        logger.info("Registered %d built-in reaction rules", len(self._rules))

    def _on_event(self, event: ComplianceEvent) -> None:
        """Handler called for every event on the bus."""
        matching = [
            rule for rule in sorted(self._rules.values(), key=lambda r: r.priority)
            if rule.evaluate(event)
        ]

        if not matching:
            return

        context = {
            "session_factory": self._session_factory,
            "state_machine": self._sm,
            "event_bus": self._bus,
        }

        for rule in matching:
            try:
                rule.execute(event, context)
                self._log_reaction(rule, event, success=True)
            except Exception as e:
                logger.error(
                    "Reaction rule error [%s]: %s",
                    rule.rule_id, e, exc_info=True,
                )
                self._log_reaction(rule, event, success=False, error=str(e))

    def _log_reaction(
        self,
        rule: ReactionRule,
        event: ComplianceEvent,
        success: bool,
        error: Optional[str] = None,
    ) -> None:
        """Log a reaction execution for observability."""
        entry = {
            "rule_id": rule.rule_id,
            "event_type": event.event_type,
            "event_id": event.event_id,
            "success": success,
            "timestamp": _utcnow().isoformat(),
        }
        if error:
            entry["error"] = error

        self._reaction_log.append(entry)
        if len(self._reaction_log) > self._max_log_size:
            self._reaction_log = self._reaction_log[-self._max_log_size // 2:]

    # ── Condition Functions ───────────────────────────────────────────

    @staticmethod
    def _cond_critical_finding(event: ComplianceEvent) -> bool:
        severity = event.payload.get("severity", "").lower()
        return severity == "critical"

    @staticmethod
    def _cond_pii_exposure(event: ComplianceEvent) -> bool:
        return event.payload.get("risk_category", "").lower() == "pii_exposure"

    @staticmethod
    def _cond_cert_expiry(event: ComplianceEvent) -> bool:
        return event.payload.get("risk_category", "").lower() == "cert_expiry"

    @staticmethod
    def _cond_remediation_completed(event: ComplianceEvent) -> bool:
        return event.payload.get("to_state") == "awaiting_verification"

    @staticmethod
    def _cond_high_severity(event: ComplianceEvent) -> bool:
        severity = event.payload.get("severity", "").lower()
        return severity in ("critical", "high")

    # ── Action Functions ──────────────────────────────────────────────

    @staticmethod
    def _act_notify_critical(event: ComplianceEvent, context: dict) -> None:
        """Emit a high-priority notification for CRITICAL findings.

        In production, this would integrate with:
        - Slack/Teams webhook
        - Email alert
        - PagerDuty/Opsgenie
        - EDI AS2 notification to the partner

        For now, it publishes a REACTION_TRIGGERED event that the
        frontend can consume via the event stream endpoint.
        """
        bus: EventBus = context["event_bus"]
        bus.publish(
            EventType.REACTION_TRIGGERED,
            payload={
                "rule_id": "react_critical_notification",
                "action": "notify",
                "finding_id": event.payload.get("finding_id", ""),
                "finding_ref": event.payload.get("finding_ref", ""),
                "severity": "critical",
                "message": (
                    f"CRITICAL finding {event.payload.get('finding_ref', '')}: "
                    f"{event.payload.get('title', 'Unknown')}"
                ),
                "recommended_action": (
                    "Immediate assignment required. "
                    "Auto-escalation in 1 hour if unassigned."
                ),
            },
            source="reaction_engine",
            correlation_id=event.correlation_id,
        )
        logger.warning(
            "CRITICAL finding notification: %s",
            event.payload.get("finding_ref", ""),
        )

    @staticmethod
    def _act_trigger_pii_scan(event: ComplianceEvent, context: dict) -> None:
        """Auto-trigger PII anonymisation scan for PII exposure findings.

        Looks up related manifests and queues them for scanning.
        """
        bus: EventBus = context["event_bus"]
        finding_id = event.payload.get("finding_id", "")
        affected_table = event.payload.get("affected_table", "")

        bus.publish(
            EventType.REACTION_TRIGGERED,
            payload={
                "rule_id": "react_pii_auto_scan",
                "action": "auto_anonymise_scan",
                "finding_id": finding_id,
                "affected_table": affected_table,
                "message": (
                    f"PII exposure detected in {affected_table}. "
                    f"Auto-scan queued for related manifests."
                ),
            },
            source="reaction_engine",
            correlation_id=event.correlation_id,
        )
        logger.info(
            "PII auto-scan triggered for finding %s (table: %s)",
            finding_id, affected_table,
        )

    @staticmethod
    def _act_schedule_cert_check(event: ComplianceEvent, context: dict) -> None:
        """Schedule a certificate renewal check.

        In production, this would create a scheduled task to check
        cert validity 24 hours before expiry. For now, it emits
        an event recording the scheduled action.
        """
        bus: EventBus = context["event_bus"]
        partner_id = event.payload.get("partner_id", "")

        bus.publish(
            EventType.REACTION_TRIGGERED,
            payload={
                "rule_id": "react_cert_expiry_check",
                "action": "schedule_cert_renewal_check",
                "partner_id": partner_id,
                "check_in_hours": 24,
                "message": (
                    f"Certificate expiry detected for partner {partner_id}. "
                    f"Renewal check scheduled in 24 hours."
                ),
            },
            source="reaction_engine",
            correlation_id=event.correlation_id,
        )
        logger.info(
            "Cert renewal check scheduled for partner %s",
            partner_id,
        )

    @staticmethod
    def _act_escalate_timeout(event: ComplianceEvent, context: dict) -> None:
        """Auto-escalate findings that have breached their timeout window.

        Uses the state machine to perform the escalation transition.
        """
        sm = context.get("state_machine")
        if sm is None:
            logger.warning("State machine not available for timeout escalation")
            return

        session_factory = context.get("session_factory")
        finding_id = event.payload.get("finding_id", "")
        current_state = event.payload.get("current_state", "")
        severity = event.payload.get("severity", "medium")

        if session_factory:
            with session_factory() as session:
                result = sm.transition(
                    finding_id=finding_id,
                    current_state=current_state,
                    target_state="escalated",
                    trigger="escalation_timer",
                    actor="timer",
                    context=event.payload,
                    severity=severity,
                    session=session,
                )
                if result.success:
                    session.commit()
                    logger.info(
                        "Auto-escalated finding %s from %s",
                        finding_id, current_state,
                    )

    @staticmethod
    def _act_verification_reminder(event: ComplianceEvent, context: dict) -> None:
        """Emit a verification reminder when remediation is completed."""
        bus: EventBus = context["event_bus"]
        finding_id = event.payload.get("finding_id", "")
        severity = event.payload.get("severity", "medium")

        from shared.state_machine import _get_timeout_hours
        timeout = _get_timeout_hours("awaiting_verification", severity)

        bus.publish(
            EventType.REACTION_TRIGGERED,
            payload={
                "rule_id": "react_remediation_verification",
                "action": "verification_reminder",
                "finding_id": finding_id,
                "timeout_hours": timeout,
                "message": (
                    f"Finding {finding_id} is awaiting verification. "
                    f"Auto-escalation in {timeout}h if not verified."
                ),
            },
            source="reaction_engine",
            correlation_id=event.correlation_id,
        )

    @staticmethod
    def _act_audit_summary(event: ComplianceEvent, context: dict) -> None:
        """Generate a compliance summary when an audit run completes."""
        findings_count = event.payload.get("findings_count", 0)
        queries_executed = event.payload.get("queries_executed", 0)
        severity_breakdown = event.payload.get("by_severity", {})

        logger.info(
            "Audit completed: %d queries, %d findings (%s)",
            queries_executed, findings_count, severity_breakdown,
        )

    @staticmethod
    def _act_create_mttr_baseline(event: ComplianceEvent, context: dict) -> None:
        """Create MTTR tracking baseline for high-severity findings.

        Publishes an MTTR event to establish the 'identified' phase
        in the Go MTTR tracker via the event bus.
        """
        bus: EventBus = context["event_bus"]
        finding_id = event.payload.get("finding_id", "")
        severity = event.payload.get("severity", "high")

        bus.publish(
            EventType.MTTR_EVENT_INGESTED,
            payload={
                "finding_id": finding_id,
                "phase": "identified",
                "severity": severity,
                "message": f"MTTR baseline created for {severity} finding",
            },
            source="reaction_engine",
            correlation_id=finding_id,
        )

    # ── Query Methods ─────────────────────────────────────────────────

    def get_rules(self, include_disabled: bool = False) -> list[dict[str, Any]]:
        """Return all registered rules with their status."""
        return [
            {
                "rule_id": r.rule_id,
                "name": r.name,
                "description": r.description,
                "event_types": r.event_types,
                "priority": r.priority,
                "enabled": r.enabled,
                "is_builtin": r.is_builtin,
                "action_count": r.action_count,
                "last_triggered": r.last_triggered,
            }
            for r in self._rules.values()
            if include_disabled or r.enabled
        ]

    def get_recent_reactions(self, limit: int = 20) -> list[dict[str, Any]]:
        """Return the most recent reaction executions."""
        return self._reaction_log[-limit:]

    def get_statistics(self) -> dict[str, Any]:
        """Return reaction engine statistics."""
        total_actions = sum(r.action_count for r in self._rules.values())
        return {
            "total_rules": len(self._rules),
            "enabled_rules": sum(1 for r in self._rules.values() if r.enabled),
            "builtin_rules": sum(1 for r in self._rules.values() if r.is_builtin),
            "total_actions_executed": total_actions,
            "recent_reaction_count": len(self._reaction_log),
        }
