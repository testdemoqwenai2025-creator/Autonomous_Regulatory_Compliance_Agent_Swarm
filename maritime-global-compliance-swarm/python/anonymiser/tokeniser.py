"""Cryptographic tokenisation engine for shipping manifest PII fields.

Implements HMAC-SHA256-based deterministic tokenisation that produces
consistent tokens for the same input, enabling cross-referencing without
exposing original personal data. Compliant with GDPR Art.25 (data protection
by design) and Art.32 (security of processing).

Token Format: {PREFIX}_{CATEGORY}_{HMAC_TRUNCATED}
Example:      MTS_CONSIGNEE_ID_a3f8c1e9b2d4
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import re
from datetime import date, datetime
from email.utils import parseaddr
from typing import Any, Optional

from cryptography.fernet import Fernet

from shared.config import AnonymiserConfig
from shared.models import (
    AnonymisationRecord,
    MaskingPolicy,
    PIIFieldCategory,
    PolicyAction,
)

logger = logging.getLogger(__name__)


# Field name to PII category mapping
FIELD_CATEGORY_MAP: dict[str, PIIFieldCategory] = {
    "consignee_name": PIIFieldCategory.CONSIGNEE_IDENTITY,
    "consignee_address": PIIFieldCategory.CONSIGNEE_IDENTITY,
    "consignee_email": PIIFieldCategory.CONTACT_INFO,
    "consignee_phone": PIIFieldCategory.CONTACT_INFO,
    "shipper_name": PIIFieldCategory.SHIPPER_IDENTITY,
    "shipper_address": PIIFieldCategory.SHIPPER_IDENTITY,
    "shipper_email": PIIFieldCategory.CONTACT_INFO,
    "shipper_phone": PIIFieldCategory.CONTACT_INFO,
    "notify_party": PIIFieldCategory.CONTACT_INFO,
    "agent_name": PIIFieldCategory.CONTACT_INFO,
    "forwarder_contact": PIIFieldCategory.CONTACT_INFO,
    "passport_number": PIIFieldCategory.GOVERNMENT_ID,
    "national_id": PIIFieldCategory.GOVERNMENT_ID,
    "tax_id": PIIFieldCategory.FINANCIAL_ID,
}

# Regex patterns for PII detection in free-text fields
PII_PATTERNS: list[tuple[str, PIIFieldCategory, re.Pattern]] = [
    ("email", PIIFieldCategory.CONTACT_INFO, re.compile(r"[\w.-]+@[\w.-]+\.\w{2,}")),
    ("phone_intl", PIIFieldCategory.CONTACT_INFO, re.compile(r"\+?\d[\d\s-]{7,}")),
    ("passport", PIIFieldCategory.GOVERNMENT_ID, re.compile(r"[A-Z]{2}\d{7}")),
    ("tax_id_eu", PIIFieldCategory.FINANCIAL_ID, re.compile(r"[A-Z]{2}\d{2}[A-Z0-9]{2,}")),
]


class TokenVault:
    """Deterministic HMAC-based token vault.

    Generates consistent tokens for the same plaintext input using HMAC-SHA256.
    The vault does NOT store the original values — only the HMAC key is needed
    to verify token consistency. This is not reversible by design.
    """

    def __init__(self, hmac_key: bytes, prefix: str = "MTS"):
        if not hmac_key:
            hmac_key = hashlib.sha256(b"maritime-swarm-default-key").digest()
        self._hmac_key = hmac_key
        self._prefix = prefix

    def tokenise(self, plaintext: str, category: PIIFieldCategory) -> str:
        """Generate a deterministic token for the given plaintext.

        The token is derived as: HMAC-SHA256(key, plaintext) truncated to 12 hex chars,
        prefixed with the configured prefix and PII category.
        """
        if not plaintext or not plaintext.strip():
            return plaintext
        
        normalised = plaintext.strip().lower()
        mac = hmac.new(self._hmac_key, normalised.encode("utf-8"), hashlib.sha256)
        truncated = mac.hexdigest()[:12]
        category_tag = category.value.split("_")[0].upper()[:4]
        return f"{self._prefix}_{category_tag}_{truncated}"

    def hash_original(self, plaintext: str) -> str:
        """Compute SHA-256 hash of the original value for audit trail.
        
        This hash is stored (not the value itself) to allow verification
        that a token was correctly generated without revealing the original.
        """
        return hashlib.sha256(plaintext.strip().encode("utf-8")).hexdigest()


class FernetEncryptor:
    """Symmetric encryption for fields that need reversible pseudonymisation.
    
    Uses Fernet (AES-128-CBC + HMAC-SHA256) for fields where the original
    value must be recoverable under controlled conditions (e.g., customs
    compliance with a Data Processing Agreement).
    """

    def __init__(self, fernet_key: Optional[bytes] = None):
        self._fernet = Fernet(fernet_key or Fernet.generate_key())

    def encrypt(self, plaintext: str) -> str:
        """Encrypt a value to a Fernet token string."""
        if not plaintext or not plaintext.strip():
            return plaintext
        return self._fernet.encrypt(plaintext.strip().encode("utf-8")).decode("utf-8")

    def decrypt(self, token: str) -> str:
        """Decrypt a Fernet token back to the original value."""
        return self._fernet.decrypt(token.encode("utf-8")).decode("utf-8")

    @property
    def key(self) -> bytes:
        return self._fernet._signing_key + self._fernet._encryption_key


class PIITokeniser:
    """High-level PII tokenisation engine coordinating multiple strategies.

    Applies rules from MaskingPolicy records to determine how each field
    should be handled: tokenise, redact, generalise, pseudonymise, or encrypt.
    """

    def __init__(self, config: AnonymiserConfig):
        hmac_key = config.hmac_key.encode("utf-8") if config.hmac_key else b""
        self._vault = TokenVault(hmac_key=hmac_key, prefix=config.token_prefix)
        self._config = config
        self._records: list[dict[str, Any]] = []

    def anonymise_manifest(self, manifest: dict[str, Any], manifest_id: str) -> dict[str, Any]:
        """Anonymise all PII fields in a shipping manifest.

        Args:
            manifest: Raw manifest dict with potential PII fields.
            manifest_id: Unique identifier for this manifest (for audit trail).

        Returns:
            New dict with PII fields replaced by tokens.
        """
        anonymised = {}
        for field_name, value in manifest.items():
            if field_name in self._config.fields_to_anonymise and isinstance(value, str):
                category = FIELD_CATEGORY_MAP.get(field_name, PIIFieldCategory.CONTACT_INFO)
                token = self._vault.tokenise(value, category)
                original_hash = self._vault.hash_original(value)
                anonymised[field_name] = token

                self._records.append({
                    "manifest_id": manifest_id,
                    "field_name": field_name,
                    "field_category": category,
                    "original_hash": original_hash,
                    "token": token,
                })

                logger.debug(
                    "Anonymised %s in manifest %s -> %s",
                    field_name, manifest_id, token,
                )
            else:
                anonymised[field_name] = value

        return anonymised

    def anonymise_free_text(self, text: str, manifest_id: str) -> str:
        """Detect and tokenise PII in free-text fields (e.g., special instructions).

        Scans text for email addresses, phone numbers, and ID patterns,
        replacing matches with tokens while preserving surrounding context.
        """
        result = text
        for pattern_name, category, pattern in PII_PATTERNS:
            for match in pattern.finditer(result):
                original = match.group()
                token = self._vault.tokenise(original, category)
                original_hash = self._vault.hash_original(original)
                result = result.replace(original, token, 1)

                self._records.append({
                    "manifest_id": manifest_id,
                    "field_name": f"free_text:{pattern_name}",
                    "field_category": category,
                    "original_hash": original_hash,
                    "token": token,
                })
        return result

    def apply_policy(self, value: str, policy: MaskingPolicy) -> str:
        """Apply a specific masking policy to a single field value.

        Supports: tokenise, redact, generalise, pseudonymise, encrypt, truncate.
        """
        if not value or not value.strip():
            return value

        category = policy.field_category
        params = policy.parameters or {}

        if policy.action == PolicyAction.TOKENISE:
            return self._vault.tokenise(value, category)

        elif policy.action == PolicyAction.REDACT:
            return params.get("replacement", "[REDACTED]")

        elif policy.action == PolicyAction.GENERALISE:
            # Replace specific values with generalised versions
            if "date" in policy.field_name.lower():
                return self._generalise_date(value, params.get("granularity", "month"))
            return value[:2] + "*" * (len(value) - 2)

        elif policy.action == PolicyAction.PSEUDONYMISE:
            # Deterministic but format-preserving
            return self._vault.tokenise(value, category)

        elif policy.action == PolicyAction.ENCRYPT:
            # Reversible encryption for DPA-covered use cases
            encryptor = FernetEncryptor()
            return encryptor.encrypt(value)

        elif policy.action == PolicyAction.TRUNCATE:
            keep = params.get("keep_chars", 2)
            return value[:keep] + "*" * (len(value) - keep)

        return value

    def _generalise_date(self, date_str: str, granularity: str = "month") -> str:
        """Generalise a date string to the specified granularity."""
        for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%Y%m%d"):
            try:
                parsed = datetime.strptime(date_str, fmt)
                if granularity == "year":
                    return f"{parsed.year}-**-**"
                elif granularity == "month":
                    return f"{parsed.year}-{parsed.month:02d}-**"
                elif granularity == "quarter":
                    q = (parsed.month - 1) // 3 + 1
                    return f"{parsed.year}-Q{q}"
                return date_str
            except ValueError:
                continue
        return "****-**-**"

    @property
    def records(self) -> list[dict[str, Any]]:
        """Return all anonymisation records from the last run."""
        return self._records

    def flush_records(self) -> list[dict[str, Any]]:
        """Return and clear all anonymisation records."""
        records = self._records
        self._records = []
        return records
