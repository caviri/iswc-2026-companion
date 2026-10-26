// SPARQL explorer, the pure parts (no DOM): prefix injection, query-type and LIMIT detection, error
// positions, a tiny highlighter tokenizer, result shaping (term -> cell, IRI -> app link), sorting,
// CSV / JSON / N-Triples / Turtle export and the query history. Tested in tests/app/sparql.test.mjs.

export const BASE = "https://w3id.org/iswc26-companion/";
export const PREFIXES = {
  ic: BASE,
  schema: "http://schema.org/",
  skos: "http://www.w3.org/2004/02/skos/core#",
  rdfs: "http://www.w3.org/2000/01/rdf-schema#",
  rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
  xsd: "http://www.w3.org/2001/XMLSchema#",
  // the vocabularies of the dataset description and its example queries (pipeline/dataset_rdf.py PREFIXES)
  dcat: "http://www.w3.org/ns/dcat#",
  void: "http://rdfs.org/ns/void#",
  dcterms: "http://purl.org/dc/terms/",
  prov: "http://www.w3.org/ns/prov#",
  owl: "http://www.w3.org/2002/07/owl#",
  sh: "http://www.w3.org/ns/shacl#",
};
const XSD = PREFIXES.xsd;
const NUMERIC = new Set(["integer", "decimal", "double", "float", "int", "long", "short", "byte", "nonNegativeInteger",
  "positiveInteger", "negativeInteger", "nonPositiveInteger", "unsignedInt", "unsignedLong", "unsignedShort", "unsignedByte"]);

// ---- scanning: blank out comments, strings and IRIs so keyword/prefix checks never look inside them ----

const blank = (s) => s.replace(/[^\n]/g, " ");
const RE_SCAN = /("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|<[^<>"{}|^`\\\s]*>|#[^\n]*)/g;

/** The query with comments, strings and <IRIs> replaced by spaces (same length, same line breaks). */
export function scan(q) {
  return String(q ?? "").replace(RE_SCAN, (m) => (m[0] === "<" ? "<" + blank(m.slice(1, -1)) + ">" : blank(m)));
}

const declared = (s) => new Set([...s.matchAll(/\bPREFIX\s+([A-Za-z][\w.-]*)?\s*:/gi)].map((m) => m[1] ?? ""));

/** Prefix names used as `name:local` (outside strings, IRIs and comments). */
export function usedPrefixes(q) {
  const s = scan(q).replace(/\bPREFIX\s+[A-Za-z][\w.-]*\s*:/gi, " ");
  return new Set([...s.matchAll(/(?<![\w?$:.-])([A-Za-z][\w-]*):/g)].map((m) => m[1]));
}

/**
 * Prepend PREFIX lines for the well-known prefixes the query uses but does not declare.
 * -> { query, added: [names], lineOffset } (lineOffset: lines added on top, to map error positions back).
 */
export function injectPrefixes(q, prefixes = PREFIXES) {
  const s = scan(q);
  const have = declared(s);
  const added = [...usedPrefixes(q)].filter((p) => !have.has(p) && prefixes[p]).sort();
  if (!added.length) return { query: q, added, lineOffset: 0 };
  const head = added.map((p) => `PREFIX ${p}: <${prefixes[p]}>`).join("\n") + "\n";
  return { query: head + q, added, lineOffset: added.length };
}

/** "select" | "ask" | "construct" | "describe" | null: the query form after the prologue. */
export function queryType(q) {
  const s = scan(q).replace(/\b(PREFIX\s+[\w.-]*\s*:\s*<[^>]*>|BASE\s*<[^>]*>)/gi, " ");
  const m = s.match(/\b(SELECT|ASK|CONSTRUCT|DESCRIBE)\b/i);
  return m ? m[1].toLowerCase() : null;
}

/** True when the outermost query ends with a LIMIT (a sub-select's LIMIT does not count). */
export function hasLimit(q) {
  const s = stripTrailingValues(scan(q)).trimEnd();
  return /\bLIMIT\s+\d+(\s+OFFSET\s+\d+)?$/i.test(s) || /\bOFFSET\s+\d+\s+LIMIT\s+\d+$/i.test(s);
}

/** Append `LIMIT n` to a SELECT without one. -> { query, applied } */
/** The query without a trailing top-level VALUES block (it follows the solution modifiers). */
function stripTrailingValues(s) {
  const m = s.match(/\bVALUES\s+(?:[?$]\w+|\([^)]*\))\s*\{[^{}]*\}\s*$/i);
  return m ? s.slice(0, m.index) : s;
}

/** Append `LIMIT n` to a SELECT without one (before a trailing VALUES block). -> { query, applied } */
export function withAutoLimit(q, n = 1000) {
  if (queryType(q) !== "select" || hasLimit(q)) return { query: q, applied: false };
  const text = String(q);
  const cut = stripTrailingValues(scan(text)).replace(/\s+$/, "").length;
  const rest = text.slice(cut).trim() ? text.slice(cut) : "";
  return { query: `${text.slice(0, cut)}\nLIMIT ${n}${rest}`, applied: true };
}

/**
 * Variables of a SELECT in projection order: `?a ?b (COUNT(?x) AS ?n)` -> ["a", "b", "n"]; `*` -> null.
 * Used for column order (rows only carry the variables they bind).
 */
export function selectVars(q) {
  const s = scan(q);
  const m = s.match(/\bSELECT\b(?:\s+(?:DISTINCT|REDUCED)\b)?([\s\S]*?)(?:\bWHERE\b|\{)/i);
  if (!m) return null;
  const proj = m[1];
  if (/^\s*\*/.test(proj)) return null;
  const out = [];
  let depth = 0;
  for (let i = 0; i < proj.length; i++) {
    const c = proj[i];
    if (c === "(") {
      if (depth === 0) {
        // find the matching ")" and take the AS target
        let d = 0, j = i;
        for (; j < proj.length; j++) { if (proj[j] === "(") d++; else if (proj[j] === ")" && --d === 0) break; }
        const as = proj.slice(i, j + 1).match(/\bAS\s+[?$]([\w]+)\s*\)$/i);
        if (as) out.push(as[1]);
        i = j;
        continue;
      }
      depth++;
    } else if ((c === "?" || c === "$") && depth === 0) {
      const v = proj.slice(i + 1).match(/^\w+/);
      if (v) { out.push(v[0]); i += v[0].length; }
    }
  }
  return out.length ? [...new Set(out)] : null;
}

/** Column order: the projection when known, plus any other bound variable in first-seen order. */
export function columnsOf(q, rows) {
  const cols = selectVars(q) ?? [];
  const seen = new Set(cols);
  for (const r of rows) for (const k of Object.keys(r)) if (!seen.has(k)) { seen.add(k); cols.push(k); }
  return cols;
}

/** "parse error: error at 3:2: expected OPTIONAL" -> { line, col, text } in the user's lines (or null). */
export function errorPosition(message, lineOffset = 0) {
  const m = String(message ?? "").match(/\bat (\d+):(\d+)\b:?\s*(.*)$/);
  if (!m) return null;
  const line = Number(m[1]) - lineOffset;
  return { line: line >= 1 ? line : null, col: Number(m[2]), text: m[3] || String(message) };
}

/** Plain error text, without the engine's "parse error: error at L:C:" prefix. */
export function errorText(message) {
  const m = String(message ?? "").match(/\bat \d+:\d+\b:?\s*(.*)$/);
  return m && m[1] ? m[1] : String(message ?? "Query failed");
}

/** Index of (line, col) (both 1-based) in text, clamped. */
export function offsetOf(text, line, col) {
  const lines = String(text).split("\n");
  const l = Math.min(Math.max(1, line), lines.length);
  let off = 0;
  for (let i = 0; i < l - 1; i++) off += lines[i].length + 1;
  return off + Math.min(Math.max(0, col - 1), lines[l - 1].length);
}

// ---- highlighting ----

const KEYWORDS = new Set(("SELECT DISTINCT REDUCED WHERE FILTER OPTIONAL UNION MINUS GRAPH SERVICE BIND AS VALUES ORDER BY ASC DESC " +
  "GROUP HAVING LIMIT OFFSET PREFIX BASE ASK CONSTRUCT DESCRIBE FROM NAMED NOT EXISTS IN COUNT SUM MIN MAX AVG SAMPLE " +
  "GROUP_CONCAT SEPARATOR STR LANG LANGMATCHES DATATYPE BOUND IRI URI BNODE RAND ABS CEIL FLOOR ROUND CONCAT STRLEN UCASE " +
  "LCASE ENCODE_FOR_URI CONTAINS STRSTARTS STRENDS STRBEFORE STRAFTER YEAR MONTH DAY HOURS MINUTES SECONDS TIMEZONE TZ NOW " +
  "UUID STRUUID MD5 SHA1 SHA256 SHA384 SHA512 COALESCE IF STRLANG STRDT SAMETERM ISIRI ISURI ISBLANK ISLITERAL ISNUMERIC " +
  "REGEX SUBSTR REPLACE TRUE FALSE UNDEF A LATERAL").split(" "));
const RE_TOKEN = /("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\\n]|\\.)*"?|'(?:[^'\\\n]|\\.)*'?)|(#[^\n]*)|(<[^<>"{}|^`\\\s]*>)|([?$]\w+)|((?:[A-Za-z][\w-]*)?:[\w-]*(?:\.[\w-]+)*)|(@[a-zA-Z]+(?:-[a-zA-Z0-9]+)*)|(\^\^)|(\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|([A-Za-z_]\w*)|([{}()[\].;,])/g;

/** Split a query into [{ t, s }] for the overlay highlighter. t: kw|var|pname|iri|str|num|comment|lang|punct|text. Concatenating s gives back the input. */
export function tokenize(q) {
  const text = String(q ?? "");
  const out = [];
  let last = 0;
  const push = (t, s) => { if (!s) return; const prev = out[out.length - 1]; if (prev && prev.t === t && t === "text") prev.s += s; else out.push({ t, s }); };
  for (const m of text.matchAll(RE_TOKEN)) {
    push("text", text.slice(last, m.index));
    const [s, str, com, iri, v, pn, lang, dt, num, word, punct] = m;
    if (str) push("str", s);
    else if (com) push("comment", s);
    else if (iri) push("iri", s);
    else if (v) push("var", s);
    else if (pn) push("pname", s);
    else if (lang) push("lang", s);
    else if (dt) push("punct", s);
    else if (num) push("num", s);
    else if (word) push(KEYWORDS.has(word.toUpperCase()) ? "kw" : "text", s);
    else if (punct) push("punct", s);
    else push("text", s);
    last = m.index + s.length;
  }
  push("text", text.slice(last));
  return out;
}

// ---- results: terms, cells, links ----

/** A rete Term (or anything shaped like one) as a plain, cloneable { kind, value, datatype, lang }. */
export function plainTerm(t) {
  if (t == null) return null;
  if (typeof t !== "object") return { kind: "literal", value: String(t), datatype: null, lang: null };
  return { kind: t.kind ?? "literal", value: String(t.value ?? ""), datatype: t.datatype ?? null, lang: t.lang ?? null };
}

/** IRI -> "pfx:local" when a known namespace matches (longest first), else the IRI. */
export function shortIri(iri, prefixes = PREFIXES) {
  let best = null;
  for (const [p, ns] of Object.entries(prefixes)) if (iri.startsWith(ns) && (!best || ns.length > best[1].length)) best = [p, ns];
  return best ? `${best[0]}:${iri.slice(best[1].length)}` : iri;
}

const enc = encodeURIComponent;

/**
 * What an IRI is in the app, from the IRI scheme in pipeline/to_rdf.py (ic:session/<id>, ic:paper/<id>,
 * ic:person/<slug> = person-<slug>, ic:cluster/<id>, ic:term/<id>, ic:topic/<id>, ic:room/<id>).
 * -> { kind: "item"|"person"|"cluster"|"term"|"topic"|"room", id, label, href } or null.
 */
export function resolveIri(iri, program) {
  if (typeof iri !== "string" || !iri.startsWith(BASE) || !program) return null;
  const rest = iri.slice(BASE.length);
  const i = rest.indexOf("/");
  if (i < 0) return null;
  const ns = rest.slice(0, i);
  let id;
  try { id = decodeURIComponent(rest.slice(i + 1)); } catch { return null; }
  const byId = program.byId;
  if (ns === "session" || ns === "paper") {
    const x = byId?.get(id);
    return x && (x.paperIds || x.authors) ? { kind: "item", id, label: x.title, href: `#/item/${enc(id)}` } : null;
  }
  if (ns === "person") {
    const pid = `person-${id}`;
    const p = (program.people ?? []).find((x) => x.id === pid) ?? null;
    return p ? { kind: "person", id: pid, label: p.name, href: `#/person/${enc(pid)}` } : null;
  }
  if (ns === "cluster") {
    const c = (program.clusters ?? []).find((x) => x.id === id);
    return c ? { kind: "cluster", id, label: c.label, href: `#/explore?cluster=${enc(id)}` } : null;
  }
  if (ns === "term") {
    const g = program.glossary?.[id];
    return g ? { kind: "term", id, label: g.term, href: `#/browse?term=${enc(id)}` } : null;
  }
  if (ns === "topic") {
    const t = program.topics?.[id];
    return t ? { kind: "topic", id, label: t.label, href: `#/explore?topic=${enc(id)}` } : null;
  }
  if (ns === "room") {
    const r = byId?.get(id);
    return r && !r.paperIds && !r.authors && "floor" in r ? { kind: "room", id, label: r.name, href: `#/map?room=${enc(id)}` } : null;
  }
  return null;
}

const dtLocal = (dt) => (dt && dt.startsWith(XSD) ? dt.slice(XSD.length) : null);
export const isNumericTerm = (t) => !!t && t.kind === "literal" && NUMERIC.has(dtLocal(t.datatype)) && t.value.trim() !== "" && Number.isFinite(Number(t.value));

/**
 * One table cell: { text, title, kind: "iri"|"literal"|"bnode"|"empty", numeric, sortKey, link, lang, dt }.
 * IRIs show shortened (pfx:local) with the full IRI as title; ones that map to app things carry `link`
 * (resolveIri) and show its label. Typed literals keep their datatype as a short hint (not for strings).
 */
export function cellModel(term, program) {
  const t = plainTerm(term);
  if (!t) return { text: "", title: "unbound", kind: "empty", numeric: false, sortKey: null, link: null, lang: null, dt: null };
  if (t.kind === "iri") {
    const link = resolveIri(t.value, program);
    const short = shortIri(t.value);
    return { text: link?.label ?? short, title: t.value, kind: "iri", numeric: false, sortKey: (link?.label ?? short).toLowerCase(), link, lang: null, dt: null, short };
  }
  if (t.kind === "bnode" || t.kind === "blank") {
    return { text: `_:${t.value}`, title: "blank node", kind: "bnode", numeric: false, sortKey: t.value, link: null, lang: null, dt: null };
  }
  const local = dtLocal(t.datatype);
  const numeric = isNumericTerm(t);
  const dt = t.datatype && local !== "string" ? (local ? `xsd:${local}` : shortIri(t.datatype)) : null;
  return { text: t.value, title: dt ? `${t.value} (${dt})` : t.lang ? `${t.value} @${t.lang}` : t.value, kind: "literal",
    numeric, sortKey: numeric ? Number(t.value) : t.value.toLowerCase(), link: null, lang: t.lang, dt };
}

/** The first column whose IRI maps to an item, person or cluster (cards use it as the picture + title). */
export function cardSubject(row, cols, program) {
  for (const c of cols) {
    const t = row[c];
    if (t?.kind !== "iri") continue;
    const link = resolveIri(t.value, program);
    if (link && (link.kind === "item" || link.kind === "person" || link.kind === "cluster")) return { col: c, link };
  }
  return null;
}

/** Rows sorted by column `col` (dir 1 | -1): numbers numerically, text case-insensitively, unbound last. Stable. */
export function sortRows(rows, col, dir = 1, program = null) {
  const keyed = rows.map((r, i) => ({ r, i, k: cellModel(r[col], program).sortKey }));
  keyed.sort((a, b) => {
    if (a.k == null || b.k == null) return a.k == null && b.k == null ? a.i - b.i : a.k == null ? 1 : -1;
    const c = typeof a.k === "number" && typeof b.k === "number" ? a.k - b.k : String(a.k).localeCompare(String(b.k), undefined, { numeric: true });
    return c ? c * dir : a.i - b.i;
  });
  return keyed.map((x) => x.r);
}

// ---- export ----

// A cell starting with = + - @ tab or CR could run as a formula in a spreadsheet (CSV injection, OWASP):
// prefix it with ' and quote it. Numeric terms (xsd:integer -5, 1e3) are numbers, not formulas: left as they are.
const csvField = (s, numeric = false) => {
  const v = !numeric && /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return v !== s || /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
};

/** RFC 4180 CSV: a header of variable names, then each term's lexical value (unbound = empty). */
export function toCSV(cols, rows) {
  const lines = [cols.map((c) => csvField(c)).join(",")];
  for (const r of rows) lines.push(cols.map((c) => csvField(r[c] ? String(r[c].value) : "", isNumericTerm(r[c]))).join(","));
  return lines.join("\r\n") + "\r\n";
}

const jsonTerm = (t) => {
  const p = plainTerm(t);
  if (p.kind === "iri") return { type: "uri", value: p.value };
  if (p.kind === "bnode" || p.kind === "blank") return { type: "bnode", value: p.value };
  const o = { type: "literal", value: p.value };
  if (p.lang) o["xml:lang"] = p.lang; else if (p.datatype) o.datatype = p.datatype;
  return o;
};

/** SPARQL 1.1 Query Results JSON (SELECT rows, or an ASK boolean when `rows` is a boolean). */
export function toResultsJSON(cols, rows) {
  if (typeof rows === "boolean") return JSON.stringify({ head: {}, boolean: rows }, null, 2);
  return JSON.stringify({
    head: { vars: cols },
    results: { bindings: rows.map((r) => Object.fromEntries(cols.filter((c) => r[c]).map((c) => [c, jsonTerm(r[c])]))) },
  }, null, 2);
}

const escLit = (s) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t");
const escIri = (s) => s.replace(/[\u0000- <>"{}|^`\\]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0").toUpperCase()}`);

/** One term in N-Triples syntax. */
export function ntTerm(t) {
  const p = plainTerm(t);
  if (p.kind === "iri") return `<${escIri(p.value)}>`;
  if (p.kind === "bnode" || p.kind === "blank") return `_:${p.value.replace(/^_:/, "")}`;
  const lit = `"${escLit(p.value)}"`;
  if (p.lang) return `${lit}@${p.lang}`;
  if (p.datatype && p.datatype !== `${XSD}string`) return `${lit}^^<${escIri(p.datatype)}>`;
  return lit;
}

/** [[s, p, o], ...] -> N-Triples text. */
export const toNTriples = (triples) => triples.map(([s, p, o]) => `${ntTerm(s)} ${ntTerm(p)} ${ntTerm(o)} .`).join("\n") + (triples.length ? "\n" : "");

const PN_LOCAL = /^[A-Za-z0-9_](?:[A-Za-z0-9_.-]*[A-Za-z0-9_-])?$/;
function ttlTerm(t, used) {
  const p = plainTerm(t);
  if (p.kind === "iri") {
    if (p.value === `${PREFIXES.rdf}type`) return "a";
    for (const [pfx, ns] of Object.entries(PREFIXES)) {
      if (p.value.startsWith(ns) && PN_LOCAL.test(p.value.slice(ns.length))) { used.add(pfx); return `${pfx}:${p.value.slice(ns.length)}`; }
    }
    return `<${escIri(p.value)}>`;
  }
  if (p.kind === "literal" && p.datatype && !p.lang) {
    const local = dtLocal(p.datatype);
    if (local === "integer" && /^[+-]?\d+$/.test(p.value)) return p.value;
    if (local === "boolean" && /^(true|false)$/.test(p.value)) return p.value;
    if (local && local !== "string") { used.add("xsd"); return `"${escLit(p.value)}"^^xsd:${local}`; }
  }
  return ntTerm(p);
}

/** [[s, p, o], ...] -> Turtle, grouped by subject and predicate, with the prefixes it uses. */
export function toTurtle(triples) {
  const used = new Set();
  const bySubject = new Map();
  for (const [s, p, o] of triples) {
    const sk = ttlTerm(s, used);
    if (!bySubject.has(sk)) bySubject.set(sk, new Map());
    const preds = bySubject.get(sk);
    const pk = ttlTerm(p, used);
    if (!preds.has(pk)) preds.set(pk, []);
    preds.get(pk).push(ttlTerm(o, used));
  }
  const body = [...bySubject].map(([s, preds]) => `${s}\n    ${[...preds].map(([p, os]) => `${p} ${os.join(", ")}`).join(" ;\n    ")} .`).join("\n\n");
  const head = [...used].sort().map((p) => `@prefix ${p}: <${PREFIXES[p]}> .`).join("\n");
  return (head ? head + "\n\n" : "") + body + (body ? "\n" : "");
}

// ---- history (last 20 queries, localStorage) ----

export const HISTORY_KEY = "iswc26:sparql-history";
export const HISTORY_MAX = 20;

/** [{ query, at, rows }] newest first; anything malformed is dropped. */
const ls = () => globalThis.localStorage; // read inside try: the getter throws when storage is blocked
export function loadHistory(storage = undefined) {
  try {
    const st = storage === undefined ? ls() : storage;
    const v = JSON.parse(st?.getItem(HISTORY_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((e) => e && typeof e.query === "string" && e.query.trim()).slice(0, HISTORY_MAX) : [];
  } catch { return []; }
}
export function saveHistory(list, storage = undefined) {
  try { (storage === undefined ? ls() : storage)?.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, HISTORY_MAX))); return true; } catch { return false; }
}
const norm = (q) => q.replace(/\s+/g, " ").trim();
/** Add `query` on top (an equal query, ignoring whitespace, moves up instead of repeating). Pure. */
export function pushHistory(list, query, { at = Date.now(), rows = null, max = HISTORY_MAX } = {}) {
  if (!String(query ?? "").trim()) return list;
  const n = norm(query);
  return [{ query, at, rows }, ...list.filter((e) => norm(e.query) !== n)].slice(0, max);
}

/** First meaningful line of a query (no PREFIX lines or comments), for lists. */
export function queryHeadline(q) {
  const lines = String(q).split("\n").map((l) => l.trim()).filter((l) => l && !/^(PREFIX|BASE)\b/i.test(l) && !l.startsWith("#"));
  return (lines.join(" ").replace(/\s+/g, " ") || String(q).trim()).slice(0, 140);
}

const ROME_FMT = (() => {
  try {
    return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Rome", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  } catch { return null; }
})();
/** xsd:dateTime lexical value -> "Tue 27 Oct, 09:15" in Rome time (cards); anything unparsable -> null. */
export function romeDateTime(value) {
  const v = String(value ?? "");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v) || !ROME_FMT) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  const p = Object.fromEntries(ROME_FMT.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.weekday} ${p.day} ${p.month}, ${p.hour}:${p.minute}`;
}

// ---- federated queries (SERVICE) ----

/**
 * Remote endpoints a query contacts -> [{ url, host, limited, body, dynamic? }] in order, one per SERVICE block
 * (outside strings and comments). Written as `SERVICE <iri>`, `SERVICE prefix:name` (expanded with the query's
 * PREFIX lines, then the automatic prefixes) or `SERVICE ?var`. A variable (or an unknown prefix) cannot be
 * resolved before the query runs: that call is `dynamic`, with no url and the host "a service named in the query".
 * `limited`: the block has its own LIMIT; this engine sends only the block to the endpoint, so a LIMIT outside
 * it does not reach the endpoint. `body`: the block's text (what the endpoint receives, without PREFIX lines).
 */
export const DYNAMIC_HOST = "a service named in the query";
export function serviceCalls(q) {
  const raw = String(q ?? "");
  const s = scan(raw);
  const prefixes = Object.assign(Object.create(null), PREFIXES);
  for (const m of s.matchAll(/\bPREFIX\s+([A-Za-z][\w.-]*)?\s*:\s*<([^>]*)>/gi)) {
    const iriStart = m.index + m[0].length - m[2].length - 1;
    prefixes[m[1] ?? ""] = raw.slice(iriStart, iriStart + m[2].length);
  }
  const out = [];
  for (const m of s.matchAll(/\bSERVICE\s+(?:SILENT\s+)?(?:<([^>]*)>|([A-Za-z][\w.-]*)?:([^\s{}<>]*)|([?$][\w]+))\s*\{/gi)) {
    let url = null;
    if (m[1] != null) { const start = m.index + m[0].indexOf("<") + 1; url = raw.slice(start, start + m[1].length); }
    else if (m[4] == null) { const base = prefixes[m[2] ?? ""]; if (base != null) url = base + m[3]; }
    let depth = 1, i = m.index + m[0].length;
    for (; i < s.length && depth; i++) { if (s[i] === "{") depth++; else if (s[i] === "}") depth--; }
    const inner = s.slice(m.index + m[0].length, i);
    const limited = /\bLIMIT\s+\d+/i.test(inner), body = raw.slice(m.index + m[0].length, i - 1).trim();
    if (url == null) { out.push({ url: null, host: DYNAMIC_HOST, limited, body, dynamic: true }); continue; }
    let host = "";
    try { host = new URL(url).hostname; } catch { /* a relative or odd IRI: shown as written */ }
    out.push({ url, host: host || url, limited, body });
  }
  return out;
}

/** The PREFIX lines of a query (for re-using a SERVICE block elsewhere). */
export function prefixLines(q) {
  return String(q ?? "").split("\n").filter((l) => /^\s*PREFIX\s/i.test(l)).map((l) => l.trim());
}

/**
 * An engine error from a SERVICE call -> { host, text } in plain words, or null for any other error.
 * The engine reports "SERVICE federation: <url>: <detail>"; "xhr" means the request never got an answer
 * (offline, blocked, or refused by the endpoint's CORS policy).
 */
export function serviceError(message) {
  const m = /SERVICE federation:\s*(\S+?):\s+(.*)$/s.exec(String(message ?? ""));
  if (!m) return null;
  let host = m[1];
  try { host = new URL(m[1]).hostname; } catch { /* keep as written */ }
  const detail = m[2].trim();
  const text = /^xhr\b|network/i.test(detail)
    ? `Couldn't reach ${host}: there is no connection, or it refused a request from this page.`
    : /not JSON/i.test(detail) ? `${host} answered, but not with SPARQL results (it may have timed out). Try a smaller query with a LIMIT inside SERVICE.`
      : `${host} answered with an error: ${detail}`;
  return { host, text };
}
