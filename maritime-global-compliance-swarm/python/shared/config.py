"""Centralised configuration for the Maritime Compliance Swarm.

Loads settings from environment variables with sensible defaults.
Supports both development (SQLite) and production (PostgreSQL) modes.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional


@dataclass(frozen=True)
class DatabaseConfig:
    """Database connection parameters."""
    driver: str = field(default_factory=lambda: os.getenv("DB_DRIVER", "sqlite"))
    host: str = field(default_factory=lambda: os.getenv("DB_HOST", "localhost"))
    port: int = field(default_factory=lambda: int(os.getenv("DB_PORT", "5432")))
    name: str = field(default_factory=lambda: os.getenv("DB_NAME", "maritime_compliance"))
    user: str = field(default_factory=lambda: os.getenv("DB_USER", "postgres"))
    password: str = field(default_factory=lambda: os.getenv("DB_PASSWORD", ""))
    ssl_mode: str = field(default_factory=lambda: os.getenv("DB_SSL_MODE", "prefer"))

    @property
    def connection_string(self) -> str:
        if self.driver == "sqlite":
            db_path = os.getenv("SQLITE_PATH", "data/compliance.db")
            Path(db_path).parent.mkdir(parents=True, exist_ok=True)
            return f"sqlite:///{db_path}"
        return (
            f"postgresql+psycopg2://{self.user}:{self.password}"
            f"@{self.host}:{self.port}/{self.name}"
            f"?sslmode={self.ssl_mode}"
        )


@dataclass(frozen=True)
class AnonymiserConfig:
    """PII Anonymiser settings."""
    token_prefix: str = field(default_factory=lambda: os.getenv("TOKEN_PREFIX", "MTS"))
    hashing_algorithm: str = field(default_factory=lambda: os.getenv("HASH_ALGO", "SHA256"))
    hmac_key: str = field(default_factory=lambda: os.getenv("HMAC_KEY", ""))
    date_format_mask: str = field(default_factory=lambda: os.getenv("DATE_MASK", "****-**-**"))
    preserve_domain: bool = field(default_factory=lambda: os.getenv("PRESERVE_DOMAIN", "true").lower() == "true")
    fields_to_anonymise: list[str] = field(default_factory=lambda: [
        "consignee_name", "consignee_address", "consignee_email", "consignee_phone",
        "shipper_name", "shipper_address", "shipper_email", "shipper_phone",
        "notify_party", "agent_name", "forwarder_contact",
        "passport_number", "national_id", "tax_id",
    ])


@dataclass(frozen=True)
class AuditorConfig:
    """EDI SQL Auditor settings."""
    fms_connection_string: str = field(default_factory=lambda: os.getenv(
        "FMS_CONNECTION_STRING", ""
    ))
    audit_batch_size: int = field(default_factory=lambda: int(os.getenv("AUDIT_BATCH_SIZE", "1000")))
    check_encryption: bool = field(default_factory=lambda: os.getenv(
        "CHECK_ENCRYPTION", "true"
    ).lower() == "true")
    check_customs_docs: bool = field(default_factory=lambda: os.getenv(
        "CHECK_CUSTOMS_DOCS", "true"
    ).lower() == "true")
    check_edi_compliance: bool = field(default_factory=lambda: os.getenv(
        "CHECK_EDI_COMPLIANCE", "true"
    ).lower() == "true")
    edi_standards: list[str] = field(default_factory=lambda: [
        "EDIFACT", "ANSI X12", "BAPLIE", "VGM",
    ])
    max_unencrypted_age_hours: int = field(default_factory=lambda: int(
        os.getenv("MAX_UNENCRYPTED_AGE_HOURS", "24")
    ))


@dataclass(frozen=True)
class RemediationConfig:
    """Remediation Route Generator settings."""
    auto_apply_policies: bool = field(default_factory=lambda: os.getenv(
        "AUTO_APPLY_POLICIES", "false"
    ).lower() == "true")
    policy_output_dir: str = field(default_factory=lambda: os.getenv(
        "POLICY_OUTPUT_DIR", "policies/"))
    edi_profile_update_mode: str = field(default_factory=lambda: os.getenv(
        "EDI_UPDATE_MODE", "dry-run")  # dry-run | apply | staged
    )
    notification_webhook: Optional[str] = field(default_factory=lambda: os.getenv(
        "NOTIFICATION_WEBHOOK", None
    ))


@dataclass(frozen=True)
class TelemetryConfig:
    """MTTR Telemetry Tracker settings."""
    grpc_port: int = field(default_factory=lambda: int(os.getenv("MTTR_GRPC_PORT", "50051")))
    http_port: int = field(default_factory=lambda: int(os.getenv("MTTR_HTTP_PORT", "8080")))
    flush_interval_seconds: int = field(default_factory=lambda: int(
        os.getenv("MTTR_FLUSH_INTERVAL", "10")
    ))
    retention_days: int = field(default_factory=lambda: int(os.getenv("MTTR_RETENTION_DAYS", "90")))


@dataclass
class SwarmConfig:
    """Top-level configuration aggregating all tool configs."""
    database: DatabaseConfig = field(default_factory=DatabaseConfig)
    anonymiser: AnonymiserConfig = field(default_factory=AnonymiserConfig)
    auditor: AuditorConfig = field(default_factory=AuditorConfig)
    remediation: RemediationConfig = field(default_factory=RemediationConfig)
    telemetry: TelemetryConfig = field(default_factory=TelemetryConfig)
    log_level: str = field(default_factory=lambda: os.getenv("LOG_LEVEL", "INFO"))
    log_file: Optional[str] = field(default_factory=lambda: os.getenv("LOG_FILE", None))

    @classmethod
    def from_env(cls) -> "SwarmConfig":
        """Load configuration from environment variables."""
        return cls()
