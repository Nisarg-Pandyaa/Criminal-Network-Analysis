"""
Tamper-Evident Evidence Integrity and Provenance Engine.

This module provides server-side SHA-256 hash calculation, immutable versioning,
tamper detection, page-aware text diffing, and provenance tracking for FIR documents.

NOTE: This system provides tamper-evident integrity and provenance; it does not make
legal chain-of-custody claims or person-level modification attribution.
"""

from __future__ import annotations

import difflib
import hashlib
import re
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


def compute_sha256_bytes(text: str) -> str:
    """
    Computes the authoritative SHA-256 hexadecimal digest from exact raw UTF-8 bytes.
    Does NOT normalize whitespace, line endings, or casing.
    """
    raw_bytes = text.encode("utf-8")
    return hashlib.sha256(raw_bytes).hexdigest()


@dataclass
class EvidenceVersion:
    version_number: int
    sha256: str
    created_at: str
    filename: str
    text: str
    evidence_id: str
    integrity_status: str  # "VERIFIED" | "MODIFIED"
    analysis: Optional[Dict[str, Any]] = None

    def to_dict(self, include_text: bool = True) -> Dict[str, Any]:
        data = {
            "version_number": self.version_number,
            "sha256": self.sha256,
            "created_at": self.created_at,
            "filename": self.filename,
            "evidence_id": self.evidence_id,
            "integrity_status": self.integrity_status,
            "has_analysis": self.analysis is not None,
        }
        if include_text:
            data["text"] = self.text
        return data


@dataclass
class Evidence:
    evidence_id: str
    filename: str
    original_sha256: str  # Immutable original hash from Version 1
    created_at: str
    hash_algorithm: str = "SHA-256"
    current_version: int = 1
    versions: List[EvidenceVersion] = field(default_factory=list)

    def to_dict(self, include_texts: bool = False) -> Dict[str, Any]:
        latest_ver = self.versions[-1] if self.versions else None
        return {
            "evidence_id": self.evidence_id,
            "filename": self.filename,
            "hash_algorithm": self.hash_algorithm,
            "original_sha256": self.original_sha256,
            "created_at": self.created_at,
            "current_version": self.current_version,
            "latest_sha256": latest_ver.sha256 if latest_ver else self.original_sha256,
            "integrity_status": latest_ver.integrity_status if latest_ver else "VERIFIED",
            "total_versions": len(self.versions),
            "versions": [v.to_dict(include_text=include_texts) for v in self.versions],
        }


@dataclass
class VerificationResult:
    evidence_id: str
    filename: str
    match: bool
    status: str  # "VERIFIED" | "MODIFIED"
    original_sha256: str
    current_sha256: str
    original_version: int
    current_version: int
    message: str

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class DiffResult:
    evidence_id: str
    version_a: int
    version_b: int
    sha256_a: str
    sha256_b: str
    diff_text: str
    diff_lines: List[Dict[str, Any]]
    pages_detected: List[str]

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class EvidenceStore:
    """
    In-memory evidence storage and provenance manager.
    Enforces immutability of original SHA-256 hashes and version trail.
    """

    def __init__(self) -> None:
        self._store: Dict[str, Evidence] = {}

    def clear(self) -> None:
        self._store.clear()

    def get(self, evidence_id: str) -> Optional[Evidence]:
        return self._store.get(evidence_id)

    def list_all(self) -> List[Evidence]:
        return list(self._store.values())

    def register(
        self,
        text: str,
        filename: str = "FIR_document.txt",
        evidence_id: Optional[str] = None,
        analysis: Optional[Dict[str, Any]] = None,
    ) -> EvidenceVersion:
        """
        Registers an initial FIR document (Version 1).
        Computes the original immutable SHA-256 hash.
        If an evidence_id is provided and already exists, it verifies or returns the existing V1.
        """
        now = datetime.now(timezone.utc).isoformat()
        current_hash = compute_sha256_bytes(text)

        if evidence_id and evidence_id in self._store:
            # If already registered, don't overwrite V1. Return latest or existing.
            evidence = self._store[evidence_id]
            if current_hash == evidence.original_sha256:
                return evidence.versions[0]
            return evidence.versions[-1]

        final_id = evidence_id or f"evd_{uuid.uuid4().hex[:12]}"
        
        v1 = EvidenceVersion(
            version_number=1,
            sha256=current_hash,
            created_at=now,
            filename=filename,
            text=text,
            evidence_id=final_id,
            integrity_status="VERIFIED",
            analysis=analysis,
        )

        evidence = Evidence(
            evidence_id=final_id,
            filename=filename,
            original_sha256=current_hash,  # Immutable anchor
            created_at=now,
            hash_algorithm="SHA-256",
            current_version=1,
            versions=[v1],
        )

        self._store[final_id] = evidence
        return v1

    def verify(
        self,
        evidence_id: str,
        text: str,
        filename: Optional[str] = None,
    ) -> VerificationResult:
        """
        Verifies a newly submitted text against the immutable original SHA-256 hash.
        """
        evidence = self.get(evidence_id)
        if not evidence:
            raise KeyError(f"Evidence record with ID '{evidence_id}' not found.")

        current_hash = compute_sha256_bytes(text)
        original_hash = evidence.original_sha256
        is_match = current_hash == original_hash

        status = "VERIFIED" if is_match else "MODIFIED"
        message = (
            "Source document integrity verified. Hash matches the original registration."
            if is_match
            else "Source document has changed since it was originally mapped. The source document was modified after the original hash was recorded."
        )

        return VerificationResult(
            evidence_id=evidence_id,
            filename=filename or evidence.filename,
            match=is_match,
            status=status,
            original_sha256=original_hash,
            current_sha256=current_hash,
            original_version=1,
            current_version=evidence.current_version + 1 if not is_match else evidence.current_version,
            message=message,
        )

    def commit_version(
        self,
        evidence_id: str,
        text: str,
        filename: Optional[str] = None,
        analysis: Optional[Dict[str, Any]] = None,
    ) -> EvidenceVersion:
        """
        Explicitly commits a new immutable version (e.g. after 'Map Anyway' confirmation).
        The original hash on the Evidence entity remains untouched and immutable.
        """
        evidence = self.get(evidence_id)
        if not evidence:
            raise KeyError(f"Evidence record with ID '{evidence_id}' not found.")

        now = datetime.now(timezone.utc).isoformat()
        current_hash = compute_sha256_bytes(text)
        is_match = current_hash == evidence.original_sha256
        integrity_status = "VERIFIED" if is_match else "MODIFIED"

        new_version_num = len(evidence.versions) + 1
        new_version = EvidenceVersion(
            version_number=new_version_num,
            sha256=current_hash,
            created_at=now,
            filename=filename or evidence.filename,
            text=text,
            evidence_id=evidence_id,
            integrity_status=integrity_status,
            analysis=analysis,
        )

        evidence.versions.append(new_version)
        evidence.current_version = new_version_num
        return new_version

    def get_version(self, evidence_id: str, version_number: int) -> Optional[EvidenceVersion]:
        evidence = self.get(evidence_id)
        if not evidence:
            return None
        for v in evidence.versions:
            if v.version_number == version_number:
                return v
        return None

    def get_diff(self, evidence_id: str, version_a: int, version_b: int) -> DiffResult:
        """
        Generates a readable line-by-line diff between two versions, preserving page markers.
        """
        va = self.get_version(evidence_id, version_a)
        vb = self.get_version(evidence_id, version_b)

        if not va:
            raise KeyError(f"Version {version_a} not found for evidence '{evidence_id}'.")
        if not vb:
            raise KeyError(f"Version {version_b} not found for evidence '{evidence_id}'.")

        lines_a = va.text.splitlines()
        lines_b = vb.text.splitlines()

        # Generate unified diff
        diff_generator = difflib.unified_diff(
            lines_a,
            lines_b,
            fromfile=f"Version {version_a} ({va.filename})",
            tofile=f"Version {version_b} ({vb.filename})",
            lineterm="",
        )
        diff_text = "\n".join(diff_generator)

        # Build structured diff with page marker detection
        # Matches patterns like [PAGE 1], Page 2, --- Page 3 ---
        page_pattern = re.compile(r"^\s*(\[PAGE\s+\d+\]|PAGE\s+\d+|---\s*Page\s+\d+\s*---)", re.IGNORECASE)
        pages_detected: List[str] = []

        diff_lines: List[Dict[str, Any]] = []
        current_page = None

        differ = difflib.Differ()
        raw_diff = list(differ.compare(lines_a, lines_b))

        for line in raw_diff:
            if not line:
                continue
            code = line[0]  # ' ', '+', '-', '?'
            content = line[2:]

            if code == "?":
                continue

            m = page_pattern.match(content)
            if m:
                current_page = m.group(1).upper()
                if current_page not in pages_detected:
                    pages_detected.append(current_page)

            line_type = "unchanged"
            if code == "+":
                line_type = "added"
            elif code == "-":
                line_type = "removed"

            diff_lines.append({
                "type": line_type,
                "prefix": code,
                "content": content,
                "page_marker": current_page,
            })

        return DiffResult(
            evidence_id=evidence_id,
            version_a=version_a,
            version_b=version_b,
            sha256_a=va.sha256,
            sha256_b=vb.sha256,
            diff_text=diff_text,
            diff_lines=diff_lines,
            pages_detected=pages_detected,
        )


# Global singleton instance of evidence store
evidence_store = EvidenceStore()
