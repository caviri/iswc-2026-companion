// Built with rete (#/rete): how this app works, kept simple. A self-contained, RDF-based static page: static
// files, one RDF graph, SPARQL in the browser. Three diagrams drawn for the app (js/rete-diagrams.js): how the
// page works, one example as a sequence, the data model; the vocabularies with live counts; what rete is; and the
// demo at ISWC 2026. Content and queries: js/rete-model.js.
import { h, icon } from "../ui.js";
import { dayLong } from "../model.js";
import { getGraph } from "../data.js";
import { Q_DATASET } from "../queries.js";
import { imgUrl } from "../images-model.js";
import { LINKS, DEMO_PAPER, IMAGES, VOCABULARIES, Q_PROPERTIES, countRows, byVocabulary, bigNumber, demoWhen, demoWhere } from "../rete-model.js";
import { howItWorks, sequence, dataModel } from "../rete-diagrams.js";
import { PREFIXES } from "../sparql-model.js";
import { verdictToggle } from "./detail.js";
import { diagramFigure } from "./diagram.js";

const ext = (url, cls, ...kids) => h("a", { class: cls, href: url, target: "_blank", rel: "noopener noreferrer" }, ...kids);

const diagram = diagramFigure;

function stats(g) {
  let card = null, rel = null;
  try { card = g?.card?.() ?? null; } catch { /* no card */ }
  try { const r = g?.query(Q_DATASET)?.[0]; rel = r ? { version: r.version?.value ?? r.version, issued: String(r.issued?.value ?? r.issued).slice(0, 10) } : null; } catch { /* older file */ }
  const items = [
    card?.triple_count ? [bigNumber(card.triple_count), "triples"] : null,
    rel ? [rel.version, `data release, ${dayLong(rel.issued)}`] : null,
    card?.example_queries?.length ? [String(card.example_queries.length), "example queries inside"] : null,
  ].filter(Boolean);
  return items.length ? h("ul", { class: "rt-stats" }, items.map(([n, l]) => h("li", {}, h("strong", {}, n), h("span", {}, l)))) : null;
}

function vocabularyTable(g) {
  let per = {};
  try { per = byVocabulary(countRows(g?.query(Q_PROPERTIES) ?? [], "p")); } catch { /* without counts */ }
  return h("div", { class: "rt-table-wrap" }, h("table", { class: "rt-table" },
    h("thead", {}, h("tr", {}, h("th", {}, "Prefix"), h("th", {}, "Vocabulary"), h("th", {}, "Used for"), h("th", { class: "num" }, "Triples"))),
    h("tbody", {}, VOCABULARIES.map((v) => h("tr", {},
      h("td", {}, h("code", { title: PREFIXES[v.prefix] ?? "" }, `${v.prefix}:`), h("span", { class: "rt-vname" }, v.name)),
      h("td", {}, v.name), h("td", {}, v.use),
      h("td", { class: "num" }, per[v.prefix] ? bigNumber(per[v.prefix]) : "–"))))));
}

/** renderRete(root, program, store) -> cleanup() */
export function renderRete(root, program, store) {
  const g = program.source === "rete" ? getGraph() : null;
  const demo = program.byId.get(DEMO_PAPER);
  const session = program.sessions.find((s) => /poster and demos/i.test(s.title)) ?? null;
  const keep = demo ? verdictToggle(store, demo.id) : null;

  root.replaceChildren(h("section", { class: "view rete-view" },
    h("header", { class: "rt-hero" },
      h("img", { class: "rt-logo", src: imgUrl(IMAGES.logo.file), alt: "rete", width: 260, height: 70 }),
      h("h1", { class: "view-title" }, "Built with rete"),
      h("p", { class: "rt-lede" }, "This app is a self-contained, RDF-based static page. There is no server: the programme is one RDF graph file, ",
        h("code", {}, "iswc26.rete"), ", and your browser asks it SPARQL questions."),
      g ? stats(g) : null),

    h("section", { class: "rt-sec", "aria-labelledby": "rt-how" },
      h("h2", { class: "rt-h", id: "rt-how" }, "How the page works"),
      diagram(howItWorks()),
      h("ul", { class: "rt-points" },
        h("li", {}, h("strong", {}, "Static. "), "A web host serves plain files: the page, its scripts, images and the graph."),
        h("li", {}, h("strong", {}, "SPARQL in the browser. "), "The rete engine, compiled to WebAssembly, answers the app's questions from the graph file."),
        h("li", {}, h("strong", {}, "Yours stays here. "), "Picks and notes live in this browser; offline, everything keeps working."))),

    h("section", { class: "rt-sec", "aria-labelledby": "rt-example" },
      h("h2", { class: "rt-h", id: "rt-example" }, "One example: Tuesday's timetable"),
      diagram(sequence()),
      h("p", { class: "rt-prose" }, "The app reads the programme this way once, when it opens; every screen then uses the answer. The SPARQL page runs your own questions the same way, live. ",
        h("a", { href: "#/sparql" }, "Try one"), ".")),

    h("section", { class: "rt-sec", "aria-labelledby": "rt-model" },
      h("h2", { class: "rt-h", id: "rt-model" }, "The data model"),
      diagram(dataModel()),
      h("p", { class: "rt-prose" }, "It reuses well-known vocabularies and adds a few terms of its own under ", h("code", {}, "ic:"), " (", h("code", {}, PREFIXES.ic), ")."),
      h("p", {}, h("a", { class: "pill-btn primary", href: "#/ontology" }, icon("book", { size: 18 }), "Read the ontology"), " ",
        h("a", { class: "pill-btn", href: "data/iswc26-ontology.ttl", download: "iswc26-ontology.ttl" }, icon("download", { size: 18 }), "Turtle (.ttl)")),
      vocabularyTable(g)),

    h("section", { class: "rt-sec", "aria-labelledby": "rt-what" },
      h("h2", { class: "rt-h", id: "rt-what" }, "What rete is"),
      h("p", { class: "rt-prose" }, "rete puts a whole RDF graph in one file you can drop on any web host. A client then runs SPARQL on it in place, downloading only the parts a question needs: no database, no server. It works from the browser, Python and the command line."),
      h("ul", { class: "rt-links" },
        h("li", {}, ext(LINKS.repo, "pill-btn", icon("github", { size: 18 }), "github.com/caviri/rete")),
        h("li", {}, ext(LINKS.docs, "pill-btn", icon("doc", { size: 18 }), "Documentation")),
        h("li", {}, ext(LINKS.playground, "pill-btn", icon("play", { size: 18 }), "Playground")),
        h("li", {}, ext(LINKS.doi, "pill-btn", icon("link", { size: 18 }), "DOI 10.5281/zenodo.21546287")))),

    h("section", { class: "rt-sec rt-demo", "aria-labelledby": "rt-demo" },
      h("h2", { class: "rt-h", id: "rt-demo" }, "Come and talk to us at the demo"),
      h("p", { class: "rt-when" }, icon("clock", { size: 20 }),
        session ? h("span", {}, h("strong", {}, demoWhen(session, demoWhere(program, session))), ` · ${session.title}`) : "Posters & Demos"),
      demo ? h("a", { class: "rt-paper", href: `#/item/${encodeURIComponent(demo.id)}` }, h("strong", {}, demo.title), h("span", {}, demo.authors.join(", "))) : null,
      h("p", { class: "rt-prose" }, "Three graphs, up to 60 GB (Crossref, 3.78 billion triples), queried from a browser, a notebook and an AI assistant, with no SPARQL endpoint anywhere. Bring your questions, your graph, or this app."),
      keep ? h("div", { class: "rt-keep" }, h("span", { class: "src-note" }, "Add the demo to My ISWC:"), keep) : null,
      h("ul", { class: "rt-links" },
        h("li", {}, ext(LINKS.demo, "pill-btn primary", icon("external", { size: 18 }), "Open the demo: demo.graphplaza.com")),
        h("li", {}, ext(LINKS.repo, "pill-btn", icon("github", { size: 18 }), "github.com/caviri/rete"))))));
  return () => { keep?.dispose?.(); };
}
