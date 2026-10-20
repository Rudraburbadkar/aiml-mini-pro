# Intelligent Delivery Planner

A BE IT mini-project that combines three AI / ML ideas in one small logistics simulation:

1. **CSP (Constraint Satisfaction Problem)** – assigns delivery orders to partners with backtracking.
2. **A\* search** – finds the cheapest route through a simulated road network.
3. **Linear Regression** – predicts delivery duration from synthetic training data.

## Features
- **CSP Planner page:** select orders, toggle partner availability, run the assignment, see capacity use, simulated arrival times and truthful reasons for unassigned orders.
- **Route Simulation page:** SVG road map, traffic levels, blockable roads, A* route, ML duration prediction, animated delivery vehicle (start / pause / resume / reset) and an A* test panel.
- All algorithms run in the FastAPI backend; the frontend only calls the API and draws results.

## Technologies
HTML, CSS, vanilla JavaScript, SVG · Python, FastAPI, scikit-learn, NumPy. No database, no external APIs.

## Folder structure
```text
intelligent-delivery-planner/
├── frontend/   index.html, styles.css, app.js
├── backend/    main.py, csp.py, astar.py, prediction.py, requirements.txt
└── README.md
```

## Installation and running (Windows)
```bat
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
```
Then open **http://127.0.0.1:8000** – the backend also serves the frontend, so one command is enough.

Optional (frontend on a separate port, backend still running on 8000):
```bat
cd frontend
python -m http.server 5500
```
Open http://127.0.0.1:5500 (CORS is enabled for this).

## API endpoints
| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/health` | Server check |
| GET | `/api/orders` | Sample orders and partners |
| POST | `/api/csp/assign` | Run CSP backtracking |
| GET | `/api/map` | Road network nodes and roads |
| POST | `/api/route` | Run A* (destination, traffic, blocked roads) |
| POST | `/api/predict` | Linear Regression duration prediction |
| GET | `/api/astar/test` | Route A/B/C cost tests |

## Concepts in simple words
- **CSP:** a problem with *variables* (orders), *domains* (which partner, or none) and *constraints* (capacity, availability, deadline).
- **Backtracking:** try a partner for an order, go to the next order, and if that leads nowhere, undo the choice and try another. Urgent orders are tried first; branches that cannot beat the best solution so far are pruned. The best solution maximises priority points (Urgent 100, High 10, Normal 1), then the number of assigned orders.
- **Deadline check:** partners leave the Warehouse at a simulated 10:00, travel by A* travel time, spend 5 minutes per handover, and visit their orders in deadline order. An order is only "deadline met" if the simulated arrival is on time.
- **A\*:** expands the node with the lowest `f = g + h`, where `g` is the cost so far and `h` is the straight-line distance to the goal (scaled to the cost units). Because `h` never over-estimates, the route is the cheapest. Traffic raises edge costs; blocked roads are removed from the graph.
- **Linear Regression:** fits `duration = b0 + b1·distance + b2·traffic + b3·hour + b4·stops`. It is trained once at startup on 300 synthetic rows (fixed seed 42, 80/20 split) and evaluated with **MAE** on the test set. A* chooses the route; the model only predicts its duration.

## Limitations
- The ML data is synthetic and generated from a made-up formula, so predictions do **not** reflect real traffic or real delivery data. The MAE only measures how well the model learned that formula.
- The map, travel times and traffic multipliers are simulated. The departure time is fixed at 10:00.
- Each partner's orders are visited in deadline order (a simple rule, not a full route optimiser).
