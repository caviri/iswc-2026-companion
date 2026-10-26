// Deck: pure parts (layout tier by width, keyboard map, the "Up next" selection, the direction lock that
// decides whether a press on a card swipes it or scrolls inside it), and the deck's filters remembered per browser
// (localStorage; main.js reads them at start without loading the deck's view). No DOM. Tested in tests/app/deck.test.mjs.
import { emptyFilters } from "./model.js";

const UI_KEY = "iswc26:ui:deck";

/** Filters remembered per browser (a convenience; falls back to defaults). */
export function loadFilters() {
  try {
    const f = JSON.parse(localStorage.getItem(UI_KEY) || "null");
    if (f && typeof f === "object") {
      const base = emptyFilters();
      return {
        mode: f.mode === "papers" || f.mode === "slots" ? f.mode : "sessions",
        day: typeof f.day === "string" ? f.day : null,
        kinds: Array.isArray(f.kinds) ? f.kinds : base.kinds,
        tracks: Array.isArray(f.tracks) ? f.tracks : base.tracks,
        topics: Array.isArray(f.topics) ? f.topics : base.topics,
        clusters: Array.isArray(f.clusters) ? f.clusters : base.clusters,
      };
    }
  } catch { /* storage unavailable */ }
  return emptyFilters();
}

export function saveFilters(f) {
  try { localStorage.setItem(UI_KEY, JSON.stringify({ ...f, mode: f.mode.startsWith("session:") ? "sessions" : f.mode })); } catch { /* ignore */ }
}

/**
 * Layout tiers by the deck's usable width in px (the centre's content box, minus any panel strip
 * floating over it at 1024–1179px):
 *   "single" < 760   the phone card, centred (phones always get this)
 *   "wide"   ≥ 760   wide card (art | text), "Up next" row under it; filters stay a chip row + sheet
 *   "cols"   ≥ 1100  + a persistent filter column on the left
 *   "full"   ≥ 1500  + "Up next" becomes a column on the right
 */
export const DECK_TIERS = [["full", 1500], ["cols", 1100], ["wide", 760]];

export function deckLayout(width, { desktop = true, overlap = 0 } = {}) {
  if (!desktop || !Number.isFinite(width)) return "single";
  const w = width - Math.max(0, overlap || 0);
  for (const [tier, min] of DECK_TIERS) if (w >= min) return tier;
  return "single";
}

/** How many upcoming cards each tier shows. */
export const UP_NEXT = { single: 0, wide: 5, cols: 5, full: 6 };

/** The cards after the top one, in deck order (the deck order never changes by looking). */
export function upNext(list, tier) {
  const n = UP_NEXT[tier] ?? 0;
  return n ? list.slice(1, 1 + n) : [];
}

/** Keyboard shortcuts, in legend order: [keys shown, action, description]. */
export const DECK_KEYS = [
  [["→", "K"], "keep", "Keep"],
  [["←", "S"], "skip", "Skip"],
  [["↑", "M"], "maybe", "Maybe: decide later, in My ISWC"],
  [["U"], "undo", "Undo the last swipe"],
  [["N"], "note", "Write a note"],
  [["Enter"], "open", "Open the card beside the deck"],
  [["?"], "legend", "Show or hide these shortcuts"],
];

/**
 * A keydown -> deck action, or null. These work everywhere: ← → ↑ (skip, keep, maybe),
 * U / Backspace / Ctrl+Z undo, N note (not with Ctrl). `desktop` adds K, S, M, Enter and ?, and capital
 * U/N, all unmodified. Cmd and Alt combinations never map (browser shortcuts).
 */
export function deckKeyAction({ key, ctrlKey = false, metaKey = false, altKey = false } = {}, { desktop = false } = {}) {
  if (metaKey || altKey) return null;
  if (key === "ArrowRight") return "keep";
  if (key === "ArrowLeft") return "skip";
  if (key === "ArrowUp") return "maybe";
  if ((key === "z" && ctrlKey) || key === "u" || key === "Backspace") return "undo";
  if (key === "n" && !ctrlKey) return "note";
  if (!desktop || ctrlKey) return null;
  if (key === "U") return "undo";
  if (key === "N") return "note";
  if (key === "k" || key === "K") return "keep";
  if (key === "s" || key === "S") return "skip";
  if (key === "m" || key === "M") return "maybe";
  if (key === "Enter") return "open";
  if (key === "?") return "legend";
  return null;
}

// ---- direction lock: swipe the card, or scroll inside it ----
export const LOCK_SLOP = 10;       // px of movement before a press picks an axis
export const LOCK_RATIO = 1.2;     // horizontal when |dx| > 1.2·|dy|
export const SCROLL_QUIET_MS = 100; // a press this soon after the card's content scrolled is the scroll's, not a swipe

/** First real movement -> null (still under LOCK_SLOP), "x" (horizontal) or "y" (vertical). Locked until release. */
export function lockAxis(dx, dy) {
  if (Math.hypot(dx, dy) <= LOCK_SLOP) return null;
  return Math.abs(dx) > LOCK_RATIO * Math.abs(dy) ? "x" : "y";
}

/** The scroll area is at its bottom, or doesn't overflow at all (1px of slack for fractional layouts). */
export const atBottom = ({ scrollTop = 0, scrollHeight = 0, clientHeight = 0 }) => scrollTop + clientHeight >= scrollHeight - 1;

/**
 * What a press on the top card becomes after moving (dx, dy):
 *   "wait"   not locked yet
 *   "swipe"  horizontal: the card follows the finger (keep / skip)
 *   "up"     a pull upward the card follows (maybe): from a zone that doesn't scroll, or from the scroll area
 *            when it is already at its bottom (or doesn't overflow); never in the middle of long content
 *   "scroll" vertical inside the scroll area: the browser scrolls it, the card never moves
 *   "drop"   nothing for the card (a vertical move on a still edge, or a mouse in selectable text)
 * zone: "edge" (header, art: nothing scrolls), "scroll" (the card's scroll area), "text" (the wide card's
 * selectable text column, which also scrolls). `bottom`: the scroll area is at its bottom. `mouse`: with a
 * mouse, the text column belongs to text selection (swipe from the art column, or use the keys).
 */
export function pressIntent({ dx, dy, zone = "edge", bottom = true, mouse = false }) {
  const axis = lockAxis(dx, dy);
  if (!axis) return "wait";
  if (mouse && zone === "text") return "drop";
  if (axis === "x") return "swipe";
  if (dy < 0 && (zone === "edge" || bottom)) return "up";
  return zone === "edge" ? "drop" : mouse ? "drop" : "scroll";
}

/** A press that lands while the content is still scrolling (momentum) never starts a swipe. */
export const pressBlocked = (sinceScrollMs) => sinceScrollMs < SCROLL_QUIET_MS;
