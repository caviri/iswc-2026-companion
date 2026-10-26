// Floor map: JPEG plans per floor, room highlight, pinch/pan/double-tap zoom, and today's sessions in the selected room.
import { h, icon, reducedMotion } from "../ui.js";
import { romeNow } from "../time.js";
import { dayLong, floorLabel, timeRange } from "../model.js";
import { replaceRoute } from "../route-state.js";
import { FLOORS, MAX_SCALE, clampView, zoomAt, pinchView, focusView, defaultFloor, roomSessions } from "../mapmath.js";

const FILE = { "-1": "floor-m1.jpg", 1: "floor-1.jpg", 2: "floor-2.jpg" };
const RATIO = { "floor-m1.jpg": [2000, 1414], "floor-1.jpg": [2000, 1294], "floor-2.jpg": [2000, 1294] };
const TAP_SLOP = 8, DOUBLE_MS = 320, DOUBLE_PX = 30;
const IDENTITY = { scale: 1, x: 0, y: 0 };

const pct = (v) => `${(v * 100).toFixed(3)}%`;
const hrefFor = (room, floor) => `#/map?${room ? `room=${encodeURIComponent(room.id)}` : `floor=${floor}`}`;
const floorName = (f) => (f < 0 ? "−1" : String(f));
const onFloor = (r, floor) => r.floor === floor && r.box && r.map === FILE[floor];
const area = (b) => b.w * b.h;
const contains = (a, b) => b.x >= a.x - 2e-3 && b.y >= a.y - 2e-3 && b.x + b.w <= a.x + a.w + 2e-3 && b.y + b.h <= a.y + a.h + 2e-3;

/**
 * Small, static floor plan with `room` outlined (desktop panels), linking to the full map; null when the
 * room has no outline on a known plan.
 */
export function miniMap(room) {
  const file = room?.box && room.map;
  if (!file || !RATIO[file] || room.map !== FILE[room.floor]) return null;
  const [w, hh] = RATIO[file];
  const b = room.box;
  // A 16:9 window onto the plan, zoomed so the room sits in the middle with its surroundings around it.
  const fit = (9 * w) / (16 * hh); // window height / plan height, at scale 1
  const s = Math.min(3.2, Math.max(1.25, Math.min(0.42 / b.w, (0.42 * fit) / b.h)));
  const clamp = (v, lo) => Math.min(0, Math.max(lo, v));
  const tx = clamp(0.5 - s * (b.x + b.w / 2), 1 - s);
  const ty = clamp(fit / 2 - s * (b.y + b.h / 2), fit - s);
  return h("a", { class: "mini-map", href: `#/map?room=${encodeURIComponent(room.id)}`, "aria-label": `${room.name} on the ${floorLabel(room.floor)} plan: open the map` },
    h("span", { class: "mini-plane", style: `aspect-ratio:${w} / ${hh};transform:translate(${(tx * 100).toFixed(3)}%, ${((ty * 100) / 1).toFixed(3)}%) scale(${s.toFixed(3)});--inv:${(1 / s).toFixed(3)}` },
      h("img", { class: "map-img", src: `maps/${file}`, alt: "", draggable: "false", decoding: "async", loading: "lazy" }),
      h("span", { class: "mini-room", style: `left:${pct(b.x)};top:${pct(b.y)};width:${pct(b.w)};height:${pct(b.h)}` })),
    h("span", { class: "mini-label" }, floorLabel(room.floor)));
}

/** renderMap(root, program, { roomId, floor }) -> cleanup() */
export function renderMap(root, program, { roomId = null, floor = null, now = () => romeNow() } = {}) {
  const rooms = program.rooms;
  let room = roomId ? rooms.find((r) => r.id === roomId) ?? null : null; // ids that are not rooms are ignored
  let curFloor = defaultFloor(room, Number.isFinite(floor) ? floor : null);
  let view = { ...IDENTITY };
  const ratios = { ...RATIO };

  // A "union" room's box contains the boxes of other rooms (e.g. Sezione 3+4). It is not drawn on the plan
  // (it would sit on top of its parts) unless selected, and is reachable from the chips.
  const isUnion = (r) => !!r.box && rooms.filter((o) => o !== r && o.floor === r.floor && o.box && contains(r.box, o.box)).length >= 2;
  const rects = new Map(); // room id -> element, for the floor on screen
  let imgEl = null;
  const viewport = h("div", { class: "map-viewport" });
  const plane = h("div", { class: "map-plane" });
  const status = h("p", { class: "map-status", "aria-live": "polite" });
  const resetBtn = h("button", { type: "button", class: "map-reset", "aria-label": "Reset zoom", onclick: () => setView({ ...IDENTITY }) }, icon("layers", { size: 18 }), "Reset");
  const seg = h("div", { class: "seg map-floors", role: "group", "aria-label": "Floor" });
  const chipsBox = h("div", { class: "map-chips" });
  const cardBox = h("div", { class: "map-card-box" });
  viewport.append(plane, resetBtn);

  const size = () => ({ w: viewport.clientWidth || 1, h: viewport.clientHeight || 1 });

  function setView(v, animate = true) {
    const { w, h: hh } = size();
    view = clampView(v, w, hh);
    plane.style.transition = animate && !reducedMotion() ? "transform .22s ease" : "none";
    plane.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
    plane.style.setProperty("--inv", String(1 / view.scale));
    viewport.style.touchAction = view.scale > 1.001 ? "none" : "pan-y";
    resetBtn.hidden = view.scale <= 1.001;
  }

  function writeHash() {
    replaceRoute(hrefFor(room, curFloor));
  }

  function select(r, { focus = false } = {}) {
    room = r;
    const floorChanged = !!r && r.floor !== curFloor && FLOORS.includes(r.floor);
    if (floorChanged) curFloor = r.floor;
    writeHash();
    if (floorChanged) drawAll(); else { updateSel(); drawChips(); drawCard(); }
    if (focus && r?.box) setView(focusView(r.box, size().w, size().h)); else if (!r?.box || r.floor !== curFloor) setView({ ...IDENTITY }, false);
  }

  function setFloor(f) {
    if (f === curFloor) return;
    curFloor = f;
    if (room && room.floor !== f) room = null;
    writeHash();
    drawAll();
    setView({ ...IDENTITY }, false);
  }

  function drawSeg() {
    seg.replaceChildren(...FLOORS.map((f) => h("button", {
      type: "button", class: "seg-btn", "aria-pressed": String(f === curFloor), "aria-label": floorLabel(f),
      onclick: () => setFloor(f),
    }, floorName(f))));
  }

  function drawPlane() { // only on floor change: the <img> and rects then stay put while selection changes
    const file = FILE[curFloor];
    const [iw, ih] = ratios[file];
    viewport.style.aspectRatio = `${iw} / ${ih}`;
    imgEl = h("img", { class: "map-img", src: `maps/${file}`, alt: `${floorLabel(curFloor)} plan of the Nicolaus Hotel`, draggable: "false", decoding: "async" });
    rects.clear();
    for (const r of rooms.filter((r) => onFloor(r, curFloor))) {
      const z = String(Math.round((1 - area(r.box)) * 100)); // smaller rooms on top
      rects.set(r.id, h("div", {
        class: "map-room" + (isUnion(r) ? " union" : ""), "data-room": r.id, "data-z": z,
        style: `left:${pct(r.box.x)};top:${pct(r.box.y)};width:${pct(r.box.w)};height:${pct(r.box.h)};z-index:${z}`,
      }));
    }
    plane.replaceChildren(imgEl, ...rects.values());
    updateSel();
  }

  function updateSel() {
    for (const [id, el] of rects) {
      const on = room?.id === id;
      el.classList.toggle("sel", on);
      el.style.zIndex = on ? "200" : el.dataset.z;
    }
  }

  function drawChips() {
    const named = rooms.filter((r) => r.floor == null || (r.floor === curFloor && (!onFloor(r, curFloor) || isUnion(r))));
    if (!named.length) { chipsBox.replaceChildren(); return; }
    chipsBox.replaceChildren(
      h("h2", { class: "map-sub" }, "Other rooms"),
      h("div", { class: "chip-wrap" }, named.map((r) => h("button", {
        type: "button", class: "chip", "aria-pressed": String(r === room),
        onclick: () => select(r),
      }, r.name))));
  }

  function drawCard() {
    if (!room) {
      status.textContent = "";
      cardBox.replaceChildren(h("p", { class: "map-hint" }, "Tap a room on the plan, or open a session and choose Show on map."));
      return;
    }
    const where = room.floor == null ? "floor not on the plans" : floorLabel(room.floor);
    const unplaced = room.floor == null ? "" : !room.box ? `${room.name} · ${where}, not outlined on the plan` : "";
    const today = now().slice(0, 10);
    const rs = roomSessions(program, room.id, today);
    status.textContent = `${room.name}, ${where}`;
    cardBox.replaceChildren(h("article", { class: "map-card" },
      h("h2", { class: "map-card-title" }, `${room.name} · ${where}`),
      unplaced ? h("p", { class: "map-note" }, unplaced) : null,
      h("p", { class: "map-card-sub" }, rs.day ? (rs.isToday ? "Today" : dayLong(rs.day)) : "No sessions listed in this room"),
      rs.sessions.length ? h("ul", { class: "row-list" }, rs.sessions.map((s) => h("li", {},
        h("a", { class: "row-link", href: `#/item/${encodeURIComponent(s.id)}` },
          h("span", { class: "map-time" }, s.start),
          h("span", {}, h("span", { class: "row-title" }, s.title), h("span", { class: "row-meta" }, timeRange(s)))))))
        : null));
  }

  function drawAll() { drawSeg(); drawPlane(); drawChips(); drawCard(); }

  // ---- gestures: pointer events on the viewport
  const ptrs = new Map();
  let drag = null, pinch = null, lastTap = null, moved = false;

  const local = (e) => { const b = viewport.getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top }; };
  const pair = () => { const [a, b] = pinch.ids.map((id) => ptrs.get(id)); return { dist: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 }; };

  function hit(p) {
    const { w, h: hh } = size();
    const nx = (p.x - view.x) / view.scale / w, ny = (p.y - view.y) / view.scale / hh;
    return rooms.filter((r) => onFloor(r, curFloor) && !isUnion(r) && nx >= r.box.x && nx <= r.box.x + r.box.w && ny >= r.box.y && ny <= r.box.y + r.box.h)
      .sort((a, b) => area(a.box) - area(b.box))[0] ?? null;
  }

  function onDown(e) {
    if (e.target.closest(".map-reset")) return;
    try { viewport.setPointerCapture(e.pointerId); } catch { /* synthetic events */ }
    ptrs.set(e.pointerId, local(e));
    if (ptrs.size === 1) { moved = false; drag = { id: e.pointerId, p0: local(e), v0: { ...view } }; }
    else if (!pinch) { // the first two fingers form the pinch; extra fingers are ignored
      const ids = [...ptrs.keys()].slice(0, 2);
      drag = null; moved = true; pinch = { ids, v0: { ...view } }; pinch.s = pair();
    }
  }
  function onMove(e) {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.set(e.pointerId, local(e));
    const { w, h: hh } = size();
    if (pinch) { if (pinch.ids.includes(e.pointerId)) setView(pinchView(pinch.v0, pinch.s, pair(), w, hh), false); return; }
    if (drag && drag.id === e.pointerId) {
      const p = local(e), dx = p.x - drag.p0.x, dy = p.y - drag.p0.y;
      if (!moved && Math.hypot(dx, dy) > TAP_SLOP) moved = true;
      if (moved && view.scale > 1.001) setView({ ...drag.v0, x: drag.v0.x + dx, y: drag.v0.y + dy }, false);
    }
  }
  function onUp(e) {
    if (!ptrs.delete(e.pointerId)) return;
    if (pinch) { if (pinch.ids.includes(e.pointerId)) { pinch = null; drag = null; moved = true; } return; }
    const wasTap = drag && drag.id === e.pointerId && !moved && e.type === "pointerup";
    drag = null;
    if (!wasTap) return;
    const p = local(e), t = Date.now();
    if (lastTap && t - lastTap.t < DOUBLE_MS && Math.hypot(p.x - lastTap.x, p.y - lastTap.y) < DOUBLE_PX) {
      lastTap = null;
      const { w, h: hh } = size();
      setView(view.scale > 1.001 ? { ...IDENTITY } : zoomAt(view, Math.min(2.5, MAX_SCALE), p.x, p.y, w, hh));
      return;
    }
    lastTap = { t, x: p.x, y: p.y };
    const r = hit(p);
    if (r) select(r);
  }
  const onWheel = (e) => {
    if (!e.ctrlKey && view.scale <= 1.001) return; // plain wheel at 1x scrolls the page
    e.preventDefault();
    const p = local(e), { w, h: hh } = size();
    setView(zoomAt(view, Math.exp(-e.deltaY * 0.01), p.x, p.y, w, hh), false);
  };

  viewport.addEventListener("pointerdown", onDown);
  viewport.addEventListener("pointermove", onMove);
  viewport.addEventListener("pointerup", onUp);
  viewport.addEventListener("pointercancel", onUp);
  viewport.addEventListener("lostpointercapture", onUp);
  viewport.addEventListener("wheel", onWheel, { passive: false });

  root.replaceChildren(h("section", { class: "view map-view" },
    h("h1", { class: "view-title" }, "Map"), seg, viewport, status, chipsBox, cardBox));
  drawAll();
  setView(room?.box && room.floor === curFloor ? focusView(room.box, size().w, size().h) : { ...IDENTITY }, false);

  // Real plan sizes (maps.json is precached); re-fit if they differ from the built-in ones.
  let alive = true;
  fetch("maps/maps.json").then((r) => r.json()).then((j) => {
    if (!alive) return;
    let changed = false;
    for (const [k, v] of Object.entries(j)) if (Array.isArray(v) && v[0] > 0 && v[1] > 0 && (ratios[k]?.[0] !== v[0] || ratios[k]?.[1] !== v[1])) { ratios[k] = v; changed = true; }
    if (changed) { drawPlane(); setView(view, false); }
  }).catch(() => { /* built-in sizes are fine */ });
  const onResize = () => setView(view, false);
  window.addEventListener("resize", onResize);

  return () => { alive = false; window.removeEventListener("resize", onResize); };
}
