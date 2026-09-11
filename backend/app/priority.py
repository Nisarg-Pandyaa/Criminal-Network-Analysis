"""
Human-in-the-Loop Entity Priority Management & Audit Engine.

Manages investigator-controlled manual priority reordering, preserving original
AI-computed priority baselines, tracking explicitly prioritized entity IDs, and recording audit trails per case.

NOTE: Entity priority represents investigator focus, NOT guilt or criminality.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


@dataclass
class PriorityAuditEntry:
    case_id: str
    entity_id: str
    old_rank: int
    new_rank: int
    timestamp: str
    action: str = "manual_priority_change"

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class CasePriorityState:
    case_id: str
    priority_mode: str = "ai"  # "ai" | "manual"
    manual_order: List[str] = field(default_factory=list)  # Ordered entity IDs
    manually_prioritized_entities: List[str] = field(
        default_factory=list
    )  # Explicitly dragged entity IDs
    audit_log: List[PriorityAuditEntry] = field(default_factory=list)
    updated_at: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )

    def to_dict(self) -> Dict[str, Any]:
        return {
            "case_id": self.case_id,
            "priority_mode": self.priority_mode,
            "manual_order": self.manual_order,
            "manually_prioritized_entities": self.manually_prioritized_entities,
            "audit_log": [e.to_dict() for e in self.audit_log],
            "updated_at": self.updated_at,
        }


class PriorityManager:
    """
    In-memory store for case-specific investigator priorities and audit logs.
    Isolated by case_id / evidence_id.
    """

    def __init__(self) -> None:
        self._cases: Dict[str, CasePriorityState] = {}

    def get(self, case_id: str) -> CasePriorityState:
        if case_id not in self._cases:
            self._cases[case_id] = CasePriorityState(case_id=case_id)
        return self._cases[case_id]

    def set_manual_priority(
        self,
        case_id: str,
        ordered_entity_ids: List[str],
        manually_prioritized_entities: Optional[List[str]] = None,
        audit_entry: Optional[Dict[str, Any]] = None,
    ) -> CasePriorityState:
        state = self.get(case_id)
        state.manual_order = ordered_entity_ids
        state.priority_mode = "manual"
        state.updated_at = datetime.now(timezone.utc).isoformat()

        if manually_prioritized_entities is not None:
            state.manually_prioritized_entities = manually_prioritized_entities
        elif audit_entry and "entity_id" in audit_entry:
            eid = audit_entry["entity_id"]
            if eid not in state.manually_prioritized_entities:
                state.manually_prioritized_entities.append(eid)

        if audit_entry:
            state.audit_log.append(
                PriorityAuditEntry(
                    case_id=case_id,
                    entity_id=audit_entry.get("entity_id", "unknown"),
                    old_rank=audit_entry.get("old_rank", 0),
                    new_rank=audit_entry.get("new_rank", 0),
                    timestamp=audit_entry.get(
                        "timestamp", datetime.now(timezone.utc).isoformat()
                    ),
                    action=audit_entry.get("action", "manual_priority_change"),
                )
            )

        return state

    def reset_to_ai(self, case_id: str) -> CasePriorityState:
        """
        Discards manual ordering and explicitly prioritized entity list, restores AI priority mode.
        """
        state = self.get(case_id)
        state.manual_order = []
        state.manually_prioritized_entities = []
        state.priority_mode = "ai"
        state.updated_at = datetime.now(timezone.utc).isoformat()
        return state

    def clear(self) -> None:
        self._cases.clear()


priority_manager = PriorityManager()
