// The app clock: the one source of "now" for every view, in Rome time. Subscribers hear about every new minute
// while the page is visible. Pure: no DOM. Unit-tested in tests/app/clock.test.mjs.
import { romeNow } from "./time.js";

const TICK_MS = 5_000;
const LEGACY_KEY = "iswc26:clock"; // a simulated time saved by older versions: removed on load

/**
 * createClock({ wall, timers, visibility, storage }) -> clock
 *   wall()   real time in ms (default Date.now); timers: { setInterval, clearInterval };
 *   visibility: { isHidden(), listen(fn) } (default: the document's), no ticks while the page is hidden;
 *   storage: a sessionStorage-like object whose old simulated-time entry is dropped.
 *
 * clock.now()        Rome ISO "2026-10-27T10:30:00+01:00"
 * clock.nowMs()      the same instant in ms
 * clock.state()      { iso, day, time }
 * clock.subscribe(fn) fn(state) on every new minute; returns unsubscribe.
 */
export function createClock({ wall = () => Date.now(), timers = globalThis, visibility = documentVisibility(), storage = null } = {}) {
  const subs = new Set();
  let timer = null;
  let lastMinute = "";

  const nowMs = () => wall();
  const now = () => romeNow(new Date(nowMs()));
  const state = () => { const iso = now(); return { iso, day: iso.slice(0, 10), time: iso.slice(11, 16) }; };

  function emit(force = false) {
    const s = state();
    const minute = s.iso.slice(0, 16);
    if (!force && minute === lastMinute) return;
    lastMinute = minute;
    for (const fn of [...subs]) {
      try { fn(s); } catch (e) { console.error(e); }
    }
  }

  // A timer runs only while the page is visible and someone listens.
  const hidden = () => { try { return !!visibility?.isHidden(); } catch { return false; } };
  function schedule() {
    const want = subs.size && !hidden();
    if (want && !timer) timer = timers.setInterval(() => emit(), TICK_MS);
    if (!want && timer) { timers.clearInterval(timer); timer = null; }
  }

  function subscribe(fn) {
    subs.add(fn);
    lastMinute = lastMinute || now().slice(0, 16);
    schedule();
    return () => { subs.delete(fn); schedule(); };
  }

  try { storage?.removeItem(LEGACY_KEY); } catch { /* nothing to clear */ }
  try { visibility?.listen(() => { schedule(); if (!hidden()) emit(); }); } catch { /* no visibility events */ }

  return { now, nowMs, state, subscribe };
}

/** The document's visibility (none outside a browser). */
function documentVisibility() {
  const d = globalThis.document;
  if (!d?.addEventListener) return null;
  return { isHidden: () => d.visibilityState === "hidden", listen: (fn) => d.addEventListener("visibilitychange", fn) };
}

const session = (() => { try { return globalThis.sessionStorage ?? null; } catch { return null; } })();

/** The app's clock (one per tab). */
export const clock = createClock({ storage: session });
