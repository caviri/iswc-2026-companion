// Item page for a session or paper: every field, verdict toggle, autosaving note, map link.
import { h, icon, noteEditor, tagPill } from "../ui.js";
import { dayLong, timeRange, placeOf, itemTag, VERDICT_LABEL, agendaGroups, whenOf, bylineParts, boardLabel } from "../model.js";
import { termText, termChip, termLegend } from "../terms.js";
import { authorRefs, personOf } from "../people-model.js";
import { thumbSVG } from "../thumbs.js";
import { onVerdictWhile, withVerdictSource } from "../verdict-bus.js";
import { researchFields } from "./research.js";
import { paperFigure } from "./images.js";
import { agendasFor } from "../logistics-model.js";
import { agendaBlocks } from "./logistics.js";
import { rowThumb, tagLine, verdictMark } from "./browse.js";
import { nameRefs, joinSep } from "../people-dir-model.js";

const SITE = "https://iswc2026.semanticweb.org";
const absUrl = (u) => (!u ? null : /^https?:\/\//i.test(u) ? u : u.startsWith("/") ? SITE + u : null);
const listLabel = (l) => l.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());

function back() {
  if (history.length > 1) history.back();
  else location.hash = "#/deck";
}

/** Verdict control: Skip / Maybe / Keep. Pressing the active one clears it. */
export function verdictToggle(store, id, onChange) {
  const wrap = h("div", { class: "verdict", role: "group", "aria-label": "Your verdict" });
  const draw = () => {
    const v = store.verdict(id);
    const b = (dir, label, name) => h("button", {
      type: "button", class: `verdict-btn ${dir === "right" ? "keep" : dir === "up" ? "maybe" : "skip"}`, "aria-pressed": String(v === dir),
      onclick: () => {
        // The verdict says where it was made (a desktop panel or the centre), so the centre catches up only for panels.
        withVerdictSource(wrap.closest(".dash-panels") ? "panel" : "", () => { if (v === dir) store.unswipe(id); else store.swipe(id, dir); });
        draw(); onChange?.();
      },
    }, icon(name, { fill: dir === "right" && v === dir, size: 22 }), label);
    wrap.replaceChildren(b("left", v === "left" ? "Skipped" : "Skip", "x"), b("up", "Maybe", "maybe"), b("right", v === "right" ? "Kept" : "Keep", "heart"));
  };
  draw();
  // A keep/skip made elsewhere (a desktop panel, a row) redraws these buttons too.
  wrap.dispose = onVerdictWhile(wrap, (changed) => { if (changed === id) draw(); });
  return wrap;
}

function field(label, ...content) {
  const c = content.flat().filter((x) => x != null && x !== "");
  return c.length ? h("div", { class: "field" }, h("h3", {}, label), h("div", { class: "field-body" }, c)) : null;
}

const blocks = (text) => String(text ?? "").split(/\n{2,}/).map((t) => t.trim()).filter(Boolean);
// A URL in the text (an organisers' announcement names its venues' pages) becomes a link; the rest is marked with terms.
const URL_RE = /(https?:\/\/[^\s)]+[^\s).,;])/;
const linked = (t, program, terms) => t.split(URL_RE).map((part, i) => (i % 2
  ? h("a", { href: part, target: "_blank", rel: "noopener noreferrer" }, part.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""))
  : termText(part, program, terms)));
const paras = (text, program, terms) => blocks(text).map((t) => h("p", {}, linked(t, program, terms)));

/** A linked row for "Presented in" and a session's papers: miniature with the kept / maybe / skipped mark, title, type tag. */
function itemRow(program, store, x) {
  const v = store.verdict(x.id);
  const mark = h("span", { class: "row-mark", role: "img", "aria-label": VERDICT_LABEL[v] ?? "Not sorted yet" }, verdictMark(v));
  const s = x.paperIds ? x : null;
  return h("li", {}, h("a", { class: `row-link ${v ? "v-" + v : ""}`, href: `#/item/${encodeURIComponent(x.id)}` },
    rowThumb(program, x, mark),
    h("span", { class: "row-text" },
      h("span", { class: "row-title" }, x.title),
      !s && x.authors?.length ? h("span", { class: "row-meta" }, x.authors.join(", ")) : null,
      tagLine(program, x, s ? `${dayLong(s.day)}, ${timeRange(s)}` : boardLabel(x) ?? ""))));
}

/** One agenda item: its time, then a talk's paper row, a keynote (speaker, talk title, abstract) or a plain entry. */
function agendaItem(program, store, s, a, state = "") {
  const time = h("span", { class: "ag-time" }, a.end ? `${a.start}–${a.end}` : `from ${a.start}`,
    state === "now" || state === "next" ? h("span", { class: `ag-state ag-${state}-tag` }, state === "now" ? "Now" : "Next") : null);
  const cls = state ? ` ag-${state}` : "";
  const p = a.paperId ? program.byId.get(a.paperId) : null;
  if (p) {
    const v = store.verdict(p.id);
    return h("li", { class: `ag-item ag-talk${cls}` }, time, h("a", { class: `row-link ${v ? "v-" + v : ""}`, href: `#/item/${encodeURIComponent(p.id)}` },
      rowThumb(program, p, h("span", { class: "row-mark", role: "img", "aria-label": VERDICT_LABEL[v] ?? "Not sorted yet" }, verdictMark(v))),
      h("span", { class: "row-text" },
        h("span", { class: "row-title" }, p.title),
        p.authors.length ? h("span", { class: "row-meta" }, p.authors.join(", ")) : null,
        a.note ? h("span", { class: "row-meta ag-note" }, a.note) : null)));
  }
  if (a.kind === "keynote" && a.talkTitle) {
    const sp = personOf(program, a.speakerId);
    return h("li", { class: `ag-item ag-keynote${cls}` }, time, h("div", { class: "ag-text" },
      h("span", { class: "ag-kind" }, "Keynote"),
      h("p", { class: "talk-title" }, a.talkTitle),
      h("p", {}, h("strong", {}, sp ? h("a", { class: "person-link", href: `#/person/${encodeURIComponent(sp.id)}` }, a.speaker) : a.speaker),
        a.note ? `, ${a.note}` : ""),
      a.abstract ? foldable(field("Abstract", paras(a.abstract)), a.abstract.length > LONG_ABSTRACT, "fold-abs") : null));
  }
  if (a.kind === "talk" || a.kind === "keynote") return agendaTalk(program, s, a, time, cls);
  // An entry that isn't a talk (opening, break, discussion): its title, linked when there is a link.
  const title = a.url ? h("a", { class: "ag-link", href: a.url, target: "_blank", rel: "noopener noreferrer" }, a.title, icon("external", { size: 13 })) : a.title;
  return h("li", { class: `ag-item ag-${a.kind}${cls}` }, time, h("span", { class: "ag-text" },
    h("span", {}, title, a.note ? h("span", { class: "row-meta" }, ` (${a.note})`) : null),
    a.byline ? h("span", { class: "row-meta" }, a.byline) : null));
}

/**
 * A talk the event publishes itself (a workshop's or a journal session's, not a programme paper): a row that opens in
 * place on when and where it is, its block, authors, abstract and the event's own links (the paper, its abstract, the
 * session's programme).
 */
function agendaTalk(program, s, a, time, cls) {
  const by = bylineParts(a.byline);
  const room = s?.roomId ? program.byId.get(s.roomId) : null;
  const place = placeOf(program, s);
  const ext = (url, label) => h("a", { class: "pill-btn", href: url, target: "_blank", rel: "noopener noreferrer" }, label, icon("external", { size: 14 }));
  const links = [
    a.url ? ext(a.url, "Read the paper") : null,
    ...by.links.map((l) => ext(l.url, l.label)),
    s?.agendaUrl ? ext(s.agendaUrl, "Session programme") : null,
    room?.floor != null ? h("a", { class: "pill-btn", href: `#/map?room=${encodeURIComponent(room.id)}` }, icon("map", { size: 16 }), "Show on map") : null,
  ].filter(Boolean);
  const when = [s ? dayLong(s.day) : "", a.end ? `${a.start}–${a.end}` : `from ${a.start}`, place.name].filter(Boolean).join(" · ");
  return h("li", { class: `ag-item ag-${a.kind}${cls}` }, time, h("details", { class: "ag-more" },
    h("summary", { class: "ag-text" },
      a.kind === "keynote" ? h("span", { class: "ag-kind" }, "Keynote") : null,
      h("span", { class: "ag-title" }, a.title, a.note ? h("span", { class: "row-meta" }, ` (${a.note})`) : null),
      by.text ? h("span", { class: "row-meta" }, by.text) : null),
    h("div", { class: "ag-more-body" },
      h("p", { class: "ag-when" }, when),
      a.block ? h("p", { class: "row-meta" }, a.block, a.chairs ? ` · chair ${a.chairs}` : "") : null,
      a.abstract ? paras(a.abstract) : null,
      a.abstract && a.abstractSource ? h("p", { class: "src-note" }, `Abstract via ${sourceName(a.abstractSource)}`) : null,
      h("p", { class: "row-meta" }, "From the session's own programme; not one of the conference's listed papers."),
      links.length ? h("div", { class: "ag-more-links" }, links) : null)));
}

/** A workshop's own timed programme, by its blocks (each with its chair). `states[i]`: "past" | "now" | "next" | "" per agenda item. */
export function agendaField(program, store, s, { states = [] } = {}) {
  const groups = agendaGroups(s);
  const index = new Map(s.agenda.map((a, i) => [a, i]));
  const talks = s.agenda.filter((a) => a.paperId || a.kind === "talk").length;
  return withSource(field(`Programme · ${talks} ${talks === 1 ? "talk" : "talks"}`, h("ol", { class: "ag-blocks" }, groups.map((g) => h("li", { class: "ag-block" },
    g.block ? h("p", { class: "ag-head" }, h("strong", {}, g.block), g.chairs ? [" · chair ", peopleLine(program, g.chairs, s.chairIds, "span")] : null) : null,
    h("ol", { class: "ag-items" }, g.items.map((a) => agendaItem(program, store, s, a, states[index.get(a)] ?? ""))))))), "Programme", s.agendaSource);
}

/** Organiser / chair names: each one with a person page is a link, joined "A, B and C". */
function peopleLine(program, text, ids, tag = "p") {
  const refs = nameRefs(program, text, ids);
  if (!refs.some((r) => r.personId)) return h(tag, {}, text); // no person known: the text as the site wrote it
  return h(tag, {}, refs.map((r, i) => [joinSep(i, refs.length),
    r.personId ? h("a", { class: "person-link", href: `#/person/${encodeURIComponent(r.personId)}` }, r.name) : r.name]));
}

/** Author names as tappable links to their person page; plain text when no person is known. */
export function authorList(program, paper) {
  const out = [];
  authorRefs(program, paper).forEach((a, i) => {
    if (i) out.push(", ");
    out.push(a.personId ? h("a", { class: "person-link", href: `#/person/${encodeURIComponent(a.personId)}` }, a.name) : a.name);
  });
  return out;
}

function placeBlock(program, s, miniMap = null, board = null) {
  const p = placeOf(program, s);
  const room = s?.roomId ? program.byId.get(s.roomId) : null;
  const onMap = room?.floor != null; // e.g. Plenary has no known floor: no map link
  const block = h("div", { class: "detail-place" },
    icon("pin", { size: 20 }),
    h("span", { class: "place-text" }, h("strong", {}, p.name), p.floor ? h("span", {}, p.floor) : null),
    board ? h("span", { class: "place-board" }, board) : null,
    s.venueGeo ? h("a", { class: "pill-btn", href: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(s.venueGeo)}`, target: "_blank", rel: "noopener noreferrer" },
      icon("pin", { size: 16 }), "Directions") : null,
    s.venueUrl ? h("a", { class: "pill-btn", href: s.venueUrl, target: "_blank", rel: "noopener noreferrer" }, "Venue", icon("external", { size: 14 })) : null,
    onMap ? h("a", { class: "pill-btn", href: `#/map?room=${encodeURIComponent(room.id)}` }, icon("map", { size: 18 }), "Show on map") : null);
  const mini = miniMap && room && !s.allRooms ? miniMap(room) : null;
  return mini ? h("div", { class: "detail-place-wrap" }, block, expander("Floor plan", p.name, mini)) : block;
}

/** A closed-by-default expander: summary "<label> · <hint>" (hint optional), then the content. */
function expander(label, hint, ...content) {
  return h("details", { class: "x-fold" },
    h("summary", {}, h("span", { class: "x-label" }, label), hint ? h("span", { class: "x-hint" }, hint) : null), ...content);
}

/** "Your note" folded away; the summary previews the note (refreshed whenever it closes), opening focuses it. */
function noteFold(store, id, ed) {
  const hint = h("span", { class: "x-hint" });
  const preview = () => { const n = store.note(id); hint.textContent = n ? (n.length > 60 ? n.slice(0, 60) + "…" : n) : "Add one"; };
  preview();
  const d = h("details", { class: "x-fold field note-field" }, h("summary", {}, h("span", { class: "x-label" }, "Your note"), hint), ed);
  d.addEventListener("toggle", () => { if (d.open) d.querySelector("textarea")?.focus({ preventScroll: true }); else preview(); });
  return d;
}

const LONG_ABOUT = 1400; // characters: longer descriptions fold on the deck card
const LONG_ABSTRACT = 600; // characters: longer abstracts fold everywhere
// Where an abstract or a session description came from, as people know the source's name.
const SOURCE_NAME = { openalex: "OpenAlex", crossref: "Crossref", semanticscholar: "Semantic Scholar", "semantic-scholar": "Semantic Scholar", arxiv: "arXiv", dblp: "DBLP", site: "the conference site" };
const sourceName = (s) => SOURCE_NAME[String(s).toLowerCase()] ?? String(s);

/** Append a small "<what> via <source>" line to a field (after its fold button); nothing without a source. */
function withSource(f, what, source) {
  if (f && source) f.append(h("p", { class: "src-note field-src" }, `${what} via ${sourceName(source)}`));
  return f;
}

/**
 * A paper without an open abstract: say so, and point to where it can be read (its DOI, the publisher's page). Only
 * abstracts under an open licence are copied into the app; the publisher's own text stays on the publisher's site.
 */
function noAbstract(x) {
  const doi = (x.links ?? []).find((l) => l.kind === "doi")?.url;
  return field("Abstract", h("p", { class: "src-note" }, "No openly licensed abstract yet.",
    doi ? [" ", h("a", { href: doi, target: "_blank", rel: "noopener noreferrer" }, "Read it on the publisher's page"), "."] : null));
}

/** Fold a field to a few lines behind a "Show more" toggle (when `on`). */
function foldable(f, on, cls = "") {
  if (!f || !on) return f;
  if (cls) f.classList.add(cls);
  const body = f.querySelector(".field-body");
  body.id = `fold-${Math.random().toString(36).slice(2, 9)}`;
  f.classList.add("fold");
  const more = h("button", { type: "button", class: "fold-btn", "aria-expanded": "false", "aria-controls": body.id, onclick: () => {
    const open = f.classList.toggle("open");
    more.setAttribute("aria-expanded", String(open));
    more.textContent = open ? "Show less" : "Show more";
  } }, "Show more");
  f.append(more);
  return f;
}

/**
 * The item's content (no page bar): art, head, verdict, note, fields, site link. Used by the full page
 * (renderDetail) and by desktop panels. `miniMap(room)` (panels) adds a small floor plan to the place.
 * `deck` (the wide desktop deck card): only the title, authors and fields; the card shows art, time
 * and place itself, and the deck owns keep/skip and the note. A very long "About" folds behind "Show more".
 * `logistics` (the full page): a workshop's own talk list from imported logistics, when one is linked.
 * -> { found, nodes, cleanup }
 */
export function detailContent(program, store, id, { miniMap = null, onVerdict = null, compact = false, deck = false, logistics = null } = {}) {
  const x = program.byId.get(id);
  if (!x || (x.paperIds === undefined && x.authors === undefined)) {
    return { found: false, cleanup: () => {}, nodes: [
      h("div", { class: "empty" }, h("h2", {}, "This item isn't in the current program"),
        h("p", {}, "It may have been renamed or removed in a program update. Any note you wrote for it is still stored."),
        h("div", { class: "empty-actions" }, h("a", { class: "pill-btn primary", href: "#/deck" }, "Go to the deck")))] };
  }
  const isSession = !!x.paperIds;
  const speakerP = isSession ? personOf(program, x.speakerId) : null;
  const s = isSession ? x : x.sessionId ? program.byId.get(x.sessionId) : null;
  const when = whenOf(program, x);
  const kind = s ? program.kinds[s.kind] : null;
  const ed = deck ? null : noteEditor(store, id);
  const verdict = compact || deck ? null : verdictToggle(store, id, onVerdict);
  const topics = x.topics.length ? h("ul", { class: "tags" }, x.topics.map((t) => h("li", {}, program.topics[t]?.label ?? t))) : null;
  const known = (x.terms ?? []).filter((t) => program.glossary?.[t]);
  const tech = known.length ? h("div", { class: "chip-wrap tech-chips" }, known.map((t) => termChip(program, t))) : null;
  const link = absUrl(x.website) || absUrl(x.link);
  // One legend for every marked text block of the item (title, talk title, the About paragraphs): under
  // the About text when there is one, else under the header.
  const legend = termLegend(program, [x.title, x.talkTitle, ...(isSession ? blocks(x.description) : [])], known);
  const cl = x.cluster ? (program.clusters ?? []).find((c) => c.id === x.cluster) : null;
  const cluster = cl ? field("Cluster", h("a", { class: "cluster-link", href: `#/explore?cluster=${encodeURIComponent(cl.id)}` },
    h("span", {}, cl.label), h("span", { class: "group-count" }, `${cl.size} items`))) : null;

  const head = h("header", { class: "detail-head", "--kind": kind?.color ?? "var(--sea)" },
    h("div", { class: "card-top" },
      tagPill(itemTag(program, x))),
    h("h1", { class: `detail-title${x.title.length > 70 ? " long" : ""}` }, termText(x.title, program, known)),
    !isSession && x.authors.length ? h("p", { class: "detail-authors" }, authorList(program, x)) : null,
    isSession && x.description ? null : legend,
    deck ? null : s ? h("p", { class: "detail-when" }, icon("clock", { size: 20 }), h("span", {}, h("strong", {}, dayLong(when.day)), h("span", {}, timeRange(when))))
      : h("p", { class: "detail-when" }, icon("clock", { size: 20 }), h("span", {}, "No timetable slot listed")),
    s && !deck ? placeBlock(program, s, miniMap, isSession ? null : boardLabel(x)) : null);

  let body;
  if (isSession) {
    const papers = x.paperIds.map((p) => program.byId.get(p)).filter(Boolean);
    // A workshop's own talk list, if someone's imported logistics carry one for this session.
    const agendas = logistics ? agendasFor(logistics.pages(), x.id) : [];
    body = [
      ...agendas.map(({ page, agenda }) => field(`Workshop programme (from ${page.name}'s logistics)`,
        agenda.note ? h("p", { class: "logi-sub" }, agenda.note) : null, agendaBlocks(agenda))),
      x.talkTitle || x.speaker ? field("Talk",
        x.talkTitle ? h("p", { class: "talk-title" }, termText(x.talkTitle, program, known)) : null,
        x.speaker ? h("p", {}, h("strong", {}, speakerP ? h("a", { class: "person-link", href: `#/person/${encodeURIComponent(speakerP.id)}` }, x.speaker) : x.speaker), x.affiliation ? `, ${x.affiliation}` : "") : null) : null,
      x.description ? withSource(foldable(field("About", paras(x.description, program, known)), deck && x.description.length > LONG_ABOUT), "Description", x.descriptionSource) : null,
      x.description ? legend : null,
      x.agenda?.length ? agendaField(program, store, x) : null,
      papers.length && !x.agenda?.length ? field(`${papers.length} ${papers.length === 1 ? "paper" : "papers"}`,
        h("ol", { class: "row-list" }, papers.map((p) => itemRow(program, store, p)))) : null,
      x.organizers ? field("Organisers", peopleLine(program, x.organizers, x.organizerIds)) : null,
      x.chairs && x.chairs !== "TBD" ? field("Chairs", peopleLine(program, x.chairs, x.chairIds)) : null,
      x.bio ? field("Speaker bio", paras(x.bio)) : null,
      researchFields(program, x.links),
      tech ? field("Technologies", tech) : null,
      topics ? field("Topics", topics) : null,
      cluster,
    ];
  } else {
    body = [
      x.abstract ? withSource(foldable(field("Abstract", paras(x.abstract)), String(x.abstract).length > LONG_ABSTRACT, "fold-abs"), "Abstract", x.abstractSource) : noAbstract(x),
      s ? field("Presented in", h("ul", { class: "row-list" }, itemRow(program, store, s))) : null,
      field("Track", h("p", {}, [x.track, ...x.lists.map(listLabel).filter((l) => l.toLowerCase() !== String(x.track).toLowerCase())].filter(Boolean).join(", "))),
      researchFields(program, x.links),
      tech ? field("Technologies", tech) : null,
      topics ? field("Topics", topics) : null,
      cluster,
    ];
  }

  return { found: true, cleanup: () => { ed?.dispose(); verdict?.dispose(); }, nodes: [
    deck ? null : paperFigure(program, x, { thumbSize: "hero" }) ?? h("div", { class: "detail-art" }, thumbSVG(x, program, { size: "band" })),
    head,
    deck ? null : compact ? h("p", { class: "panel-centre-hint" }, icon("expand", { size: 18 }), "Open in the centre: keep or skip it and write your note there.") : verdict,
    compact || deck ? null : noteFold(store, id, ed),
    body,
    link ? h("p", { class: "ext" }, h("a", { href: link, target: "_blank", rel: "noopener" }, icon("link", { size: 18 }), "Open on the conference site")) : null] };
}

/** renderDetail(root, program, store, id, logistics) -> cleanup() (saves a pending note, drops lifecycle listeners). */
export function renderDetail(root, program, store, id, logistics = null) {
  const backBtn = h("button", { class: "back-btn", type: "button", onclick: back }, icon("back"), "Back");
  const c = detailContent(program, store, id, { logistics });
  root.replaceChildren(h("section", { class: "view detail-view" }, h("div", { class: "detail-bar" }, backBtn), c.nodes));
  return c.cleanup;
}
