"""
Unit and API Integration Tests for Tamper-Evident Evidence Integrity and Provenance.

Tests cover:
1. First registration
2. Same-file verification
3. Modified-file verification
4. Hash mismatch reporting
5. Immutable original hash guarantee
6. Multi-version creation (V1 -> V2 -> V3)
7. Version history retrieval
8. Page-aware diff generation (preserving [PAGE X] markers)
9. Map Anyway confirmation flow
10. Cancel behavior (no graph/version mutation)
11. Invalid evidence ID handling
12. Empty file handling (exact SHA-256 for 0 bytes)
13. UTF-8 text and exact-byte hashing (no pre-normalization)
"""

import hashlib
import sys
import unittest
from pathlib import Path

# Add backend directory to sys.path
BACKEND_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BACKEND_DIR))

from app.evidence import EvidenceStore, compute_sha256_bytes
from app.main import app
from fastapi.testclient import TestClient


class TestEvidenceIntegrity(unittest.TestCase):
    def setUp(self):
        self.store = EvidenceStore()
        self.client = TestClient(app)

    # 1. First registration
    def test_01_first_registration(self):
        text = "First Information Report: Case FIR-2026-0911 regarding contraband shipment."
        expected_hash = hashlib.sha256(text.encode("utf-8")).hexdigest()

        version = self.store.register(text=text, filename="FIR_2026_0911.txt", evidence_id="FIR-001")
        evidence = self.store.get("FIR-001")

        self.assertIsNotNone(evidence)
        self.assertEqual(evidence.evidence_id, "FIR-001")
        self.assertEqual(evidence.filename, "FIR_2026_0911.txt")
        self.assertEqual(evidence.original_sha256, expected_hash)
        self.assertEqual(evidence.current_version, 1)
        self.assertEqual(version.version_number, 1)
        self.assertEqual(version.integrity_status, "VERIFIED")
        self.assertEqual(version.sha256, expected_hash)
        self.assertTrue(len(version.created_at) > 0)

    # 2. Same-file verification
    def test_02_same_file_verification(self):
        text = "Surveillance log: Suspect met associate at Blue Moon Lounge."
        self.store.register(text=text, filename="log_01.txt", evidence_id="EVD-101")

        res = self.store.verify(evidence_id="EVD-101", text=text)
        self.assertTrue(res.match)
        self.assertEqual(res.status, "VERIFIED")
        self.assertEqual(res.original_sha256, res.current_sha256)
        self.assertIn("verified", res.message.lower())

    # 3. Modified-file verification
    def test_03_modified_file_verification(self):
        original_text = "Suspect Marcus Cole handed a silver briefcase to Tariq Vance."
        modified_text = "Suspect Marcus Cole handed a black backpack to Tariq Vance."

        self.store.register(text=original_text, filename="case_narco.txt", evidence_id="EVD-NARCO")

        res = self.store.verify(evidence_id="EVD-NARCO", text=modified_text)
        self.assertFalse(res.match)
        self.assertEqual(res.status, "MODIFIED")
        self.assertNotEqual(res.original_sha256, res.current_sha256)
        self.assertIn("modified", res.message.lower())

    # 4. Hash mismatch reporting
    def test_04_hash_mismatch_reporting(self):
        v1_text = "Page 1: Witness observed license plate NY-7890-AB."
        v2_text = "Page 1: Witness observed license plate CA-1234-ZZ."

        self.store.register(text=v1_text, filename="witness_stmt.txt", evidence_id="EVD-WITNESS")
        res = self.store.verify(evidence_id="EVD-WITNESS", text=v2_text)

        expected_orig = hashlib.sha256(v1_text.encode("utf-8")).hexdigest()
        expected_curr = hashlib.sha256(v2_text.encode("utf-8")).hexdigest()

        self.assertEqual(res.original_sha256, expected_orig)
        self.assertEqual(res.current_sha256, expected_curr)
        self.assertEqual(res.original_version, 1)
        self.assertEqual(res.current_version, 2)

    # 5. Immutable original hash guarantee
    def test_05_immutable_original_hash(self):
        text_v1 = "Initial seized ledger: Amount $50,000 recorded."
        text_v2 = "Altered ledger: Amount $500,000 recorded."
        text_v3 = "Further altered ledger: Amount $1,000,000 recorded."

        self.store.register(text=text_v1, filename="ledger.txt", evidence_id="EVD-LEDGER")
        orig_hash = self.store.get("EVD-LEDGER").original_sha256

        # Commit Version 2
        v2 = self.store.commit_version(evidence_id="EVD-LEDGER", text=text_v2)
        evidence = self.store.get("EVD-LEDGER")
        self.assertEqual(evidence.original_sha256, orig_hash, "Original hash must remain immutable!")
        self.assertEqual(v2.version_number, 2)

        # Commit Version 3
        v3 = self.store.commit_version(evidence_id="EVD-LEDGER", text=text_v3)
        self.assertEqual(evidence.original_sha256, orig_hash, "Original hash must NEVER change!")
        self.assertEqual(v3.version_number, 3)
        self.assertEqual(evidence.current_version, 3)

    # 6. Multi-version creation
    def test_06_version_creation(self):
        self.store.register(text="Doc V1 content", filename="doc.txt", evidence_id="EVD-MULTI")
        self.store.commit_version(evidence_id="EVD-MULTI", text="Doc V2 modified content")
        self.store.commit_version(evidence_id="EVD-MULTI", text="Doc V3 final revision")

        evd = self.store.get("EVD-MULTI")
        self.assertEqual(len(evd.versions), 3)
        self.assertEqual(evd.versions[0].version_number, 1)
        self.assertEqual(evd.versions[1].version_number, 2)
        self.assertEqual(evd.versions[2].version_number, 3)

        # Check statuses
        self.assertEqual(evd.versions[0].integrity_status, "VERIFIED")
        self.assertEqual(evd.versions[1].integrity_status, "MODIFIED")
        self.assertEqual(evd.versions[2].integrity_status, "MODIFIED")

    # 7. Version history retrieval
    def test_07_version_history_retrieval(self):
        self.store.register(text="First draft statement", filename="statement.txt", evidence_id="EVD-HIST")
        self.store.commit_version(evidence_id="EVD-HIST", text="Second revised statement")

        evd_dict = self.store.get("EVD-HIST").to_dict(include_texts=True)
        self.assertEqual(evd_dict["total_versions"], 2)
        self.assertEqual(len(evd_dict["versions"]), 2)
        self.assertEqual(evd_dict["versions"][0]["text"], "First draft statement")
        self.assertEqual(evd_dict["versions"][1]["text"], "Second revised statement")

    # 8. Diff generation with page marker preservation
    def test_08_diff_generation_with_page_markers(self):
        text_v1 = (
            "[PAGE 1]\n"
            "Officer observed John Doe meeting Tariq Vance at the Blue Moon Lounge.\n"
            "[PAGE 2]\n"
            "Tariq Vance delivered a black envelope to Elena Rostova.\n"
            "[PAGE 3]\n"
            "Elena Rostova departed in a dark sedan.\n"
        )
        text_v2 = (
            "[PAGE 1]\n"
            "Officer observed John Doe meeting Tariq Vance at the Blue Moon Lounge.\n"
            "[PAGE 2]\n"
            "Tariq Vance delivered a gold briefcase to Elena Rostova.\n"
            "[PAGE 3]\n"
            "Elena Rostova departed in a silver motorcycle.\n"
        )

        self.store.register(text=text_v1, filename="report.txt", evidence_id="EVD-DIFF")
        self.store.commit_version(evidence_id="EVD-DIFF", text=text_v2)

        diff = self.store.get_diff("EVD-DIFF", 1, 2)
        self.assertEqual(diff.version_a, 1)
        self.assertEqual(diff.version_b, 2)
        self.assertIn("[PAGE 1]", diff.pages_detected)
        self.assertIn("[PAGE 2]", diff.pages_detected)
        self.assertIn("[PAGE 3]", diff.pages_detected)

        # Check line diffs
        removed = [d["content"] for d in diff.diff_lines if d["type"] == "removed"]
        added = [d["content"] for d in diff.diff_lines if d["type"] == "added"]

        self.assertTrue(any("black envelope" in r for r in removed))
        self.assertTrue(any("gold briefcase" in a for a in added))
        self.assertTrue(any("dark sedan" in r for r in removed))
        self.assertTrue(any("silver motorcycle" in a for a in added))

    # 9. Map Anyway confirmation flow
    def test_09_map_anyway_confirmation_api(self):
        # Register initial document via API
        reg_resp = self.client.post("/api/evidence/register", json={
            "text": "Initial statement regarding Marcus Cole.",
            "filename": "marcus_report.txt",
            "evidence_id": "EVD-CONFIRM",
        })
        self.assertEqual(reg_resp.status_code, 200)

        # Remap with confirmation
        remap_resp = self.client.post("/api/evidence/remap", json={
            "evidence_id": "EVD-CONFIRM",
            "text": "Modified statement regarding Marcus Cole and Elena Rostova.",
            "filename": "marcus_report.txt",
            "all_documents": {"EVD-CONFIRM": "Modified statement regarding Marcus Cole and Elena Rostova."},
        })
        self.assertEqual(remap_resp.status_code, 200)
        data = remap_resp.json()
        self.assertEqual(data["version"]["version_number"], 2)
        self.assertEqual(data["version"]["integrity_status"], "MODIFIED")
        self.assertIn("pipeline", data)
        self.assertIn("graph", data["pipeline"])

    # 10. Cancel behavior (no graph/version mutation)
    def test_10_cancel_behavior(self):
        self.store.register(text="Unchanged text", filename="unchanged.txt", evidence_id="EVD-CANCEL")
        initial_version_count = len(self.store.get("EVD-CANCEL").versions)

        # User checks verification
        ver = self.store.verify(evidence_id="EVD-CANCEL", text="Modified but user will cancel")
        self.assertFalse(ver.match)

        # User clicked Cancel -> No commit_version is called
        final_version_count = len(self.store.get("EVD-CANCEL").versions)
        self.assertEqual(initial_version_count, final_version_count)
        self.assertEqual(self.store.get("EVD-CANCEL").current_version, 1)

    # 11. Invalid evidence ID handling
    def test_11_invalid_evidence_id(self):
        with self.assertRaises(KeyError):
            self.store.verify(evidence_id="NON_EXISTENT_ID", text="Sample text")

        # Via FastAPI client
        resp = self.client.post("/api/evidence/verify", json={
            "evidence_id": "DOES_NOT_EXIST",
            "text": "Some text",
        })
        self.assertEqual(resp.status_code, 404)

    # 12. Empty file handling
    def test_12_empty_file_handling(self):
        empty_text = ""
        expected_empty_hash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"

        computed = compute_sha256_bytes(empty_text)
        self.assertEqual(computed, expected_empty_hash)

        v = self.store.register(text=empty_text, filename="empty.txt", evidence_id="EVD-EMPTY")
        self.assertEqual(v.sha256, expected_empty_hash)

        ver = self.store.verify(evidence_id="EVD-EMPTY", text="")
        self.assertTrue(ver.match)
        self.assertEqual(ver.status, "VERIFIED")

    # 13. UTF-8 text and exact-byte hashing (no pre-normalization)
    def test_13_utf8_and_exact_byte_hashing(self):
        # Texts with different whitespaces and UTF-8 characters
        text_a = "Case 101:\nSuspect: Müller\tAmount: €50,000 \r\n"
        text_b = "Case 101:\nSuspect: Müller Amount: €50,000 \n"  # subtle whitespace differences

        hash_a = compute_sha256_bytes(text_a)
        hash_b = compute_sha256_bytes(text_b)

        # Hashes MUST differ because no whitespace/line-ending normalization is allowed
        self.assertNotEqual(hash_a, hash_b)

        # Exact byte representation test
        self.store.register(text=text_a, filename="utf8_doc.txt", evidence_id="EVD-UTF8")
        ver_same = self.store.verify("EVD-UTF8", text_a)
        self.assertTrue(ver_same.match)

        ver_normalized_diff = self.store.verify("EVD-UTF8", text_b)
        self.assertFalse(ver_normalized_diff.match)


if __name__ == "__main__":
    unittest.main()
