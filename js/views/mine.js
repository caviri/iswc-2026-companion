// My ISWC: what's on now / next (with room), then a per-day timeline of kept sessions and papers, with the
// maybes (swiped up) shown outlined among them, and a "Maybe" tab to review them: keep or skip each one.
// Grouping and clash rules are pure (js/model.js mineTimeline, maybeList; tests/app/mine.test.mjs).
import { h, icon, tagPill } from "../ui.js";
import { dayLong, dayShort, timeRange, placeOf, mineTimeline, defaultMineDay, nowNextFor, itemTag, maybeList, firmEntry } from "../model.js";
import { onVerdictWhile } from "../verdict-bus.js";

/** The item's type tag in front of a meta line's text. */
const tagged = (program, x, text) => [tagPill(itemTag(program, x), "row"), text ? h("span", {}, text) : null];

const href = (id) => `#/item/${encodeURIComponent(id)}`;
const MAX_SLOTS = 3;

function excerpt(text, n = 110) {
  const t = String(text).replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t;
}

function noteLine(store, id) {
  const n = store.note(id);
  return n ? h("span", { class: "mine-note" }, icon("note", { size: 14 }), h("span", {}, excerpt(n))) : null;
}

function placeText(program, s) {
  const p = placeOf(program, s);
  return [p.name, p.floor].filter(Boolean).join(" · ");
}

/** One session in the now/next block. */
function slotCard(program, store, s, label) {
  const kind = program.kinds[s.kind];
  const room = s.roomId && !s.allRooms ? program.byId.get(s.roomId) : null;
  const onMap = room?.floor != null; // e.g. Plenary has no known floor: no map link
  return h("article", { class: "slot", "--kind": kind?.color ?? "var(--sea)" },
    h("p", { class: "slot-label" }, label),
    h("a", { class: "slot-main", href: href(s.id) },
      h("span", { class: "slot-time" }, s.start),
      h("span", { class: "slot-text" },
        h("span", { class: "slot-title" }, s.title),
        h("span", { class: "slot-meta row-tagline" }, tagged(program, s, `${dayShort(s.day)} · ${timeRange(s)}`)))),
    h("div", { class: "slot-place" },
      icon("pin", { size: 18 }),
      h("span", {}, placeText(program, s)),
      onMap ? h("a", { class: "pill-btn", href: `#/map?room=${encodeURIComponent(room.id)}` }, icon("map", { size: 18 }), "Show on map") : null),
    noteLine(store, s.id));
}

function nowNextBlock(program, store, r) {
  const mine = r.scope === "picks";
  const more = (n) => (mine
    ? `and ${n} more of your picks at the same time, listed below.`
    : `and ${n} more at the same time. Use "My picks" or Browse to narrow down.`);
  const slots = (list, label) => [
    ...list.slice(0, MAX_SLOTS).map((s) => slotCard(program, store, s, label)),
    ...(list.length > MAX_SLOTS ? [h("p", { class: "now-sub" }, more(list.length - MAX_SLOTS))] : []),
  ];
  const today = r.iso.slice(0, 10);
  const first = (r.next[0] ?? r.now[0]);
  let head, body = [];
  if (r.confOver) {
    head = "That's a wrap";
    body = [h("p", { class: "now-sub" }, "ISWC 2026 has finished. Thanks for being there. Your picks and notes are below.")];
  } else if (!r.now.length && !r.next.length) {
    head = "Nothing left on your list";
    body = [h("p", { class: "now-sub" }, "You have no more kept items from here on.")];
  } else if (r.state === "waiting") {
    head = "Nothing on right now";
    body = [h("p", { class: "now-sub" }, `Your next pick is on ${dayLong(first.day)}:`), ...slots(r.next, "Next up")];
  } else if (r.state === "before") {
    head = "ISWC starts " + dayLong(program.days[0]?.date ?? first.day);
    body = [h("p", { class: "now-sub" }, mine ? `Your first kept session, ${dayLong(first.day)}:` : "The first sessions:"), ...slots(r.next, "First up")];
  } else if (r.state === "between-days") {
    const tomorrow = new Date(Date.parse(today + "T12:00:00Z") + 864e5).toISOString().slice(0, 10) === first.day;
    head = (tomorrow ? "Tomorrow, " : "Next: ") + dayLong(first.day);
    body = [h("p", { class: "now-sub" }, mine ? "Nothing more on your list today." : "Nothing more on the programme today."), ...slots(r.next, "First up")];
  } else {
    head = r.now.length ? "On now" : "Nothing on right now";
    body = [...slots(r.now, "Now"), ...slots(r.next, r.now.length ? "Next" : "Next up")];
  }
  return { head, body };
}

/** Promote a maybe to Keep, or Skip it: two small buttons under the row. */
function quickVerdict(store, x) {
  const what = x.paperIds ? "session" : "paper";
  return h("div", { class: "tl-quick" },
    h("button", { type: "button", class: "pill-btn keep", "aria-label": `Keep ${what}: ${x.title}`, onclick: () => store.swipe(x.id, "right") },
      icon("heart", { size: 16 }), "Keep"),
    h("button", { type: "button", class: "pill-btn skip", "aria-label": `Skip ${what}: ${x.title}`, onclick: () => store.swipe(x.id, "left") },
      icon("x", { size: 16 }), "Skip"));
}

function entryRow(program, store, e) {
  const s = e.session;
  const kind = program.kinds[s.kind];
  const where = placeText(program, s);
  const maybeOnly = !firmEntry(e) && e.maybe;
  const cls = ["tl-entry", e.kept ? "kept" : maybeOnly ? "maybe" : "context", e.clash ? "clash" : ""].filter(Boolean).join(" ");
  const ctx = !e.kept && !e.maybe
    ? (e.papers.length ? "Session of your kept paper" + (e.papers.length > 1 ? "s" : "") : "Session of your maybe paper" + (e.maybePapers.length > 1 ? "s" : ""))
    : null;
  return h("li", { class: cls, "--kind": kind?.color ?? "var(--sea)" },
    h("a", { class: "tl-main", href: href(s.id) },
      h("span", { class: "tl-time" }, h("strong", {}, s.start), s.end && /^\d/.test(s.end) ? h("span", {}, s.end) : null),
      h("span", { class: "tl-text" },
        h("span", { class: "tl-title" }, s.title),
        h("span", { class: "tl-meta row-tagline" }, tagged(program, s, where)),
        e.maybe ? h("span", { class: "maybe-tag" }, icon("maybe", { size: 13 }), "Maybe") : null,
        e.clash ? h("span", { class: "clash-badge" }, "Clashes with another pick") : null,
        e.nearKept ? h("span", { class: "near-kept" }, "Overlaps one of your picks") : null,
        ctx ? h("span", { class: "tl-ctx" }, ctx) : null,
        noteLine(store, s.id))),
    e.maybe ? quickVerdict(store, s) : null,
    e.papers.length || e.maybePapers.length
      ? h("ul", { class: "tl-papers" }, e.papers.map((p) => paperRow(program, store, p)), e.maybePapers.map((p) => paperRow(program, store, p, true)))
      : null);
}

function paperRow(program, store, p, maybe = false) {
  return h("li", {}, h("a", { class: `tl-paper${maybe ? " maybe" : ""}`, href: href(p.id) },
    maybe ? icon("maybe", { size: 15 }) : icon("heart", { size: 15, fill: true }),
    h("span", { class: "tl-text" },
      h("span", { class: "tl-ptitle" }, p.title),
      h("span", { class: "tl-meta row-tagline" }, tagged(program, p, [p.talk ? timeRange(p.talk) : "", maybe ? "Maybe" : ""].filter(Boolean).join(" · "))),
      noteLine(store, p.id))),
  maybe ? quickVerdict(store, p) : null);
}

/** The "Maybe" tab: every maybe in time order, each with Keep / Skip. */
function maybeRows(program, store) {
  const rows = maybeList(program, store.upIds());
  if (!rows.length) {
    return h("div", { class: "empty mine-empty" },
      h("h2", {}, "No maybes left"),
      h("p", {}, "Swipe a card up in the deck when you can't decide yet. It waits here until you keep or skip it."));
  }
  return h("ul", { class: "tl-list" }, rows.map(({ item, session }) => h("li", { class: "tl-entry maybe", "--kind": session ? program.kinds[session.kind]?.color ?? "var(--sea)" : "var(--sea)" },
    h("a", { class: "tl-main", href: href(item.id) },
      h("span", { class: "tl-time" }, session ? [h("strong", {}, session.start), h("span", {}, dayShort(session.day))] : icon("maybe", { size: 16 })),
      h("span", { class: "tl-text" },
        h("span", { class: "tl-title" }, item.title),
        h("span", { class: "tl-meta row-tagline" }, tagged(program, item, session ? placeText(program, session) : "No timetable slot listed")),
        noteLine(store, item.id))),
    quickVerdict(store, item))));
}

let lastTab = "timeline"; // the Timeline / Maybe tab, kept while the page lives (a redraw keeps it)

/**
 * renderMine(root, program, store, appClock) -> cleanup() (unsubscribes from the clock).
 * appClock: js/clock.js's clock (now(), subscribe()); Rome time, redrawn on every minute.
 */
export function renderMine(root, program, store, appClock, params = {}) {
  const clock = () => appClock.now();

  let timeline = mineTimeline(program, store.rightIds(), store.upIds());
  const hasPicks = timeline.total > 0 || timeline.maybes > 0;
  if (params.show === "maybe") lastTab = "maybe";
  if (!timeline.maybes) lastTab = "timeline";
  let scope = timeline.total > 0 ? "picks" : "all"; // no picks yet (maybes are not picks): show the whole programme
  let day = defaultMineDay(program, timeline, clock());

  const nowBox = h("section", { class: "now-box", "aria-label": "On now and next" });
  const tabs = h("div", { class: "seg mine-tabs", role: "group", "aria-label": "Show" });
  const dayBar = h("div", { class: "chip-row", role: "group", "aria-label": "Day" });
  const dayBox = h("div", { class: "tl-day" });
  const restBox = h("div", {});

  function drawNow() {
    const r = nowNextFor(program, timeline, clock(), scope);
    const { head, body } = nowNextBlock(program, store, r);
    const toggle = h("div", { class: "seg", role: "group", "aria-label": "Show" },
      ["picks", "all"].map((k) => h("button", {
        type: "button", class: "seg-btn", "aria-pressed": String(scope === k),
        onclick: () => { scope = k; drawNow(); },
      }, k === "picks" ? "My picks" : "Everything")));
    nowBox.replaceChildren(h("div", { class: "now-head" }, h("h2", { class: "now-title" }, head), toggle), ...body);
  }

  function drawTabs() {
    const n = timeline.maybes;
    tabs.hidden = !n;
    tabs.replaceChildren(...[["timeline", "Timeline"], ["maybe", `Maybe ${n}`]].map(([k, label]) => h("button", {
      type: "button", class: "seg-btn", "aria-pressed": String(lastTab === k),
      onclick: () => { lastTab = k; drawRest(); },
    }, label)));
  }

  function drawDay() {
    dayBar.replaceChildren(...timeline.days.map((d) => {
      const firm = d.entries.filter(firmEntry).length;
      const n = d.entries.length;
      const maybes = n - firm;
      return h("button", {
        type: "button", class: "chip", "aria-pressed": String(d.date === day),
        "aria-label": `${dayLong(d.date)}, ${firm} ${firm === 1 ? "session" : "sessions"} kept${maybes ? `, ${maybes} maybe` : ""}`,
        onclick: () => { day = d.date; drawDay(); },
      }, dayShort(d.date), n ? h("span", { class: "chip-count" }, String(n)) : null);
    }));
    const d = timeline.days.find((x) => x.date === day);
    const label = program.days.find((x) => x.date === day);
    dayBox.replaceChildren(
      h("h2", { class: "tl-day-title" }, label ? dayLong(label.date) : "", label?.subtitle ? h("span", {}, label.subtitle) : null),
      d?.entries.length
        ? h("ul", { class: "tl-list" }, d.entries.map((e) => entryRow(program, store, e)))
        : h("p", { class: "tl-none" }, "Nothing kept for this day. Swipe right in the deck to add sessions."));
  }

  const unschedRow = (p, maybe) => h("li", { class: `tl-entry ${maybe ? "maybe" : "kept"}`, "--kind": "var(--sea)" },
    h("a", { class: "tl-main", href: href(p.id) },
      h("span", { class: "tl-time" }, maybe ? icon("maybe", { size: 16 }) : icon("heart", { size: 16, fill: true })),
      h("span", { class: "tl-text" },
        h("span", { class: "tl-title" }, p.title),
        h("span", { class: "tl-meta row-tagline" }, tagged(program, p, "")),
        maybe ? h("span", { class: "maybe-tag" }, icon("maybe", { size: 13 }), "Maybe") : null,
        noteLine(store, p.id))),
    maybe ? quickVerdict(store, p) : null);

  function drawRest() {
    const empty = !timeline.total && !timeline.maybes;
    if (empty) {
      restBox.replaceChildren(h("div", { class: "empty mine-empty" },
        h("h2", {}, "Nothing kept yet"),
        h("p", {}, "Swipe right on sessions and papers in the deck (up for maybe). They collect here as a timeline, with what's on now and next."),
        h("div", { class: "empty-actions" }, h("a", { class: "pill-btn primary", href: "#/deck" }, icon("deck", { size: 18 }), "Open the deck"))));
      return;
    }
    drawTabs();
    if (lastTab === "maybe") { restBox.replaceChildren(tabs, maybeRows(program, store)); return; }
    drawDay();
    const un = [...timeline.unscheduled.map((p) => unschedRow(p, false)), ...timeline.unscheduledMaybe.map((p) => unschedRow(p, true))];
    restBox.replaceChildren(tabs, dayBar, dayBox, ...(un.length ? [h("section", { class: "tl-unsched" },
      h("h2", { class: "tl-day-title" }, "Unscheduled picks", h("span", {}, "No timetable slot listed")),
      h("ul", { class: "tl-list" }, un))] : []));
  }

  drawNow();
  drawRest();

  const view = h("section", { class: "view mine-view" }, h("h1", { class: "view-title" }, "My ISWC"), nowBox, restBox);
  root.replaceChildren(view);
  // A maybe kept or skipped here (or anywhere) redraws the lists in place, keeping the day, tab and scroll.
  const offVerdict = onVerdictWhile(view, () => {
    timeline = mineTimeline(program, store.rightIds(), store.upIds());
    if (!timeline.maybes) lastTab = "timeline";
    drawNow();
    drawRest();
  });

  // Redraw now/next on every clock minute; when the day changes, that day's tab opens.
  let today = clock().slice(0, 10);
  const off = appClock.subscribe((s) => {
    drawNow();
    if (s.day !== today) {
      today = s.day;
      const d = defaultMineDay(program, timeline, s.iso);
      if (hasPicks && d !== day) { day = d; drawDay(); }
    }
  });
  return () => { off(); offVerdict(); };
}
