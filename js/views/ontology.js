// The ontology (#/ontology?term=Name): the ic: vocabulary read like a W3C specification (ReSpec style), made for
// phones too: a header with versions and links, abstract, contents, namespaces, the data model diagram, every
// class and property as a card (IRI, definition, super-classes, domain and range, where it is used) with links
// between them, and the published Turtle with syntax colours, copy and download. The terms come from the graph
// with SPARQL; the Turtle is fetched as text. Pure parts: js/ontology-model.js.
import { h, icon, toast } from "../ui.js";
import { dayLong } from "../model.js";
import { getGraph } from "../data.js";
import { replaceRoute } from "../route-state.js";
import { PREFIXES } from "../sparql-model.js";
import { dataModel } from "../rete-diagrams.js";
import { diagramFigure } from "./diagram.js";
import { Q_ONTOLOGY, Q_TERMS, ONTOLOGY_IRI, TTL_FILE, groupTerms, anchorOf, highlightTurtle } from "../ontology-model.js";

const v = (t) => (t && typeof t === "object" && "value" in t ? t.value : t);
const ext = (url, ...kids) => h("a", { href: url, target: "_blank", rel: "noopener noreferrer" }, ...kids);
const IC = PREFIXES.ic;

/** A curie on the page: an ic: term links to its card, a known vocabulary's term to its namespace. */
function termRef(c, go) {
  if (c.startsWith("ic:")) return h("a", { class: "on-ref", href: `#/ontology?term=${c.slice(3)}`, onclick: (e) => { e.preventDefault(); go(c.slice(3)); } }, h("code", {}, c));
  const [p, local] = c.split(":");
  return PREFIXES[p] && local ? ext(PREFIXES[p] + local, h("code", {}, c)) : h("code", {}, c);
}
const refs = (list, go) => list.flatMap((c, i) => [i ? ", " : "", termRef(c, go)]);

function termCard(t, go) {
  const row = (k, list) => (list.length ? [h("dt", {}, k), h("dd", {}, refs(list, go))] : []);
  return h("section", { class: "on-term", id: anchorOf(t.name), "aria-labelledby": `${anchorOf(t.name)}-h` },
    h("h4", { id: `${anchorOf(t.name)}-h` }, h("span", { class: `on-kind on-${t.kind}` }, t.kind === "class" ? "Class" : t.kind === "object" ? "Object property" : "Datatype property"), t.label),
    h("p", { class: "on-iri" }, h("code", {}, t.curie), " ", h("span", {}, t.iri)),
    t.comment ? h("p", { class: "on-def" }, t.comment) : null,
    h("dl", { class: "on-dl" },
      ...row("Subclass of", t.supers),
      ...row(t.kind === "class" ? "" : "Domain includes", t.kind === "class" ? [] : t.domains),
      ...row(t.kind === "datatype" ? "Range" : t.kind === "object" ? "Range includes" : "", t.kind === "class" ? [] : t.ranges),
      ...row("Properties with this domain", t.usedBy ?? []),
      ...row("Target of", t.rangeOf ?? [])));
}

function turtleBlock(text) {
  const pre = h("pre", { class: "on-ttl", tabindex: "0", "aria-label": "The ontology in Turtle" },
    h("code", {}, highlightTurtle(text).map((tk) => (tk.cls ? h("span", { class: `ttl-${tk.cls}` }, tk.text) : tk.text))));
  const copy = h("button", { type: "button", class: "pill-btn" }, icon("doc", { size: 18 }), "Copy");
  copy.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(text); toast("Turtle copied."); } catch { toast("Couldn't copy: select the text instead."); }
  });
  return [h("div", { class: "st-actions" }, copy,
    h("a", { class: "pill-btn primary", href: TTL_FILE, download: "iswc26-ontology.ttl" }, icon("download", { size: 18 }), "Download .ttl")), pre];
}

/** renderOntology(root, program, params) -> cleanup() */
export function renderOntology(root, program, params = {}) {
  const g = program.source === "rete" ? getGraph() : null;
  let meta = null, terms = { classes: [], objectProperties: [], datatypeProperties: [] };
  try { const r = g?.query(Q_ONTOLOGY)?.[0]; if (r) meta = Object.fromEntries(Object.entries(r).map(([k, x]) => [k, v(x)])); } catch { /* shown without */ }
  try { terms = groupTerms(g?.query(Q_TERMS) ?? []); } catch { /* source only */ }
  const go = (name) => {
    replaceRoute(`#/ontology?term=${encodeURIComponent(name)}`);
    document.getElementById(anchorOf(name))?.scrollIntoView({ block: "start", behavior: "smooth" });
  };
  const source = h("div", { class: "on-source" }, h("p", { class: "src-note" }, "Loading the Turtle…"));
  fetch(TTL_FILE).then((r) => (r.ok ? r.text() : Promise.reject(new Error(r.status)))).then((t) => source.replaceChildren(...turtleBlock(t)))
    .catch(() => source.replaceChildren(h("p", { class: "src-note" }, "The Turtle file couldn't be loaded.")));

  const n = terms.classes.length + terms.objectProperties.length + terms.datatypeProperties.length;
  // [section id, label, terms listed under it in the contents]
  const toc = [
    ["on-abstract", "Abstract", []], ["on-ns", "1. Namespaces", []], ["on-overview", "2. Overview", []],
    ["on-classes", `3. Classes (${terms.classes.length})`, terms.classes],
    ["on-objprops", `4. Object properties (${terms.objectProperties.length})`, terms.objectProperties],
    ["on-dtprops", `5. Datatype properties (${terms.datatypeProperties.length})`, terms.datatypeProperties],
    ["on-ttl", "6. Turtle", []],
  ];
  const tocEl = h("details", { class: "on-toc", open: wide() || null });
  const jump = (id) => (e) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ block: "start", behavior: "smooth" });
    if (!wide()) tocEl.open = false; // on a phone, fold the contents away once used
  };
  tocEl.append(h("summary", {}, "Contents"),
    h("ol", { class: "on-toc-list" }, toc.map(([id, label, list]) => h("li", { "data-sec": id },
      h("a", { href: "#/ontology", onclick: jump(id), "data-target": id }, label),
      list.length ? h("ol", { class: "on-toc-terms" }, list.map((x) => h("li", {},
        h("a", { href: `#/ontology?term=${x.name}`, onclick: jump(anchorOf(x.name)), "data-target": anchorOf(x.name) }, x.curie)))) : null))));
  const svgFig = diagramFigure(dataModel());

  const head = h("header", { class: "on-head" },
      h("p", { class: "on-k" }, "Vocabulary specification"),
      h("h1", { class: "on-title" }, meta?.title ?? "ISWC 2026 Companion ontology"),
      h("p", { class: "on-sub" }, meta ? `Version ${meta.version}${meta.issued ? `, ${dayLong(String(meta.issued).slice(0, 10))} 2026` : ""}` : "The ic: vocabulary"),
      h("dl", { class: "on-meta" },
        h("dt", {}, "This version"), h("dd", {}, h("code", {}, meta?.versionIRI ?? ONTOLOGY_IRI)),
        h("dt", {}, "Latest version"), h("dd", {}, h("code", {}, ONTOLOGY_IRI)),
        h("dt", {}, "Namespace"), h("dd", {}, h("code", {}, `ic: ${IC}`)),
        h("dt", {}, "Turtle"), h("dd", {}, h("a", { href: TTL_FILE, download: "iswc26-ontology.ttl" }, "iswc26-ontology.ttl")),
        meta?.creator ? [h("dt", {}, "Editor"), h("dd", {}, meta.creator)] : null,
        h("dt", {}, "Built with"), h("dd", {}, h("a", { href: "#/rete" }, "rete"), " · ", ext("https://github.com/caviri/rete", "github.com/caviri/rete"))));

  root.replaceChildren(h("article", { class: "view on-doc" }, head, tocEl, h("div", { class: "on-main" },

    h("section", { id: "on-abstract", class: "on-sec" }, h("h2", {}, "Abstract"),
      h("p", {}, meta?.description ?? "The terms the companion's graph adds to well-known vocabularies."),
      h("p", {}, `${n} terms: everything under ic: the graph uses, and nothing else (the build checks both ways). They sit next to schema.org, SKOS, DCAT, VoID, Dublin Core, PROV-O, OWL and SHACL, which the graph reuses as they are.`)),

    h("section", { id: "on-ns", class: "on-sec" }, h("h2", {}, "1. Namespaces"),
      h("div", { class: "rt-table-wrap" }, h("table", { class: "rt-table" },
        h("thead", {}, h("tr", {}, h("th", {}, "Prefix"), h("th", {}, "Namespace"))),
        h("tbody", {}, Object.entries(PREFIXES).map(([p, ns]) => h("tr", {}, h("td", {}, h("code", {}, `${p}:`)), h("td", { class: "on-ns-iri" }, h("code", {}, ns)))))))),

    h("section", { id: "on-overview", class: "on-sec" }, h("h2", {}, "2. Overview"),
      h("p", {}, "The main things in the graph and how they connect. Most classes come from schema.org; ic: adds agenda items, authorships, links with their provenance, and the people's own exports."),
      svgFig),

    h("section", { id: "on-classes", class: "on-sec" }, h("h2", {}, "3. Classes"), terms.classes.map((t) => termCard(t, go))),
    h("section", { id: "on-objprops", class: "on-sec" }, h("h2", {}, "4. Object properties"), terms.objectProperties.map((t) => termCard(t, go))),
    h("section", { id: "on-dtprops", class: "on-sec" }, h("h2", {}, "5. Datatype properties"), terms.datatypeProperties.map((t) => termCard(t, go))),
    h("section", { id: "on-ttl", class: "on-sec" }, h("h2", {}, "6. Turtle"), source))));

  // Where you are: the section (and the term card) at the top of the screen is marked in the contents, and its
  // term list opens; on desktop the contents stay beside the text (css: sticky).
  const links = [...tocEl.querySelectorAll("a[data-target]")];
  const watched = links.map((a) => document.getElementById(a.dataset.target)).filter(Boolean);
  const mark = () => {
    const line = (parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--tick-h")) || 0) + 90;
    let sec = null, term = null;
    for (const el of watched) {
      if (el.getBoundingClientRect().top > line) continue;
      if (el.classList.contains("on-sec")) sec = el.id; else term = el.id;
    }
    if (term && !document.getElementById(term)?.closest(`#${sec}`)) term = null;
    for (const a of links) {
      const on = a.dataset.target === sec || a.dataset.target === term;
      if (on) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current");
    }
    for (const li of tocEl.querySelectorAll("li[data-sec]")) li.classList.toggle("open", li.dataset.sec === sec);
    if (wide() && term) tocEl.querySelector(`a[data-target="${term}"]`)?.scrollIntoView({ block: "nearest" });
  };
  let raf = 0;
  const onScroll = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(mark); };
  addEventListener("scroll", onScroll, { passive: true });
  const mq = matchMedia("(min-width: 1100px)");
  const onMq = () => { tocEl.open = mq.matches || tocEl.open; };
  mq.addEventListener?.("change", onMq);
  mark();

  if (params.term) requestAnimationFrame(() => { document.getElementById(anchorOf(params.term))?.scrollIntoView({ block: "start" }); mark(); });
  return () => { removeEventListener("scroll", onScroll); cancelAnimationFrame(raf); mq.removeEventListener?.("change", onMq); };
}

/** Wide enough for the contents to sit beside the text. */
const wide = () => globalThis.matchMedia?.("(min-width: 1100px)").matches ?? false;
