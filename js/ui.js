// Small DOM helpers shared by every view. Text is always set via textContent (no innerHTML of data).
import { createAutosave } from "./autosave.js";

/** h("div", {class: "x", onclick: fn, style: {...}}, child, "text", [more]) */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k.startsWith("--")) el.style.setProperty(k, v);
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (k in el && typeof v !== "string") el[k] = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  append(el, children);
  return el;
}

/**
 * The small type tag of an item (from model.js itemTag): a pill in the item's kind colour, plus
 * "Spotlight" for a spotlight paper. `cls` "row" makes it compact for lists. -> [Node] (empty without a tag).
 */
export function tagPill(tag, cls = "") {
  if (!tag) return [];
  const c = `kind-pill item-tag${cls ? " " + cls : ""}`;
  return [h("span", { class: c, "--kind": tag.color }, tag.label), tag.spotlight ? h("span", { class: `${c} spot`, "--kind": tag.color }, "Spotlight") : null].filter(Boolean);
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

const PATHS = {
  heart: "M12 20.5s-7.5-4.6-7.5-10.1A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.8c0 5.5-7.5 10.1-7.5 10.1z",
  x: "M6.5 6.5l11 11M17.5 6.5l-11 11",
  chevron: "M6.5 9.5l5.5 5.5 5.5-5.5",
  maybe: "M9.2 9.3a2.9 2.9 0 1 1 4.4 2.5c-.95.55-1.6 1.2-1.6 2.3v.6M12 18.2h.01",
  undo: "M9 7.5H4.5V3M4.8 7.3A8 8 0 1 1 4 12",
  note: "M5 19.5h3.5L19 9a2.5 2.5 0 0 0-3.5-3.5L5 16v3.5zM14 7l3.5 3.5",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7.5V12l3 2",
  pin: "M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11zM12 12.2a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4z",
  deck: "M7 4.5h10a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2zM8.5 2.5h7",
  mine: "M5.5 3.5h13v17l-6.5-4.5-6.5 4.5z",
  map: "M3.5 6.5l5.5-2.5 6 2.5 5.5-2.5v13.5l-5.5 2.5-6-2.5-5.5 2.5zM9 4v13.5M15 6.5V20",
  logistics: "M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M4.5 7h15a1 1 0 0 1 1 1v10.5a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1zM8 7v12.5M16 7v12.5",
  browse: "M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15zM16 16l5 5",
  filter: "M4 6.5h16M7 12h10M10 17.5h4",
  back: "M15 5l-7 7 7 7",
  layers: "M12 3.5l8.5 4.5-8.5 4.5L3.5 8zM3.5 12.5L12 17l8.5-4.5M3.5 16.5L12 21l8.5-4.5",
  github: "M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21",
  book: "M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5zM4 21.5A2.5 2.5 0 0 1 6.5 19H20M8 7h8M8 11h6",
  rete: "M5 6a2 2 0 1 0 0-.01M19 6a2 2 0 1 0 0-.01M12 18a2 2 0 1 0 0-.01M5 6l7 12M19 6l-7 12M5 6h14",
  grid: "M3.5 4.5h17v15h-17zM3.5 9h17M9 4.5v15M14.5 4.5v15",
  download: "M12 3.5v11M7.5 10l4.5 4.5 4.5-4.5M4.5 16.5v2.5a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-2.5",
  refresh: "M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5.5M12 7.6v.4",
  gear: "M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4zM19.4 13.5l1.6 1.2-1.8 3.1-1.9-.8a7 7 0 0 1-2 1.2l-.3 2h-3.6l-.3-2a7 7 0 0 1-2-1.2l-1.9.8-1.8-3.1 1.6-1.2a7 7 0 0 1 0-2.4L3.2 9.3 5 6.2l1.9.8a7 7 0 0 1 2-1.2l.3-2h3.6l.3 2a7 7 0 0 1 2 1.2l1.9-.8 1.8 3.1-1.6 1.2a7 7 0 0 1 0 2.4z",
  flask: "M9 3h6M10 3v6.2L4.6 18.6A1.6 1.6 0 0 0 6 21h12a1.6 1.6 0 0 0 1.4-2.4L14 9.2V3M7.2 14.5h9.6",
  people: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.3a3.5 3.5 0 0 1 0 6.4M18 14.5a6.5 6.5 0 0 1 3.5 5.5",
  link: "M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1",
  check: "M5 12.5l4.5 4.5L19 7.5",
  orcid: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8.5 8v8M8.5 8h.01M12 8v8h1.5a3.5 4 0 0 0 0-8z",
  dblp: "M4.5 5.5h15v4h-15zM4.5 11h15v4h-15zM4.5 16.5h9v3h-9z",
  openalex: "M12 3.5l8 4.5v8l-8 4.5-8-4.5V8zM12 12l8-4M12 12L4 8M12 12v8.5",
  home: "M4 11l8-7 8 7M6 9.5V20h12V9.5M10 20v-5h4v5",
  doi: "M5 4.5h14v15H5zM8.5 9h7M8.5 12.5h7M8.5 16h4",
  doc: "M7 3.5h7l4 4V20.5H7zM14 3.5v4h4M9.5 12.5h6M9.5 16h6",
  pdf: "M7 3.5h7l4 4V20.5H7zM14 3.5v4h4M9.5 15.5h5",
  dataset: "M12 8.5c4.4 0 7.5-1.2 7.5-2.7S16.400 3 12 3 4.500 4.300 4.500 5.800 7.600 8.500 12 8.500zM4.500 5.800v12.400C4.500 19.700 7.600 21 12 21s7.500-1.300 7.500-2.800V5.800M4.500 12c0 1.500 3.100 2.700 7.500 2.700s7.500-1.200 7.500-2.700",
  code: "M8.5 7L3.500 12l5 5M15.500 7l5 5-5 5M13.500 5l-3 14",
  search: "M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15zM16 16l5 5",
  external: "M14 4.5h5.500V10M19.500 4.500L11 13M17 14v5H5V7h5",
  play: "M8 5.5v13l10.5-6.5z",
  pause: "M8.5 5.5v13M15.5 5.5v13",
  star: "M12 3.5l2.6 5.3 5.9.9-4.25 4.1 1 5.85L12 16.9l-5.25 2.75 1-5.85L3.5 9.7l5.9-.9z",
  expand: "M14 4.5h5.5V10M10 19.5H4.5V14M19.5 4.5l-6 6M4.5 19.5l6-6",
  fold: "M11 5.5L4.5 12l6.5 6.5M19.5 5.5L13 12l6.5 6.5",
  unfold: "M13 5.5l6.5 6.5-6.5 6.5M4.5 5.5L11 12l-6.5 6.5",
  sidebar: "M4.5 4.5h15v15h-15zM9.5 4.5v15",
  shrink: "M3.5 12H10M7 8.5l3.5 3.5L7 15.5M20.5 12H14M17 8.5L13.5 12l3.5 3.5",
  grow: "M10 12H3.5M6.5 8.5L3 12l3.5 3.5M14 12h6.5M17.5 8.5L21 12l-3.5 3.5",
  hf: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8.5 14.5a4.5 4.5 0 0 0 7 0M9 10h.01M15 10h.01",
  scholar: "M2.5 9.5L12 5l9.5 4.5L12 14zM6.5 11.5v4.5c0 1.4 2.5 3 5.5 3s5.5-1.6 5.5-3v-4.5M21.5 9.5v5",
  graph: "M8 6.6l8-.9M7 8.9l4 7.3M17 7.9l-4 8.3M6 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM12 20.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  explore: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM15.8 8.2l-2.3 5.3-5.3 2.3 2.3-5.3z",
  bari: "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8",
  more: "M4.5 4.5h6v6h-6zM13.5 4.5h6v6h-6zM4.5 13.5h6v6h-6zM13.5 13.5h6v6h-6z",
  ticket: "M3.5 7.5h17v3a1.5 1.5 0 0 0 0 3v3h-17v-3a1.5 1.5 0 0 0 0-3zM14.5 7.5v9",
  walk: "M13 4.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM9.5 21l2.5-6.5 3 3V21M8 11l2-4 3.5 1 2 3.5 2.5.5M12 14.5l-1.5-4",
  train: "M7 3.5h10a2 2 0 0 1 2 2v9a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3v-9a2 2 0 0 1 2-2zM5 10.5h14M9 14.5h.01M15 14.5h.01M8.5 17.5L6.5 21M15.5 17.5l2 3.5",
};

/** Header link to the SPARQL explorer (phones; the desktop sidebar has its own entry). */
export function sparqlEntry(text = "SPARQL") {
  return h("a", { class: "sq-entry", href: "#/sparql" }, icon("code", { size: 18 }), h("span", {}, text));
}

/** Inline stroke icon. Filled variant for heart when `fill` is true. */
export function icon(name, { fill = false, size = 24 } = {}) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", size);
  svg.setAttribute("height", size);
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", "icon");
  const p = document.createElementNS(ns, "path");
  p.setAttribute("d", PATHS[name] ?? "");
  p.setAttribute("fill", fill ? "currentColor" : "none");
  p.setAttribute("stroke", "currentColor");
  p.setAttribute("stroke-width", "2");
  p.setAttribute("stroke-linecap", "round");
  p.setAttribute("stroke-linejoin", "round");
  svg.append(p);
  return svg;
}

export const reducedMotion = () => globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

/**
 * Bottom sheet. Returns { el, body, close }. `onClose` runs once after dismissal
 * (backdrop tap, Escape, or close()).
 */
export function openSheet({ title, label = title, onClose } = {}) {
  const body = h("div", { class: "sheet-body" });
  const panel = h("div", { class: "sheet", role: "dialog", "aria-modal": "true", "aria-label": label },
    h("div", { class: "sheet-grip", "aria-hidden": "true" }),
    title ? h("h2", { class: "sheet-title" }, title) : null,
    body);
  const scrim = h("div", { class: "sheet-scrim" });
  const wrap = h("div", { class: "sheet-wrap" }, scrim, panel);
  const prevFocus = document.activeElement;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener("keydown", onKey, true);
    wrap.classList.remove("open");
    const done = () => { wrap.remove(); prevFocus?.focus?.({ preventScroll: true }); };
    if (reducedMotion()) done(); else setTimeout(done, 220);
    onClose?.();
  };
  const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); } };
  scrim.addEventListener("click", close);
  document.addEventListener("keydown", onKey, true);
  window.addEventListener("hashchange", close, { once: true });
  document.body.append(wrap);
  requestAnimationFrame(() => wrap.classList.add("open"));
  return { el: panel, body, close };
}

let endToast = null;
let toastTimer = null;
/** Single transient message at the bottom, with an optional action button. */
export function toast(message, { action, onAction, ms = 5000 } = {}) {
  endToast?.(true);
  const el = h("div", { class: "toast", role: "status" },
    h("span", {}, message),
    action ? h("button", { class: "toast-action", type: "button", onclick: () => { end(true); onAction?.(); } }, action) : null);
  // A press anywhere else (or Escape) puts it away; that press still does what it was for.
  const away = (e) => { if (!el.contains(e.target)) end(); };
  const esc = (e) => { if (e.key === "Escape") end(); };
  const end = (now = false) => {
    if (endToast !== end) return;
    endToast = null;
    clearTimeout(toastTimer);
    document.removeEventListener("pointerdown", away, true);
    document.removeEventListener("keydown", esc, true);
    if (now) { el.remove(); return; }
    el.classList.remove("show");
    setTimeout(() => el.remove(), 250);
  };
  endToast = end;
  document.body.append(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => { if (endToast === end) { document.addEventListener("pointerdown", away, true); document.addEventListener("keydown", esc, true); } }, 0);
  toastTimer = setTimeout(() => end(), ms);
  return el;
}

/**
 * Textarea that saves to store.setNote as you type (debounced) and on blur.
 * Returns a wrapper (textarea + status line). wrapper.flush() saves now; wrapper.dispose() saves and
 * removes the pagehide/visibilitychange listeners (call it when the sheet or view goes away).
 */
export function noteEditor(store, id, { autofocus = false, placeholder = "Your note: why it matters, who to meet, questions to ask" } = {}) {
  const status = h("span", { class: "note-status", "aria-live": "polite" }, store.note(id) ? "Saved" : "");
  const ta = h("textarea", { class: "note-input", rows: 5, placeholder, "aria-label": "Note" });
  ta.value = store.note(id);
  const save = () => {
    if (ta.value === store.note(id) && !ta.value) return;
    store.setNote(id, ta.value.trim() ? ta.value : "");
    status.textContent = ta.value.trim() ? (store.persistent ? "Saved" : "Saved for this visit") : "";
  };
  // Debounced; flushed on blur, pagehide and visibilitychange->hidden so backgrounding never loses text.
  const auto = createAutosave(save);
  ta.addEventListener("input", () => { status.textContent = "Saving…"; auto.schedule(); });
  ta.addEventListener("blur", () => auto.flush());
  if (autofocus) setTimeout(() => ta.focus({ preventScroll: true }), 60);
  const wrap = h("div", { class: "note-editor" }, ta, status);
  wrap.flush = () => auto.flush();
  wrap.dispose = () => auto.dispose();
  return wrap;
}
