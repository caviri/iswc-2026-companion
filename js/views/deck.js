// Swipe deck: the triage screen. Right = keep, left = skip, up = maybe (decide later, in My ISWC). On a wide
// desktop centre it spreads out: filter column, wide card, "Up next" and keyboard shortcuts (tiers in
// js/deck-model.js). Cards scroll inside; attachSwipe (deck-cards.js) tells a swipe from a scroll.
import { h, icon, openSheet, toast, noteEditor, reducedMotion } from "../ui.js";
import {
  deckItems, pinFirst, filterOptions, extraFilterCount,
  THRESHOLD, SWIPE_MAX, UP_THRESHOLD, UP_MAX, emptyNext, deckMaybes,
} from "../model.js";
import { deckLayout, deckKeyAction, upNext, DECK_KEYS, loadFilters, saveFilters } from "../deck-model.js";
import { SLOT_KEYS } from "../slots-model.js";
import { cardFor, wideCard, ghostCard, upNextTile, keysLegend, attachSwipe } from "./deck-cards.js";
import { onVerdict } from "../verdict-bus.js";
import { slotPanel } from "./slots.js";

export { cardFor, loadFilters, saveFilters };

const FLY_MS = 300;

// Undo history lives for the page's lifetime: [{ id, mode }]
const history = [];
let pinned = null;
// Where each card's content was scrolled to (an undone or redrawn card comes back where it was; a new one starts at the top).
const scrollPos = new Map();
/** Drop the undone card that would head the deck (the filter scope changed from outside the deck). */
export function resetPin() { pinned = null; }

/**
 * renderDeck(root, program, store, filters) -> cleanup()
 * `filters` ({mode, day, kinds, tracks, topics, clusters}) is mutated in place as the user changes it.
 */
export function renderDeck(root, program, store, filters) {
  const opts = filterOptions(program);
  // A saved cluster filter from another data version (or old data without clusters) must not empty the deck.
  filters.clusters = (filters.clusters ?? []).filter((id) => opts.clusters.some((c) => c.value === id));
  let busy = false;
  let cards = [];
  // Desktop (the dashboard is mounted): the layout tier follows the centre's width (js/deck-model.js).
  // Phones always stay "single", which is the original deck, node for node.
  const desktop = () => document.documentElement.classList.contains("dash");
  let tier = "single";
  let wideTop = null; // the wide top card (its detail content needs disposing)
  let legendOpen = false;
  let mine = false; // the deck's own swipe/undo is emitting (the verdict bus)
  let dragging = false; // a drag on the top card is in progress (layout and verdict redraws wait for it)
  let dirty = false; // a verdict made elsewhere arrived mid-swipe: redraw once the card has settled
  /** After a drag or fly-out: catch up on what was deferred (an outside verdict, a new tier). */
  function settle() {
    if (busy || dragging) return;
    if (retier()) dirty = false;
    else if (dirty) { dirty = false; refresh(); }
  }
  /** Desktop: rebuild when the width moved the deck into another tier -> whether it rebuilt. */
  function retier() {
    if (!desktop() || typeof ResizeObserver !== "function") return false;
    const t = measure();
    if (t === tier) return false;
    tier = t;
    build();
    return true;
  }
  const wide = () => tier !== "single";

  const isSub = () => filters.mode.startsWith("session:");
  const isSlots = () => filters.mode === "slots";
  const subSession = () => (isSub() ? program.byId.get(filters.mode.slice(8)) : null);
  const items = () => {
    let xs = pinFirst(deckItems(program, store, filters, filters.mode), pinned);
    if (pinned && xs[0]?.id !== pinned && !store.verdict(pinned) && program.byId.has(pinned)) xs = [program.byId.get(pinned), ...xs];
    return xs;
  };
  const top = () => cards[0] ?? null;

  const view = h("section", { class: "view deck-view", "aria-label": "Swipe deck" });
  const count = h("span", { class: "deck-count", "aria-live": "polite" });
  const stack = h("div", { class: "stack" });
  const btn = (cls, label, name, onclick, fill) =>
    h("button", { class: `round-btn ${cls}`, type: "button", "aria-label": label, title: label, onclick }, icon(name, { fill, size: cls.includes("big") ? 30 : 22 }));
  const undoBtn = btn("undo", "Undo last swipe", "undo", () => undo());
  const skipBtn = btn("big skip", "Skip", "x", () => decide("left"));
  const maybeBtn = btn("maybe", "Maybe: decide later", "maybe", () => decide("up"));
  const keepBtn = btn("big keep", "Keep", "heart", () => decide("right"), true);
  const noteBtn = btn("note", "Add a note", "note", () => openNote());
  const actions = h("div", { class: "deck-actions" }, undoBtn, skipBtn, maybeBtn, keepBtn, noteBtn);
  // "Time slots" mode: parallel sessions side by side instead of one card at a time.
  const slots = slotPanel(program, store, filters, {
    onCount: (text) => { count.textContent = text; },
    onLegend: () => wide() && toggleLegend(),
    wide: () => wide(),
    emptyActions: () => [
      h("button", { class: "pill-btn primary", type: "button", onclick: () => setMode("sessions") }, "Swipe sessions"),
      h("a", { class: "pill-btn", href: "#/mine" }, "Open My ISWC")],
  });

  function setMode(mode) {
    filters.mode = mode;
    pinned = null;
    saveFilters(filters);
    build();
  }

  function header() {
    if (isSub()) {
      const s = subSession();
      return h("header", { class: "deck-head sub" },
        h("button", { class: "back-btn", type: "button", onclick: () => setMode("sessions"), "aria-label": "Back to sessions" }, icon("back"), "Sessions"),
        h("div", { class: "sub-title" }, h("strong", {}, "Papers in this session"), h("span", {}, s?.title ?? "")),
        count);
    }
    const seg = (mode, label) => h("button", {
      type: "button", role: "tab", class: "seg-btn", "aria-selected": String(filters.mode === mode),
      onclick: () => filters.mode !== mode && setMode(mode),
    }, label);
    return h("header", { class: "deck-head" },
      h("div", { class: "seg", role: "tablist", "aria-label": "Deck" }, seg("sessions", "Sessions"), seg("papers", "Papers & posters"), seg("slots", "Time slots")),
      count);
  }

  function chipRow() {
    if (isSub()) return null;
    const day = (value, label) => h("button", {
      type: "button", class: "chip", "aria-pressed": String(filters.day === value),
      onclick: () => { filters.day = value; pinned = null; saveFilters(filters); build(); },
    }, label);
    // Time slots only narrow by day; the other filters choose cards, not slots.
    if (isSlots()) return h("div", { class: "chip-row", role: "toolbar", "aria-label": "Day" }, day(null, "All days"), opts.days.map((d) => day(d.value, d.label)));
    const n = extraFilterCount(filters, filters.mode);
    // A cluster picked in Explore shows as its own removable chip, first in the row.
    const cl = filters.clusters.length === 1 ? opts.clusters.find((c) => c.value === filters.clusters[0]) : null;
    const scope = cl ? h("button", {
      type: "button", class: "chip chip-scope", "aria-label": `Remove cluster filter: ${cl.label}`,
      onclick: () => { filters.clusters = []; pinned = null; saveFilters(filters); build(); },
    }, h("span", { class: "chip-scope-text" }, cl.label), icon("x", { size: 16 })) : null;
    return h("div", { class: "chip-row", role: "toolbar", "aria-label": "Filters" },
      scope, day(null, "All days"), opts.days.map((d) => day(d.value, d.label)),
      h("button", { type: "button", class: "chip chip-filter", "aria-pressed": String(n > 0), onclick: openFilters },
        icon("filter", { size: 18 }), n ? `Filters ${n}` : "Filters"));
  }

  function build() {
    if (desktop()) {
      view.classList.toggle("deck-wide", wide());
      // Time slots use the one-column wide layout whatever the tier: the slot card takes the whole width.
      if (wide()) view.dataset.tier = isSlots() ? "wide" : tier; else delete view.dataset.tier;
    }
    if (wide() && isSlots()) { buildSlotsWide(); return; }
    if (wide()) { buildWide(); return; }
    const scrollX = view.querySelector(".chip-row")?.scrollLeft ?? 0;
    view.replaceChildren(header(), chipRow() ?? h("div", { class: "chip-row-gap" }), ...(isSlots() ? [slots.body, slots.actions] : [stack, actions]));
    const row = view.querySelector(".chip-row");
    if (row) {
      row.scrollLeft = scrollX;
      if (!scrollX) row.querySelector('[aria-pressed="true"]')?.scrollIntoView?.({ inline: "nearest", block: "nearest" });
    }
    refresh();
  }

  function refresh() {
    if (isSlots()) { cards = []; slots.refresh(); return; }
    const list = items();
    cards = list;
    const noun = isSub() || filters.mode === "papers" ? (list.length === 1 ? "paper" : "papers") : (list.length === 1 ? "session" : "sessions");
    const maybes = deckMaybes(program, store, filters, filters.mode);
    count.textContent = (isSub() ? `${list.length} left` : `${list.length} ${noun} left`) + (maybes ? ` · ${maybes} maybe` : "");
    wideTop?.dispose?.();
    wideTop = null;
    stack.replaceChildren();
    if (!list.length) stack.append(emptyState());
    if (wide()) { refreshWide(list); return; }
    list.slice(0, 3).reverse().forEach((item, ri, arr) => {
      const pos = arr.length - 1 - ri;
      const el = cardFor(program, store, item);
      el.dataset.pos = String(pos);
      if (pos === 0) attachDrag(el, item);
      else { el.setAttribute("aria-hidden", "true"); el.inert = true; }
      stack.append(el);
      if (pos === 0) keepScroll(el.querySelector(".card-inner"), item.id);
    });
    skipBtn.disabled = maybeBtn.disabled = keepBtn.disabled = noteBtn.disabled = !list.length;
    undoBtn.disabled = !history.length;
  }

  function emptyState() {
    const hasFilters = !isSub() && (filters.day || extraFilterCount(filters, filters.mode));
    const what = isSub() ? "paper in this session" : filters.mode === "papers" ? "paper" : "session";
    // Filters on and the other mode still has cards under them: switch mode, keep the filters.
    const next = hasFilters ? emptyNext(program, store, filters) : null;
    const nextLabel = next && (next.mode === "papers" ? `Swipe ${next.n} ${next.n === 1 ? "paper" : "papers"} & posters` : `Swipe ${next.n} ${next.n === 1 ? "session" : "sessions"}`);
    const clearBtn = (cls) => h("button", { class: `pill-btn ${cls}`.trim(), type: "button", onclick: clearFilters }, "Clear filters");
    return h("div", { class: "empty" },
      h("div", { class: "empty-mark", "aria-hidden": "true" }, icon("check", { size: 34 })),
      h("h2", {}, hasFilters ? `No ${what}s left with these filters` : `You've sorted every ${what}`),
      h("p", {}, next ? `The same filters still have ${next.mode === "papers" ? "papers and posters" : "sessions"} to sort.`
        : hasFilters ? "Clear the filters to keep swiping, or look at what you kept."
          : "Everything you kept, and your maybes, are in My ISWC. Undo brings back the last card."),
      h("div", { class: "empty-actions" },
        isSub() ? h("button", { class: "pill-btn primary", type: "button", onclick: () => setMode("sessions") }, "Back to sessions")
          : next ? [h("button", { class: "pill-btn primary", type: "button", onclick: () => setMode(next.mode) }, nextLabel), clearBtn("")]
          : hasFilters ? clearBtn("primary")
            : filters.mode === "sessions" ? h("button", { class: "pill-btn primary", type: "button", onclick: () => setMode("papers") }, "Swipe papers & posters") : null,
        h("a", { class: "pill-btn", href: "#/mine" }, "Open My ISWC")));
  }

  function clearFilters() {
    Object.assign(filters, { day: null, kinds: [], tracks: [], topics: [], clusters: [] });
    saveFilters(filters);
    build();
  }

  // ---- swiping ----
  function decide(dir, el = stack.querySelector('.card[data-pos="0"]'), from = null) {
    const item = top();
    if (!item || busy || !el) return;
    busy = true;
    mine = true;
    store.swipe(item.id, dir);
    mine = false;
    history.push({ id: item.id, mode: filters.mode });
    if (pinned === item.id) pinned = null;
    const w = stack.clientWidth || 360;
    const finish = () => {
      busy = false;
      dirty = false; // the redraw below catches up on outside verdicts too
      if (!retier()) refresh(); // a tier change that waited for the fly-out rebuilds now
      if (dir === "right" && item.paperIds?.length && !isSub()) {
        const open = item.paperIds.filter((id) => !store.verdict(id)).length;
        if (open) toast(`Kept. ${open} ${open === 1 ? "paper" : "papers"} in this session.`, { action: "Swipe them", onAction: () => setMode(`session:${item.id}`), ms: 6000 });
      }
    };
    scrollPos.delete(item.id);
    if (reducedMotion()) { finish(); return; }
    const sign = dir === "right" ? 1 : -1;
    const dy = from?.dy ?? 0;
    el.classList.remove("dragging");
    el.classList.add("flying", dir === "right" ? "show-keep" : dir === "up" ? "show-maybe" : "show-skip");
    el.style.transform = dir === "up"
      ? `translate(${from?.dx ?? 0}px, ${-(stack.clientHeight || 600) * 1.3}px)` // straight up and away
      : `translate(${sign * w * 1.5}px, ${dy + 40}px) rotate(${sign * 24}deg)`;
    el.style.opacity = "0";
    stack.querySelectorAll(".card").forEach((c) => { if (c !== el) c.dataset.pos = String(Math.max(0, +c.dataset.pos - 1)); });
    setTimeout(finish, FLY_MS);
  }

  function undo() {
    if (busy) return;
    const last = history.pop();
    if (!last) return;
    mine = true;
    store.unswipe(last.id);
    mine = false;
    pinned = last.id;
    if (last.mode !== filters.mode) { filters.mode = last.mode; saveFilters(filters); build(); } else refresh();
    stack.querySelector('.card[data-pos="0"]')?.classList.add("returning");
  }

  /** Remember where a card's content is scrolled to, and put it back (a new card starts at the top). */
  function keepScroll(scroller, id) {
    if (!scroller) return;
    scroller.scrollTop = scrollPos.get(id) ?? 0;
    scroller.addEventListener("scroll", () => { scrollPos.set(id, scroller.scrollTop); }, { passive: true });
  }

  function attachDrag(el, item) {
    const isWide = el.classList.contains("card-wide");
    const setDrag = (dx, dy, mode) => {
      const w = el.offsetWidth || 1, hgt = el.offsetHeight || 1;
      if (mode === "up") {
        const p = Math.min(1, -dy / Math.min(hgt * UP_THRESHOLD, UP_MAX));
        el.style.transform = `translateY(${dy}px)`;
        el.style.setProperty("--p-maybe", String(Math.max(0, p)));
        return;
      }
      const p = Math.max(-1, Math.min(1, dx / Math.min(w * THRESHOLD, SWIPE_MAX)));
      el.style.transform = `translate(${dx}px, ${dy * 0.3}px) rotate(${(dx / w) * 14}deg)`;
      el.style.setProperty("--p-keep", String(Math.max(0, p)));
      el.style.setProperty("--p-skip", String(Math.max(0, -p)));
    };
    const reset = () => {
      el.classList.remove("dragging");
      el.style.transform = "";
      for (const v of ["--p-keep", "--p-skip", "--p-maybe"]) el.style.removeProperty(v);
    };
    attachSwipe(el, {
      // Phone card: its inner column scrolls; the art band and the tag row are still ground to pull up from.
      // Wide card: the text column scrolls (and is selectable with a mouse); the art column is still.
      scrollSel: isWide ? ".cw-main" : ".card-inner",
      textSel: isWide ? ".cw-main" : null,
      edgeSel: isWide ? ".cw-side" : ".card-art, .card-top",
      isBusy: () => busy,
      onStart: () => { dragging = true; },
      onMove: setDrag,
      onRelease: (outcome, { dx, dy, mode }) => {
        dragging = false;
        if (outcome === "right" || outcome === "left" || outcome === "up") decide(outcome, el, mode === "up" ? { dx: 0, dy } : { dy: dy * 0.3 });
        else if (outcome === "spring") { el.classList.add("springing"); reset(); setTimeout(() => el.classList.remove("springing"), 300); }
        else reset();
        if (outcome !== "right" && outcome !== "left" && outcome !== "up") settle();
      },
      onTap: (e) => {
        if (isWide && String(globalThis.getSelection?.() ?? "").trim()) return; // a text selection, not a tap
        if (e.target.closest?.(".term, a, button, summary")) return; // the term opens its popover (wide card: links, buttons); never the card
        location.hash = `#/item/${encodeURIComponent(item.id)}`;
      },
    });
    el.addEventListener("keydown", (e) => {
      if (e.target !== el) return; // keys on a link or button inside the (wide) card are theirs
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); location.hash = `#/item/${encodeURIComponent(item.id)}`; }
    });
  }

  // ---- sheets ----
  function openNote() {
    const item = top();
    if (!item) return;
    const sheet = openSheet({ title: "Note", onClose: () => { ed.flush(); ed.dispose(); refresh(); } });
    const ed = noteEditor(store, item.id, { autofocus: true });
    sheet.body.append(
      h("p", { class: "sheet-sub" }, item.title),
      ed,
      h("div", { class: "sheet-actions" }, h("button", { class: "pill-btn primary", type: "button", onclick: () => sheet.close() }, "Done")));
  }

  // One group of filter chips (the sheet and the desktop filter column share it). `limit`: show only
  // the first N options (plus any selected ones) behind a "Show all" toggle.
  function filterGroup(title, key, list, hint, limit, onChange) {
    const chips = list.map((o) => h("button", {
      type: "button", class: "chip", "aria-pressed": String(filters[key].includes(o.value)),
      "--dot": o.color ?? null,
      onclick: (e) => {
        const on = filters[key].includes(o.value);
        filters[key] = on ? filters[key].filter((x) => x !== o.value) : [...filters[key], o.value];
        e.currentTarget.setAttribute("aria-pressed", String(!on));
        saveFilters(filters);
        onChange();
      },
    }, o.color ? h("i", { class: "dot", "aria-hidden": "true" }) : null, o.label));
    const wrap = h("div", { class: "chip-wrap" }, chips);
    let more = null;
    if (limit && list.length > limit) {
      const collapse = (on) => {
        chips.forEach((c, i) => { c.hidden = on && i >= limit && !filters[key].includes(list[i].value); });
        more.textContent = on ? `Show all ${list.length}` : "Show fewer";
        more.setAttribute("aria-expanded", String(!on));
      };
      more = h("button", { type: "button", class: "chip chip-more", onclick: () => collapse(more.getAttribute("aria-expanded") === "true") });
      wrap.append(more);
      collapse(true);
    }
    return h("fieldset", { class: "filter-group" },
      h("legend", {}, title),
      hint ? h("p", { class: "filter-hint" }, hint) : null,
      wrap);
  }

  function openFilters() {
    const papers = filters.mode === "papers";
    const showBtn = h("button", { class: "pill-btn primary", type: "button" });
    const updateCount = () => {
      const n = deckItems(program, store, filters, filters.mode).length;
      showBtn.textContent = n === 1 ? "Show 1 card" : `Show ${n} cards`;
    };
    const group = (title, key, list, hint, limit = 0) => filterGroup(title, key, list, hint, limit, updateCount);
    const sheet = openSheet({ title: "Filters", onClose: () => { pinned = null; build(); } });
    const clear = h("button", { class: "pill-btn", type: "button", onclick: () => {
      Object.assign(filters, { kinds: [], tracks: [], topics: [], clusters: [] });
      saveFilters(filters);
      sheet.body.querySelectorAll(".chip[aria-pressed]").forEach((c) => c.setAttribute("aria-pressed", "false"));
      updateCount();
    } }, "Clear");
    showBtn.addEventListener("click", () => sheet.close());
    sheet.body.append(
      papers ? null : group("Kind", "kinds", opts.kinds),
      group("Track", "tracks", opts.tracks, papers ? null : "Sessions with at least one paper in the track"),
      group("Topic", "topics", opts.topics),
      opts.clusters.length ? group("Cluster", "clusters", opts.clusters, "Groups of related sessions and papers, biggest first; see Explore", 6) : null,
      h("div", { class: "sheet-actions" }, clear, showBtn));
    updateCount();
  }

  // ---- wide desktop deck: filter column, wide card, "Up next", shortcuts legend ----
  let unList = null, unMore = null, unBox = null, colClear = null;
  const keysBtn = h("button", { type: "button", class: "keys-btn", "aria-expanded": "false", "aria-controls": "deck-keys", onclick: () => toggleLegend() },
    h("kbd", { "aria-hidden": "true" }, "?"), "Shortcuts");

  function toggleLegend(on = !legendOpen) {
    legendOpen = on;
    keysBtn.setAttribute("aria-expanded", String(on));
    const lg = view.querySelector(".deck-keys");
    if (lg) lg.hidden = !on;
  }

  /** Wide desktop, Time slots: the slot card across the centre, its buttons and its own shortcuts. */
  function buildSlotsWide() {
    const legend = keysLegend(SLOT_KEYS);
    legend.hidden = !legendOpen;
    keysBtn.setAttribute("aria-expanded", String(legendOpen));
    const bar = h("div", { class: "deck-bar" }, slots.actions, h("div", { class: "keys-wrap" }, keysBtn, legend));
    view.replaceChildren(header(), chipRow() ?? h("div", { class: "chip-row-gap" }), slots.body, bar);
    refresh();
  }

  function buildWide() {
    const legend = keysLegend(DECK_KEYS);
    legend.hidden = !legendOpen;
    keysBtn.setAttribute("aria-expanded", String(legendOpen));
    unList = h("ol", { class: "un-list" });
    unMore = h("p", { class: "un-more" });
    unBox = h("section", { class: "up-next", "aria-labelledby": "un-h" }, h("h2", { class: "un-h", id: "un-h" }, "Up next"), unList, unMore);
    const bar = h("div", { class: "deck-bar" }, actions, h("div", { class: "keys-wrap" }, keysBtn, legend));
    if (tier === "wide") view.replaceChildren(header(), chipRow() ?? h("div", { class: "chip-row-gap" }), stack, bar, unBox);
    else view.replaceChildren(filterColumn(), stack, bar, unBox);
    refresh();
  }

  function refreshWide(list) {
    const [first, ...rest] = list;
    if (first) {
      // Two plain cards behind the top one keep the stack's depth; their titles are in "Up next".
      rest.slice(0, 2).reverse().forEach((item, ri, arr) => {
        const g = ghostCard(program, item);
        g.dataset.pos = String(arr.length - ri);
        g.setAttribute("aria-hidden", "true");
        g.inert = true;
        stack.append(g);
      });
      wideTop = wideCard(program, store, first, { onNote: openNote });
      wideTop.dataset.pos = "0";
      attachDrag(wideTop, first);
      stack.append(wideTop);
      keepScroll(wideTop.querySelector(".cw-main"), first.id);
    }
    const nx = upNext(list, tier);
    const more = list.length - 1 - nx.length;
    unList.replaceChildren(...nx.map((x) => upNextTile(program, x)));
    unList.style.setProperty("--un-n", String(Math.max(1, nx.length))); // short lists fill the row
    unList.style.setProperty("--un-n3", String(Math.max(1, Math.min(3, nx.length))));
    unMore.textContent = list.length === 1 ? "Nothing after this card." : more > 0 ? `and ${more} more after these` : "";
    unBox.hidden = !list.length;
    skipBtn.disabled = maybeBtn.disabled = keepBtn.disabled = noteBtn.disabled = !list.length;
    undoBtn.disabled = !history.length;
    if (colClear) colClear.hidden = !(filters.day || extraFilterCount(filters, filters.mode));
  }

  /** The filter sheet's groups as a persistent column, plus the mode toggle and the count. Live. */
  function filterColumn() {
    const live = () => { pinned = null; refresh(); };
    colClear = null;
    if (isSub()) {
      return h("aside", { class: "deck-filters", "aria-label": "Deck" }, header(),
        h("p", { class: "filter-hint col-note" }, "Filters don't apply here: these are all the papers in this session."));
    }
    const papers = filters.mode === "papers";
    const dayChips = [{ value: null, label: "All days" }, ...opts.days].map((d) => h("button", {
      type: "button", class: "chip", "aria-pressed": String(filters.day === d.value),
      onclick: (e) => {
        filters.day = d.value;
        saveFilters(filters);
        e.currentTarget.parentNode.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", String(c === e.currentTarget)));
        live();
      },
    }, d.label));
    colClear = h("button", { type: "button", class: "pill-btn col-clear", onclick: clearFilters }, icon("x", { size: 18 }), "Clear filters");
    return h("aside", { class: "deck-filters", "aria-label": "Deck filters" },
      header(),
      h("fieldset", { class: "filter-group" }, h("legend", {}, "Day"), h("div", { class: "chip-wrap" }, dayChips)),
      papers ? null : filterGroup("Kind", "kinds", opts.kinds, null, 0, live),
      filterGroup("Track", "tracks", opts.tracks, papers ? null : "Sessions with at least one paper in the track", 0, live),
      filterGroup("Topic", "topics", opts.topics, null, 0, live),
      opts.clusters.length ? filterGroup("Cluster", "clusters", opts.clusters, "Groups of related sessions and papers, biggest first; see Explore", 6, live) : null,
      colClear);
  }

  /** Usable centre width -> tier. Desktop panels sit beside the centre (never over it), so the centre's own width is the room. */
  function measure() {
    if (!desktop()) return "single";
    const cs = getComputedStyle(root);
    const r = root.getBoundingClientRect();
    const left = r.left + parseFloat(cs.paddingLeft || "0");
    const right = r.right - parseFloat(cs.paddingRight || "0");
    return deckLayout(right - left, { desktop: true });
  }
  // Desktop: a keep/skip made anywhere else (a panel, the sidebar's rows) redraws the cards in place.
  const offVerdict = desktop() ? onVerdict(() => {
    if (mine) return;
    if (busy || dragging) dirty = true; // redrawn once the card settles (decide's finish, or the drag's end)
    else refresh();
  }) : null;
  let ro = null;
  if (desktop() && typeof ResizeObserver === "function") {
    tier = measure();
    let wait = null;
    const check = () => {
      if (busy || dragging) { clearTimeout(wait); wait = setTimeout(check, FLY_MS); return; } // never mid-swipe
      retier();
    };
    ro = new ResizeObserver(check);
    ro.observe(root);
    const strip = document.querySelector(".dash-panels");
    if (strip) ro.observe(strip);
  }

  // ---- keyboard ----
  const onKey = (e) => {
    if (e.defaultPrevented || document.querySelector(".sheet-wrap, .term-pop")) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName) || e.target?.isContentEditable) return;
    if (e.target?.closest?.(".dash-panels, .dash-side")) return; // desktop: keys inside a panel or the sidebar are theirs
    if (e.key === "Escape" && legendOpen && wide()) { e.preventDefault(); toggleLegend(false); keysBtn.focus(); return; }
    if (isSlots()) { slots.onKey(e); return; }
    const act = deckKeyAction(e, { desktop: desktop() });
    if (!act) return;
    // Enter on a control activates it; on the focused card the card's own handler opens it (one path each).
    if (act === "open" && e.target?.closest?.("a, button, summary, .card")) return;
    if (act === "legend" && !wide()) return;
    e.preventDefault();
    if (act === "keep") decide("right");
    else if (act === "skip") decide("left");
    else if (act === "maybe") decide("up");
    else if (act === "undo") undo();
    else if (act === "note") openNote();
    else if (act === "legend") toggleLegend();
    else if (act === "open" && top()) location.hash = `#/item/${encodeURIComponent(top().id)}`;
  };
  document.addEventListener("keydown", onKey);

  if (isSub() && !subSession()) filters.mode = "sessions";
  build();
  root.replaceChildren(view);
  return () => {
    document.removeEventListener("keydown", onKey);
    ro?.disconnect();
    offVerdict?.();
    wideTop?.dispose?.();
  };
}
