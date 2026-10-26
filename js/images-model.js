// Images and credits (pure, no DOM): which image an item shows, credit and caption text, https-only links,
// the credits page model and the "save images for offline" loop. The files live under app/img/ (relative paths,
// cached by the service worker at runtime, not precached). Data shapes: see data.js (shapeImage, creditsOf).
import { IMG_VERSIONS } from "./img-versions.js";


/** Name of the runtime image cache. Must equal IMG_CACHE in sw.js (tests/app/sw.test.mjs checks). */
export const IMG_CACHE = "iswc26-img";

/** The url the app renders for an image file: img/x.webp?v=<hash> (hashes from `make stamp`), so a replaced file is refetched. */
export const imgUrl = (file) => (IMG_VERSIONS[file] ? `${file}?v=${IMG_VERSIONS[file]}` : file);

/** Logo tooltip: "Institution — logo: author, licence". */
export const logoTitle = (name, im) => `${name} — logo: ${[im?.credit?.author, im?.credit?.license].filter(Boolean).join(", ")}`;

/** The caption's kind label unless the title only repeats it (case-insensitive): "" for a repeat. */
export const dedupeTitle = (kindLabel, title) => (String(kindLabel ?? "").trim().toLowerCase() === String(title ?? "").trim().toLowerCase() ? "" : title ?? "");

/** The url when it is a plain https link, else null: nothing else is ever rendered as a link. */
export const httpsUrl = (u) => {
  try {
    const x = new URL(String(u ?? ""));
    return x.protocol === "https:" && x.hostname ? x.href : null;
  } catch { return null; }
};

/** An image file path is local and relative: "img/..." with no scheme, no "..", no leading slash. */
export const localFile = (f) => (typeof f === "string" && /^img\/[\w./-]+$/.test(f) && !f.includes("..") ? f : null);

/** A usable image: a local file, positive size and a credit. */
export function validImage(im) {
  return !!im && !!localFile(im.file) && im.width > 0 && im.height > 0 && !!im.credit?.license;
}

/** "owner/repo" of a github.com page url, else null. */
export function repoName(pageUrl) {
  const u = httpsUrl(pageUrl);
  if (!u) return null;
  const x = new URL(u);
  if (!/^(www\.)?github\.com$/.test(x.hostname)) return null;
  const [o, r] = x.pathname.split("/").filter(Boolean);
  return o && r ? `${o}/${r.replace(/\.git$/, "")}` : null;
}

/** "Author · Licence" (either may be missing). */
export const creditLine = (im) => [im?.credit?.author, im?.credit?.license].filter(Boolean).join(" · ");

/**
 * Caption of a paper figure: { label, repo, licence, href, licenceHref, text }.
 * "Figure from owner/repo · Apache-2.0"; the page link is https only (else null: plain text).
 */
export function figureCaption(im) {
  const c = im?.credit ?? {};
  const repo = repoName(c.pageUrl);
  const label = repo ? "Figure from" : "Image by";
  const name = repo ?? c.author ?? "";
  return { label, name, licence: c.license ?? "", href: httpsUrl(c.pageUrl), licenceHref: httpsUrl(c.licenseUrl),
    text: [`${label} ${name}`.trim(), c.license].filter(Boolean).join(" · ") };
}

/** The picture a paper shows as its hero (null: the generated thumbnail stands alone). Sessions have none. */
export const heroImage = (item) => (item && !item.paperIds && validImage(item.image) ? item.image : null);

/** Logos of a person's affiliations, in order: [{ name, logo | null }]. */
export const affiliationLogos = (person) => (person?.affiliations ?? []).map((a) => ({ name: a.name, logo: validImage(a.logo) ? a.logo : null }));

/** Size an image to a height, keeping its ratio (for width / height attributes) -> { width, height }. */
export function fitHeight(im, height) {
  return { width: Math.max(1, Math.round((im.width / im.height) * height)), height };
}

/** The Bari photo for a day: they alternate by day (deterministic: the same photo all day). null when none. */
export function placeHero(program, dateISO = "") {
  const list = (program?.place ?? []).filter(validImage);
  if (!list.length) return null;
  const t = Date.parse(`${String(dateISO).slice(0, 10)}T12:00:00Z`);
  const day = Number.isFinite(t) ? Math.floor(t / 864e5) : 0;
  return list[((day % list.length) + list.length) % list.length];
}

/**
 * Credits of people's photos -> imageCredits-shaped entries ({ kind: "person-photo", file, subject, ... }):
 * the program's own "person-photo" entries, plus a person.photo that has none (same file listed once).
 */
export function personPhotoCredits(program) {
  const listed = (program?.imageCredits ?? []).filter((c) => c.kind === "person-photo" && localFile(c.file));
  const have = new Set(listed.map((c) => c.file));
  const extra = (program?.people ?? []).filter((p) => localFile(p.photo?.file) && p.photo.license && !have.has(p.photo.file))
    .map((p) => ({ kind: "person-photo", file: p.photo.file, subject: p.name, author: p.photo.author ?? "", license: p.photo.license,
      licenseUrl: p.photo.licenseUrl, pageUrl: p.photo.pageUrl }));
  return [...listed, ...extra];
}

/** Every distinct image file the program can show (people's photos included), sorted. */
export function imageFiles(program) {
  return [...new Set([...(program?.imageCredits ?? []), ...personPhotoCredits(program)].map((c) => localFile(c.file)).filter(Boolean))].sort();
}

export const KIND_TITLES = { "person-photo": "People", place: "Bari", repo: "Figures from code repositories", logo: "Institution and graph logos" };

/** The credits page: groups of entries (links https only) plus the data sources. */
export function creditsModel(program) {
  const dim = new Map();
  const note = (im) => { if (validImage(im)) dim.set(im.file, im); };
  (program?.place ?? []).forEach(note);
  (program?.papers ?? []).forEach((p) => note(p.image));
  (program?.people ?? []).forEach((p) => (p.affiliations ?? []).forEach((a) => note(a.logo)));
  // Person photos carry their licence flat (photo.license), not in photo.credit.
  (program?.people ?? []).forEach(({ photo: ph }) => { if (localFile(ph?.file) && ph.width > 0 && ph.height > 0) dim.set(ph.file, ph); });
  (program?.graphs ?? []).forEach((g) => note(g.logo));
  const groups = Object.keys(KIND_TITLES).map((kind) => ({
    kind, title: KIND_TITLES[kind],
    entries: (kind === "person-photo" ? personPhotoCredits(program) : (program?.imageCredits ?? []).filter((c) => c.kind === kind && localFile(c.file))).map((c) => ({
      file: c.file, subject: c.subject, author: c.author ?? "", license: c.license ?? "",
      licenseUrl: httpsUrl(c.licenseUrl), pageUrl: httpsUrl(c.pageUrl),
      width: dim.get(c.file)?.width ?? 0, height: dim.get(c.file)?.height ?? 0,
    })),
  })).filter((g) => g.entries.length);
  return { groups, total: groups.reduce((n, g) => n + g.entries.length, 0), sources: DATA_SOURCES };
}

/** What the data itself comes from (all https). */
export const DATA_SOURCES = [
  { name: "ISWC 2026 website", url: "https://iswc2026.semanticweb.org", what: "The programme: sessions, papers, rooms, people, the venue and its tips." },
  { name: "Workshop websites", url: "https://sci-k.github.io/2026/", what: "Workshop programmes, talks and papers, as each workshop publishes them (Sci-K and 29 more)." },
  { name: "Springer and Crossref", url: "https://link.springer.com/book/9783032420145", what: "The LNCS chapters of the proceedings and their DOIs." },
  { name: "OpenAlex", url: "https://openalex.org", what: "Author profiles, recent works, open abstracts and datasets (CC0)." },
  { name: "DBLP", url: "https://dblp.org", what: "Authors and their publications (CC0)." },
  { name: "ORCID", url: "https://orcid.org", what: "Identifiers, employments, links and biographies people publish on their own record." },
  { name: "Wikidata", url: "https://www.wikidata.org", what: "Identifiers, institution logos (via ROR), the knowledge graph endpoint (CC0)." },
  { name: "Wikipedia", url: "https://en.wikipedia.org", what: "Short bios, quoted with a link and their licence (CC BY-SA 4.0)." },
  { name: "ROR", url: "https://ror.org", what: "Research organisations behind people's affiliations (CC0)." },
  { name: "Wikimedia Commons", url: "https://commons.wikimedia.org", what: "Institution logos, people's photos and the photos of Bari, each under its own licence." },
  { name: "OpenStreetMap", url: "https://www.openstreetmap.org", what: "Where the places in the Bari guide are (ODbL)." },
  { name: "GitHub", url: "https://github.com", what: "Code repositories and the figures from their README files, only under open licences." },
];

/**
 * Save images for offline: fetch every file not yet in the cache and put it there, `concurrency` at a time.
 * `cache` = { match(url), put(url, res) }; `fetchFn(url)` -> Response-like { ok, clone() }.
 * onProgress({done, total, failed}) after each file. Never throws for one failing file.
 * -> { done, total, failed }
 */
export async function saveImages(files, { cache, fetchFn, onProgress = () => {}, signal = null, concurrency = 1 } = {}) {
  const total = files.length;
  let done = 0, failed = 0, next = 0;
  const one = async (f) => {
    try {
      if (!(await cache.match(f))) {
        const res = await fetchFn(f);
        if (!res?.ok) throw new Error(`HTTP ${res?.status}`);
        await cache.put(f, res.clone ? res.clone() : res);
      }
      done++;
    } catch { failed++; }
    onProgress({ done, total, failed });
  };
  const worker = async () => { while (next < total && !signal?.aborted) await one(files[next++]); };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, total)) }, worker));
  return { done, total, failed };
}

/** How many of the files are already cached. */
export async function countCached(files, cache) {
  let n = 0;
  for (const f of files) { try { if (await cache.match(f)) n++; } catch { /* counted as missing */ } }
  return n;
}
