// The ticker: a thin terminal-style strip across the top of every screen, its message running right to left
// without end. It says the page runs fully static on one .rete graph, invites people to the demo (time and room
// from the programme's own session) and links the demo's card (its title and its time) and the repository; the
// graph file is named, not linked. It pauses on hover or keyboard focus, and stands still for people who ask for
// reduced motion (css). The message is in the page twice for a seamless loop; the second copy is hidden from
// screen readers and out of the tab order.
import { h } from "../ui.js";
import { demoWhen, LINKS, DEMO_PAPER } from "../rete-model.js";
import { placeOf } from "../model.js";

/** The message's parts: [text | {href, text, ext}] (pure; tests/app/rete.test.mjs). */
export function tickerParts(program) {
  const s = program?.sessions?.find((x) => /poster and demos/i.test(x.title)) ?? null;
  const when = s ? demoWhen(s, placeOf(program, s).name) : "27 October (Tuesday)";
  const card = program?.byId?.has(DEMO_PAPER) ? `#/item/${encodeURIComponent(DEMO_PAPER)}` : "#/rete";
  return [
    "$ ./iswc26 --status  ▸ this page runs fully static: no server, no database, no API ▸ one RDF graph (iswc26.rete) queried with SPARQL in your browser via WebAssembly ▸ demo: ",
    { href: card, text: "\".rete: browser-native SPARQL over static, range-addressable RDF files\"" },
    " ▸ ",
    { href: card, text: when },
    " ▸ come and break it with us ▸ source: ",
    { href: LINKS.repo, text: "github.com/caviri/rete", ext: true },
    " ▸ exit 0 ▸ ",
  ];
}

function copy(parts, hidden) {
  return h("span", { class: "tk-copy", "aria-hidden": hidden ? "true" : null },
    parts.map((p) => (typeof p === "string" ? p
      : h("a", { href: p.href, ...(p.ext ? { target: "_blank", rel: "noopener noreferrer" } : {}), ...(hidden ? { tabindex: "-1" } : {}) }, p.text))),
    h("span", { class: "tk-cursor", "aria-hidden": "true" }, "█"), "   ");
}

/** Put the ticker at the top of the page (once). */
export function mountTicker(program) {
  if (document.querySelector(".ticker")) return;
  const parts = tickerParts(program);
  const el = h("div", { class: "ticker", role: "marquee", "aria-label": "About this page" },
    h("div", { class: "tk-track" }, copy(parts, false), copy(parts, true)));
  document.body.prepend(el);
  document.documentElement.classList.add("has-ticker");
}
