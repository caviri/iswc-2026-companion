// Research around the programme: code, datasets, the knowledge graphs items use (with their live SPARQL
// endpoints), people's other work and self-declared profiles. Pure (no DOM); unit-tested in
// tests/app/research.test.mjs. Every url goes through safeUrl (https only); data without these fields
// gives empty groups, so older programme files render as before.
import { safeUrl, LINK_KINDS } from "./people-model.js";

const READ = new Set(["doi", "arxiv", "pdf", "landing", "openalex", "hf-paper"]);
const CODE = new Set(["code", "hf-model", "hf-space"]);
const DATA = new Set(["dataset", "hf-dataset"]);
const SOURCES = { openalex: "OpenAlex", dblp: "DBLP", wikidata: "Wikidata" };
const sourceLabel = (s) => (s ? SOURCES[s] ?? String(s) : "");
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
const urlKey = (u) => String(u).toLowerCase().replace(/\/+$/, "");
const HF_LABEL = { "hf-paper": "Hugging Face paper", "hf-model": "Hugging Face model", "hf-dataset": "Hugging Face dataset", "hf-space": "Hugging Face Space" };

/** "https://github.com/owner/repo" -> { owner, repo } (null for anything else). */
export function repoOf(url) {
  const m = /^https:\/\/(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i.exec(String(url ?? ""));
  return m ? { owner: m[1], repo: m[2] } : null;
}

/** A Hugging Face url's "owner/name" (or the path), for labels. */
function hfName(url) {
  const m = /^https:\/\/huggingface\.co\/(?:datasets\/|spaces\/|papers\/)?(.+?)\/?$/i.exec(url);
  return m ? m[1] : hostOf(url);
}

/** A DOI url's "10.x/y" part, or the host. */
function dataLabel(url) {
  const m = /^https:\/\/(?:dx\.)?doi\.org\/(10\..+)$/i.exec(url);
  if (m) return m[1];
  return hostOf(url);
}

/**
 * Endpoint liveness -> { state: "live"|"down"|"unknown", cors: true|false|null, queryable, label }.
 * `queryable`: the app can query it from the browser (live and allows cross-origin requests).
 */
/** Star count as text: "1,234", or "1.2k" when `compact` (tight cards). */
export const starText = (n, compact = false) => (compact && n >= 1000 ? `${(Math.floor(n / 100) / 10).toLocaleString("en")}k` : n.toLocaleString("en"));

export function graphStatus(live) {
  const ok = live && typeof live === "object" ? live.ok : null;
  const cors = live && typeof live === "object" && typeof live.cors === "boolean" ? live.cors : null;
  const state = ok === true ? "live" : ok === false ? "down" : "unknown";
  // A snapshot from the last enrichment run, not a live probe: the wording says so.
  const label = state === "live" ? "Live at last check" : state === "down" ? "Down at last check" : "Not checked";
  return { state, cors, queryable: state === "live" && cors === true, label };
}

/**
 * Graphs an item uses -> [{ id, name, homepage, endpoint, status, source }], one per graph, in link order.
 * `graph-used` links come in pairs (endpoint + homepage) tied by `via` (the graph id); the top-level
 * program.graphs supplies the name and the canonical endpoint list. Unknown graphs fall back to the host.
 */
export function graphsOf(program, links) {
  const byId = new Map((program?.graphs ?? []).map((g) => [g.id, g]));
  const out = new Map();
  for (const l of links ?? []) {
    if (l?.kind !== "graph-used") continue;
    const url = safeUrl(l.url);
    if (!url) continue;
    const id = l.via ?? hostOf(url);
    const g = byId.get(id);
    if (!out.has(id)) {
      out.set(id, { id, name: g?.name ?? hostOf(url), homepage: safeUrl(g?.homepage) ?? null, endpoint: null, status: graphStatus(null), source: sourceLabel(l.source), logo: g?.logo ?? null });
    }
    const e = out.get(id);
    const ep = (g?.endpoints ?? []).find((x) => urlKey(x.url) === urlKey(url));
    if (ep || l.live) {
      if (!e.endpoint) { e.endpoint = url; e.status = graphStatus(ep?.live ?? l.live); }
    } else if (!e.homepage) e.homepage = url;
  }
  // A graph whose endpoint link is missing still gets its first known endpoint.
  for (const e of out.values()) {
    if (e.endpoint) continue;
    const ep = (byId.get(e.id)?.endpoints ?? []).find((x) => safeUrl(x.url));
    if (ep) { e.endpoint = safeUrl(ep.url); e.status = graphStatus(ep.live); }
  }
  return [...out.values()];
}

/**
 * Item links grouped for display -> { read, code, data, graphs }.
 * read: [{kind,label,icon,url,source}]; code: [{...,owner,repo,stars}]; data: [{...}]; graphs: see graphsOf.
 * Kinds the app doesn't know go to `read` as a plain "Link". Identical urls show once.
 */
export function groupLinks(program, links) {
  const seen = new Set();
  const g = { read: [], code: [], data: [], graphs: graphsOf(program, links) };
  for (const l of links ?? []) {
    if (!l || l.kind === "graph-used") continue;
    const url = safeUrl(l.url);
    if (!url || seen.has(urlKey(url))) continue;
    seen.add(urlKey(url));
    const k = LINK_KINDS[l.kind] ?? { label: HF_LABEL[l.kind] ?? "Link", icon: l.kind?.startsWith("hf-") ? "hf" : "link" };
    const base = { kind: l.kind, label: HF_LABEL[l.kind] ?? k.label, icon: l.kind?.startsWith("hf-") ? "hf" : k.icon, url, source: sourceLabel(l.source) };
    if (CODE.has(l.kind)) {
      const r = l.kind === "code" ? repoOf(url) : null;
      g.code.push({ ...base, owner: r?.owner ?? null, repo: r?.repo ?? (l.kind === "code" ? hostOf(url) : hfName(url)),
        stars: Number.isFinite(l.stars) ? l.stars : null });
    } else if (DATA.has(l.kind)) {
      const zen = /zenodo/i.test(url);
      g.data.push({ ...base, label: zen ? "Zenodo dataset" : base.label, name: l.kind === "hf-dataset" ? hfName(url) : dataLabel(url) });
    }
    else g.read.push(base);
  }
  g.code.sort((a, b) => (b.stars ?? -1) - (a.stars ?? -1));
  // Two links of one kind on different hosts get the host in the label ("PDF · arxiv.org").
  const hosts = new Map();
  for (const l of g.read) hosts.set(l.kind, [...(hosts.get(l.kind) ?? []), hostOf(l.url)]);
  g.read = g.read.map((l) => (new Set(hosts.get(l.kind)).size > 1 ? { ...l, label: `${l.label} · ${hostOf(l.url)}` } : l));
  return g;
}

/** Quick flags for rows and filters. */
export function researchFlags(x) {
  const ks = new Set((x?.links ?? []).filter((l) => safeUrl(l?.url)).map((l) => l.kind));
  const code = [...CODE].some((k) => ks.has(k));
  const data = [...DATA].some((k) => ks.has(k)) || ks.has("graph-used");
  return { code, data };
}
export const hasCode = (x) => researchFlags(x).code;
/** Datasets, Hugging Face datasets or a knowledge graph it uses. */
export const hasData = (x) => researchFlags(x).data;

// ---- federated queries ----

const LABEL = "PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>";
/** Graph-appropriate examples: each keeps its LIMIT inside SERVICE (the engine sends only that block). */
const EXAMPLES = {
  wikidata: {
    title: "Earlier ISWCs on Wikidata",
    about: "Past editions of this conference with their start dates, fetched live from Wikidata.",
    prefixes: ["PREFIX wdt: <http://www.wikidata.org/prop/direct/>", LABEL],
    body: [
      "SELECT ?edition ?name ?start WHERE {",
      "  ?edition wdt:P179 ?series .",
      '  ?series rdfs:label "International Semantic Web Conference"@en .',
      '  ?edition rdfs:label ?name . FILTER(LANG(?name) = "en")',
      "  OPTIONAL { ?edition wdt:P580 ?start }",
      "} LIMIT 30"],
    order: "ORDER BY DESC(?start)",
  },
  orkg: {
    title: "Knowledge-graph papers in ORKG",
    about: "Papers in the Open Research Knowledge Graph whose title mentions knowledge graphs.",
    prefixes: [LABEL],
    body: [
      "SELECT ?paper ?title WHERE {",
      "  ?paper a <http://orkg.org/orkg/class/Paper> ; rdfs:label ?title .",
      '  FILTER(CONTAINS(LCASE(STR(?title)), "knowledge graph"))',
      "} LIMIT 20"],
  },
  yago: {
    title: "The Semantic Web in YAGO",
    about: "What YAGO says about the Semantic Web itself.",
    prefixes: [],
    body: [
      "SELECT ?property ?value WHERE {",
      "  <http://yago-knowledge.org/resource/Semantic_Web> ?property ?value",
      "} LIMIT 25"],
  },
};

/**
 * A federated query for one graph's endpoint -> { query, remote, endpoint, host, title, about, uiUrl }.
 * `query` runs in the explorer (SERVICE, with the LIMIT inside it: the engine sends only that block, so
 * a LIMIT outside would not reach the endpoint); `remote` is the same question in the endpoint's own
 * terms, for its web UI (`uiUrl`: prefilled when the endpoint supports that, else its homepage).
 */
export function federatedQuery(graph) {
  const endpoint = safeUrl(graph?.endpoint) ?? safeUrl(graph?.endpoints?.find((e) => safeUrl(e?.url))?.url);
  if (!endpoint) return null;
  const ex = EXAMPLES[graph.id] ?? {
    title: `A first look at ${graph.name ?? hostOf(endpoint)}`,
    about: "Ten triples from the endpoint, to see its vocabulary.",
    prefixes: [],
    body: ["SELECT ?s ?p ?o WHERE { ?s ?p ?o } LIMIT 10"],
  };
  const head = ex.prefixes.map((p) => p + "\n").join("");
  const query = `${head}# Contacts ${hostOf(endpoint)} when you press Run.
SELECT * WHERE {
  SERVICE <${endpoint}> {
${ex.body.map((l) => "    " + l).join("\n")}
  }
}${ex.order ? "\n" + ex.order : ""}`;
  const remote = head + ex.body.join("\n");
  return { query, remote, endpoint, host: hostOf(endpoint), title: ex.title, about: ex.about, uiUrl: endpointUi(graph, endpoint, remote) };
}

/** The endpoint's own web UI, prefilled with `remote` when it supports that (Wikidata), else its homepage. */
export function endpointUi(graph, endpoint, remote) {
  if (/^https:\/\/query\.wikidata\.org\/sparql$/.test(endpoint)) return `https://query.wikidata.org/#${encodeURIComponent(remote)}`;
  return safeUrl(graph?.homepage) ?? endpoint;
}

/** The explorer route that opens with `query` in the editor (never run automatically). */
export const explorerHref = (query) => `#/sparql?q=${encodeURIComponent(query)}`;

// ---- people ----

const SELF = "ORCID (self-declared)";
const PROFILE_KINDS = {
  github: { label: "GitHub", icon: "code" }, huggingface: { label: "Hugging Face", icon: "hf" },
  scholar: { label: "Google Scholar", icon: "scholar" }, homepage: { label: "Homepage", icon: "home" },
};

/**
 * A person's profiles -> { verified: [...], declared: [...] } of {kind,label,icon,url,source}.
 * verified: ORCID, DBLP, OpenAlex, Wikidata, homepage matched through their papers or Wikidata;
 * declared: links the person lists on their own ORCID record (shown with that source).
 */
export function personProfiles(person) {
  const seen = new Set();
  const take = (l, k) => {
    const url = safeUrl(l?.url);
    if (!url || seen.has(urlKey(url))) return null;
    seen.add(urlKey(url));
    return { kind: l.kind, label: k.label, icon: k.icon, url, source: l.source === SELF ? SELF : sourceLabel(l.source) };
  };
  const links = person?.links ?? [];
  const verified = links.filter((l) => l.source !== SELF && ["orcid", "dblp", "openalex", "wikidata", "homepage"].includes(l.kind))
    .map((l) => take(l, LINK_KINDS[l.kind])).filter(Boolean);
  const declared = links.filter((l) => l.source === SELF && PROFILE_KINDS[l.kind])
    .map((l) => take(l, PROFILE_KINDS[l.kind])).filter(Boolean);
  // A kind twice on different hosts: add the host ("Homepage · cs.vu.nl").
  const all = [...verified, ...declared];
  const fix = (l) => (all.filter((x) => x.kind === l.kind).length > 1 ? { ...l, label: `${l.label} · ${hostOf(l.url)}` } : l);
  return { verified: verified.map(fix), declared: declared.map(fix) };
}

/** Up to 5 recent works with a safe url, newest first (as stored), -> [{title,year,venue,citedBy,url,host}]. */
export function recentWorks(person, max = 5) {
  return (person?.works ?? []).map((w) => ({ ...w, url: safeUrl(w.url) })).filter((w) => w.url && w.title)
    .slice(0, max).map((w) => ({ title: w.title, year: w.year ?? null, venue: w.venue ?? null, citedBy: w.citedBy ?? 0, url: w.url, host: hostOf(w.url) }));
}

/** Up to 5 datasets with a safe url -> [{title,year,url,host}]. */
export function personDatasets(person, max = 5) {
  return (person?.datasets ?? []).map((d) => ({ ...d, url: safeUrl(d.url) })).filter((d) => d.url && d.title)
    .slice(0, max).map((d) => ({ title: d.title, year: d.year ?? null, url: d.url, host: hostOf(d.url) }));
}

// ---- the programme's open source & data (Home) ----

/**
 * -> { code: [{item, repo, repos}], data: [{item, links}], graphs: [{graph, items, endpoint, status}], withData, total }.
 * withData: items with a dataset or a graph they use (what Browse's "Has data" lists).
 * code: one entry per item (its most starred repo), most stars first; data: items with datasets;
 * graphs: the curated graphs with the items that use them, most used first. Empty lists when absent.
 */
export function researchHighlights(program) {
  const items = [...(program?.sessions ?? []), ...(program?.papers ?? [])];
  const code = [], data = [];
  const uses = new Map();
  for (const x of items) {
    const g = groupLinks(program, x.links);
    if (g.code.length) code.push({ item: x, repo: g.code[0], repos: g.code.length });
    if (g.data.length) data.push({ item: x, links: g.data });
    for (const gr of g.graphs) uses.set(gr.id, [...(uses.get(gr.id) ?? []), x]);
  }
  code.sort((a, b) => (b.repo.stars ?? -1) - (a.repo.stars ?? -1) || a.item.title.localeCompare(b.item.title));
  data.sort((a, b) => b.links.length - a.links.length || a.item.title.localeCompare(b.item.title));
  const known = new Map((program?.graphs ?? []).map((g) => [g.id, g]));
  const graphs = [...uses].map(([id, its]) => {
    const g = known.get(id);
    const ep = (g?.endpoints ?? []).find((e) => safeUrl(e.url));
    return { graph: { id, name: g?.name ?? id, homepage: safeUrl(g?.homepage), logo: g?.logo ?? null }, items: its, endpoint: ep ? safeUrl(ep.url) : null, status: graphStatus(ep?.live) };
  }).sort((a, b) => b.items.length - a.items.length || a.graph.name.localeCompare(b.graph.name));
  return { code, data, graphs, withData: items.filter(hasData).length, total: code.length + data.length + graphs.length };
}
