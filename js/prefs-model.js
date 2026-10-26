// Your data, to take along: picks (keep / skip / maybe), notes and the app's settings, exported from this device
// as JSON or as a .rete graph (the same identifiers as the programme's graph, so the two can be queried together),
// and imported back (merged: the newer pick or note wins). Imported travel pages (Logistics) are never exported.
// Pure: no DOM, no storage of its own (views/settings.js does the files). Tested in tests/app/prefs.test.mjs.

export const FORMAT = "iswc26-preferences";
export const FORMAT_VERSION = 1;
const BASE = "https://w3id.org/iswc26-companion/";
// localStorage keys that are not settings: the picks themselves, a corrupt backup, travel pages, retired state.
const NOT_SETTINGS = new Set(["iswc26:v1", "iswc26:v1:corrupt", "iswc26:logistics", "iswc26:clock"]);
const VERDICT_NAME = { right: "keep", left: "skip", up: "maybe" };
const VERDICT_OF = { keep: "right", skip: "left", maybe: "up" };

/** Is localStorage key `k` one of the app's settings (exported and imported)? */
export const isSettingKey = (k) => typeof k === "string" && k.startsWith("iswc26:") && !NOT_SETTINGS.has(k);

/** "2026-10-26T09:31:05+01:00" -> "iswc26-2026-10-26-093105.json" (the time as given: the app's Rome time). */
export function fileName(iso, ext) {
  const m = String(iso).match(/^(\d{4}-\d\d-\d\d)T(\d\d):(\d\d)(?::(\d\d))?/);
  const stamp = m ? `${m[1]}-${m[2]}${m[3]}${m[4] ?? "00"}` : "export";
  return `iswc26-${stamp}.${ext}`;
}

/** The settings among storage entries: [[key, raw string]] -> { key: raw }. */
export function pickSettings(entries) {
  return Object.fromEntries(entries.filter(([k, v]) => isSettingKey(k) && typeof v === "string").sort(([a], [b]) => (a < b ? -1 : 1)));
}

/** The JSON file: { format, formatVersion, exported, app, data, picks: {swipes, notes}, settings: {key: raw} }. */
export function toJSON({ snapshot, settings = {}, exported, app = null, data = null }) {
  return JSON.stringify({ format: FORMAT, formatVersion: FORMAT_VERSION, exported, app, data,
    picks: { swipes: snapshot.swipes ?? {}, notes: snapshot.notes ?? {} }, settings }, null, 1);
}

/** A JSON file's text -> { swipes, notes, settings, exported }; throws an Error that says what's wrong. */
export function parseJSON(text) {
  let d;
  try { d = JSON.parse(text); } catch { throw new Error("That file isn't valid JSON."); }
  if (!d || d.format !== FORMAT) throw new Error("That isn't an ISWC 2026 Companion export (no \"format\": \"iswc26-preferences\").");
  if (d.formatVersion > FORMAT_VERSION) throw new Error("That export comes from a newer version of the app: update the app first.");
  const obj = (x) => (x && typeof x === "object" && !Array.isArray(x) ? x : {});
  return { swipes: obj(d.picks?.swipes), notes: obj(d.picks?.notes), settings: pickSettings(Object.entries(obj(d.settings))), exported: d.exported ?? null };
}

// ---------- RDF (Turtle for rete.build, read back with the queries below) ----------
const lit = (s) => `"${String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t")}"`;
const local = (s) => encodeURIComponent(String(s)).replace(/[!'()*~]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const isoOf = (ms) => new Date(ms).toISOString();

/** The IRI of a programme item / person in the programme's graph, or null when the id isn't one of its kinds. */
export function itemIri(id) {
  if (/^s-/.test(id)) return `${BASE}session/${local(id)}`;
  if (/^paper-/.test(id)) return `${BASE}paper/${local(id)}`;
  if (/^person-/.test(id)) return `${BASE}person/${local(id.slice(7))}`;
  return null;
}

/**
 * The export as Turtle: one ic:PreferencesExport (dcterms:created, app and data versions) with ic:Verdict, ic:Note
 * and ic:Setting resources. Each carries the app's id (ic:itemId) and, for programme items, a link (ic:item) to the
 * same IRI the programme's graph uses; timestamps both as xsd:dateTime and as ms (ic:ts, lossless).
 */
export function toTurtle({ snapshot, settings = {}, exported, app = null, data = null }) {
  const ex = `<${BASE}export/${local(exported)}>`;
  const out = [`@prefix ic: <${BASE}> .`, "@prefix dcterms: <http://purl.org/dc/terms/> .",
    "@prefix schema: <http://schema.org/> .", "@prefix prov: <http://www.w3.org/ns/prov#> .",
    "@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .", "@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .", "",
    `${ex} a ic:PreferencesExport, prov:Entity ;`, `  dcterms:created ${lit(exported)}^^xsd:dateTime ;`,
    `  ic:format ${lit(FORMAT)} ; ic:formatVersion ${FORMAT_VERSION}${app ? ` ; ic:appVersion ${lit(app)}` : ""}${data ? ` ; ic:dataVersion ${lit(data)}` : ""} .`, ""];
  const node = (kind, i) => `<${BASE}export/${local(exported)}/${kind}/${i}>`;
  const ref = (id) => { const iri = itemIri(id); return `ic:itemId ${lit(id)}${iri ? ` ; ic:item <${iri}>` : ""}`; };
  Object.entries(snapshot.swipes ?? {}).sort(([a], [b]) => (a < b ? -1 : 1)).forEach(([id, s], i) => {
    if (!VERDICT_NAME[s?.v]) return;
    out.push(`${node("verdict", i)} a ic:Verdict ; ic:inExport ${ex} ; ${ref(id)} ;`,
      `  ic:verdict ${lit(VERDICT_NAME[s.v])} ; ic:ts ${Math.round(s.ts ?? 0)} ; dcterms:modified ${lit(isoOf(s.ts ?? 0))}^^xsd:dateTime .`);
  });
  Object.entries(snapshot.notes ?? {}).sort(([a], [b]) => (a < b ? -1 : 1)).forEach(([id, n], i) => {
    if (typeof n?.text !== "string" || !n.text) return;
    out.push(`${node("note", i)} a ic:Note ; ic:inExport ${ex} ; ${ref(id)} ;`,
      `  schema:text ${lit(n.text)} ; ic:ts ${Math.round(n.ts ?? 0)} ; dcterms:modified ${lit(isoOf(n.ts ?? 0))}^^xsd:dateTime .`);
  });
  Object.entries(settings).forEach(([k, v], i) => {
    out.push(`${node("setting", i)} a ic:Setting ; ic:inExport ${ex} ; ic:key ${lit(k)} ; rdf:value ${lit(v)} .`);
  });
  return out.join("\n") + "\n";
}

export const Q_EXPORT_VERDICTS = `PREFIX ic: <${BASE}>
SELECT ?id ?verdict ?ts WHERE { ?x a ic:Verdict ; ic:itemId ?id ; ic:verdict ?verdict ; ic:ts ?ts }`;
export const Q_EXPORT_NOTES = `PREFIX ic: <${BASE}>
PREFIX schema: <http://schema.org/>
SELECT ?id ?text ?ts WHERE { ?x a ic:Note ; ic:itemId ?id ; schema:text ?text ; ic:ts ?ts }`;
export const Q_EXPORT_SETTINGS = `PREFIX ic: <${BASE}>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
SELECT ?key ?value WHERE { ?x a ic:Setting ; ic:key ?key ; rdf:value ?value }`;
export const Q_EXPORT_META = `PREFIX ic: <${BASE}>
PREFIX dcterms: <http://purl.org/dc/terms/>
SELECT ?created ?format WHERE { ?e a ic:PreferencesExport ; ic:format ?format . OPTIONAL { ?e dcterms:created ?created } }`;

/** Rows of the four queries above (from an opened .rete) -> { swipes, notes, settings, exported }; throws if it isn't an export. */
export function fromRows({ meta = [], verdicts = [], notes = [], settings = [] }) {
  const v = (t) => (t && typeof t === "object" && "value" in t ? t.value : t);
  if (!meta.some((r) => v(r.format) === FORMAT)) throw new Error("That .rete file isn't an ISWC 2026 Companion export.");
  const out = { swipes: {}, notes: {}, settings: {}, exported: v(meta[0]?.created) ?? null };
  for (const r of verdicts) { const w = VERDICT_OF[v(r.verdict)]; if (w) out.swipes[v(r.id)] = { v: w, ts: Number(v(r.ts)) || 0 }; }
  for (const r of notes) out.notes[v(r.id)] = { text: String(v(r.text)), ts: Number(v(r.ts)) || 0 };
  out.settings = pickSettings(settings.map((r) => [v(r.key), v(r.value)]));
  return out;
}

/** "23 picks, 5 notes and 8 settings" (zeros left out; "nothing new" when all are zero). */
export function importSummary({ swipes = 0, notes = 0, settings = 0 }) {
  const parts = [[swipes, "pick"], [notes, "note"], [settings, "setting"]].filter(([n]) => n).map(([n, w]) => `${n} ${w}${n === 1 ? "" : "s"}`);
  if (!parts.length) return "nothing new";
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}
