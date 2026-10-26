// Person page: face (photo with its credit, or an avatar), affiliations, roles at ISWC, profiles (verified
// and ORCID self-declared), search links, their ISWC items, co-authors, latest publications, datasets.
import { h, icon, tagPill } from "../ui.js";
import { makeRow } from "./browse.js";
import { flag, searchLinks, personItems, coAuthors, personOf } from "../people-model.js";
import { profilesField, worksField, datasetsField } from "./research.js";
import { logoChip } from "./images.js";
import { faceEl, photoCreditLine } from "./people.js";
import { personRoles, latestWorks, ROLE_LABEL } from "../people-dir-model.js";
import { dayShort, itemTag } from "../model.js";

const COAUTHOR_FIRST = 24; // long lists stay light: the rest sits behind "Show all"
const plural = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;

function back() {
  if (history.length > 1) history.back();
  else location.hash = "#/browse";
}

const ext = (l, cls, ...kids) => h("a", { class: cls, href: l.url, target: "_blank", rel: "noopener noreferrer" }, ...kids);

/**
 * "About": the person's short bio and where it comes from: their Wikipedia article (CC BY-SA, linked), their own
 * ORCID biography, or a summary written for this app with the pages it is based on. null without a bio.
 */
function bioField(p) {
  const b = p.bio;
  if (!b?.text) return null;
  const link = (url, label) => h("a", { class: "fig-link", href: url, target: "_blank", rel: "noopener noreferrer" }, label);
  const note = b.kind === "wikipedia"
    ? ["From ", b.url ? link(b.url, "Wikipedia") : "Wikipedia", b.license ? [" · ", b.licenseUrl ? link(b.licenseUrl, b.license) : b.license] : null]
    : b.kind === "orcid"
      ? ["In their own words, from ", b.url ? link(b.url, "their ORCID record") : "their ORCID record"]
      : ["Written for this app from ", b.sources.map((u, i) => [i ? ", " : "", link(u, sourceHost(u))])];
  return h("div", { class: "field bio-field" }, h("h3", {}, "About"), h("p", { class: "bio-text" }, b.text),
    h("p", { class: "src-note field-src" }, note));
}

/** "https://www.uni.edu/staff/x" -> "uni.edu" */
const sourceHost = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return "source"; } };

/** The person's content (no page bar), for the full page and desktop panels -> { found, nodes, cleanup }. */
export function personContent(program, store, id) {
  const p = personOf(program, id);
  if (!p) {
    return { found: false, cleanup: () => {}, nodes: [
      h("div", { class: "empty" }, h("h2", {}, "This person isn't in the current program"),
        h("p", {}, "The link may be from an older version of the program."),
        h("div", { class: "empty-actions" }, h("a", { class: "pill-btn primary", href: "#/browse" }, "Browse the programme")))] };
  }
  const items = personItems(program, p);
  const co = coAuthors(program, p);
  const syncs = new Map();
  const refresh = (itemId) => (syncs.get(itemId) ?? []).forEach((f) => f());
  const disposers = [];

  const affs = (p.affiliations ?? []).map((a) => h("li", { class: "aff" },
    logoChip(a.logo, a.name, { height: 28, cls: "aff-logo" }),
    a.country ? h("span", { class: "aff-flag", role: "img", "aria-label": a.country }, flag(a.country) || a.country) : null,
    h("span", {}, a.name), a.country ? h("span", { class: "aff-cc" }, a.country) : null));

  // "Organiser of <session>", "Chair of …", "Speaker at …", each linked, with the session's type and day.
  const roles = personRoles(program, p);
  const roleList = roles.length ? h("ul", { class: "pp-roles" }, roles.map((r) => h("li", {},
    h("span", { class: `pp-badge pp-${r.role}` }, ROLE_LABEL[r.role]),
    h("span", { class: "pp-role-text" },
      h("span", {}, r.role === "speaker" ? "at " : "of ", h("a", { class: "person-link", href: `#/item/${encodeURIComponent(r.item.id)}` }, r.item.title)),
      h("span", { class: "row-meta row-tagline" }, tagPill(itemTag(program, r.item), "row"), r.item.day ? h("span", {}, `${dayShort(r.item.day)} ${r.item.start ?? ""}`.trim()) : null))))) : null;

  const section = (title, ...c) => h("div", { class: "field" }, h("h3", {}, title), ...c);

  const rows = h("ul", { class: "row-list" }, items.map((x) => {
    const r = makeRow(program, store, x, refresh);
    syncs.set(x.id, [...(syncs.get(x.id) ?? []), r.sync]);
    disposers.push(r.dispose);
    return r.li;
  }));

  const coList = h("div", { class: "chip-wrap" });
  const chip = (c) => h("a", { class: "chip person-chip", href: `#/person/${encodeURIComponent(c.person.id)}` },
    c.person.name, c.shared > 1 ? h("span", { class: "chip-count" }, String(c.shared)) : null);
  const drawCo = (all) => {
    const shown = all ? co : co.slice(0, COAUTHOR_FIRST);
    coList.replaceChildren(...shown.map(chip), ...(!all && co.length > shown.length
      ? [h("button", { type: "button", class: "chip chip-more", onclick: () => drawCo(true) }, `Show all ${co.length}`)] : []));
  };
  drawCo(false);

  return { found: true, cleanup: () => disposers.splice(0).forEach((f) => f()), nodes: [
    h("header", { class: "detail-head person-head", "--kind": "var(--sea)" },
      h("div", { class: "pp-head-face" }, faceEl(p, 96, { eager: true }), photoCreditLine(p)),
      h("div", { class: "card-top" }, h("span", { class: "kind-pill" }, "Person")),
      h("h1", { class: "detail-title" }, p.name),
      affs.length ? h("ul", { class: "aff-list" }, affs) : null,
      h("p", { class: "detail-when" }, icon("people", { size: 20 }), h("span", {}, plural(items.length, "item") + " at ISWC 2026")),
      (p.affiliations ?? []).some((a) => a.logo) ? h("a", { class: "src-note aff-credit", href: "#/credits" }, "Image credits") : null),
    bioField(p),
    roleList ? section("Roles at ISWC", roleList) : null,
    profilesField(p),
    section("Look them up",
      h("div", { class: "link-btns" }, searchLinks(p.name).map((l) => ext(l, "pill-btn link-btn search-btn", icon("search", { size: 18 }), l.label))),
      h("p", { class: "src-note" }, "These are searches built from the name, not verified profiles. Results may include other people with the same name.")),
    items.length ? section("At ISWC", rows) : null,
    co.length ? section(`Co-authors at ISWC (${co.length})`, coList) : null,
    worksField(p, { works: latestWorks(p, 5), title: "Latest publications" }),
    datasetsField(p)] };
}

/** renderPerson(root, program, store, id) -> cleanup() */
export function renderPerson(root, program, store, id) {
  const backBtn = h("button", { class: "back-btn", type: "button", onclick: back }, icon("back"), "Back");
  const c = personContent(program, store, id);
  root.replaceChildren(h("section", { class: `view detail-view${c.found ? " person-view" : ""}` }, h("div", { class: "detail-bar" }, backBtn), c.nodes));
  return c.cleanup;
}
