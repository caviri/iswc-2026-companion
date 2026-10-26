// Browse and search: sticky search box, grouping control, grouped rows with quick keep/skip.
import { h, icon, sparqlEntry, tagPill } from "../ui.js";
import { dayShort, timeRange, placeOf, itemTag, VERDICT_LABEL, whenOf } from "../model.js";
import { DIMS, DIM_LABEL, runBrowse, normalizeState, hasFromParam, browseRoute } from "../browse-model.js";
import { searchPeople, flag } from "../people-model.js";
import { thumbSVG } from "../thumbs.js";
import { imgEl } from "./images.js";
import { heroImage } from "../images-model.js";
import { onVerdictWhile } from "../verdict-bus.js";
import { replaceRoute } from "../route-state.js";
import { researchFlags } from "../research-model.js";
import { researchMarks } from "./research.js";

const KEY = "iswc26:browse";
const DEBOUNCE_MS = 120;
const href = (id) => `#/item/${encodeURIComponent(id)}`;

function loadState() {
  try { return normalizeState(JSON.parse(sessionStorage.getItem(KEY))); } catch { return normalizeState(null); }
}
function saveState(st) {
  try { sessionStorage.setItem(KEY, JSON.stringify(st)); } catch { /* private mode: state just isn't restored */ }
}

const MODE_KEY = "iswc26:browse-mode";
const loadMode = () => { try { return sessionStorage.getItem(MODE_KEY) === "people" ? "people" : "items"; } catch { return "items"; } };
const saveMode = (m) => { try { sessionStorage.setItem(MODE_KEY, m); } catch { /* not restored */ } };

const plural = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;

function metaLines(program, x) {
  if (Array.isArray(x.paperIds)) {
    const p = placeOf(program, x);
    const line = [dayShort(x.day), timeRange(x), [p.name, p.floor].filter(Boolean).join(", ")].filter(Boolean).join(" · ");
    const n = x.paperIds.length;
    return [line, n ? plural(n, "paper") : ""];
  }
  const s = x.sessionId ? program.byId.get(x.sessionId) : null;
  const when = s ? [dayShort(s.day), whenOf(program, x).start, placeOf(program, s).name].filter(Boolean).join(" · ") : "Not in the timetable";
  return [x.authors.join(", "), when];
}

/** The type tag line of a row: the item's tag, then `rest` ("12 papers", "Wed 28 · 13:30 · Aula Magna"). */
export const tagLine = (program, x, rest = "") =>
  h("span", { class: "row-meta row-tagline" }, tagPill(itemTag(program, x), "row"), rest ? h("span", {}, rest) : null);

/** The corner mark of a row miniature for a verdict: heart (kept), question mark (maybe), cross (skipped), none. */
export const verdictMark = (v) => (v === "right" ? icon("heart", { fill: true, size: 16 }) : v === "up" ? icon("maybe", { size: 16 }) : v === "left" ? icon("x", { size: 16 }) : null);

/** The 44 px row miniature: generated thumbnail, a paper's figure over it, and the kept / skipped `mark` in the corner. */
export const rowThumb = (program, x, mark) => h("span", { class: "row-thumb" }, thumbSVG(x, program, { size: "row" }), rowPhoto(x), mark);

/** A paper's figure over its thumbnail in the 44 px row picture (the thumbnail stays when it can't load). */
function rowPhoto(x) {
  const im = heroImage(x);
  return im ? imgEl(im, { cls: "row-photo", alt: "", width: 44, height: 44 }) : null;
}

/** Extra controls per item row: the desktop dashboard sets `extra(item) -> Node` (its pin star); null on phones. */
export const rowHooks = { extra: null };

/**
 * One list item. Returns {li, sync, dispose}; a verdict change calls refresh(id) so every row of that item
 * updates in place. dispose() drops the row's verdict listener: views call it when they redraw or leave.
 */
export function makeRow(program, store, x, refresh) {
  const isSession = Array.isArray(x.paperIds);
  const link = h("a", { class: "row-link", href: href(x.id) });
  const keep = h("button", { type: "button", class: "quick keep" }, icon("heart", { size: 20 }));
  const skip = h("button", { type: "button", class: "quick skip" }, icon("x", { size: 20 }));
  const li = h("li", { class: "browse-row" }, link, h("div", { class: "quick-box" }, rowHooks.extra?.(x) ?? null, keep, skip));
  const [m1, m2] = metaLines(program, x);
  const title = h("span", { class: "row-title" }, x.title, researchMarks(researchFlags(x)));
  const mark = h("span", { class: "row-mark", role: "img" });
  link.append(rowThumb(program, x, mark), h("span", { class: "row-text" }, title,
    m1 ? h("span", { class: "row-meta" }, m1) : null, tagLine(program, x, m2)));

  function sync() {
    const v = store.verdict(x.id);
    link.className = `row-link ${v ? "v-" + v : ""}`.trim();
    const m = verdictMark(v);
    mark.replaceChildren(...(m ? [m] : []));
    mark.setAttribute("aria-label", VERDICT_LABEL[v] ?? "Not sorted yet");
    const what = isSession ? "session" : "paper";
    keep.setAttribute("aria-pressed", String(v === "right"));
    skip.setAttribute("aria-pressed", String(v === "left"));
    keep.setAttribute("aria-label", v === "right" ? `Remove ${what} from my picks` : `Keep ${what}`);
    skip.setAttribute("aria-label", v === "left" ? `Unskip ${what}` : `Skip ${what}`);
    const fill = keep.querySelector("path");
    if (fill) fill.setAttribute("fill", v === "right" ? "currentColor" : "none");
  }
  const toggle = (dir) => () => {
    if (store.verdict(x.id) === dir) store.unswipe(x.id); else store.swipe(x.id, dir);
    refresh(x.id);
  };
  keep.addEventListener("click", toggle("right"));
  skip.addEventListener("click", toggle("left"));
  sync();
  // kept or skipped elsewhere (detail, a panel); onVerdictWhile also drops it if a view forgets dispose()
  const dispose = onVerdictWhile(li, (changed) => { if (changed === x.id) sync(); });
  return { li, sync, dispose };
}

/** One person row: name, affiliation, item count -> person page. */
function personRow(p) {
  const a = p.affiliations?.[0];
  const meta = [a ? [flag(a.country), a.name].filter(Boolean).join(" ") : null, plural(p.itemIds.length, "item")].filter(Boolean).join(" · ");
  return h("li", { class: "browse-row" }, h("a", { class: "row-link", href: `#/person/${encodeURIComponent(p.id)}` },
    h("span", { class: "row-mark", "aria-hidden": "true" }, icon("people", { size: 16 })),
    h("span", { class: "row-text" }, h("span", { class: "row-title" }, p.name), h("span", { class: "row-meta" }, meta))));
}

/** renderBrowse(root, program, store, params) -> cleanup(). `params.term` (glossary id) filters to items mentioning it. */
export function renderBrowse(root, program, store, params = {}) {
  const st = loadState();
  const hasTech = Object.keys(program.glossary ?? {}).length > 0;
  const hasClusters = (program.clusters ?? []).length > 0;
  // Older cached data has no glossary and no clusters: hide those groupings.
  const dims = DIMS.filter((d) => (d !== "tech" || hasTech) && (d !== "cluster" || hasClusters));
  if (!dims.includes(st.dim)) st.dim = "day";
  let term = params.term && program.glossary?.[params.term] ? params.term : null;
  // "Has code" / "Has data" chips, only when some item has either (older data has neither).
  const items0 = [...program.sessions, ...program.papers].map(researchFlags);
  const canHas = { code: items0.some((f) => f.code), data: items0.some((f) => f.data) };
  // The filter stays in the route ("#/browse?has=code,data"), so Back and reload keep it.
  const fromRoute = hasFromParam(params.has);
  if (fromRoute) st.has = fromRoute;
  st.has = { code: st.has.code && canHas.code, data: st.has.data && canHas.data };
  const routeHash = () => browseRoute(term, st.has);
  const syncs = new Map(); // id -> sync fns of every row showing that item (topic grouping lists items twice)
  const refresh = (id) => (syncs.get(id) ?? []).forEach((f) => f());
  let disposers = []; // the drawn rows' verdict listeners, dropped on every redraw and on leaving
  const dropRows = () => { disposers.forEach((f) => f()); disposers = []; };
  let timer = null;
  const hasPeople = (program.people ?? []).length > 0;
  let mode = hasPeople ? loadMode() : "items";
  const modeSeg = h("div", { class: "seg browse-mode", role: "group", "aria-label": "Show" });

  const input = h("input", {
    type: "search", class: "search-input", placeholder: "Search titles, people, affiliations, rooms, topics", value: st.q,
    autocomplete: "off", autocapitalize: "off", spellcheck: false, enterkeyhint: "search", "aria-label": "Search the programme",
  });
  const clear = h("button", { type: "button", class: "search-clear", "aria-label": "Clear search", hidden: !st.q }, icon("x", { size: 18 }));
  const seg = h("div", { class: "seg browse-seg", role: "group", "aria-label": "Group by" });
  const segRow = h("div", { class: "chip-row browse-seg-row" }, seg);
  const summary = h("p", { class: "browse-count", role: "status", "aria-live": "polite" });
  const list = h("div", { class: "browse-list" });
  const filterBar = h("div", { class: "term-filter", hidden: true });
  const hasRow = h("div", { class: "chip-row has-row", role: "group", "aria-label": "Only items with" });
  function drawHas() {
    hasRow.replaceChildren(...[["code", "Has code", "code"], ["data", "Has data", "dataset"]].filter(([k]) => canHas[k]).map(([k, label, ic]) => h("button", {
      type: "button", class: "chip has-chip", "aria-pressed": String(st.has[k]),
      onclick: () => { st.has = { ...st.has, [k]: !st.has[k] }; replaceRoute(routeHash()); drawHas(); draw(); window.scrollTo(0, 0); persist(); },
    }, icon(ic, { size: 16 }), label)));
  }

  const persist = () => saveState({ q: st.q, dim: st.dim, has: st.has, scroll: Math.round(window.scrollY) });

  function drawSeg() {
    seg.replaceChildren(...dims.map((d) => h("button", {
      type: "button", class: "seg-btn", "aria-pressed": String(st.dim === d),
      onclick: () => { if (st.dim === d) return; st.dim = d; drawSeg(); draw(); window.scrollTo(0, 0); persist(); },
    }, DIM_LABEL[d])));
    seg.querySelector('[aria-pressed="true"]')?.scrollIntoView?.({ inline: "nearest", block: "nearest" });
  }

  function drawMode() {
    const n = st.q.trim() ? searchPeople(program, st.q).length : 0;
    modeSeg.replaceChildren(...[["items", "Items"], ["people", n ? `People (${n})` : "People"]].map(([m, label]) => h("button", {
      type: "button", class: "seg-btn", "aria-pressed": String(mode === m),
      onclick: () => { if (mode === m) return; mode = m; saveMode(m); drawMode(); drawSeg(); draw(); window.scrollTo(0, 0); },
    }, label)));
    segRow.hidden = mode === "people";
    hasRow.hidden = mode === "people" || (!canHas.code && !canHas.data);
    filterBar.hidden = mode === "people" || !term;
  }

  function drawPeople() {
    const q = st.q.trim();
    const people = q ? searchPeople(program, q) : [...program.people].sort((a, b) => a.name.localeCompare(b.name) || (a.id < b.id ? -1 : 1));
    summary.textContent = people.length ? `${plural(people.length, "person", "people")}${q ? ` matching "${q}"` : ""}, by name` : `No people match "${q}"`;
    const toDir = h("a", { class: "pill-btn pp-entry", href: "#/people" }, icon("people", { size: 18 }), "People directory: faces, roles, filters");
    list.replaceChildren(toDir, people.length ? h("ul", { class: "row-list" }, people.map(personRow))
      : h("div", { class: "empty browse-empty" }, h("h2", {}, "Nobody matches"),
        h("p", {}, "Every word has to match a name or an affiliation."),
        h("div", { class: "empty-actions" }, h("button", { type: "button", class: "pill-btn primary", onclick: () => setQuery("") }, "Clear search"))));
  }

  function drawFilter() {
    filterBar.hidden = !term;
    filterBar.replaceChildren(...(term ? [h("button", {
      type: "button", class: "chip term-filter-chip", "aria-label": `Remove filter: ${program.glossary[term].term}`,
      onclick: () => {
        term = null;
        replaceRoute(routeHash()); // no hashchange: the view stays, the term filter goes
        drawFilter(); draw(); window.scrollTo(0, 0);
      },
    }, `Term: ${program.glossary[term].term}`, icon("x", { size: 16 }))] : []));
  }

  function draw() {
    drawMode();
    dropRows();
    if (mode === "people") { syncs.clear(); drawPeople(); return; }
    const r = runBrowse(program, st.q, st.dim, term, st.has);
    const hasText = [st.has.code ? "with code" : null, st.has.data ? "with data" : null].filter(Boolean).join(" and ");
    syncs.clear();
    const q = st.q.trim();
    const parts = [r.nSessions ? plural(r.nSessions, "session") : null, r.nPapers ? plural(r.nPapers, "paper") : null].filter(Boolean);
    summary.textContent = !r.total ? (q ? `No results for "${q}"` : "Nothing to show")
      : `${parts.join(" and ")}${q ? ` matching "${q}"` : ""}${term ? ` mentioning ${program.glossary[term].term}` : ""}${hasText ? ` ${hasText}` : ""}, by ${DIM_LABEL[st.dim].toLowerCase()}${st.dim === "topic" ? ". An item can appear under several topics." : st.dim === "tech" ? ". An item can appear under several technologies." : ""}`;
    if (!r.total) {
      list.replaceChildren(h("div", { class: "empty browse-empty" },
        h("h2", {}, q || term || hasText ? "Nothing matches" : "The programme is empty"),
        q ? h("p", {}, "Every word has to match a title, author, speaker, room or topic. Try fewer or shorter words.") : null,
        q ? h("div", { class: "empty-actions" }, h("button", { type: "button", class: "pill-btn primary", onclick: () => setQuery("") }, "Clear search")) : null));
      return;
    }
    list.replaceChildren(...r.groups.map((g) => h("section", { class: "browse-group" },
      h("h2", { class: "group-title" }, h("span", {}, g.label), h("span", { class: "group-count" }, String(g.items.length))),
      h("ul", { class: "row-list" }, g.items.map((x) => {
        const row = makeRow(program, store, x, refresh);
        syncs.set(x.id, [...(syncs.get(x.id) ?? []), row.sync]);
        disposers.push(row.dispose);
        return row.li;
      })))));
  }

  function setQuery(q, { focus = true } = {}) {
    input.value = q; st.q = q; clear.hidden = !q;
    draw(); window.scrollTo(0, 0); persist();
    if (focus && !q) input.focus();
  }

  input.addEventListener("input", () => {
    clear.hidden = !input.value;
    clearTimeout(timer);
    timer = setTimeout(() => { st.q = input.value; draw(); window.scrollTo(0, 0); persist(); }, DEBOUNCE_MS);
  });
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") input.blur(); });
  clear.addEventListener("click", () => { clearTimeout(timer); setQuery(""); });

  let scrollTick = 0;
  const onScroll = () => { cancelAnimationFrame(scrollTick); scrollTick = requestAnimationFrame(persist); };
  window.addEventListener("scroll", onScroll, { passive: true });

  drawSeg(); drawFilter(); drawHas(); draw();
  root.replaceChildren(h("section", { class: "view browse-view" },
    h("div", { class: "view-head" }, h("h1", { class: "view-title" }, "Browse"), sparqlEntry("Query with SPARQL")),
    h("div", { class: "browse-bar" },
      h("div", { class: "search-box" }, icon("browse", { size: 20 }), input, clear),
      hasPeople ? h("div", { class: "chip-row browse-mode-row" }, modeSeg) : null,
      segRow, hasRow),
    filterBar, summary, list));

  // The router scrolls to the top right after render; put the reader back where they were.
  if (st.scroll && !term) setTimeout(() => window.scrollTo(0, st.scroll), 0);

  return () => {
    dropRows();
    clearTimeout(timer);
    cancelAnimationFrame(scrollTick);
    window.removeEventListener("scroll", onScroll);
    if (timer && input.value !== st.q) st.q = input.value; // flush a pending debounce
    saveState({ q: st.q, dim: st.dim, has: st.has, scroll: Math.round(window.scrollY) });
  };
}
