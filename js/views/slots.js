// Deck "Time slots" mode: one card per time slot showing every session that starts then, grouped by session
// (room, type tag, title, then its papers or its description). Tap a session to select it, then swipe the
// card right (or press Keep) to keep it, which skips the rest of the slot; each session also has Maybe and
// Keep buttons. Swipe left = none of these, up = decide later. The card scrolls inside; attachSwipe
// (deck-cards.js) tells a swipe from a scroll. Pure parts: js/slots-model.js.
import { h, icon, toast, reducedMotion, tagPill } from "../ui.js";
import { dayLong, placeOf, itemTag, THRESHOLD, SWIPE_MAX, UP_THRESHOLD, UP_MAX } from "../model.js";
import {
  slotsToDecide, slotAt, pickChanges, untilLabel, noneChanges, maybeChanges, defaultSelection,
  slotSwipe, moveSelection, slotKeyAction,
} from "../slots-model.js";
import { attachSwipe, stamps } from "./deck-cards.js";

const OUT_MS = 300;
// Page-lifetime state, like the deck's undo history: where we are and what to undo ([{ changes: [{id, prev}], at }]).
const history = [];
let cursor = null;
const scrollPos = new Map(); // slot key -> scrollTop of its card's list

function groupBody(program, s) {
  if (s.speaker || s.talkTitle) {
    return h("p", { class: "sgroup-sub" }, [s.speaker, s.talkTitle].filter(Boolean).join(": "));
  }
  if (s.paperIds.length) {
    const ps = s.paperIds.map((id) => program.byId.get(id)).filter(Boolean);
    return h("div", { class: "sgroup-papers" },
      h("p", { class: "sgroup-sub" }, icon("layers", { size: 14 }), `${ps.length} ${ps.length === 1 ? "paper" : "papers"}`),
      h("ol", {}, ps.map((p) => h("li", {}, p.title))));
  }
  const text = s.description || s.organizers;
  return text ? h("p", { class: "sgroup-desc" }, text) : null;
}

/**
 * slotPanel(program, store, filters, { onCount, emptyActions, onLegend, wide }) -> { body, actions, refresh, undo, onKey }
 * body and actions go where the deck shows its stack and buttons; filters.day limits the slots.
 */
export function slotPanel(program, store, filters, { onCount, emptyActions, onLegend = null, wide = () => false }) {
  let busy = false;
  let slot = null;
  let selected = null;
  let card = null;
  const body = h("div", { class: "slots-body" });
  const btn = (cls, label, name, onclick, fill) =>
    h("button", { class: `round-btn ${cls}`, type: "button", "aria-label": label, title: label, onclick }, icon(name, { fill, size: cls.includes("big") ? 30 : 22 }));
  const undoBtn = btn("undo", "Undo", "undo", () => undo());
  const noneBtn = btn("big skip", "None of these", "x", () => act("none"));
  const laterBtn = btn("later", "Decide later", "clock", () => act("later"));
  const keepBtn = btn("big keep", "Keep the selected session", "heart", () => act("keep"), true);
  const actions = h("div", { class: "deck-actions slots-actions" }, undoBtn, noneBtn, laterBtn, keepBtn);

  function refresh() {
    const slots = slotsToDecide(program, store, { day: filters.day });
    slot = slotAt(slots, cursor);
    onCount(`${slots.length} ${slots.length === 1 ? "slot" : "slots"} to decide`);
    undoBtn.disabled = !history.length;
    noneBtn.disabled = laterBtn.disabled = !slot;
    laterBtn.disabled = !slot || slots.length < 2;
    body.classList.toggle("slots-wide", wide());
    if (!slot) {
      card = null;
      selected = null;
      keepBtn.disabled = true;
      body.replaceChildren(h("div", { class: "empty" },
        h("div", { class: "empty-mark", "aria-hidden": "true" }, icon("check", { size: 34 })),
        h("h2", {}, filters.day ? `No open time slots on ${dayLong(filters.day)}` : "Every time slot is decided"),
        h("p", {}, "Slots where you kept a session, ruled them all out, or are already busy elsewhere don't come back here. A maybe keeps a slot open."),
        h("div", { class: "empty-actions" }, emptyActions())));
      return;
    }
    if (!slot.open.some((s) => s.id === selected)) selected = defaultSelection(slot, store);
    const hadFocus = body.contains(document.activeElement);
    card = slotCard();
    body.replaceChildren(card);
    const list = card.querySelector(".slotcard-list");
    list.scrollTop = scrollPos.get(slot.key) ?? 0;
    list.addEventListener("scroll", () => { if (slot) scrollPos.set(slot.key, list.scrollTop); }, { passive: true });
    if (hadFocus) card.focus({ preventScroll: true });
    syncSelection();
  }

  function slotCard() {
    const n = slot.open.length;
    const meta = [`${n} ${n === 1 ? "session" : "sessions"} at once`, slot.ruledOut ? `${slot.ruledOut} ruled out` : null, slot.maybe ? `${slot.maybe} maybe` : null]
      .filter(Boolean).join(" · ");
    const el = h("article", {
      class: "card slotcard", tabindex: "0", "--kind": "var(--sea)",
      "aria-label": `${slot.start}, ${dayLong(slot.day)}: ${meta}. Arrow keys choose a session, Enter keeps it, up arrow marks it maybe, S for none of these, down arrow for later.`,
    },
    h("header", { class: "slotcard-head" },
      h("p", { class: "slots-when" }, h("strong", {}, slot.start), h("span", {}, dayLong(slot.day))),
      h("p", { class: "slots-meta" }, meta),
      h("p", { class: "slots-hint" }, "Tap a session to choose it, then swipe right to keep it. Left: none of these. Up: later.")),
    h("div", { class: "slotcard-list" }, h("ul", { class: "sgroups", role: "listbox", "aria-label": "Sessions in this slot" }, slot.open.map((s) => group(s)))),
    stamps({ keep: "Keep", skip: "None", maybe: "Later" }));
    attachDrag(el);
    return el;
  }

  function group(s) {
    const kind = program.kinds[s.kind] ?? { label: s.kind, color: "var(--sea)" };
    const p = placeOf(program, s);
    const until = untilLabel(slot, s);
    const maybe = store.verdict(s.id) === "up";
    const note = store.note(s.id) ? h("span", { class: "has-note", title: "Has a note" }, icon("note", { size: 14 })) : null;
    const maybeB = h("button", {
      type: "button", class: "sgroup-btn maybe", "aria-pressed": String(maybe), "aria-label": maybe ? `Clear maybe: ${s.title}` : `Maybe: ${s.title}`,
      onclick: (e) => { e.stopPropagation(); toggleMaybe(s.id); },
    }, icon("maybe", { size: 18 }), "Maybe");
    const keepB = h("button", {
      type: "button", class: "sgroup-btn keep", "aria-label": `Keep ${s.title}`,
      onclick: (e) => { e.stopPropagation(); selected = s.id; act("keep"); },
    }, icon("heart", { size: 18 }), "Keep");
    return h("li", { class: `sgroup${maybe ? " is-maybe" : ""}`, role: "option", "aria-selected": "false", "data-id": s.id, "--kind": kind.color },
      h("div", { class: "sgroup-top" },
        h("span", { class: "sgroup-room" }, icon("pin", { size: 15 }), h("strong", {}, p.name), p.floor ? h("span", {}, p.floor) : null),
        h("a", { class: "sgroup-link", href: `#/item/${encodeURIComponent(s.id)}`, "aria-label": `Details: ${s.title}` }, "Details")),
      h("p", { class: "sgroup-kind" }, tagPill(itemTag(program, s), "row"), maybe ? h("span", { class: "maybe-tag" }, "Maybe") : null, until ? h("span", {}, until) : null, note),
      h("h3", { class: "sgroup-title" }, s.title),
      groupBody(program, s),
      h("div", { class: "sgroup-actions" }, maybeB, keepB));
  }

  function syncSelection() {
    if (!card) return;
    card.querySelectorAll(".sgroup").forEach((g) => g.setAttribute("aria-selected", String(g.dataset.id === selected)));
    keepBtn.disabled = !selected;
    const sel = slot?.open.find((s) => s.id === selected);
    keepBtn.setAttribute("aria-label", sel ? `Keep ${sel.title}` : "Keep the selected session (choose one first)");
    keepBtn.title = keepBtn.getAttribute("aria-label");
  }

  function select(id, { scroll = false } = {}) {
    selected = id;
    syncSelection();
    if (scroll) card?.querySelector(`.sgroup[aria-selected="true"]`)?.scrollIntoView?.({ block: "nearest", behavior: reducedMotion() ? "auto" : "smooth" });
  }

  // ---- deciding ----
  /** Apply verdicts (v null clears one) and remember what they replaced, for undo. */
  const record = (changes) => {
    const entry = { changes: changes.map((c) => ({ id: c.id, prev: store.verdict(c.id) })), at: slot.at };
    changes.forEach((c) => (c.v ? store.swipe(c.id, c.v) : store.unswipe(c.id)));
    history.push(entry);
  };

  /** Fly the card out (right / left / up), then draw the next slot. */
  function flyOut(dir, then) {
    busy = true;
    const done = () => { busy = false; then(); };
    if (reducedMotion() || !card) { done(); return; }
    const w = body.clientWidth || 360;
    card.classList.remove("dragging");
    card.classList.add("flying", dir === "right" ? "show-keep" : dir === "up" ? "show-maybe" : "show-skip");
    card.style.transform = dir === "up" ? `translateY(${-(body.clientHeight || 600) * 1.3}px)`
      : `translate(${(dir === "right" ? 1 : -1) * w * 1.5}px, 40px) rotate(${dir === "right" ? 20 : -20}deg)`;
    card.style.opacity = "0";
    setTimeout(done, OUT_MS);
  }

  function nudge(text = "Tap a session first, then swipe right (or press Keep).") {
    toast(text);
    card?.classList.remove("nudge");
    void card?.offsetWidth; // restart the animation
    card?.classList.add("nudge");
  }

  function act(what) {
    if (busy || !slot) return;
    if (what === "keep") {
      const s = slot.open.find((x) => x.id === selected);
      if (!s) { nudge(); return; }
      const was = slot;
      record(pickChanges(slot, s.id));
      cursor = was.at;
      scrollPos.delete(was.key);
      flyOut("right", () => { selected = null; refresh(); toast(`Kept ${placeOf(program, s).name}: ${s.title}`, { action: "Undo", onAction: undo }); });
    } else if (what === "none") {
      const was = slot;
      record(noneChanges(slot));
      cursor = was.at;
      scrollPos.delete(was.key);
      flyOut("left", () => { selected = null; refresh(); });
    } else if (what === "later") {
      const slots = slotsToDecide(program, store, { day: filters.day });
      if (slots.length < 2) { toast("This is the only open slot."); return; }
      cursor = (slots.find((x) => x.at > slot.at) ?? slots[0])?.at ?? null;
      flyOut("up", () => { selected = null; refresh(); });
    }
  }

  function toggleMaybe(id) {
    if (busy || !slot) return;
    record(maybeChanges(store, id));
    cursor = slot.at;
    selected = id;
    refresh(); // the slot stays: a maybe never decides it
  }

  function undo() {
    if (busy) return;
    const last = history.pop();
    if (!last) return;
    last.changes.forEach((c) => (c.prev ? store.swipe(c.id, c.prev) : store.unswipe(c.id)));
    cursor = last.at;
    refresh();
  }

  // ---- the card's gestures ----
  function attachDrag(el) {
    const set = (dx, dy, mode) => {
      const w = el.offsetWidth || 1, hgt = el.offsetHeight || 1;
      if (mode === "up") {
        el.style.transform = `translateY(${dy}px)`;
        el.style.setProperty("--p-maybe", String(Math.max(0, Math.min(1, -dy / Math.min(hgt * UP_THRESHOLD, UP_MAX)))));
        return;
      }
      const p = Math.max(-1, Math.min(1, dx / Math.min(w * THRESHOLD, SWIPE_MAX)));
      el.style.transform = `translate(${dx}px, ${dy * 0.2}px) rotate(${(dx / w) * 10}deg)`;
      // No selection: the keep stamp stays hidden (a right swipe will only ask to choose).
      el.style.setProperty("--p-keep", String(selected ? Math.max(0, p) : 0));
      el.style.setProperty("--p-skip", String(Math.max(0, -p)));
    };
    const reset = () => {
      el.classList.remove("dragging");
      el.style.transform = "";
      for (const v of ["--p-keep", "--p-skip", "--p-maybe"]) el.style.removeProperty(v);
    };
    attachSwipe(el, {
      scrollSel: ".slotcard-list",
      edgeSel: ".slotcard-head",
      ignoreSel: ".sgroup-btn",
      isBusy: () => busy,
      onMove: set,
      onRelease: (outcome) => {
        const what = slotSwipe(outcome, selected);
        if (what === "keep" || what === "none" || what === "later") {
          if (what === "later" && slotsToDecide(program, store, { day: filters.day }).length < 2) { reset(); toast("This is the only open slot."); return; }
          act(what);
        } else {
          reset();
          if (what === "nudge") nudge();
        }
      },
      onTap: (e) => {
        if (e.target.closest?.("a, button")) return; // Details link, Maybe / Keep buttons
        const g = e.target.closest?.(".sgroup");
        if (g) select(g.dataset.id === selected ? null : g.dataset.id);
      },
    });
  }

  /** Keys while in this mode (the deck forwards them): see SLOT_KEYS. */
  function onKey(e) {
    const k = slotKeyAction(e);
    if (!k) return;
    if (k.act === "keep" && e.key === "Enter" && e.target?.closest?.("a, button")) return; // Enter on a control is the control's
    if (k.act === "legend") { if (onLegend) { e.preventDefault(); onLegend(); } return; }
    e.preventDefault();
    if (k.act === "undo") undo();
    else if (!slot) return;
    else if (k.act === "move") { select(moveSelection(slot, selected, k.step), { scroll: true }); if (!body.contains(document.activeElement)) card?.focus({ preventScroll: true }); }
    else if (k.act === "maybe") { if (selected) toggleMaybe(selected); else nudge("Choose a session first (← →), then ↑ marks it maybe."); }
    else if (k.act === "keep") { if (selected) act("keep"); else nudge("Choose a session first (← →), then Enter keeps it."); }
    else act(k.act);
  }

  return { body, actions, refresh, undo, onKey };
}
