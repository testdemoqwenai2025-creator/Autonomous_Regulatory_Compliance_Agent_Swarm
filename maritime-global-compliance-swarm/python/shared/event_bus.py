"""Event Bus for the Maritime Compliance Swarm.

Provides a lightweight, database-backed event system that decouples
producers from consumers. In production (PostgreSQL), uses
LISTEN/NOTIFY for real-time push. In development (SQLite),
falls back to an in-process queue with polling.

The event bus enables the swarm to *react* rather than just record:
    - CRITICAL finding detected  -> immediate notification
    - PII exposure found       -> auto-trigger anonymisation scan
    - Cert expiry detected      -> schedule renewal check
    - State timeout breach      -> auto-escalate
    - Remediation completed    -> trigger verification

Event Schema:
    {
        "event_id": "uuid",
        "event_type": "finding.state_changed",
        "source": "state_machine",
        "payload": { ... },
        "timestamp": "2025-01-15T10:30:00Z",
        "correlation_id": "finding-uuid",
        "metadata": { ... }
    }

Usage:
    from shared.event_bus import EventBus, EventType

    bus = EventBus(session_factory)
    bus.publish(EventType.FINDING_CREATED, payload={...}, correlation_id="...")
    bus.subscribe(EventType.FINDING_ESCALATED, my_handler)
    bus.start()  # begins consumer loop
"""

from __future__ import annotations

import json
import logging
import queue
import threading
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Callable, Optional

logger = logging.getLogger(__name__)


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_uuid() -> str:
    return str(uuid.uuid4())


# ── Event Types ───────────────────────────────────────────────────────────

class EventType(str, Enum):
    """All event types in the compliance swarm."""
    # Finding lifecycle events
    FINDING_CREATED = "finding.created"
    FINDING_STATE_CHANGED = "finding.state_changed"
    FINDING_ESCALATED = "finding.escalated"
    FINDING_VERIFIED = "finding.verified"
    FINDING_CLOSED = "finding.closed"
    FINDING_FALSE_POSITIVE = "finding.false_positive"
    FINDING_TIMEOUT_BREACH = "finding.timeout_breach"

    # Anonymiser events
    PII_DETECTED = "pii.detected"
    PII_ANONYMISED = "pii.anonymised"
    NER_SCAN_COMPLETED = "ner.scan_completed"

    # Auditor events
    AUDIT_STARTED = "audit.started"
    AUDIT_COMPLETED = "audit.completed"
    AUDIT_QUERY_ERROR = "audit.query_error"
    QUERY_REGISTRY_UPDATED = "query_registry.updated"

    # Remediation events
    POLICY_GENERATED = "policy.generated"
    POLICY_APPLIED = "policy.applied"
    EDI_PROFILE_UPDATED = "edi.profile_updated"
    REMEDIATION_FAILED = "remediation.failed"

    # MTTR events
    MTTR_EVENT_INGESTED = "mttr.event_ingested"
    MTTR_REPORT_GENERATED = "mttr.report_generated"

    # System events
    SYSTEM_HEALTH_CHANGED = "system.health_changed"
    REACTION_TRIGGERED = "reaction.triggered"


# ── Event Envelope ────────────────────────────────────────────────────────

@dataclass
class ComplianceEvent:
    """An immutable event envelope."""
    event_id: str
    event_type: str
    source: str
    payload: dict[str, Any]
    timestamp: str
    correlation_id: Optional[str] = None
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "event_id": self.event_id,
            "event_type": self.event_type,
            "source": self.source,
            "payload": self.payload,
            "timestamp": self.timestamp,
            "correlation_id": self.correlation_id,
            "metadata": self.metadata,
        }

    @classmethod
    def from_dict(cls, data: dict) -> ComplianceEvent:
        return cls(
            event_id=data["event_id"],
            event_type=data["event_type"],
            source=data["source"],
            payload=data.get("payload", {}),
            timestamp=data["timestamp"],
            correlation_id=data.get("correlation_id"),
            metadata=data.get("metadata", {}),
        )


# ── Event Store (database-backed) ─────────────────────────────────────────

class EventStore:
    """Persists events to the event_log table.

    In PostgreSQL mode, also sends via LISTEN/NOTIFY for real-time
    consumer notification.
    """

    def __init__(self, session_factory, is_postgres: bool = False):
        self._session_factory = session_factory
        self._is_postgres = is_postgres
        self._channel = "compliance_events"

    def store(self, event: ComplianceEvent) -> None:
        """Persist an event and notify listeners."""
        from shared.models import EventLog

        with self._session_factory() as session:
            record = EventLog(
                id=event.event_id,
                event_type=event.event_type,
                source=event.source,
                payload=event.payload,
                correlation_id=event.correlation_id,
                metadata=event.metadata,
            )
            session.add(record)

            # PostgreSQL LISTEN/NOTIFY for real-time push
            if self._is_postgres:
                try:
                    from sqlalchemy import text as sa_text
                    notification = json.dumps(event.to_dict(), default=str)
                    # Truncate if too long for PG NOTIFY (8000 byte limit)
                    if len(notification) > 7500:
                        notification = notification[:7500] + "...\"}"
                    session.execute(
                        sa_text(f"SELECT pg_notify(:channel, :payload)"),
                        {"channel": self._channel, "payload": notification},
                    )
                except Exception as e:
                    logger.debug("PG NOTIFY skipped: %s", e)

            session.commit()

    def get_recent(
        self,
        event_type: Optional[str] = None,
        correlation_id: Optional[str] = None,
        limit: int = 50,
    ) -> list[ComplianceEvent]:
        """Retrieve recent events from the store."""
        from shared.models import EventLog

        with self._session_factory() as session:
            query = session.query(EventLog)
            if event_type:
                query = query.filter(EventLog.event_type == event_type)
            if correlation_id:
                query = query.filter(EventLog.correlation_id == correlation_id)
            records = (
                query.order_by(EventLog.created_at.desc())
                .limit(limit)
                .all()
            )
            return [
                ComplianceEvent(
                    event_id=r.id,
                    event_type=r.event_type,
                    source=r.source,
                    payload=r.payload or {},
                    timestamp=r.created_at.isoformat() if r.created_at else "",
                    correlation_id=r.correlation_id,
                    metadata=r.meta_data or {},
                )
                for r in records
            ]

    def get_statistics(self) -> dict[str, Any]:
        """Get event bus statistics."""
        from shared.models import EventLog
        from sqlalchemy import func

        with self._session_factory() as session:
            total = session.query(func.count(EventLog.id)).scalar() or 0
            type_counts = (
                session.query(EventLog.event_type, func.count(EventLog.id))
                .group_by(EventLog.event_type)
                .all()
            )
            by_type = {et: cnt for et, cnt in type_counts}

            return {
                "total_events": total,
                "by_type": by_type,
                "event_types_available": [t.value for t in EventType],
            }


# ── Event Bus (publisher + subscriber hub) ────────────────────────────────

class EventBus:
    """Central event bus for the compliance swarm.

    Publishes events to the EventStore and dispatches them to
    registered subscriber handlers. Runs a background consumer
    loop for processing queued events.

    In SQLite/dev mode, uses an in-process queue.
    In PostgreSQL/prod mode, can optionally use LISTEN/NOTIFY.
    """

    def __init__(self, session_factory, is_postgres: bool = False):
        self._store = EventStore(session_factory, is_postgres)
        self._subscribers: dict[str, list[Callable]] = {}
        self._wildcard_subscribers: list[Callable] = []
        self._queue: queue.Queue[ComplianceEvent] = queue.Queue(maxsize=10000)
        self._running = False
        self._consumer_thread: Optional[threading.Thread] = None
        self._lock = threading.Lock()
        self._events_published = 0
        self._events_processed = 0
        self._errors = 0

    def publish(
        self,
        event_type: str,
        payload: dict[str, Any],
        source: str = "system",
        correlation_id: Optional[str] = None,
        metadata: Optional[dict] = None,
    ) -> ComplianceEvent:
        """Publish an event to the bus.

        The event is stored in the database and queued for
        subscriber dispatch.
        """
        event = ComplianceEvent(
            event_id=_new_uuid(),
            event_type=event_type,
            source=source,
            payload=payload,
            timestamp=_utcnow(),
            correlation_id=correlation_id,
            metadata=metadata or {},
        )

        # Persist
        self._store.store(event)

        # Queue for async dispatch
        try:
            self._queue.put_nowait(event)
        except queue.Full:
            logger.warning("Event queue full — dropping event %s", event.event_id)
            self._errors += 1
            return event

        with self._lock:
            self._events_published += 1

        logger.debug(
            "Event published: %s (source=%s, correlation=%s)",
            event_type, source, correlation_id,
        )
        return event

    def subscribe(self, event_type: str, handler: Callable) -> None:
        """Subscribe a handler to a specific event type."""
        with self._lock:
            self._subscribers.setdefault(event_type, []).append(handler)

    def subscribe_all(self, handler: Callable) -> None:
        """Subscribe a handler to ALL event types (wildcard)."""
        with self._lock:
            self._wildcard_subscribers.append(handler)

    def unsubscribe(self, event_type: str, handler: Callable) -> None:
        """Remove a handler from a specific event type."""
        with self._lock:
            handlers = self._subscribers.get(event_type, [])
            if handler in handlers:
                handlers.remove(handler)

    def start(self, daemon: bool = True) -> None:
        """Start the background consumer loop."""
        if self._running:
            return
        self._running = True
        self._consumer_thread = threading.Thread(
            target=self._consumer_loop,
            name="event-bus-consumer",
            daemon=daemon,
        )
        self._consumer_thread.start()
        logger.info("Event bus consumer started")

    def stop(self, timeout: float = 5.0) -> None:
        """Stop the consumer loop and wait for pending events."""
        self._running = False
        if self._consumer_thread and self._consumer_thread.is_alive():
            self._consumer_thread.join(timeout=timeout)
        logger.info("Event bus consumer stopped")

    def _consumer_loop(self) -> None:
        """Background loop that dispatches events to subscribers."""
        while self._running or not self._queue.empty():
            try:
                event = self._queue.get(timeout=0.5)
            except queue.Empty:
                continue

            handlers = []
            with self._lock:
                handlers.extend(self._subscribers.get(event.event_type, []))
                handlers.extend(self._wildcard_subscribers)

            for handler in handlers:
                try:
                    handler(event)
                except Exception as e:
                    logger.error(
                        "Event handler error for %s: %s",
                        event.event_type, e,
                        exc_info=True,
                    )
                    self._errors += 1

            with self._lock:
                self._events_processed += 1

            self._queue.task_done()

    def process_pending(self) -> int:
        """Synchronously process all queued events (for testing/sync mode)."""
        count = 0
        while not self._queue.empty():
            try:
                event = self._queue.get_nowait()
            except queue.Empty:
                break

            handlers = []
            with self._lock:
                handlers.extend(self._subscribers.get(event.event_type, []))
                handlers.extend(self._wildcard_subscribers)

            for handler in handlers:
                try:
                    handler(event)
                except Exception as e:
                    logger.error("Sync handler error: %s", e)

            count += 1
            self._queue.task_done()

        with self._lock:
            self._events_processed += count
        return count

    def get_statistics(self) -> dict[str, Any]:
        """Get event bus statistics including store stats."""
        store_stats = self._store.get_statistics()
        with self._lock:
            return {
                **store_stats,
                "queue_depth": self._queue.qsize(),
                "events_published": self._events_published,
                "events_processed": self._events_processed,
                "errors": self._errors,
                "subscriber_count": sum(
                    len(h) for h in self._subscribers.values()
                ) + len(self._wildcard_subscribers),
                "running": self._running,
                "transport": "pg_notify" if self._store._is_postgres else "in_process_queue",
            }
