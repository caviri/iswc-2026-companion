// Credits page (#/credits): every image with its author, licence and source page, the data sources, and a
// button that saves all the images for offline use (fetch into the runtime image cache, with progress).
import { h, icon } from "../ui.js";
import { creditsModel, imgUrl, fitHeight } from "../images-model.js";
import { bariGuide } from "./bari.js";
import { guideCredits } from "../bari-model.js";
import { IMAGES as RETE_IMAGES } from "../rete-model.js";

const ext = (url, cls, ...kids) => h("a", { class: cls, href: url, target: "_blank", rel: "noopener noreferrer" }, ...kids);
const plural = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;

/** One credited image; people's photos are cropped round and square, like their face on the People page. */
function entry(e, kind) {
  const box = 56;
  const size = e.width && e.height ? fitHeight({ width: e.width, height: e.height }, box) : { width: box, height: box };
  const w = Math.min(size.width, kind === "logo" ? box * 2 : box * 2), ht = Math.round(size.height * (w / size.width));
  const img = h("img", { class: "cr-img", src: imgUrl(e.file), alt: "", width: w, height: ht, loading: "lazy", decoding: "async" });
  img.addEventListener("error", () => img.remove(), { once: true });
  return h("li", { class: `cr-item cr-${kind}` },
    h("span", { class: `cr-thumb${kind === "logo" ? " logo-chip" : ""}`, style: { "--lw": `${w + 8}px`, "--lh": `${ht + 8}px` } }, img),
    h("span", { class: "cr-text" },
      h("strong", { class: "cr-subject" }, e.subject),
      h("span", { class: "cr-by" }, e.author ? `by ${e.author}` : "author not stated"),
      h("span", { class: "cr-links" },
        e.licenseUrl ? ext(e.licenseUrl, "fig-link", e.license) : h("span", {}, e.license),
        e.pageUrl ? [" · ", ext(e.pageUrl, "fig-link", "Source page", icon("external", { size: 13 }))] : null)));
}

/** Offline copies of every image live in Settings > Offline. */
function offlineBox() {
  return h("div", { class: "cr-offline" }, h("h2", { class: "cr-h" }, "Use the images offline"),
    h("p", { class: "src-note" }, "Each picture downloads the first time it is shown. To save them all now, with the rest of the app, use Settings."),
    h("div", { class: "cr-actions" }, h("a", { class: "pill-btn primary", href: "#/settings" }, icon("download", { size: 18 }), "Offline settings")));
}

/** The Bari guide's photos, added once the guide has loaded (it is a separate file). */
function guideGroup() {
  const sec = h("section", { class: "cr-group", "aria-labelledby": "cr-guide", hidden: true });
  bariGuide().then((g) => {
    const es = guideCredits(g);
    if (!es.length || !sec.isConnected) return;
    sec.replaceChildren(h("h2", { class: "cr-h", id: "cr-guide" }, "Bari guide", h("span", { class: "group-count" }, String(es.length))),
      h("ul", { class: "cr-list" }, es.map((e) => entry(e, "place"))));
    sec.hidden = false;
  }).catch(() => {});
  return sec;
}

/** Who made the app, and from what. */
export const AUTHOR = { name: "Carlos Vivar Ríos", github: "https://github.com/caviri", orcid: "https://orcid.org/0000-0002-8076-2034" };

function madeBy() {
  return h("section", { class: "cr-made", "aria-labelledby": "cr-made-h" },
    h("p", { class: "cr-made-k" }, "Made by"),
    h("h2", { class: "cr-made-name", id: "cr-made-h" }, AUTHOR.name),
    h("div", { class: "cr-made-links" },
      ext(AUTHOR.github, "pill-btn", icon("github", { size: 18 }), "github.com/caviri"),
      ext(AUTHOR.orcid, "pill-btn", icon("link", { size: 18 }), "ORCID 0000-0002-8076-2034")),
    h("p", {}, "An unofficial companion to ISWC 2026, built by ", ext(AUTHOR.github, "", "github.com/caviri"),
      " on data gathered from public places: the conference and workshop websites, open scholarly databases, Wikidata, Wikipedia, Wikimedia Commons and OpenStreetMap (listed under ",
      h("a", { href: "#/credits", onclick: (e) => { e.preventDefault(); document.getElementById("cr-sources")?.scrollIntoView({ behavior: "smooth" }); } }, "Data sources"),
      "). Not endorsed by the conference organisers. It runs as a static page on one ", h("a", { href: "#/rete" }, ".rete graph"), "."));
}

export function renderCredits(root, program) {
  const m = creditsModel(program);
  root.replaceChildren(h("section", { class: "view credits-view" },
    madeBy(),
    h("header", { class: "cr-head" },
      h("h1", { class: "detail-title" }, "Image credits"),
      h("p", { class: "detail-authors" }, m.total
        ? `${plural(m.total, "image")}, all under open licences. Each one is shown with its author and licence where it appears, and listed here.${m.groups.some((g) => g.kind === "person-photo") ? " Photos of people only where an openly licensed one exists." : " No photos of people."}`
        : "This programme has no images.")),
    offlineBox(),
    m.groups.map((g) => h("section", { class: "cr-group", "aria-labelledby": `cr-${g.kind}` },
      h("h2", { class: "cr-h", id: `cr-${g.kind}` }, g.title, h("span", { class: "group-count" }, String(g.entries.length))),
      h("ul", { class: "cr-list" }, g.entries.map((e) => entry(e, g.kind))))),
    guideGroup(),
    h("section", { class: "cr-group", "aria-labelledby": "cr-rete" },
      h("h2", { class: "cr-h", id: "cr-rete" }, "Built with rete", h("span", { class: "group-count" }, String(Object.keys(RETE_IMAGES).length))),
      h("ul", { class: "cr-list" }, Object.values(RETE_IMAGES).map((im) => entry({ file: im.file, subject: im.alt.split(":")[0].split(".")[0],
        author: `the rete project (${im.from})`, license: "Apache-2.0", licenseUrl: "https://www.apache.org/licenses/LICENSE-2.0", pageUrl: im.url,
        width: im.width, height: im.height }, "place")))),
    h("section", { class: "cr-group", "aria-labelledby": "cr-sources" },
      h("h2", { class: "cr-h", id: "cr-sources" }, "Data sources"),
      h("ul", { class: "cr-sources" }, m.sources.map((s) => h("li", {}, ext(s.url, "link-row", h("span", { class: "link-label" }, s.name), h("span", { class: "cr-what" }, s.what), icon("external", { size: 16 }))))))));
  return () => {};
}
