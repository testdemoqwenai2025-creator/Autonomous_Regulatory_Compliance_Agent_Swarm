"""ML-based Named Entity Recognition layer for maritime PII detection.

Extends the regex-based RuleEngine with spaCy NER to catch PII that
field-name heuristics miss — names, organisations, and locations
buried in free-text fields such as special instructions, remarks,
and hazmat descriptions.

The NER layer runs alongside (not replacing) the regex engine.
Results from both layers are merged, giving the union of detections.

Usage:
    from anonymiser.ner_detector import MaritimeNERDetector

    ner = MaritimeNERDetector()
    entities = ner.detect("Contact John Smith at Maersk for delivery to Rotterdam port")
    # -> [NEREntity(text='John Smith', label='PERSON', start=8, end=18), ...]
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional

logger = logging.getLogger(__name__)


# Maritime-specific entity labels beyond standard spaCy
MARITIME_ENTITY_LABELS = {
    "PERSON": "person",
    "ORG": "organisation",
    "GPE": "location",
    # Extended labels we map from patterns
    "VESSEL": "vessel_name",
    "PORT": "port_name",
    "CONTAINER_ID": "container_id",
}


@dataclass
class NEREntity:
    """A single named entity detected by the NER layer."""
    text: str
    label: str              # PERSON, ORG, GPE, VESSEL, PORT, CONTAINER_ID
    category: str           # PII category: person_identity, organisation, location
    start: int
    end: int
    confidence: float = 1.0
    source: str = "regex"   # regex | spacy | pattern


# ── Maritime pattern matchers (regex-based, no spaCy dependency) ───────

MARITIME_PATTERNS: list[tuple[str, str, str, re.Pattern]] = [
    # (label, category, description, compiled_pattern)
    (
        "VESSEL",
        "location",
        "Vessel name (e.g., MSC ZEVA, EVER GIVEN)",
        re.compile(r"\b(?:MSC|MAERSK|CMA CGM|COSCO|EVER|HAPAG|ONE|YANG MING|PIL|ZIM|HMM|KMTC|X-PRESS|WOOKWIHE)\s+[A-Z]{2,}(?:\s+[A-Z]{2,})*\b", re.IGNORECASE),
    ),
    (
        "PORT",
        "location",
        "Port name (e.g., Port of Rotterdam, Singapore)",
        re.compile(r"\b(?:Port of|port of)\s+[A-Z][a-zA-Z\s]+\b|\b(?:Rotterdam|Singapore|Shanghai|Ningbo|Busan|Hamburg|Los Angeles|Long Beach|Antwerp|Felixstowe|Jebel Ali|Tanjung Pelepas|Colombo|Mumbai|Nhava Sheva|Santos|Callao)\b", re.IGNORECASE),
    ),
    (
        "CONTAINER_ID",
        "location",
        "ISO 6346 container ID (e.g., MSKU1234567)",
        re.compile(r"\b[A-Z]{4}\d{7}\b"),
    ),
    (
        "BILL_OF_LADING",
        "financial_id",
        "Bill of Lading number",
        re.compile(r"\b[A-Z]{2,3}[/-]?\d{6,10}\b"),
    ),
    (
        "BOOKING_REF",
        "financial_id",
        "Booking reference number",
        re.compile(r"\b\d{6,9}[A-Z]?\b"),
    ),
]


# Person-name patterns for CJK, Arabic, Cyrillic, Latin
PERSON_NAME_PATTERNS: list[tuple[str, re.Pattern]] = [
    ("latin_person", re.compile(r"\b[A-Z][a-z]+\s+[A-Z][a-z]+\b")),
    ("chinese_person", re.compile(r"[\u4e00-\u9fff]{2,4}")),
    ("arabic_person", re.compile(r"[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]{3,25}")),
    ("cyrillic_person", re.compile(r"[\u0400-\u04FF]{2,25}")),
    ("devanagari_person", re.compile(r"[\u0900-\u097F]{2,30}")),
]

# Organisation patterns
ORG_PATTERNS: list[tuple[str, re.Pattern]] = [
    ("inc_corp", re.compile(r"\b[A-Z][a-zA-Z\s&]+(?:Inc\.?|Corp\.?|Ltd\.?|LLC|GmbH|AG|SA|Pte|Bhd|Co\.?\s*Ltd)\.?\b", re.IGNORECASE)),
    ("shipping_line", re.compile(r"\b(?:MSC|MAERSK|CMA\s*CGM|COSCO|EVERGREEN|HAPAG-LLOYD|ONE|YANG\s*MING|PIL|ZIM|HMM|KMTC)\b", re.IGNORECASE)),
]


class MaritimeNERDetector:
    """Multi-layer NER detector for maritime PII.

    Layer 1: Maritime-specific regex patterns (vessel names, ports, container IDs)
    Layer 2: Person-name regex (Latin, CJK, Arabic, Cyrillic, Devanagari)
    Layer 3: Organisation regex (Inc/Corp/Ltd patterns, shipping line names)
    Layer 4: spaCy NER (if available) — PERSON, ORG, GPE entities

    All layers run on every call. Results are deduplicated by (text, start_char).
    """

    def __init__(self, spacy_model: Optional[str] = None):
        """Initialise the NER detector.

        Args:
            spacy_model: Name of spaCy model to load (e.g. 'en_core_web_sm').
                         If None, attempts to load 'en_core_web_sm' and falls
                         back to regex-only mode if unavailable.
        """
        self._spacy_nlp = None
        self._spacy_available = False
        self._init_spacy(spacy_model)

    def _init_spacy(self, model_name: Optional[str] = None):
        """Try to load spaCy model; graceful fallback to regex-only."""
        try:
            import spacy
            model = model_name or "en_core_web_sm"
            self._spacy_nlp = spacy.load(model)
            self._spacy_available = True
            logger.info("spaCy NER loaded: model=%s", model)
        except ImportError:
            logger.info("spaCy not installed — running in regex-only NER mode")
        except OSError:
            logger.warning("spaCy model '%s' not found — running in regex-only NER mode", model_name)

    @property
    def spacy_available(self) -> bool:
        return self._spacy_available

    @property
    def layers_available(self) -> list[str]:
        layers = ["maritime_patterns", "person_names", "organisations"]
        if self._spacy_available:
            layers.append("spacy_ner")
        return layers

    def detect(self, text: str) -> list[NEREntity]:
        """Detect all named entities in text.

        Runs all available layers and returns deduplicated results.

        Args:
            text: Input text to analyse.

        Returns:
            List of NEREntity objects, ordered by start position.
        """
        if not text or not text.strip():
            return []

        entities: list[NEREntity] = []
        seen: set[tuple[str, int]] = set()

        def _add(entity: NEREntity):
            key = (entity.text, entity.start)
            if key not in seen:
                seen.add(key)
                entities.append(entity)

        # Layer 1: Maritime-specific patterns
        for label, category, desc, pattern in MARITIME_PATTERNS:
            for match in pattern.finditer(text):
                _add(NEREntity(
                    text=match.group(),
                    label=label,
                    category=category,
                    start=match.start(),
                    end=match.end(),
                    source="regex",
                ))

        # Layer 2: Person-name patterns (multi-script)
        for name, pattern in PERSON_NAME_PATTERNS:
            for match in pattern.finditer(text):
                matched_text = match.group()
                # Filter out obvious non-person matches
                if len(matched_text.strip()) < 2:
                    continue
                _add(NEREntity(
                    text=matched_text,
                    label="PERSON",
                    category="person_identity",
                    start=match.start(),
                    end=match.end(),
                    source="regex",
                ))

        # Layer 3: Organisation patterns
        for name, pattern in ORG_PATTERNS:
            for match in pattern.finditer(text):
                _add(NEREntity(
                    text=match.group(),
                    label="ORG",
                    category="organisation",
                    start=match.start(),
                    end=match.end(),
                    source="regex",
                ))

        # Layer 4: spaCy NER (if available)
        if self._spacy_available and self._spacy_nlp:
            doc = self._spacy_nlp(text)
            for ent in doc.ents:
                if ent.label_ in ("PERSON", "ORG", "GPE"):
                    category_map = {
                        "PERSON": "person_identity",
                        "ORG": "organisation",
                        "GPE": "location",
                    }
                    _add(NEREntity(
                        text=ent.text,
                        label=ent.label_,
                        category=category_map.get(ent.label_, "unknown"),
                        start=ent.start_char,
                        end=ent.end_char,
                        confidence=ent._.confidence if hasattr(ent._, "confidence") else 0.85,
                        source="spacy",
                    ))

        # Sort by position
        entities.sort(key=lambda e: e.start)
        return entities

    def detect_pii_entities(self, text: str) -> list[NEREntity]:
        """Detect only PII-relevant entities (excludes vessels, containers, ports).

        Returns PERSON and ORG entities that represent personally
        identifiable information. Vessel names, container IDs, and
        port names are excluded as they are operational, not personal.
        """
        all_entities = self.detect(text)
        pii_labels = {"PERSON", "ORG"}
        return [e for e in all_entities if e.label in pii_labels]

    def detect_maritime_entities(self, text: str) -> list[NEREntity]:
        """Detect only maritime operational entities.

        Returns VESSEL, PORT, and CONTAINER_ID entities.
        Useful for operational compliance (e.g., verifying
        container IDs in BAPLIE messages).
        """
        all_entities = self.detect(text)
        maritime_labels = {"VESSEL", "PORT", "CONTAINER_ID", "BILL_OF_LADING", "BOOKING_REF"}
        return [e for e in all_entities if e.label in maritime_labels]

    def anonymise_text_with_ner(
        self,
        text: str,
        tokeniser: object = None,
        manifest_id: str = "",
    ) -> tuple[str, list[dict]]:
        """Detect PII entities and replace them with tokens.

        Uses the NER detector to find PERSON and ORG entities,
        then replaces them with tokens using the provided tokeniser.

        Args:
            text: Input text.
            tokeniser: PIITokeniser instance for generating tokens.
            manifest_id: Manifest ID for audit records.

        Returns:
            Tuple of (anonymised_text, list_of_records).
        """
        pii_entities = self.detect_pii_entities(text)
        if not pii_entities:
            return text, []

        # Sort in reverse order to preserve character positions
        sorted_entities = sorted(pii_entities, key=lambda e: e.start, reverse=True)

        result = text
        records = []
        for entity in sorted_entities:
            if tokeniser is not None:
                from shared.models import PIIFieldCategory
                cat_map = {
                    "PERSON": PIIFieldCategory.CONSIGNEE_IDENTITY,
                    "ORG": PIIFieldCategory.CONTACT_INFO,
                }
                category = cat_map.get(entity.label, PIIFieldCategory.CONTACT_INFO)
                token = tokeniser._vault.tokenise(entity.text, category)
            else:
                token = f"[NER_{entity.label}_{entity.start}]"

            result = result[:entity.start] + token + result[entity.end:]
            records.append({
                "manifest_id": manifest_id,
                "field_name": f"ner:{entity.label.lower()}:{entity.source}",
                "text": entity.text,
                "token": token,
                "label": entity.label,
                "category": entity.category,
                "source": entity.source,
                "confidence": entity.confidence,
            })

        return result, records
