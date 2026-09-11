"""
Entity resolution layer.

Raw extraction gives you mentions ("Rajesh Patel" in doc 1, "R. Patel" in
doc 3). This module merges mentions that refer to the same real-world
entity into one canonical node, using:
  - exact normalized match for PHONE / VEHICLE (deterministic — a phone
    number is either the same number or it isn't)
  - fuzzy name similarity for PERSON / ORG / LOCATION (rapidfuzz)

The output is what feeds the graph builder.
"""

import re
import uuid
from dataclasses import dataclass, field

from rapidfuzz import fuzz

from .extraction import ExtractedEntity

FUZZY_MATCH_THRESHOLD = 88  # 0-100, higher = stricter


@dataclass
class CanonicalEntity:
    id: str
    label: str
    display_name: str
    mention_ids: list[str] = field(default_factory=list)
    doc_ids: set[str] = field(default_factory=set)

    def to_dict(self):
        return {
            "id": self.id,
            "label": self.label,
            "display_name": self.display_name,
            "mention_count": len(self.mention_ids),
            "doc_ids": sorted(self.doc_ids),
        }


def _normalize_phone(text: str) -> str:
    digits = re.sub(r"\D", "", text)
    return digits[-10:] if len(digits) >= 10 else digits


def _normalize_vehicle(text: str) -> str:
    return re.sub(r"[\s-]", "", text).upper()


def resolve_entities(entities: list[ExtractedEntity]) -> tuple[list[CanonicalEntity], dict[str, str]]:
    """
    Returns (canonical_entities, mention_id_to_canonical_id).
    """
    canonicals: list[CanonicalEntity] = []
    mention_to_canonical: dict[str, str] = {}

    # Deterministic keys for PHONE/VEHICLE so exact matches always merge.
    exact_key_index: dict[str, CanonicalEntity] = {}

    for ent in entities:
        matched: CanonicalEntity | None = None

        if ent.label == "PHONE":
            key = ("PHONE", _normalize_phone(ent.text))
            matched = exact_key_index.get(key)
        elif ent.label == "VEHICLE":
            key = ("VEHICLE", _normalize_vehicle(ent.text))
            matched = exact_key_index.get(key)
        else:
            # Fuzzy match against existing canonicals of the same label.
            best_score = 0
            for cand in canonicals:
                if cand.label != ent.label:
                    continue
                score = fuzz.token_sort_ratio(ent.text.lower(), cand.display_name.lower())
                if score > best_score:
                    best_score = score
                    matched = cand
            if best_score < FUZZY_MATCH_THRESHOLD:
                matched = None

        if matched is None:
            matched = CanonicalEntity(
                id=str(uuid.uuid4()),
                label=ent.label,
                display_name=ent.text,
            )
            canonicals.append(matched)
            if ent.label == "PHONE":
                exact_key_index[("PHONE", _normalize_phone(ent.text))] = matched
            elif ent.label == "VEHICLE":
                exact_key_index[("VEHICLE", _normalize_vehicle(ent.text))] = matched

        matched.mention_ids.append(ent.id)
        matched.doc_ids.add(ent.doc_id)
        mention_to_canonical[ent.id] = matched.id

    return canonicals, mention_to_canonical
