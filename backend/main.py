from pathlib import Path
from typing import Dict, List, Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

import astar
import csp
import prediction

app = FastAPI(title="Intelligent Delivery Planner")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

Traffic = Literal["Low", "Medium", "High"]


class CspRequest(BaseModel):
    selected_order_ids: List[str]
    partner_availability: Dict[str, bool] = {}


class RouteRequest(BaseModel):
    destination: str
    traffic: Traffic = "Low"
    blocked_roads: List[str] = []


class PredictRequest(BaseModel):
    distance_km: float = Field(ge=0, le=100)
    traffic: Traffic
    stops: int = Field(ge=0, le=5)


@app.get("/api/health")
def health():
    return {"status": "ok", "model_mae": prediction.MAE}


@app.get("/api/orders")
def get_orders():
    return {"orders": csp.ORDERS, "partners": csp.PARTNERS,
            "simulated_start": prediction.format_time(csp.START_MINUTES)}


@app.post("/api/csp/assign")
def csp_assign(req: CspRequest):
    known = {o["id"] for o in csp.ORDERS}
    if not req.selected_order_ids:
        raise HTTPException(400, "Select at least one order before running the assignment.")
    unknown = [i for i in req.selected_order_ids if i not in known]
    if unknown:
        raise HTTPException(400, f"Unknown order id(s): {', '.join(unknown)}")
    return csp.run_csp(set(req.selected_order_ids), req.partner_availability)


@app.get("/api/map")
def get_map():
    return {"nodes": [{"id": k, **v} for k, v in astar.NODES.items()],
            "roads": list(astar.EDGES.values()), "start": "WH"}


@app.post("/api/route")
def route(req: RouteRequest):
    dests = {k for k, v in astar.NODES.items() if v["kind"] == "destination"}
    if req.destination not in dests:
        raise HTTPException(400, f"Unknown destination '{req.destination}'.")
    bad = [r for r in req.blocked_roads if r not in astar.EDGES]
    if bad:
        raise HTTPException(400, f"Unknown road id(s): {', '.join(bad)}")
    result = astar.find_route("WH", req.destination, req.traffic, req.blocked_roads)
    edges = [{"id": e["id"], "cost": astar.edge_cost(e, req.traffic), "blocked": e["id"] in req.blocked_roads,
              "traffic_affected": e["busy"] and req.traffic != "Low"} for e in astar.EDGES.values()]
    name = astar.NODES[req.destination]["name"]
    if not result["found"]:
        return {"found": False, "message": f"No route to {name}: every path is blocked.", "path": [],
                "edge_ids": [], "cost": None, "segments": 0, "distance_km": None, "edges": edges,
                "explored": result["explored"]}
    segments = len(result["edge_ids"])
    return {**result, "segments": segments, "distance_km": astar.path_distance_km(result["edge_ids"]),
            "edges": edges, "message": f"Best route found through {segments} road segments."}


@app.post("/api/predict")
def predict(req: PredictRequest):
    minutes = prediction.predict_duration(req.distance_km, req.traffic, req.stops)
    depart = prediction.DEPARTURE_HOUR * 60
    return {"predicted_minutes": minutes, "departure": prediction.format_time(depart),
            "eta": prediction.format_time(depart + minutes), "traffic": req.traffic, "stops": req.stops,
            "distance_km": req.distance_km, "model": prediction.model_info(),
            "note": "ML estimate — trained on synthetic demonstration data; not live traffic data."}


@app.get("/api/astar/test")
def astar_test():
    return {"results": astar.run_cost_tests()}


# Serve the frontend from the same server too: http://127.0.0.1:8000
FRONTEND = Path(__file__).resolve().parent.parent / "frontend"
if FRONTEND.exists():
    app.mount("/", StaticFiles(directory=FRONTEND, html=True), name="frontend")
