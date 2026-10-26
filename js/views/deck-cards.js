// Deck cards: the phone card (also the desktop single-card layout) and the wide desktop card, plus
// attachSwipe, the one gesture handler every deck card uses (the time-slot card too). Its decisions are the
// pure ones in js/deck-model.js (direction lock, maybe-at-bottom) and js/model.js (classifyGesture).
import { h, icon, tagPill } from "../ui.js";
import { dayLong, dayShort, timeRange, placeOf, itemTag, classifyGesture, TAP_SLOP, whenOf } from "../model.js";
import { pressIntent, pressBlocked, atBottom } from "../deck-model.js";
import { termText } from "../terms.js";
import { thumbSVG } from "../thumbs.js";
import { detailContent } from "./detail.js";
import { paperFigure } from "./images.js";

// ---- cards ----
function timeBlock(s) {
  const end = /^\d\d:\d\d$/.test(s.end ?? "") ? `until ${s.end}` : s.end ? `until ${String(s.end).toLowerCase()}` : "";
  return h("div", { class: "card-when" },
    h("span", { class: "t-start" }, s.start),
    h("span", { class: "t-rest" }, h("span", {}, dayLong(s.day)), end ? h("span", {}, end) : null));
}

function placeLine(program, s) {
  const p = placeOf(program, s);
  return h("p", { class: "card-place" }, icon("pin", { size: 18 }), h("span", {}, p.name), p.floor ? h("span", { class: "floor" }, p.floor) : null);
}

function topicTags(program, ids) {
  if (!ids?.length) return null;
  const shown = ids.slice(0, 3);
  return h("ul", { class: "tags", "aria-label": "Topics" },
    shown.map((id) => h("li", {}, program.topics[id]?.label ?? id)),
    ids.length > 3 ? h("li", { class: "more" }, `+${ids.length - 3}`) : null);
}

/** The Keep / Skip / Maybe stamps; --p-keep, --p-skip, --p-maybe (0..1) fade them in while dragging. */
export const stamps = ({ keep = "Keep", skip = "Skip", maybe = "Maybe" } = {}) => [
  h("div", { class: "stamp stamp-keep", "aria-hidden": "true" }, icon("heart", { fill: true, size: 22 }), keep),
  h("div", { class: "stamp stamp-skip", "aria-hidden": "true" }, icon("x", { size: 22 }), skip),
  h("div", { class: "stamp stamp-maybe", "aria-hidden": "true" }, icon("maybe", { size: 22 }), maybe),
];

export function cardFor(program, store, item) {
  return item.paperIds ? sessionCard(program, store, item) : paperCard(program, store, item);
}

function sessionCard(program, store, s) {
  const kind = program.kinds[s.kind] ?? { label: s.kind, color: "#888" };
  const tag = itemTag(program, s);
  let body;
  if (s.speaker || s.talkTitle) {
    body = h("div", { class: "card-body" },
      s.talkTitle ? h("p", { class: "card-talk" }, termText(s.talkTitle, program, s.terms)) : null,
      s.speaker ? h("p", { class: "card-who" }, h("strong", {}, s.speaker), s.affiliation ? h("span", {}, s.affiliation) : null) : null);
  } else if (s.paperIds.length) {
    const ps = s.paperIds.map((id) => program.byId.get(id)).filter(Boolean);
    body = h("div", { class: "card-body" },
      h("p", { class: "card-sub" }, icon("layers", { size: 16 }), `${ps.length} ${ps.length === 1 ? "paper" : "papers"}`),
      h("ol", { class: "card-papers" }, ps.map((p) => h("li", {}, termText(p.title, program, p.terms)))));
  } else if (s.organizers || s.description) {
    body = h("div", { class: "card-body" },
      s.organizers ? h("p", { class: "card-sub" }, icon("people", { size: 16 }), h("span", {}, s.organizers)) : null,
      s.description ? h("p", { class: "card-desc" }, termText(s.description, program, s.terms)) : null);
  }
  return h("article", { class: "card", tabindex: "0", "--kind": kind.color, "aria-label": `${tag.label}: ${s.title}. ${dayLong(s.day)} ${timeRange(s)}. Press Enter for details.` },
    h("div", { class: "card-inner" },
      h("div", { class: "card-art" }, thumbSVG(s, program, { size: "band" })),
      h("div", { class: "card-top" },
        tagPill(tag),
        store.note(s.id) ? h("span", { class: "has-note", title: "Has a note" }, icon("note", { size: 16 })) : null),
      timeBlock(s),
      h("h2", { class: "card-title" }, termText(s.title, program, s.terms)),
      body,
      h("div", { class: "card-foot" }, placeLine(program, s), topicTags(program, s.topics))),
    stamps());
}

function paperCard(program, store, p) {
  const s = p.sessionId ? program.byId.get(p.sessionId) : null;
  const kindColor = s ? program.kinds[s.kind]?.color : null;
  const authors = p.authors.join(", ");
  return h("article", { class: "card paper", tabindex: "0", "--kind": kindColor ?? "var(--sea)", "aria-label": `${p.track} paper: ${p.title}. Press Enter for details.` },
    h("div", { class: "card-inner" },
      h("div", { class: "card-art" }, thumbSVG(p, program, { size: "band" })),
      h("div", { class: "card-top" },
        tagPill(itemTag(program, p)),
        store.note(p.id) ? h("span", { class: "has-note", title: "Has a note" }, icon("note", { size: 16 })) : null),
      s ? timeBlock(whenOf(program, p)) : h("div", { class: "card-when unscheduled" }, h("span", { class: "t-rest" }, "No timetable slot listed")),
      h("h2", { class: "card-title" }, termText(p.title, program, p.terms)),
      h("div", { class: "card-body" },
        authors ? h("p", { class: "card-authors" }, authors) : null,
        s ? h("p", { class: "card-sub in-session" }, icon("layers", { size: 16 }), h("span", {}, s.title)) : null),
      h("div", { class: "card-foot" }, s ? placeLine(program, s) : null, topicTags(program, p.topics))),
    stamps());
}

// ---- wide desktop deck (js/deck-model.js picks the tier) ----

/** Session (or the paper's session), its kind and the label shown on the card. */
function cardKind(program, item) {
  const isSession = !!item.paperIds;
  const s = isSession ? item : item.sessionId ? program.byId.get(item.sessionId) : null;
  const kind = s ? program.kinds[s.kind] : null;
  return { s, color: kind?.color ?? (isSession ? "#888" : "var(--sea)"), label: itemTag(program, item)?.label ?? "Item" };
}

/**
 * The wide card: an art column (hero thumbnail, time, place, topics) beside the text column, which is
 * the detail page's own content in its `deck` variant (title, authors as person links, the full
 * description, papers, links, technologies, cluster) plus the note. `.dispose()` frees that content.
 */
export function wideCard(program, store, item, { onNote = null } = {}) {
  const { s, color, label } = cardKind(program, item);
  const c = detailContent(program, store, item.id, { deck: true });
  const note = store.note(item.id);
  const noteRow = h("div", { class: "cw-note" },
    note ? h("p", { class: "cw-note-text" }, h("span", { class: "sr-only" }, "Your note: "), note) : null,
    h("button", { type: "button", class: "pill-btn cw-note-btn", onclick: () => onNote?.() }, icon("note", { size: 18 }), note ? "Edit note" : "Add a note"));
  const el = h("article", { class: "card card-wide", tabindex: "0", "--kind": color, "aria-label": `${label}: ${item.title}. ${s ? `${dayLong(s.day)} ${timeRange(s)}. ` : ""}Press Enter to open it beside the deck.` },
    h("div", { class: "cw" },
      h("div", { class: "cw-side" },
        h("div", { class: "cw-art" }, paperFigure(program, item) ?? thumbSVG(item, program, { size: "hero" })),
        h("div", { class: "cw-facts" },
          s ? timeBlock(whenOf(program, item)) : h("div", { class: "card-when unscheduled" }, h("span", { class: "t-rest" }, h("span", {}, "No timetable slot listed"))),
          s ? placeLine(program, s) : null,
          topicTags(program, item.topics))),
      h("div", { class: "cw-main" }, c.nodes, noteRow)),
    stamps());
  el.dispose = c.cleanup;
  return el;
}

/** The cards waiting behind the top one: plain surfaces with the kind spine (Up next names them). */
export function ghostCard(program, item) {
  return h("article", { class: "card card-ghost", "--kind": cardKind(program, item).color });
}

/** One "Up next" tile: thumbnail, when, title. A link: on desktop it opens the item's panel. */
export function upNextTile(program, item) {
  const { s, color } = cardKind(program, item);
  return h("li", {}, h("a", { class: "un-tile", href: `#/item/${encodeURIComponent(item.id)}`, "--kind": color },
    h("span", { class: "un-art" }, thumbSVG(item, program, { size: "tile" })),
    h("span", { class: "un-text" },
      h("span", { class: "un-meta" }, s ? `${dayShort(s.day)} ${s.start}` : "Not in the timetable"),
      h("span", { class: "un-title" }, item.title),
      h("span", { class: "un-meta row-tagline" }, tagPill(itemTag(program, item), "row")))));
}

/** The shortcuts legend (toggled by "?" or its button). */
export function keysLegend(keys) {
  return h("div", { class: "deck-keys", id: "deck-keys", role: "group", "aria-label": "Keyboard shortcuts" },
    h("p", { class: "deck-keys-h" }, "Keyboard shortcuts"),
    h("dl", {}, keys.map(([ks, , desc]) => [
      h("dt", {}, ks.map((k, i) => [i ? h("span", { class: "or" }, "or") : null, h("kbd", {}, k)])),
      h("dd", {}, desc)])));
}

// ---- the swipe gesture, shared by every deck card ----

/**
 * attachSwipe(el, opts) -> nothing. Drives one card with pointer events:
 *   - a press picks an axis on its first ~10px (deck-model.js lockAxis): horizontal swipes the card (keep /
 *     skip); vertical scrolls the card's own content, natively, and never moves the card;
 *   - pulling up swipes the card up (maybe / later) only from a zone that doesn't scroll (`edgeSel`), or
 *     when the scroll area is already at its bottom (or doesn't overflow);
 *   - a press within 100ms of the content scrolling (momentum) is left alone;
 *   - with a mouse, the selectable text column (`textSel`) is for selecting text, never for swiping.
 * opts: scrollSel (the card's scroll area), textSel, edgeSel (presses there are "edge": nothing scrolls),
 *   isBusy(), onStart(), onMove(dx, dy, mode), onRelease(outcome, { dx, dy, mode }), onTap(event),
 *   ignoreSel (presses on these never start a gesture, e.g. a row's own buttons).
 * touch-action on the CSS side: the card is `none`, its scroll area `pan-y`, so the browser keeps vertical
 * panning there and the handlers get horizontal moves without a scroll stutter. A touchmove is cancelled
 * only once the gesture is locked onto the card (iOS needs that to stop the page or the list moving under it).
 */
export function attachSwipe(el, opts) {
  const { scrollSel = null, textSel = null, edgeSel = null, ignoreSel = null } = opts;
  let s = null;
  let down = null; // where the last press started, for telling taps from drags in the click handler
  let swallowClick = false;
  let lastScroll = -Infinity;
  const now = () => globalThis.performance?.now?.() ?? Date.now();
  // Scroll events don't bubble, but a capture listener on the card hears every scroll inside it.
  el.addEventListener("scroll", () => { lastScroll = now(); }, true);
  el.addEventListener("dragstart", (e) => e.preventDefault()); // a link or image dragged natively would cancel the swipe
  const zoneOf = (t) => {
    if (edgeSel && t.closest?.(edgeSel)) return "edge";
    if (textSel && t.closest?.(textSel)) return "text";
    if (scrollSel && t.closest?.(scrollSel)) return "scroll";
    return "edge";
  };
  const scrollerOf = (t) => (textSel && t.closest?.(textSel)) || (scrollSel && t.closest?.(scrollSel)) || null;

  el.addEventListener("pointerdown", (e) => {
    down = { x: e.clientX, y: e.clientY };
    if (s || opts.isBusy?.() || (e.pointerType === "mouse" && e.button !== 0)) return;
    if (ignoreSel && e.target.closest?.(ignoreSel)) return;
    swallowClick = false;
    if (pressBlocked(now() - lastScroll)) return; // still scrolling: this press stops the momentum, nothing more
    const scroller = scrollerOf(e.target);
    if (scroller && e.pointerType === "mouse") {
      const r = scroller.getBoundingClientRect();
      if (e.clientX >= r.left + scroller.clientLeft + scroller.clientWidth) return; // its scrollbar
    }
    s = { x: e.clientX, y: e.clientY, t: e.timeStamp, id: e.pointerId, mode: null, zone: zoneOf(e.target), scroller,
      mouse: e.pointerType === "mouse", samples: [[e.timeStamp, e.clientX, e.clientY]] };
    // Capture only once it is a swipe, so a tap keeps its own click target (a term or link inside the card).
  });
  el.addEventListener("pointermove", (e) => {
    if (!s || e.pointerId !== s.id) return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (!s.mode) {
      const intent = pressIntent({ dx, dy, zone: s.zone, bottom: s.scroller ? atBottom(s.scroller) : true, mouse: s.mouse });
      if (intent === "wait") return;
      if (intent === "scroll" || intent === "drop") { s = null; swallowClick = true; return; } // the browser's now
      s.mode = intent;
      el.classList.add("dragging");
      el.setPointerCapture?.(e.pointerId);
      if (s.zone === "text") globalThis.getSelection?.()?.removeAllRanges();
      opts.onStart?.();
    }
    s.samples.push([e.timeStamp, e.clientX, e.clientY]);
    if (s.samples.length > 6) s.samples.shift();
    opts.onMove?.(s.mode === "up" ? 0 : dx, s.mode === "up" ? Math.min(0, dy) : dy, s.mode);
  });
  // Once the card owns the gesture, the browser must not scroll (or bounce) under it.
  el.addEventListener("touchmove", (e) => { if (s?.mode && e.cancelable) e.preventDefault(); }, { passive: false });
  const end = (e, cancelled) => {
    if (!s || e.pointerId !== s.id) return;
    const g = s; s = null;
    if (!g.mode) return; // a tap (the click handler opens it) or a press that never moved far
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    const [t0, x0, y0] = g.samples[0];
    const dt = Math.max(1, e.timeStamp - t0);
    const up = g.mode === "up";
    const outcome = classifyGesture({
      dx: up ? 0 : dx, dy: up ? dy : 0, up, moved: true, cancelled, duration: e.timeStamp - g.t,
      velocity: (e.clientX - x0) / dt, vy: (e.clientY - y0) / dt, width: el.offsetWidth || 1, height: el.offsetHeight || 1,
    });
    swallowClick = true;
    el.classList.remove("dragging");
    opts.onRelease?.(outcome, { dx, dy, mode: g.mode });
  };
  el.addEventListener("pointerup", (e) => end(e, false));
  el.addEventListener("pointercancel", (e) => end(e, true));
  el.addEventListener("click", (e) => {
    const moved = down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > TAP_SLOP;
    // After a swipe, or a press that started on one thing and let go on another (a drag that never became a
    // swipe): no click. (Keyboard clicks have no pointer position and always pass.)
    if (swallowClick || opts.isBusy?.() || (moved && e.detail !== 0)) {
      swallowClick = false;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    opts.onTap?.(e);
  }, true);
}
