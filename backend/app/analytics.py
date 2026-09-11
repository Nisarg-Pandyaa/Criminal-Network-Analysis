"""
Graph analytics layer. Pure graph theory — nothing here needs training.

  - centrality: who's influential (PageRank + betweenness)
  - communities: what clusters/cells exist (Louvain)
  - articulation points: nodes that, if removed, split the network into
    separate pieces. In an investigative context these are exactly the
    "hidden intermediary" nodes — the person who is the *only* link
    between two otherwise unconnected clusters. This is the analytic
    that produces the "aha, X connects two unrelated cases" moment.
"""

import networkx as nx


def compute_centrality(graph: nx.Graph) -> dict[str, dict]:
    if graph.number_of_nodes() == 0:
        return {}
    pagerank = nx.pagerank(graph, weight="weight")
    betweenness = nx.betweenness_centrality(graph, weight="weight", normalized=True)
    return {
        node: {"pagerank": round(pagerank[node], 4), "betweenness": round(betweenness[node], 4)}
        for node in graph.nodes
    }


def detect_communities(graph: nx.Graph) -> dict[str, int]:
    if graph.number_of_nodes() == 0:
        return {}
    communities = nx.algorithms.community.louvain_communities(graph, weight="weight", seed=42)
    node_to_community: dict[str, int] = {}
    for idx, community in enumerate(communities):
        for node in community:
            node_to_community[node] = idx
    return node_to_community


def find_key_connectors(graph: nx.Graph) -> list[str]:
    """Articulation points: removing this node disconnects the graph."""
    if graph.number_of_nodes() < 3:
        return []
    return list(nx.articulation_points(graph))


def compute_entity_rankings(
    graph: nx.Graph,
    centrality: dict[str, dict],
    communities: dict[str, int],
    connectors: set[str],
) -> list[dict]:
    if graph.number_of_nodes() == 0:
        return []

    rankings = []
    max_degree = max((graph.degree(n) for n in graph.nodes), default=1) or 1

    for node in graph.nodes:
        node_data = graph.nodes[node]
        neighbors = list(graph.neighbors(node))
        connection_count = len(neighbors)
        weighted_degree = sum(graph[node][nbr].get("weight", 1) for nbr in neighbors)

        connected_entities = []
        for nbr in neighbors:
            edge_data = graph[node][nbr]
            connected_entities.append({
                "id": nbr,
                "name": graph.nodes[nbr].get("name", nbr),
                "label": graph.nodes[nbr].get("label", "UNKNOWN"),
                "weight": edge_data.get("weight", 1),
                "shared_docs": edge_data.get("shared_docs", []),
            })
        connected_entities.sort(key=lambda x: (-x["weight"], x["name"]))

        node_betweenness = centrality.get(node, {}).get("betweenness", 0.0)
        node_pagerank = centrality.get(node, {}).get("pagerank", 0.0)
        is_connector = node in connectors
        doc_ids = node_data.get("doc_ids", [])

        # Calculate composite priority score
        # Considers direct connections (degree), network betweenness, and bridge status
        priority_score = round(
            (connection_count * 10)
            + (node_betweenness * 50)
            + (30 if is_connector else 0)
            + (node_pagerank * 20),
            2,
        )

        if is_connector and connection_count >= 3:
            priority_level = "CRITICAL BRIDGE"
            priority_color = "red"
            investigation_reason = (
                f"Critical hub and network bridge with {connection_count} connections. "
                "Investigating this entity may disrupt multiple interconnected operations."
            )
        elif connection_count >= 3 or node_betweenness >= 0.25:
            priority_level = "HIGH PRIORITY"
            priority_color = "orange"
            investigation_reason = (
                f"High-density target linked to {connection_count} entities across "
                f"{len(doc_ids)} case document(s). Central to communications."
            )
        elif is_connector or connection_count >= 2:
            priority_level = "MEDIUM PRIORITY"
            priority_color = "yellow"
            investigation_reason = (
                f"Moderate connectivity ({connection_count} links). Serves as a liaison or secondary associate."
            )
        else:
            priority_level = "PERIPHERAL"
            priority_color = "blue"
            investigation_reason = (
                f"Peripheral entity with {connection_count} link(s). Monitor for additional intelligence."
            )

        rankings.append({
            "id": node,
            "name": node_data.get("name", node),
            "label": node_data.get("label", "UNKNOWN"),
            "connection_count": connection_count,
            "weighted_degree": weighted_degree,
            "betweenness": node_betweenness,
            "pagerank": node_pagerank,
            "is_key_connector": is_connector,
            "community_id": communities.get(node, 0),
            "doc_ids": doc_ids,
            "connected_entities": connected_entities,
            "priority_score": priority_score,
            "priority_level": priority_level,
            "priority_color": priority_color,
            "investigation_reason": investigation_reason,
        })

    # Sort descending primarily by connection_count, then priority_score, then betweenness
    rankings.sort(
        key=lambda item: (
            -item["connection_count"],
            -item["priority_score"],
            -item["betweenness"],
            item["name"],
        )
    )

    # Assign rank numbers (1-indexed)
    for rank_idx, item in enumerate(rankings, 1):
        item["rank"] = rank_idx

    return rankings


def run_full_analytics(graph: nx.Graph) -> dict:
    centrality = compute_centrality(graph)
    communities = detect_communities(graph)
    connectors = find_key_connectors(graph)
    connectors_set = set(connectors)

    entity_rankings = compute_entity_rankings(graph, centrality, communities, connectors_set)

    ranked = sorted(
        graph.nodes,
        key=lambda n: centrality.get(n, {}).get("betweenness", 0),
        reverse=True,
    )

    total_connections = graph.number_of_edges()

    return {
        "centrality": centrality,
        "communities": communities,
        "num_communities": len(set(communities.values())) if communities else 0,
        "key_connectors": connectors,
        "top_ranked_nodes": ranked[:5],
        "entity_rankings": entity_rankings,
        "total_entities": graph.number_of_nodes(),
        "total_connections": total_connections,
    }
