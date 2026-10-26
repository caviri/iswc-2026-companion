// Image blocks (DOM): a paper's figure with its caption, institution / graph logo chips, the Bari hero
// photo and its credit line. Every <img> has width and height (no layout shift), loads lazily and decodes
// off the main thread; a file that fails to load (offline, not cached yet) is removed and the generated
// thumbnail underneath stays. Links are https only (js/images-model.js).
import { h } from "../ui.js";
import { thumbSVG } from "../thumbs.js";
import { imgUrl, logoTitle, heroImage, figureCaption, fitHeight, validImage, creditLine, httpsUrl } from "../images-model.js";

const ext = (url, cls, ...kids) => h("a", { class: cls, href: url, target: "_blank", rel: "noopener noreferrer" }, ...kids);

/** <img> with size attributes, lazy by default; a load error removes it (`onFail`). */
export function imgEl(im, { cls = "", title = null, alt = im.alt ?? "", eager = false, width = im.width, height = im.height, onFail = null } = {}) {
  const img = h("img", { class: cls, title, src: imgUrl(im.file), alt, width, height, decoding: "async", loading: eager ? "eager" : "lazy", draggable: false });
  img.addEventListener("error", () => { img.remove(); onFail?.(); }, { once: true });
  return img;
}

/** "Figure from owner/repo · Apache-2.0" with the repository and the licence as links. */
export function captionLine(im) {
  const c = figureCaption(im);
  return h("figcaption", { class: "fig-cap" },
    c.label, " ", c.href ? ext(c.href, "fig-link", c.name) : c.name,
    c.licence ? [" · ", c.licenceHref ? ext(c.licenceHref, "fig-link", c.licence) : c.licence] : null);
}

/**
 * The hero of a paper: its figure over the generated thumbnail (placeholder and fallback), with the
 * caption underneath. null when the item has no figure.
 */
export function paperFigure(program, item, { thumbSize = "band" } = {}) {
  const im = heroImage(item);
  if (!im) return null;
  const media = h("div", { class: "fig-media", style: { aspectRatio: `${im.width} / ${im.height}` } },
    h("span", { class: "fig-under", "aria-hidden": "true" }, thumbSVG(item, program, { size: thumbSize })),
    imgEl(im, { cls: "fig-img", onFail: () => media.classList.add("failed") }));
  return h("figure", { class: "fig" }, media, captionLine(im));
}

/** A logo on a neutral chip (readable in dark mode): 24 to 32 px high, alt = the institution's name. */
export function logoChip(logo, name, { height = 28, cls = "" } = {}) {
  if (!validImage(logo)) return null;
  const { width, height: ht } = fitHeight(logo, height);
  return h("span", { class: `logo-chip ${cls}`.trim(), style: { "--lw": `${width + 8}px`, "--lh": `${ht + 8}px` } },
    imgEl(logo, { cls: "logo-img", alt: name ?? logo.alt ?? "", title: logoTitle(name ?? logo.alt ?? "", logo), width, height: ht }));
}

/** The credit line of the Home hero photo: "Photo: Author · Licence", linked to its page. */
export function photoCredit(im) {
  const href = httpsUrl(im.credit?.pageUrl);
  const text = `Photo: ${creditLine(im)}`;
  return href ? ext(href, "hm-credit", text) : h("span", { class: "hm-credit" }, text);
}
