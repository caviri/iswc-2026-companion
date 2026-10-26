// Desktop dashboard: the panel stack (pure, no DOM), the breakpoint / route rules and the row geometry.
// Unit-tested in tests/app/panels.test.mjs.
//
// A stack is { panels: [{ id, pinned, collapsed? }], focus: id | null }. Panels show side by side in this
// order, never over each other: the page simply gets wider and scrolls sideways. A collapsed panel keeps
// its place in the row as a narrow strip (thumbnail + rotated title); `collapsed` is only present when true.
// Trails: a link clicked inside a panel opens its target immediately to the right of that panel, and
// the unpinned panels that were to the right of it close (like history: you branched off). A link from
// the centre replaces the most recent unpinned panel (the rightmost), or is appended when every open
// panel is pinned. Pinned panels never close on their own. Star and pin are one concept.

export const DESKTOP_MIN = 1024;
export const DESKTOP_QUERY = `(min-width: ${DESKTOP_MIN}px)`;
export const PINNED_KEY = "iswc26:pinned";

/** True when a viewport this wide gets the dashboard shell. */
export const isDesktopWidth = (w) => Number.isFinite(w) && w >= DESKTOP_MIN;

export const emptyStack = () => ({ panels: [], focus: null });

const has = (st, id) => st.panels.some((p) => p.id === id);
const expanded = (p) => (p.collapsed ? { id: p.id, pinned: p.pinned } : p);
const withCollapsed = (p, on) => (on ? { ...p, collapsed: true } : expanded(p));

/** Most panels open at once; past it the leftmost unpinned panel closes. */
export const MAX_PANELS = 8;

/** Close the leftmost unpinned panels (never `keep`) until at most `max` remain. */
function capPanels(panels, max, keep) {
  const out = [...panels];
  while (out.length > max) {
    const i = out.findIndex((p) => !p.pinned && p.id !== keep);
    if (i < 0) break; // everything left is pinned: pins win over the cap
    out.splice(i, 1);
  }
  return out;
}

/**
 * Open `id` from `from`: a panel id (the link was inside that panel) or "centre".
 * Already open: only focus it. From a panel: insert right after it, closing the unpinned panels that
 * were to its right. From the centre (or a source that is no longer open): replace the rightmost
 * unpinned panel in place, else append.
 */
export function openPanel(st, id, { from = "centre", max = MAX_PANELS } = {}) {
  if (!id) return st;
  if (has(st, id)) return { panels: st.panels.map((p) => (p.id === id ? expanded(p) : p)), focus: id }; // and expand it
  const src = from && from !== "centre" ? st.panels.findIndex((p) => p.id === from) : -1;
  let panels;
  if (src >= 0) {
    panels = [...st.panels.slice(0, src + 1), { id, pinned: false }, ...st.panels.slice(src + 1).filter((p) => p.pinned)];
  } else {
    panels = [...st.panels];
    const i = panels.findLastIndex((p) => !p.pinned);
    if (i >= 0) panels[i] = { id, pinned: false }; else panels.push({ id, pinned: false });
  }
  return { panels: capPanels(panels, max, id), focus: id };
}

/** Pin `id`, opening it first when needed (a star on a row opens a pinned panel). */
export function pinPanel(st, id) {
  if (!id) return st;
  if (!has(st, id)) {
    // Appended, so the transient panel (if any) stays where it is.
    return { panels: [...st.panels, { id, pinned: true }], focus: id };
  }
  return { ...st, panels: st.panels.map((p) => (p.id === id ? { ...p, pinned: true } : p)) };
}

/** Unpin `id`: it stays open where it is, as part of the trail. */
export function unpinPanel(st, id) {
  if (!st.panels.some((p) => p.id === id && p.pinned)) return st;
  return { ...st, panels: st.panels.map((p) => (p.id === id ? { ...p, pinned: false } : p)) };
}

export const togglePin = (st, id) => (isPinned(st, id) ? unpinPanel(st, id) : pinPanel(st, id));
export const isPinned = (st, id) => st.panels.some((p) => p.id === id && p.pinned);

/** Close `id` (pinned or not). Focus moves to its left neighbour, else the new first panel. */
export function closePanel(st, id) {
  const i = st.panels.findIndex((p) => p.id === id);
  if (i < 0) return st;
  const panels = st.panels.filter((p) => p.id !== id);
  const focus = st.focus !== id ? st.focus : (panels[Math.max(0, i - 1)]?.id ?? null);
  return { panels, focus };
}

// ---- collapse / expand: the panel keeps its place in the row ----

export const isCollapsed = (st, id) => st.panels.some((p) => p.id === id && p.collapsed);
export const collapsedIds = (st) => st.panels.filter((p) => p.collapsed).map((p) => p.id);

/** Collapse (`on` true) or expand panel `id`. Unknown ids and no-ops return `st` itself. */
export function setCollapsed(st, id, on) {
  if (!st.panels.some((p) => p.id === id && !!p.collapsed !== !!on)) return st;
  return { ...st, panels: st.panels.map((p) => (p.id === id ? withCollapsed(p, on) : p)) };
}
export const toggleCollapsed = (st, id) => setCollapsed(st, id, !isCollapsed(st, id));

/** Collapse (`on` true) or expand every panel. */
export function setAllCollapsed(st, on) {
  if (!st.panels.some((p) => !!p.collapsed !== !!on)) return st;
  return { ...st, panels: st.panels.map((p) => withCollapsed(p, on)) };
}

/** What the workspace's "Collapse all / Expand all" button does now: "collapse" while any panel is open wide. */
export const bulkAction = (st) => (st.panels.some((p) => !p.collapsed) ? "collapse" : "expand");

/** The URL entries of a stack: [{ id, collapsed }]. */
export const panelEntries = (st) => st.panels.map((p) => ({ id: p.id, collapsed: !!p.collapsed }));

export const pinnedIds = (st) => st.panels.filter((p) => p.pinned).map((p) => p.id);
export const panelIds = (st) => st.panels.map((p) => p.id);

/**
 * Rebuild a stack from the URL's open ids (`collapsed`: the ones the URL marks collapsed) and the stored
 * pinned ids. Order: the URL's order (the trail),
 * then pinned ids the URL doesn't list. Unknown and duplicate ids are dropped; the cap applies.
 */
export function restoreStack({ urlIds = [], pinned = [], collapsed = [], isKnown = () => true, max = MAX_PANELS } = {}) {
  const pin = new Set(pinned.filter((id) => typeof id === "string" && isKnown(id)));
  const folded = new Set(collapsed);
  const seen = new Set();
  const panels = [];
  for (const id of [...urlIds, ...pin]) {
    if (typeof id !== "string" || !id || seen.has(id) || !isKnown(id)) continue;
    seen.add(id);
    panels.push(withCollapsed({ id, pinned: pin.has(id) }, folded.has(id)));
  }
  return { panels: capPanels(panels, max, null), focus: null };
}

/** The open panel `dir` steps (-1 left, +1 right) from `id`; null at either end. */
export function neighbourPanel(st, id, dir) {
  const i = st.panels.findIndex((p) => p.id === id);
  if (i < 0) return st.panels.length ? st.panels[dir < 0 ? 0 : st.panels.length - 1].id : null;
  return st.panels[i + dir]?.id ?? null;
}

// ---- workspace geometry: the centre and the panels sit side by side in one row ----
// The document scrolls sideways; the fixed sidebar covers its left `start` px, so what shows of the row
// is [scroll + start, scroll + end) in document coordinates (end = the viewport's width).

/** Left/right edges of row items of `widths`, the first at `origin`, `gap` apart. */
export function rowBoxes(widths, origin = 0, gap = 0) {
  const out = [];
  let x = origin;
  for (const w of widths) { out.push({ left: x, right: x + w }); x += w + gap; }
  return out;
}

/**
 * The scroll position that shows `box` ({left, right}, document coordinates) whole beside the sidebar,
 * moving as little as possible and keeping `gap` px of air; null when it already shows. A box wider than
 * the room shows its left part.
 */
export function revealScroll(box, { scroll = 0, start = 0, end, gap = 0, max = Infinity } = {}) {
  const room = end - start;
  let to = null;
  if (box.left - gap < scroll + start || box.right - box.left + 2 * gap > room) to = box.left - gap - start;
  else if (box.right + gap > scroll + end) to = box.right + gap - end;
  if (to == null) return null;
  to = Math.max(0, Math.min(max, to));
  return Math.abs(to - scroll) < 1 ? null : to;
}

/**
 * After a wheel rests at scroll `s`: the snap position (one of `points`, clamped to [0, max]) within
 * `within` px, nearest first; null when none is that close or the row is already on it.
 */
export function snapTarget(points, s, { within = 40, max = Infinity } = {}) {
  let best = null;
  for (const p of points) {
    const q = Math.max(0, Math.min(max, p));
    if (Math.abs(q - s) <= within && (best == null || Math.abs(q - s) < Math.abs(best - s))) best = q;
  }
  return best == null || Math.abs(best - s) < 1 ? null : best;
}

/**
 * The centre's width on the desktop row, in px, while panels are open: its natural reading width
 * clamp(560px, 50vw, 900px), or all the room the panels leave when that is more. When the row overflows
 * by less than one panel, the centre gives way instead, down to `min` px, so a single panel fits beside it
 * without sideways scrolling; more panels than that scroll.
 * vw: viewport width without scrollbars; side: sidebar width; panels: the tray's width; pw: one panel's width.
 */
export function centreWidth({ vw, side, panels, pw, min = 420 }) {
  const natural = Math.min(900, Math.max(560, vw * 0.5));
  const room = vw - side - panels;
  if (room >= natural) return room;
  if (natural - room < pw && room >= min) return room;
  return natural;
}

/**
 * Wheel axis latch for one gesture: the axis the gesture started on (`want`: "x" from wheelIntent, else
 * the page or a panel scrolled natively, "y") holds until the wheel has rested `idle` ms, so momentum at
 * the end of a panel's text never flips the row sideways; a fresh gesture decides again.
 * -> { axis: "x" | "y", at }
 */
export function latchAxis(prev, want, now, idle = 200) {
  const axis = prev && now - prev.at < idle ? prev.axis : (want === "x" ? "x" : "y");
  return { axis, at: now };
}

/**
 * What a vertical wheel does on the desktop workspace: "x" scrolls the whole row sideways, null leaves
 * it to the browser. `over`: "side" (the sidebar), "panel" (a panel, its bar, a collapsed strip or the
 * gaps between panels) or "centre". `inner`: an element under the pointer that can still scroll in the
 * wheel's direction (a panel's text, a list). `pageY`: the page itself can still scroll vertically that
 * way (only the centre uses it). `canX`: the row can move sideways that way.
 */
export function wheelIntent({ deltaX = 0, deltaY = 0, shiftKey = false, ctrlKey = false } = {}, { over = "centre", inner = false, pageY = false, canX = true } = {}) {
  if (ctrlKey || !deltaY || Math.abs(deltaX) >= Math.abs(deltaY) || !canX) return null; // zoom, or a native sideways gesture
  if (shiftKey) return "x";
  if (inner) return null; // never hijack mid-content: a scrolling panel or list keeps the wheel until its end
  if (over === "centre" && pageY) return null;
  return "x";
}

// ---- URL: the centre route lives in the hash, the open panels in its `panels` query param ----

const splitHash = (hash) => {
  const raw = String(hash ?? "").replace(/^#/, "");
  const q = raw.indexOf("?");
  return q < 0 ? [raw, ""] : [raw.slice(0, q), raw.slice(q + 1)];
};
const otherParams = (query) => query.split("&").filter((kv) => kv && !/^panels(=|$)/.test(kv));

/**
 * Panel entries from a `panels` param value ("a,b~,c": a trailing "~" marks a collapsed panel; ids are
 * slugs and never end in "~") -> [{ id, collapsed }].
 */
export function decodePanelEntries(value) {
  if (typeof value !== "string" || !value) return [];
  return value.split(",").map((s) => {
    const collapsed = s.endsWith("~");
    let id = "";
    try { id = decodeURIComponent(collapsed ? s.slice(0, -1) : s).trim(); } catch { /* malformed: dropped */ }
    return { id, collapsed };
  }).filter((e) => e.id);
}
/** Panel ids from a `panels` param value. */
export const decodePanels = (value) => decodePanelEntries(value).map((e) => e.id);
/** Ids or { id, collapsed } entries -> a `panels` param value. */
export const encodePanels = (list) => list.map((e) => (typeof e === "string" ? encodeURIComponent(e)
  : `${encodeURIComponent(e.id)}${e.collapsed ? "~" : ""}`)).join(",");

/** The hash without its `panels` param: what the centre column shows. "" -> "#/home". */
export function centreOf(hash) {
  const [path, query] = splitHash(hash);
  const rest = otherParams(query);
  return `#${path || "/home"}${rest.length ? `?${rest.join("&")}` : ""}`;
}

/** `hash` with its `panels` param set to `ids` (ids or { id, collapsed } entries; removed when empty). */
export function withPanels(hash, ids = []) {
  const [path, query] = splitHash(centreOf(hash));
  const rest = otherParams(query);
  if (ids.length) rest.push(`panels=${encodePanels(ids)}`);
  return `#${path}${rest.length ? `?${rest.join("&")}` : ""}`;
}

/**
 * What a parsed hash ({route, id, params} from model.parseHash) means on this layout:
 * { panel: id } opens a panel beside the centre (desktop: items, people and clusters, unless ?full=1),
 * { centre: true } renders the route in the centre column (always on mobile).
 */
export function routeIntent(parsed, desktop) {
  if (!desktop || parsed?.params?.full) return { centre: true };
  if ((parsed.route === "item" || parsed.route === "person") && parsed.id) return { panel: parsed.id };
  if (parsed.route === "explore" && parsed.params?.cluster) return { panel: parsed.params.cluster };
  return { centre: true };
}

/** Full-page link for a panel id of `kind` ("item" | "person" | "cluster"). */
export function fullPageHash(kind, id) {
  const e = encodeURIComponent(id);
  if (kind === "cluster") return `#/explore?cluster=${e}&full=1`;
  return `#/${kind === "person" ? "person" : "item"}/${e}?full=1`;
}

// ---- pinned ids in localStorage (a per-viewer convenience; never required) ----

export function loadPinned(storage = globalThis.localStorage) {
  try {
    const v = JSON.parse(storage?.getItem(PINNED_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string" && x) : [];
  } catch { return []; }
}
export function savePinned(ids, storage = globalThis.localStorage) {
  try { storage?.setItem(PINNED_KEY, JSON.stringify(ids)); return true; } catch { return false; }
}

// ---- the sidebar's rail mode (icons only), remembered per browser ----

export const RAIL_KEY = "iswc26:side-rail";
export function loadRail(storage = globalThis.localStorage) {
  try { return storage?.getItem(RAIL_KEY) === "1"; } catch { return false; }
}
export function saveRail(on, storage = globalThis.localStorage) {
  try { if (on) storage?.setItem(RAIL_KEY, "1"); else storage?.removeItem(RAIL_KEY); return true; } catch { return false; }
}
