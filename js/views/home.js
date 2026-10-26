// Home: the first screen. A hero drawn from what's on, the day and your progress; what's happening
// now and next (your picks or everything); then sliders: your picks, "Tonight in Bari" (when the city
// guide lists concerts today), keynotes, workshops, discover, clusters, topics, open source & data.
// Follows js/clock.js (Rome time), redrawn on every new minute.
import { h, icon, tagPill } from "../ui.js";
import { dayShort, dayLong, timeRange, placeOf, itemTag, verdictSummary, whenOf } from "../model.js";
import {
  heroModel, whatsOn, picksAhead, keynoteCards, workshopsAhead, discover, homeStats,
  featuredItem, pastKey,
} from "../home-model.js";
import { exploreModel } from "../explore-model.js";
import { thumbSVG } from "../thumbs.js";
import { onVerdict } from "../verdict-bus.js";
import { researchHighlights, federatedQuery, explorerHref } from "../research-model.js";
import { stars, statusBadge } from "./research.js";
import { imgEl, logoChip, photoCredit } from "./images.js";
import { placeHero, dedupeTitle, imgUrl } from "../images-model.js";
import { demoWhen } from "../rete-model.js";
import { bariGuide } from "./bari.js";
import { tonight, walkLabel } from "../bari-model.js";

const href = (id) => `#/item/${encodeURIComponent(id)}`;
const plural = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;
const SCOPE_KEY = "iswc26:home-scope";
const loadScope = () => { try { return sessionStorage.getItem(SCOPE_KEY); } catch { return null; } };
const saveScope = (s) => { try { sessionStorage.setItem(SCOPE_KEY, s); } catch { /* not kept */ } };

/** "in 15 min", "in 2 h 5 min", "on Tue 27" */
function inText(min, session) {
  if (min <= 0) return "starting now";
  if (min < 60) return `in ${min} min`;
  if (min < 12 * 60) return `in ${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ""}`;
  return `on ${dayShort(session.day)}`;
}
const leftText = (min) => (min < 60 ? `${min} min left` : `${Math.floor(min / 60)} h ${min % 60} min left`);
const whenWord = (w, date) => (w === "today" ? "today" : w === "tomorrow" ? "tomorrow" : dayLong(date));

function art(item, program, size = "hero", cls = "hm-art") {
  return h("span", { class: cls, "aria-hidden": "true" }, thumbSVG(item, program, { size }));
}

function placeLine(program, s, { map = false } = {}) {
  const p = placeOf(program, s);
  const room = s.roomId && !s.allRooms ? program.byId.get(s.roomId) : null;
  return h("p", { class: "hm-place" },
    icon("pin", { size: 16 }),
    h("span", {}, [p.name, p.floor].filter(Boolean).join(", ")),
    map && room?.floor != null
      ? h("a", { class: "pill-btn hm-map", href: `#/map?room=${encodeURIComponent(room.id)}` }, icon("map", { size: 16 }), "Show on map")
      : null);
}

/**
 * A session card for the sliders. variant: "now" (progress, map), "next" (starts in, map), "plain".
 * The title link stretches over the card; the map / person links sit above it.
 */
function sessionCard(program, store, s, { variant = "plain", info = null, past = false, note = null } = {}) {
  const kind = program.kinds?.[s.kind];
  const kept = store.verdict(s.id) === "right";
  const maybe = store.verdict(s.id) === "up";
  const prog = variant === "now" ? h("span", { class: "hm-prog", "aria-hidden": "true" }, h("i")) : null;
  const status = variant !== "plain" ? h("span", { class: "hm-status" }) : null;
  const card = h("article", { class: `hm-card hm-${variant}${past ? " past" : ""}${s.kind === "break" ? " is-break" : ""}`, "--kind": kind?.color ?? "var(--sea)" },
    art(s, program),
    h("div", { class: "hm-body" },
      h("p", { class: "hm-when" },
        h("strong", {}, timeRange(s)),
        status,
        kept ? h("span", { class: "hm-kept", "aria-label": "Kept" }, icon("heart", { size: 14, fill: true }))
          : maybe ? h("span", { class: "hm-maybe", "aria-label": "Maybe" }, icon("maybe", { size: 14 })) : null),
      prog,
      h("h3", { class: "hm-title" }, h("a", { class: "hm-link", href: href(s.id) }, s.title)),
      kindLine(program, s, note),
      placeLine(program, s, { map: variant !== "plain" })));
  card.update = (x) => {
    if (variant === "now") {
      status.textContent = leftText(x.minsLeft);
      prog.firstChild.style.width = `${Math.round(x.pct * 100)}%`;
    } else if (variant === "next") status.textContent = inText(x.inMin, s);
  };
  if (info) card.update(info);
  return card;
}

/** The type tag line of a Home card (no tag when the title only repeats it, e.g. "Town Hall"), then `note`. */
function kindLine(program, x, note = null) {
  const tag = itemTag(program, x);
  const show = tag && dedupeTitle(tag.label, x.title);
  return show || note ? h("p", { class: "hm-kind row-tagline" }, show ? tagPill(tag, "row") : null, note ? h("span", {}, note) : null) : null;
}

/** A discover card for a session or paper, with keep / skip right there. */
function discoverCard(program, store, x, onChange) {
  if (Array.isArray(x.paperIds)) {
    const c = sessionCard(program, store, x, { note: dayShort(x.day) });
    c.querySelector(".hm-body").append(verdictBtns(store, x, onChange, c));
    return c;
  }
  const s = x.sessionId ? program.byId.get(x.sessionId) : null;
  const card = h("article", { class: "hm-card hm-paper", "--kind": "var(--sea)" },
    art(x, program),
    h("div", { class: "hm-body" },
      h("p", { class: "hm-when" }, h("strong", {}, s ? `${dayShort(s.day)} ${whenOf(program, x).start}` : "Not in the timetable"), null),
      h("h3", { class: "hm-title" }, h("a", { class: "hm-link", href: href(x.id) }, x.title)),
      kindLine(program, x),
      x.authors?.length ? h("p", { class: "hm-authors" }, x.authors.join(", ")) : null));
  card.querySelector(".hm-body").append(verdictBtns(store, x, onChange, card));
  return card;
}

function verdictBtns(store, x, onChange, card) {
  const what = Array.isArray(x.paperIds) ? "session" : "paper";
  const keep = h("button", { type: "button", class: "quick keep" }, icon("heart", { size: 20 }));
  const maybe = h("button", { type: "button", class: "quick maybe" }, icon("maybe", { size: 20 }));
  const skip = h("button", { type: "button", class: "quick skip" }, icon("x", { size: 20 }));
  const sync = () => {
    const v = store.verdict(x.id);
    keep.setAttribute("aria-pressed", String(v === "right"));
    maybe.setAttribute("aria-pressed", String(v === "up"));
    skip.setAttribute("aria-pressed", String(v === "left"));
    maybe.setAttribute("aria-label", v === "up" ? `Clear maybe on this ${what}` : `Maybe: decide on this ${what} later`);
    keep.setAttribute("aria-label", v === "right" ? `Remove ${what} from my picks` : `Keep ${what}`);
    skip.setAttribute("aria-label", v === "left" ? `Unskip ${what}` : `Skip ${what}`);
    keep.querySelector("path")?.setAttribute("fill", v === "right" ? "currentColor" : "none");
    card.classList.toggle("v-left", v === "left");
    card.classList.toggle("v-right", v === "right");
    card.classList.toggle("v-up", v === "up");
  };
  const toggle = (dir) => () => {
    if (store.verdict(x.id) === dir) store.unswipe(x.id); else store.swipe(x.id, dir);
    sync();
    onChange();
  };
  keep.addEventListener("click", toggle("right"));
  maybe.addEventListener("click", toggle("up"));
  skip.addEventListener("click", toggle("left"));
  sync();
  return h("div", { class: "hm-verdict" }, skip, maybe, keep);
}

function keynoteCard(program, k) {
  const s = k.session;
  return h("article", { class: `hm-card hm-keynote${k.past ? " past" : ""}`, "--kind": program.kinds?.keynote?.color ?? "var(--sea)" },
    art(s, program),
    h("div", { class: "hm-body" },
      h("p", { class: "hm-when" }, h("strong", {}, `${dayShort(s.day)} ${s.start}`), k.past ? h("span", { class: "hm-status" }, "Done") : null),
      k.speaker
        ? h("p", { class: "hm-speaker" }, k.personId ? h("a", { class: "hm-over", href: `#/person/${encodeURIComponent(k.personId)}` }, k.speaker) : k.speaker)
        : null,
      k.affiliation ? h("p", { class: "hm-aff" }, k.affiliation) : null,
      h("h3", { class: `hm-title${k.talkTitle ? " talk" : ""}` }, h("a", { class: "hm-link", href: href(s.id) }, k.talkTitle ?? s.title)),
      kindLine(program, s),
      placeLine(program, s)));
}

function clusterTile(program, c) {
  return h("a", { class: "hm-cluster", href: `#/explore?cluster=${encodeURIComponent(c.id)}`, "--tp": c.swatch == null ? "var(--line)" : `var(--tp-${c.swatch})` },
    art(c, program, "band", "hm-cluster-art"),
    h("span", { class: "hm-cluster-name" }, c.label),
    h("span", { class: "hm-cluster-foot" },
      h("span", {}, plural(c.count, "item")),
      c.kept ? h("span", { class: "tile-kept" }, icon("heart", { fill: true, size: 13 }), String(c.kept)) : null));
}

function topicCard(t) {
  const sorted = t.kept + (t.maybe ?? 0) + t.skipped;
  return h("a", { class: "hm-topic", href: `#/explore?topic=${encodeURIComponent(t.id)}`, "--tp": `var(--tp-${t.swatch})` },
    h("span", { class: "hm-topic-name" }, t.label),
    t.topSub?.length ? h("span", { class: "hm-topic-sub" }, t.topSub.join(", ").replace(/-/g, " ")) : null,
    h("span", { class: "hm-topic-foot" }, h("strong", {}, String(t.count)), t.kept || t.maybe ? verdictSummary(t, { withSkipped: false }) : sorted ? `${sorted} sorted` : "items"));
}

// ---------- open source & data ----------
const CODE_CARDS = 6, DATA_CARDS = 4;

function codeCard(program, e) {
  const r = e.repo;
  return h("article", { class: "rs-card rs-code-card" },
    h("p", { class: "rs-card-top" }, icon("code", { size: 16 }),
      h("span", { class: "rs-repo" }, r.owner ? h("span", { class: "rs-owner" }, `${r.owner}/`) : null, h("strong", {}, r.repo)),
      stars(r.stars, true)),
    h("h3", { class: "hm-title" }, h("a", { class: "hm-link", href: href(e.item.id) }, e.item.title)),
    h("p", { class: "rs-card-foot row-tagline" }, tagPill(itemTag(program, e.item), "row"), e.repos > 1 ? h("span", {}, `${e.repos} repositories`) : null));
}

function dataCard(program, e) {
  const n = e.links.length;
  return h("article", { class: "rs-card rs-data-card" },
    h("p", { class: "rs-card-top" }, icon("dataset", { size: 16 }), h("strong", {}, n === 1 ? e.links[0].label : `${n} datasets`),
      h("span", { class: "rs-id" }, n === 1 ? e.links[0].name : "")),
    h("h3", { class: "hm-title" }, h("a", { class: "hm-link", href: href(e.item.id) }, e.item.title)),
    h("p", { class: "rs-card-foot row-tagline" }, tagPill(itemTag(program, e.item), "row")));
}

/** A public graph the programme works with: its endpoint and status, the items, and a live query. */
function graphCard(program, g) {
  const fed = g.endpoint ? federatedQuery({ ...g.graph, endpoint: g.endpoint }) : null;
  const n = g.items.length;
  const items = program.glossary?.[g.graph.id]
    ? h("a", { class: "rs-gr-items", href: `#/browse?term=${encodeURIComponent(g.graph.id)}` }, `Used by ${plural(n, "item")}`)
    : h("span", { class: "rs-gr-items" }, `Used by ${plural(n, "item")}`);
  return h("article", { class: "rs-card rs-graph-card" },
    h("p", { class: "rs-card-top" }, logoChip(g.graph.logo, g.graph.name, { height: 24, cls: "gr-logo" }) ?? icon("graph", { size: 16 }), h("span", {}, "Knowledge graph")),
    h("h3", { class: "rs-gr-name" }, g.graph.name),
    g.endpoint ? h("p", { class: "rs-gr-ep" }, g.endpoint.replace(/^https:\/\//, "")) : null,
    h("p", { class: "rs-gr-row" }, statusBadge(g.status), items),
    fed && g.status.queryable ? h("a", { class: "rs-gr-query", href: explorerHref(fed.query) }, icon("play", { size: 16, fill: true }), "Try a live query") : null);
}

/** Horizontal scroll-snap list; `start` scrolls the given card into view (e.g. the first one still to come). */
function slider(label, cards, { start = 0 } = {}) {
  const ul = h("ul", { class: "slider", role: "list", "aria-label": label }, cards.map((c) => h("li", { class: "slide" }, c)));
  if (start > 0) requestAnimationFrame(() => {
    const li = ul.children[start];
    if (li) ul.scrollLeft = li.offsetLeft - parseFloat(getComputedStyle(ul).scrollPaddingLeft || "16");
  });
  return ul;
}

/** A Home section: heading (+ sub, "see all" link, and arrow buttons for mouse users) over its body. */
function section(id, title, { sub = null, more = null, scroller = null, extra = null } = {}, ...body) {
  const arrows = scroller ? h("span", { class: "hm-arrows" },
    h("button", { type: "button", class: "hm-arrow", "aria-label": `Scroll ${title} back`, onclick: () => scroller.scrollBy({ left: -scroller.clientWidth * 0.8, behavior: "smooth" }) }, icon("back", { size: 18 })),
    h("button", { type: "button", class: "hm-arrow fwd", "aria-label": `Scroll ${title} on`, onclick: () => scroller.scrollBy({ left: scroller.clientWidth * 0.8, behavior: "smooth" }) }, icon("back", { size: 18 }))) : null;
  return h("section", { class: "hm-sec", id, "aria-labelledby": `${id}-h` },
    h("div", { class: "hm-head" },
      h("h2", { class: "hm-h", id: `${id}-h` }, title),
      extra, more ? h("a", { class: "hm-more", href: more[1] }, more[0]) : null, arrows),
    sub ? h("p", { class: "hm-sub" }, sub) : null,
    ...body, scroller);
}

/** "Built with rete": this app's backend in one file, and an invitation to the demo (its session's day and time). */
function reteCard(program) {
  const s = program.sessions.find((x) => /poster and demos/i.test(x.title));
  return h("a", { class: "hm-rete", href: "#/rete" },
    h("img", { src: imgUrl("img/rete/logo.svg"), alt: "", width: 88, height: 24 }),
    h("strong", {}, "Built with rete: no backend, one graph file"),
    h("span", {}, "A self-contained static page: the data is one RDF graph, queried with SPARQL in your browser. Come to our demo", s ? `, ${demoWhen(s, placeOf(program, s).name)}.` : "."));
}

/**
 * renderHome(root, program, store, appClock, params) -> cleanup().
 */
export function renderHome(root, program, store, appClock, params = {}) {
  const hasPicks = () => store.rightIds().length > 0;
  let scope = loadScope() === "all" || loadScope() === "picks" ? loadScope() : (hasPicks() ? "picks" : "all");
  const iso = () => appClock.now();
  let version = 0; // bumped by a keep / skip made on Home: every keyed section re-checks

  // ---------- hero ----------
  const heroArt = h("div", { class: "hm-hero-art" });
  const heroCap = h("a", { class: "hm-cap" });
  const heroPhoto = h("div", { class: "hm-hero-photo", "aria-hidden": "true" }); // the Bari photo over the art
  const heroCredit = h("p", { class: "hm-credit-line" });
  const heroTitle = h("h1", { class: "hm-hero-title" });
  const heroTime = h("p", { class: "hm-hero-time" });
  const heroDate = h("p", { class: "hm-hero-date" });
  const heroLine = h("p", { class: "hm-hero-line" });
  const stats = h("ul", { class: "hm-stats", "aria-label": "Your progress" });
  const hero = h("header", { class: "hm-hero" },
    h("div", { class: "hm-hero-media" }, heroArt, heroPhoto, heroCap, heroCredit),
    h("div", { class: "hm-hero-card" },
      h("div", { class: "hm-hero-top" }, h("div", { class: "hm-hero-heading" }, heroTitle, heroDate), heroTime),
      heroLine, stats));
  let heroArtId = null;
  let heroPhotoFile = null;

  // A photo of Bari behind the hero (they alternate by day); the generated art stays underneath as the
  // fallback, so a photo that isn't cached offline simply isn't there.
  function drawHeroPhoto(now) {
    const im = placeHero(program, now);
    const key = im?.file ?? "";
    if (key === heroPhotoFile) return;
    heroPhotoFile = key;
    const drop = () => { hero.classList.remove("has-photo"); heroPhoto.replaceChildren(); heroCredit.replaceChildren(); };
    if (!im) return drop();
    hero.classList.add("has-photo");
    heroPhoto.replaceChildren(imgEl(im, { cls: "hm-photo", alt: "", eager: true, onFail: drop }), h("span", { class: "hm-scrim" }));
    heroCredit.replaceChildren(photoCredit(im));
  }

  function drawStats() {
    const s = homeStats(program, store);
    const stat = (n, label, link, aria) => h("li", {}, h("a", { href: link, "aria-label": aria }, h("strong", {}, n), h("span", {}, label)));
    stats.replaceChildren(
      stat(`${s.pct}%`, "sorted", "#/deck", `${s.pct}% of ${s.total} sorted: open the deck`),
      stat(String(s.kept), s.maybe ? `kept · ${s.maybe} maybe` : "kept", "#/mine", `${s.kept} kept${s.maybe ? `, ${s.maybe} maybe` : ""}: open My ISWC`),
      stat(String(s.notes), s.notes === 1 ? "note" : "notes", "#/mine", `${plural(s.notes, "note")}: open My ISWC`),
      stat(String(s.people), "people", "#/people", `${s.people} people at ISWC: open People`));
    return s;
  }

  function drawHero() {
    const now = iso();
    const m = heroModel(program, store, now);
    hero.dataset.phase = m.phase;
    heroTitle.textContent = m.title;
    heroTime.replaceChildren(...(m.phase === "during" ? [h("span", { class: "hm-clock" }, m.time)] : []));
    heroDate.textContent = m.phase === "during" ? m.date : m.sub;
    drawHeroPhoto(now);
    const s = drawStats();
    heroLine.textContent = m.phase === "before"
      ? (s.sorted ? `You've sorted ${s.pct}% of the programme and kept ${s.kept}${s.maybe ? ` (${s.maybe} maybe)` : ""}.` : "Swipe through the programme in the deck and keep what matters to you.")
      : m.phase === "during"
        ? (m.picksLeft ? `${plural(m.picksLeft, "pick")} of yours left today.` : hasPicks() ? "Nothing more on your list today." : "Keep sessions in the deck to plan your day.")
        : (s.kept ? `You kept ${s.kept} and wrote ${plural(s.notes, "note")}. They stay here.` : "Thanks for coming.");
    const f = featuredItem(program, store.rightIds(), now, scope);
    if (f && f.id !== heroArtId) {
      heroArtId = f.id;
      heroArt.replaceChildren(thumbSVG(f, program, { size: "hero" }));
      heroCap.href = href(f.id);
      heroCap.replaceChildren(h("span", { class: "hm-cap-k" }, program.kinds?.[f.kind]?.label ?? "Session"), h("span", { class: "hm-cap-t" }, dedupeTitle(program.kinds?.[f.kind]?.label ?? "Session", f.speaker ?? f.title)));
      heroCap.setAttribute("aria-label", `Featured: ${f.title}. Open it`);
    }
  }

  // ---------- now / next ----------
  const nowSec = h("section", { class: "hm-sec hm-nowsec", id: "hm-now", "aria-labelledby": "hm-now-h" });
  let nowKey = "";
  let nowCards = new Map();
  function scopeToggle() {
    return h("div", { class: "seg", role: "group", "aria-label": "Show" },
      ["picks", "all"].map((k) => h("button", {
        type: "button", class: "seg-btn", "aria-pressed": String(scope === k),
        onclick: () => { scope = k; saveScope(k); nowKey = ""; drawNow(); drawHero(); },
      }, k === "picks" ? "My picks" : "Everything")));
  }
  function drawNow() {
    const now = iso();
    const phase = heroModel(program, store, now).phase;
    const r = whatsOn(program, store.rightIds(), now, scope);
    const key = [version, phase, scope, r.state, r.now.map((x) => x.session.id), "|", r.next.map((x) => x.session.id)].join(",");
    if (key === nowKey) { // same sessions: refresh progress and countdowns in place
      for (const x of [...r.now, ...r.next]) nowCards.get(x.session.id)?.update(x);
      return;
    }
    nowKey = key;
    nowCards = new Map();
    nowSec.hidden = phase === "after";
    if (phase === "after") return nowSec.replaceChildren();
    const mine = scope === "picks";
    const cards = (list, variant) => list.map((x) => {
      const c = sessionCard(program, store, x.session, { variant, info: x });
      nowCards.set(x.session.id, c);
      return c;
    });
    const nextAt = r.next[0]?.session;
    let title, sub = null, blocks = [];
    if (mine && !hasPicks()) {
      title = "Your picks, live";
      sub = "Keep sessions in the deck and this shows the one you're in and where to go next.";
      blocks = [h("div", { class: "hm-actions" },
        h("a", { class: "pill-btn primary", href: "#/deck" }, icon("deck", { size: 18 }), "Open the deck"),
        h("button", { type: "button", class: "pill-btn", onclick: () => { scope = "all"; saveScope("all"); nowKey = ""; drawNow(); drawHero(); } }, "Show everything"))];
    } else if (!r.now.length && !r.next.length) {
      title = mine ? "Nothing left on your list" : "Nothing left today";
      sub = mine ? "None of your picks is still to come." : "The programme is over for now.";
    } else if (r.state === "before") {
      title = "First up";
      sub = `${dayLong(nextAt.day)} at ${nextAt.start}${r.next[0].inMin < 12 * 60 ? `, ${inText(r.next[0].inMin, nextAt)}` : ""}.`;
      blocks = [slider("First up", cards(r.next, "next"))];
    } else if (r.state === "between-days" || (r.state === "waiting" && nextAt.day !== now.slice(0, 10))) {
      const tomorrow = nextAt.day === new Date(Date.parse(now.slice(0, 10) + "T12:00:00Z") + 864e5).toISOString().slice(0, 10);
      title = `${tomorrow ? "Tomorrow" : "Next"}, ${dayLong(nextAt.day)}`;
      sub = mine ? "Nothing more on your list today. Your next picks:" : "Nothing more on the programme today. First up:";
      blocks = [slider("First up", cards(r.next, "next"))];
    } else {
      title = r.now.length ? "Happening now" : mine ? "None of your picks on now" : "Nothing on right now";
      if (r.now.length) blocks.push(slider("Happening now", cards(r.now, "now")));
      if (r.next.length) {
        blocks.push(h("h3", { class: "hm-h3" }, mine && !r.now.length ? "Your next pick" : "Up next", h("span", {}, `${nextAt.start}, ${inText(r.next[0].inMin, nextAt)}`)));
        blocks.push(slider("Up next", cards(r.next, "next")));
      }
    }
    nowSec.replaceChildren(...[
      h("div", { class: "hm-head" }, h("h2", { class: "hm-h", id: "hm-now-h" }, title), scopeToggle()),
      sub ? h("p", { class: "hm-sub" }, sub) : null, ...blocks].filter(Boolean));
  }

  // ---------- day sliders ----------
  const picksSec = h("div", {}), keySec = h("div", {}), wsSec = h("div", {}), discSec = h("div", {});
  const keys = { picks: "", key: "", ws: "", disc: "", land: "" };
  let dayKey = "";
  function keyed(name, el, key, build) {
    if (keys[name] === key) return;
    keys[name] = key;
    el.replaceChildren(...[build()].filter(Boolean));
  }
  function drawDaySections() {
    const now = iso();
    // Past / upcoming only changes when a session ends (or a new day, or a keep on Home): skip the rest.
    const dk = `${pastKey(program, now)}|${version}`;
    if (dk === dayKey) return;
    dayKey = dk;
    const p = picksAhead(program, store.rightIds(), now);
    keyed("picks", picksSec, p ? `${p.date}|${p.firstUpcoming}|${p.entries.map((e) => `${e.session.id}:${e.papers.length}`)}` : "none", () => {
      if (!p) return null;
      const cards = p.entries.map((e) => sessionCard(program, store, e.session, {
        past: e.past, note: e.kept ? null : e.papers.length ? plural(e.papers.length, "kept paper") : null,
      }));
      const sc = slider("Your picks", cards, { start: p.firstUpcoming });
      return section("hm-picks", `Your picks ${p.when === "later" ? dayLong(p.date) : whenWord(p.when, p.date)}`,
        { more: ["My ISWC", "#/mine"], scroller: sc });
    });
    const k = keynoteCards(program, now);
    keyed("key", keySec, `${k.firstUpcoming}|${k.items.length}`, () => {
      if (!k.items.length) return null;
      const sc = slider("Keynotes", k.items.map((x) => keynoteCard(program, x)), { start: Math.max(0, k.firstUpcoming) });
      return section("hm-keynotes", "Keynotes", { more: ["People", "#/people"], scroller: sc });
    });
    const w = workshopsAhead(program, now);
    keyed("ws", wsSec, w ? `${w.date}|${w.when}` : "none", () => {
      if (!w) return null;
      const sc = slider("Workshops and tutorials", w.items.map((s) => sessionCard(program, store, s)));
      return section("hm-ws", `Workshops & tutorials ${w.when === "later" ? dayLong(w.date) : whenWord(w.when, w.date)}`,
        { sub: plural(w.items.length, "session") + ", all day long.", scroller: sc });
    });
    keyed("disc", discSec, `${now.slice(0, 10)}`, () => {
      const items = discover(program, store, now);
      if (!items.length) return null;
      const more = h("a", { class: "hm-card hm-deckcta", href: "#/deck" }, icon("deck", { size: 28 }), h("strong", {}, "More in the deck"), h("span", {}, "Swipe the rest of the programme."));
      const sc = slider("Discover", [...items.map((x) => discoverCard(program, store, x, onKeep)), more]);
      return section("hm-discover", "Discover", { sub: "Not sorted yet. Keep or skip right here; a new mix every day.", scroller: sc });
    });
  }

  // ---------- landscape ----------
  const landSec = h("div", {});
  function drawLandscape() {
    const m = exploreModel(program, store);
    keyed("land", landSec, m.ready ? `${m.clusters.map((c) => c.kept)}|${m.categories.map((c) => `${c.kept}/${c.maybe}/${c.skipped}`)}` : "none",
      () => h("div", {}, ...landscape(m)));
  }
  function landscape(m) {
    if (!m.ready) return [];
    const cl = slider("Clusters", [...m.clusters].sort((a, b) => b.count - a.count).map((c) => clusterTile(program, c)));
    const tp = m.categories.length ? slider("Topics", m.categories.map(topicCard)) : null;
    return [
      section("hm-clusters", "Clusters", { sub: "Sessions and papers grouped by what they're about.", more: ["Explore", "#/explore"], scroller: cl }),
      tp ? section("hm-topics", "Topics", { more: ["Explore", "#/explore"], scroller: tp }) : null,
    ];
  }

  // Built once: the data doesn't change while Home is open.
  function research() {
    const r = researchHighlights(program);
    if (!r.total) return null;
    const cards = [
      ...r.graphs.map((g) => graphCard(program, g)),
      ...r.code.slice(0, CODE_CARDS).map((e) => codeCard(program, e)),
      ...r.data.slice(0, DATA_CARDS).map((e) => dataCard(program, e)),
    ];
    if (r.code.length > CODE_CARDS || r.data.length > DATA_CARDS) {
      cards.push(h("div", { class: "hm-card hm-deckcta rs-more" },
        h("strong", {}, "All of it in Browse"),
        r.code.length ? h("a", { class: "pill-btn", href: "#/browse?has=code" }, icon("code", { size: 16 }), `${plural(r.code.length, "item")} with code`) : null,
        r.data.length ? h("a", { class: "pill-btn", href: "#/browse?has=data" }, icon("dataset", { size: 16 }), `${plural(r.withData, "item")} with data`) : null));
    }
    const sub = [r.code.length ? `${plural(r.code.length, "item")} with code` : null, r.data.length ? `${r.data.length} with datasets` : null,
      r.graphs.length ? `${plural(r.graphs.length, "public knowledge graph")} in use` : null].filter(Boolean).join(", ");
    return section("hm-research", "Open source & data", { sub: `${sub}.`, scroller: slider("Open source and data", cards) });
  }

  // A keep / skip on a Discover card: everything that depends on picks re-checks its key (the Discover
  // slider itself keeps its cards and scroll position).
  function onKeep() {
    version++;
    drawHero(); drawNow(); drawDaySections(); drawLandscape();
  }

  // ---------- tonight in Bari (views/bari.js; nothing at all without the guide or without events today) ----------
  const bariSec = h("div", { class: "hm-bari", hidden: true });
  let guide = null;
  let bariKey = "";
  function drawBari() {
    const evs = guide ? tonight(guide.items, iso(), 2) : [];
    const key = evs.map((e) => e.item.id).join(",");
    if (key === bariKey) return;
    bariKey = key;
    bariSec.hidden = !evs.length;
    const venues = new Map((guide?.items ?? []).filter((x) => x.category === "venue").map((x) => [x.id, x]));
    bariSec.replaceChildren(...(evs.length ? [section("hm-bari", "Tonight in Bari", { more: ["Bari guide", "#/bari"] },
      h("ul", { class: "hm-bari-list" }, evs.map(({ item: ev, time }) => {
        const v = venues.get(ev.venueId);
        return h("li", {}, h("a", { class: "hm-bari-ev", href: `#/bari?item=${encodeURIComponent(ev.id)}` },
          h("strong", {}, time),
          h("span", {}, ev.name, h("small", {}, [v?.name, walkLabel(ev.walkMin ?? v?.walkMin), ev.price].filter(Boolean).join(" · ")))));
      })))] : []));
  }
  bariGuide().then((g) => { guide = g; drawBari(); });

  drawHero(); drawNow(); drawDaySections(); drawLandscape();
  root.replaceChildren(h("section", { class: "view home-view" },
    hero, nowSec, picksSec, bariSec, keySec, wsSec, discSec, landSec, research(),
    program.source === "rete" ? h("a", { class: "hm-sparql", href: "#/sparql" }, icon("code", { size: 22 }),
      h("span", {}, h("strong", {}, "Query the programme with SPARQL"), h("span", {}, "Your own questions, answered as a table or as cards, offline."))) : null,
    reteCard(program),
    h("footer", { class: "hm-foot" }, h("a", { href: "#/credits" }, "Image credits and data sources"))));

  const off = appClock.subscribe(() => { drawHero(); drawNow(); drawDaySections(); drawBari(); });
  // A keep/skip anywhere else (a desktop panel, the sim pill's views) moves the stats and sections too.
  const offVerdict = onVerdict(() => onKeep());
  return () => { off(); offVerdict(); };
}
