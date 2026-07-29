"""Unified Finding State Machine for the Maritime Compliance Swarm.

Replaces the loosely-coupled AuditStatus (Python) and EventPhase (Go) with
a single authoritative state machine. Every state transition is validated,
audited, and emits events for the reaction engine to process.

States:
    DETECTED          - Finding created by audit scan
    TRIAGED           - Severity and risk assessed
    ASSIGNED          - Owner/assignee set for remediation
    IN_REMEDIATION    - Active remediation in progress
    AWAITING_VERIFICATION - Remediation applied, pending verification
    ESCALATED         - Auto-escalated due to SLA breach or severity
    RISK_ACCEPTED     - Formally accepted risk with compliance officer sign-off
    VERIFIED          - Remediation confirmed effective
    CLOSED            - Finding resolved and archived
    FALSE_POSITIVE    - Finding invalidated after triage

Each transition carries:
    - trigger: What caused it (audit_scan, auto_policy, manual_assign, ...)
    - actor: system | user | timer
    - guard_conditions: Evaluated before allowing the transition
    - timeout_rules: Max time in current state before auto-escalation
    - side_effects: Actions triggered after successful transition
    - context_payload: JSON blob with transition metadata

Usage:
    from shared.state_machine import FindingStateMachine

    sm = FindingStateMachine()
    result = sm.transition(
        finding=finding,
        target_state="assigned",
        trigger="manual_assign",
        actor="user:john.smith",
        context={"assignee": "compliance-team-lead"},
        session=db_session,
    )
"""

from __future__ import annotations

import enum
import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable, Optional

logger = logging.getLogger(__name__)


# ── State Machine States ─────────────────────────────────────────────────

class FindingState(str, enum.Enum):
    """Canonical lifecycle states for a compliance finding."""
    DETECTED = "detected"
    TRIAGED = "triaged"
    ASSIGNED = "assigned"
    IN_REMEDIATION = "in_remediation"
    AWAITING_VERIFICATION = "awaiting_verification"
    ESCALATED = "escalated"
    RISK_ACCEPTED = "risk_accepted"
    VERIFIED = "verified"
    CLOSED = "closed"
    FALSE_POSITIVE = "false_positive"


# ── Transition Triggers ───────────────────────────────────────────────────

class TransitionTrigger(str, enum.Enum):
    AUDIT_SCAN = "audit_scan"
    AUTO_TRIAGE = "auto_triage"
    MANUAL_TRIAGE = "manual_triage"
    AUTO_ASSIGN = "auto_assign"
    MANUAL_ASSIGN = "manual_assign"
    ESCALATION_TIMER = "escalation_timer"
    MANUAL_ESCALATION = "manual_escalation"
    AUTO_POLICY_GENERATED = "auto_policy_generated"
    REMEDIATION_STARTED = "remediation_started"
    REMEDIATION_COMPLETED = "remediation_completed"
    VERIFICATION_PASSED = "verification_passed"
    VERIFICATION_FAILED = "verification_failed"
    RISK_ACCEPTED_SIGNED = "risk_accepted_signed"
    MANUAL_CLOSE = "manual_close"
    FALSE_POSITIVE_MARKED = "false_positive_marked"
    REGRESSION_DETECTED = "regression_detected"


# ── Actor Types ───────────────────────────────────────────────────────────

class ActorType(str, enum.Enum):
    SYSTEM = "system"
    USER = "user"
    TIMER = "timer"


# ── Timeout Rules (hours) by severity ─────────────────────────────────────

STATE_TIMEOUTS_HOURS: dict[str, dict[str, float]] = {
    "detected": {
        "critical": 1.0,
        "high": 4.0,
        "medium": 24.0,
        "low": 72.0,
        "info": 168.0,
    },
    "triaged": {
        "critical": 1.0,
        "high": 4.0,
        "medium": 24.0,
        "low": 72.0,
        "info": 168.0,
    },
    "assigned": {
        "critical": 4.0,
        "high": 8.0,
        "medium": 48.0,
        "low": 168.0,
        "info": 336.0,
    },
    "in_remediation": {
        "critical": 8.0,
        "high": 24.0,
        "medium": 72.0,
        "low": 168.0,
        "info": 336.0,
    },
    "awaiting_verification": {
        "critical": 4.0,
        "high": 12.0,
        "medium": 48.0,
        "low": 120.0,
    },
}


def _get_timeout_hours(state: str, severity: str) -> Optional[float]:
    """Get the maximum hours allowed in a state before auto-escalation."""
    state_rules = STATE_TIMEOUTS_HOURS.get(state, {})
    return state_rules.get(severity)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _new_uuid() -> str:
    return str(uuid.uuid4())


# ── Transition Definition ─────────────────────────────────────────────────

@dataclass
class TransitionDefinition:
    """Defines a valid state transition with its rules."""
    from_state: str
    to_state: str
    allowed_triggers: list[str] = field(default_factory=list)
    allowed_actors: list[str] = field(default_factory=lambda: ["system", "user", "timer"])
    guard: Optional[Callable] = None
    reversible: bool = False
    requires_sign_off: bool = False
    description: str = ""


# ── Guard Condition Functions ─────────────────────────────────────────────

def _guard_critical_needs_sign_off(context: dict[str, Any]) -> bool:
    """CRITICAL findings cannot transition to RISK_ACCEPTED without sign-off."""
    severity = context.get("severity", "").lower()
    if severity == "critical":
        return bool(context.get("sign_off_by"))
    return True


def _guard_not_escalated_to_closed(context: dict[str, Any]) -> bool:
    """ESCALATED findings must go through verification before close."""
    current_state = context.get("current_state", "")
    if current_state == "escalated" and context.get("target_state") == "closed":
        return False
    return True


def _guard_verification_requires_remediation(context: dict[str, Any]) -> bool:
    """Can only verify if remediation has been completed."""
    current_state = context.get("current_state", "")
    return current_state == "awaiting_verification"


def _guard_false_positive_only_from_triage(context: dict[str, Any]) -> bool:
    """FALSE_POSITIVE only allowed from DETECTED or TRIAGED."""
    current_state = context.get("current_state", "")
    return current_state in ("detected", "triaged")


# ── Transition Table ──────────────────────────────────────────────────────

TRANSITIONS: list[TransitionDefinition] = [
    # From DETECTED
    TransitionDefinition(
        from_state="detected", to_state="triaged",
        allowed_triggers=["auto_triage", "manual_triage"],
        description="Finding has been assessed for severity and risk category",
    ),
    TransitionDefinition(
        from_state="detected", to_state="false_positive",
        allowed_triggers=["false_positive_marked"],
        guard=_guard_false_positive_only_from_triage,
        description="Finding invalidated — not a real compliance issue",
    ),

    # From TRIAGED
    TransitionDefinition(
        from_state="triaged", to_state="assigned",
        allowed_triggers=["auto_assign", "manual_assign"],
        description="Finding assigned to an owner/team for remediation",
    ),
    TransitionDefinition(
        from_state="triaged", to_state="escalated",
        allowed_triggers=["manual_escalation"],
        description="Manually escalated during triage (e.g., cross-jurisdictional)",
    ),
    TransitionDefinition(
        from_state="triaged", to_state="false_positive",
        allowed_triggers=["false_positive_marked"],
        guard=_guard_false_positive_only_from_triage,
        description="Finding invalidated after triage review",
    ),
    TransitionDefinition(
        from_state="triaged", to_state="risk_accepted",
        allowed_triggers=["risk_accepted_signed"],
        guard=_guard_critical_needs_sign_off,
        requires_sign_off=True,
        description="Risk formally accepted with compliance officer sign-off",
    ),

    # From ASSIGNED
    TransitionDefinition(
        from_state="assigned", to_state="in_remediation",
        allowed_triggers=["remediation_started", "auto_policy_generated"],
        description="Active remediation work has begun",
    ),
    TransitionDefinition(
        from_state="assigned", to_state="escalated",
        allowed_triggers=["escalation_timer", "manual_escalation"],
        description="Escalated due to timeout or manual override",
    ),

    # From IN_REMEDIATION
    TransitionDefinition(
        from_state="in_remediation", to_state="awaiting_verification",
        allowed_triggers=["remediation_completed"],
        description="Remediation applied, pending verification",
    ),
    TransitionDefinition(
        from_state="in_remediation", to_state="escalated",
        allowed_triggers=["escalation_timer", "manual_escalation"],
        description="Escalated due to slow remediation progress",
    ),

    # From AWAITING_VERIFICATION
    TransitionDefinition(
        from_state="awaiting_verification", to_state="verified",
        allowed_triggers=["verification_passed"],
        description="Remediation confirmed effective",
    ),
    TransitionDefinition(
        from_state="awaiting_verification", to_state="in_remediation",
        allowed_triggers=["verification_failed", "regression_detected"],
        reversible=True,
        description="Verification failed — back to remediation",
    ),
    TransitionDefinition(
        from_state="awaiting_verification", to_state="escalated",
        allowed_triggers=["escalation_timer", "manual_escalation"],
        description="Escalated due to verification timeout",
    ),

    # From ESCALATED
    TransitionDefinition(
        from_state="escalated", to_state="assigned",
        allowed_triggers=["manual_assign"],
        description="De-escalated and reassigned",
    ),
    TransitionDefinition(
        from_state="escalated", to_state="in_remediation",
        allowed_triggers=["remediation_started"],
        description="Escalated finding enters remediation",
    ),
    TransitionDefinition(
        from_state="escalated", to_state="risk_accepted",
        allowed_triggers=["risk_accepted_signed"],
        guard=_guard_critical_needs_sign_off,
        requires_sign_off=True,
        description="Escalated risk accepted at executive level",
    ),

    # From VERIFIED
    TransitionDefinition(
        from_state="verified", to_state="closed",
        allowed_triggers=["manual_close"],
        description="Finding closed after successful verification",
    ),
    TransitionDefinition(
        from_state="verified", to_state="in_remediation",
        allowed_triggers=["regression_detected"],
        reversible=True,
        description="Regression detected — finding reopened for remediation",
    ),

    # From RISK_ACCEPTED
    TransitionDefinition(
        from_state="risk_accepted", to_state="closed",
        allowed_triggers=["manual_close"],
        description="Accepted risk finding archived",
    ),

    # From FALSE_POSITIVE
    TransitionDefinition(
        from_state="false_positive", to_state="closed",
        allowed_triggers=["manual_close"],
        description="False positive finding archived",
    ),
]


# Build lookup structures
_TRANSITION_MAP: dict[str, dict[str, TransitionDefinition]] = {}
for t in TRANSITIONS:
    _TRANSITION_MAP.setdefault(t.from_state, {})[t.to_state] = t


# ── Transition Result ─────────────────────────────────────────────────────

@dataclass
class TransitionResult:
    """Result of a state machine transition attempt."""
    success: bool
    finding_id: str
    from_state: str
    to_state: str
    trigger: str
    actor: str
    transition_id: str = ""
    error: Optional[str] = None
    guard_failed: bool = False
    auto_escalated: bool = False
    timeout_hours: Optional[float] = None
    context: dict[str, Any] = field(default_factory=dict)


# ── State Machine Engine ──────────────────────────────────────────────────

class FindingStateMachine:
    """Authoritative state machine for compliance finding lifecycles.

    Validates every transition against the transition table, enforces
    guard conditions, records an audit trail, computes timeout windows,
    and emits events for downstream consumers.
    """

    def __init__(self):
        self._transitions = _TRANSITION_MAP
        self._on_transition_callbacks: list[Callable] = []

    def register_callback(self, callback: Callable) -> None:
        """Register a callback to be called after every successful transition.

        Callbacks receive a TransitionResult and are useful for
        emitting events to the event bus.
        """
        self._on_transition_callbacks.append(callback)

    def get_valid_transitions(self, current_state: str) -> list[dict]:
        """Return all valid target states from the current state.

        Used by the frontend to render available actions.
        """
        targets = self._transitions.get(current_state, {})
        return [
            {
                "to_state": to_state,
                "triggers": defn.allowed_triggers,
                "reversible": defn.reversible,
                "requires_sign_off": defn.requires_sign_off,
                "description": defn.description,
            }
            for to_state, defn in targets.items()
        ]

    def get_timeout_hours(self, state: str, severity: str) -> Optional[float]:
        """Get the timeout window for a state given a severity level."""
        return _get_timeout_hours(state, severity)

    def get_full_definition(self) -> dict:
        """Return the complete state machine definition for the frontend.

        Includes all states, transitions, timeout rules, and guard
        descriptions — useful for rendering a visual state diagram.
        """
        states = []
        for s in FindingState:
            transitions_out = self.get_valid_transitions(s.value)
            timeouts = {sev: hrs for sev, hrs in STATE_TIMEOUTS_HOURS.get(s.value, {}).items()}
            states.append({
                "name": s.value,
                "transitions": transitions_out,
                "timeouts_hours": timeouts,
            })

        return {
            "states": states,
            "total_states": len(states),
            "total_transitions": len(TRANSITIONS),
            "triggers": [t.value for t in TransitionTrigger],
            "actors": [a.value for a in ActorType],
            "timeout_rules": STATE_TIMEOUTS_HOURS,
        }

    def transition(
        self,
        finding_id: str,
        current_state: str,
        target_state: str,
        trigger: str,
        actor: str = "system",
        context: Optional[dict[str, Any]] = None,
        severity: str = "medium",
        session=None,
    ) -> TransitionResult:
        """Attempt a state transition for a finding.

        Args:
            finding_id: The finding's database ID.
            current_state: The finding's current state (validated against).
            target_state: The desired new state.
            trigger: What is causing this transition.
            actor: Who/what is initiating (system, user:john, timer).
            context: Additional metadata (sign_off_by, reason, etc.).
            severity: Finding severity (used for timeout calculations).
            session: SQLAlchemy session for persisting the transition record.

        Returns:
            TransitionResult with success/failure and audit details.
        """
        ctx = context or {}
        ctx["current_state"] = current_state
        ctx["target_state"] = target_state
        ctx["severity"] = severity

        transition_id = _new_uuid()

        # 1. Validate transition exists
        state_targets = self._transitions.get(current_state, {})
        definition = state_targets.get(target_state)

        if definition is None:
            logger.warning(
                "Invalid transition: %s -> %s for finding %s",
                current_state, target_state, finding_id,
            )
            return TransitionResult(
                success=False,
                finding_id=finding_id,
                from_state=current_state,
                to_state=target_state,
                trigger=trigger,
                actor=actor,
                transition_id=transition_id,
                error=f"Transition {current_state} -> {target_state} is not defined",
                guard_failed=False,
                context=ctx,
            )

        # 2. Validate trigger
        if trigger not in definition.allowed_triggers:
            return TransitionResult(
                success=False,
                finding_id=finding_id,
                from_state=current_state,
                to_state=target_state,
                trigger=trigger,
                actor=actor,
                transition_id=transition_id,
                error=f"Trigger '{trigger}' not allowed for {current_state} -> {target_state}. "
                       f"Allowed: {definition.allowed_triggers}",
                guard_failed=False,
                context=ctx,
            )

        # 3. Validate actor
        if actor.split(":")[0] not in definition.allowed_actors:
            return TransitionResult(
                success=False,
                finding_id=finding_id,
                from_state=current_state,
                to_state=target_state,
                trigger=trigger,
                actor=actor,
                transition_id=transition_id,
                error=f"Actor '{actor}' not allowed for this transition",
                guard_failed=False,
                context=ctx,
            )

        # 4. Evaluate guard conditions
        if definition.guard is not None:
            try:
                guard_passed = definition.guard(ctx)
            except Exception as e:
                logger.error("Guard condition error for finding %s: %s", finding_id, e)
                guard_passed = False

            if not guard_passed:
                logger.warning(
                    "Guard condition failed: %s -> %s for finding %s",
                    current_state, target_state, finding_id,
                )
                return TransitionResult(
                    success=False,
                    finding_id=finding_id,
                    from_state=current_state,
                    to_state=target_state,
                    trigger=trigger,
                    actor=actor,
                    transition_id=transition_id,
                    error="Guard condition not satisfied",
                    guard_failed=True,
                    context=ctx,
                )

        # 5. Transition is valid — compute timeout for new state
        timeout = _get_timeout_hours(target_state, severity)

        result = TransitionResult(
            success=True,
            finding_id=finding_id,
            from_state=current_state,
            to_state=target_state,
            trigger=trigger,
            actor=actor,
            transition_id=transition_id,
            timeout_hours=timeout,
            context=ctx,
        )

        # 6. Persist transition record if session provided
        if session is not None:
            self._persist_transition(session, result)

        # 7. Fire callbacks
        for callback in self._on_transition_callbacks:
            try:
                callback(result)
            except Exception as e:
                logger.error("Transition callback error: %s", e)

        logger.info(
            "State transition: finding=%s %s -> %s (trigger=%s, actor=%s)",
            finding_id, current_state, target_state, trigger, actor,
        )

        return result

    def check_timeouts(self, findings: list[dict], session=None) -> list[TransitionResult]:
        """Check all open findings for timeout violations.

        Finds that have exceeded their timeout window are auto-escalated.

        Args:
            findings: List of dicts with keys: id, state, severity, detected_at.
            session: Optional session for persisting escalations.

        Returns:
            List of TransitionResult for any auto-escalations.
        """
        now = _utcnow()
        escalations = []

        for finding in findings:
            state = finding.get("state", "")
            severity = finding.get("severity", "medium")
            detected_at = finding.get("detected_at")

            if not detected_at:
                continue

            if isinstance(detected_at, str):
                try:
                    detected_at = datetime.fromisoformat(detected_at)
                except (ValueError, TypeError):
                    continue

            timeout = _get_timeout_hours(state, severity)
            if timeout is None:
                continue

            elapsed_hours = (now - detected_at).total_seconds() / 3600

            if elapsed_hours > timeout:
                result = self.transition(
                    finding_id=finding["id"],
                    current_state=state,
                    target_state="escalated",
                    trigger="escalation_timer",
                    actor="timer",
                    context={
                        "severity": severity,
                        "elapsed_hours": round(elapsed_hours, 2),
                        "timeout_hours": timeout,
                        "reason": f"Auto-escalated: {elapsed_hours:.1f}h exceeded {timeout}h timeout",
                    },
                    severity=severity,
                    session=session,
                )
                if result.success:
                    result.auto_escalated = True
                    escalations.append(result)

        return escalations

    def _persist_transition(self, session, result: TransitionResult) -> None:
        """Write the transition record to the finding_transitions table."""
        try:
            from shared.models import FindingTransition

            record = FindingTransition(
                id=result.transition_id,
                finding_id=result.finding_id,
                from_state=result.from_state,
                to_state=result.to_state,
                trigger=result.trigger,
                actor=result.actor,
                guard_failed=result.guard_failed,
                auto_escalated=result.auto_escalated,
                timeout_hours=result.timeout_hours,
                context_payload=result.context,
            )
            session.add(record)
            session.flush()
        except Exception as e:
            logger.error("Failed to persist transition: %s", e)

    @staticmethod
    def map_legacy_status(status: str) -> str:
        """Map legacy AuditStatus values to new FindingState values.

        Bridges the gap during migration from the old 5-state model
        to the new 10-state model.
        """
        mapping = {
            "open": "detected",
            "in_progress": "in_remediation",
            "remediated": "verified",
            "accepted_risk": "risk_accepted",
            "false_positive": "false_positive",
        }
        return mapping.get(status, status)

    @staticmethod
    def map_go_phase(phase: str) -> str:
        """Map Go MTTR EventPhase values to FindingState equivalents.

        These are approximate mappings since the Go phases track
        lifecycle timing, not finding state.
        """
        mapping = {
            "identified": "detected",
            "assigned": "assigned",
            "in_progress": "in_remediation",
            "resolved": "verified",
            "verified": "closed",
        }
        return mapping.get(phase, phase)


def create_state_machine() -> FindingStateMachine:
    """Factory for creating a configured FindingStateMachine."""
    return FindingStateMachine()
