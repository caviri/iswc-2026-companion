// Explore: the programme's landscape. Topics (categories) open to their key terms and clusters;
// clusters are a mosaic of tiles sized by how many sessions and papers they hold, tinted by their
// main topic. A cluster page lists its items with quick keep/skip and can fill the deck with them.
import { h, icon, toast, reducedMotion, sparqlEntry } from "../ui.js";
import { tallyVerdicts, verdictSummary } from "../model.js";
import { termChip, programmaticScroll } from "../terms.js";
import { exploreModel, clusterItems, deckFiltersFor, topicSwatch, fitChips, swipePlan, swipeLabel } from "../explore-model.js";
import { makeRow } from "./browse.js";
import { thumbSVG } from "../thumbs.js";
import { saveFilters, loadFilters, resetPin } from "./deck.js";
import { replaceRoute } from "../route-state.js";
import { onVerdictWhile, onVerdict } from "../verdict-bus.js";

const KEY = "iswc26:explore";
const plural = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;
const tp = (swatch) => (swatch == null ? "var(--line)" : `var(--tp-${swatch})`);

function loadScroll() {
  try { const n = JSON.parse(sessionStorage.getItem(KEY))?.scroll; return Number.isFinite(n) && n > 0 ? n : 0; } catch { return 0; }
}
function saveScroll(n) {
  try { sessionStorage.setItem(KEY, JSON.stringify({ scroll: Math.round(n) })); } catch { /* not restored */ }
}

/** Kept / maybe / skipped share of a total as a thin bar. */
function meter({ count, kept, maybe = 0, skipped }, cls = "") {
  const pct = (n) => `${count ? (100 * n) / count : 0}%`;
  return h("span", { class: `meter ${cls}`.trim(), "aria-hidden": "true" },
    h("i", { class: "meter-kept", style: { width: pct(kept) } }),
    h("i", { class: "meter-maybe", style: { width: pct(maybe) } }),
    h("i", { class: "meter-skipped", style: { width: pct(skipped) } }));
}
const progressText = (t) => verdictSummary(t) || `${t.count} to sort`;

const copyFilters = (f) => ({ ...f, kinds: [...f.kinds], tracks: [...f.tracks], topics: [...f.topics], clusters: [...(f.clusters ?? [])] });

/** Fill the deck with one cluster or topic and go there; the toast's Undo puts the previous filters back. */
function swipeInDeck(program, store, filters, what, label) {
  const before = copyFilters(filters);
  Object.assign(filters, deckFiltersFor(program, store, what));
  saveFilters(filters);
  resetPin();
  location.hash = "#/deck";
  toast(`Deck now shows ${label}`, {
    action: "Undo", ms: 8000,
    onAction: () => {
      Object.assign(filters, before);
      saveFilters(filters);
      resetPin();
      // Redraw whatever view is showing (normally the deck) with the restored filters.
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    },
  });
}

// Estimated tile heights (px, see .tier-* min-heights) used to balance the two columns.
const TIER_H = { l: 178, m: 146, s: 112 };
function mosaic(tiles) {
  const cols = [h("div", { class: "mosaic-col" }), h("div", { class: "mosaic-col" })];
  const used = [0, 0];
  const wide = [];
  for (const [tier, el] of tiles) {
    if (tier === "xl") { wide.push(el); continue; }
    const i = used[1] < used[0] ? 1 : 0;
    cols[i].append(el);
    used[i] += TIER_H[tier] + 10;
  }
  return h("div", { class: "cluster-mosaic" }, wide, h("div", { class: "mosaic-cols" }, cols));
}

// Set when a cluster link on the overview is followed; the cluster page consumes it on render, so its
// Back button returns to the exact overview entry (history.back) only when it really came from there.
let fromOverview = false;
/** Forget the overview origin (main.js calls this whenever another route renders). */
export function resetExploreNav() { fromOverview = false; }

/** renderExplore(root, program, store, params, filters) -> cleanup(). params: {cluster?, topic?} */
export function renderExplore(root, program, store, params = {}, filters = null) {
  filters ??= loadFilters();
  const viaOverview = fromOverview;
  fromOverview = false;
  const m = exploreModel(program, store);
  if (!m.ready) return renderOutdated(root);
  const cluster = params.cluster ? m.clusters.find((c) => c.id === params.cluster) : null;
  if (cluster) return renderCluster(root, program, store, cluster, filters, viaOverview);
  return renderOverview(root, program, store, m, params.topic ?? null, filters);
}

function renderOutdated(root) {
  root.replaceChildren(h("section", { class: "view explore-view" },
    h("h1", { class: "view-title" }, "Explore"),
    h("div", { class: "empty explore-empty" },
      h("h2", {}, "Update the data to explore"),
      h("p", {}, "This copy of the programme was saved before topics and clusters were added. Reload while online to get the latest one."),
      h("div", { class: "empty-actions" },
        h("button", { type: "button", class: "pill-btn primary", onclick: () => location.reload() }, "Reload"),
        h("a", { class: "pill-btn", href: "#/browse" }, "Browse instead")))));
  return () => {};
}

function renderOverview(root, program, store, model, openTopic, filters) {
  let m = model;
  let open = m.categories.some((c) => c.id === openTopic) ? openTopic : null;
  const name = (t) => program.glossary?.[t]?.term ?? t;
  const grid = h("div", { class: "topic-grid" });

  const card = (c) => h("button", {
    type: "button", class: "topic-card", "--tp": tp(c.swatch), id: `tc-${c.id}`,
    "aria-expanded": String(open === c.id), "aria-controls": "topic-panel",
    onclick: () => toggle(c.id),
  },
  h("span", { class: "topic-name" }, c.label),
  h("span", { class: "topic-stat" }, h("span", {}, h("strong", {}, String(c.count)), " items"),
    c.kept ? h("span", { class: "tile-kept", "aria-label": `${c.kept} kept` }, icon("heart", { fill: true, size: 14 }), String(c.kept)) : null),
  meter(c),
  c.topSub.length ? h("span", { class: "topic-terms" }, c.topSub.map(name).join(", ")) : null);

  function panel(c) {
    const chips = c.sub.map((t) => termChip(program, t)).filter(Boolean);
    const shown = c.clusters.filter((k) => k.count >= 2).slice(0, 8);
    return h("div", { class: "topic-panel", id: "topic-panel", "--tp": tp(c.swatch), role: "region", "aria-label": c.label },
      h("div", { class: "topic-panel-head" },
        h("p", { class: "topic-panel-stat" }, `${plural(c.count, "session or paper", "sessions and papers")}. ${progressText(c)}.`),
        h("button", { type: "button", class: "pill-btn primary", onclick: () => swipeInDeck(program, store, filters, { topic: c.id }, c.label) },
          icon("deck", { size: 18 }), swipeLabel(swipePlan(program, store, { topic: c.id })))),
      shown.length ? h("div", { class: "topic-panel-part" }, h("h3", {}, "Where it shows up"),
        h("ul", { class: "row-list cluster-rows" }, shown.map((k) => {
          const full = m.clusters.find((x) => x.id === k.id);
          return h("li", {}, h("a", {
            class: "cluster-row", href: `#/explore?cluster=${encodeURIComponent(k.id)}`, onclick: () => { fromOverview = true; },
            "aria-label": `${k.label}: ${k.count} of its ${full.count} items are in this topic`,
          },
          h("span", { class: "share", "aria-hidden": "true" }, h("i", { style: { width: `${(100 * k.count) / full.count}%` } })),
          h("span", { class: "cluster-row-name" }, k.label),
          h("span", { class: "group-count" }, `${k.count} of ${full.count}`)));
        }))) : null,
      chips.length ? h("div", { class: "topic-panel-part" }, h("h3", {}, "Key terms"), h("div", { class: "chip-wrap compact-chips" }, chips)) : null);
  }

  const colCount = () => (grid.isConnected ? Math.max(1, getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean).length) : 2);

  function drawTopics() {
    const cards = m.categories.map(card);
    const i = m.categories.findIndex((c) => c.id === open);
    if (i >= 0) {
      // Open below the row that holds the card, so the grid keeps its order (2 columns on phones; the
      // desktop centre fits more, so count the columns actually laid out).
      const cols = colCount();
      const at = Math.min(i - (i % cols) + cols, cards.length);
      cards.splice(at, 0, panel(m.categories[i]));
    }
    grid.replaceChildren(...cards);
  }

  function toggle(id) {
    open = open === id ? null : id;
    replaceRoute(open ? `#/explore?topic=${encodeURIComponent(open)}` : "#/explore");
    drawTopics();
    const btn = grid.querySelector(`#tc-${CSS.escape(id)}`);
    btn?.focus({ preventScroll: true });
    const smooth = !reducedMotion();
    if (smooth) programmaticScroll(); // a term tapped while this settles must not lose its popover
    (open ? grid.querySelector("#topic-panel") : btn)?.scrollIntoView?.({ block: "nearest", behavior: smooth ? "smooth" : "auto" });
  }

  const tile = (c) => {
    // Chips that fit in two rows (xl, full width) or one row (half width): no clipped third row.
    const extra = fitChips(c.terms.filter((t) => !c.label.toLowerCase().includes(t.toLowerCase())),
      c.tier === "xl" ? { perRow: 40, rows: 2 } : { perRow: 20, rows: 1 });
    return h("a", {
      class: `cluster-tile tier-${c.tier}`, "--tp": tp(c.swatch), href: `#/explore?cluster=${encodeURIComponent(c.id)}`,
      "aria-label": `${c.label}: ${plural(c.count, "item")}, ${progressText(c)}`, onclick: () => { fromOverview = true; },
    },
    h("span", { class: "tile-art" }, thumbSVG(c, program, { size: "band" })),
    h("span", { class: "tile-name" }, c.label),
    extra.length && c.tier !== "s" ? h("span", { class: "tile-terms" }, extra.map((t) => h("span", {}, t))) : null,
    h("span", { class: "tile-foot" },
      h("span", { class: "tile-count" }, h("strong", {}, String(c.count)),
        c.kept ? h("span", { class: "tile-kept", "aria-label": `${c.kept} kept` }, icon("heart", { fill: true, size: 14 }), String(c.kept)) : null),
      c.tier !== "s" ? h("span", { class: "tile-split" }, [c.sessions ? plural(c.sessions, "session") : null, c.papers ? plural(c.papers, "paper") : null].filter(Boolean).join(", ")) : null),
    meter(c, "tile-meter"));
  };

  drawTopics();
  const lede = h("p", { class: "explore-lede" });
  const drawLede = () => {
    const sortedPct = m.total ? Math.round((100 * (m.kept + m.maybe + m.skipped)) / m.total) : 0;
    lede.textContent = `${m.total} sessions and papers, in ${plural(m.categories.length, "topic")} and ${plural(m.clusters.length, "cluster")}. `
      + (m.kept || m.maybe || m.skipped ? `You've sorted ${sortedPct}% and kept ${m.kept}${m.maybe ? ` (${m.maybe} maybe)` : ""}.` : "Start with a topic, or jump into a cluster.");
  };
  drawLede();
  const mosaicBox = h("div", { class: "mosaic-box" }, mosaic(m.clusters.map((c) => [c.tier, tile(c)])));
  root.replaceChildren(h("section", { class: "view explore-view" },
    h("div", { class: "view-head" }, h("h1", { class: "view-title" }, "Explore"), sparqlEntry("Query with SPARQL")),
    lede,
    h("section", { class: "ex-section", "aria-labelledby": "ex-topics" },
      h("h2", { class: "ex-h", id: "ex-topics" }, "Topics"),
      h("p", { class: "ex-sub" }, "Tap one to see its key terms and where it shows up."),
      grid),
    h("section", { class: "ex-section", "aria-labelledby": "ex-clusters" },
      h("h2", { class: "ex-h", id: "ex-clusters" }, "Clusters"),
      h("p", { class: "ex-sub" }, "Sessions and papers grouped by what they're about. Bigger tiles hold more; the colour is the main topic, the streams on top its mix of topics."),
      mosaicBox)));

  if (open) drawTopics(); // now laid out: place the open panel by the real column count
  const back = loadScroll();
  setTimeout(() => {
    if (open) grid.querySelector("#topic-panel")?.scrollIntoView?.({ block: "center" });
    else if (back) window.scrollTo(0, back);
  }, 0);
  // The desktop centre changes width when panels open or close: keep the open topic under its row.
  let cols = colCount();
  const ro = typeof ResizeObserver === "function" ? new ResizeObserver(() => {
    const c = colCount();
    if (c === cols) return;
    cols = c;
    if (open) drawTopics();
  }) : null;
  ro?.observe(grid);
  // Kept counts and meters follow keeps made elsewhere (a desktop panel, another view's row).
  const offVerdict = onVerdict(() => {
    const next = exploreModel(program, store);
    if (!next.ready) return;
    m = next;
    const had = document.activeElement?.closest?.(".topic-card")?.id;
    drawLede(); drawTopics();
    mosaicBox.replaceChildren(mosaic(m.clusters.map((c) => [c.tier, tile(c)])));
    if (had) document.getElementById(had)?.focus({ preventScroll: true });
  });
  return () => { offVerdict(); ro?.disconnect(); saveScroll(window.scrollY); };
}

/**
 * A cluster's content (no page bar): header, progress, "swipe these" and its rows. Used by the full
 * cluster page and desktop panels. -> { found, nodes, cleanup }
 */
export function clusterContent(program, store, clusterId, filters = null) {
  filters ??= loadFilters();
  const m = exploreModel(program, store);
  const c = m.ready ? m.clusters.find((k) => k.id === clusterId) : null;
  if (!c) {
    return { found: false, cleanup: () => {}, nodes: [h("div", { class: "empty" }, h("h2", {}, "This cluster isn't in the current program"),
      h("p", {}, "Clusters can change when the programme is updated."),
      h("div", { class: "empty-actions" }, h("a", { class: "pill-btn primary", href: "#/explore" }, "Explore the programme")))] };
  }
  const { nodes, dispose } = clusterNodes(program, store, c, filters);
  return { found: true, cleanup: dispose, nodes };
}

function renderCluster(root, program, store, c, filters, viaOverview) {
  const back = () => {
    if (viaOverview) history.back(); else location.hash = "#/explore";
  };
  const { nodes, dispose } = clusterNodes(program, store, c, filters);
  root.replaceChildren(h("section", { class: "view explore-view cluster-view" },
    h("div", { class: "detail-bar" }, h("button", { class: "back-btn", type: "button", onclick: back }, icon("back"), "Explore")),
    nodes));
  return dispose;
}

function clusterNodes(program, store, c, filters) {
  const { sessions, papers } = clusterItems(program, c.id);
  const syncs = new Map();
  const stat = h("p", { class: "cluster-progress-text" });
  const bar = h("span", { class: "cluster-meter-slot" });
  const swipe = h("button", { type: "button", class: "pill-btn primary cluster-swipe",
    onclick: () => swipeInDeck(program, store, filters, { cluster: c.id }, c.label) });

  function update() {
    const items = [...sessions, ...papers];
    const t = tallyVerdicts(items, store);
    const left = t.count - t.sorted;
    bar.replaceChildren(meter(t, "cluster-meter"));
    stat.textContent = left === t.count ? `None sorted yet` : `${progressText(t)}, ${left} to sort`;
    swipe.disabled = left === 0;
    swipe.replaceChildren(icon("deck", { size: 18 }), swipeLabel(swipePlan(program, store, { cluster: c.id })));
  }
  const refresh = (id) => { (syncs.get(id) ?? []).forEach((f) => f()); update(); };
  const disposers = [];
  const rows = (list) => h("ul", { class: "row-list" }, list.map((x) => {
    const row = makeRow(program, store, x, refresh);
    syncs.set(x.id, [...(syncs.get(x.id) ?? []), row.sync]);
    disposers.push(row.dispose);
    return row.li;
  }));
  const glossed = new Set(c.termIds.map((t) => program.glossary?.[t]?.term).filter(Boolean));
  const chips = [
    ...c.termIds.map((t) => termChip(program, t)).filter(Boolean),
    ...c.terms.filter((t) => !glossed.has(t)).map((t) => h("span", { class: "chip plain-chip" }, t)),
  ];

  update();
  disposers.push(onVerdictWhile(stat, () => update())); // progress follows keeps made in other panels or views
  const dispose = () => { disposers.splice(0).forEach((f) => f()); };
  return { dispose, nodes: [
    h("header", { class: "cluster-head", "--tp": tp(c.swatch) },
      h("div", { class: "cluster-art" }, thumbSVG(c, program, { size: "band" })),
      h("h1", { class: "cluster-title" }, c.label),
      h("p", { class: "cluster-sub" }, [c.sessions ? plural(c.sessions, "session") : null, c.papers ? plural(c.papers, "paper") : null].filter(Boolean).join(" and ")),
      chips.length ? h("div", { class: "chip-wrap cluster-chips" }, chips) : null,
      h("ul", { class: "mix-legend", "aria-label": "Topics in this cluster" }, c.mix.map((x) => h("li", { "--tp": tp(topicSwatch(x.topic)) },
        h("i", { "aria-hidden": "true" }), program.topics[x.topic]?.label ?? x.topic, h("span", {}, String(x.count)))))),
    h("div", { class: "cluster-progress" }, bar, stat),
    swipe,
    sessions.length ? h("section", { class: "browse-group" },
      h("h2", { class: "group-title" }, h("span", {}, "Sessions"), h("span", { class: "group-count" }, String(sessions.length))), rows(sessions)) : null,
    papers.length ? h("section", { class: "browse-group" },
      h("h2", { class: "group-title" }, h("span", {}, "Papers"), h("span", { class: "group-count" }, String(papers.length))), rows(papers)) : null,
  ] };
}
