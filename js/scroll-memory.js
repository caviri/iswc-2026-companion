// Where you were on Home and the Timetable, so coming back from what you opened there (an item or a person page,
// by Back or by a link) lands where you left instead of at the top. A per-visit convenience in sessionStorage;
// without storage it simply starts at the top. createScrollMemory is pure (tests/app/scroll-memory.test.mjs).
const KEY = "iswc26:scroll";
const KEPT = new Set(["home", "grid"]); // the routes whose place is remembered
const OPENED = new Set(["item", "person"]); // what you open from them

/** createScrollMemory(storage) -> { leave, arrive, returning, get, put } */
export function createScrollMemory(storage = null) {
  let saved = {};
  try { saved = JSON.parse(storage?.getItem(KEY) ?? "{}") ?? {}; } catch { saved = {}; }
  let back = false;
  const write = () => { try { storage?.setItem(KEY, JSON.stringify(saved)); } catch { /* fine without */ } };
  return {
    /** Leaving `route` scrolled to y: remembered for Home and the Timetable. */
    leave(route, y) { if (KEPT.has(route)) { saved[route] = { ...saved[route], y: Math.max(0, Math.round(y)) }; write(); } },
    /** Arriving at `route` from `from`: true when it is a return to a remembered route from something opened there. */
    arrive(from, route) { back = KEPT.has(route) && OPENED.has(from); return back; },
    /** Whether the route being drawn is such a return. */
    returning: () => back,
    /** What is remembered for `route` ({ y, ...what the view added }), or null. */
    get: (route) => saved[route] ?? null,
    /** A view's own extra state for its route (the timetable's day and inner scroll). */
    put(route, extra) { saved[route] = { ...saved[route], ...extra }; write(); },
  };
}

let storage = null;
try { storage = globalThis.sessionStorage ?? null; } catch { storage = null; }
/** The app's one memory (main.js records leaving and arriving; views read and add to it). */
export const scrollMemory = createScrollMemory(storage);
