// Logistics: travel and stay pages (one shared, one per person). Pure module; storage is injectable.
// The pages are personal (addresses, booking codes, flights), so they are never part of app/: each
// device imports them from a JSON file and keeps them in its own storage, like swipes and notes.
const KEY = "iswc26:logistics";
const SECTION_TYPES = new Set(["stay", "route", "table", "flights", "agenda", "notes"]);
const ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const isObj = (x) => x && typeof x === "object" && !Array.isArray(x);

function defaultStorage() {
  try {
    const ls = globalThis.localStorage;
    if (!ls) return null;
    ls.getItem(KEY);
    return ls;
  } catch { return null; }
}

/** One page from an imported file, or throws with a message that says what to fix. */
export function checkPage(p, where = "page") {
  if (!isObj(p)) throw new Error(`${where} is not an object`);
  if (typeof p.id !== "string" || !ID_RE.test(p.id)) throw new Error(`${where} needs an "id" like "common" or "alex"`);
  if (!Array.isArray(p.sections)) throw new Error(`${where} ("${p.id}") needs a "sections" list`);
  const sections = p.sections.filter((s) => isObj(s) && SECTION_TYPES.has(s.type)); // unknown types: skipped
  return { id: p.id, name: typeof p.name === "string" && p.name ? p.name : p.id, people: Array.isArray(p.people) ? p.people.map(String) : [], sections };
}

/** Accepts one page, a list of pages, or { pages: [...] } (the bundle). Returns checked pages. */
export function parsePages(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error("That isn't valid JSON."); }
  const list = Array.isArray(data) ? data : isObj(data) && Array.isArray(data.pages) ? data.pages : [data];
  if (!list.length) throw new Error("The file has no pages.");
  return list.map((p, i) => checkPage(p, list.length > 1 ? `page ${i + 1}` : "the page"));
}

/** Shared page first, then people in import order. */
export const orderPages = (pages) => [...pages.filter((p) => p.id === "common"), ...pages.filter((p) => p.id !== "common")];

export function createLogistics(storage = defaultStorage()) {
  let pages = [];
  const load = () => {
    try {
      const d = JSON.parse(storage?.getItem(KEY) ?? "null");
      pages = Array.isArray(d?.pages) ? d.pages.flatMap((p) => { try { return [checkPage(p)]; } catch { return []; } }) : [];
    } catch { pages = []; }
  };
  const write = () => {
    if (!storage) return false;
    try {
      if (pages.length) storage.setItem(KEY, JSON.stringify({ pages })); else storage.removeItem(KEY);
      return true;
    } catch { return false; }
  };
  load();
  return {
    pages: () => orderPages(pages),
    page: (id) => pages.find((p) => p.id === id) ?? null,
    get empty() { return pages.length === 0; },
    /** Adds or replaces pages by id. Returns { ids, saved } (saved false: kept for this visit only). */
    importText(text) {
      const incoming = parsePages(text);
      load();
      for (const p of incoming) {
        const i = pages.findIndex((q) => q.id === p.id);
        if (i >= 0) pages[i] = p; else pages.push(p);
      }
      return { ids: incoming.map((p) => p.id), saved: write() };
    },
    clear() { pages = []; write(); },
    refresh: load,
  };
}

const TIME_RE = /^\d{4}-\d\d-\d\dT\d\d:\d\d/;
const at = (s) => (typeof s === "string" && TIME_RE.test(s) ? s.slice(0, 16) : null);
export const clockOf = (s) => (at(s) ? s.slice(11, 16) : "");
export const dateOf = (s) => (at(s) ? s.slice(0, 10) : "");

/**
 * Dated trip moments for one person: their flights (and bag drop) plus check-in/out of the shared
 * stay. Times are Bari/Geneva wall-clock ("YYYY-MM-DDTHH:MM", both CET). Sorted, each with `state`
 * "past" | "next" | "later" relative to isoNow (a Rome ISO time from romeNow()).
 */
export function tripEvents(pages, personId, isoNow) {
  const person = pages.find((p) => p.id === personId);
  const shared = pages.find((p) => p.id === "common");
  const out = [];
  for (const s of person?.sections ?? []) {
    if (s.type !== "flights") continue;
    for (const f of Array.isArray(s.flights) ? s.flights : []) {
      const dep = at(f.departs);
      if (!dep) continue;
      const label = [f.number, `${f.from ?? ""} → ${f.to ?? ""}`].filter(Boolean).join(" · ");
      const bag = Array.isArray(f.bagDrop) ? f.bagDrop.map(at) : [];
      if (bag[0]) out.push({ at: bag[0], title: "Bag drop opens", detail: [f.from, bag[1] ? `closes ${clockOf(bag[1])}` : null].filter(Boolean).join(" · ") });
      out.push({ at: dep, title: `Flight ${f.label ? f.label.toLowerCase() : ""}`.trim(), detail: `${label}${at(f.arrives) ? `, lands ${clockOf(f.arrives)}` : ""}` });
    }
  }
  for (const s of shared?.sections ?? []) {
    if (s.type !== "stay") continue;
    if (at(s.checkIn)) out.push({ at: at(s.checkIn), title: `Check in: ${s.name ?? "stay"}`, detail: `from ${clockOf(s.checkIn)}` });
    if (at(s.checkOut)) out.push({ at: at(s.checkOut), title: `Check out: ${s.name ?? "stay"}`, detail: `by ${clockOf(s.checkOut)}` });
  }
  out.sort((a, b) => a.at.localeCompare(b.at) || a.title.localeCompare(b.title));
  const now = String(isoNow ?? "").slice(0, 16);
  let nextSeen = false;
  for (const e of out) {
    if (e.at < now) e.state = "past";
    else { e.state = nextSeen ? "later" : "next"; nextSeen = true; }
  }
  return out;
}

/** Agenda sections (a workshop's own programme) attached to a programme session id, with their page. */
export function agendasFor(pages, sessionId) {
  return pages.flatMap((p) => p.sections.filter((s) => s.type === "agenda" && s.session === sessionId).map((s) => ({ page: p, agenda: s })));
}

/** https links only; anything else is shown as text. */
export const safeUrl = (u) => (typeof u === "string" && /^https:\/\//i.test(u) ? u : null);
/** "+44 20 7946 0018" -> "tel:+442079460018" (a number reserved for fiction), or null if it doesn't look like a phone number. */
export const telUrl = (n) => (typeof n === "string" && /^\+?[\d\s().-]{6,}$/.test(n) ? `tel:${n.replace(/[^\d+]/g, "")}` : null);
