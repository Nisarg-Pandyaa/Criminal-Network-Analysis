"""
Synthetic case generation via the Gemini API free tier.

Requires a GEMINI_API_KEY environment variable (get one free, no credit
card, at https://aistudio.google.com/apikey).

This module is what /generate-case in main.py calls. It is NOT exercised
by the test pipeline (test_pipeline.py) since that runs offline against
the hand-written sample_data — this needs network access + a real key.
"""

import json
import os
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
GEMINI_URL = (
    f"https://generativelanguage.googleapis.com/v1beta/models/"
    f"{GEMINI_MODEL}:generateContent"
)

PROMPT_TEMPLATE = """You are generating a FICTIONAL, synthetic case file for testing a \
crime-network-analysis tool. This is not based on any real person or event.

Generate {num_docs} short police-report-style documents (FIRs) in India, totaling \
a criminal case with {num_entities} named people. Deliberately include one person \
who appears in more than one document and acts as a hidden link between two \
otherwise-separate incidents (e.g. via a shared phone number or vehicle). \
Complexity level: {complexity}/5 (higher = more people, more documents, subtler link).

Return ONLY valid JSON, no markdown fences, in this exact shape:
{{
  "documents": [
    {{"doc_id": "case_001", "text": "..."}},
    {{"doc_id": "case_002", "text": "..."}}
  ]
}}
"""


def generate_synthetic_case(num_docs: int = 3, num_entities: int = 4, complexity: int = 1) -> dict:
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError(
            "GEMINI_API_KEY is not set. Get a free key at "
            "https://aistudio.google.com/apikey and export it before calling this."
        )

    prompt = PROMPT_TEMPLATE.format(
        num_docs=num_docs, num_entities=num_entities, complexity=complexity
    )

    response = requests.post(
        GEMINI_URL,
        headers={"Content-Type": "application/json", "x-goog-api-key": api_key},
        json={"contents": [{"parts": [{"text": prompt}]}]},
        timeout=60,
    )
    response.raise_for_status()
    payload = response.json()

    raw_text = payload["candidates"][0]["content"]["parts"][0]["text"]
    # Strip markdown fences if the model added them despite instructions.
    raw_text = raw_text.strip().removeprefix("```json").removeprefix("```").removesuffix("```")

    parsed = json.loads(raw_text)
    return {doc["doc_id"]: doc["text"] for doc in parsed["documents"]}
