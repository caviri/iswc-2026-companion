// Pure grouping/search logic for the Browse view. No DOM; unit-tested in tests/app/browse.test.mjs.
import { search } from "./data.js";
import { orderedPapers, dayLong } from "./model.js";
import { hasCode, hasData } from "./research-model.js";

export const DIMS = ["day", "room", "kind", "track", "topic", "cluster", "tech"];
export const DIM_LABEL = { day: "Day", room: "Room", kind: "Kind", track: "Track", topic: "Topic", cluster: "Cluster", tech: "Tech" };

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const isSession = (x) => Array.isArray(x.paperIds);
const sessionOf = (program, x) => (isSession(x) ? x : x.sessionId ? program.byId.get(x.sessionId) ?? null : null);

/**
 * Whole programme for an empty query. Day/room/kind: the non-break sessions (papers sit inside them).
 * Track: papers only (sessions have no track). Topic: sessions then papers. Sessions in time order,
 * papers in programme order (scheduled first).
 */
export function browseItems(program, dim) {
  const sessions = program.sessions.filter((s) => s.kind !== "break")
    .sort((a, b) => cmp(a.startISO, b.startISO) || cmp(a.id, b.id));
  if (dim === "track") return orderedPapers(program);
  if (dim === "topic" || dim === "tech" || dim === "cluster") return [...sessions, ...orderedPapers(program)];
  return sessions;
}

/**
 * Group items under one dimension -> [{key, label, items}]. Input order is kept inside a group.
 * Papers take day/room/kind from their session; without one they land in "Not scheduled".
 * Sessions have no track, so they gather under "Sessions". Topic grouping lists an item under each topic.
 * Tech grouping lists an item under each glossary term it mentions; terms with most items first.
 * Cluster grouping: one group per cluster in programme order (biggest first), "No cluster" last.
 */
export function groupItems(program, items, dim) {
  const groups = new Map();
  const put = (key, label, rank, x) => {
    if (!groups.has(key)) groups.set(key, { key, label, rank, items: [] });
    groups.get(key).items.push(x);
  };
  const dayRank = new Map(program.days.map((d, i) => [d.date, i]));
  const roomRank = new Map(program.rooms.map((r, i) => [r.id, i]));
  const kindRank = new Map(Object.keys(program.kinds).map((k, i) => [k, i]));
  const clusters = new Map((program.clusters ?? []).map((c, i) => [c.id, { label: c.label, rank: i }]));
  const LAST = 1e6;
  for (const x of items) {
    const s = sessionOf(program, x);
    if (dim === "track") {
      if (isSession(x)) put("~sessions", "Sessions", LAST + 1, x);
      else if (x.track) put(x.track, x.track, 0, x);
      else put("~none", "No track", LAST, x);
    } else if (dim === "cluster") {
      const c = clusters.get(x.cluster);
      if (c) put(x.cluster, c.label, c.rank, x); else put("~none", "No cluster", LAST, x);
    } else if (dim === "tech") {
      const ts = (x.terms ?? []).filter((t) => program.glossary?.[t]);
      if (!ts.length) put("~none", "No tech term", LAST, x);
      for (const t of ts) put(t, program.glossary[t].term, 0, x);
    } else if (dim === "topic") {
      if (!x.topics.length) put("~none", "No topic", LAST, x);
      for (const t of x.topics) put(t, program.topics[t]?.label ?? t, 0, x);
    } else if (!s) {
      put("~unsched", "Not scheduled", LAST, x);
    } else if (dim === "room") {
      const r = s.roomId ? program.byId.get(s.roomId) : null;
      if (s.allRooms) put("~all", "All rooms", LAST, x);
      else if (r) put(r.id, r.name, roomRank.get(r.id) ?? 0, x);
      else put("~noroom", "No room", LAST + 1, x);
    } else if (dim === "kind") {
      put(s.kind, program.kinds[s.kind]?.label ?? s.kind, kindRank.get(s.kind) ?? LAST, x);
    } else {
      put(s.day, dayLong(s.day), dayRank.get(s.day) ?? LAST, x);
    }
  }
  const out = [...groups.values()];
  const byLabel = dim === "track" || dim === "topic";
  if (dim === "tech") {
    out.sort((a, b) => a.rank - b.rank || b.items.length - a.items.length || a.label.localeCompare(b.label));
    return out.map(({ key, label, items }) => ({ key, label, items }));
  }
  out.sort((a, b) => a.rank - b.rank || (byLabel ? a.label.localeCompare(b.label) : cmp(a.key, b.key)));
  return out.map(({ key, label, items }) => ({ key, label, items }));
}

/**
 * Search text (or the whole programme when blank) grouped by dim -> {groups, total, nSessions, nPapers}.
 * `term` (a glossary id) keeps only items that mention it, sessions and papers in every grouping
 * (sessionless papers under "Not scheduled"); unknown ids are ignored.
 * `has` { code, data }: keep only items with code (GitHub / Hugging Face) and / or data (datasets or a
 * knowledge graph they use); like a term filter, papers are listed in every grouping.
 * `day` ("2026-10-27"): keep only sessions on that day and papers whose session is on it (unscheduled papers drop out).
 */
export function runBrowse(program, text, dim, term = null, has = {}, day = null) {
  const d = DIMS.includes(dim) ? dim : "day";
  const q = String(text ?? "").trim();
  const t = term && program.glossary?.[term] ? term : null;
  // A term filter lists papers too in every grouping (they group under their session's day/room/kind),
  // so the list matches the popover's "N items mention this".
  const flagged = !!(has?.code || has?.data);
  let items = q ? search(program, q) : browseItems(program, t || flagged ? "topic" : d);
  if (t) items = items.filter((x) => x.terms?.includes(t));
  if (has?.code) items = items.filter(hasCode);
  if (has?.data) items = items.filter(hasData);
  if (day) items = items.filter((x) => sessionOf(program, x)?.day === day);
  const nSessions = items.filter(isSession).length;
  let groups = groupItems(program, items, d);
  if (t && d === "tech") groups = groups.filter((g) => g.key === t);
  return { groups, total: items.length, nSessions, nPapers: items.length - nSessions };
}

const isDay = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** A day route param or stored value -> "YYYY-MM-DD" when it's one of the programme's days, else null. */
export function dayFromParam(program, v) {
  return isDay(v) && (program.days ?? []).some((d) => d.date === v) ? v : null;
}

/** Untrusted sessionStorage payload -> {q, dim, scroll, has: {code, data}, day: "YYYY-MM-DD" | null}. */
export function normalizeState(raw) {
  const o = raw && typeof raw === "object" ? raw : {};
  const scroll = Number.isFinite(o.scroll) && o.scroll > 0 ? Math.round(o.scroll) : 0;
  const has = o.has && typeof o.has === "object" ? o.has : {};
  return { q: typeof o.q === "string" ? o.q : "", dim: DIMS.includes(o.dim) ? o.dim : "day", scroll,
    has: { code: has.code === true, data: has.data === true }, day: isDay(o.day) ? o.day : null };
}

/** `has` route param ("code", "data", "code,data") -> { code, data }, or null when it names neither. */
export function hasFromParam(v) {
  const parts = String(v ?? "").split(",");
  return parts.includes("code") || parts.includes("data") ? { code: parts.includes("code"), data: parts.includes("data") } : null;
}

/** The browse route for a term filter, has flags and a day, so Back and reload keep them. */
export function browseRoute(term, has = {}, day = null) {
  const q = [];
  if (term) q.push(`term=${encodeURIComponent(term)}`);
  if (isDay(day)) q.push(`day=${day}`);
  const hs = ["code", "data"].filter((k) => has[k]);
  if (hs.length) q.push(`has=${hs.join(",")}`);
  return "#/browse" + (q.length ? "?" + q.join("&") : "");
}
