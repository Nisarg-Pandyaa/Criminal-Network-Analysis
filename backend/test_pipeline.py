"""
Runs the full extract -> resolve -> graph -> analytics pipeline on the
hand-written sample case and prints a readable summary. No API key or
network access needed — this is the fastest way to sanity-check the
pipeline while building.

Run with:  ./venv/bin/python backend/test_pipeline.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.extraction import extract_from_documents
from app.resolution import resolve_entities
from app.graph_builder import build_graph
from app.analytics import run_full_analytics

SAMPLE_DIR = Path(__file__).resolve().parent / "sample_data"


def main():
    documents = {f.stem: f.read_text(encoding="utf-8") for f in sorted(SAMPLE_DIR.glob("*.txt"))}
    print(f"Loaded {len(documents)} documents: {list(documents.keys())}\n")

    entities = extract_from_documents(documents)
    print(f"--- Extracted {len(entities)} raw entity mentions ---")
    for e in entities:
        print(f"  [{e.doc_id}] {e.label:10s} {e.text!r}")

    canonicals, mention_to_canonical = resolve_entities(entities)
    print(f"\n--- Resolved into {len(canonicals)} canonical entities ---")
    for c in canonicals:
        print(f"  {c.label:10s} {c.display_name!r:30s} appears in {sorted(c.doc_ids)}")

    graph = build_graph(canonicals, entities, mention_to_canonical)
    print(f"\n--- Graph: {graph.number_of_nodes()} nodes, {graph.number_of_edges()} edges ---")

    result = run_full_analytics(graph)
    id_to_name = {c.id: c.display_name for c in canonicals}

    print("\n--- Top ranked nodes (by betweenness centrality) ---")
    for node_id in result["top_ranked_nodes"]:
        c = result["centrality"][node_id]
        print(f"  {id_to_name[node_id]:20s} pagerank={c['pagerank']:.4f}  betweenness={c['betweenness']:.4f}")

    print(f"\n--- Communities detected: {result['num_communities']} ---")
    for node_id, comm_id in result["communities"].items():
        print(f"  community {comm_id}: {id_to_name[node_id]}")

    print("\n--- Whom to Investigate First (Entity Connection Rankings - Descending) ---")
    for r in result["entity_rankings"]:
        bridge_tag = "[KEY BRIDGE]" if r["is_key_connector"] else ""
        print(
            f"  #{r['rank']:02d} {r['name']:25s} | {r['label']:10s} | "
            f"Connections: {r['connection_count']} | Score: {r['priority_score']:5.1f} | "
            f"Priority: {r['priority_level']:16s} {bridge_tag}"
        )
        # print connected entities
        nbr_names = [f"{c['name']} (x{c['weight']})" for c in r["connected_entities"]]
        print(f"       -> Connected to ({len(nbr_names)}): {', '.join(nbr_names)}")


if __name__ == "__main__":
    main()
