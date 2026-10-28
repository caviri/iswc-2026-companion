// Pure view-model for Home: hero state, what's on now / next, the sliders (today's picks, keynotes,
// workshops, discover) and quick stats.
// No DOM; every function takes "now" as a Rome ISO string (from js/clock.js). Tested in tests/app/home.test.mjs.
import { inferEnds } from "./time.js";
import { dayShort, dayLong, mineTimeline, nowNextFor, tallyVerdicts } from "./model.js";

const DAY_MS = 864e5;
const dateOf = (iso) => String(iso).slice(0, 10);
const addDays = (date, n) => new Date(Date.parse(`${date}T12:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const dayDiff = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / DAY_MS);
const whenOf = (date, today) => (date === today ? "today" : date === addDays(today, 1) ? "tomorrow" : "later");

// Inferred ends (e.g. Keynote 2 has none) depend only on the session list: computed once per programme.
const endsCache = new WeakMap();
function endsOf(program) {
  if (!endsCache.has(program.sessions)) endsCache.set(program.sessions, inferEnds(program.sessions));
  return endsCache.get(program.sessions);
}
const startMs = (s) => Date.parse(s.startISO);
const endMs = (program, s) => (s.endISO ? Date.parse(s.endISO) : endsOf(program).get(s.id) ?? startMs(s) + 30 * 6e4);
const isSession = (x) => Array.isArray(x?.paperIds);
const breaksLast = (list) => [...list.filter((s) => s.kind !== "break"), ...list.filter((s) => s.kind === "break")];
/** "Sun 25 – Thu 29 Oct" */
const spanText = (program) => {
  const d = program.days;
  return d.length ? `${dayShort(d[0].date)} – ${dayLong(d[d.length - 1].date)}` : "";
};

/**
 * heroModel(program, store, iso) -> { phase: "before"|"during"|"after", title, date, time, dayIndex, daysToGo, sub, picksLeft }
 * after: past the last day, or the last session of the conference is over.
 */
export function heroModel(program, store, iso) {
  const today = dateOf(iso);
  const days = program.days.map((d) => d.date);
  const first = days[0], last = days[days.length - 1];
  const time = String(iso).slice(11, 16);
  const span = spanText(program);
  const base = { date: dayLong(today), time, dayIndex: 0, daysToGo: 0, picksLeft: 0 };
  const confOver = nowNextFor(program, { days: [] }, iso, "all").confOver;
  if (!first || today > last || (today === last && confOver)) {
    return { ...base, phase: "after", title: "That's a wrap", sub: span ? `ISWC 2026 ran ${span} in Bari.` : "ISWC 2026 is over." };
  }
  if (today < first) {
    const n = dayDiff(today, first);
    return { ...base, phase: "before", daysToGo: n, title: n === 1 ? "ISWC 2026 starts tomorrow" : `ISWC 2026 starts in ${n} days`, sub: `Bari, ${span}` };
  }
  const i = days.indexOf(today);
  const t = Date.parse(iso);
  const tl = mineTimeline(program, store.rightIds());
  const picksLeft = (tl.days.find((d) => d.date === today)?.entries ?? []).filter((e) => endMs(program, e.session) > t).length;
  return {
    ...base, phase: "during", dayIndex: i + 1, picksLeft,
    title: i >= 0 ? `Day ${i + 1}` : dayLong(today),
    sub: program.days[i]?.subtitle ?? "",
  };
}

/**
 * What's on: nowNextFor plus, per session, how far it has run (pct 0..1, minsLeft) or how soon it starts (inMin).
 * Breaks are listed after real sessions. When the next slot holds only breaks (Registration, Coffee), the first
 * real sessions after it are added to `next` too, so "First up" never shows just a coffee break.
 * -> { state, confOver, scope, iso, now: [{session, pct, minsLeft}], next: [{session, inMin}] }
 */
export function whatsOn(program, rightIds, iso, scope = "picks") {
  const tl = mineTimeline(program, rightIds);
  const r = nowNextFor(program, tl, iso, scope);
  const t = Date.parse(iso);
  if (r.next.length && r.next.every((s) => s.kind === "break")) {
    const pool = (scope === "picks" ? tl.days.flatMap((d) => d.entries.map((e) => e.session)) : program.sessions)
      .filter((s) => s.kind !== "break" && startMs(s) > t);
    const first = Math.min(...pool.map(startMs));
    r.next = [...r.next, ...pool.filter((s) => startMs(s) === first && s.day === r.next[0].day)];
  }
  const now = breaksLast(r.now).map((session) => {
    const a = startMs(session), b = endMs(program, session);
    return { session, pct: b > a ? Math.min(1, Math.max(0, (t - a) / (b - a))) : 0, minsLeft: Math.max(0, Math.round((b - t) / 6e4)) };
  });
  const next = [...r.next].sort((x, y) => startMs(x) - startMs(y) || (x.kind === "break") - (y.kind === "break")).map((session) => ({ session, inMin: Math.max(0, Math.round((startMs(session) - t) / 6e4)) }));
  return { ...r, now, next };
}

// Session end times (ms), sorted, per programme: what's "past" only changes when now crosses one of them.
const endsSorted = new WeakMap();
/**
 * "<date>|<sessions ended so far>": changes only on a new day or when a session ends. picksAhead,
 * keynoteCards and workshopsAhead give the same answer for the same key (given the same picks).
 */
export function pastKey(program, iso) {
  if (!endsSorted.has(program.sessions)) {
    endsSorted.set(program.sessions, program.sessions.filter((s) => !Number.isNaN(startMs(s))).map((s) => endMs(program, s)).sort((a, b) => a - b));
  }
  const ends = endsSorted.get(program.sessions);
  const t = Date.parse(iso);
  let lo = 0, hi = ends.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (ends[mid] <= t) lo = mid + 1; else hi = mid; }
  return `${dateOf(iso)}|${lo}`;
}

/** The item the hero art is drawn from: a (non-break) session on now, else next, else the next keynote. */
export function featuredItem(program, rightIds, iso, scope = "picks") {
  const r = whatsOn(program, rightIds, iso, scope);
  const real = [...r.now.map((x) => x.session), ...r.next.map((x) => x.session)].find((s) => s.kind !== "break");
  if (real) return real;
  const t = Date.parse(iso);
  const keys = program.sessions.filter((s) => s.kind === "keynote").sort((a, b) => startMs(a) - startMs(b));
  return keys.find((s) => endMs(program, s) > t)
    ?? [...program.sessions].reverse().find((s) => s.kind === "ceremony")
    ?? keys[keys.length - 1] ?? program.sessions.find((s) => s.kind !== "break") ?? null;
}

/**
 * Your picks for today (while any is still to come), else for the next day with picks.
 * -> null | { date, when: "today"|"tomorrow"|"later", entries: [{session, kept, papers, past}], firstUpcoming }
 */
export function picksAhead(program, rightIds, iso) {
  const tl = mineTimeline(program, rightIds);
  const today = dateOf(iso);
  const t = Date.parse(iso);
  for (const d of tl.days) {
    if (d.date < today || !d.entries.length) continue;
    const entries = d.entries.map((e) => ({ ...e, past: endMs(program, e.session) <= t }));
    const firstUpcoming = entries.findIndex((e) => !e.past);
    if (firstUpcoming < 0) continue;
    return { date: d.date, when: whenOf(d.date, today), entries, firstUpcoming };
  }
  return null;
}

/** Keynotes in time order -> { items: [{session, speaker, personId, affiliation, talkTitle, past}], firstUpcoming (-1: all over) } */
export function keynoteCards(program, iso) {
  const t = Date.parse(iso);
  const items = program.sessions.filter((s) => s.kind === "keynote" && !Number.isNaN(startMs(s)))
    .sort((a, b) => startMs(a) - startMs(b))
    .map((s) => {
      const p = s.speakerId ? program.byId.get(s.speakerId) : null;
      return {
        session: s, speaker: s.speaker ?? null, affiliation: s.affiliation ?? null, talkTitle: s.talkTitle ?? null,
        personId: p && Array.isArray(p.itemIds) ? p.id : null, past: endMs(program, s) <= t,
      };
    });
  return { items, firstUpcoming: items.findIndex((x) => !x.past) };
}

const WORKSHOP_KINDS = ["workshop", "tutorial", "dag"];
/** Workshops and tutorials (and Dagstuhl-style sessions) today while any is still on, else on the next day that has them. */
export function workshopsAhead(program, iso) {
  const today = dateOf(iso);
  const t = Date.parse(iso);
  for (const d of program.days) {
    if (d.date < today) continue;
    const items = program.sessions.filter((s) => s.day === d.date && WORKSHOP_KINDS.includes(s.kind))
      .sort((a, b) => startMs(a) - startMs(b) || (a.title < b.title ? -1 : 1));
    if (!items.length || !items.some((s) => endMs(program, s) > t)) continue;
    return { date: d.date, when: whenOf(d.date, today), items };
  }
  return null;
}

function seeded(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Up to n sessions and papers not sorted yet, next events first: what is still to come today, soonest first
 * (a paper by its own talk slot, else its session), then the rest shuffled with the date as seed (the same
 * pick all day, a new one tomorrow). Anything already over is left out (earlier days, and today's ended ones).
 */
export function discover(program, store, iso, n = 12) {
  const today = dateOf(iso);
  const t = Date.parse(iso);
  // When it happens: [startMs, endMs] (a paper's own talk slot, else its session's), or null when unscheduled.
  const span = (x) => {
    if (isSession(x)) return Number.isNaN(startMs(x)) ? null : [startMs(x), endMs(program, x)];
    const s = x.sessionId ? program.byId.get(x.sessionId) : null;
    if (!s || Number.isNaN(startMs(s))) return null;
    return x.talk?.startISO ? [Date.parse(x.talk.startISO), x.talk.endISO ? Date.parse(x.talk.endISO) : endMs(program, s)] : [startMs(s), endMs(program, s)];
  };
  const dayOf = (x) => (isSession(x) ? x.day : x.sessionId ? program.byId.get(x.sessionId)?.day : null);
  const pool = [...program.sessions.filter((s) => s.kind !== "break"), ...program.papers]
    .filter((x) => !store.verdict(x.id) && !(dayOf(x) && dayOf(x) < today) && !(span(x) && span(x)[1] <= t))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const rnd = seeded(`discover|${today}`);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const soon = pool.filter((x) => dayOf(x) === today).sort((a, b) => span(a)[0] - span(b)[0]);
  return [...soon, ...pool.filter((x) => dayOf(x) !== today)].slice(0, n);
}

/**
 * { total, sorted, kept, maybe, pct, notes, people } over everything one can swipe (non-break sessions and
 * papers). A maybe counts as sorted (it left the deck) but not as kept.
 */
export function homeStats(program, store) {
  const items = [...program.sessions.filter((s) => s.kind !== "break"), ...program.papers];
  const { sorted, kept, maybe } = tallyVerdicts(items, store);
  const notes = [...program.sessions, ...program.papers].filter((x) => store.note(x.id)).length;
  const pct = items.length ? (sorted ? Math.max(1, Math.round((100 * sorted) / items.length)) : 0) : 0;
  return { total: items.length, sorted, kept, maybe, pct, notes, people: program.people?.length ?? 0 };
}
