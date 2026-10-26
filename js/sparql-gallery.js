// Example queries for the SPARQL explorer. Most live in the graph itself (pipeline/sparql_examples.yaml ->
// sh:SPARQLExecutable resources, read with Q_EXAMPLES: exampleEntries below); this file keeps only the ones that
// depend on this device (what you kept, the app clock: their `build(ctx)` writes the values in) and the federated
// ones (`remote`).
// Every entry runs against the real app/data/iswc26.rete in tests/app/sparql-gallery.test.mjs (federated
// entries, marked `remote`, are only checked for shape there: they need the network).
// PREFIX lines are left out on purpose: the explorer adds ic:, schema:, skos:, rdfs:, rdf: and xsd: itself.

import { federatedQuery } from "./research-model.js";

/** "2026-10-27T10:30:00+01:00" shifted by `min` minutes, keeping the +01:00 offset of the data. */
export function shiftIso(iso, min) {
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return iso;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) + min * 60000;
  const d = new Date(t);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:00+01:00`;
}

const lit = (s) => `"${String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

/**
 * [{ id, title, about, query?, build?(ctx), remote? }]. `remote`: the host a federated (SERVICE) entry contacts;
 * those entries are loaded into the editor but never run on a pick. ctx = { keptIds: [id], now: Rome ISO }.
 * Use galleryQuery(entry, ctx) to get the text.
 */
export const GALLERY = [
  {
    id: "kept-rooms", title: "My kept items and their rooms", about: "What you kept on this device, with the room and floor to find it.",
    build: ({ keptIds = [] } = {}) => `# The ids below are what you kept on this device.
SELECT ?item ?start ?room ?floor WHERE {
  VALUES ?id { ${keptIds.map(lit).join(" ")} }
  ?item ic:stableId ?id .
  ?item ic:presentedIn? ?session .
  ?session schema:startDate ?start .
  OPTIONAL { ?session schema:location ?r . ?r schema:name ?room OPTIONAL { ?r ic:floor ?floor } }
}
ORDER BY ?start`,
  },
  {
    id: "now", title: "On now, give or take an hour", about: "Sessions starting within an hour of the app's clock (time travel included).",
    build: ({ now } = {}) => `# The window is the app clock (${String(now).slice(0, 16).replace("T", " ")}) ± 1 hour.
SELECT ?session ?start ?room WHERE {
  ?session a schema:Event ; schema:startDate ?start .
  OPTIONAL { ?session schema:location/schema:name ?room }
  FILTER(?start >= "${shiftIso(now, -60)}"^^xsd:dateTime &&
         ?start <= "${shiftIso(now, 60)}"^^xsd:dateTime)
}
ORDER BY ?start`,
  },
];

// Research around the programme (code, graphs, people's other work), then one federated example.
GALLERY.push(
);
const fed = federatedQuery({ id: "wikidata", name: "Wikidata", endpoint: "https://query.wikidata.org/sparql", homepage: "https://www.wikidata.org/" });
GALLERY.push({ id: "fed-wikidata", title: fed.title, about: `${fed.about} Federated: contacts ${fed.host}, so it needs a connection and runs only when you press Run.`,
  query: fed.query, remote: fed.host, uiUrl: fed.uiUrl });

/** The query text of a gallery entry for this device. */
export function galleryQuery(entry, ctx = {}) {
  return entry.build ? entry.build(ctx) : entry.query;
}

const squash = (q) => String(q).replace(/^\s*PREFIX\s+\S+\s*<[^>]*>\s*$/gim, "").replace(/\s+/g, " ").trim();

/**
 * The graph's example queries (Q_EXAMPLES rows, in gallery order) as gallery entries
 * { id, title, about, query, keywords }. Rows without an id or a query are skipped.
 */
export function exampleEntries(rows = []) {
  const v = (x) => (x && typeof x === "object" && "value" in x ? x.value : x);
  return rows.map((r) => ({ id: v(r.id), title: v(r.title) ?? v(r.id), about: v(r.about) ?? "", query: String(v(r.query) ?? "").trim(),
    keywords: v(r.keywords) ? String(v(r.keywords)).split("|") : [] })).filter((e) => e.id && e.query);
}

/** Dataset-card example queries not already in the gallery (or in `known` entries), as gallery entries. */
export function cardEntries(examples = [], known = []) {
  const have = new Set([...GALLERY, ...known].filter((e) => e.query).map((e) => squash(e.query)));
  const out = [];
  examples.forEach((q, i) => {
    if (typeof q !== "string" || !q.trim() || have.has(squash(q))) return;
    have.add(squash(q));
    out.push({ id: `card-${i}`, title: `Dataset example ${i + 1}`, about: "Shipped with the .rete file.", query: q });
  });
  return out;
}
