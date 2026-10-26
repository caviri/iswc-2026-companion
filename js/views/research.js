// Research blocks shared by item pages, panels, the wide deck card, person pages and Home: links grouped
// into Read / Code / Data / Graphs used, a person's profiles, recent work and datasets, and the cards of
// Home's "Open source & data" slider. The models live in js/research-model.js. External links open in
// a new tab and always name their source.
import { h, icon } from "../ui.js";
import { logoChip } from "./images.js";
import { starText, groupLinks, federatedQuery, explorerHref, recentWorks, personDatasets, personProfiles } from "../research-model.js";

const ext = (url, cls, ...kids) => h("a", { class: cls, href: url, target: "_blank", rel: "noopener noreferrer" }, ...kids);
const plural = (n, one, many = one + "s") => `${n.toLocaleString("en")} ${n === 1 ? one : many}`;
const field = (label, cls, ...content) => h("div", { class: `field ${cls}` }, h("h3", {}, label), h("div", { class: "field-body" }, content));
const via = (source, label = "") => (source && source.toLowerCase() !== label.toLowerCase() ? h("span", { class: "link-src" }, `via ${source}`) : null);

/** ★ 1,234 (nothing when unknown). */
export const stars = (n, compact = false) => (Number.isFinite(n) ? h("span", { class: "rs-stars", "aria-label": `${n.toLocaleString("en")} GitHub ${n === 1 ? "star" : "stars"}` }, icon("star", { size: 14, fill: n > 0 }), starText(n, compact)) : null);

/** Live / down dot plus the CORS badge. The state is the result of the last check, not a live probe. */
export function statusBadge(status) {
  return h("span", { class: `gr-status s-${status.state}`, title: "Checked when the data was last refreshed; the endpoint may have changed since." },
    h("span", { class: "gr-dot", "aria-hidden": "true" }),
    h("span", {}, status.label),
    status.cors != null && status.state === "live"
      ? h("span", { class: `gr-cors${status.cors ? "" : " no"}`, title: status.cors ? "The endpoint allows queries from web pages (CORS)" : "The endpoint refuses queries from web pages (no CORS)" },
        status.cors ? "CORS" : "no CORS")
      : null);
}

function readList(ls) {
  return h("ul", { class: "link-list" }, ls.map((l) => h("li", {},
    ext(l.url, "link-row", icon(l.icon, { size: 20 }), h("span", { class: "link-label" }, l.label), via(l.source, l.label), icon("external", { size: 16 })))));
}

function codeList(ls) {
  return h("ul", { class: "link-list rs-code" }, ls.map((l) => h("li", {},
    ext(l.url, "link-row", icon(l.icon, { size: 20 }),
      h("span", { class: "rs-name" },
        h("span", { class: "rs-repo" }, l.owner ? h("span", { class: "rs-owner" }, `${l.owner}/`) : null, h("strong", {}, l.repo)),
        via(l.source)),
      stars(l.stars), icon("external", { size: 16 })))));
}

function dataList(ls) {
  return h("ul", { class: "link-list rs-data" }, ls.map((l) => h("li", {},
    ext(l.url, "link-row", icon(l.icon, { size: 20 }),
      h("span", { class: "rs-name" }, h("span", { class: "link-label" }, l.label), h("span", { class: "rs-id" }, l.name), via(l.source)),
      icon("external", { size: 16 })))));
}

/** One graph: name, endpoint with its status, homepage, and the way to query it. */
export function graphBlock(g) {
  const fed = g.endpoint ? federatedQuery(g) : null;
  const host = g.endpoint ? g.endpoint.replace(/^https:\/\//, "") : null;
  return h("li", { class: `gr-card s-${g.status.state}` },
    h("div", { class: "gr-head" },
      logoChip(g.logo, g.name, { height: 28, cls: "gr-logo" }) ?? icon("graph", { size: 20 }),
      h("strong", { class: "gr-name" }, g.name),
      g.homepage ? ext(g.homepage, "gr-home", "Homepage", icon("external", { size: 14 })) : null),
    g.endpoint ? h("div", { class: "gr-ep" },
      h("span", { class: "gr-ep-label" }, "SPARQL endpoint"),
      statusBadge(g.status),
      ext(g.endpoint, "gr-url", host)) : null,
    fed && g.status.queryable ? h("div", { class: "gr-act" },
      h("a", { class: "pill-btn gr-query", href: explorerHref(fed.query) }, icon("code", { size: 18 }), "Query in SPARQL explorer"),
      h("p", { class: "src-note" }, `Opens the explorer with an example. Nothing is sent to ${fed.host} until you press Run.`))
      : fed ? h("div", { class: "gr-act" },
        ext(fed.uiUrl, "pill-btn gr-query", icon("external", { size: 18 }), `Open ${g.name}'s own query page`),
        h("p", { class: "src-note" }, g.status.state === "live" ? "This endpoint doesn't accept queries from web pages, so it can't be queried from the app." : "The endpoint didn't answer at the last check."))
        : null,
    g.source ? h("p", { class: "src-note gr-src" }, `Source: ${g.source}.`) : null);
}

/**
 * The links of a session or paper as up to four fields: Read, Code, Data, Graphs used. Empty groups
 * are left out; an item without links gives nothing.
 */
export function researchFields(program, links) {
  const g = groupLinks(program, links);
  return [
    g.read.length ? field("Read", "rs-read", readList(g.read)) : null,
    g.code.length ? field("Code", "rs-code-f", codeList(g.code)) : null,
    g.data.length ? field("Data", "rs-data-f", dataList(g.data)) : null,
    g.graphs.length ? field(g.graphs.length === 1 ? "Graph used" : "Graphs used", "rs-graphs", h("ul", { class: "gr-list" }, g.graphs.map(graphBlock))) : null,
  ];
}

/** Small code / data marks for rows and cards (nothing when the item has neither). */
export function researchMarks(flags) {
  if (!flags.code && !flags.data) return null;
  return h("span", { class: "rs-marks" },
    flags.code ? h("span", { class: "rs-mark", title: "Has code", role: "img", "aria-label": "Has code" }, icon("code", { size: 14 })) : null,
    flags.data ? h("span", { class: "rs-mark", title: "Has data", role: "img", "aria-label": "Has data" }, icon("dataset", { size: 14 })) : null);
}

// ---- person ----

/** Profiles: verified buttons, then self-declared ones with their badge. */
export function profilesField(person) {
  const { verified, declared } = personProfiles(person);
  const btn = (l, self) => ext(l.url, `pill-btn link-btn${self ? " self" : ""}`, icon(l.icon, { size: 18 }), l.label);
  return h("div", { class: "field" }, h("h3", {}, "Profiles"),
    verified.length ? h("div", { class: "link-btns" }, verified.map((l) => btn(l, false))) : null,
    verified.length ? h("p", { class: "src-note" }, `Verified through their papers. Sources: ${[...new Set(verified.map((l) => l.source).filter(Boolean))].join(", ")}.`) : null,
    declared.length ? h("div", { class: "link-btns rs-declared" }, declared.map((l) => btn(l, true))) : null,
    declared.length ? h("p", { class: "src-note" }, h("span", { class: "rs-badge" }, "ORCID (self-declared)"), " Listed by the person on their own ORCID record.") : null,
    !verified.length && !declared.length ? h("p", { class: "muted" }, "No verified profile links found.") : null);
}

/** Recent work (≤5): year, title, venue, citations; source OpenAlex. `works` / `title` override the list and heading. */
export function worksField(person, { works = null, title = "Recent work" } = {}) {
  const ws = recentWorks(works ? { works } : person);
  if (!ws.length) return null;
  return h("div", { class: "field rs-works" }, h("h3", {}, title),
    h("ol", { class: "rs-work-list" }, ws.map((w) => h("li", {},
      ext(w.url, "rs-work",
        h("span", { class: "rs-year" }, w.year ? String(w.year) : "–"),
        h("span", { class: "rs-work-text" },
          h("span", { class: "rs-work-title" }, w.title),
          h("span", { class: "rs-work-meta" }, [w.venue, w.citedBy ? `cited ${plural(w.citedBy, "time")}` : null].filter(Boolean).join(", ") || w.host)),
        icon("external", { size: 16 }))))),
    h("p", { class: "src-note" }, "Other publications, not at ISWC 2026. Source: OpenAlex."));
}

/** Datasets (≤5); source OpenAlex. */
export function datasetsField(person) {
  const ds = personDatasets(person);
  if (!ds.length) return null;
  return h("div", { class: "field rs-pdata" }, h("h3", {}, "Datasets"),
    h("ul", { class: "link-list rs-data" }, ds.map((d) => h("li", {},
      ext(d.url, "link-row", icon("dataset", { size: 20 }),
        h("span", { class: "rs-name" }, h("span", { class: "link-label" }, d.title), h("span", { class: "rs-id" }, [d.year, d.host].filter(Boolean).join(", "))),
        icon("external", { size: 16 }))))),
    h("p", { class: "src-note" }, "Datasets they published on semantic-web topics. Source: OpenAlex."));
}
