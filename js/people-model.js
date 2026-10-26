// Pure helpers for people pages and external links. No DOM; unit-tested in tests/app/people.test.mjs.

/** Every external URL goes through here: https only, no credentials, no whitespace/quote/angle characters. */
export function safeUrl(u) {
  if (typeof u !== "string" || /[\s"'<>`{}\\]/.test(u)) return null;
  try {
    const x = new URL(u);
    return x.protocol === "https:" && !x.username && !x.password && x.hostname ? u : null;
  } catch { return null; }
}

/** ISO 3166 alpha-2 code -> flag emoji ("" for anything else). */
export function flag(cc) {
  if (typeof cc !== "string" || !/^[A-Za-z]{2}$/.test(cc)) return "";
  return String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 0x1F1A5 + c.charCodeAt(0)));
}

/** Link kinds: label and icon name (ui.js). Unknown kinds fall back to a generic "Link". */
export const LINK_KINDS = {
  orcid: { label: "ORCID", icon: "orcid" },
  dblp: { label: "DBLP", icon: "dblp" },
  openalex: { label: "OpenAlex", icon: "openalex" },
  homepage: { label: "Homepage", icon: "home" },
  wikidata: { label: "Wikidata", icon: "graph" },
  doi: { label: "DOI", icon: "doi" },
  arxiv: { label: "arXiv", icon: "doc" },
  pdf: { label: "PDF", icon: "pdf" },
  dataset: { label: "Dataset", icon: "dataset" },
  code: { label: "Code", icon: "code" },
  landing: { label: "Landing page", icon: "link" },
};
const SOURCES = { openalex: "OpenAlex", dblp: "DBLP", wikidata: "Wikidata", constructed: "built from the name" };
const kindOf = (k) => LINK_KINDS[k] ?? { label: "Link", icon: "link" };
const sourceLabel = (s) => (s ? SOURCES[s] ?? String(s) : "");

const enc = (t) => encodeURIComponent(t).replace(/['()*!]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());

/** Search links are built here from the name (they are searches, not verified profiles). */
export function searchLinks(name) {
  return [
    { kind: "scholar-search", label: "Search Google Scholar", icon: "search", url: `https://scholar.google.com/scholar?q=${enc(`"${name}"`)}`, source: "" },
    { kind: "s2-search", label: "Search Semantic Scholar", icon: "search", url: `https://www.semanticscholar.org/search?q=${enc(name)}`, source: "" },
  ];
}

const shape = (l) => {
  const url = safeUrl(l?.url);
  if (!url) return null;
  const k = kindOf(l.kind);
  return { kind: l.kind, label: k.label, icon: k.icon, url, source: sourceLabel(l.source) };
};

const hostOf = (u) => new URL(u).hostname.replace(/^www\./, "");
const urlKey = (u) => u.toLowerCase().replace(/\/+$/, "");

/** Drop identical urls; when a kind repeats on different hosts, the label gets the host ("Homepage · cs.vu.nl"). */
function finish(list) {
  const seen = new Set();
  const out = list.filter((l) => !seen.has(urlKey(l.url)) && seen.add(urlKey(l.url)));
  const hosts = new Map();
  for (const l of out) hosts.set(l.kind, [...(hosts.get(l.kind) ?? []), hostOf(l.url)]);
  return out.map((l) => {
    const hs = hosts.get(l.kind);
    return hs.length > 1 && new Set(hs).size > 1 ? { ...l, label: `${l.label} · ${hostOf(l.url)}` } : l;
  });
}

/** Verified person links (ORCID, DBLP, OpenAlex, homepage) with safe https urls. `via` is dropped on purpose. */
export function verifiedLinks(person) {
  return finish((person?.links ?? []).filter((l) => ["orcid", "dblp", "openalex", "wikidata", "homepage"].includes(l.kind)).map(shape).filter(Boolean));
}

/** Links of a paper or session -> [{kind,label,icon,url,source}], unsafe urls dropped, duplicates merged. */
export function itemLinks(links) {
  return finish((links ?? []).map(shape).filter(Boolean));
}

export const personOf = (program, id) => {
  const p = id ? program.byId.get(id) : null;
  return p && Array.isArray(p.itemIds) ? p : null;
};

/** Authors of a paper -> [{name, personId|null}], aligned by position; tolerates data without authorIds. */
export function authorRefs(program, paper) {
  const ids = paper.authorIds ?? [];
  return (paper.authors ?? []).map((name, i) => ({ name, personId: personOf(program, ids[i])?.id ?? null }));
}

/** A person's sessions (keynotes) then papers, in itemIds order; ids no longer in the program are skipped. */
export function personItems(program, person) {
  const items = (person?.itemIds ?? []).map((id) => program.byId.get(id)).filter((x) => x && (x.paperIds || x.authors));
  return [...items.filter((x) => x.paperIds), ...items.filter((x) => !x.paperIds)];
}

/** People who share at least one paper -> [{person, shared}], most shared first, then by name. */
export function coAuthors(program, person) {
  const counts = new Map();
  for (const x of personItems(program, person)) {
    for (const id of new Set(x.authorIds ?? [])) if (id !== person.id) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return [...counts].map(([id, shared]) => ({ person: personOf(program, id), shared })).filter((c) => c.person)
    .sort((a, b) => b.shared - a.shared || a.person.name.localeCompare(b.person.name));
}

const fold = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const hayCache = new WeakMap();
const hayOf = (p) => {
  if (!hayCache.has(p)) hayCache.set(p, fold([p.name, ...(p.affiliations ?? []).map((a) => a.name)].join(" \n ")));
  return hayCache.get(p);
};

/** Affiliation names of a paper's linked authors (for search). */
export function affiliationText(program, paper) {
  const out = [];
  for (const id of paper.authorIds ?? []) for (const a of personOf(program, id)?.affiliations ?? []) out.push(a.name);
  return out;
}

/** People whose name or affiliation contains every query word, sorted by name. */
export function searchPeople(program, text) {
  const words = fold(text).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return (program.people ?? []).filter((p) => { const h = hayOf(p); return words.every((w) => h.includes(w)); })
    .sort((a, b) => a.name.localeCompare(b.name) || (a.id < b.id ? -1 : 1));
}
