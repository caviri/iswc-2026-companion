// Bari (#/bari): a small guide to the city around the venue, from app/data/bari.json (written by
// pipeline/bari_guide.py). The conference venue on top (address, map, website), then a segmented filter
// ("Venue & tips" from the archived ISWC 2026 website: at the venue, getting there, social events, good to
// know; concerts this week, underground venues, comics shops, sights,
// food under Fancy / Good value / Classic spots / Gelato, day trips), concerts grouped by day with "Tonight"
// first, cards for places with walk time, map links, website, upcoming events, the organisers' tip and a
// "Checked · Sources" footer. Cards expand inline for the address, hours and notes (on desktop too: guide entries aren't programme items, so they don't open as panels).
// Fails soft: without the file it shows a friendly empty state. Pure parts: js/bari-model.js
// (tests/app/bari.test.mjs). Also exports bariGuide() for Home's "Tonight in Bari".
import { h, icon, tagPill } from "../ui.js";
import { dayLong } from "../model.js";
import { replaceRoute } from "../route-state.js";
import {
  BARI_FILTERS, PRACTICAL_FILTER, CATEGORY_COLOR, loadGuide, eventDays, eventsAt, placesIn, foodGroups, categoryCounts,
  walkLabel, osmUrl, googleMapsUrl, directionsUrl, trainLine, checkedLabel, sourceLabel, dayLabel, romeDay, romeTime, isPast,
  practicalGroups, whenLabel, iswcSource, photoFor,
} from "../bari-model.js";
import { imgUrl } from "../images-model.js";

const KEY = "iswc26:bari"; // sessionStorage: { filter, sort }, a per-tab convenience
const SORTS = [["distance", "Nearest"], ["name", "A–Z"]];
const SEGMENTS = [PRACTICAL_FILTER, ...BARI_FILTERS];
const ext = (url, cls, ...kids) => h("a", { class: cls, href: url, target: "_blank", rel: "noopener noreferrer" }, ...kids);
const anchor = (id) => `bari-${id}`;

let cached = null;
/** The guide, fetched once per page load (null when the file is missing; then the next call retries). */
export function bariGuide() {
  cached ??= loadGuide(globalThis.fetch?.bind(globalThis)).then((g) => { if (!g) cached = null; return g; });
  return cached;
}

function loadState() {
  try {
    const s = JSON.parse(sessionStorage.getItem(KEY)) ?? {};
    return {
      filter: SEGMENTS.some(([f]) => f === s.filter) ? s.filter : "concert",
      sort: SORTS.some(([k]) => k === s.sort) ? s.sort : "distance",
    };
  } catch { return { filter: "concert", sort: "distance" }; }
}
function saveState(st) {
  try { sessionStorage.setItem(KEY, JSON.stringify(st)); } catch { /* private mode: the filter just isn't remembered */ }
}

const tag = (x) => tagPill({ label: x.kind ?? BARI_FILTERS.find(([c]) => c === x.category)?.[1] ?? "Place", color: CATEGORY_COLOR[x.category] }, "row");

/** "Sat 24 Oct · 21:30" for an event outside its day group (a venue card's list). */
const whenText = (ev, today) => `${dayLabel(romeDay(ev.startISO), today)} · ${romeTime(ev.startISO)}`;

function ticketsBtn(ev) {
  const u = ev.tickets ?? ev.url;
  return u ? ext(u, "pill-btn bari-tix", icon("ticket", { size: 18 }), ev.tickets ? "Tickets" : "Info") : null;
}

/** "Checked Sat 24 Oct · Sources example.it, other.com" (null with neither). */
function footer(x) {
  if (!x.checked && !x.sources.length) return null;
  return h("p", { class: "bari-foot" }, checkedLabel(x.checked), x.checked && x.sources.length ? " · " : null,
    x.sources.length ? ["Sources ", x.sources.map((u, i) => [i ? ", " : "", ext(u, "fig-link", sourceLabel(u))])] : null);
}

/** "ISWC 2026 tip: …" on a place the organisers' website suggests, linking to that page. */
function iswcTipLine(x) {
  if (!x.iswcTip) return null;
  const src = iswcSource(x);
  return h("p", { class: "bari-iswc" }, h("strong", {}, "ISWC 2026 tip "), x.iswcTip,
    src ? [" ", ext(src, "fig-link", "(site)")] : null);
}

/** A link from a practical entry: an app route stays in the app, anything else opens outside. */
const practicalLink = (l) => (l.url.startsWith("#/")
  ? h("a", { class: "pill-btn", href: l.url }, icon("map", { size: 18 }), l.label)
  : ext(l.url, "pill-btn", icon("external", { size: 18 }), l.label));

/** A "Venue & tips" card: title, when and where, text, points, a two-column table, links and sources. */
function practicalCard(e, nowISO) {
  const past = e.startISO ? isPast(e, nowISO) : false;
  const where = [e.place, e.address, walkLabel(e.walkMin)].filter(Boolean).join(" · ");
  const osm = osmUrl(e.lat, e.lon), dir = directionsUrl(e);
  return h("li", { class: `bari-card bari-prac${past ? " past" : ""}`, id: anchor(e.id) },
    h("span", { class: "bari-card-title" }, h("strong", { class: "bari-name" }, e.title),
      past ? h("span", { class: "bari-ended" }, "Over") : null),
    e.startISO ? h("p", { class: "bari-train" }, icon("clock", { size: 18 }), whenLabel(e)) : null,
    where ? h("p", { class: "bari-meta" }, where) : null,
    e.text ? h("p", { class: "bari-desc" }, e.text) : null,
    e.points.length ? h("ul", { class: "bari-points" }, e.points.map((t) => h("li", {}, t))) : null,
    e.rows.length ? h("dl", { class: "bari-rows" }, e.rows.map(([k, v]) => [h("dt", {}, k), h("dd", {}, v)])) : null,
    h("div", { class: "bari-actions" },
      dir ? ext(dir, "pill-btn", icon("pin", { size: 18 }), "Directions") : null,
      osm ? ext(osm, "pill-btn", icon("map", { size: 18 }), "Open in Maps") : null,
      e.links.map(practicalLink)),
    footer(e));
}

/** One concert row: time, name, venue (a link to its card), price and Tickets; dimmed once it's over. */
const SHOWS = { street: "The street", dish: "The dish", interior: "Inside" };
/** An entry's photo with its credit (author, licence, source); `cls` sizes it. null without one. */
function photo(im, cls = "") {
  if (!im) return null;
  const img = h("img", { src: imgUrl(im.file), alt: im.alt, width: im.width, height: im.height, loading: "lazy", decoding: "async", draggable: false });
  const fig = h("figure", { class: `bari-photo ${cls}` }, img,
    h("figcaption", {}, SHOWS[im.depicts] ? `${SHOWS[im.depicts]} · ` : "", "Photo: ", im.credit.author || "author not stated", " · ",
      im.credit.licenseUrl ? ext(im.credit.licenseUrl, "", im.credit.license) : im.credit.license,
      im.credit.pageUrl ? [" · ", ext(im.credit.pageUrl, "", "Source")] : null));
  img.addEventListener("error", () => fig.remove(), { once: true });
  return fig;
}

function eventRow(ev, venue, past, time) {
  const dir = directionsUrl(venue ?? ev);
  return h("li", { class: `bari-ev${past ? " past" : ""}`, id: anchor(ev.id) },
    h("span", { class: "bari-ev-time" }, time, past ? h("span", { class: "bari-ended" }, "Ended") : null),
    h("div", { class: "bari-ev-body" },
      photo(ev.image ?? venue?.image ?? null, "wide"),
      h("div", { class: "bari-ev-top" }, h("strong", { class: "bari-name" }, ev.name), tag(ev)),
      ev.artists ? h("p", { class: "bari-artists" }, Array.isArray(ev.artists) ? ev.artists.join(", ") : String(ev.artists)) : null,
      h("p", { class: "bari-meta" },
        venue ? h("a", { href: `#/bari?item=${encodeURIComponent(venue.id)}` }, venue.name) : ev.address ?? null,
        [ev.area, walkLabel(ev.walkMin ?? venue?.walkMin)].filter(Boolean).map((t) => [" · ", t])),
      ev.description ? h("p", { class: "bari-desc" }, ev.description) : null,
      h("div", { class: "bari-actions" },
        ev.price ? h("span", { class: "bari-price" }, ev.price) : null,
        ticketsBtn(ev),
        dir ? ext(dir, "pill-btn", icon("pin", { size: 18 }), "Directions") : null)));
}

/** A place card: tag, area, walk time, description, map and web links, events there, sources. Expands inline. */
function placeCard(x, guide, nowISO, open, onToggle) {
  const isOpen = open.has(x.id);
  const today = nowISO.slice(0, 10);
  const events = x.category === "venue" ? eventsAt(guide.items, x.id, nowISO) : [];
  const train = x.category === "daytrip" ? trainLine(x) : "";
  const osm = osmUrl(x.lat, x.lon), gm = googleMapsUrl(x), dir = directionsUrl(x);
  const more = [x.address ? h("p", {}, icon("pin", { size: 16 }), x.address) : null,
    x.hours ? h("p", {}, icon("clock", { size: 16 }), String(x.hours)) : null,
    x.note ? h("p", {}, String(x.note)) : null].filter(Boolean);
  const bodyId = `${anchor(x.id)}-more`;
  return h("li", { class: `bari-card${isOpen ? " open" : ""}`, id: anchor(x.id) },
    photo(photoFor(guide, x)),
    h("button", { type: "button", class: "bari-card-head", "aria-expanded": String(isOpen), "aria-controls": more.length ? bodyId : null, onclick: () => onToggle(x.id) },
      h("span", { class: "bari-card-title" }, h("strong", { class: "bari-name" }, x.name), tag(x)),
      h("span", { class: "bari-meta" }, [x.area, walkLabel(x.walkMin)].filter(Boolean).join(" · ") || (x.distanceKm != null ? `${x.distanceKm} km away` : "")),
      more.length ? h("span", { class: "bari-chev", "aria-hidden": "true" }, icon("back", { size: 18 })) : null),
    x.description ? h("p", { class: "bari-desc" }, x.description) : null,
    iswcTipLine(x),
    train ? h("p", { class: "bari-train" }, icon("train", { size: 18 }), train) : null,
    more.length ? h("div", { class: "bari-more", id: bodyId, hidden: !isOpen }, more) : null,
    events.length ? h("div", { class: "bari-at" }, h("h3", {}, events.length === 1 ? "Coming up here" : `${events.length} coming up here`),
      h("ul", {}, events.map((ev) => h("li", {}, h("span", { class: "bari-at-when" }, whenText(ev, today)), " ",
        h("a", { href: `#/bari?item=${encodeURIComponent(ev.id)}` }, ev.name), ev.price ? ` · ${ev.price}` : "")))) : null,
    h("div", { class: "bari-actions" },
      dir ? ext(dir, "pill-btn", icon("pin", { size: 18 }), "Directions") : null,
      osm ? ext(osm, "pill-btn", icon("map", { size: 18 }), "Open in Maps") : null,
      gm && isOpen ? ext(gm, "pill-btn", icon("search", { size: 18 }), "Google Maps") : null,
      x.url ? ext(x.url, "pill-btn", icon("external", { size: 18 }), x.category === "daytrip" ? "Info" : "Website") : null,
      x.instagram && isOpen ? ext(x.instagram, "pill-btn", icon("link", { size: 18 }), "Instagram") : null),
    footer(x));
}

/** renderBari(root, appClock, params) -> cleanup(). params.item: open that entry (switching the filter). */
export function renderBari(root, appClock, params = {}) {
  const st = loadState();
  const open = new Set();
  let guide = null;
  let alive = true;
  let lastMinute = "";

  const intro = h("p", { class: "bari-intro" });
  const venueBox = h("div", { class: "bari-venue", hidden: true }); // the conference venue, once the guide is in
  const seg = h("div", { class: "seg bari-seg", role: "group", "aria-label": "Show" });
  const sortSeg = h("div", { class: "seg bari-sort", role: "group", "aria-label": "Sort by" });
  const tools = h("div", { class: "bari-tools", hidden: true }, sortSeg);
  const segRow = h("div", { class: "chip-row bari-seg-row", hidden: true }, seg); // shown once the guide is in
  const list = h("div", { class: "bari-body", "aria-live": "polite" }, h("p", { class: "muted" }, "Loading the guide…"));

  const persist = () => saveState(st);
  const toggle = (id) => { if (open.has(id)) open.delete(id); else open.add(id); draw(); };

  function drawIntro(now) {
    const where = guide?.venue?.name ?? "the conference venue";
    intro.textContent = `${dayLong(now.slice(0, 10))}. Whitewashed old town, a long seafront and a lively music scene: concerts, record and comics shops, sights, food and day trips, with walking times from ${where}.`;
  }

  function drawVenue() {
    const v = guide?.venue;
    venueBox.hidden = !v || (!v.address && !v.url);
    if (venueBox.hidden) return;
    const osm = osmUrl(v.lat, v.lon), dir = directionsUrl(v);
    venueBox.replaceChildren(...[ // replaceChildren would print a missing photo as "null"
      photo(v.image, "venue"),
      h("p", { class: "bari-venue-k" }, "Conference venue"),
      h("strong", { class: "bari-venue-name" }, v.name),
      v.address ? h("p", { class: "bari-meta" }, v.address) : null,
      h("div", { class: "bari-actions" },
        dir ? ext(dir, "pill-btn", icon("pin", { size: 18 }), "Directions") : null,
        osm ? ext(osm, "pill-btn", icon("map", { size: 18 }), "Open in Maps") : null,
        v.url ? ext(v.url, "pill-btn", icon("external", { size: 18 }), "Website") : null,
        guide.practical.length && st.filter !== "practical" ? h("button", {
          type: "button", class: "pill-btn primary", onclick: () => { st.filter = "practical"; persist(); draw(); },
        }, icon("train", { size: 18 }), "Getting there & tips") : null)].filter(Boolean));
  }

  function draw() {
    const now = appClock.now();
    lastMinute = now.slice(0, 16);
    drawIntro(now);
    if (!guide) return;
    drawVenue();
    segRow.hidden = false;
    const counts = { ...categoryCounts(guide.items, now), practical: guide.practical.length };
    seg.replaceChildren(...SEGMENTS.filter(([f]) => f !== "practical" || counts.practical).map(([f, label]) => h("button", {
      type: "button", class: "seg-btn", "aria-pressed": String(st.filter === f),
      onclick: () => { if (st.filter === f) return; st.filter = f; persist(); draw(); },
    }, label, h("span", { class: "pp-n" }, String(counts[f])))));
    tools.hidden = st.filter === "concert" || st.filter === "practical";
    sortSeg.replaceChildren(...SORTS.map(([k, label]) => h("button", {
      type: "button", class: "seg-btn", "aria-pressed": String(st.sort === k),
      onclick: () => { if (st.sort === k) return; st.sort = k; persist(); draw(); },
    }, label)));

    if (st.filter === "concert") {
      const days = eventDays(guide.items, now);
      const venues = new Map(guide.items.filter((x) => x.category === "venue").map((x) => [x.id, x]));
      list.replaceChildren(...(days.length ? days.map((g) => h("section", { class: `bari-day${g.tonight ? " tonight" : ""}`, "aria-label": g.label },
        h("h2", { class: "bari-day-h" }, g.label, g.label !== dayLong(g.day) ? h("span", {}, dayLong(g.day)) : null),
        h("ul", { class: "bari-evs" }, g.events.map((e) => eventRow(e.item, venues.get(e.item.venueId), e.past, e.time)))))
        : [h("div", { class: "empty bari-empty" }, h("h2", {}, "No more concerts listed this week"),
          h("p", {}, "Have a look at the underground venues: most have something on most nights."),
          h("div", { class: "empty-actions" }, h("button", { type: "button", class: "pill-btn primary", onclick: () => { st.filter = "venue"; persist(); draw(); } }, "Underground venues")))]));
      return;
    }
    if (st.filter === "practical") {
      list.replaceChildren(...practicalGroups(guide.practical).map((g) => h("section", { class: "bari-day", "aria-label": g.label },
        h("h2", { class: "bari-day-h" }, g.label), h("ul", { class: "bari-cards" }, g.entries.map((e) => practicalCard(e, now))))),
        h("p", { class: "src-note" }, "From the official ISWC 2026 website as archived on 20 October 2026; the organisers' pages have the latest."));
      return;
    }
    const places = placesIn(guide.items, st.filter, st.sort);
    const cards = (xs) => h("ul", { class: "bari-cards" }, xs.map((x) => placeCard(x, guide, now, open, toggle)));
    if (!places.length) {
      list.replaceChildren(h("div", { class: "empty bari-empty" }, h("h2", {}, "Nothing listed here yet"), h("p", {}, "Try another filter.")));
    } else if (st.filter === "food") {
      list.replaceChildren(...foodGroups(places).map((g) => h("section", { class: "bari-day", "aria-label": g.label },
        h("h2", { class: "bari-day-h" }, g.label, h("span", {}, String(g.items.length))), cards(g.items))));
    } else list.replaceChildren(cards(places));
  }

  function showItem(id) {
    const x = guide?.items.find((i) => i.id === id);
    const p = x ? null : guide?.practical.find((e) => e.id === id);
    if (!x && !p) return;
    st.filter = x ? x.category : "practical"; persist();
    open.add(id);
    draw();
    setTimeout(() => {
      const el = document.getElementById(anchor(id));
      if (!el) return;
      el.scrollIntoView({ block: "center" });
      el.classList.add("flash");
      (el.querySelector("button, a") ?? el).focus?.({ preventScroll: true });
    }, 0);
  }

  root.replaceChildren(h("section", { class: "view bari-view" },
    h("div", { class: "view-head" }, h("h1", { class: "view-title" }, "Bari"), icon("bari", { size: 26 })),
    intro,
    venueBox,
    segRow,
    tools,
    list,
    h("p", { class: "src-note bari-note" }, "Hand-checked from the venues' own pages and listings and the ISWC 2026 website; times and prices change, so check before you go. Links open outside the app.")));
  drawIntro(appClock.now());

  bariGuide().then((g) => {
    if (!alive) return;
    guide = g;
    if (!g) {
      list.replaceChildren(h("div", { class: "empty bari-empty" },
        h("h2", {}, "The Bari guide isn't here yet"),
        h("p", {}, "It comes with the app's data. Connect to the internet once and reload; after that it works offline."),
        h("div", { class: "empty-actions" }, h("button", { type: "button", class: "pill-btn primary", onclick: () => location.reload() }, "Reload"))));
      return;
    }
    if (params.item) { replaceRoute("#/bari"); showItem(params.item); } else draw();
  });

  // The clock moves events from coming up to ended, and the day to "Tonight": redraw on a new minute.
  const off = appClock.subscribe((s) => { if (s.iso.slice(0, 16) !== lastMinute) draw(); });
  return () => { alive = false; off(); };
}
