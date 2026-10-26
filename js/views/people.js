// People (#/people): a directory of everyone at ISWC with faces. A grid of cards (photo or a generated
// avatar, name, affiliation, role badges, latest publication), filter chips and a search box. Cards come
// in pages of PAGE with "Show more" (and more when the end scrolls into view), so ~700 people stay fast.
// The pure parts (avatars, roles, filters, order) are in js/people-dir-model.js. Also exports faceEl and
// photoCreditLine for the person page.
import { h, icon } from "../ui.js";
import { flag } from "../people-model.js";
import { directory, DIR_FILTERS, avatarOf, photoOf, roleBadges, latestLine } from "../people-dir-model.js";
import { imgUrl } from "../images-model.js";

const KEY = "iswc26:people"; // sessionStorage: { q, filter }, a per-tab convenience
const PAGE = 60;
const DEBOUNCE_MS = 120;
const ext = (url, cls, ...kids) => h("a", { class: cls, href: url, target: "_blank", rel: "noopener noreferrer" }, ...kids);
const plural = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;

function loadState() {
  try {
    const s = JSON.parse(sessionStorage.getItem(KEY)) ?? {};
    return { q: typeof s.q === "string" ? s.q : "", filter: DIR_FILTERS.some(([f]) => f === s.filter) ? s.filter : "all" };
  } catch { return { q: "", filter: "all" }; }
}
function saveState(st) {
  try { sessionStorage.setItem(KEY, JSON.stringify(st)); } catch { /* private mode: the filter just isn't remembered */ }
}

/**
 * A round face, `size` px: the person's photo over their initials avatar (the avatar stays when the photo
 * is missing or fails to load). Decorative (alt ""): the name is always next to it.
 */
export function faceEl(person, size = 64, { eager = false } = {}) {
  const av = avatarOf(person);
  const ph = photoOf(person);
  const face = h("span", { class: "pp-face", "aria-hidden": "true", style: { width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * 0.38)}px` }, "--sw": `var(--tp-${av.swatch})` },
    h("span", { class: "pp-initials" }, av.initials));
  if (ph) {
    const img = h("img", { class: "pp-photo", src: imgUrl(ph.file), alt: "", width: size, height: size, decoding: "async", loading: eager ? "eager" : "lazy", draggable: false });
    img.addEventListener("error", () => img.remove(), { once: true });
    face.append(img);
  }
  return face;
}

/** "Photo: Author · CC BY-SA 4.0 · Source" under a person's photo; null without one. */
export function photoCreditLine(person) {
  const ph = photoOf(person);
  if (!ph) return null;
  return h("p", { class: "pp-credit" }, "Photo: ", ph.author || "author not stated", " · ",
    ph.licenseUrl ? ext(ph.licenseUrl, "fig-link", ph.license) : ph.license,
    ph.pageUrl ? [" · ", ext(ph.pageUrl, "fig-link", "Source")] : null);
}

function card(program, { person: p, counts }) {
  const a = p.affiliations?.[0];
  const latest = latestLine(p);
  const badges = roleBadges(counts);
  return h("li", {}, h("a", { class: "pp-card", href: `#/person/${encodeURIComponent(p.id)}` },
    faceEl(p, 56),
    h("span", { class: "pp-text" },
      h("span", { class: "pp-name" }, p.name),
      a ? h("span", { class: "pp-aff" }, [flag(a.country), a.name].filter(Boolean).join(" ")) : null,
      p.bio?.text ? h("span", { class: "pp-bio" }, p.bio.text) : null,
      badges.length ? h("span", { class: "pp-badges" }, badges.map((b) => h("span", { class: `pp-badge pp-${b.role}` },
        b.role === "author" || b.n > 1 ? `${b.label} · ${b.n}` : b.label))) : null,
      latest ? h("span", { class: "pp-latest" }, h("span", { class: "sr-only" }, "Latest publication: "), latest) : null)));
}

/** renderPeople(root, program) -> cleanup() */
export function renderPeople(root, program) {
  const st = loadState();
  let shown = PAGE;
  let timer = null;
  let entries = [];

  const input = h("input", {
    type: "search", class: "search-input", placeholder: "Search names and affiliations", value: st.q,
    autocomplete: "off", autocapitalize: "off", spellcheck: false, enterkeyhint: "search", "aria-label": "Search people",
  });
  const clear = h("button", { type: "button", class: "search-clear", "aria-label": "Clear search", hidden: !st.q }, icon("x", { size: 18 }));
  const seg = h("div", { class: "seg pp-seg", role: "group", "aria-label": "Show" });
  const summary = h("p", { class: "browse-count", role: "status", "aria-live": "polite" });
  const grid = h("ul", { class: "pp-grid" });
  const more = h("button", { type: "button", class: "pill-btn pp-more", hidden: true, onclick: () => grow() }, "Show more");

  const persist = () => saveState({ q: st.q, filter: st.filter });

  function grow() {
    const from = grid.childElementCount;
    shown = Math.min(entries.length, from + PAGE);
    grid.append(...entries.slice(from, shown).map((e) => card(program, e)));
    more.hidden = shown >= entries.length;
    more.textContent = `Show more (${entries.length - shown} left)`;
  }

  function draw() {
    const q = st.q.trim();
    const r = directory(program, { filter: st.filter, q });
    entries = r.entries;
    seg.replaceChildren(...DIR_FILTERS.map(([f, label]) => h("button", {
      type: "button", class: "seg-btn", "aria-pressed": String(st.filter === f),
      onclick: () => { if (st.filter === f) return; st.filter = f; persist(); draw(); },
    }, label, h("span", { class: "pp-n" }, String(r.tally[f])))));
    const what = DIR_FILTERS.find(([f]) => f === st.filter)[1].toLowerCase();
    summary.textContent = entries.length
      ? `${plural(entries.length, "person", "people")}${st.filter === "all" ? "" : ` (${what})`}${q ? ` matching "${q}"` : ""}. Organisers and speakers first, then by name.`
      : q ? `Nobody matches "${q}"${st.filter === "all" ? "" : ` among ${what}`}` : `No ${what} in this programme`;
    grid.replaceChildren();
    shown = 0;
    if (!entries.length) {
      grid.append(h("li", { class: "empty browse-empty" }, h("h2", {}, "Nobody here"),
        h("p", {}, q ? "Every word has to match a name or an affiliation." : "Try another filter."),
        q ? h("div", { class: "empty-actions" }, h("button", { type: "button", class: "pill-btn primary", onclick: () => setQuery("") }, "Clear search")) : null));
      more.hidden = true;
      return;
    }
    grow();
  }

  function setQuery(q) {
    input.value = q; st.q = q; clear.hidden = !q;
    persist(); draw();
    if (!q) input.focus();
  }

  input.addEventListener("input", () => {
    clear.hidden = !input.value;
    clearTimeout(timer);
    timer = setTimeout(() => { st.q = input.value; persist(); draw(); }, DEBOUNCE_MS);
  });
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") input.blur(); });
  clear.addEventListener("click", () => { clearTimeout(timer); setQuery(""); });

  // The next page comes in by itself when "Show more" nears the screen (the button stays for keyboards).
  const io = typeof IntersectionObserver === "function"
    ? new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting) && !more.hidden) grow(); }, { rootMargin: "600px 0px" })
    : null;
  io?.observe(more);

  draw();
  const total = (program.people ?? []).length;
  root.replaceChildren(h("section", { class: "view people-view" },
    h("div", { class: "view-head" }, h("h1", { class: "view-title" }, "People"),
      h("a", { class: "sq-entry", href: "#/browse" }, icon("browse", { size: 18 }), h("span", {}, "Browse"))),
    h("p", { class: "pp-intro" }, `${plural(total, "person", "people")} at ISWC 2026: organisers, chairs, speakers and authors.`),
    h("div", { class: "browse-bar" },
      h("div", { class: "search-box" }, icon("search", { size: 20 }), input, clear),
      h("div", { class: "chip-row pp-seg-row" }, seg)),
    summary, grid, more,
    h("p", { class: "src-note pp-note" }, "Photos only where an openly licensed one exists (see ", h("a", { href: "#/credits" }, "Credits"), "); everyone else gets a generated avatar.")));

  return () => {
    io?.disconnect();
    clearTimeout(timer);
    if (input.value !== st.q) { st.q = input.value; persist(); } // flush a pending debounce
  };
}
