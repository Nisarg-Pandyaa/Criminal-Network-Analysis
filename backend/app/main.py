"""
FastAPI backend for the criminal network analysis MVP with Tamper-Evident Evidence Integrity.

Endpoints:
  GET  /health
  POST /extract                            raw documents -> extracted entities
  POST /graph                              extracted entities -> resolved graph (nodes+edges)
  POST /analytics                          graph -> centrality, communities, key connectors
  POST /pipeline                           raw documents -> full result in one call (extract+graph+analytics)
  POST /generate-case                      calls Gemini for a new case, then runs the full pipeline on it
  GET  /sample-case                        loads the bundled hand-written sample case and runs the pipeline
  
  Evidence Integrity & Tamper Detection:
  POST /api/evidence/register              registers FIR text document, computes immutable SHA-256 hash (v1)
  POST /api/evidence/verify                compares submitted text SHA-256 with original immutable hash
  GET  /api/evidence/{evidence_id}         fetches evidence record & status
  GET  /api/evidence/{evidence_id}/versions fetches all immutable version records
  GET  /api/evidence/{evidence_id}/diff/{v_a}/{v_b} fetches page-aware readable text diff
  POST /api/evidence/remap                 explicitly commits a modified version ("Map Anyway") & runs pipeline
  GET  /api/evidence                       lists all registered evidence items
"""

from pathlib import Path
from typing import Optional

import requests
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from . import analytics, data_generator
from .evidence import evidence_store
from .extraction import extract_from_documents
from .graph_builder import build_graph, graph_to_dict
from .priority import priority_manager
from .resolution import resolve_entities

app = FastAPI(title="Criminal Network Analysis API with Evidence Integrity")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten this before any real deployment
    allow_methods=["*"],
    allow_headers=["*"],
)

SAMPLE_DATA_DIR = Path(__file__).resolve().parent.parent / "sample_data"


class DocumentsIn(BaseModel):
    documents: dict[str, str]  # {doc_id: text}
    evidence_map: Optional[dict[str, str]] = None  # Optional mapping {doc_id: evidence_id}


class GenerateCaseIn(BaseModel):
    num_docs: int = 3
    num_entities: int = 4
    complexity: int = 1


class EvidenceRegisterIn(BaseModel):
    text: str
    filename: str = "FIR_document.txt"
    evidence_id: Optional[str] = None


class EvidenceVerifyIn(BaseModel):
    evidence_id: str
    text: str
    filename: Optional[str] = None


class EvidenceRemapIn(BaseModel):
    evidence_id: str
    text: str
    filename: Optional[str] = None
    all_documents: Optional[dict[str, str]] = None


def _run_pipeline(
    documents: dict[str, str],
    evidence_map: Optional[dict[str, str]] = None,
) -> dict:
    entities = extract_from_documents(documents)
    canonicals, mention_to_canonical = resolve_entities(entities)
    graph = build_graph(canonicals, entities, mention_to_canonical)
    graph_dict = graph_to_dict(graph)
    analytics_result = analytics.run_full_analytics(graph)

    # Register or auto-sync evidence tracking for the documents if not already registered
    registered_evidence = {}
    for doc_id, text in documents.items():
        evd_id = (evidence_map or {}).get(doc_id)
        if not evd_id:
            # Check if an evidence entry already exists with doc_id as evidence_id or filename
            existing = evidence_store.get(doc_id)
            if existing:
                evd_id = existing.evidence_id
            else:
                evd_id = doc_id
        
        # Register initial version if new
        if not evidence_store.get(evd_id):
            version = evidence_store.register(
                text=text,
                filename=f"{doc_id}.txt" if not doc_id.endswith(".txt") else doc_id,
                evidence_id=evd_id,
            )
            registered_evidence[doc_id] = {
                "evidence_id": evd_id,
                "version": version.version_number,
                "sha256": version.sha256,
                "integrity_status": version.integrity_status,
                "created_at": version.created_at,
            }
        else:
            evd = evidence_store.get(evd_id)
            latest_ver = evd.versions[-1]
            registered_evidence[doc_id] = {
                "evidence_id": evd.evidence_id,
                "version": latest_ver.version_number,
                "sha256": latest_ver.sha256,
                "original_sha256": evd.original_sha256,
                "integrity_status": latest_ver.integrity_status,
                "created_at": latest_ver.created_at,
            }

    return {
        "documents": documents,
        "entities": [e.to_dict() for e in entities],
        "canonical_entities": [c.to_dict() for c in canonicals],
        "graph": graph_dict,
        "analytics": analytics_result,
        "evidence_integrity": registered_evidence,
    }


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/extract")
def extract(payload: DocumentsIn):
    entities = extract_from_documents(payload.documents)
    return {"entities": [e.to_dict() for e in entities]}


@app.post("/pipeline")
def pipeline(payload: DocumentsIn):
    return _run_pipeline(payload.documents, payload.evidence_map)


@app.get("/sample-case")
def sample_case():
    if not SAMPLE_DATA_DIR.exists():
        raise HTTPException(404, "sample_data directory not found")
    documents = {
        f.stem: f.read_text(encoding="utf-8")
        for f in sorted(SAMPLE_DATA_DIR.glob("*.txt"))
    }
    if not documents:
        raise HTTPException(404, "no sample documents found")
    return _run_pipeline(documents)


@app.post("/generate-case")
def generate_case(payload: GenerateCaseIn):
    try:
        documents = data_generator.generate_synthetic_case(
            num_docs=payload.num_docs,
            num_entities=payload.num_entities,
            complexity=payload.complexity,
        )
    except RuntimeError as e:
        raise HTTPException(400, str(e))
    except requests.HTTPError as e:
        detail = e.response.text if e.response is not None else str(e)
        raise HTTPException(502, f"Gemini API request failed: {detail}")
    return _run_pipeline(documents)


# ==========================================
# Evidence Integrity & Tamper Detection APIs
# ==========================================

@app.post("/api/evidence/register")
def register_evidence(payload: EvidenceRegisterIn):
    """
    Registers a new FIR text document.
    Calculates the exact-byte SHA-256 hash and records Version 1 with immutable original hash.
    """
    version = evidence_store.register(
        text=payload.text,
        filename=payload.filename,
        evidence_id=payload.evidence_id,
    )
    evidence = evidence_store.get(version.evidence_id)
    return {
        "status": "success",
        "evidence_id": version.evidence_id,
        "filename": version.filename,
        "version": version.version_number,
        "sha256": version.sha256,
        "original_sha256": evidence.original_sha256 if evidence else version.sha256,
        "hash_algorithm": "SHA-256",
        "integrity_status": version.integrity_status,
        "created_at": version.created_at,
    }


@app.post("/api/evidence/verify")
def verify_evidence(payload: EvidenceVerifyIn):
    """
    Authoritatively calculates SHA-256 hash on uploaded text bytes
    and compares it against the original immutable SHA-256 hash.
    """
    try:
        result = evidence_store.verify(
            evidence_id=payload.evidence_id,
            text=payload.text,
            filename=payload.filename,
        )
        return result.to_dict()
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.get("/api/evidence")
def list_evidence():
    """
    Returns list of all registered evidence items and their latest status.
    """
    records = evidence_store.list_all()
    return {"evidence_records": [r.to_dict(include_texts=False) for r in records]}


@app.get("/api/evidence/{evidence_id}")
def get_evidence(evidence_id: str):
    """
    Fetches the evidence details for a given evidence_id.
    """
    evidence = evidence_store.get(evidence_id)
    if not evidence:
        raise HTTPException(status_code=404, detail=f"Evidence ID '{evidence_id}' not found.")
    return evidence.to_dict(include_texts=True)


@app.get("/api/evidence/{evidence_id}/versions")
def get_evidence_versions(evidence_id: str):
    """
    Fetches full immutable version history for a given evidence_id.
    """
    evidence = evidence_store.get(evidence_id)
    if not evidence:
        raise HTTPException(status_code=404, detail=f"Evidence ID '{evidence_id}' not found.")
    return {
        "evidence_id": evidence.evidence_id,
        "filename": evidence.filename,
        "original_sha256": evidence.original_sha256,
        "current_version": evidence.current_version,
        "versions": [v.to_dict(include_text=True) for v in evidence.versions],
    }


@app.get("/api/evidence/{evidence_id}/diff/{version_a}/{version_b}")
def get_evidence_diff(evidence_id: str, version_a: int, version_b: int):
    """
    Fetches page-aware readable text diff between two versions of an evidence item.
    """
    try:
        diff_res = evidence_store.get_diff(evidence_id, version_a, version_b)
        return diff_res.to_dict()
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.post("/api/evidence/remap")
def remap_evidence(payload: EvidenceRemapIn):
    """
    Explicit confirmation ("Map Anyway") flow.
    Commits a new immutable version for modified text and safely runs pipeline.
    """
    try:
        # Commit new version
        new_version = evidence_store.commit_version(
            evidence_id=payload.evidence_id,
            text=payload.text,
            filename=payload.filename,
        )

        # Re-run pipeline if documents provided
        docs = payload.all_documents or {payload.evidence_id: payload.text}
        pipeline_result = _run_pipeline(docs)

        return {
            "status": "success",
            "message": "New immutable version committed and graph updated following explicit confirmation.",
            "version": new_version.to_dict(include_text=False),
            "pipeline": pipeline_result,
        }
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ==========================================
# Human-in-the-Loop Entity Priority APIs
# ==========================================

class PriorityUpdateIn(BaseModel):
    manual_order: list[str]  # Ordered entity IDs
    manually_prioritized_entities: Optional[list[str]] = None
    audit_entry: Optional[dict] = None


@app.get("/api/priority/{case_id}")
def get_case_priority(case_id: str):
    """
    Fetches the priority state (AI mode vs Manual mode, manual order, audit log) for a case.
    """
    state = priority_manager.get(case_id)
    return state.to_dict()


@app.post("/api/priority/{case_id}")
def set_case_priority(case_id: str, payload: PriorityUpdateIn):
    """
    Saves the investigator's manual priority reordering for a case and logs audit record.
    """
    state = priority_manager.set_manual_priority(
        case_id=case_id,
        ordered_entity_ids=payload.manual_order,
        manually_prioritized_entities=payload.manually_prioritized_entities,
        audit_entry=payload.audit_entry,
    )
    return state.to_dict()


@app.delete("/api/priority/{case_id}")
def reset_case_priority(case_id: str):
    """
    Discards manual priority ordering and restores AI Priority mode for a case.
    """
    state = priority_manager.reset_to_ai(case_id)
    return state.to_dict()

