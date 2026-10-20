"""A* search on a small simulated road network.

Costs are in "minutes". Heuristic = straight-line distance between SVG
coordinates divided by SCALE. Every edge cost is >= its straight-line
distance / SCALE, so the heuristic never over-estimates (admissible),
which guarantees A* returns the cheapest route.
"""
import heapq
import math

SCALE = 25.0  # SVG pixels covered per minute of travel

# kind: warehouse | junction | destination
NODES = {
    "WH":  {"name": "Warehouse",       "x": 70,  "y": 260, "kind": "warehouse"},
    "J1":  {"name": "Junction 1",      "x": 210, "y": 140, "kind": "junction"},
    "J2":  {"name": "Junction 2",      "x": 210, "y": 380, "kind": "junction"},
    "J3":  {"name": "Junction 3",      "x": 390, "y": 260, "kind": "junction"},
    "J4":  {"name": "Junction 4",      "x": 560, "y": 140, "kind": "junction"},
    "J5":  {"name": "Junction 5",      "x": 560, "y": 380, "kind": "junction"},
    "BAK": {"name": "Bakery Lane",     "x": 385, "y": 50,  "kind": "destination"},
    "PHA": {"name": "City Pharmacy",   "x": 750, "y": 140, "kind": "destination"},
    "LAK": {"name": "Lake Apartments", "x": 390, "y": 470, "kind": "destination"},
    "TEC": {"name": "Tech Park",       "x": 750, "y": 300, "kind": "destination"},
    "MKT": {"name": "Market Street",   "x": 750, "y": 460, "kind": "destination"},
}

# (from, to, slowness multiplier >= 1, busy road?)
ROADS = [
    ("WH", "J1", 1.0, False), ("WH", "J2", 1.0, False), ("WH", "J3", 1.1, True),
    ("J1", "BAK", 1.0, False), ("J1", "J3", 1.0, False), ("J2", "J3", 1.0, False),
    ("J2", "LAK", 1.1, False), ("BAK", "J4", 1.0, False), ("J3", "J4", 1.1, True),
    ("J3", "J5", 1.0, True), ("J4", "J5", 1.0, True), ("J4", "PHA", 1.0, False),
    ("LAK", "J5", 1.0, False), ("J5", "TEC", 1.0, True), ("PHA", "TEC", 1.0, False),
    ("TEC", "MKT", 1.0, False), ("J5", "MKT", 1.2, False), ("LAK", "MKT", 1.0, False),
]

BUSY_MULTIPLIER = {"Low": 1.0, "Medium": 1.7, "High": 2.5}
OTHER_MULTIPLIER = {"Low": 1.0, "Medium": 1.0, "High": 1.2}


def pixel_distance(a, b):
    return math.hypot(NODES[a]["x"] - NODES[b]["x"], NODES[a]["y"] - NODES[b]["y"])


EDGES = {}
for _a, _b, _slow, _busy in ROADS:
    _len = pixel_distance(_a, _b)
    EDGES[f"{_a}-{_b}"] = {
        "id": f"{_a}-{_b}", "a": _a, "b": _b, "length_px": round(_len, 1),
        "base_cost": round(_len / SCALE * _slow, 2), "busy": _busy,
    }


def edge_cost(edge, traffic):
    """Traffic raises the cost of roads (busy roads are hit hardest)."""
    table = BUSY_MULTIPLIER if edge["busy"] else OTHER_MULTIPLIER
    return round(edge["base_cost"] * table[traffic], 2)


def build_adjacency(traffic="Low", blocked=()):
    """node -> list of (neighbour, cost, edge_id). Blocked roads are left out."""
    adjacency = {n: [] for n in NODES}
    for edge in EDGES.values():
        if edge["id"] in blocked:
            continue
        cost = edge_cost(edge, traffic)
        adjacency[edge["a"]].append((edge["b"], cost, edge["id"]))
        adjacency[edge["b"]].append((edge["a"], cost, edge["id"]))
    return adjacency


def a_star(adjacency, coords, start, goal, scale=SCALE):
    """Return dict(found, path, edge_ids, cost, explored)."""
    def h(node):  # heuristic: straight-line distance to goal, in minutes
        return math.hypot(coords[node][0] - coords[goal][0],
                          coords[node][1] - coords[goal][1]) / scale

    open_heap = [(h(start), 0.0, start)]   # (f = g + h, g, node)
    best_g = {start: 0.0}
    came_from = {}                          # node -> (previous node, edge id)
    closed, explored = set(), 0
    while open_heap:
        _, g, node = heapq.heappop(open_heap)
        if node in closed:
            continue
        closed.add(node)
        explored += 1
        if node == goal:  # rebuild the path backwards
            path, edge_ids = [node], []
            while node in came_from:
                node, eid = came_from[node]
                path.append(node)
                edge_ids.append(eid)
            return {"found": True, "path": path[::-1], "edge_ids": edge_ids[::-1],
                    "cost": round(g, 2), "explored": explored}
        for neighbour, cost, eid in adjacency[node]:
            new_g = g + cost
            if new_g < best_g.get(neighbour, math.inf):
                best_g[neighbour] = new_g
                came_from[neighbour] = (node, eid)
                heapq.heappush(open_heap, (new_g + h(neighbour), new_g, neighbour))
    return {"found": False, "path": [], "edge_ids": [], "cost": None, "explored": explored}


def find_route(start, goal, traffic="Low", blocked=()):
    coords = {n: (v["x"], v["y"]) for n, v in NODES.items()}
    return a_star(build_adjacency(traffic, set(blocked)), coords, start, goal)


def path_distance_km(edge_ids):
    """Physical length of a route (ignores traffic), 50 SVG px = 1 km."""
    return round(sum(EDGES[e]["length_px"] for e in edge_ids) / 50.0, 2)


def run_cost_tests():
    """Run A* on tiny separate graphs: S -> Route X -> E for three routes."""
    cases = [{"A": 12, "B": 15, "C": 7}, {"A": 12, "B": 15, "C": 14}, {"A": 18, "B": 10, "C": 14}]
    results = []
    for number, costs in enumerate(cases, 1):
        adjacency = {"S": [], "E": [], **{r: [] for r in costs}}
        for route, cost in costs.items():
            for u, v in (("S", route), (route, "E")):  # split the cost over two roads
                adjacency[u].append((v, cost / 2, f"{u}-{v}"))
                adjacency[v].append((u, cost / 2, f"{u}-{v}"))
        zero = {n: (0, 0) for n in adjacency}  # no coordinates -> heuristic 0
        result = a_star(adjacency, zero, "S", "E")
        chosen = result["path"][1]
        expected = min(costs, key=costs.get)
        results.append({"case": number, "costs": costs, "selected": f"Route {chosen}",
                        "expected": f"Route {expected}", "total_cost": result["cost"],
                        "passed": chosen == expected})
    return results
