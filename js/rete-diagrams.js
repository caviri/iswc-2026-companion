// The "Built with rete" page's diagrams, drawn for this app: inline SVG whose colours come from the app's CSS
// (.dg-* classes in app.css), so they follow light and dark mode. Each returns { svg, text }: the markup, and a
// plain-text version of what it shows (the figure's description for screen readers and in the caption).
// Pure strings: no DOM. Tested in tests/app/rete.test.mjs.

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function arrowDefs(id) {
  return `<defs><marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
<path d="M0,0 L10,5 L0,10 z" class="dg-head"/></marker></defs>`;
}
const box = (x, y, w, h, cls = "dg-box", r = 14) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" class="${cls}"/>`;
const text = (x, y, s, cls = "dg-t", anchor = "middle") => `<text x="${x}" y="${y}" class="${cls}" text-anchor="${anchor}">${esc(s)}</text>`;
const line = (x1, y1, x2, y2, id, cls = "dg-line") => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="${cls}" marker-end="url(#${id})"/>`;

/** How the page works: a static host, your browser (offline copy, app, rete engine), your screens. */
export function howItWorks() {
  const id = "dg-a1";
  const svg = `<svg viewBox="0 0 760 330" role="img" aria-labelledby="dg-how-t" class="dg">
<title id="dg-how-t">How the page works</title>${arrowDefs(id)}
${box(10, 40, 190, 230)}${text(105, 70, "Static host", "dg-h")}${text(105, 90, "GitHub Pages, or any web host", "dg-s")}
${box(28, 108, 154, 34, "dg-chip", 9)}${text(105, 130, "the page and its scripts", "dg-s")}
${box(28, 152, 154, 44, "dg-key", 9)}${text(105, 171, "iswc26.rete", "dg-tk")}${text(105, 188, "the data: one RDF graph", "dg-s")}
${box(28, 206, 154, 34, "dg-chip", 9)}${text(105, 228, "images and floor plans", "dg-s")}
${line(204, 155, 258, 155, id)}${text(231, 143, "once", "dg-s")}
${box(262, 20, 300, 290, "dg-zone", 18)}${text(412, 46, "Your browser", "dg-h")}
${box(282, 62, 260, 46, "dg-box", 11)}${text(412, 82, "Offline copy", "dg-t")}${text(412, 99, "every file kept on the device", "dg-s")}
${line(412, 110, 412, 134, id)}
${box(282, 138, 260, 46, "dg-box", 11)}${text(412, 158, "The app (JavaScript)", "dg-t")}${text(412, 175, "asks questions about the programme", "dg-s")}
${line(380, 186, 380, 218, id)}${line(444, 218, 444, 186, id)}${text(372, 206, "SPARQL", "dg-acc", "end")}${text(452, 206, "rows", "dg-acc", "start")}
${box(282, 222, 260, 46, "dg-key", 11)}${text(412, 242, "rete engine (WebAssembly)", "dg-t")}${text(412, 259, "answers them from iswc26.rete", "dg-s")}
${box(282, 276, 260, 26, "dg-chip", 9)}${text(412, 294, "your picks and notes: browser storage", "dg-s")}
${line(566, 161, 616, 161, id)}
${box(620, 40, 130, 230)}${text(685, 70, "You", "dg-h")}
${["Home", "Deck", "Timetable", "People", "SPARQL"].map((s, i) => box(636, 88 + i * 34, 98, 26, "dg-chip", 8) + text(685, 106 + i * 34, s, "dg-s")).join("")}
</svg>`;
  return { svg, text: "A static host (GitHub Pages or any web host) serves the page, its scripts, the images and one RDF graph file, iswc26.rete, once. Your browser keeps an offline copy of every file. The app asks the rete engine, running in WebAssembly, SPARQL questions; the engine answers with rows from iswc26.rete, and the app draws Home, the deck, the timetable, people and the SPARQL page from them. Your picks and notes stay in the browser's storage." };
}

/** One example, step by step: how Tuesday's sessions reach the timetable. */
export function sequence() {
  const id = "dg-a2";
  const cols = [["You", 70], ["The app", 270], ["Offline copy", 480], ["rete engine", 680]];
  const steps = [
    [0, 1, "1  open the app, Timetable, Tuesday"],
    [1, 2, "2  get iswc26.rete"],
    [2, 1, "3  the file (from the device after the first visit)", true],
    [1, 3, "4  open it"],
    [1, 3, "5  SPARQL: sessions with their day, time and room"],
    [3, 1, "6  rows: title · start · end · room", true],
    [1, 0, "7  Tuesday's grid, by room", true],
  ];
  const top = 76, gap = 40, bottom = top + steps.length * gap + 10;
  const svg = `<svg viewBox="0 0 760 ${bottom + 24}" role="img" aria-labelledby="dg-seq-t" class="dg">
<title id="dg-seq-t">How Tuesday's sessions reach your screen</title>${arrowDefs(id)}
${cols.map(([n, x], i) => box(x - 64, 14, 128, 38, i === 3 ? "dg-key" : "dg-box", 10) + text(x, 38, n, "dg-t")
    + `<line x1="${x}" y1="52" x2="${x}" y2="${bottom}" class="dg-life"/>`).join("")}
${steps.map(([a, b, label, back], i) => {
    const y = top + i * gap + 14, x1 = cols[a][1], x2 = cols[b][1];
    const dir = x2 > x1 ? 1 : -1;
    return `<line x1="${x1 + dir * 4}" y1="${y}" x2="${x2 - dir * 6}" y2="${y}" class="${back ? "dg-line dg-back" : "dg-line"}" marker-end="url(#${id})"/>`
      + text((x1 + x2) / 2, y - 7, label, back ? "dg-s" : "dg-s dg-strong");
  }).join("")}
</svg>`;
  return { svg, text: "1. You open the app and go to Tuesday in the Timetable. 2. The app asks for iswc26.rete. 3. After the first visit the file comes from the device's offline copy. 4. The app opens it with the rete engine. 5. It asks, in SPARQL, for the sessions with their day, time and room. 6. The engine answers with rows: title, start, end, room. 7. The app draws Tuesday's grid by room." };
}

/** The data model, simplified: the main kinds of things and the links between them. */
export function dataModel() {
  const id = "dg-a3";
  const W = 176;
  const node = (x, y, name, cls, key = false) => box(x - W / 2, y - 26, W, 52, key ? "dg-key" : "dg-box", 12) + text(x, y - 3, name, "dg-t") + text(x, y + 15, cls, "dg-s dg-mono");
  const edge = (x1, y1, x2, y2, label, lx, ly, anchor = "middle") => line(x1, y1, x2, y2, id) + text(lx, ly, label, "dg-acc dg-mono", anchor);
  const L = 110, C = 400, R = 690, half = W / 2;
  const svg = `<svg viewBox="0 0 800 400" role="img" aria-labelledby="dg-model-t" class="dg">
<title id="dg-model-t">The data model, simplified</title>${arrowDefs(id)}
${node(C, 200, "Session", "schema:Event", true)}
${node(C, 54, "Day", "schema:Event")}
${node(R, 200, "Room", "schema:Place")}
${node(L, 200, "Paper", "schema:ScholarlyArticle")}
${node(L, 350, "Person", "schema:Person")}
${node(C, 350, "Organisation", "schema:Organization")}
${node(R, 54, "Topic", "skos:Concept")}
${node(R, 350, "Agenda item", "ic:AgendaItem")}
${edge(C, 172, C, 84, "schema:superEvent", C - 10, 132, "end")}
${edge(C + half + 4, 200, R - half - 6, 200, "schema:location", (C + R) / 2, 190)}
${edge(L + half + 4, 200, C - half - 6, 200, "ic:presentedIn", (L + C) / 2, 190)}
${edge(L, 228, L, 320, "schema:author", L + 8, 280, "start")}
${edge(L + half + 4, 350, C - half - 6, 350, "schema:affiliation", (L + C) / 2, 340)}
${edge(C + 60, 174, R - 70, 82, "schema:about", 560, 118, "start")}
${edge(C + 60, 226, R - 70, 322, "ic:agendaItem", 560, 290, "start")}
</svg>`;
  return { svg, text: "A Session (schema:Event) belongs to a Day (schema:superEvent), happens in a Room (schema:location) and is about Topics (schema:about, SKOS concepts). A Paper (schema:ScholarlyArticle) is presented in a Session (ic:presentedIn) and has authors, each a Person (schema:author), who work at an Organisation (schema:affiliation). Workshops add their own timed Agenda items (ic:agendaItem)." };
}
