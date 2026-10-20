// Frontend only draws the UI. All CSP / A* / ML work happens in the FastAPI backend.
const API = window.location.port === "8000" ? "" : "http://127.0.0.1:8000";
const $ = (id) => document.getElementById(id);
const SVG_NS = "http://www.w3.org/2000/svg";

/* ---------- helpers ---------- */
let toastTimer;
function showToast(msg) {
  const t = $("toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), 6000);
}
async function api(path, options) {
  let res;
  try { res = await fetch(API + path, options); }
  catch { throw new Error("Cannot reach the backend. Start it with: uvicorn main:app --reload (http://127.0.0.1:8000)"); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Request failed.");
  return data;
}
const post = (path, body) => api(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
async function withBusy(button, label, fn) {   // blocks double clicks while a request runs
  if (button.dataset.busy) return;
  button.dataset.busy = "1"; const old = button.textContent; button.disabled = true; button.textContent = label;
  try { await fn(); } catch (e) { showToast(e.message); }
  finally { delete button.dataset.busy; button.textContent = old; button.disabled = false; }
}
function el(name, attrs = {}, parent) {
  const e = document.createElementNS(SVG_NS, name);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}
const badge = (cls, text) => `<span class="badge b-${cls}">${text}</span>`;

/* ---------- page switcher ---------- */
function showPage() {
  const route = location.hash === "#route";
  $("page-csp").hidden = route; $("page-route").hidden = !route;
  $("nav-csp").classList.toggle("active", !route); $("nav-route").classList.toggle("active", route);
  if (route && !routeReady) initRoutePage();
}
window.addEventListener("hashchange", showPage);

/* =====================================================
   PAGE 1 : CSP PLANNER
   ===================================================== */
let orders = [], partners = [], selected = new Set(), availability = {}, cspResult = null, cspStale = false;

async function initCsp() {
  try {
    const data = await api("/api/orders");
    orders = data.orders; partners = data.partners; $("sim-start").textContent = data.simulated_start;
    resetCsp();
  } catch (e) { showToast(e.message); }
}
function resetCsp() {
  selected = new Set(orders.map((o) => o.id));
  availability = Object.fromEntries(partners.map((p) => [p.name, true]));
  cspResult = null; cspStale = false;
  $("csp-message").hidden = true; renderCsp();
}
function markCspStale() { if (cspResult) cspStale = true; renderCsp(); }

function renderCsp() {
  $("orders-body").innerHTML = orders.map((o) => `
    <tr class="${selected.has(o.id) ? "row-selected" : ""}">
      <td><input type="checkbox" data-order="${o.id}" ${selected.has(o.id) ? "checked" : ""} aria-label="Select ${o.id}"></td>
      <td><b>${o.id}</b></td><td>${o.destination}</td><td>${o.weight} kg</td>
      <td>${badge(o.priority.toLowerCase(), o.priority)}</td><td>${o.deadline}</td></tr>`).join("");
  const fresh = cspResult && !cspStale;
  $("partners-body").innerHTML = partners.map((p) => {
    const row = fresh ? cspResult.partners.find((r) => r.name === p.name) : null;
    const used = row ? row.used : null;
    return `<tr><td><b>${p.name}</b></td><td>${p.capacity} kg</td>
      <td>${row ? used + " kg" : "–"}<div class="bar"><i style="width:${row ? (used / p.capacity) * 100 : 0}%"></i></div></td>
      <td>${row ? row.remaining + " kg" : p.capacity + " kg"}</td>
      <td><label class="switch"><input type="checkbox" data-partner="${p.name}" ${availability[p.name] ? "checked" : ""}>
      ${availability[p.name] ? badge("assigned", "Available") : badge("unassigned", "Unavailable")}</label></td></tr>`;
  }).join("");
  $("st-total").textContent = orders.length;
  $("st-assigned").textContent = fresh ? cspResult.summary.assigned : "–";
  $("st-unassigned").textContent = fresh ? cspResult.summary.unassigned : "–";
  $("st-partners").textContent = partners.filter((p) => availability[p.name]).length;
  $("csp-stale").hidden = !cspStale;
  $("csp-results").classList.toggle("stale", !!cspStale);
  renderCspResults();
}
function renderCspResults() {
  if (!cspResult) {
    $("assigned-list").innerHTML = $("unassigned-list").innerHTML = '<li class="empty">No assignment run yet.</li>';
    return;
  }
  const a = cspResult.assignments, u = cspResult.unassigned;
  $("assigned-list").innerHTML = a.length ? a.map((x) => `
    <li class="${x.priority === "Urgent" ? "urgent" : ""}"><b>${x.order_id}</b> &middot; ${x.destination} &rarr; <b>${x.partner}</b>
    ${badge("assigned", "Assigned")} ${x.priority !== "Normal" ? badge(x.priority.toLowerCase(), x.priority) : ""}
    <div class="sub">Simulated arrival ${x.arrival} &middot; deadline ${x.deadline} &middot; ${x.deadline_met ? "deadline met" : "DEADLINE MISSED"}</div></li>`).join("")
    : '<li class="empty">No orders were assigned.</li>';
  $("unassigned-list").innerHTML = u.length ? u.map((x) => `
    <li class="fail ${x.priority === "Urgent" ? "urgent" : ""}"><b>${x.order_id}</b> &middot; ${x.destination} ${badge("unassigned", "Unassigned")}
    <div class="sub">${x.reason}</div></li>`).join("")
    : '<li class="empty">Every selected order was assigned.</li>';
}

$("orders-body").addEventListener("change", (e) => {
  const id = e.target.dataset.order; if (!id) return;
  e.target.checked ? selected.add(id) : selected.delete(id); markCspStale();
});
$("partners-body").addEventListener("change", (e) => {
  const name = e.target.dataset.partner; if (!name) return;
  availability[name] = e.target.checked; markCspStale();
});
$("btn-all").onclick = () => { selected = new Set(orders.map((o) => o.id)); markCspStale(); };
$("btn-clear").onclick = () => { selected.clear(); markCspStale(); };
$("btn-reset").onclick = resetCsp;
$("btn-run").onclick = () => {
  if (selected.size === 0) { showToast("Select at least one order before running the assignment."); return; }
  withBusy($("btn-run"), "Processing…", async () => {
    cspResult = await post("/api/csp/assign", { selected_order_ids: [...selected], partner_availability: availability });
    cspStale = false;
    const note = $("csp-message");
    note.hidden = false; note.className = "note " + (cspResult.summary.unassigned ? "warn" : "ok");
    note.textContent = cspResult.message + ` (Backtracking visited ${cspResult.nodes_explored} states.)`;
    renderCsp();
  });
};

/* =====================================================
   PAGE 2 : ROUTE SIMULATION
   ===================================================== */
let routeReady = false, mapData = null, nodeById = {}, roadEls = {}, blocked = new Set(), selectedRoad = null;
let routeFresh = false, lastRoute = null, routeLine = null, vehicle = null;
const anim = { pts: [], cum: [], total: 0, dist: 0, state: "idle", raf: 0, last: 0 };
const SPEED = 150; // SVG units per second

async function initRoutePage() {
  try {
    mapData = await api("/api/map");
    routeReady = true;
    mapData.nodes.forEach((n) => (nodeById[n.id] = n));
    $("sel-dest").innerHTML = mapData.nodes.filter((n) => n.kind === "destination").map((n) => `<option value="${n.id}">${n.name}</option>`).join("");
    $("sel-road").innerHTML = mapData.roads.map((r) => `<option value="${r.id}">${nodeById[r.a].name} – ${nodeById[r.b].name}</option>`).join("");
    selectedRoad = mapData.roads[0].id;
    drawMap(); renderBlocked(); updateRoadSelection();
    findRoute();
  } catch (e) { showToast(e.message); }
}

function drawMap() {
  const svg = $("map"); svg.innerHTML = "";
  const roadsG = el("g", {}, svg);
  mapData.roads.forEach((r) => {
    const a = nodeById[r.a], b = nodeById[r.b];
    const g = el("g", { class: "road" }, roadsG);
    const line = (cls, w) => el("line", { class: cls, x1: a.x, y1: a.y, x2: b.x, y2: b.y, "stroke-width": w }, g);
    line("road-outline", 18); line("road-fill", 13);
    el("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: "#fff", "stroke-width": 1.5, "stroke-dasharray": "6 8", opacity: 0.7 }, g);
    const hit = line("road-hit", 18); hit.addEventListener("click", () => selectRoad(r.id));
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const label = el("text", { class: "cost-label", x: mx, y: my - 11, "text-anchor": "middle" }, g);
    label.textContent = r.base_cost.toFixed(1);
    const mark = el("g", { transform: `translate(${mx},${my})`, visibility: "hidden", "pointer-events": "none" }, g);
    el("circle", { r: 9, fill: "#DC2626", stroke: "#fff", "stroke-width": 2 }, mark);
    el("path", { d: "M-4 -4 L4 4 M4 -4 L-4 4", stroke: "#fff", "stroke-width": 2.2, "stroke-linecap": "round" }, mark);
    roadEls[r.id] = { g, label, mark, base: r.base_cost };
  });
  routeLine = el("polyline", { class: "route-line", points: "", "pointer-events": "none" }, svg);
  mapData.nodes.forEach((n) => {
    const g = el("g", {}, svg);
    let dy = 28;
    if (n.kind === "junction") {
      el("circle", { cx: n.x, cy: n.y, r: 10, fill: "#fff", stroke: "#64748B", "stroke-width": 2.5 }, g);
      dy = 0;
      const t = el("text", { x: n.x, y: n.y + 3.5, "text-anchor": "middle", "font-size": 9, "font-weight": 700, fill: "#64748B" }, g); t.textContent = n.id;
    } else if (n.kind === "warehouse") {
      el("rect", { x: n.x - 17, y: n.y - 17, width: 34, height: 34, rx: 8, fill: "#2563EB", stroke: "#fff", "stroke-width": 3 }, g);
      el("path", { d: `M${n.x - 9} ${n.y + 8} V${n.y - 3} L${n.x} ${n.y - 10} L${n.x + 9} ${n.y - 3} V${n.y + 8} Z`, fill: "#fff" }, g);
    } else {
      el("circle", { cx: n.x, cy: n.y, r: 13, fill: "#fff", stroke: "#172554", "stroke-width": 3 }, g);
      el("circle", { cx: n.x, cy: n.y, r: 5, fill: "#0F766E" }, g);
      if (n.id === "BAK") dy = -22;
    }
    if (dy) {
      const w = n.name.length * 6.6 + 14;
      el("rect", { x: n.x - w / 2, y: n.y + dy - 12, width: w, height: 18, rx: 9, fill: "#fff", stroke: "#CBD5E1" }, g);
      const t = el("text", { class: "node-label", x: n.x, y: n.y + dy + 1, "text-anchor": "middle" }, g); t.textContent = n.name;
    }
  });
  vehicle = el("g", { "pointer-events": "none" }, svg);
  el("circle", { r: 15, fill: "#2563EB", stroke: "#fff", "stroke-width": 3 }, vehicle);
  el("rect", { x: -9, y: -5, width: 11, height: 9, rx: 1.5, fill: "#fff" }, vehicle);
  el("path", { d: "M2 -3 H6 L9 1 V4 H2 Z", fill: "#fff" }, vehicle);
  el("circle", { cx: -4, cy: 5, r: 2, fill: "#2563EB", stroke: "#fff", "stroke-width": 1 }, vehicle);
  el("circle", { cx: 5, cy: 5, r: 2, fill: "#2563EB", stroke: "#fff", "stroke-width": 1 }, vehicle);
  placeVehicle(nodeById.WH.x, nodeById.WH.y);
}
const placeVehicle = (x, y) => vehicle.setAttribute("transform", `translate(${x},${y})`);

function selectRoad(id) { selectedRoad = id; $("sel-road").value = id; updateRoadSelection(); }
function updateRoadSelection() {
  for (const id in roadEls) roadEls[id].g.classList.toggle("selected", id === selectedRoad);
}
function renderBlocked() {
  $("blocked-list").innerHTML = blocked.size
    ? [...blocked].map((id) => badge("blocked", "Blocked " + id)).join("")
    : '<span class="muted small">No roads blocked.</span>';
  for (const id in roadEls) roadEls[id].g.classList.toggle("blocked", blocked.has(id));
  for (const id in roadEls) roadEls[id].mark.setAttribute("visibility", blocked.has(id) ? "visible" : "hidden");
}

/* inputs changed -> old result is out of date */
function markRouteStale(msg = "Inputs changed — click Find Best Route to recalculate.") {
  stopAnimation(true);
  routeFresh = false;
  $("btn-start").disabled = true;
  routeLine.classList.add("stale");
  $("route-box").classList.add("stale"); $("pred-box").classList.add("stale");
  const note = $("map-note"); note.hidden = false; note.className = "note warn map-note"; note.textContent = msg;
}
["sel-dest", "sel-traffic", "in-stops"].forEach((id) => $(id).addEventListener("change", () => markRouteStale()));
$("sel-road").addEventListener("change", (e) => selectRoad(e.target.value));
$("btn-block").onclick = () => {
  blocked.has(selectedRoad) ? blocked.delete(selectedRoad) : blocked.add(selectedRoad);
  renderBlocked(); markRouteStale("Road status changed — click Find Best Route to recalculate.");
};

function getStops() {
  const v = parseInt($("in-stops").value, 10);
  const stops = Number.isNaN(v) ? 0 : Math.min(5, Math.max(0, v));
  $("in-stops").value = stops; return stops;
}

async function findRoute() {
  stopAnimation(true);
  await withBusy($("btn-find"), "Calculating…", async () => {
    const traffic = $("sel-traffic").value, stops = getStops();
    const r = await post("/api/route", { destination: $("sel-dest").value, traffic, blocked_roads: [...blocked] });
    lastRoute = r; routeFresh = r.found;
    // update road colours / costs from the backend result
    const inPath = new Set(r.edge_ids);
    r.edges.forEach((e) => {
      const els = roadEls[e.id];
      els.label.textContent = e.cost.toFixed(1);
      els.g.classList.toggle("traffic", e.traffic_affected && !e.blocked);
      els.g.classList.toggle("alt", r.found && !inPath.has(e.id));
    });
    routeLine.classList.remove("stale");
    routeLine.setAttribute("points", r.path.map((id) => `${nodeById[id].x},${nodeById[id].y}`).join(" "));
    $("map-note").hidden = true;
    $("route-box").classList.remove("stale"); $("pred-box").classList.remove("stale");
    $("btn-start").disabled = !r.found;
    setPausedUI("idle");
    const dest = nodeById[$("sel-dest").value].name;
    if (!r.found) {
      $("route-box").className = "info-box fail"; $("route-box").innerHTML = `<b>No route found</b><br>${r.message}`;
      $("pred-box").innerHTML = '<span class="muted">No prediction because there is no valid route.</span>';
      $("map-note").hidden = false; $("map-note").className = "note err map-note"; $("map-note").textContent = r.message;
      return;
    }
    $("route-box").className = "info-box";
    $("route-box").innerHTML = `<div style="margin-bottom:6px"><b>${r.message}</b></div>
      <div class="kv"><span>Destination</span><b>${dest}</b></div>
      <div class="kv"><span>Route cost (A*)</span><b>${r.cost} min-units</b></div>
      <div class="kv"><span>Road segments</span><b>${r.segments}</b></div>
      <div class="kv"><span>Distance</span><b>${r.distance_km} km</b></div>
      <div class="kv"><span>Nodes explored</span><b>${r.explored}</b></div>
      <div class="small muted" style="margin-top:6px">${r.path.join(" → ")}</div>`;
    const p = await post("/api/predict", { distance_km: r.distance_km, traffic, stops });
    $("pred-box").innerHTML = `<div class="big">${p.predicted_minutes} min</div>
      <div class="muted small" style="margin-bottom:6px">predicted delivery duration</div>
      <div class="kv"><span>Departure (simulated)</span><b>${p.departure}</b></div>
      <div class="kv"><span>Estimated arrival</span><b>${p.eta}</b></div>
      <div class="kv"><span>Traffic level</span><b>${p.traffic}</b></div>
      <div class="kv"><span>Number of stops</span><b>${p.stops}</b></div>
      <div class="kv"><span>Model MAE</span><b>${p.model.mae} min</b></div>
      <div class="small muted">Linear Regression, ${p.model.train_rows} train / ${p.model.test_rows} test rows</div>`;
  });
}
$("btn-find").onclick = findRoute;

/* ---------- vehicle animation (follows the returned path only) ---------- */
function setPausedUI(state) {
  anim.state = state;
  $("btn-pause").textContent = state === "paused" ? "Resume" : "Pause";
  $("btn-pause").disabled = !(state === "running" || state === "paused");
  $("btn-start").disabled = !routeFresh || state === "running" || state === "paused";
}
function stopAnimation(resetToWarehouse) {
  cancelAnimationFrame(anim.raf);
  if (resetToWarehouse && vehicle) placeVehicle(nodeById.WH.x, nodeById.WH.y);
  anim.dist = 0;
  if (anim.state !== "idle") setPausedUI("idle");
}
function pointAt(d) {
  let i = 1; while (i < anim.cum.length - 1 && anim.cum[i] < d) i++;
  const seg = anim.cum[i] - anim.cum[i - 1] || 1, t = Math.min(1, (d - anim.cum[i - 1]) / seg);
  const a = anim.pts[i - 1], b = anim.pts[i];
  return [a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t];
}
function tick(ts) {
  if (anim.state !== "running") return;
  anim.dist += ((ts - anim.last) / 1000) * SPEED; anim.last = ts;
  if (anim.dist >= anim.total) {
    const end = anim.pts[anim.pts.length - 1]; placeVehicle(end.x, end.y);
    setPausedUI("done"); $("btn-start").disabled = false;
    const note = $("map-note"); note.hidden = false; note.className = "note ok map-note"; note.textContent = "Delivery completed";
    return;
  }
  placeVehicle(...pointAt(anim.dist));
  anim.raf = requestAnimationFrame(tick);
}
$("btn-start").onclick = () => {
  if (!routeFresh || !lastRoute || !lastRoute.found) return;
  anim.pts = lastRoute.path.map((id) => nodeById[id]);
  anim.cum = [0];
  for (let i = 1; i < anim.pts.length; i++)
    anim.cum.push(anim.cum[i - 1] + Math.hypot(anim.pts[i].x - anim.pts[i - 1].x, anim.pts[i].y - anim.pts[i - 1].y));
  anim.total = anim.cum[anim.cum.length - 1]; anim.dist = 0;
  $("map-note").hidden = true; setPausedUI("running");
  anim.last = performance.now(); anim.raf = requestAnimationFrame(tick);
};
$("btn-pause").onclick = () => {
  if (anim.state === "running") { cancelAnimationFrame(anim.raf); setPausedUI("paused"); }
  else if (anim.state === "paused") { setPausedUI("running"); anim.last = performance.now(); anim.raf = requestAnimationFrame(tick); }
};
$("btn-rreset").onclick = () => {
  stopAnimation(true); $("map-note").hidden = true;
  blocked.clear(); renderBlocked();
  $("sel-traffic").value = "Low"; $("in-stops").value = 1; $("sel-dest").selectedIndex = 0;
  findRoute();
};

/* ---------- independent A* test ---------- */
$("btn-test").onclick = () => withBusy($("btn-test"), "Running…", async () => {
  const data = await api("/api/astar/test");
  $("test-results").innerHTML = data.results.map((r) => `<li class="${r.passed ? "" : "fail"}">
    <b>Case ${r.case}</b>: A=${r.costs.A}, B=${r.costs.B}, C=${r.costs.C}<br>
    A* selected <b>${r.selected}</b> (cost ${r.total_cost}) — ${r.passed ? "PASS" : "FAIL, expected " + r.expected}</li>`).join("");
});

/* ---------- start ---------- */
showPage();
initCsp();
