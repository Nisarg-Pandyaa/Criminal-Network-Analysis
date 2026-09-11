"""
Entity extraction layer.

Combines spaCy NER (people, locations, organizations) with regex extractors
for fixed-format fields (phone numbers, vehicle registration numbers) that
NER models are typically unreliable on.

NOTE: this loads the generic `en_core_web_sm` model. Once you've fine-tuned
a crime-domain model (roadmap step 3), swap the model path in load_model()
below to point at your trained model directory instead.
"""

import re
import uuid
from dataclasses import dataclass, field

import spacy

_NLP = None


def load_model(model_path: str = "en_core_web_sm"):
    """Loads (and caches) the spaCy model used for extraction."""
    global _NLP
    if _NLP is None:
        _NLP = spacy.load(model_path)
    return _NLP


# --- Regex extractors -------------------------------------------------
# Indian mobile numbers: optional +91 / 0 prefix, then a 10-digit number
# starting with 6-9, optionally split with a hyphen or space.
PHONE_RE = re.compile(r"(?:\+91[-\s]?|0)?[6-9]\d{9}\b")

# Indian vehicle registration plates: e.g. GJ01AB1234 or GJ 01 AB 1234
VEHICLE_RE = re.compile(r"\b[A-Z]{2}\s?-?\s?\d{2}\s?-?\s?[A-Z]{1,2}\s?-?\s?\d{4}\b")


@dataclass
class ExtractedEntity:
    id: str
    doc_id: str
    text: str
    label: str  # PERSON | LOCATION | ORG | PHONE | VEHICLE
    start: int
    end: int
    sent_id: str = ""  # f"{doc_id}:{sentence_index}" — used for co-occurrence edges

    def to_dict(self):
        return {
            "id": self.id,
            "doc_id": self.doc_id,
            "text": self.text,
            "label": self.label,
            "start": self.start,
            "end": self.end,
            "sent_id": self.sent_id,
        }


_SPACY_LABEL_MAP = {
    "PERSON": "PERSON",
    "GPE": "LOCATION",
    "LOC": "LOCATION",
    "ORG": "ORG",
    "FAC": "LOCATION",
}


def extract_entities(doc_id: str, text: str) -> list[ExtractedEntity]:
    """Runs NER + regex extraction on a single document's text."""
    nlp = load_model()
    spacy_doc = nlp(text)

    # Map each character offset to a sentence index, so regex matches
    # (which don't go through spaCy's sentence objects) can be tagged too.
    sent_bounds = [(s.start_char, s.end_char) for s in spacy_doc.sents]

    def sent_index_for(char_pos: int) -> int:
        for i, (start, end) in enumerate(sent_bounds):
            if start <= char_pos < end:
                return i
        return max(len(sent_bounds) - 1, 0)

    entities: list[ExtractedEntity] = []

    for ent in spacy_doc.ents:
        label = _SPACY_LABEL_MAP.get(ent.label_)
        if label is None:
            continue
        sent_idx = sent_index_for(ent.start_char)
        entities.append(
            ExtractedEntity(
                id=str(uuid.uuid4()),
                doc_id=doc_id,
                text=ent.text.strip(),
                label=label,
                start=ent.start_char,
                end=ent.end_char,
                sent_id=f"{doc_id}:{sent_idx}",
            )
        )

    for match in PHONE_RE.finditer(text):
        sent_idx = sent_index_for(match.start())
        entities.append(
            ExtractedEntity(
                id=str(uuid.uuid4()),
                doc_id=doc_id,
                text=match.group().strip(),
                label="PHONE",
                start=match.start(),
                end=match.end(),
                sent_id=f"{doc_id}:{sent_idx}",
            )
        )

    for match in VEHICLE_RE.finditer(text):
        sent_idx = sent_index_for(match.start())
        entities.append(
            ExtractedEntity(
                id=str(uuid.uuid4()),
                doc_id=doc_id,
                text=match.group().strip(),
                label="VEHICLE",
                start=match.start(),
                end=match.end(),
                sent_id=f"{doc_id}:{sent_idx}",
            )
        )

    return entities


def extract_from_documents(documents: dict[str, str]) -> list[ExtractedEntity]:
    """documents: {doc_id: text}. Returns entities across all documents."""
    all_entities: list[ExtractedEntity] = []
    for doc_id, text in documents.items():
        all_entities.extend(extract_entities(doc_id, text))
    return all_entities
