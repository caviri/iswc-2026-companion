// Program loading (rete/SPARQL with program.json fallback) and search. Pure: no DOM at import time.
import { Q_SESSIONS, Q_PAPERS, Q_DAYS, Q_KINDS, Q_ROOMS, Q_TOPICS, Q_GLOSSARY, Q_CLUSTERS, Q_PEOPLE, Q_AFFILIATIONS, Q_LINKS, Q_WORKS, Q_DATASETS, Q_GRAPHS, Q_ENDPOINTS, Q_IMAGES, Q_AGENDA } from "./queries.js";
import { affiliationText } from "./people-model.js";

const SESSION_KEYS = ["id", "day", "start", "end", "startISO", "endISO", "kind", "title", "roomId", "allRooms", "chairs",
  "link", "paperIds", "topics", "description", "speaker", "affiliation", "talkTitle", "website", "bio", "organizers", "slot",
  "terms", "cluster", "speakerId", "organizerIds", "chairIds", "descriptionSource", "descriptionUrl", "agendaSource", "agendaUrl", "venue", "venueUrl", "venueGeo", "address"];
// abstract / abstractSource: "OpenAlex" | "arXiv" | "Crossref" (null when no open abstract was found)
const PAPER_KEYS = ["id", "title", "authors", "authorIds", "track", "spotlight", "sessionId", "lists", "topics", "terms", "cluster",
  "abstract", "abstractSource", "board"];
const GLOSSARY_KEYS = ["term", "short", "why", "url", "category", "aliases", "caseSensitive", "generic"];
const CLUSTER_KEYS = ["id", "label", "terms", "termIds", "size"];
const BOOLS = new Set(["allRooms", "spotlight", "caseSensitive", "generic", "liveOk", "liveCors"]);
const INTS = new Set(["board", "slot", "floor", "size", "position", "year", "citedBy", "stars", "width", "height"]);
// "|"-joined lists; SORTED ones are unordered sets, the rest keep source order.
const SPLIT = new Set(["paperIds", "topics", "lists", "authors", "terms", "sub", "topTerms", "termIds", "aliases",
  "authorIds", "itemIds", "organizerIds", "chairIds"]);
const SORTED = new Set(["topics", "lists", "terms", "itemIds"]);
const RENAME = { stableId: "id", topTerms: "terms" };

const val = (t) => (t !== null && typeof t === "object" && "value" in t ? t.value : t);

// Port of norm() in pipeline/tests/test_to_rdf.py: rete row -> program.json-shaped object.
function norm(row) {
  const out = {};
  for (const [k, t] of Object.entries(row)) {
    let v = val(t);
    if (BOOLS.has(k)) {
      if (v !== "true" && v !== "false") throw new Error(`bad boolean ${k}=${v}`);
      v = v === "true";
    } else if (INTS.has(k)) v = parseInt(v, 10);
    else if (SPLIT.has(k)) {
      v = v ? String(v).split("|") : [];
      if (SORTED.has(k)) v = v.sort();
    }
    out[RENAME[k] ?? k] = v;
  }
  return out;
}

// Fill absent keys (null / []), sort unordered lists. Applied to BOTH paths so shapes are identical.
// `ordered` names list keys whose order matters here even if SORTED elsewhere (cluster terms).
function shape(item, keys, ordered = []) {
  const o = {};
  for (const k of keys) {
    let v = item[k];
    if (SPLIT.has(k)) { v = v ? [...v] : []; if (SORTED.has(k) && !ordered.includes(k)) v.sort(); }
    o[k] = v ?? null;
  }
  return o;
}

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const shapeLive = (ok, cors) => (ok === null || ok === undefined ? null : { ok, cors: cors ?? null });
const shapeLink = (l) => ({ kind: l.kind, url: l.url, source: l.source, via: l.via ?? null, stars: l.stars ?? null,
  live: l.live !== undefined ? (l.live ? shapeLive(l.live.ok, l.live.cors) : null) : shapeLive(l.liveOk, l.liveCors) });
const shapeDataset = (d) => ({ title: d.title, year: d.year ?? null, url: d.url });
const shapeGraph = (g) => ({ id: g.id, name: g.name, homepage: g.homepage, logo: shapeImage(g.logo),
  endpoints: g.endpoints.map((e) => ({ url: e.url, live: e.live !== undefined ? (e.live ? shapeLive(e.live.ok, e.live.cors) : null) : shapeLive(e.liveOk, e.liveCors) })) });
const shapeWork = (w) => ({ title: w.title, year: w.year ?? null, url: w.url, venue: w.venue ?? null, citedBy: w.citedBy ?? 0 });
// Image = { file (relative to app/), width, height, alt, credit: {author, license, licenseUrl, pageUrl} } | null
const shapeImage = (i) => (i ? { file: i.file, width: i.width, height: i.height, alt: i.alt,
  credit: { author: i.credit.author, license: i.credit.license, licenseUrl: i.credit.licenseUrl ?? "", pageUrl: i.credit.pageUrl } } : null);
const imageOfRow = (r) => ({ file: r.file, width: r.width, height: r.height, alt: r.alt,
  credit: { author: r.author, license: r.licenseName, licenseUrl: r.licenseUrl ?? "", pageUrl: r.pageUrl } });
// Photo of a person (Wikimedia Commons, openly licensed) = { file, width, height, author, license, licenseUrl, pageUrl } | null
const shapePhoto = (ph) => (ph ? { file: ph.file, width: ph.width, height: ph.height, author: ph.author, license: ph.license,
  licenseUrl: ph.licenseUrl ?? "", pageUrl: ph.pageUrl } : null);
const photoOfRow = (r) => (r ? shapePhoto({ ...r, license: r.licenseName }) : null);
// Agenda item of a workshop (its own website's timed programme) = { start, end, startISO, endISO, title,
// kind: talk|keynote|break|opening|discussion|social, block, chairs, note, paperId, speaker, speakerId, talkTitle, abstract,
// byline / url: a talk that isn't a programme paper, as the event publishes it (its authors as text, a link to the paper) }
const AGENDA_KEYS = ["start", "end", "startISO", "endISO", "title", "kind", "block", "chairs", "note", "paperId", "speaker",
  "speakerId", "talkTitle", "abstract", "abstractSource", "byline", "url"];
const shapeAgenda = (a) => Object.fromEntries(AGENDA_KEYS.map((k) => [k, a[k] ?? null]));
/** Sessions' agendas in place ([] without one) and each presented paper's own slot: paper.talk = {start,end,startISO,endISO} | null. */
function attachAgendas(sessions, papers) {
  const talk = new Map();
  for (const s of sessions) for (const a of s.agenda) {
    if (a.paperId && !talk.has(a.paperId)) talk.set(a.paperId, { start: a.start, end: a.end, startISO: a.startISO, endISO: a.endISO });
  }
  for (const p of papers) p.talk = talk.get(p.id) ?? null;
}
const shapeAff = (a) => ({ name: a.name, country: a.country ?? null, ror: a.ror ?? null, logo: shapeImage(a.logo) });
const affOrder = (a, b) => cmp(a.name, b.name) || cmp(a.ror ?? "", b.ror ?? "");
// One credit per image file (paper figure, logo, place photo or person photo), sorted by file: the data behind the credits page.
function creditsOf({ papers, people, graphs, place }) {
  const m = new Map();
  const add = (im, kind, subject) => { if (im && !m.has(im.file)) m.set(im.file, { file: im.file, kind, subject, ...im.credit }); };
  for (const p of papers) add(p.image, "repo", p.title);
  for (const pe of people) for (const a of pe.affiliations) add(a.logo, "logo", a.name);
  for (const g of graphs) add(g.logo, "logo", g.name);
  for (const im of place) add(im, "place", "Bari");
  for (const pe of people) if (pe.photo && !m.has(pe.photo.file)) {
    const { file, author, license, licenseUrl, pageUrl } = pe.photo;
    m.set(file, { file, kind: "person-photo", subject: pe.name, author, license, licenseUrl, pageUrl });
  }
  return [...m.values()].sort((a, b) => cmp(a.file, b.file));
}
// Person = { id, name, photo: {file,width,height,author,license,licenseUrl,pageUrl}|null, affiliations: [{name, country, ror}], orcid, links: [{kind,url,source,via,stars,live:{ok,cors}|null}], datasets: [{title,year,url}], graphs: [{id,name,homepage,endpoints:[{url,live}]}] (top level), works: [{title,year,url,venue,citedBy}], itemIds: [id], roles: [{itemId, role}] }
const roleOrder = (a, b) => cmp(a.itemId, b.itemId) || cmp(a.role, b.role);
// Bio = { text, kind: "wikipedia"|"orcid"|"written", source, url, sources: [url], license, licenseUrl } | null
const shapeBio = (b) => (b?.text ? { text: b.text, kind: b.kind, source: b.source, url: b.url ?? null, sources: [...(b.sources ?? [])],
  license: b.license ?? null, licenseUrl: b.licenseUrl ?? null } : null);
const bioOfRow = (r) => (r.bio ? shapeBio({ text: r.bio, kind: r.bioKind, source: r.bioSource, url: r.bioUrl,
  sources: r.bioSources ? String(r.bioSources).split("|") : [], license: r.bioLicense, licenseUrl: r.bioLicenseUrl }) : null);
const shapePerson = (p) => ({
  id: p.id, name: p.name, orcid: p.orcid ?? null, photo: shapePhoto(p.photo), bio: shapeBio(p.bio),
  affiliations: (p.affiliations ?? []).map(shapeAff).sort(affOrder),
  links: (p.links ?? []).map(shapeLink),
  itemIds: [...(p.itemIds ?? [])].sort(),
  works: (p.works ?? []).map(shapeWork),
  datasets: (p.datasets ?? []).map(shapeDataset),
  roles: (p.roles ?? []).map((r) => ({ itemId: r.itemId, role: r.role })).sort(roleOrder),
});
/** Person id -> [{itemId, role}] from the sessions, as the pipeline builds roles: organizer | chair | speaker. */
function rolesOf(sessions) {
  const m = new Map();
  const add = (pid, itemId, role) => {
    if (!m.has(pid)) m.set(pid, []);
    if (!m.get(pid).some((r) => r.itemId === itemId && r.role === role)) m.get(pid).push({ itemId, role });
  };
  for (const s of sessions) {
    for (const pid of s.organizerIds) add(pid, s.id, "organizer");
    for (const pid of s.chairIds) add(pid, s.id, "chair");
    if (s.speakerId) add(s.speakerId, s.id, "speaker");
  }
  return m;
}

const reteRows = async (g, q, keys) => (await g.query(q)).map((r) => { const n = norm(r); return Object.fromEntries(keys.map((k) => [k, n[k] ?? (SPLIT.has(k) ? [] : null)])); });
// Optional blocks: an older .rete without them (or a failing query) yields empty, never an error.
const optionalRows = async (g, q, keys) => { try { return await reteRows(g, q, keys); } catch { return []; } };

async function fromRete(g) {
  const sessions = await reteRows(g, Q_SESSIONS, SESSION_KEYS);
  const papers = await reteRows(g, Q_PAPERS, PAPER_KEYS);
  const days = await reteRows(g, Q_DAYS, ["date", "label", "subtitle"]);
  const kinds = Object.fromEntries((await reteRows(g, Q_KINDS, ["kind", "label", "color"])).map((k) => [k.kind, { label: k.label, color: k.color }]));
  const rooms = await reteRows(g, Q_ROOMS, ["id", "name", "floor"]);
  const topics = Object.fromEntries((await reteRows(g, Q_TOPICS, ["id", "label", "sub"])).map((t) => [t.id, { label: t.label, sub: t.sub }]));
  const glossary = Object.fromEntries((await optionalRows(g, Q_GLOSSARY, ["id", ...GLOSSARY_KEYS]))
    .map(({ id, ...rest }) => [id, rest]));
  const clusters = await optionalRows(g, Q_CLUSTERS, CLUSTER_KEYS);
  if (!sessions.length || !papers.length) throw new Error("rete returned an empty program");
  // People and links (absent in an older .rete -> [] everywhere).
  const group = (rows, key) => { const m = new Map(); for (const r of rows) { if (!m.has(r[key])) m.set(r[key], []); m.get(r[key]).push(r); } return m; };
  const links = group(await optionalRows(g, Q_LINKS, ["owner", "position", "kind", "url", "source", "via", "stars", "liveOk", "liveCors"]), "owner");
  const linksOf = (id) => (links.get(id) ?? []).sort((a, b) => a.position - b.position).map(shapeLink);
  const affs = group(await optionalRows(g, Q_AFFILIATIONS, ["person", "name", "country", "ror"]), "person");
  const works = group(await optionalRows(g, Q_WORKS, ["owner", "position", "title", "year", "url", "venue", "citedBy"]), "owner");
  const worksOf = (id) => (works.get(id) ?? []).sort((a, b) => a.position - b.position);
  const datasets = group(await optionalRows(g, Q_DATASETS, ["owner", "position", "title", "year", "url"]), "owner");
  const datasetsOf = (id) => (datasets.get(id) ?? []).sort((a, b) => a.position - b.position);
  const eps = group(await optionalRows(g, Q_ENDPOINTS, ["graph", "position", "url", "liveOk", "liveCors"]), "graph");
  const graphs = (await optionalRows(g, Q_GRAPHS, ["id", "name", "homepage"])).map((x) =>
    shapeGraph({ ...x, endpoints: (eps.get(x.id) ?? []).sort((a, b) => a.position - b.position) }));
  const roles = rolesOf(sessions);
  const people = (await optionalRows(g, Q_PEOPLE, ["id", "name", "orcid", "itemIds", "bio", "bioKind", "bioSource", "bioSources",
    "bioUrl", "bioLicense", "bioLicenseUrl"])).map((p) =>
    shapePerson({ ...p, bio: bioOfRow(p), affiliations: affs.get(p.id) ?? [], links: linksOf(p.id), works: worksOf(p.id), datasets: datasetsOf(p.id),
      roles: roles.get(p.id) ?? [] }));
  for (const x of [...sessions, ...papers]) x.links = linksOf(x.id);
  const agendas = group(await optionalRows(g, Q_AGENDA, ["session", "position", ...AGENDA_KEYS]), "session");
  for (const s of sessions) s.agenda = (agendas.get(s.id) ?? []).sort((a, b) => a.position - b.position).map(shapeAgenda);
  attachAgendas(sessions, papers);
  // Images: papers and people (schema:image), organisations / graphs (schema:logo), the city (owner "place").
  const imgs = await optionalRows(g, Q_IMAGES, ["owner", "role", "position", "file", "width", "height", "alt", "author", "licenseName", "licenseUrl", "pageUrl"]);
  const imgOf = new Map(imgs.filter((r) => r.owner !== "place").map((r) => [r.owner, imageOfRow(r)]));
  const rowOf = new Map(imgs.map((r) => [r.owner, r]));
  for (const pe of people) pe.photo = photoOfRow(rowOf.get(pe.id));
  for (const p of papers) p.image = imgOf.get(p.id) ?? null;
  for (const pe of people) for (const a of pe.affiliations) a.logo = a.ror ? imgOf.get("ror-" + a.ror.split("/").pop()) ?? null : null;
  const graphsL = graphs.map((x) => shapeGraph({ ...x, logo: imgOf.get(x.id) ?? null }));
  const place = imgs.filter((r) => r.owner === "place").sort((a, b) => a.position - b.position).map(imageOfRow);
  papers.forEach((p) => { p.image = shapeImage(p.image); });
  const shaped = { papers, people, graphs: graphsL, place };
  return { kinds, rooms, days, sessions, papers, topics, glossary, clusters, people, graphs: graphsL, place, imageCredits: creditsOf(shaped) };
}

function fromJson(j) {
  const core = fromJsonCore(j);
  attachAgendas(core.sessions, core.papers);
  return core;
}

function fromJsonCore(j) {
  const papers = [...j.papers].sort((a, b) => (a.id < b.id ? -1 : 1))
    .map((p) => ({ ...shape(p, PAPER_KEYS), links: (p.links ?? []).map(shapeLink), image: shapeImage(p.image) }));
  const people = [...(j.people ?? [])].sort((a, b) => cmp(a.id, b.id)).map(shapePerson);
  const graphs = [...(j.graphs ?? [])].sort((a, b) => cmp(a.id, b.id)).map(shapeGraph);
  const place = (j.place ?? []).map(shapeImage);
  return {
    kinds: Object.fromEntries(Object.entries(j.kinds).map(([k, v]) => [k, { label: v.label, color: v.color }])),
    rooms: [...j.rooms].sort((a, b) => (a.id < b.id ? -1 : 1)).map((r) => shape(r, ["id", "name", "floor"])),
    days: [...j.days].sort((a, b) => (a.date < b.date ? -1 : 1)).map((d) => shape(d, ["date", "label", "subtitle"])),
    sessions: [...j.sessions].sort((a, b) => (a.startISO + a.id < b.startISO + b.id ? -1 : 1))
      .map((s) => ({ ...shape(s, SESSION_KEYS), links: (s.links ?? []).map(shapeLink), agenda: (s.agenda ?? []).map(shapeAgenda) })),
    papers,
    people,
    topics: Object.fromEntries(Object.entries(j.topics).map(([k, v]) => [k, { label: v.label, sub: [...(v.sub ?? [])] }])),
    glossary: Object.fromEntries(Object.entries(j.glossary ?? {}).sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, v]) => [k, shape(v, GLOSSARY_KEYS)])),
    clusters: (j.clusters ?? []).map((c) => shape(c, CLUSTER_KEYS, ["terms"])),
    graphs, place,
    imageCredits: creditsOf({ papers, people, graphs, place }),
  };
}

async function getOk(fetchFn, url) {
  const r = await fetchFn(url);
  if (!r || !r.ok) throw new Error(`${url}: HTTP ${r && r.status}`);
  return r;
}

/**
 * A response's bytes, reporting (loaded, total) as they arrive. total is the Content-Length when the body
 * isn't compressed on the wire (a compressed length can't be compared with the bytes read), else null.
 */
async function readBytes(res, onBytes = () => {}) {
  const len = Number(res.headers?.get?.("content-length")) || 0;
  const total = len && !res.headers?.get?.("content-encoding") ? len : null;
  const reader = res.body?.getReader?.();
  if (!reader) { const b = new Uint8Array(await res.arrayBuffer()); onBytes(b.length, total); return b; }
  const parts = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    loaded += value.length;
    onBytes(loaded, total && loaded <= total ? total : null);
  }
  const out = new Uint8Array(loaded);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

export const ENGINE_FILE = "vendor/rete-graph.min.js";

/**
 * The rete engine (vendor bundle, WebAssembly inside): fetched with progress, then run from the downloaded bytes,
 * so it downloads alongside the graph instead of blocking the page. Falls back to a plain <script> tag.
 */
async function loadEngine(fetchFn, baseUrl, onBytes) {
  if (globalThis.rete?.open) return globalThis.rete;
  const run = (src) => new Promise((ok, fail) => {
    const s = document.createElement("script");
    s.src = src; s.onload = ok; s.onerror = () => fail(new Error(`couldn't run ${ENGINE_FILE}`));
    document.head.append(s);
  });
  try {
    const bytes = await readBytes(await getOk(fetchFn, baseUrl + ENGINE_FILE), onBytes);
    const url = URL.createObjectURL(new Blob([bytes], { type: "text/javascript" }));
    try { await run(url); } finally { URL.revokeObjectURL(url); }
  } catch {
    if (!globalThis.rete?.open) await run(baseUrl + ENGINE_FILE);
  }
  if (!globalThis.rete?.open) throw new Error("the rete engine didn't load");
  return globalThis.rete;
}

/** The rete engine, loading it if the programme came from program.json (rejects offline without a cached copy). */
export const ensureEngine = () => loadEngine((...a) => globalThis.fetch(...a), "", () => {});

let graph = null;
/** The open rete graph behind the loaded program (null on the program.json fallback). The SPARQL explorer's fallback engine. */
export const getGraph = () => graph;

/**
 * Program = { source: "rete"|"json", kinds: {kind:{label,color}}, rooms: [{id,name,floor,box,map}],
 *   days: [{date,label,subtitle}], sessions: [...], papers: [...], topics: {id:{label, sub:[termId]}},
 *   glossary: {termId:{term,short,why,url,category}}, clusters: [{id,label,terms,termIds,size}], byId: Map }
 * Sessions/papers carry terms: [termId] (sorted) and cluster: clusterId|null. Data from before the
 * glossary/clusters existed loads with glossary {}, clusters [], terms [], cluster null, sub [].
 * people: [{id, name, affiliations:[{name,country,ror}], orcid, links, itemIds, roles:[{itemId, role}]}] sorted by id;
 * papers carry authorIds (aligned with authors) and links [{kind,url,source,via}]; sessions carry links, speakerId
 * (keynotes) and organizerIds / chairIds (person ids in the order of the organizers / chairs strings).
 * Data from before people/links existed loads with people [], authorIds [], links [], speakerId null,
 * organizerIds [], chairIds [], roles [].
 * rooms[].box/map come from data/rooms.json (null when unavailable). Any failure on the rete path -> program.json.
 * The engine and the graph download at the same time; onProgress({ step, loaded, total }) follows them for the
 * boot screen: step "download" (bytes of both so far; total null until both sizes are known), "open", "read".
 */
export async function loadProgram({
  fetchFn = (...a) => globalThis.fetch(...a),
  reteFactory = null,
  baseUrl = "",
  onProgress = () => {},
} = {}) {
  let core, source;
  graph = null;
  const bytesOf = { engine: [0, reteFactory ? 0 : null], graph: [0, null] };
  const report = (part) => (loaded, total) => {
    bytesOf[part] = [loaded, total];
    const all = Object.values(bytesOf);
    onProgress({ step: "download", loaded: all.reduce((n, [l]) => n + l, 0), total: all.every(([, t]) => t != null) ? all.reduce((n, [, t]) => n + t, 0) : null });
  };
  const engine = reteFactory ? null : loadEngine(fetchFn, baseUrl, report("engine"));
  engine?.catch(() => {}); // a failure is handled where it's awaited (or the JSON fallback never needs it)
  const open = reteFactory ?? (async (bytes) => (await engine).open(bytes));
  try {
    const bytes = await readBytes(await getOk(fetchFn, baseUrl + "data/iswc26.rete"), report("graph"));
    if (engine) await engine;
    onProgress({ step: "open" });
    const g = await open(bytes);
    onProgress({ step: "read" });
    core = await fromRete(g);
    source = "rete";
    graph = g;
  } catch {
    core = fromJson(await (await getOk(fetchFn, baseUrl + "data/program.json")).json());
    source = "json";
  }
  let boxes = new Map();
  try { boxes = new Map((await (await getOk(fetchFn, baseUrl + "data/rooms.json")).json()).map((r) => [r.id, r])); } catch { /* maps optional */ }
  core.rooms = core.rooms.map((r) => ({ ...r, box: boxes.get(r.id)?.box ?? null, map: boxes.get(r.id)?.map ?? null }));
  const byId = new Map();
  for (const x of [...core.sessions, ...core.papers, ...core.rooms, ...core.people]) byId.set(x.id, x);
  return { source, ...core, byId };
}

export const fold = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Sessions then papers whose titles, authors, room name or topic labels contain every query word. */
export function search(program, text) {
  const words = fold(text).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const topicLabel = (id) => program.topics[id]?.label ?? id;
  const hay = (parts) => fold(parts.flat().filter(Boolean).join(" \n "));
  const hit = (parts) => { const h = hay(parts); return words.every((w) => h.includes(w)); };
  const sessions = program.sessions.filter((s) =>
    hit([s.title, s.speaker, s.talkTitle, program.byId.get(s.roomId)?.name, s.topics.map(topicLabel)]));
  const papers = program.papers.filter((p) => {
    const room = program.byId.get(program.byId.get(p.sessionId)?.roomId)?.name;
    return hit([p.title, p.authors, affiliationText(program, p), room, p.topics.map(topicLabel)]);
  });
  return [...sessions, ...papers];
}
