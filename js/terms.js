// Technology terms: find glossary terms inside text, and the popover that explains them.
// `segments`, `placePopover`, `termTopic`, `termColorVar` and `legendModel` are pure (unit-tested in
// tests/app/terms.test.mjs); the rest touches the DOM.
//
// Colour: a marked term is bold and takes the colour of its glossary `category` (a programme topic) from
// the topic swatches (--tp-*, the same colour Explore and the thumbnails give that topic). A legend under
// the text names the topics present. CSS darkens the swatch for text in light mode (.term, app.css).
import { h, icon } from "./ui.js";
import { topicSwatch } from "./explore-model.js";

// ---- matching ----------------------------------------------------------------------------

const GUTTER = 16;
const esc = (c) => c.replace(/[\\^$.*+?()[\]{}|\-/]/g, "\\$&");
const compiled = new WeakMap(); // glossary object -> Map(termId -> RegExp | null)

/** A token keeps its case when it reads as an acronym or camel-case name (RDF, GraphRAG, ShEx); words fold case. */
const exactToken = (t) => /\p{Lu}/u.test(t.slice(1)) || (t.length > 1 && t === t.toUpperCase() && /\p{Lu}/u.test(t));

function tokenRx(tok, exact) {
  return [...tok].map((c) => {
    const lo = c.toLowerCase(), up = c.toUpperCase();
    return exact || lo === up ? esc(c) : `[${esc(lo)}${esc(up)}]`;
  }).join("");
}

/** One phrase -> regex source. A space or hyphen may be absent; plural allowed; `exact` keeps case. */
function phraseRx(phrase, exact) {
  const base = String(phrase ?? "").replace(/\s*\([^)]*\)/g, " ").trim(); // "Decentralised data (Solid)" -> "Decentralised data"
  const toks = base.split(/[\s-]+/).filter(Boolean);
  if (!toks.length) return null;
  return toks.map((t, i) => {
    const last = i === toks.length - 1;
    if (last && !exact && /y$/i.test(t) && t.length > 2) return `${tokenRx(t.slice(0, -1), false)}(?:[Yy](?:[Ss])?|[Ii][Ee][Ss])`;
    return tokenRx(t, exact) + (last ? (exact ? "(?:s)?" : "(?:[Ss]|[Ee][Ss])?") : "");
  }).join("[\\s\\-]?");
}

/**
 * Glossary entry -> RegExp (u flag) or null. Matches the term and its aliases at letter boundaries.
 * With `caseSensitive` true, every phrase containing an uppercase letter must match case exactly and
 * all-lowercase phrases fold case (the pipeline's rule). Data without the flag (older program.json)
 * falls back to a guess from the display name: acronym/camel-case names are exact, words fold.
 */
export function termRegex(entry) {
  const e = typeof entry === "string" ? { term: entry } : entry ?? {};
  const phrases = [e.term, ...(Array.isArray(e.aliases) ? e.aliases : [])].filter((p) => typeof p === "string" && p.trim());
  if (!phrases.length) return null;
  const flagged = typeof e.caseSensitive === "boolean";
  const parts = [];
  for (const p of phrases) {
    const exact = flagged
      ? e.caseSensitive && p !== p.toLowerCase()
      : p === phrases[0] && String(p).replace(/\s*\([^)]*\)/g, "").split(/[\s-]+/).some(exactToken);
    const rx = phraseRx(p, exact);
    if (rx) parts.push([p.length, rx]);
  }
  if (!parts.length) return null;
  parts.sort((x, y) => y[0] - x[0]);
  return new RegExp(`(?<![\\p{L}])(?:${parts.map((x) => x[1]).join("|")})(?![\\p{L}])`, "gu");
}

function regexFor(glossary, id) {
  let m = compiled.get(glossary);
  if (!m) compiled.set(glossary, (m = new Map()));
  if (!m.has(id)) m.set(id, termRegex(glossary[id]));
  return m.get(id);
}

/**
 * Split `text` into [{text, termId|null}] segments. Only terms in `termIds` (the item's own terms; default:
 * the whole glossary) are marked; longest match wins, and each term is marked once per text. Text without
 * a glossary (older data) comes back as one plain segment.
 */
export function segments(text, program, termIds = null) {
  const s = String(text ?? "");
  const glossary = program?.glossary;
  if (!s || !glossary || typeof glossary !== "object") return s ? [{ text: s, termId: null }] : [];
  const ids = (termIds ?? Object.keys(glossary)).filter((id) => glossary[id]);
  const found = [];
  for (const id of ids) {
    const rx = regexFor(glossary, id);
    if (rx) for (const m of s.matchAll(rx)) found.push({ id, start: m.index, end: m.index + m[0].length });
  }
  // Longest first; a shorter term never claims text a longer one already covers, and each term is taken once.
  found.sort((a, b) => (b.end - b.start) - (a.end - a.start) || a.start - b.start);
  const taken = [];
  const used = new Set();
  for (const f of found) {
    if (used.has(f.id) || taken.some((t) => f.start < t.end && t.start < f.end)) continue;
    used.add(f.id);
    taken.push(f);
  }
  taken.sort((a, b) => a.start - b.start);
  const out = [];
  let at = 0;
  for (const t of taken) {
    if (t.start > at) out.push({ text: s.slice(at, t.start), termId: null });
    out.push({ text: s.slice(t.start, t.end), termId: t.id });
    at = t.end;
  }
  if (at < s.length) out.push({ text: s.slice(at), termId: null });
  return out;
}

/** Term ids to mark in running text: known, and not generic umbrella terms (those stay chips only). */
export function markedTerms(program, termIds) {
  const g = program?.glossary ?? {};
  return (termIds ?? []).filter((id) => g[id] && !g[id].generic);
}

/** Nodes for `text` with the item's (non-generic) terms as buttons. Plain string when there is nothing to mark. */
export function termText(text, program, termIds) {
  const ids = markedTerms(program, termIds);
  if (!ids.length) return text;
  const segs = segments(text, program, ids);
  if (!segs.some((g) => g.termId)) return text;
  return segs.map((g) => (g.termId ? termSpan(g, program) : g.text));
}

// ---- colour by topic (pure) -------------------------------------------------------------

/** The topic id (glossary `category`) of a term, or null (unknown term, no category). */
export function termTopic(program, termId) {
  const c = program?.glossary?.[termId]?.category;
  return typeof c === "string" && c ? c : null;
}

/** CSS colour of a term's topic ("var(--tp-4)"), or null when the term has no topic. */
export function termColorVar(program, termId) {
  const t = termTopic(program, termId);
  return t ? `var(--tp-${topicSwatch(t)})` : null;
}

/**
 * The legend for some text blocks (each marked on its own, like termText): the topics of the terms
 * actually marked, once each, in order of first appearance -> [{ id, label, swatch, color, terms }].
 */
export function legendModel(program, texts, termIds) {
  const ids = markedTerms(program, termIds);
  const out = new Map();
  if (!ids.length) return [];
  for (const text of texts ?? []) {
    if (!text) continue;
    for (const seg of segments(text, program, ids)) {
      const t = seg.termId ? termTopic(program, seg.termId) : null;
      if (!t) continue;
      if (!out.has(t)) {
        const swatch = topicSwatch(t);
        out.set(t, { id: t, label: program.topics?.[t]?.label ?? t, swatch, color: `var(--tp-${swatch})`, terms: [] });
      }
      const e = out.get(t);
      if (!e.terms.includes(seg.termId)) e.terms.push(seg.termId);
    }
  }
  return [...out.values()];
}

/** "Topics in this text" legend for `texts` (null when nothing is marked). */
export function termLegend(program, texts, termIds) {
  const items = legendModel(program, texts, termIds);
  if (!items.length) return null;
  return h("div", { class: "term-legend" },
    h("p", { class: "term-legend-h" }, "Topics in this text"),
    h("ul", {}, items.map((t) => h("li", { "--tc": t.color }, t.label))));
}

/** How many sessions and papers mention each term -> Map(termId -> n). */
export function termCounts(program) {
  const m = new Map();
  for (const x of [...(program?.sessions ?? []), ...(program?.papers ?? [])]) for (const t of x.terms ?? []) m.set(t, (m.get(t) ?? 0) + 1);
  return m;
}

const httpsUrl = (u) => { try { const x = new URL(u); return x.protocol === "https:" ? x.href : null; } catch { return null; } };

// ---- popover geometry (pure) -------------------------------------------------------------

/**
 * Where to put a popover of `size` {w,h} next to `anchor` {left,top,right,bottom} inside `vp` {w,h}:
 * below if it fits, else above if that fits better; horizontally centred on the anchor and clamped to the gutter.
 */
export function placePopover(anchor, size, vp, gutter = GUTTER, gap = 8) {
  const w = Math.min(size.w, vp.w - 2 * gutter);
  const left = Math.max(gutter, Math.min(anchor.left + (anchor.right - anchor.left) / 2 - w / 2, vp.w - gutter - w));
  const below = vp.h - anchor.bottom - gap - gutter;
  const above = anchor.top - gap - gutter;
  const place = size.h <= below || below >= above ? "below" : "above";
  const room = place === "below" ? below : above;
  const hh = Math.min(size.h, Math.max(room, 0));
  const top = place === "below" ? anchor.bottom + gap : anchor.top - gap - hh;
  return { left, top: Math.max(gutter, top), width: w, maxHeight: Math.max(room, 96), place };
}

// ---- popover (DOM) -----------------------------------------------------------------------

let open = null; // { el, anchor, termId, off }

export function closeTermPopover({ restoreFocus = true } = {}) {
  if (!open) return;
  const { el, anchor, off } = open;
  open = null;
  off();
  anchor.removeAttribute?.("aria-expanded");
  const hadFocus = el.contains(document.activeElement);
  el.remove();
  if (restoreFocus && hadFocus && anchor.isConnected) anchor.focus({ preventScroll: true });
}

// A scroll the app started itself (e.g. smooth scrollIntoView when Explore opens a panel). While it
// settles, an open popover follows its term instead of closing. Ends on `scrollend`, or 400ms after
// the last scroll event (browsers without scrollend), and at the latest after 1.5s.
let settling = false;
let stopSettling = () => {};
export function programmaticScroll() {
  stopSettling(); // one settle window at a time
  let timer = 0;
  const end = () => {
    settling = false;
    clearTimeout(timer); clearTimeout(cap);
    window.removeEventListener("scroll", bump, true);
    window.removeEventListener("scrollend", end, true);
    stopSettling = () => {};
  };
  const bump = () => { clearTimeout(timer); timer = setTimeout(end, 400); };
  const cap = setTimeout(end, 1500);
  settling = true;
  stopSettling = end;
  bump();
  window.addEventListener("scroll", bump, { capture: true, passive: true });
  window.addEventListener("scrollend", end, { capture: true });
}
export const isProgrammaticScroll = () => settling;

/** Open (or toggle off) the explanation for glossary term `termId`, anchored to element `anchor`. */
export function openTermPopover(program, termId, anchor) {
  const g = program?.glossary?.[termId];
  if (!g) return;
  if (open?.anchor === anchor && open.termId === termId) { closeTermPopover(); return; }
  closeTermPopover({ restoreFocus: false });
  const n = termCounts(program).get(termId) ?? 0;
  const ext = httpsUrl(g.url);
  const el = h("div", { class: "term-pop", role: "dialog", "aria-label": `${g.term}: explanation`, tabindex: "-1" },
    h("div", { class: "term-pop-head" }, h("strong", { class: "term-pop-name" }, g.term),
      h("button", { type: "button", class: "term-pop-x", "aria-label": "Close", onclick: () => closeTermPopover() }, icon("x", { size: 18 }))),
    g.short ? h("p", { class: "term-pop-short" }, g.short) : null,
    g.why ? h("p", { class: "term-pop-why" }, h("span", {}, "Why it matters here"), g.why) : null,
    h("div", { class: "term-pop-links" },
      n ? h("a", { class: "term-pop-link", href: `#/browse?term=${encodeURIComponent(termId)}` }, `${n} ${n === 1 ? "item mentions" : "items mention"} this`) : null,
      ext ? h("a", { class: "term-pop-link ext", href: ext, target: "_blank", rel: "noopener" }, icon("link", { size: 16 }), "Learn more") : null));
  el.style.visibility = "hidden";
  document.body.append(el);

  const place = () => {
    const rects = anchor.getClientRects();
    const r = rects.length ? rects[0] : anchor.getBoundingClientRect();
    const vp = { w: document.documentElement.clientWidth, h: window.innerHeight };
    const p = placePopover(r, { w: 340, h: el.scrollHeight || el.offsetHeight }, vp);
    Object.assign(el.style, { left: `${p.left}px`, top: `${p.top}px`, width: `${p.width}px`, maxHeight: `${p.maxHeight}px` });
    el.dataset.place = p.place;
  };
  place();
  el.style.visibility = "";

  const onDown = (e) => {
    if (el.contains(e.target) || e.target.closest?.(".term, .term-chip")) return; // a term tap is handled by its own click
    closeTermPopover({ restoreFocus: false });
  };
  const onKey = (e) => {
    if (e.key === "Escape") { e.preventDefault(); closeTermPopover(); }
    else if (!anchor.isConnected) closeTermPopover({ restoreFocus: false });
  };
  const onScroll = (e) => {
    if (e.target instanceof Node && el.contains(e.target)) return;
    if (settling) place(); // the app is still scrolling the page: keep the popover on its term
    else closeTermPopover({ restoreFocus: false });
  };
  const onAway = () => closeTermPopover({ restoreFocus: false });
  document.addEventListener("pointerdown", onDown, true);
  document.addEventListener("keydown", onKey);
  window.addEventListener("scroll", onScroll, { capture: true, passive: true });
  window.addEventListener("resize", onAway);
  window.addEventListener("hashchange", onAway);
  const off = () => {
    document.removeEventListener("pointerdown", onDown, true);
    document.removeEventListener("keydown", onKey);
    window.removeEventListener("scroll", onScroll, true);
    window.removeEventListener("resize", onAway);
    window.removeEventListener("hashchange", onAway);
  };
  anchor.setAttribute("aria-expanded", "true");
  open = { el, anchor, termId, off };
  el.focus({ preventScroll: true });
}

/**
 * A term inside running text: a bold button in its topic's colour that opens the popover without
 * triggering cards or rows around it.
 */
export function termSpan(seg, program) {
  const stop = (e) => e.stopPropagation();
  return h("button", {
    type: "button", class: "term", "aria-haspopup": "dialog", "data-term": seg.termId,
    "data-topic": termTopic(program, seg.termId), "--tc": termColorVar(program, seg.termId),
    onkeydown: stop, onkeyup: stop, // Enter/Space on the button must not open the card; pointer events pass through so a drag from a term still swipes
    onclick: (e) => { e.stopPropagation(); e.preventDefault(); openTermPopover(program, seg.termId, e.currentTarget); },
  }, seg.text);
}

/** Chip for a term outside running text (detail page "Technologies"). */
export function termChip(program, termId) {
  const g = program.glossary?.[termId];
  if (!g) return null;
  return h("button", {
    type: "button", class: "chip term-chip", "aria-haspopup": "dialog", "data-term": termId, "--tc": termColorVar(program, termId),
    onclick: (e) => { e.stopPropagation(); openTermPopover(program, termId, e.currentTarget); },
  }, g.term);
}
