"""
Structured Observability Module for the Maritime Compliance Swarm.

Provides structured logging, health check aggregation, metrics collection,
and diagnostic endpoints. Designed for the polyglot microservices architecture
(Python gateway + Go MTTR tracker).

Components:
- StructuredLogger: JSON-formatted structured logging with correlation IDs
- HealthAggregator: Aggregates health status from all system components
- MetricsCollector: In-process metrics (counters, histograms, gauges)
- DiagnosticReporter: Generates diagnostic snapshots for debugging
"""

from __future__ import annotations

import json
import logging
import os
import threading
import time
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Callable, Optional


# ---------------------------------------------------------------------------
# Structured Logger
# ---------------------------------------------------------------------------

class LogLevel(str, Enum):
    DEBUG = "DEBUG"
    INFO = "INFO"
    WARNING = "WARNING"
    ERROR = "ERROR"
    CRITICAL = "CRITICAL"


class StructuredFormatter(logging.Formatter):
    """JSON-structured log formatter for production observability."""

    def format(self, record: logging.LogRecord) -> str:
        log_entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno,
        }

        # Attach correlation ID if present
        correlation_id = getattr(record, "correlation_id", None)
        if correlation_id:
            log_entry["correlation_id"] = correlation_id

        # Attach request ID if present
        request_id = getattr(record, "request_id", None)
        if request_id:
            log_entry["request_id"] = request_id

        # Attach extra fields
        for key, value in record.__dict__.items():
            if key not in ("asctime", "message", "msg", "args", "levelname",
                           "levelno", "pathname", "filename", "module",
                           "exc_info", "exc_text", "stack_info", "lineno",
                           "funcName", "created", "msecs", "relativeCreated",
                           "thread", "threadName", "name", "correlation_id",
                           "request_id", "taskName"):
                if not key.startswith("_"):
                    try:
                        json.dumps(value)  # Test serialisability
                        log_entry[key] = value
                    except (TypeError, ValueError):
                        log_entry[key] = str(value)

        # Include exception info if present
        if record.exc_info:
            log_entry["exception"] = self.formatException(record.exc_info)

        return json.dumps(log_entry, default=str)


def setup_structured_logging(
    level: str = "INFO",
    service_name: str = "compliance-gateway",
) -> logging.Logger:
    """Configure root logger with structured JSON output.

    Args:
        level: Log level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
        service_name: Service identifier included in all log entries

    Returns:
        Configured root logger instance
    """
    root_logger = logging.getLogger()
    root_logger.setLevel(getattr(logging, level.upper(), logging.INFO))

    # Remove default handlers
    root_logger.handlers.clear()

    # Console handler with structured formatter
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(StructuredFormatter())
    root_logger.addHandler(console_handler)

    # Add service context filter
    class ServiceFilter(logging.Filter):
        def filter(self, record):
            record.service = service_name
            return True

    root_logger.addFilter(ServiceFilter())

    return root_logger


# ---------------------------------------------------------------------------
# Health Aggregator
# ---------------------------------------------------------------------------

class HealthStatus(str, Enum):
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNHEALTHY = "unhealthy"
    UNKNOWN = "unknown"


@dataclass
class ComponentHealth:
    name: str
    status: HealthStatus
    latency_ms: float = 0.0
    detail: str = ""
    checked_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    error: Optional[str] = None


class HealthAggregator:
    """Aggregates health status from all system components.

    Each component registers a health check function that returns
    a ComponentHealth. The aggregator computes an overall system
    health status based on component results.
    """

    def __init__(self):
        self._checks: dict[str, Callable[[], ComponentHealth]] = {}
        self._history: list[dict] = []
        self._lock = threading.Lock()

    def register(self, name: str, check_fn: Callable[[], ComponentHealth]) -> None:
        """Register a component health check function."""
        self._checks[name] = check_fn

    def unregister(self, name: str) -> None:
        """Remove a registered health check."""
        self._checks.pop(name, None)

    def check_all(self) -> dict:
        """Run all registered health checks and return aggregated status."""
        components = {}
        healthy_count = 0
        total_count = len(self._checks)

        for name, check_fn in self._checks.items():
            try:
                start = time.monotonic()
                health = check_fn()
                health.latency_ms = round((time.monotonic() - start) * 1000, 2)
                components[name] = health
                if health.status == HealthStatus.HEALTHY:
                    healthy_count += 1
            except Exception as e:
                components[name] = ComponentHealth(
                    name=name,
                    status=HealthStatus.UNHEALTHY,
                    error=str(e),
                )

        # Determine overall status
        unhealthy = sum(1 for c in components.values()
                       if c.status == HealthStatus.UNHEALTHY)
        degraded = sum(1 for c in components.values()
                      if c.status == HealthStatus.DEGRADED)

        if unhealthy > 0:
            overall = HealthStatus.UNHEALTHY
        elif degraded > 0:
            overall = HealthStatus.DEGRADED
        elif healthy_count == total_count and total_count > 0:
            overall = HealthStatus.HEALTHY
        else:
            overall = HealthStatus.UNKNOWN

        snapshot = {
            "status": overall.value,
            "components": {
                name: {
                    "status": h.status.value,
                    "latency_ms": h.latency_ms,
                    "detail": h.detail,
                    "error": h.error,
                    "checked_at": h.checked_at.isoformat(),
                }
                for name, h in components.items()
            },
            "summary": {
                "total": total_count,
                "healthy": healthy_count,
                "degraded": degraded,
                "unhealthy": unhealthy,
            },
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

        with self._lock:
            self._history.append(snapshot)
            # Keep last 1000 snapshots
            if len(self._history) > 1000:
                self._history = self._history[-1000:]

        return snapshot


# ---------------------------------------------------------------------------
# Metrics Collector
# ---------------------------------------------------------------------------

@dataclass
class MetricPoint:
    value: float
    timestamp: float = field(default_factory=time.monotonic)
    labels: dict = field(default_factory=dict)


class MetricsCollector:
    """In-process metrics collection for counters, histograms, and gauges.

    Thread-safe implementation suitable for the FastAPI async runtime.
    Metrics are stored in memory; in production, flush to Prometheus/
    StatsD/CloudWatch at regular intervals.
    """

    def __init__(self):
        self._counters: dict[str, float] = defaultdict(float)
        self._gauges: dict[str, float] = {}
        self._histograms: dict[str, list[float]] = defaultdict(list)
        self._lock = threading.Lock()

    def increment_counter(self, name: str, value: float = 1.0, labels: Optional[dict] = None) -> None:
        """Increment a counter metric."""
        key = self._labelled_key(name, labels)
        with self._lock:
            self._counters[key] += value

    def set_gauge(self, name: str, value: float, labels: Optional[dict] = None) -> None:
        """Set a gauge metric to a specific value."""
        key = self._labelled_key(name, labels)
        with self._lock:
            self._gauges[key] = value

    def record_histogram(self, name: str, value: float, labels: Optional[dict] = None) -> None:
        """Record a value in a histogram."""
        key = self._labelled_key(name, labels)
        with self._lock:
            self._histograms[key].append(value)
            # Keep last 10000 points per histogram
            if len(self._histograms[key]) > 10000:
                self._histograms[key] = self._histograms[key][-10000:]

    def get_counter(self, name: str, labels: Optional[dict] = None) -> float:
        key = self._labelled_key(name, labels)
        return self._counters.get(key, 0.0)

    def get_gauge(self, name: str, labels: Optional[dict] = None) -> Optional[float]:
        key = self._labelled_key(name, labels)
        return self._gauges.get(key)

    def get_histogram_stats(self, name: str, labels: Optional[dict] = None) -> dict:
        """Return count, mean, p50, p95, p99, min, max for a histogram."""
        key = self._labelled_key(name, labels)
        values = self._histograms.get(key, [])
        if not values:
            return {"count": 0, "mean": 0, "p50": 0, "p95": 0, "p99": 0, "min": 0, "max": 0}

        sorted_vals = sorted(values)
        n = len(sorted_vals)
        return {
            "count": n,
            "mean": round(sum(sorted_vals) / n, 4),
            "p50": round(sorted_vals[int(n * 0.50)], 4),
            "p95": round(sorted_vals[int(n * 0.95)] if n > 20 else sorted_vals[-1], 4),
            "p99": round(sorted_vals[int(n * 0.99)] if n > 100 else sorted_vals[-1], 4),
            "min": round(sorted_vals[0], 4),
            "max": round(sorted_vals[-1], 4),
        }

    def get_all_metrics(self) -> dict:
        """Return a snapshot of all collected metrics."""
        with self._lock:
            return {
                "counters": dict(self._counters),
                "gauges": dict(self._gauges),
                "histograms": {
                    key: self.get_histogram_stats_from_values(values)
                    for key, values in self._histograms.items()
                },
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }

    @staticmethod
    def get_histogram_stats_from_values(values: list[float]) -> dict:
        if not values:
            return {"count": 0, "mean": 0, "p50": 0, "p95": 0, "p99": 0, "min": 0, "max": 0}
        sorted_vals = sorted(values)
        n = len(sorted_vals)
        return {
            "count": n,
            "mean": round(sum(sorted_vals) / n, 4),
            "p50": round(sorted_vals[int(n * 0.50)], 4),
            "p95": round(sorted_vals[min(int(n * 0.95), n - 1)], 4),
            "p99": round(sorted_vals[min(int(n * 0.99), n - 1)], 4),
            "min": round(sorted_vals[0], 4),
            "max": round(sorted_vals[-1], 4),
        }

    @staticmethod
    def _labelled_key(name: str, labels: Optional[dict]) -> str:
        if not labels:
            return name
        label_str = ",".join(f"{k}={v}" for k, v in sorted(labels.items()))
        return f"{name}{{{label_str}}}"


# ---------------------------------------------------------------------------
# Global instances
# ---------------------------------------------------------------------------

# Global metrics collector
metrics = MetricsCollector()

# Global health aggregator
health_aggregator = HealthAggregator()