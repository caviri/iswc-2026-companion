// Pure view-model for the Explore view: topics (categories) and clusters with triage progress.
// No DOM; unit-tested in tests/app/explore.test.mjs.
import { emptyFilters, orderedPapers, deckItems, modeCounts } from "./model.js";

/** Number of topic colour tokens in app.css (--tp-0 … --tp-9). */
export const TOPIC_SWATCHES = 10;

// Fixed swatch per programme topic, so colours never move when counts change. Neighbouring
// hues go to related topics (LLMs next to QA, FAIR next to streams), see app.css --tp-*.
const SWATCH = {
  "llm-kg": 0,
  "question-answering": 1,
  "applications": 2,
  "quality-shacl": 3,
  "fair-metadata": 4,
  "streams-temporal": 5,
  "querying-sparql": 6,
  "reasoning-ontologies": 7,
  "kg-learning-embeddings": 8,
  "provenance-trust": 9,
};

/** Swatch index 0..9 for a topic id; ids the app doesn't know get a stable hash. */
export function topicSwatch(id) {
  if (id in SWATCH) return SWATCH[id];
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return h % TOPIC_SWATCHES;
}

/**
 * The leading chips that fit `rows` rows of about `perRow` characters (a chip costs its length + 4).
 * A chip longer than a row still gets a row of its own (CSS ellipsis); order is kept, nothing reordered.
 */
export function fitChips(labels, { perRow = 40, rows = 2 } = {}) {
  const out = [];
  let row = 1, used = 0;
  for (const l of labels) {
    const cost = Math.min(String(l).length + 4, perRow);
    if (used && used + cost > perRow) { row++; used = 0; }
    if (row > rows) break;
    out.push(l);
    used += cost;
  }
  return out;
}

/** Tile size class from a cluster's size relative to the biggest one. */
export function tierOf(size, max) {
  const r = max > 0 ? size / max : 0;
  return r >= 0.85 ? "xl" : r >= 0.6 ? "l" : r >= 0.35 ? "m" : "s";
}

const isSession = (x) => Array.isArray(x.paperIds);
/** Everything one can swipe: non-break sessions and all papers. */
const triageable = (program) => [...program.sessions.filter((s) => s.kind !== "break"), ...program.papers];

const tally = () => ({ count: 0, kept: 0, maybe: 0, skipped: 0 });
function add(t, v) {
  t.count++;
  if (v === "right") t.kept++;
  else if (v === "up") t.maybe++;
  else if (v === "left") t.skipped++;
}

/**
 * exploreModel(program, store) -> {
 *   ready,                      // false for data without clusters (old cache): show "update the data"
 *   total, kept, maybe, skipped, // over all non-break sessions and papers (maybe: sorted, not kept)
 *   categories: [{id, label, swatch, count, kept, maybe, skipped, sub, topSub, clusters:[{id, label, count}]}],  // biggest first
 *   clusters: [{id, label, terms, termIds, count, sessions, papers, kept, maybe, skipped,
 *               mix:[{topic, count}], topic, swatch, tier}],                                            // programme order
 * }
 * Topic counts count an item under each of its topics; a cluster's mix counts item-topic pairs.
 */
export function exploreModel(program, store) {
  const items = triageable(program);
  const topics = program.topics ?? {};
  const rawClusters = Array.isArray(program.clusters) ? program.clusters : [];
  const cats = new Map(Object.entries(topics).map(([id, t]) => [id, {
    id, label: t.label ?? id, swatch: topicSwatch(id), ...tally(),
    sub: Array.isArray(t.sub) ? t.sub : [], byCluster: new Map(),
  }]));
  const clus = new Map(rawClusters.map((c) => [c.id, {
    id: c.id, label: c.label, terms: c.terms ?? [], termIds: c.termIds ?? [],
    ...tally(), sessions: 0, papers: 0, mixMap: new Map(),
  }]));
  const all = tally();

  for (const x of items) {
    const v = store.verdict(x.id);
    add(all, v);
    const c = x.cluster ? clus.get(x.cluster) : null;
    if (c) {
      add(c, v);
      if (isSession(x)) c.sessions++; else c.papers++;
    }
    for (const t of x.topics ?? []) {
      const cat = cats.get(t);
      if (!cat) continue;
      add(cat, v);
      if (c) {
        cat.byCluster.set(c.id, (cat.byCluster.get(c.id) ?? 0) + 1);
        c.mixMap.set(t, (c.mixMap.get(t) ?? 0) + 1);
      }
    }
  }

  const topicOrder = [...cats.keys()];
  const max = Math.max(0, ...[...clus.values()].map((c) => c.count));
  const clusters = [...clus.values()].map(({ mixMap, ...c }) => {
    const mix = [...mixMap].map(([topic, count]) => ({ topic, count }))
      .sort((a, b) => b.count - a.count || topicOrder.indexOf(a.topic) - topicOrder.indexOf(b.topic));
    const topic = mix[0]?.topic ?? null;
    return { ...c, mix, topic, swatch: topic ? topicSwatch(topic) : null, tier: tierOf(c.count, max) };
  });
  const label = new Map(clusters.map((c) => [c.id, c.label]));
  const order = new Map(clusters.map((c, i) => [c.id, i]));
  const categories = [...cats.values()].map(({ byCluster, ...c }) => ({
    ...c,
    topSub: c.sub.slice(0, 3),
    clusters: [...byCluster].map(([id, count]) => ({ id, label: label.get(id), count }))
      .sort((a, b) => b.count - a.count || order.get(a.id) - order.get(b.id)),
  })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  return { ready: clusters.length > 0, total: all.count, kept: all.kept, maybe: all.maybe, skipped: all.skipped, categories, clusters };
}

/** A cluster's members: {sessions (by start time), papers (programme order)}. Unknown id -> empty lists. */
export function clusterItems(program, id) {
  const sessions = program.sessions.filter((s) => s.kind !== "break" && s.cluster === id && id)
    .sort((a, b) => (a.startISO < b.startISO ? -1 : a.startISO > b.startISO ? 1 : a.id < b.id ? -1 : 1));
  const papers = id ? orderedPapers(program).filter((p) => p.cluster === id) : [];
  return { sessions, papers };
}

/**
 * Deck filters that show one cluster ({cluster}) or one topic ({topic}) and nothing else.
 * Mode: whichever of sessions/papers has more cards left to sort (sessions on a tie).
 */
export function deckFiltersFor(program, store, { cluster = null, topic = null } = {}) {
  const base = { ...emptyFilters(), clusters: cluster ? [cluster] : [], topics: topic ? [topic] : [] };
  const s = deckItems(program, store, base, "sessions").length;
  const p = deckItems(program, store, base, "papers").length;
  return { ...base, mode: p > s ? "papers" : "sessions" };
}

/** Deck filters for a cluster/topic plus the cards left in each mode -> {filters, mode, sessions, papers}. */
export function swipePlan(program, store, what) {
  const filters = deckFiltersFor(program, store, what);
  return { filters, mode: filters.mode, ...modeCounts(program, store, filters) };
}

const count = (n, one) => `${n} ${n === 1 ? one : one + "s"}`;
/** Button text that says what the deck will show: the opening mode first, then the other one. */
export function swipeLabel({ mode, sessions, papers }) {
  const s = sessions ? count(sessions, "session") : null, p = papers ? count(papers, "paper") : null;
  const [a, b] = mode === "papers" ? [p, s] : [s, p];
  if (!a && !b) return "Everything here is sorted";
  return `Swipe ${a ?? b}${a && b ? `, then ${b}` : ""}`;
}
