// The People directory and the richer person page, pure (no DOM): avatars (initials and a colour from the
// id), roles (organiser, chair, speaker, author), latest publications, the directory's filters and order,
// a person's photo with its credit, and organiser / chair names linked to their people.
// Unit-tested in tests/app/people-dir.test.mjs.
import { safeUrl, personOf, searchPeople } from "./people-model.js";
import { localFile, httpsUrl } from "./images-model.js";
import { TOPIC_SWATCHES } from "./explore-model.js";

/** Role order everywhere: organisers, chairs, speakers. */
export const ROLES = ["organizer", "chair", "speaker"];
export const ROLE_LABEL = { organizer: "Organiser", chair: "Chair", speaker: "Speaker", author: "Author" };

/** Directory filters: id -> label. */
export const DIR_FILTERS = [["all", "All"], ["organisers", "Organisers & chairs"], ["speakers", "Speakers"], ["authors", "Authors"]];

const fold = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

const SUFFIX = /^(jr|sr|ii|iii|iv|phd)\.?$/i;
/** Two initials, first and last name: "Marcelo de Oliveira Costa Machado" -> "MM", "Jorão Gomes Jr." -> "JG", "Plato" -> "P". */
export function initials(name) {
  const words = String(name ?? "").split(/[\s]+/).map((w) => w.replace(/^[^\p{L}]+/u, "")).filter((w) => w && !SUFFIX.test(w));
  if (!words.length) return "?";
  const first = words[0];
  // The last word that starts with a capital ("van", "de" and "der" are skipped when something follows).
  const last = words.length > 1 ? [...words.slice(1)].reverse().find((w) => /^\p{Lu}/u.test(w)) ?? words[words.length - 1] : null;
  return (first[0] + (last ? last[0] : "")).toLocaleUpperCase();
}

/** Avatar for a person without a photo: { initials, swatch } where swatch picks a --tp-<n> colour (0–9), stable per id. */
export function avatarOf(person) {
  return { initials: initials(person?.name), swatch: hash(String(person?.id ?? person?.name ?? "")) % TOPIC_SWATCHES };
}

/**
 * The person's openly licensed photo, or null: a local img/ file and a licence are required, links https only.
 * -> { file, author, license, licenseUrl, pageUrl }
 */
export function photoOf(person) {
  const ph = person?.photo;
  const file = localFile(ph?.file);
  if (!file || !ph.license) return null;
  return { file, author: ph.author ?? "", license: ph.license, licenseUrl: httpsUrl(ph.licenseUrl), pageUrl: httpsUrl(ph.pageUrl) };
}

// Session roles per person, derived from the sessions once per program (data without person.roles).
const derived = new WeakMap();
function sessionRoles(program) {
  if (!derived.has(program)) {
    const m = new Map();
    const add = (pid, itemId, role) => { if (pid) m.set(pid, [...(m.get(pid) ?? []), { itemId, role }]); };
    for (const s of program.sessions ?? []) {
      (s.organizerIds ?? []).forEach((pid) => add(pid, s.id, "organizer"));
      (s.chairIds ?? []).forEach((pid) => add(pid, s.id, "chair"));
      add(s.speakerId, s.id, "speaker");
    }
    derived.set(program, m);
  }
  return derived.get(program);
}

const timeKey = (s) => `${s.startISO ?? ""}${s.day ?? ""}${s.start ?? ""}`;

/**
 * A person's session roles -> [{ role, item }], organiser then chair then speaker, each by session time.
 * Uses person.roles when present, plus what the sessions themselves say (organizerIds, chairIds, speakerId);
 * an item that is no longer in the program is skipped, a repeat counts once.
 */
export function personRoles(program, person) {
  if (!person) return [];
  const seen = new Set();
  const out = [];
  for (const r of [...(person.roles ?? []), ...(sessionRoles(program).get(person.id) ?? [])]) {
    const item = program.byId.get(r?.itemId);
    if (!ROLES.includes(r?.role) || !item?.paperIds || seen.has(`${r.role} ${r.itemId}`)) continue;
    seen.add(`${r.role} ${r.itemId}`);
    out.push({ role: r.role, item });
  }
  return out.sort((a, b) => ROLES.indexOf(a.role) - ROLES.indexOf(b.role) || timeKey(a.item).localeCompare(timeKey(b.item)));
}

/** Counts per role -> { organizer, chair, speaker, author } (author = their papers at ISWC). */
export function roleCounts(program, person) {
  const c = { organizer: 0, chair: 0, speaker: 0, author: 0 };
  for (const r of personRoles(program, person)) c[r.role]++;
  c.author = (person?.itemIds ?? []).filter((id) => Array.isArray(program.byId.get(id)?.authors)).length;
  return c;
}

/** Badges for a card: [{ role, label, n }] for every non-zero count, in ROLES order then Author. */
export function roleBadges(counts) {
  return [...ROLES, "author"].filter((r) => counts[r] > 0).map((r) => ({ role: r, label: ROLE_LABEL[r], n: counts[r] }));
}

/**
 * Publications with a safe https url and a title, newest first, then most cited; works without a year last.
 * -> the original work objects (url replaced by its safe form), at most `max`.
 */
export function latestWorks(person, max = 5) {
  return (person?.works ?? []).map((w, i) => ({ w, i, url: safeUrl(w?.url) })).filter((x) => x.url && x.w.title)
    .sort((a, b) => (Number(b.w.year) || 0) - (Number(a.w.year) || 0) || (Number(b.w.citedBy) || 0) - (Number(a.w.citedBy) || 0) || a.i - b.i)
    .slice(0, max).map((x) => ({ ...x.w, url: x.url }));
}

/** One line for a card: "Title (Venue, 2025)" from the latest work, or "". */
export function latestLine(person) {
  const w = latestWorks(person, 1)[0];
  if (!w) return "";
  const meta = [w.venue, w.year].filter(Boolean).join(", ");
  return meta ? `${w.title} (${meta})` : w.title;
}

/** Directory rank: organisers and speakers 0, chairs 1, everyone else 2. */
export const rankOf = (c) => (c.organizer || c.speaker ? 0 : c.chair ? 1 : 2);

const passes = (filter, c) => filter === "organisers" ? c.organizer + c.chair > 0
  : filter === "speakers" ? c.speaker > 0
  : filter === "authors" ? c.author > 0
  : true;

/**
 * The directory: everyone (or the search matches, every word in a name or affiliation) who passes
 * `filter` ("all" | "organisers" | "speakers" | "authors"), organisers and speakers first, then chairs,
 * then by name. -> { entries: [{ person, counts }], tally: { all, organisers, speakers, authors } }
 * (the tally counts the search matches per filter, for the chip labels).
 */
export function directory(program, { filter = "all", q = "" } = {}) {
  const pool = String(q).trim() ? searchPeople(program, q) : program.people ?? [];
  const tally = { all: 0, organisers: 0, speakers: 0, authors: 0 };
  const entries = [];
  for (const person of pool) {
    const counts = roleCounts(program, person);
    for (const f of Object.keys(tally)) if (passes(f, counts)) tally[f]++;
    if (passes(filter, counts)) entries.push({ person, counts, rank: rankOf(counts) });
  }
  entries.sort((a, b) => a.rank - b.rank || a.person.name.localeCompare(b.person.name) || (a.person.id < b.person.id ? -1 : 1));
  return { entries: entries.map(({ person, counts }) => ({ person, counts })), tally };
}

/** "A, B and C" separators: the text that goes before the i-th of n names. */
export const joinSep = (i, n) => (i === 0 ? "" : i === n - 1 ? " and " : ", ");

/**
 * Names from an organisers / chairs text with their person ids -> [{ name, personId | null }].
 * The text is split on commas, semicolons, "and" and "&". A name is linked to the id whose person has the
 * same name (accents and punctuation ignored); failing that, by position when the counts agree. No ids:
 * every name stays plain text.
 */
export function nameRefs(program, text, ids) {
  const names = String(text ?? "").split(/\s*(?:[,;]|\s&\s|\band\b)\s*/).map((s) => s.trim()).filter(Boolean)
    .reduce((acc, s) => (SUFFIX.test(s) && acc.length ? [...acc.slice(0, -1), `${acc[acc.length - 1]}, ${s}`] : [...acc, s]), []);
  const people = (ids ?? []).map((id) => personOf(program, id)).filter(Boolean);
  const byName = new Map(people.map((p) => [fold(p.name), p.id]));
  const used = new Set();
  const refs = names.map((name) => {
    const id = byName.get(fold(name)) ?? null;
    if (id) used.add(id);
    return { name, personId: id };
  });
  if (names.length === (ids ?? []).length) {
    refs.forEach((r, i) => {
      const p = personOf(program, ids[i]);
      if (!r.personId && p && !used.has(p.id)) { r.personId = p.id; used.add(p.id); }
    });
  }
  return refs;
}
