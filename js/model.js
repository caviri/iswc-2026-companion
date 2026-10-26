// Pure view-model helpers shared by the views: deck ordering/filtering and display formatting.
// No DOM access; unit-tested in tests/app/model.test.mjs.

import { hasRoute } from "./edition.js";
import { romeNow, nowNext, inferEnds } from "./time.js";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Empty filter state. mode: "sessions" | "papers" | "session:<id>" (papers of one session). */
export const emptyFilters = () => ({ mode: "sessions", day: null, kinds: [], tracks: [], topics: [], clusters: [] });

/** "2026-10-25" -> "Sun 25" */
export function dayShort(date) {
  const d = new Date(`${date}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? String(date ?? "") : `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()}`;
}

/** "2026-10-25" -> "Sun 25 Oct" */
export function dayLong(date) {
  const d = new Date(`${date}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? String(date ?? "") : `${dayShort(date)} ${MONTHS[d.getUTCMonth()]}`;
}

/** Session time range. Handles end "" (unknown) and non-time ends such as "Late". */
/**
 * A workshop agenda (session.agenda, from its own website) grouped by its blocks, in order:
 * [{ block, chairs, start, end, items: [agenda item] }]; consecutive items with the same block share one group.
 * A group's start / end span its items (a missing end counts as its start). [] without an agenda.
 */
export function agendaGroups(session) {
  const out = [];
  for (const a of session?.agenda ?? []) {
    let g = out[out.length - 1];
    if (!g || g.block !== a.block) out.push(g = { block: a.block, chairs: a.chairs, start: a.start, end: a.end ?? a.start, items: [] });
    g.items.push(a);
    if ((a.end ?? a.start) > g.end) g.end = a.end ?? a.start;
  }
  return out;
}

/** When an item happens, for display: a paper with its own slot (paper.talk) -> that slot's times on its session's day. */
export function whenOf(program, x) {
  const s = x?.paperIds ? x : x?.sessionId ? program.byId.get(x.sessionId) ?? null : null;
  if (!s) return null;
  return x.talk ? { day: s.day, start: x.talk.start, end: x.talk.end, startISO: x.talk.startISO, endISO: x.talk.endISO } : s;
}

export function timeRange(s) {
  if (!s) return "";
  if (/^\d\d:\d\d$/.test(s.end ?? "")) return `${s.start}–${s.end}`;
  if (s.end) return `${s.start} until ${String(s.end).toLowerCase()}`;
  return `from ${s.start}`;
}

/** "Floor −1" / "Floor 2" / "" */
export const floorLabel = (floor) => (floor == null ? "" : `Floor ${floor < 0 ? "−" + Math.abs(floor) : floor}`);

/** { name, floor } for a session's location, with readable fallbacks. */
export function placeOf(program, s) {
  if (!s) return { name: "No session scheduled", floor: "" };
  if (s.allRooms) return { name: "All rooms", floor: "" };
  const r = s.roomId ? program.byId.get(s.roomId) : null;
  if (!r) return { name: "No room listed", floor: "" };
  return { name: r.name, floor: floorLabel(r.floor) };
}

const hasAny = (list, wanted) => list.some((x) => wanted.includes(x));

function sessionPasses(program, s, f) {
  if (f.day && s.day !== f.day) return false;
  if (f.kinds.length && !f.kinds.includes(s.kind)) return false;
  if (f.topics.length && !hasAny(s.topics, f.topics)) return false;
  if (f.tracks.length && !s.paperIds.some((id) => f.tracks.includes(program.byId.get(id)?.track))) return false;
  if (f.clusters.length && !f.clusters.includes(s.cluster)) return false;
  return true;
}

function paperPasses(program, p, f) {
  const s = p.sessionId ? program.byId.get(p.sessionId) : null;
  if (f.day && s?.day !== f.day) return false;
  if (f.tracks.length && !f.tracks.includes(p.track)) return false;
  if (f.topics.length && !hasAny(p.topics, f.topics)) return false;
  if (f.clusters.length && !f.clusters.includes(p.cluster)) return false;
  return true;
}

/** Scheduled papers by session time then in-session order; unscheduled after, by track then title. */
export function orderedPapers(program) {
  const rank = new Map();
  program.sessions.forEach((s, i) => s.paperIds.forEach((id, j) => rank.set(id, [i, j])));
  const key = (p) => {
    const r = p.sessionId && program.byId.has(p.sessionId) ? rank.get(p.id) : null;
    return r ? [0, r[0], r[1], "", ""] : [1, 0, 0, p.track ?? "", p.title ?? ""];
  };
  return [...program.papers].sort((a, b) => {
    const ka = key(a), kb = key(b);
    for (let i = 0; i < ka.length; i++) {
      if (ka[i] < kb[i]) return -1;
      if (ka[i] > kb[i]) return 1;
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/**
 * Cards still to swipe, in deck order.
 * mode "sessions": non-break sessions by start time; "papers": all papers (scheduled first);
 * "session:<id>": that session's papers in programme order (filters ignored).
 * Filters: day (exact), kinds (sessions only), tracks, topics, clusters. OR within a group, AND across groups.
 * Track on a session matches when any of its papers is in the track.
 */
export function deckItems(program, store, filters = emptyFilters(), mode = filters.mode ?? "sessions") {
  const f = { ...emptyFilters(), ...filters };
  const open = (x) => !store.verdict(x.id);
  if (mode.startsWith("session:")) {
    const s = program.byId.get(mode.slice(8));
    return (s?.paperIds ?? []).map((id) => program.byId.get(id)).filter((p) => p && open(p));
  }
  if (mode === "papers") return orderedPapers(program).filter((p) => open(p) && paperPasses(program, p, f));
  return program.sessions.filter((s) => s.kind !== "break" && open(s) && sessionPasses(program, s, f));
}

/** Maybes ("up") under the same mode and filters as the deck -> count (they left the deck; the count says so). */
export function deckMaybes(program, store, filters = emptyFilters(), mode = filters.mode ?? "sessions") {
  const asOpen = { verdict: (id) => (store.verdict(id) === "up" ? null : store.verdict(id)) };
  return deckItems(program, asOpen, filters, mode).filter((x) => store.verdict(x.id) === "up").length;
}

/** Move the item with `id` to the front (used so an undone card comes back on top). */
export function pinFirst(items, id) {
  const i = id ? items.findIndex((x) => x.id === id) : -1;
  return i <= 0 ? items : [items[i], ...items.slice(0, i), ...items.slice(i + 1)];
}

/** Chip options for the filter UI. */
export function filterOptions(program) {
  const usedKinds = new Set(program.sessions.map((s) => s.kind));
  const tracks = [...new Set(program.papers.map((p) => p.track).filter(Boolean))].sort();
  return {
    days: program.days.map((d) => ({ value: d.date, label: dayShort(d.date) })),
    kinds: Object.entries(program.kinds)
      .filter(([k]) => k !== "break" && usedKinds.has(k))
      .map(([k, v]) => ({ value: k, label: v.label, color: v.color }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    tracks: tracks.map((t) => ({ value: t, label: t })),
    topics: Object.entries(program.topics)
      .map(([k, v]) => ({ value: k, label: v.label }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    // Biggest first, as in the data (older cached data has none).
    clusters: (program.clusters ?? []).map((c) => ({ value: c.id, label: c.label })),
  };
}

/** Number of active filter values excluding day (shown on the "Filters" chip). Kinds don't apply to papers. */
export function extraFilterCount(f, mode = f.mode) {
  return (mode === "papers" ? 0 : f.kinds.length) + f.tracks.length + f.topics.length + (f.clusters?.length ?? 0);
}

/** Cards left in each top-level deck mode under the same filters -> {sessions, papers}. */
export function modeCounts(program, store, filters) {
  return {
    sessions: deckItems(program, store, filters, "sessions").length,
    papers: deckItems(program, store, filters, "papers").length,
  };
}

/**
 * For the deck's empty state: with filters on (day or any extra filter), the other mode and how many
 * cards it still has under the same filters -> {mode, n}; null when there is nothing to switch to.
 */
export function emptyNext(program, store, filters) {
  const f = { ...emptyFilters(), ...filters };
  if (f.mode !== "sessions" && f.mode !== "papers") return null;
  if (!f.day && !extraFilterCount(f, f.mode)) return null;
  const mode = f.mode === "sessions" ? "papers" : "sessions";
  const n = deckItems(program, store, f, mode).length;
  return n ? { mode, n } : null;
}

/** Parse "#/item/x", "#/map?room=r", "#/logistics/alex" -> { route, id, params }. Empty or unknown -> home
 * (also a route this edition leaves out: js/edition.js). */
export function parseHash(hash) {
  const raw = String(hash ?? "").replace(/^#\/?/, "");
  const [path, query = ""] = raw.split("?");
  const params = Object.fromEntries(new URLSearchParams(query));
  const [route, ...rest] = path.split("/");
  const id = rest.length ? decodeURIComponent(rest.join("/")) : null;
  if ((route === "item" || route === "person") && id) return { route, id, params };
  if (route === "logistics") return hasRoute(route) ? { route, id, params } : { route: "home", id: null, params };
  if (["home", "deck", "mine", "explore", "grid", "map", "browse", "people", "sci-k", "bari", "sparql", "rete", "ontology", "credits", "settings"].includes(route)) return { route, id: null, params };
  return { route: "home", id: null, params };
}

/**
 * The phone's "More" sheet: routes without a tab of their own -> [route, label, icon, one-line description].
 * The More tab lights up on any of them (see tabFor).
 */
const ALL_MORE_ROUTES = [
  ["grid", "Timetable", "grid", "Every session and workshop by room and time"],
  ["map", "Map", "map", "Floor plans of the venue; find a room"],
  ["browse", "Browse", "browse", "Search and filter every session and paper"],
  ["people", "People", "people", "Organisers, chairs, speakers and authors"],
  ["sci-k", "Sci-K", "flask", "The Sci-K workshop: timed programme, people and projects"],
  ["bari", "Bari", "bari", "Concerts tonight, underground venues, comics, food, day trips"],
  ["logistics", "Logistics", "logistics", "Your travel, stays and workshop agendas"],
  ["sparql", "SPARQL", "code", "Query the programme as a knowledge graph"],
  ["rete", "Built with rete", "rete", "One .rete file, no backend; the ontology; our demo on Tuesday"],
  ["ontology", "Ontology", "book", "The ic: vocabulary as a readable specification, and its Turtle"],
  ["credits", "Credits", "doc", "Image credits and data sources"],
  ["settings", "Settings", "gear", "Your data (download, import), offline use, install, version"],
];
export const MORE_ROUTES = ALL_MORE_ROUTES.filter(([r]) => hasRoute(r));

// The sections grouped, for the desktop sidebar and the phone's More sheet: [id, label, routes].
export const NAV_GROUPS = [
  ["programme", "Programme", ["home", "deck", "mine", "explore", "grid", "browse", "map"]],
  ["event", "At the conference", ["people", "sci-k", "bari", "logistics"]],
  ["data", "The data", ["sparql", "rete", "ontology"]],
  ["about", "About", ["credits", "settings"]],
];

/**
 * Nav entries ([route, …] rows) -> [{ id, label, items }] in NAV_GROUPS order, each group's items in the entries'
 * own order; a route in no group lands in a last "More" group; empty groups are dropped.
 * groupNav([["bari"], ["home"]]) -> [{ id: "programme", label: "Programme", items: [["home"]] }, { id: "event", …, items: [["bari"]] }]
 */
export function groupNav(entries) {
  const known = new Set(NAV_GROUPS.flatMap(([, , rs]) => rs));
  const groups = NAV_GROUPS.map(([id, label, rs]) => ({ id, label, items: entries.filter(([r]) => rs.includes(r)) }));
  groups.push({ id: "other", label: "More", items: entries.filter(([r]) => !known.has(r)) });
  return groups.filter((g) => g.items.length);
}

/** The group a route belongs to: groupOf("bari") -> "event"; item and person pages -> null. */
export const groupOf = (route) => NAV_GROUPS.find(([, , rs]) => rs.includes(route))?.[0] ?? null;

/**
 * Which phone tab is lit for route `r`: its own, "more" for a More route, and for an item or person page
 * the tab of the route it was opened from (`last`). tabFor("people") -> "more"; tabFor("item", "deck") -> "deck"
 */
export function tabFor(r, last = "home") {
  const base = r === "item" || r === "person" ? last : r;
  return MORE_ROUTES.some(([m]) => m === base) ? "more" : base;
}

// Session kinds whose programme label doesn't say what they are on its own ("Parallel", "Town").
const KIND_TAG = { parallel: "Parallel session", dag: "Dagstuhl-style workshop", other: "Event" };
// Paper tracks read as one paper's type ("Demos" -> "Demo").
const TRACK_TAG = { Demos: "Demo", Posters: "Poster", "Visionary Ideas": "Visionary idea" };

/**
 * What an item is, for the small tag on every row, card and tile -> { label, color, spotlight }.
 * Sessions: their kind's label and colour ("Parallel session"; the poster kind reads "Posters & demos"
 * when it has papers and "Town Hall" when it has none). Papers: their track ("Research", "Demo"), sea
 * blue, `spotlight` when the paper is one. null for anything else.
 */
export function itemTag(program, x) {
  if (Array.isArray(x?.paperIds)) {
    const k = program?.kinds?.[x.kind];
    const label = x.kind === "poster" ? (x.paperIds.length ? "Posters & demos" : "Town Hall")
      : KIND_TAG[x.kind] ?? k?.label ?? (x.kind ? String(x.kind).replace(/^./, (c) => c.toUpperCase()) : "Session");
    return { label, color: k?.color ?? "var(--sea)", spotlight: false };
  }
  if (Array.isArray(x?.authors)) return { label: TRACK_TAG[x.track] ?? (x.track || "Paper"), color: "var(--sea)", spotlight: !!x.spotlight };
  return null;
}

/** Swipe gesture tuning, shared by the deck and its tests. */
export const THRESHOLD = 0.3;  // fraction of card width that commits a swipe
export const SWIPE_MAX = 160;  // px: ...but never more than this (the wide desktop card is ~1000px across)
export const UP_THRESHOLD = 0.2; // fraction of card height that commits an upward swipe ("Maybe")
export const UP_MAX = 140;     // px cap for the upward swipe
export const UP_RATIO = 1.2;   // an upward drag counts only when |dy| > 1.2·|dx| (diagonals stay keep/skip)
export const FLICK = 0.55;     // px/ms that commits a shorter swipe
export const TAP_SLOP = 6;     // px of movement before a press becomes a drag
export const TAP_MS = 500;     // longer presses are not taps

/**
 * Outcome of one pointer gesture on the top card: "tap" (open details), "right"/"left"/"up" (swipe),
 * "spring" (dragged but not far/fast enough), "none" (cancelled or long press).
 * dx/dy: total movement; velocity/vy: px/ms over the last samples; width/height: the card's size.
 * An upward drag wins only when it is clearly vertical (|dy| > UP_RATIO·|dx|); `up: false` turns it off.
 * The reach is a share of the card's size, capped in px, so a mouse on the wide desktop card commits
 * after ~160px, like a thumb on a phone card (343px wide -> 103px).
 */
export function classifyGesture({ dx, dy = 0, moved, cancelled, duration, velocity, vy = 0, width, height = 0, up = true }) {
  if (cancelled) return moved ? "spring" : "none";
  if (!moved) return duration < TAP_MS ? "tap" : "none";
  if (up && dy < 0 && -dy > UP_RATIO * Math.abs(dx)) {
    const far = -dy > Math.min((height || width) * UP_THRESHOLD, UP_MAX);
    const flick = -vy > FLICK && -dy > 24;
    return far || flick ? "up" : "spring";
  }
  const far = Math.abs(dx) > Math.min(width * THRESHOLD, SWIPE_MAX);
  const flick = Math.abs(velocity) > FLICK && Math.abs(dx) > 24 && Math.sign(velocity) === Math.sign(dx);
  return far || flick ? (dx > 0 ? "right" : "left") : "spring";
}

// ---------- verdicts ----------
/** The three stored verdicts: right = keep, up = maybe, left = skip. */
export const VERDICTS = ["right", "up", "left"];
export const VERDICT_LABEL = { right: "Kept", up: "Maybe", left: "Skipped" };

/** Count verdicts over items -> { count, kept, maybe, skipped, sorted } (a maybe is sorted, not kept). */
export function tallyVerdicts(items, store) {
  const t = { count: 0, kept: 0, maybe: 0, skipped: 0, sorted: 0 };
  for (const x of items) {
    t.count++;
    const v = store.verdict(x.id);
    if (v === "right") t.kept++;
    else if (v === "up") t.maybe++;
    else if (v === "left") t.skipped++;
    if (v) t.sorted++;
  }
  return t;
}

/** "12 kept · 4 maybe · 3 skipped", leaving out zeros (and skipped unless `skipped`); "" when nothing. */
export function verdictSummary({ kept = 0, maybe = 0, skipped = 0 }, { withSkipped = true } = {}) {
  return [kept ? `${kept} kept` : null, maybe ? `${maybe} maybe` : null, withSkipped && skipped ? `${skipped} skipped` : null]
    .filter(Boolean).join(" · ");
}

// ---------- My ISWC timeline ----------
const MIN30 = 30 * 60 * 1000;
const sStart = (s) => Date.parse(s.startISO);
const sEnd = (s) => (s.endISO ? Date.parse(s.endISO) : sStart(s) + MIN30);

/** Half-open [start,end) intersection; a null end counts as 30 minutes. */
export function sessionsOverlap(a, b) {
  return sStart(a) < sEnd(b) && sStart(b) < sEnd(a);
}

/**
 * Right-swiped ids (and maybe ids) -> { days: [{date, entries:[{session, kept, maybe, papers, maybePapers, clash, nearKept}]}],
 *   unscheduled: [paper], unscheduledMaybe: [paper], total, maybes }.
 * A kept paper sits under its session (listed as context, kept:false, when the session itself wasn't kept);
 * maybe papers sit there too, in `maybePapers`. Entries are in time order, papers in session order.
 * clash: a kept entry whose time overlaps another kept entry on the day ("kept" here means kept as a session
 * or holding a kept paper; an entry holding only papers with their own slots (paper.talk) takes just those
 * slots' time); maybes never clash. nearKept: a maybe-only entry that overlaps a kept one.
 * Ids no longer in the program are ignored (the store keeps them). total counts kept items, maybes the maybes.
 */
export function mineTimeline(program, rightIds, maybeIds = []) {
  const entries = new Map();
  const unscheduled = [];
  const unscheduledMaybe = [];
  const entryFor = (s) => {
    if (!entries.has(s.id)) entries.set(s.id, { session: s, kept: false, maybe: false, papers: [], maybePapers: [], clash: false, nearKept: false });
    return entries.get(s.id);
  };
  let total = 0, maybes = 0;
  const place = (ids, isMaybe) => {
    for (const id of ids) {
      const x = program.byId.get(id);
      if (!x) continue;
      if (x.paperIds) {
        const e = entryFor(x);
        if (isMaybe) { e.maybe = true; maybes++; } else { e.kept = true; total++; }
      } else if (x.authors) {
        if (isMaybe) maybes++; else total++;
        const s = x.sessionId ? program.byId.get(x.sessionId) : null;
        if (s?.paperIds) entryFor(s)[isMaybe ? "maybePapers" : "papers"].push(x);
        else (isMaybe ? unscheduledMaybe : unscheduled).push(x);
      }
    }
  };
  place(rightIds, false);
  place(maybeIds, true);
  for (const e of entries.values()) {
    const order = new Map(e.session.paperIds.map((p, i) => [p, i]));
    const byOrder = (a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0);
    e.papers.sort(byOrder);
    e.maybePapers.sort(byOrder);
  }
  const firm = (e) => e.kept || e.papers.length > 0;
  // The time an entry takes: the whole session, or (when only some of its papers are picked and each has its own
  // slot, as in a workshop agenda) from the first picked talk to the end of the last one.
  const span = (e) => {
    const ps = firm(e) ? e.papers : e.maybePapers;
    if (e.kept || (!firm(e) && e.maybe) || !ps.length || ps.some((p) => !p.talk?.startISO)) return e.session;
    const starts = ps.map((p) => Date.parse(p.talk.startISO));
    const ends = ps.map((p) => (p.talk.endISO ? Date.parse(p.talk.endISO) : Date.parse(p.talk.startISO) + MIN30));
    return { startISO: new Date(Math.min(...starts)).toISOString(), endISO: new Date(Math.max(...ends)).toISOString() };
  };
  const days = program.days.map((d) => {
    const list = [...entries.values()].filter((e) => e.session.day === d.date)
      .sort((a, b) => sStart(a.session) - sStart(b.session) || (a.session.id < b.session.id ? -1 : 1));
    // Kept entries (a kept session or a kept paper) are compared with each other, but only entries the user
    // kept as a session wear the badge; a context-only session never does. Maybes only get the soft hint.
    for (const e of list) {
      const others = list.filter((o) => o !== e && firm(o) && sessionsOverlap(span(e), span(o)));
      e.clash = e.kept && others.length > 0;
      e.nearKept = !firm(e) && others.length > 0;
    }
    return { date: d.date, entries: list };
  });
  return { days, unscheduled, unscheduledMaybe, total, maybes };
}

/** An entry that holds something kept (the session, or one of its papers): what now/next and clashes look at. */
export const firmEntry = (e) => e.kept || e.papers.length > 0;

/** Maybe ids -> [{ item, session }] in programme time order (unscheduled papers last, by title). Unknown ids are dropped. */
export function maybeList(program, maybeIds) {
  const out = [];
  for (const id of maybeIds) {
    const x = program.byId.get(id);
    if (!x) continue;
    const s = x.paperIds ? x : x.sessionId ? program.byId.get(x.sessionId) ?? null : null;
    out.push({ item: x, session: s?.startISO ? s : null });
  }
  const at = (r) => (r.session ? sStart(r.session) : Infinity);
  return out.sort((a, b) => at(a) - at(b) || String(a.item.title).localeCompare(String(b.item.title)));
}

/** Day tab to open first: today's tab during the conference, else the first day with picks, else the first day. */
export function defaultMineDay(program, timeline, isoNow) {
  const today = String(isoNow).slice(0, 10);
  if (program.days.some((d) => d.date === today)) return today;
  return timeline.days.find((d) => d.entries.length)?.date ?? program.days[0]?.date ?? null;
}

/**
 * nowNext over the kept sessions ("picks") or the whole programme ("all"), always evaluated in Rome time
 * whatever offset isoNow carries. confOver: nothing in the whole programme is still to come or running.
 */
export function nowNextFor(program, timeline, isoNow, scope = "picks") {
  const iso = romeNow(new Date(Date.parse(isoNow)));
  const mine = timeline.days.flatMap((d) => d.entries.filter(firmEntry).map((e) => e.session)); // maybes are not picks
  const ends = inferEnds(program.sessions); // e.g. Keynote 2 has no end: it runs until the next Plenary item
  const r = nowNext(scope === "picks" ? mine : program.sessions, iso, ends);
  const whole = scope === "all" ? r : nowNext(program.sessions, iso, ends);
  const confOver = whole.state === "over";
  // "before" and "over" are about the conference, not about the picks: with the conference running and all
  // picks still ahead, the state is "waiting" (nothing on, next pick later).
  const state = scope === "picks" && r.state === "before" && whole.state !== "before" ? "waiting" : r.state;
  return { ...r, state, iso, scope, confOver };
}
