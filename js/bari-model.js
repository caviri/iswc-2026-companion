// Bari guide (#/bari): the pure side of app/data/bari.json. Normalising the file, the segmented filters,
// the conference venue and its "Venue & tips" section (from the archived ISWC 2026 website),
// concerts grouped by Rome day with "Tonight" first, past detection against the app clock, sorting places
// by walking distance or name, food under its group headings, events at a venue, map links and the small
// text lines. No DOM.
// Unit-tested in tests/app/bari.test.mjs. Every url goes through safeUrl (https only).
import { romeNow } from "./time.js";
import { dayLong } from "./model.js";
import { safeUrl } from "./people-model.js";

/** The segmented filter: [category, label]. "venue" entries are the underground music venues. */
export const BARI_FILTERS = [
  ["concert", "Tonight & this week"], ["venue", "Underground"], ["comics", "Comics"],
  ["sight", "Sights"], ["food", "Food"], ["daytrip", "Day trips"],
];
const CATEGORIES = BARI_FILTERS.map(([c]) => c);

/** The extra first filter: the conference venue section (guide.practical), not a category of items. */
export const PRACTICAL_FILTER = ["practical", "Venue & tips"];
/** Its headings, in order: [topic, label]. */
export const PRACTICAL_TOPICS = [["venue", "At the venue"], ["travel", "Getting there"], ["events", "Social events"], ["tips", "Good to know"]];

/** The Food tab's headings, in order: [group, label]. */
export const FOOD_GROUPS = [["fancy", "Fancy"], ["value", "Good value"], ["classic", "Classic spots"], ["gelato", "Gelato"]];

/** Tag colour per category (topic swatches, so light and dark both hold contrast). */
export const CATEGORY_COLOR = {
  concert: "var(--tp-9)", venue: "var(--tp-8)", comics: "var(--tp-1)", sight: "var(--tp-5)", food: "var(--tp-3)", daytrip: "var(--tp-6)",
};

// An event with no end counts as running this long after its start (a gig rarely lasts longer).
const DEFAULT_EVENT_MS = 3 * 60 * 60 * 1000;
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);
const ms = (iso) => { const t = Date.parse(iso ?? ""); return Number.isNaN(t) ? null : t; };
const strs = (v) => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);
const APP_ROUTE = /^#\/[a-z]+(?:[/?][A-Za-z0-9=&_/-]*)?$/;

/** An https url or an in-app route; anything else -> null. "#/map" -> "#/map", "javascript:x" -> null */
export const safeLink = (u) => (typeof u === "string" && APP_ROUTE.test(u) ? u : safeUrl(u));

const DEPICTS = ["place", "building", "interior", "street", "dish"];
/**
 * A guide photo (Wikimedia Commons, openly licensed; pipeline/images_bari.py) checked: a local img/bari/ file with its
 * size, what it shows and a credit with a licence; anything else -> null.
 */
export function bariImage(im) {
  if (!im || typeof im !== "object" || !/^img\/bari\/[a-z0-9-]+\.webp$/.test(im.file ?? "") || !(num(im.width) > 0) || !(num(im.height) > 0)) return null;
  const c = im.credit ?? {};
  if (!str(c.license)) return null;
  return { file: im.file, width: im.width, height: im.height, depicts: DEPICTS.includes(im.depicts) ? im.depicts : "place", alt: str(im.alt) ?? "",
    credit: { author: str(c.author) ?? "", license: str(c.license), licenseUrl: safeUrl(c.licenseUrl), pageUrl: safeUrl(c.pageUrl) } };
}

/** The photo to show for an entry: its own, else (a concert) its venue's. -> image | null */
export function photoFor(guide, x) {
  if (x?.image) return x.image;
  const v = x?.venueId ? guide?.items?.find((i) => i.id === x.venueId) : null;
  return v?.image ?? null;
}

/** Every guide photo as a credit entry for the Credits page: [{file, subject, author, license, licenseUrl, pageUrl, width, height}]. */
export function guideCredits(guide) {
  const xs = [...(guide?.venue?.image ? [{ name: guide.venue.name, image: guide.venue.image }] : []), ...(guide?.items ?? [])];
  return xs.filter((x) => x.image).map(({ name, image: im }) => ({ file: im.file, subject: name, author: im.credit.author, license: im.credit.license,
    licenseUrl: im.credit.licenseUrl, pageUrl: im.credit.pageUrl, width: im.width, height: im.height }));
}

/** One practical entry checked: needs an id, a known topic and a title; links, rows, points cleaned. */
function practicalEntry(x) {
  if (!x || typeof x !== "object" || !str(x.id) || !str(x.title) || !PRACTICAL_TOPICS.some(([t]) => t === x.topic)) return null;
  return {
    id: x.id, topic: x.topic, title: str(x.title), text: str(x.text), place: str(x.place), address: str(x.address),
    points: strs(x.points),
    rows: (Array.isArray(x.rows) ? x.rows : []).filter((r) => Array.isArray(r) && r.length === 2 && str(r[0]) && str(r[1])).map(([a, b]) => [str(a), str(b)]),
    links: (Array.isArray(x.links) ? x.links : []).map((l) => ({ label: str(l?.label), url: safeLink(l?.url) })).filter((l) => l.label && l.url),
    startISO: ms(x.startISO) != null ? x.startISO : null, endISO: ms(x.endISO) != null ? x.endISO : null,
    lat: num(x.lat), lon: num(x.lon), distanceKm: num(x.distanceKm), walkMin: num(x.walkMin),
    sources: (Array.isArray(x.sources) ? x.sources : []).map(safeUrl).filter(Boolean),
    checked: /^\d{4}-\d{2}-\d{2}$/.test(x.checked ?? "") ? x.checked : null,
  };
}

/**
 * bari.json -> { venue, generated, items, practical } with every item checked: a known category, an id and a
 * name; concerts also need a parseable startISO. Missing optional fields become null / []. Practical entries
 * need an id, a known topic and a title (none -> []). Anything else -> null.
 */
export function normaliseGuide(raw) {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.items)) return null;
  const v = raw.venue ?? {};
  const venue = {
    name: str(v.name) ?? "the conference venue", lat: num(v.lat), lon: num(v.lon), address: str(v.address),
    url: safeUrl(v.url), sources: (Array.isArray(v.sources) ? v.sources : []).map(safeUrl).filter(Boolean),
    image: bariImage(v.image),
  };
  const seen = new Set();
  const items = [];
  for (const x of raw.items) {
    if (!x || typeof x !== "object" || !str(x.id) || !str(x.name) || !CATEGORIES.includes(x.category) || seen.has(x.id)) continue;
    if (x.category === "concert" && ms(x.startISO) == null) continue;
    seen.add(x.id);
    items.push({
      ...x,
      kind: str(x.kind), description: str(x.description), address: str(x.address), area: str(x.area),
      lat: num(x.lat), lon: num(x.lon), distanceKm: num(x.distanceKm), walkMin: num(x.walkMin),
      url: safeUrl(x.url), tickets: safeUrl(x.tickets), instagram: safeUrl(x.instagram),
      sources: (Array.isArray(x.sources) ? x.sources : []).map(safeUrl).filter(Boolean),
      checked: /^\d{4}-\d{2}-\d{2}$/.test(x.checked ?? "") ? x.checked : null,
      venueId: str(x.venueId), startISO: str(x.startISO), endISO: ms(x.endISO) != null ? x.endISO : null,
      price: str(x.price) ?? (num(x.price) != null ? `€${x.price}` : null),
      group: FOOD_GROUPS.some(([g]) => g === x.group) ? x.group : null,
      iswcTip: str(x.iswcTip),
      image: bariImage(x.image),
    });
  }
  const ids = new Set();
  const practical = (Array.isArray(raw.practical) ? raw.practical : []).map(practicalEntry)
    .filter((e) => e && !ids.has(e.id) && ids.add(e.id));
  return { venue, generated: str(raw.generated), items, practical };
}

/**
 * Fetch and normalise the guide (fail soft) -> guide | null.
 * loadGuide(fetch) with the app's fetch; tests pass a disk fetch.
 */
export async function loadGuide(fetchFn = globalThis.fetch, url = "data/bari.json") {
  try {
    const res = await fetchFn(url);
    if (!res?.ok) return null;
    return normaliseGuide(await res.json());
  } catch { return null; }
}

/** Rome calendar day of an ISO instant. "2026-10-25T00:30:00+02:00" -> "2026-10-25" */
export const romeDay = (iso) => { const t = ms(iso); return t == null ? null : romeNow(new Date(t)).slice(0, 10); };
/** Rome wall time. "2026-10-25T21:30:00+01:00" -> "21:30" */
export const romeTime = (iso) => { const t = ms(iso); return t == null ? "" : romeNow(new Date(t)).slice(11, 16); };

/** An event is past once it has ended (its end, or start + 3 h without one) at `nowISO`. */
export function isPast(ev, nowISO) {
  const s = ms(ev?.startISO), now = ms(nowISO);
  if (s == null || now == null) return false;
  return (ms(ev.endISO) ?? s + DEFAULT_EVENT_MS) <= now;
}

/** "Tonight" (today), "Tomorrow", else "Mon 26 Oct". */
export function dayLabel(day, today) {
  if (day === today) return "Tonight";
  const next = new Date(`${today}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return day === next.toISOString().slice(0, 10) ? "Tomorrow" : dayLong(day);
}

const byStart = (a, b) => (ms(a.startISO) - ms(b.startISO)) || a.name.localeCompare(b.name);

/**
 * Concerts grouped by Rome day, from today on (earlier days are dropped), in time order. Today's group
 * comes first and is labelled "Tonight"; its finished events stay, marked past (the view dims them).
 * -> [{ day, label, tonight, events: [{ item, past, time }] }]
 */
export function eventDays(items, nowISO) {
  const today = nowISO.slice(0, 10);
  const groups = new Map();
  for (const ev of items.filter((x) => x.category === "concert").sort(byStart)) {
    const day = romeDay(ev.startISO);
    if (!day || day < today) continue;
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day).push({ item: ev, past: isPast(ev, nowISO), time: romeTime(ev.startISO) });
  }
  return [...groups].sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([day, events]) => ({ day, label: dayLabel(day, today), tonight: day === today, events }));
}

/** Today's events still to come or running (Home's "Tonight in Bari"), at most `n`. */
export function tonight(items, nowISO, n = 2) {
  return eventDays(items, nowISO).find((g) => g.tonight)?.events.filter((e) => !e.past).slice(0, n) ?? [];
}

/** Upcoming (not past) events at venue `venueId`, in time order. */
export function eventsAt(items, venueId, nowISO) {
  return items.filter((x) => x.category === "concert" && x.venueId === venueId && !isPast(x, nowISO)).sort(byStart);
}

/** Items of one category, sorted: "distance" (nearest first; unknown last) or "name". Concerts by time. */
export function placesIn(items, category, sort = "distance") {
  const list = items.filter((x) => x.category === category);
  if (category === "concert") return list.sort(byStart);
  const d = (x) => x.walkMin ?? (x.distanceKm != null ? x.distanceKm * 13.4 : Infinity);
  return list.sort(sort === "name" ? (a, b) => a.name.localeCompare(b.name) : (a, b) => (d(a) - d(b)) || a.name.localeCompare(b.name));
}

/**
 * Food places under the FOOD_GROUPS headings, keeping their order (placesIn's sort) inside each group.
 * Empty groups are left out; places without a known group come last under "More food".
 * -> [{ group, label, items }]
 */
export function foodGroups(places) {
  const out = FOOD_GROUPS.map(([group, label]) => ({ group, label, items: places.filter((x) => x.group === group) }));
  out.push({ group: null, label: "More food", items: places.filter((x) => !FOOD_GROUPS.some(([g]) => g === x.group)) });
  return out.filter((g) => g.items.length);
}

/**
 * Practical entries under the PRACTICAL_TOPICS headings, in file order inside each; empty topics left out.
 * -> [{ topic, label, entries }]
 */
export function practicalGroups(entries) {
  return PRACTICAL_TOPICS.map(([topic, label]) => ({ topic, label, entries: (entries ?? []).filter((e) => e.topic === topic) }))
    .filter((g) => g.entries.length);
}

/** When a practical entry happens: "Wed 28 Oct · 19:15", "Tue 27 Oct · 19:15–21:00", "" without a start. */
export function whenLabel(e) {
  const day = romeDay(e?.startISO);
  if (!day) return "";
  const end = e.endISO && romeDay(e.endISO) === day ? `–${romeTime(e.endISO)}` : "";
  return `${dayLong(day)} · ${romeTime(e.startISO)}${end}`;
}

/** Hosts that mean "the organisers' own website" (the source of iswcTip and the practical entries). */
export const ISWC_HOST = "iswc2026.semanticweb.org";
/** The ISWC 2026 website page an entry cites, or null. */
export const iswcSource = (x) => (x?.sources ?? []).find((u) => hostOf(u) === ISWC_HOST) ?? null;

/** Count per category, for the filter. -> { concert: 3, venue: 5, … } */
export function categoryCounts(items, nowISO) {
  const out = Object.fromEntries(CATEGORIES.map((c) => [c, 0]));
  for (const x of items) if (x.category !== "concert" || !isPast(x, nowISO)) out[x.category]++;
  return out;
}

/** 12 -> "12 min walk", 75 -> "1 h 15 min walk"; null/undefined -> "" (day trips have no walk). */
export function walkLabel(min) {
  if (min == null || !Number.isFinite(min)) return "";
  const m = Math.max(1, Math.round(min));
  return m < 60 ? `${m} min walk` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""} walk`;
}

/** 41.1171, 16.8719 -> "https://www.openstreetmap.org/?mlat=41.1171&mlon=16.8719#map=18/41.1171/16.8719" (null without coords). */
export function osmUrl(lat, lon) {
  if (num(lat) == null || num(lon) == null) return null;
  return safeUrl(`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=18/${lat}/${lon}`);
}

/** A Google Maps search for the place: "name, address" (or the coordinates). */
export function googleMapsUrl(item) {
  const q = item?.name && item?.address ? `${item.name}, ${item.address}` : num(item?.lat) != null && num(item?.lon) != null ? `${item.lat},${item.lon}` : item?.name;
  return q ? safeUrl(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`) : null;
}

/** The train line of a day trip: "Trenitalia · Bari Centrale → Matera · 1 h 30 min" from what it has. */
export function trainLine(item) {
  const route = item?.line ?? (item?.from ? `from ${item.from}` : null);
  return [item?.operator, route, item?.journey].map(str).filter(Boolean).join(" · ");
}

/** "2026-10-24" -> "Checked Sat 24 Oct" ("" without a date). */
export const checkedLabel = (d) => (d ? `Checked ${dayLong(d)}` : "");

/**
 * A source link's label: the ISWC 2026 website by page, else the hostname.
 * "https://iswc2026.semanticweb.org/#/attending/visa" -> "ISWC 2026 website (visa)",
 * "https://iswc2026.semanticweb.org/" -> "ISWC 2026 website", "https://www.example.it/x" -> "example.it"
 */
export function sourceLabel(u) {
  if (hostOf(u) !== ISWC_HOST) return hostOf(u);
  const page = (u.split("#")[1] ?? "").split("?")[0].split("/").filter(Boolean).pop();
  return page ? `ISWC 2026 website (${page})` : "ISWC 2026 website";
}

/** A friendly hostname for a source link. "https://www.example.it/x" -> "example.it" */
export function hostOf(u) {
  try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; }
}
