// A diagram figure (the inline SVG from js/rete-diagrams.js): as wide as the text column at most, and a tap or
// click opens it enlarged in a full-screen dialog (on phones it keeps a readable size there and pans). The markup
// is the app's own fixed text, never data; the enlarged copy gets its own ids so its arrow markers still resolve.
import { h, icon } from "../ui.js";

/** A copy of the SVG markup with every id (and the references to them) renamed with `prefix`. */
export function withIdPrefix(svg, prefix) {
  return svg.replace(/\b(id|aria-labelledby)="([^"]+)"/g, (_, k, id) => `${k}="${prefix}${id}"`).replace(/url\(#([^)]+)\)/g, (_, id) => `url(#${prefix}${id})`);
}

function enlarge({ svg, text }, title) {
  const art = h("div", { class: "dg-big" });
  art.innerHTML = withIdPrefix(svg, "big-");
  const dlg = h("dialog", { class: "dg-lightbox", "aria-label": title },
    h("div", { class: "dg-lb-bar" }, h("strong", {}, title),
      h("button", { type: "button", class: "pill-btn", onclick: () => dlg.close() }, icon("x", { size: 18 }), "Close")),
    art, h("p", { class: "dg-lb-text" }, text));
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); }); // the backdrop
  dlg.addEventListener("close", () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal?.() ?? dlg.setAttribute("open", "");
}

/** <figure> with the diagram (a button that enlarges it) and its plain-text description. */
export function diagramFigure(d) {
  const title = (d.svg.match(/<title[^>]*>([^<]*)<\/title>/) ?? [])[1] ?? "Diagram";
  const art = h("button", { type: "button", class: "dg-wrap", "aria-label": `${title}: enlarge`, title: "Click to enlarge" });
  art.innerHTML = d.svg;
  art.append(h("span", { class: "dg-zoom", "aria-hidden": "true" }, icon("expand", { size: 16 }), "Enlarge"));
  art.addEventListener("click", () => enlarge(d, title));
  return h("figure", { class: "rt-fig rt-dg" }, art, h("figcaption", {}, d.text));
}
