// Sci-K (#/sci-k): the Sci-K 2026 workshop on its own page. The head (when, where, keep the whole workshop,
// map, website), what's on now / next during the day, the timed programme from the workshop's own website
// (with "Now" / "Next" marks that follow the app clock), everyone involved as faces with their roles, and the
// projects its papers point to (code and data repositories named in the papers). Pure parts:
// js/workshop-model.js (tests/app/workshop.test.mjs).
import { h, icon } from "../ui.js";
import { dayLong, timeRange, placeOf } from "../model.js";
import { personItems } from "../people-model.js";
import { scikSession, agendaStates, workshopPeople, workshopProjects, shortUrl } from "../workshop-model.js";
import { agendaField, verdictToggle } from "./detail.js";
import { faceEl } from "./people.js";

const ext = (url, cls, ...kids) => h("a", { class: cls, href: url, target: "_blank", rel: "noopener noreferrer" }, ...kids);
const ROLE_LABEL = { organiser: "Organiser", chair: "Chair", keynote: "Keynote", author: "Author" };
const KIND = { code: ["code", "Code"], dataset: ["dataset", "Data"], "hf-model": ["code", "Model"], "hf-dataset": ["dataset", "Data"], "hf-space": ["code", "Demo"] };

function personCard(program, { person: p, roles, talkIds }) {
  const a = p.affiliations?.[0];
  const talks = talkIds.length;
  return h("li", {}, h("a", { class: "pp-card ws-person", href: `#/person/${encodeURIComponent(p.id)}` },
    faceEl(p, 56),
    h("span", { class: "pp-text" },
      h("span", { class: "pp-name" }, p.name),
      a ? h("span", { class: "pp-aff" }, a.name) : null,
      p.bio?.text ? h("span", { class: "pp-bio" }, p.bio.text) : null,
      h("span", { class: "pp-badges" }, roles.map((r) => h("span", { class: `pp-badge ws-${r}` },
        r === "author" && talks > 1 ? `${ROLE_LABEL[r]} · ${talks}` : ROLE_LABEL[r]))),
      p.works?.length || personItems(program, p).length > talks ? h("span", { class: "pp-latest" },
        p.works?.length ? `${p.works.length} recent ${p.works.length === 1 ? "work" : "works"}` : "Also elsewhere at ISWC") : null)));
}

function projectCard({ paper, links }) {
  return h("li", { class: "ws-project" },
    h("a", { class: "ws-project-paper", href: `#/item/${encodeURIComponent(paper.id)}` }, paper.title),
    h("ul", { class: "ws-links" }, links.map((l) => {
      const [ic, label] = KIND[l.kind] ?? ["link", "Link"];
      return h("li", {}, ext(l.url, "ws-link", icon(ic, { size: 16 }), h("span", { class: "ws-link-kind" }, label),
        h("span", { class: "ws-link-url" }, shortUrl(l.url)), l.stars ? h("span", { class: "ws-stars" }, `★ ${l.stars}`) : null));
    })));
}

/** renderWorkshop(root, program, store, clock) -> cleanup() */
export function renderWorkshop(root, program, store, clock) {
  const s = scikSession(program);
  if (!s) {
    root.replaceChildren(h("section", { class: "view ws-view" }, h("div", { class: "empty" },
      h("h2", {}, "Sci-K isn't in this programme"), h("p", {}, "Its programme comes with the data; update the app to see it."))));
    return () => {};
  }
  const room = s.roomId ? program.byId.get(s.roomId) : null;
  const place = placeOf(program, s);
  const people = workshopPeople(program, s);
  const projects = workshopProjects(program, s);
  const verdict = verdictToggle(store, s.id);
  const nowBox = h("div", { class: "ws-now", "aria-live": "polite" });
  const programme = h("div", { class: "ws-programme" });
  let lastStates = null;

  const draw = () => {
    const states = agendaStates(s, clock.now());
    const key = states.join();
    if (key === lastStates) return;
    lastStates = key;
    const at = (st) => s.agenda[states.indexOf(st)];
    const now = at("now"), next = at("next");
    nowBox.replaceChildren(...[
      now ? h("p", {}, h("strong", {}, "Now "), `${now.start}–${now.end ?? ""} · `, now.talkTitle ?? now.title) : null,
      next ? h("p", {}, h("strong", {}, "Next "), `${next.start} · `, next.talkTitle ?? next.title) : null,
    ].filter(Boolean));
    nowBox.hidden = !now && !next;
    programme.replaceChildren(agendaField(program, store, s, { states }));
  };
  draw();
  const off = clock.subscribe(draw);

  const talks = s.paperIds.length;
  root.replaceChildren(h("section", { class: "view ws-view" },
    h("div", { class: "view-head" }, h("h1", { class: "view-title" }, icon("flask"), "Sci-K 2026")),
    h("header", { class: "ws-head" },
      h("p", { class: "ws-kicker" }, "Workshop"),
      h("h2", { class: "ws-title" }, h("a", { href: `#/item/${encodeURIComponent(s.id)}` }, s.title)),
      h("p", { class: "ws-when" }, icon("clock", { size: 18 }), h("span", {}, h("strong", {}, dayLong(s.day)), ` · ${timeRange(s)}`)),
      h("p", { class: "ws-when" }, icon("map", { size: 18 }), h("span", {}, [place.name, place.floor].filter(Boolean).join(", "))),
      h("p", { class: "ws-facts" }, `${talks} talks · a keynote · ${people.length} people · ${projects.length} projects with code or data`),
      h("div", { class: "ws-actions" },
        room?.floor != null ? h("a", { class: "pill-btn", href: `#/map?room=${encodeURIComponent(room.id)}` }, icon("map", { size: 18 }), "Show on map") : null,
        s.website ? ext(s.website, "pill-btn", icon("external", { size: 18 }), "Workshop website") : null),
      h("p", { class: "ws-keep-label" }, "The whole workshop"),
      verdict),
    nowBox,
    programme,
    h("section", { class: "ws-section", "aria-label": "People" },
      h("h2", { class: "ws-h" }, `People · ${people.length}`),
      h("p", { class: "ws-sub" }, "Organisers, chairs, the keynote speaker and every author. Open one for their photo, profiles and recent work."),
      h("ul", { class: "pp-grid ws-people" }, people.map((e) => personCard(program, e)))),
    projects.length ? h("section", { class: "ws-section", "aria-label": "Projects" },
      h("h2", { class: "ws-h" }, `Projects · ${projects.length}`),
      h("p", { class: "ws-sub" }, "Code and data the papers point to as their own."),
      h("ul", { class: "ws-projects" }, projects.map(projectCard))) : null));
  return () => { off(); verdict.dispose?.(); };
}
