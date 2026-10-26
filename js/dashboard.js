// Desktop dashboard (≥ 1024px): a fixed left sidebar (sections, pinned items, the clock) and a row of item
// panels to the right of whatever route the centre column shows. Panels hold the same content as the
// full item / person / cluster pages (detailContent, personContent, clusterContent). The stack rules,
// URL encoding and row geometry are pure, in js/panels.js; this module only draws them.
//
// Trails: a link clicked inside a panel opens its target beside that panel. How the router learns the
// source: a capture-phase click listener on the document notes the clicked in-app link's resolved hash
// and its `.dash-panel[data-id]` ancestor; when the hashchange for that same hash reaches the router,
// takeSource(hash) hands the panel id over (once, and only within a couple of seconds). Anything else,
// e.g. programmatic location.hash from the deck, counts as the centre. No link needs to know where it is.
//
// Nothing overlaps: the centre and the panels sit side by side and, when they don't fit, the whole page
// gets wider and scrolls sideways (the document itself, so the centre keeps its own vertical scroll);
// the sidebar stays put. A vertical wheel over the sidebar, a panel's bar, the gaps or anything that
// can't scroll further that way moves the row sideways (panels.js wheelIntent). The sidebar folds to an
// icon rail ("[" or its button, remembered per browser) and each panel folds to a narrow strip in place
// (in the URL as a trailing "~").
import { h, icon, reducedMotion } from "./ui.js";
import { hasRoute } from "./edition.js";
import { closeTermPopover } from "./terms.js";
import { thumbSVG } from "./thumbs.js";
import { dayLong, itemTag, groupNav, groupOf, NAV_GROUPS } from "./model.js";
import { personOf } from "./people-model.js";
import { detailContent } from "./views/detail.js";
import { personContent } from "./views/person.js";
import { clusterContent } from "./views/explore.js";
import { miniMap } from "./views/map.js";
import { rowHooks } from "./views/browse.js";
import { setCurrentPanels } from "./route-state.js";
import { onVerdict } from "./verdict-bus.js";
import {
  openPanel, closePanel, togglePin, isPinned, pinnedIds, panelIds, panelEntries, restoreStack, neighbourPanel,
  isCollapsed, setCollapsed, setAllCollapsed, bulkAction, collapsedIds,
  revealScroll, wheelIntent, snapTarget, latchAxis, centreWidth, centreOf, withPanels, fullPageHash, loadPinned, savePinned, PINNED_KEY, loadRail, saveRail,
} from "./panels.js";

const NAV = [
  ["home", "Home", "home"], ["deck", "Deck", "deck"], ["mine", "My ISWC", "mine"],
  ["explore", "Explore", "explore"], ["grid", "Timetable", "grid"], ["map", "Map", "map"], ["browse", "Browse", "browse"], ["people", "People", "people"], ["sci-k", "Sci-K", "flask"], ["bari", "Bari", "bari"], ["logistics", "Logistics", "logistics"], ["sparql", "SPARQL", "code"], ["rete", "Built with rete", "rete"], ["ontology", "Ontology", "book"], ["credits", "Credits", "doc"], ["settings", "Settings", "gear"],
].filter(([r]) => hasRoute(r));

// Sidebar groups the person folded (a per-browser convenience); until they choose, only Programme is open. The
// current route's group always opens.
const GROUPS_KEY = "iswc26:side-groups";
const FOLDED_FIRST = () => new Set(NAV_GROUPS.map(([id]) => id).filter((id) => id !== "programme"));
function loadFolded() {
  try {
    const v = JSON.parse(localStorage.getItem(GROUPS_KEY) ?? "null");
    return Array.isArray(v) ? new Set(v) : FOLDED_FIRST();
  } catch { return FOLDED_FIRST(); }
}
function saveFolded(set) { try { localStorage.setItem(GROUPS_KEY, JSON.stringify([...set])); } catch { /* storage unavailable: folds last this visit */ } }

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** "2026-10-25", "2026-10-29" -> "25–29 October 2026" */
function rangeText(a, b) {
  const [ya, ma, da] = a.split("-").map(Number), [yb, mb, db] = b.split("-").map(Number);
  if (ya === yb && ma === mb) return `${da}–${db} ${MONTHS[ma - 1]} ${ya}`;
  return `${da} ${MONTHS[ma - 1]} – ${db} ${MONTHS[mb - 1]} ${yb}`;
}

/** "item" | "person" | "cluster" | null for a panel id. */
export function panelKind(program, id) {
  const x = program.byId.get(id);
  if (x && (x.paperIds || x.authors)) return "item";
  if (personOf(program, id)) return "person";
  if ((program.clusters ?? []).some((c) => c.id === id)) return "cluster";
  return null;
}

function titleOf(program, id, kind) {
  if (kind === "item") return program.byId.get(id).title;
  if (kind === "person") return personOf(program, id).name;
  if (kind === "cluster") return program.clusters.find((c) => c.id === id).label;
  return id;
}

function kindLabel(program, id, kind) {
  if (kind === "person") return "Person";
  if (kind === "cluster") return "Cluster";
  return itemTag(program, program.byId.get(id))?.label ?? "Item";
}

function kindColor(program, id, kind) {
  if (kind !== "item") return "var(--sea)";
  const x = program.byId.get(id);
  const s = x.paperIds ? x : x.sessionId ? program.byId.get(x.sessionId) : null;
  return program.kinds?.[s?.kind]?.color ?? "var(--sea)";
}

function thumbFor(program, id, kind, size = "row") {
  if (kind === "item") return thumbSVG(program.byId.get(id), program, { size });
  if (kind === "cluster") return thumbSVG(program.clusters.find((c) => c.id === id), program, { size });
  const p = personOf(program, id);
  const initials = (p?.name ?? "?").split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return h("span", { class: "panel-initials", "aria-hidden": "true" }, initials);
}

/**
 * createDashboard({ program, store, clock, filters }) -> {
 *   mount(), unmount(), stack(), apply(stack, { focus }), openFromRoute(id), restore(entries), setRoute(route)
 * }
 * apply() draws the panels (keyed: open panels keep their scroll and note text), saves the pinned ids,
 * and rewrites the URL's `panels` param in place (no new history entry).
 */
export function createDashboard({ program, store, clock, filters }) {
  const isKnown = (id) => panelKind(program, id) != null;
  let st = restoreStack({ pinned: loadPinned(), isKnown });
  const live = new Map(); // id -> { el, scroll, fold, cleanup, pinBtn, title, top }
  let side = null, strip = null, pinnedList = null, clockBox = null, offClock = null, mineCount = null;
  let railBtn = null, bulkBox = null, bulkBtn = null, bulkN = null, sizeRO = null;
  let rail = loadRail();
  let wheelRest = 0, wheelLatch = null;
  const doc = document.documentElement;
  let fullId = null; // the item the centre shows full page (?full=1): its panel drops note and verdict
  let offVerdict = null;
  let pendingSource = null; // { hash, from, at }: the last in-app link clicked inside a panel

  // ---- sidebar ----
  function buildSide() {
    const days = (program.days ?? []).map((d) => d.date).sort();
    const dates = days.length ? `Bari, ${rangeText(days[0], days[days.length - 1])}` : "Bari";
    mineCount = h("span", { class: "side-count" });
    // Grouped sections, each under a heading that folds it. In the compact rail the headings become thin rules
    // and every icon shows (css), so a folded group never hides a section there.
    const folded = loadFolded();
    const nav = h("nav", { class: "side-nav", "aria-label": "Sections" }, groupNav(NAV).map((g) => {
      const list = h("ul", { id: `side-g-${g.id}` }, g.items.map(([route, label, ic]) => h("li", {}, h("a", { href: `#/${route}`, "data-route": route, title: label },
        icon(ic, { size: 20 }), h("span", { class: "side-label" }, label), route === "mine" ? mineCount : null))));
      const box = h("div", { class: "side-group", "data-group": g.id });
      const btn = h("button", { type: "button", class: "side-gh", "aria-controls": list.id }, h("span", { class: "side-label" }, g.label), icon("chevron", { size: 16 }));
      const set = (open) => { box.classList.toggle("folded", !open); btn.setAttribute("aria-expanded", String(open)); };
      set(!folded.has(g.id));
      btn.addEventListener("click", () => {
        const open = box.classList.contains("folded");
        set(open);
        if (open) folded.delete(g.id); else folded.add(g.id);
        saveFolded(folded);
      });
      box.openGroup = () => set(true);
      box.append(btn, list);
      return box;
    }));
    pinnedList = h("div", { class: "side-pinned-list" });
    clockBox = h("div", { class: "side-clock" });
    railBtn = h("button", { type: "button", class: "side-rail-btn", "aria-label": "Compact sidebar", title: "Compact sidebar ( [ )", onclick: () => setRail(!rail) }, icon("sidebar", { size: 20 }));
    bulkN = h("span", { class: "side-open-n" });
    bulkBtn = h("button", { type: "button", class: "side-open-btn", onclick: () => apply(setAllCollapsed(st, bulkAction(st) === "collapse")) });
    bulkBox = h("div", { class: "side-open", hidden: true }, bulkN, bulkBtn);
    side = h("aside", { class: "dash-side", "aria-label": "App" },
      h("div", { class: "side-top" },
        h("a", { class: "side-brand", href: "#/home", "aria-label": "ISWC 2026: home" }, h("strong", {}, "ISWC 2026"), h("span", {}, dates)),
        railBtn),
      nav,
      bulkBox,
      h("section", { class: "side-pinned", "aria-labelledby": "side-pinned-h" },
        h("h2", { class: "side-h", id: "side-pinned-h" }, icon("star", { size: 16, fill: true }), "Pinned"),
        pinnedList),
      clockBox);
    document.body.prepend(side);
    drawRail();
    offClock = clock.subscribe(drawClock);
    drawClock(clock.state());
  }

  /** Sidebar as an icon rail (on) or full width (off); remembered in this browser. */
  function setRail(on) {
    rail = !!on;
    saveRail(rail);
    drawRail();
  }
  function drawRail() {
    doc.classList.toggle("rail", rail);
    if (!railBtn) return;
    railBtn.setAttribute("aria-pressed", String(rail)); // the label stays put; pressed = icons only
    side?.querySelectorAll(".side-pin").forEach((b) => { b.title = rail ? b.dataset.title : ""; });
  }

  /** "3 open · Collapse all" (or "Expand all" once every panel is folded). */
  function drawBulk() {
    if (!bulkBox) return;
    const n = st.panels.length;
    bulkBox.hidden = !n;
    if (!n) return;
    const act = bulkAction(st);
    const label = act === "collapse" ? "Collapse all" : "Expand all";
    bulkN.textContent = `${n} open`;
    bulkBtn.replaceChildren(icon(act === "collapse" ? "fold" : "unfold", { size: 18 }), h("span", { class: "side-label" }, label));
    bulkBtn.setAttribute("aria-label", `${label} open panels`);
    bulkBtn.title = `${label} open panels`;
  }

  function drawClock(s) {
    if (!clockBox) return;
    clockBox.replaceChildren(
      h("p", { class: "side-clock-k" }, "Rome time"),
      h("p", { class: "side-clock-t" }, h("strong", {}, s.time), h("span", {}, dayLong(s.day))));
  }

  function drawPinned() {
    const ids = pinnedIds(st);
    pinnedList.replaceChildren(ids.length
      ? h("ul", {}, ids.map((id) => {
        const kind = panelKind(program, id);
        return h("li", { class: st.focus === id ? "focus" : "" },
          h("button", { type: "button", class: "side-pin", "data-title": titleOf(program, id, kind), onclick: () => focusPanel(id) },
            h("span", { class: "side-pin-thumb" }, thumbFor(program, id, kind)),
            h("span", { class: "side-pin-text" }, h("span", { class: "side-pin-title" }, titleOf(program, id, kind)),
              h("span", { class: "side-pin-kind" }, kindLabel(program, id, kind)))),
          h("button", { type: "button", class: "side-unpin", "aria-label": `Unpin ${titleOf(program, id, kind)}`, onclick: () => apply(togglePin(st, id)) },
            icon("star", { size: 16, fill: true })));
      }))
      : h("p", { class: "side-hint" }, "Items you open appear beside the page. Star one to keep it here, even after a reload."));
  }

  function drawMineCount() {
    if (mineCount) { const n = store.rightIds().length; mineCount.textContent = n ? String(n) : ""; }
  }

  function setRoute(route) {
    const g = groupOf(route);
    if (g) side?.querySelector(`.side-group[data-group="${g}"]`)?.openGroup?.(); // never leave the current section folded away
    side?.querySelectorAll(".side-nav a").forEach((a) => {
      if (a.dataset.route === route) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    drawMineCount();
  }

  /** The centre now shows `id` full page (or nothing, null): rebuild the panels whose state changes. */
  function setFull(id) {
    if (id === fullId) return;
    const was = fullId;
    fullId = id;
    if (!strip) return;
    for (const x of [was, id]) if (x != null && live.has(x)) drop(x);
    drawStrip();
  }

  // Another tab pinned or unpinned something: take its pinned set (without writing it back).
  const onStorage = (e) => {
    if (e.key !== PINNED_KEY && e.key !== null) return;
    apply(restoreStack({ urlIds: panelIds(st), pinned: loadPinned(), isKnown }), { save: false });
  };

  // ---- panels ----
  function buildPanel(id) {
    const kind = panelKind(program, id);
    const title = titleOf(program, id, kind);
    const c = kind === "person" ? personContent(program, store, id)
      : kind === "cluster" ? clusterContent(program, store, id, filters)
        : detailContent(program, store, id, { miniMap, compact: id === fullId });
    const pinBtn = h("button", { type: "button", class: "panel-btn panel-pin", onclick: () => apply(togglePin(st, id), { focus: id, keepFocus: true }) },
      icon("star", { size: 20 }));
    // Folded: the panel keeps its place in the row as a narrow strip; the strip is the way back in.
    // Expanded again: focus lands on the panel's own collapse button, where the user left it.
    const fold = h("button", { type: "button", class: "panel-fold", hidden: true, "aria-label": `Expand ${title}`, onclick: () => {
      apply(setCollapsed(st, id, false), { focus: id, keepFocus: true });
      collapseBtn.focus({ preventScroll: true });
      reveal(id);
    } },
      h("span", { class: "panel-fold-thumb" }, thumbFor(program, id, kind)),
      h("span", { class: "panel-fold-title" }, title),
      icon("grow", { size: 18 }));
    const collapseBtn = h("button", { type: "button", class: "panel-btn", "aria-label": `Collapse ${title}`, title: "Collapse to a strip", onclick: () => apply(setCollapsed(st, id, true), { focus: id }) }, icon("shrink", { size: 20 }));
    const scroll = h("div", { class: "panel-scroll" },
      h("div", { class: "panel-bar" },
        h("span", { class: "panel-thumb" }, thumbFor(program, id, kind)),
        h("span", { class: "panel-kind" }, kindLabel(program, id, kind)),
        pinBtn,
        collapseBtn,
        h("a", { class: "panel-btn", href: fullPageHash(kind, id), "aria-label": `Open ${title} as a full page`, title: "Open as a full page" }, icon("expand", { size: 20 })),
        h("button", { type: "button", class: "panel-btn", "aria-label": `Close ${title}`, title: "Close", onclick: () => close(id) }, icon("x", { size: 20 }))),
      h("div", { class: `panel-body detail-view${kind === "person" ? " person-view" : kind === "cluster" ? " cluster-view" : ""}` }, c.nodes));
    const el = h("section", { class: "dash-panel", "data-id": id, "aria-label": title, tabindex: "-1", "--kind": kindColor(program, id, kind) }, fold, scroll);
    el.addEventListener("focusin", (e) => {
      if (st.focus !== id) { st = { ...st, focus: id }; markFocus(); }
      // Tabbing into a panel that is partly off screen brings it into view. Only keyboard focus
      // (:focus-visible): a focus from the pointer must not scroll the row before the click lands.
      if (e.target !== el && focusVisible(e.target)) reveal(id);
    });
    return { el, scroll, fold, cleanup: c.cleanup, pinBtn, title, top: 0 };
  }

  function drop(id) {
    const p = live.get(id);
    if (!p) return;
    if (p.el.querySelector('.term[aria-expanded="true"], .term-chip[aria-expanded="true"]')) closeTermPopover({ restoreFocus: false });
    try { p.cleanup?.(); } catch { /* a panel's cleanup must not block the others */ }
    p.el.remove();
    live.delete(id);
  }

  function syncPin(p, pinned) {
    p.el.classList.toggle("pinned", pinned);
    p.pinBtn.setAttribute("aria-pressed", String(pinned));
    p.pinBtn.setAttribute("aria-label", pinned ? `Unpin ${p.title}` : `Pin ${p.title}: keep it open`);
    p.pinBtn.title = pinned ? "Unpin" : "Pin (keep open)";
    p.pinBtn.querySelector("path")?.setAttribute("fill", pinned ? "currentColor" : "none");
  }

  function syncStars() {
    document.querySelectorAll(".quick.star[data-pin]").forEach((b) => {
      const on = isPinned(st, b.dataset.pin);
      b.setAttribute("aria-pressed", String(on));
      b.setAttribute("aria-label", on ? "Unpin" : "Pin: keep it open beside the page");
      b.querySelector("path")?.setAttribute("fill", on ? "currentColor" : "none");
    });
  }

  /** Fold or unfold a drawn panel. Its scroll position survives; focus inside it moves to the strip. */
  function syncCollapsed(p, on) {
    const was = p.el.classList.contains("collapsed");
    if (on === was) return;
    if (on) {
      p.top = p.scroll.scrollTop;
      if (p.el.querySelector('.term[aria-expanded="true"], .term-chip[aria-expanded="true"]')) closeTermPopover({ restoreFocus: false });
      const hadFocus = p.scroll.contains(document.activeElement);
      p.el.classList.add("collapsed");
      p.fold.hidden = false;
      if (hadFocus) p.fold.focus({ preventScroll: true });
    } else {
      p.el.classList.remove("collapsed");
      p.fold.hidden = true;
      p.scroll.scrollTop = p.top;
    }
  }

  function markFocus() {
    for (const [id, p] of live) p.el.classList.toggle("focus", id === st.focus);
    pinnedList?.querySelectorAll("li").forEach((li, i) => li.classList.toggle("focus", pinnedIds(st)[i] === st.focus));
  }

  function drawStrip() {
    const ids = panelIds(st);
    for (const id of [...live.keys()]) if (!ids.includes(id)) drop(id);
    let prev = null;
    ids.forEach((id, i) => {
      let p = live.get(id);
      if (!p) { p = buildPanel(id); live.set(id, p); }
      p.el.style.setProperty("--i", String(i));
      // Move only what is out of place: re-inserting a panel would reset its scroll.
      const want = prev ? prev.nextSibling : strip.firstChild;
      if (want !== p.el) strip.insertBefore(p.el, want);
      syncPin(p, isPinned(st, id));
      syncCollapsed(p, isCollapsed(st, id));
      prev = p.el;
    });
    const folded = collapsedIds(st).length;
    doc.style.setProperty("--n", String(ids.length));
    doc.style.setProperty("--ne", String(ids.length - folded));
    doc.style.setProperty("--nc", String(folded));
    doc.classList.toggle("has-panels", ids.length > 0);
    strip.hidden = !ids.length;
    markFocus();
    drawBulk();
    syncSize();
  }

  // ---- the row: sizes for CSS, reveal and wheel (maths in panels.js) ----

  /** The viewport's usable size (without scrollbars) for the centre's width rule and the panels' height. */
  function syncSize() {
    doc.style.setProperty("--vw", `${doc.clientWidth}px`);
    doc.style.setProperty("--vh", `${doc.clientHeight}px`);
    // The centre's width with panels open (panels.js centreWidth); without panels CSS keeps it fluid.
    if (!strip || strip.hidden || !side) { doc.style.removeProperty("--centre-w"); return; }
    const wide = strip.querySelector(".dash-panel:not(.collapsed)");
    const pw = wide?.offsetWidth || Math.min(420, Math.max(360, doc.clientWidth * 0.26));
    const w = centreWidth({ vw: doc.clientWidth, side: side.offsetWidth, panels: strip.offsetWidth, pw });
    doc.style.setProperty("--centre-w", `${Math.floor(w)}px`);
  }

  const focusVisible = (n) => { try { return n.matches(":focus-visible"); } catch { return true; } };
  const sideEdge = () => side?.getBoundingClientRect().right ?? 0;

  /** Scroll the page sideways (as little as possible) so panel `id` shows whole. Smooth unless reduced motion. */
  function reveal(id, { smooth = true } = {}) {
    const p = live.get(id);
    if (!p || !strip || strip.hidden) return;
    const sx = window.scrollX;
    const left = strip.getBoundingClientRect().left + sx + p.el.offsetLeft; // offsetLeft ignores the entry animation
    const to = revealScroll({ left, right: left + p.el.offsetWidth }, {
      scroll: sx, start: sideEdge(), end: doc.clientWidth, gap: 12, max: doc.scrollWidth - doc.clientWidth,
    });
    if (to == null) return;
    window.scrollTo({ left: to, top: window.scrollY, behavior: smooth && !reducedMotion() ? "smooth" : "auto" });
  }

  /** Settle the row on a panel's left edge (or the centre's) when one rests within a few px of the sidebar. */
  function settle() {
    if (!strip || strip.hidden) return;
    const sx = window.scrollX;
    const base = strip.getBoundingClientRect().left + sx;
    const edges = [0, ...[...live.values()].map((p) => base + p.el.offsetLeft - sideEdge() - 12)];
    const to = snapTarget(edges, sx, { within: 40, max: doc.scrollWidth - doc.clientWidth });
    if (to != null) window.scrollTo({ left: to, top: window.scrollY, behavior: reducedMotion() ? "auto" : "smooth" });
  }

  /** True when `n` or an ancestor (below the body) can still scroll vertically in direction `dir`. */
  function innerScrolls(n, dir) {
    for (; n && n !== document.body && n !== doc; n = n.parentElement) {
      if (n.scrollHeight <= n.clientHeight + 1 || !/(auto|scroll)/.test(getComputedStyle(n).overflowY)) continue;
      if (dir > 0 ? n.scrollTop + n.clientHeight < n.scrollHeight - 1 : n.scrollTop > 0) return true;
    }
    return false;
  }

  // A vertical wheel anywhere on the desktop moves the whole row sideways when nothing under the pointer
  // can scroll that way (the sidebar, a panel's bar, the gaps, a panel's text at its end, the centre at its
  // top or bottom). Shift+wheel always goes sideways; trackpads' own sideways swipes stay native.
  const onWheel = (e) => {
    if (!side || e.defaultPrevented) return;
    const t = e.target instanceof Element ? e.target : null;
    if (!t || t.closest(".term-pop, .sheet-wrap")) return;
    const dir = Math.sign(e.deltaY);
    const maxX = doc.scrollWidth - doc.clientWidth;
    const sx = window.scrollX;
    const canX = maxX > 1 && (dir > 0 ? sx < maxX - 1 : sx > 1);
    const over = t.closest(".dash-side") ? "side" : t.closest(".dash-panels") ? "panel" : "centre";
    const pageY = dir > 0 ? window.scrollY + doc.clientHeight < doc.scrollHeight - 1 : window.scrollY > 0;
    const inner = !t.closest(".panel-bar") && innerScrolls(t, dir); // a panel's bar moves the row, not its text
    const want = wheelIntent(e, { over, inner, pageY, canX });
    if (Math.abs(e.deltaX) >= Math.abs(e.deltaY) || e.ctrlKey) { wheelLatch = null; return; } // native sideways swipe or zoom
    if (e.shiftKey) { if (want !== "x") return; } // shift: always sideways (when the row can move)
    else {
      // One gesture keeps one axis: momentum after a panel's text (or the centre) reached its end must
      // not flip the row sideways, and a sideways gesture that passes over a panel's text stays sideways.
      wheelLatch = latchAxis(wheelLatch, want === "x" ? "x" : "y", e.timeStamp);
      if (wheelLatch.axis !== "x") return;
      e.preventDefault();
      if (!canX) return; // latched sideways, the row is at its end
    }
    e.preventDefault();
    // No CSS scroll snap on the page (it would undo each wheel notch or jump a whole panel per small
    // trackpad step): once the wheel rests, a panel edge that ended up close to the sidebar settles on it.
    clearTimeout(wheelRest);
    wheelRest = setTimeout(settle, 180);
    const unit = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? doc.clientWidth : 1;
    window.scrollBy({ left: e.deltaY * unit, behavior: "instant" });
  };

  // Note the panel a link was clicked in, for takeSource() (see the header comment).
  const onClickCapture = (e) => {
    // A modified or non-primary click (new tab / window, download) or one a handler already cancelled
    // navigates nowhere here: it must not leave a source behind for the next route change.
    if (e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) { pendingSource = null; return; }
    const a = e.target?.closest?.("a[href^='#']");
    const panel = a?.closest(".dash-panel[data-id]");
    pendingSource = a && panel ? { hash: a.hash, from: panel.dataset.id, at: Date.now() } : null;
  };

  // A handler that cancelled the click (after the capture phase saw it) navigates nowhere either.
  const onClickBubble = (e) => { if (e.defaultPrevented) pendingSource = null; };

  function writeUrl() {
    const entries = panelEntries(st);
    setCurrentPanels(entries);
    const want = withPanels(centreOf(location.hash), entries);
    if (want !== location.hash) { try { history.replaceState(null, "", want); } catch { /* still drawn */ } }
  }

  function focusPanel(id, { scroll = true } = {}) {
    const p = live.get(id);
    if (!p) return;
    st = { ...st, focus: id };
    markFocus();
    (isCollapsed(st, id) ? p.fold : p.el).focus({ preventScroll: true });
    if (scroll) reveal(id);
  }

  /** Draw stack `next`. `focus`: move keyboard focus into that panel. `url: false` leaves the URL alone. */
  function apply(next, { focus = null, keepFocus = false, url = true, save = true } = {}) {
    const hadFocusIn = strip?.contains(document.activeElement) ? document.activeElement.closest(".dash-panel")?.dataset.id : null;
    st = next;
    if (save) savePinned(pinnedIds(st));
    if (!strip) return;
    drawStrip();
    drawPinned();
    drawRail();
    syncStars();
    if (url) writeUrl();
    if (focus && !keepFocus) focusPanel(focus);
    else if (hadFocusIn && !live.has(hadFocusIn)) {
      // The focused panel closed: focus its neighbour, else the page.
      if (st.focus && live.has(st.focus)) focusPanel(st.focus); else document.getElementById("app")?.focus({ preventScroll: true });
    }
  }

  function close(id) { apply(closePanel(st, id)); }

  const editable = (el) => el?.matches?.("input, textarea, select, [contenteditable]:not([contenteditable='false'])");
  const onKey = (e) => {
    if (e.defaultPrevented || document.querySelector(".term-pop, .sheet-wrap")) return;
    // "[" alone folds or unfolds the sidebar (Ctrl+[ steps between panels, below). Layouts that type "["
    // with AltGr / Option (Italian Mac) count too, and so does the key in the "[" position.
    const bracket = (e.key === "[" && !e.ctrlKey && !e.metaKey) || (e.code === "BracketLeft" && !e.ctrlKey && !e.metaKey && !e.altKey);
    if (bracket && !editable(document.activeElement)) {
      e.preventDefault();
      setRail(!rail);
      return;
    }
    const panel = document.activeElement?.closest?.(".dash-panel");
    // ←/→ inside a panel, or Ctrl+[ / Ctrl+] anywhere: focus the panel to the left / right.
    const ctrlStep = e.ctrlKey && !e.altKey && !e.metaKey && (e.key === "[" || e.key === "]");
    const arrowStep = panel && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey
      && (e.key === "ArrowLeft" || e.key === "ArrowRight") && !editable(document.activeElement);
    if (ctrlStep || arrowStep) {
      const dir = e.key === "[" || e.key === "ArrowLeft" ? -1 : 1;
      const cur = panel?.dataset.id ?? null;
      const to = cur ? neighbourPanel(st, cur, dir) : (live.has(st.focus) ? st.focus : neighbourPanel(st, null, dir));
      if (!to) return;
      e.preventDefault();
      focusPanel(to);
      return;
    }
    if (e.key !== "Escape") return;
    if (!panel || isPinned(st, panel.dataset.id)) return;
    e.preventDefault();
    close(panel.dataset.id);
  };

  function starButton(x) {
    const b = h("button", { type: "button", class: "quick star", "data-pin": x.id, onclick: () => apply(togglePin(st, x.id), { keepFocus: true }) },
      icon("star", { size: 20 }));
    return b;
  }

  return {
    stack: () => st,
    apply,
    setRoute,
    setFull,
    /** Rebuild from URL ids, keeping what is pinned now. */
    restore(entries) {
      const list = entries.map((e) => (typeof e === "string" ? { id: e, collapsed: false } : e));
      return restoreStack({ urlIds: list.map((e) => e.id), collapsed: list.filter((e) => e.collapsed).map((e) => e.id), pinned: pinnedIds(st), isKnown });
    },
    /** The stack with `id` opened from `from` (a panel id, or "centre"). */
    open(id, from = "centre") { return isKnown(id) ? openPanel(st, id, { from }) : st; },
    /** The panel whose link led to `hash` (just clicked), else "centre". One use per click. */
    takeSource(hash) {
      const p = pendingSource;
      pendingSource = null;
      return p && p.hash === hash && Date.now() - p.at < 2000 && live.has(p.from) ? p.from : "centre";
    },
    isKnown,
    mount() {
      if (side) return;
      doc.classList.add("dash");
      buildSide();
      strip = h("aside", { class: "dash-panels", "aria-label": "Open items" });
      document.getElementById("app").after(strip); // in the row, right of the centre
      document.addEventListener("wheel", onWheel, { passive: false });
      window.addEventListener("resize", syncSize);
      sizeRO = typeof ResizeObserver === "function" ? new ResizeObserver(syncSize) : null;
      sizeRO?.observe(document.body); // a scrollbar coming or going changes the usable size
      rowHooks.extra = starButton;
      document.addEventListener("click", onClickCapture, true);
      document.addEventListener("click", onClickBubble);
      document.addEventListener("keydown", onKey);
      window.addEventListener("storage", onStorage);
      offVerdict = onVerdict(drawMineCount);
      apply(st, { url: false });
    },
    unmount() {
      if (!side) return;
      for (const id of [...live.keys()]) drop(id);
      offClock?.(); offClock = null;
      sizeRO?.disconnect(); sizeRO = null;
      document.removeEventListener("wheel", onWheel);
      clearTimeout(wheelRest);
      window.removeEventListener("resize", syncSize);
      document.removeEventListener("click", onClickCapture, true);
      document.removeEventListener("click", onClickBubble);
      pendingSource = null;
      side.remove(); strip.remove();
      side = strip = pinnedList = clockBox = mineCount = railBtn = bulkBox = bulkBtn = bulkN = null;
      rowHooks.extra = null;
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("storage", onStorage);
      offVerdict?.(); offVerdict = null;
      setCurrentPanels([]); // phones: replaceRoute must not carry panel ids along
      doc.classList.remove("dash", "has-panels", "rail");
      for (const v of ["--n", "--ne", "--nc", "--vw", "--vh", "--centre-w"]) doc.style.removeProperty(v);
    },
    /** Redraw every panel (data changed in another copy of the app). */
    refresh() {
      if (!strip) return;
      for (const id of [...live.keys()]) drop(id);
      apply(st, { url: false });
    },
  };
}

