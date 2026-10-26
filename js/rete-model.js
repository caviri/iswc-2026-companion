// "Built with rete" (#/rete): how the app's data works (one .rete file, queried in the browser), its ontology and
// vocabularies, and the demo at ISWC 2026. Pure: content, queries and formatting; views/rete.js draws it.
// Tested in tests/app/rete.test.mjs.
import { PREFIXES } from "./sparql-model.js";

export const LINKS = {
  repo: "https://github.com/caviri/rete",
  docs: "https://caviri.github.io/rete/",
  demo: "https://demo.graphplaza.com/",
  doi: "https://doi.org/10.5281/zenodo.21546287",
  playground: "https://caviri.github.io/rete/playground.html",
};
export const DEMO_PAPER = "paper-demos-rete-browser-native-sparql-over-static-r";

/** Images on the page: local file, what it shows, and where it comes from (the rete project, Apache-2.0). */
export const IMAGES = {
  logo: { file: "img/rete/logo.svg", width: 520, height: 140, from: "rete on GitHub", url: LINKS.repo, alt: "The rete logo" },
  notebook: { file: "img/rete/jupyterlite.webp", width: 1600, height: 1244, from: "the ISWC 2026 demo", url: LINKS.demo,
    alt: "In a notebook: the same files from Python, in JupyterLite running in the browser." },
  agent: { file: "img/rete/mcpb-tools.webp", width: 982, height: 948, from: "the ISWC 2026 demo", url: LINKS.demo,
    alt: "From an agent: an assistant querying the files through the rete MCP extension." },
};

/** The vocabularies the graph uses, each with what it is used for here. */
export const VOCABULARIES = [
  { prefix: "ic", name: "ISWC 2026 Companion", use: "This app's own terms: ids, order, agendas, the city guide." },
  { prefix: "schema", name: "schema.org", use: "Events, papers, people, places, images." },
  { prefix: "skos", name: "SKOS", use: "Topics and glossary terms." },
  { prefix: "dcat", name: "DCAT", use: "Datasets, graphs in use, their endpoints." },
  { prefix: "void", name: "VoID", use: "Describing this dataset." },
  { prefix: "dcterms", name: "Dublin Core", use: "Titles, dates, versions." },
  { prefix: "prov", name: "PROV-O", use: "Where the data comes from." },
  { prefix: "owl", name: "OWL", use: "Release history." },
  { prefix: "sh", name: "SHACL", use: "The example queries." },
];

/** Classes by how many resources they have. */
export const Q_CLASSES = `SELECT ?class (COUNT(?s) AS ?n) WHERE { ?s a ?class } GROUP BY ?class ORDER BY DESC(?n)`;
/** Properties by how many triples use them. */
export const Q_PROPERTIES = `SELECT ?p (COUNT(?s) AS ?n) WHERE { ?s ?p ?o } GROUP BY ?p ORDER BY DESC(?n)`;

/** An IRI as prefix:local with the known prefixes ("http://schema.org/Event" -> "schema:Event"), else the IRI. */
export function compact(iri, prefixes = PREFIXES) {
  const s = String(iri);
  let best = null;
  for (const [p, ns] of Object.entries(prefixes)) if (s.startsWith(ns) && (!best || ns.length > best[1].length)) best = [p, ns];
  return best ? `${best[0]}:${s.slice(best[1].length)}` : s;
}

/** Rows of Q_CLASSES / Q_PROPERTIES -> [{ term, prefix, n }] (the term compacted), keeping the query's order. */
export function countRows(rows, key) {
  const v = (t) => (t && typeof t === "object" && "value" in t ? t.value : t);
  return rows.map((r) => { const term = compact(v(r[key])); return { term, prefix: term.includes(":") && !term.includes("://") ? term.split(":")[0] : null, n: Number(v(r.n)) || 0 }; });
}

/** Counts per vocabulary prefix: { prefix: triples } from property rows. */
export function byVocabulary(props) {
  const out = {};
  for (const r of props) if (r.prefix) out[r.prefix] = (out[r.prefix] ?? 0) + r.n;
  return out;
}

/** 59428 -> "59,428"; 3.98e9 -> "3.98 billion" (the demo's scale next to ours). */
export function bigNumber(n) {
  if (!Number.isFinite(n)) return "";
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)} billion`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} million`;
  return n.toLocaleString("en-GB");
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
/** A session as "19:15–21:00 on 27 October (Tuesday) at Plenary" (the room left out when unknown). */
export function demoWhen(session, room = null) {
  if (!session?.day) return "";
  const d = new Date(`${session.day}T12:00:00Z`);
  const time = session.end && /^\d\d:\d\d$/.test(session.end) ? `${session.start}–${session.end}` : session.start;
  return `${time} on ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} (${WEEKDAYS[d.getUTCDay()]})${room ? ` at ${room}` : ""}`;
}
