"""Pluggable query registry for the EDI SQL Auditor.

Moves audit queries from hardcoded Python to a database-backed registry.
New queries can be added, modified, or retired via API calls without
redeploying the service. Supports versioned queries so regulatory updates
create a new version while the old one remains for historical comparison.

The registry seeds itself from the 11 default queries on first init.

Usage:
    from edi_auditor.registry import QueryRegistry

    registry = QueryRegistry(session_factory)
    registry.seed_defaults()  # only inserts if empty
    queries = registry.get_active_queries(domain="encryption")
"""

from __future__ import annotations

import hashlib
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session, sessionmaker

from shared.models import Base

logger = logging.getLogger(__name__)


def _new_uuid() -> str:
    return str(uuid.uuid4())


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


# Import the AuditQueryRegistry ORM model from shared.models
# (defined there so init_schema picks it up automatically)
from shared.models import AuditQueryRegistry as AuditQueryRegistryRecord


class QueryRegistry:
    """CRUD service for the pluggable audit query registry.

    Manages versioned audit queries in the database. Supports:
    - Seeding from default queries
    - Listing/filtering active queries
    - Creating new queries (auto-increments version)
    - Updating existing queries (creates new version, deactivates old)
    - Retiring (deactivating) queries
    - Query hash comparison for change detection
    """

    def __init__(self, session_factory: sessionmaker[Session]):
        self._session_factory = session_factory

    def seed_defaults(self, default_queries: Optional[list] = None) -> int:
        """Seed the registry with default queries if empty.

        Args:
            default_queries: List of AuditQuery dataclass instances.
                             If None, imports from queries.py.

        Returns:
            Number of queries seeded.
        """
        if default_queries is None:
            from .queries import ALL_AUDIT_QUERIES
            default_queries = ALL_AUDIT_QUERIES

        with self._session_factory() as session:
            existing = session.query(AuditQueryRegistryRecord).count()
            if existing > 0:
                logger.info("Registry already has %d queries -- skipping seed", existing)
                return 0

            count = 0
            for q in default_queries:
                content_hash = self._compute_hash(
                    q.sql_template, q.parameters, q.severity
                )
                registry_entry = AuditQueryRegistryRecord(
                    query_id=q.query_id,
                    version=1,
                    name=q.name,
                    domain=q.domain.value,
                    description=q.description,
                    sql_template=q.sql_template,
                    severity=q.severity,
                    risk_category=q.risk_category,
                    affected_tables=q.affected_tables,
                    parameters=q.parameters,
                    remediation_hint=q.remediation_hint,
                    is_active=True,
                    is_builtin=True,
                    content_hash=content_hash,
                    created_by="system_seed",
                )
                session.add(registry_entry)
                count += 1

            logger.info("Seeded %d default queries into registry", count)
            return count

    def get_active_queries(
        self,
        domain: Optional[str] = None,
        min_severity: Optional[str] = None,
    ) -> list[dict[str, Any]]:
        """Get all active queries, optionally filtered."""
        with self._session_factory() as session:
            query = session.query(AuditQueryRegistryRecord).filter(
                AuditQueryRegistryRecord.is_active == True  # noqa: E712
            )
            if domain:
                query = query.filter(AuditQueryRegistryRecord.domain == domain)
            if min_severity:
                sev_order = {"info": 0, "low": 1, "medium": 2, "high": 3, "critical": 4}
                min_level = sev_order.get(min_severity, 0)
                query = query.filter(
                    AuditQueryRegistryRecord.severity.in_(
                        s for s, lvl in sev_order.items() if lvl >= min_level
                    )
                )

            results = query.order_by(AuditQueryRegistryRecord.query_id).all()
            return [self._to_dict(r) for r in results]

    def get_query(self, query_id: str) -> Optional[dict[str, Any]]:
        """Get the active version of a specific query."""
        with self._session_factory() as session:
            q = session.query(AuditQueryRegistryRecord).filter(
                AuditQueryRegistryRecord.query_id == query_id,
                AuditQueryRegistryRecord.is_active == True,  # noqa: E712
            ).first()
            return self._to_dict(q) if q else None

    def get_query_versions(self, query_id: str) -> list[dict[str, Any]]:
        """Get all versions of a specific query."""
        with self._session_factory() as session:
            versions = session.query(AuditQueryRegistryRecord).filter(
                AuditQueryRegistryRecord.query_id == query_id
            ).order_by(AuditQueryRegistryRecord.version.desc()).all()
            return [self._to_dict(v) for v in versions]

    def create_query(self, data: dict[str, Any], created_by: str = "api") -> dict[str, Any]:
        """Create a new query in the registry.

        Auto-increments version if query_id already exists.
        """
        with self._session_factory() as session:
            max_ver = session.query(AuditQueryRegistryRecord).filter(
                AuditQueryRegistryRecord.query_id == data["query_id"]
            ).count()
            next_version = max_ver + 1

            content_hash = self._compute_hash(
                data.get("sql_template", ""),
                data.get("parameters", {}),
                data.get("severity", "high"),
            )

            entry = AuditQueryRegistryRecord(
                query_id=data["query_id"],
                version=next_version,
                name=data.get("name", ""),
                domain=data.get("domain", "edi_format"),
                description=data.get("description", ""),
                sql_template=data.get("sql_template", ""),
                severity=data.get("severity", "high"),
                risk_category=data.get("risk_category", "edi_non_compliance"),
                affected_tables=data.get("affected_tables", []),
                parameters=data.get("parameters", {}),
                remediation_hint=data.get("remediation_hint", ""),
                is_active=data.get("is_active", True),
                is_builtin=False,
                content_hash=content_hash,
                created_by=created_by,
            )
            session.add(entry)
            session.flush()

            logger.info(
                "Created query %s v%d by %s",
                data["query_id"], next_version, created_by,
            )
            return self._to_dict(entry)

    def update_query(self, query_id: str, data: dict[str, Any], updated_by: str = "api") -> Optional[dict[str, Any]]:
        """Update a query by creating a new version.

        The old active version is deactivated. A new version is created
        with the updated fields.
        """
        with self._session_factory() as session:
            current = session.query(AuditQueryRegistryRecord).filter(
                AuditQueryRegistryRecord.query_id == query_id,
                AuditQueryRegistryRecord.is_active == True,  # noqa: E712
            ).first()

            if not current:
                return None

            current.is_active = False

            merged = self._to_dict(current)
            merged.update(data)
            merged["query_id"] = query_id
            merged["version"] = current.version + 1
            merged["is_active"] = True
            merged["is_builtin"] = False

            content_hash = self._compute_hash(
                merged.get("sql_template", ""),
                merged.get("parameters", {}),
                merged.get("severity", "high"),
            )

            new_entry = AuditQueryRegistryRecord(
                query_id=query_id,
                version=current.version + 1,
                name=merged.get("name", current.name),
                domain=merged.get("domain", current.domain),
                description=merged.get("description", current.description),
                sql_template=merged.get("sql_template", current.sql_template),
                severity=merged.get("severity", current.severity),
                risk_category=merged.get("risk_category", current.risk_category),
                affected_tables=merged.get("affected_tables", current.affected_tables),
                parameters=merged.get("parameters", current.parameters),
                remediation_hint=merged.get("remediation_hint", current.remediation_hint),
                is_active=True,
                is_builtin=False,
                content_hash=content_hash,
                created_by=updated_by,
            )
            session.add(new_entry)
            session.flush()

            logger.info(
                "Updated query %s to v%d by %s",
                query_id, current.version + 1, updated_by,
            )
            return self._to_dict(new_entry)

    def retire_query(self, query_id: str) -> bool:
        """Deactivate a query (soft delete)."""
        with self._session_factory() as session:
            current = session.query(AuditQueryRegistryRecord).filter(
                AuditQueryRegistryRecord.query_id == query_id,
                AuditQueryRegistryRecord.is_active == True,  # noqa: E712
            ).first()

            if not current:
                return False

            current.is_active = False
            logger.info("Retired query %s (was v%d)", query_id, current.version)
            return True

    def get_statistics(self) -> dict[str, Any]:
        """Get registry statistics."""
        with self._session_factory() as session:
            total = session.query(AuditQueryRegistryRecord).count()
            active = session.query(AuditQueryRegistryRecord).filter(
                AuditQueryRegistryRecord.is_active == True  # noqa: E712
            ).count()
            builtin = session.query(AuditQueryRegistryRecord).filter(
                AuditQueryRegistryRecord.is_builtin == True  # noqa: E712
            ).count()
            custom = total - builtin

            domain_counts = {}
            for row in session.query(
                AuditQueryRegistryRecord.domain,
                AuditQueryRegistryRecord.is_active,
                func.count(AuditQueryRegistryRecord.id),
            ).group_by(
                AuditQueryRegistryRecord.domain,
                AuditQueryRegistryRecord.is_active,
            ).all():
                key = f"{row[0]}:{'active' if row[1] else 'inactive'}"
                domain_counts[key] = row[2]

            return {
                "total_queries": total,
                "active_queries": active,
                "builtin_queries": builtin,
                "custom_queries": custom,
                "by_domain": domain_counts,
            }

    @staticmethod
    def _compute_hash(sql_template: str, parameters: dict, severity: str) -> str:
        """Compute a content hash for change detection."""
        content = f"{sql_template}|{sorted(parameters.items())}|{severity}"
        return hashlib.sha256(content.encode("utf-8")).hexdigest()

    @staticmethod
    def _to_dict(entry: AuditQueryRegistryRecord) -> dict[str, Any]:
        """Convert an ORM entry to a dict."""
        return {
            "id": entry.id,
            "query_id": entry.query_id,
            "version": entry.version,
            "name": entry.name,
            "domain": entry.domain,
            "description": entry.description,
            "sql_template": entry.sql_template,
            "severity": entry.severity,
            "risk_category": entry.risk_category,
            "affected_tables": entry.affected_tables or [],
            "parameters": entry.parameters or {},
            "remediation_hint": entry.remediation_hint,
            "is_active": entry.is_active,
            "is_builtin": entry.is_builtin,
            "content_hash": entry.content_hash,
            "created_by": entry.created_by,
            "created_at": entry.created_at.isoformat() if entry.created_at else None,
            "updated_at": entry.updated_at.isoformat() if entry.updated_at else None,
        }
