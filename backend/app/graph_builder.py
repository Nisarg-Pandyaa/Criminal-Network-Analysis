"""
Graph construction layer.

MVP heuristic for relationships (no trained relation-extraction model yet):
entities that co-occur in the same document are connected by an edge.
Edge weight = number of documents the pair co-occurs in. This is a
reasonable stand-in until you fine-tune a real relation-extraction step —
swap build_graph()'s edge logic once you have one.
"""

from itertools import combinations

import networkx as nx

from .extraction import ExtractedEntity
from .resolution import CanonicalEntity


def build_graph(
    canonicals: list[CanonicalEntity],
    entities: list[ExtractedEntity],
    mention_to_canonical: dict[str, str],
) -> nx.Graph:
    graph = nx.Graph()

    for c in canonicals:
        graph.add_node(c.id, label=c.label, name=c.display_name, doc_ids=sorted(c.doc_ids))

    # Group canonical entity ids by the SENTENCE they co-occur in (not the
    # whole document) — document-level co-occurrence connects nearly every
    # entity in a document to every other one, drowning out the actual
    # signal. Sentence-level keeps only genuinely-related pairs.
    sent_to_canon_ids: dict[str, set[str]] = {}
    sent_to_doc: dict[str, str] = {}
    for ent in entities:
        canon_id = mention_to_canonical[ent.id]
        sent_to_canon_ids.setdefault(ent.sent_id, set()).add(canon_id)
        sent_to_doc[ent.sent_id] = ent.doc_id

    for sent_id, canon_ids in sent_to_canon_ids.items():
        doc_id = sent_to_doc[sent_id]
        for a, b in combinations(sorted(canon_ids), 2):
            if graph.has_edge(a, b):
                graph[a][b]["weight"] += 1
                if doc_id not in graph[a][b]["shared_docs"]:
                    graph[a][b]["shared_docs"].append(doc_id)
            else:
                graph.add_edge(a, b, weight=1, shared_docs=[doc_id])

    return graph


def graph_to_dict(graph: nx.Graph) -> dict:
    nodes = [
        {"id": n, **data}
        for n, data in graph.nodes(data=True)
    ]
    edges = [
        {"source": u, "target": v, "weight": data["weight"], "shared_docs": data["shared_docs"]}
        for u, v, data in graph.edges(data=True)
    ]
    return {"nodes": nodes, "edges": edges}
