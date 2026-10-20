"""Constraint Satisfaction Problem: assign orders to partners using backtracking.

Variable : each selected order
Domain   : the available partners, or "unassigned"
Constraints: capacity, availability, delivery deadline (simulated schedule).
Objective: assign as many orders as possible, urgent ones first.
"""
from astar import find_route
from prediction import format_time

START_MINUTES = 10 * 60   # simulated start of the day: 10:00, partners at Warehouse
SERVICE_MINUTES = 5       # time spent handing over each order

ORDERS = [
    {"id": "O1", "destination": "Bakery Lane",     "node": "BAK", "weight": 2, "priority": "Urgent", "deadline": "10:30"},
    {"id": "O2", "destination": "City Pharmacy",   "node": "PHA", "weight": 1, "priority": "High",   "deadline": "10:45"},
    {"id": "O3", "destination": "Lake Apartments", "node": "LAK", "weight": 4, "priority": "Normal", "deadline": "11:30"},
    {"id": "O4", "destination": "Tech Park",       "node": "TEC", "weight": 3, "priority": "High",   "deadline": "11:00"},
    {"id": "O5", "destination": "Market Street",   "node": "MKT", "weight": 6, "priority": "Normal", "deadline": "12:00"},
]
PARTNERS = [
    {"name": "Ravi",  "capacity": 5,  "start": "Warehouse"},
    {"name": "Priya", "capacity": 8,  "start": "Warehouse"},
    {"name": "Aman",  "capacity": 12, "start": "Warehouse"},
]
PRIORITY_POINTS = {"Urgent": 100, "High": 10, "Normal": 1}   # used for the objective
PRIORITY_RANK = {"Urgent": 0, "High": 1, "Normal": 2}        # urgent orders are tried first

for _o in ORDERS:
    h, m = _o["deadline"].split(":")
    _o["deadline_min"] = int(h) * 60 + int(m)

_travel_cache = {}


def travel_minutes(a, b):
    """Travel time between two map nodes (no traffic), found with A*."""
    if a == b:
        return 0.0
    if (a, b) not in _travel_cache:
        _travel_cache[(a, b)] = find_route(a, b)["cost"]
    return _travel_cache[(a, b)]


def build_schedule(orders):
    """One partner visits orders in deadline order. Returns arrival info per order."""
    time, here, schedule = START_MINUTES, "WH", []
    for order in sorted(orders, key=lambda o: o["deadline_min"]):
        time += travel_minutes(here, order["node"])
        schedule.append({"order": order, "arrival": time, "on_time": time <= order["deadline_min"]})
        time += SERVICE_MINUTES
        here = order["node"]
    return schedule


def check_fit(partner, load, current_orders, order):
    """Constraint check. Returns (ok, reason_code)."""
    if not partner["available"]:
        return False, "unavailable"
    if load + order["weight"] > partner["capacity"]:
        return False, "capacity"
    if not all(s["on_time"] for s in build_schedule(current_orders + [order])):
        return False, "deadline"
    return True, None


def explain_unassigned(order, partners, buckets):
    available = [p for p in partners if p["available"]]
    if not available:
        return "No delivery partner is available."
    if all(order["weight"] > p["capacity"] for p in available):
        return f"Order weight ({order['weight']} kg) exceeds the maximum capacity of every available partner."
    codes = set()
    for p in available:
        current = buckets[p["name"]]
        codes.add(check_fit(p, sum(o["weight"] for o in current), current, order)[1])
    if codes == {"capacity"}:
        return "No available partner has sufficient remaining capacity."
    if codes == {"deadline"}:
        return f"No available partner can reach {order['destination']} before {order['deadline']}."
    return "No valid assignment satisfies the current constraints."


def run_csp(selected_ids, availability):
    orders = sorted((o for o in ORDERS if o["id"] in selected_ids),
                    key=lambda o: (PRIORITY_RANK[o["priority"]], o["deadline_min"]))
    partners = [{**p, "available": availability.get(p["name"], True)} for p in PARTNERS]
    usable = [p for p in partners if p["available"]]
    n = len(orders)
    # best-case points still obtainable from order i onward (used for pruning)
    suffix = [0] * (n + 1)
    for i in range(n - 1, -1, -1):
        suffix[i] = suffix[i + 1] + PRIORITY_POINTS[orders[i]["priority"]]

    buckets = {p["name"]: [] for p in partners}
    loads = {p["name"]: 0 for p in partners}
    best = {"score": (-1, -1), "buckets": None}
    stats = {"explored": 0}

    def backtrack(i, points, count):
        stats["explored"] += 1
        if i == n:                                   # every order has a decision
            if (points, count) > best["score"]:
                best["score"] = (points, count)
                best["buckets"] = {k: list(v) for k, v in buckets.items()}
            return
        if (points + suffix[i], count + n - i) <= best["score"]:
            return                                   # cannot beat best solution: prune
        order = orders[i]
        for p in sorted(usable, key=lambda p: (loads[p["name"]], p["capacity"])):  # fair: least loaded first
            ok, _ = check_fit(p, loads[p["name"]], buckets[p["name"]], order)
            if ok:
                buckets[p["name"]].append(order)     # try this value
                loads[p["name"]] += order["weight"]
                backtrack(i + 1, points + PRIORITY_POINTS[order["priority"]], count + 1)
                buckets[p["name"]].pop()             # backtrack (undo)
                loads[p["name"]] -= order["weight"]
        backtrack(i + 1, points, count)              # last option: leave unassigned

    backtrack(0, 0, 0)
    final = best["buckets"]

    assignments, partner_rows, assigned_ids = [], [], set()
    for p in partners:
        used = sum(o["weight"] for o in final[p["name"]])
        for s in build_schedule(final[p["name"]]):
            o = s["order"]
            assigned_ids.add(o["id"])
            assignments.append({"order_id": o["id"], "destination": o["destination"], "partner": p["name"],
                                "priority": o["priority"], "weight": o["weight"],
                                "arrival": format_time(s["arrival"]), "deadline": o["deadline"],
                                "deadline_met": s["on_time"]})
        partner_rows.append({"name": p["name"], "capacity": p["capacity"], "available": p["available"],
                             "used": used, "remaining": p["capacity"] - used,
                             "order_ids": [o["id"] for o in final[p["name"]]]})
    assignments.sort(key=lambda a: a["order_id"])
    unassigned = [{"order_id": o["id"], "destination": o["destination"], "priority": o["priority"],
                   "weight": o["weight"], "reason": explain_unassigned(o, partners, final)}
                  for o in orders if o["id"] not in assigned_ids]
    unassigned.sort(key=lambda u: u["order_id"])

    message = f"{n} selected order(s) processed. {len(assignments)} assigned, {len(unassigned)} unassigned"
    reasons = {u["reason"] for u in unassigned}
    if len(reasons) == 1:
        text = reasons.pop().rstrip(".")
        message += f" because {text[0].lower() + text[1:]}."
    else:
        message += ("; see the reasons below." if unassigned else ".")
    return {"assignments": assignments, "unassigned": unassigned, "partners": partner_rows,
            "summary": {"selected": n, "assigned": len(assignments), "unassigned": len(unassigned),
                        "available_partners": len(usable)},
            "message": message, "nodes_explored": stats["explored"], "simulated_start": format_time(START_MINUTES)}
