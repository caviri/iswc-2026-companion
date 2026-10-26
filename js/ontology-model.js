// The ontology page (#/ontology): the ic: vocabulary read as a specification. The terms come from the graph with
// SPARQL (pipeline/ontology.ttl is merged into iswc26.rete); the published Turtle (data/iswc26-ontology.ttl) is
// shown with syntax colours. Pure: queries, grouping and a Turtle tokenizer; views/ontology.js draws it.
// Tested in tests/app/ontology.test.mjs.
import { PREFIXES } from "./sparql-model.js";

export const ONTOLOGY_IRI = "https://w3id.org/iswc26-companion/ontology";
export const TTL_FILE = "data/iswc26-ontology.ttl";
const IC = PREFIXES.ic;

export const Q_ONTOLOGY = `PREFIX owl: <http://www.w3.org/2002/07/owl#>
PREFIX dcterms: <http://purl.org/dc/terms/>
SELECT ?title ?description ?version ?versionIRI ?issued ?creator WHERE {
  <${ONTOLOGY_IRI}> a owl:Ontology ; dcterms:title ?title ; owl:versionInfo ?version .
  OPTIONAL { <${ONTOLOGY_IRI}> dcterms:description ?description }
  OPTIONAL { <${ONTOLOGY_IRI}> owl:versionIRI ?versionIRI }
  OPTIONAL { <${ONTOLOGY_IRI}> dcterms:issued ?issued }
  OPTIONAL { <${ONTOLOGY_IRI}> dcterms:creator ?creator }
}`;

export const Q_TERMS = `PREFIX owl: <http://www.w3.org/2002/07/owl#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX schema: <http://schema.org/>
SELECT ?term ?type ?label ?comment
       (GROUP_CONCAT(DISTINCT STR(?sup); separator="|") AS ?supers)
       (GROUP_CONCAT(DISTINCT STR(?dom); separator="|") AS ?domains)
       (GROUP_CONCAT(DISTINCT STR(?rng); separator="|") AS ?ranges)
WHERE {
  ?term a ?type .
  VALUES ?type { owl:Class owl:ObjectProperty owl:DatatypeProperty }
  FILTER(STRSTARTS(STR(?term), "${IC}"))
  OPTIONAL { ?term rdfs:label ?label }
  OPTIONAL { ?term rdfs:comment ?comment }
  OPTIONAL { ?term rdfs:subClassOf ?sup }
  OPTIONAL { ?term schema:domainIncludes ?dom }
  OPTIONAL { { ?term rdfs:range ?rng } UNION { ?term schema:rangeIncludes ?rng } }
}
GROUP BY ?term ?type ?label ?comment
ORDER BY ?term`;

const v = (t) => (t && typeof t === "object" && "value" in t ? t.value : t);
const split = (s) => (s ? String(s).split("|").filter(Boolean) : []);
const OWL = "http://www.w3.org/2002/07/owl#";
const KIND = { [`${OWL}Class`]: "class", [`${OWL}ObjectProperty`]: "object", [`${OWL}DatatypeProperty`]: "datatype" };

/** An IRI as prefix:local with the known prefixes, else the IRI. */
export function curie(iri) {
  const s = String(iri);
  let best = null;
  for (const [p, ns] of Object.entries(PREFIXES)) if (s.startsWith(ns) && (!best || ns.length > best[1].length)) best = [p, ns];
  return best ? `${best[0]}:${s.slice(best[1].length)}` : s;
}

/**
 * Q_TERMS rows -> { classes, objectProperties, datatypeProperties }, each [{ name, iri, curie, kind, label,
 * comment, supers, domains, ranges }] sorted by name; classes also get `usedBy` (the properties whose domain
 * includes them) and `rangeOf` (the object properties pointing to them).
 */
export function groupTerms(rows) {
  const terms = rows.map((r) => {
    const iri = v(r.term);
    return { name: iri.slice(IC.length), iri, curie: curie(iri), kind: KIND[v(r.type)] ?? "class",
      label: v(r.label) ?? iri.slice(IC.length), comment: v(r.comment) ?? "",
      supers: split(v(r.supers)).map(curie), domains: split(v(r.domains)).map(curie), ranges: split(v(r.ranges)).map(curie) };
  }).sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }) || (a.name < b.name ? -1 : 1));
  const classes = terms.filter((t) => t.kind === "class");
  const props = terms.filter((t) => t.kind !== "class");
  for (const c of classes) {
    c.usedBy = props.filter((p) => p.domains.includes(c.curie)).map((p) => p.curie);
    c.rangeOf = props.filter((p) => p.ranges.includes(c.curie)).map((p) => p.curie);
  }
  return { classes, objectProperties: props.filter((p) => p.kind === "object"), datatypeProperties: props.filter((p) => p.kind === "datatype") };
}

/** The anchor of a term on the page: "AgendaItem" -> "term-AgendaItem". */
export const anchorOf = (name) => `term-${name}`;

// ---------- Turtle syntax colours ----------
const TOKEN = new RegExp([
  String.raw`(?<comment>#[^\n]*)`,
  String.raw`(?<string>"""[\s\S]*?"""|"(?:[^"\\\n]|\\.)*")`,
  String.raw`(?<iri><[^<>"{}|^\x60\\\s]*>)`,
  String.raw`(?<keyword>@prefix\b|@base\b|\bPREFIX\b|\ba\b(?=\s))`,
  String.raw`(?<lang>@[a-zA-Z]+(?:-[a-zA-Z0-9]+)*)`,
  String.raw`(?<datatype>\^\^)`,
  String.raw`(?<pname>[A-Za-z][\w.-]*:[\w.-]*[\w-]|[A-Za-z][\w.-]*:(?=\s))`,
  String.raw`(?<number>[+-]?\d+(?:\.\d+)?)`,
  String.raw`(?<punct>[;,.\[\]()])`,
].join("|"), "g");

/**
 * Turtle text -> [{ text, cls }] covering the whole input (cls null for plain text): comment, string, iri, lang,
 * keyword, datatype, pname, number, punct. A string or IRI is never split by a "#" or ":" inside it.
 */
export function highlightTurtle(src) {
  const out = [];
  let last = 0;
  for (const m of String(src).matchAll(TOKEN)) {
    if (m.index > last) out.push({ text: src.slice(last, m.index), cls: null });
    const cls = Object.entries(m.groups).find(([, x]) => x !== undefined)?.[0] ?? null;
    out.push({ text: m[0], cls });
    last = m.index + m[0].length;
  }
  if (last < src.length) out.push({ text: src.slice(last), cls: null });
  return out;
}
