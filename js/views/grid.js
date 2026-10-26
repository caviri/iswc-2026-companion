// Timetable (#/grid?day=YYYY-MM-DD): one day as a grid, rooms across and time down. Every session and workshop
// sits in its room as a block sized by its time, listing what happens inside (a parallel session's papers, a
// workshop's published programme); breaks and all-rooms sessions run across as bands. Your kept and maybe
// picks are marked, "Only my picks" fades the rest, and a line marks now. Pure layout: js/grid-model.js.
import { h, icon } from "../ui.js";
import { dayShort, timeRange, VERDICT_LABEL } from "../model.js";
import { replaceRoute } from "../route-state.js";
import { dayGrid, nowOffset } from "../grid-model.js";
import { onVerdictWhile } from "../verdict-bus.js";

const PX = 1.6; // pixels per minute
const KEY = "iswc26:grid"; // localStorage: { mine }, a per-viewer convenience
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) ?? "{}") ?? {}; } catch { return {}; } };
const save = (st) => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch { /* fine without */ } };
const href = (id) => `#/item/${encodeURIComponent(id)}`;

function block(program, store, b) {
  const s = b.session;
  const v = store.verdict(s.id) ?? (s.paperIds.some((id) => store.verdict(id) === "right") ? "inside" : null);
  const color = program.kinds[s.kind]?.color ?? "var(--sea)";
  return h("a", {
    class: `tt-block${v ? ` v-${v}` : ""}`, href: href(s.id), "--kind": color,
    "--col": b.col, "--lane": b.lane, "--lanes": b.lanes, // custom properties go as attributes (h() sets them)
    style: { top: `${b.top * PX}px`, height: `${b.height * PX - 3}px` },
    "aria-label": `${s.title}, ${timeRange(s)}${v === "right" ? ", kept" : v === "up" ? ", maybe" : ""}`,
  },
    h("span", { class: "tt-when" }, timeRange(s),
      v === "right" ? h("span", { class: "tt-mark", title: VERDICT_LABEL.right }, icon("heart", { size: 13, fill: true }))
        : v === "up" ? h("span", { class: "tt-mark maybe", title: VERDICT_LABEL.up }, icon("maybe", { size: 13 }))
          : v === "inside" ? h("span", { class: "tt-mark", title: "Holds a paper you kept" }, icon("heart", { size: 13 })) : null),
    h("strong", { class: "tt-title" }, s.title),
    b.lines.length ? h("ol", { class: "tt-lines" }, b.lines.map((l) => h("li", { class: l.id && store.verdict(l.id) === "right" ? "kept" : "" },
      h("span", { class: "tt-t" }, l.time), h("span", {}, l.title)))) : null);
}

function band(program, b) {
  const s = b.session;
  return h("a", { class: `tt-band k-${s.kind}`, href: href(s.id), style: { top: `${b.top * PX}px`, height: `${Math.max(b.height * PX - 2, 18)}px` } },
    h("span", { class: "tt-band-t" }, s.start), h("span", { class: "tt-band-name" }, s.title));
}

/** renderGrid(root, program, store, clock, params) -> cleanup() */
export function renderGrid(root, program, store, clock, params = {}) {
  const st = { mine: false, ...load() };
  const days = program.days.map((d) => d.date);
  const today = clock.now().slice(0, 10);
  let day = days.includes(params.day) ? params.day : days.includes(today) ? today : days[0];

  const seg = h("div", { class: "seg tt-days", role: "group", "aria-label": "Day" });
  const mineBtn = h("button", { type: "button", class: "pill-btn tt-mine", "aria-pressed": String(st.mine) }, icon("heart", { size: 16 }), "Only my picks");
  const scroller = h("div", { class: "tt-scroll", tabindex: "0", "aria-label": "Timetable" });
  const nowLine = h("div", { class: "tt-now", hidden: true }, h("span", {}, ""));
  let lastKey = "";

  const drawNow = () => {
    const g = scroller.__grid;
    const off = g ? nowOffset(g, clock.now()) : null;
    nowLine.hidden = off == null;
    if (off != null) { nowLine.style.top = `${off * PX}px`; nowLine.firstChild.textContent = clock.now().slice(11, 16); }
  };

  const draw = () => {
    seg.replaceChildren(...days.map((d) => h("button", { type: "button", class: "seg-btn", "aria-pressed": String(d === day),
      onclick: () => { day = d; replaceRoute(`#/grid?day=${d}`); draw(); scroller.scrollTo({ top: 0, left: 0 }); } }, dayShort(d))));
    mineBtn.setAttribute("aria-pressed", String(st.mine));
    const g = dayGrid(program, day);
    scroller.__grid = g;
    const grid = h("div", { class: `tt${st.mine ? " only-mine" : ""}`, "--cols": g.rooms.length, "--h": `${g.height * PX}px`, "--hour": `${60 * PX}px` },
      h("div", { class: "tt-corner" }),
      ...g.rooms.map((r) => h("div", { class: "tt-room" }, h("strong", {}, r.name), r.floor != null ? h("span", {}, `Floor ${r.floor < 0 ? "−" + -r.floor : r.floor}`) : null)),
      h("div", { class: "tt-times" }, g.hours.map((x) => h("span", { style: { top: `${x.top * PX}px` } }, x.label))),
      h("div", { class: "tt-body" }, g.bands.map((b) => band(program, b)), g.blocks.map((b) => block(program, store, b)), nowLine));
    scroller.replaceChildren(grid);
    drawNow();
  };

  mineBtn.addEventListener("click", () => { st.mine = !st.mine; save(st); draw(); });
  draw();
  // Scroll to now (or the first session) once.
  requestAnimationFrame(() => {
    const off = nowOffset(scroller.__grid, clock.now());
    if (off != null) scroller.scrollTop = Math.max(0, off * PX - 120);
  });
  const offVerdict = onVerdictWhile(scroller, () => draw());
  const offClock = clock.subscribe(() => { const k = clock.now().slice(0, 16); if (k !== lastKey) { lastKey = k; drawNow(); } });

  root.replaceChildren(h("section", { class: "view grid-view" },
    h("div", { class: "view-head" }, h("h1", { class: "view-title" }, "Timetable")),
    h("p", { class: "tt-intro" }, "Every session and workshop by room. Tap a block to open it; workshops list their own published programme."),
    h("div", { class: "tt-tools" }, seg, mineBtn),
    scroller));
  return () => { offClock(); offVerdict?.(); };
}
