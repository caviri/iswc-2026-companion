// SPARQL explorer (#/sparql): write a query against the programme's graph and read the answer as a
// table or as cards. Runs on this device (rete WASM, in a worker when possible), offline.
// Federated queries: rete-graph sends a SERVICE block to its endpoint with a synchronous XHR, which
// browsers allow only in a worker, so SERVICE runs in worker mode only. Such a query is never run
// on its own (not on load, not on picking an example): a notice names every host it contacts, and it
// goes out only when the person presses Run.
// The pure parts (prefixes, query form, cells, exports, history) live in js/sparql-model.js.
import { h, icon, openSheet } from "../ui.js";
import { openTermPopover, closeTermPopover } from "../terms.js";
import { thumbSVG } from "../thumbs.js";
import { getGraph } from "../data.js";
import { GALLERY, galleryQuery, cardEntries, exampleEntries } from "../sparql-gallery.js";
import { Q_EXAMPLES } from "../queries.js";
import { runOnGraph } from "../sparql-run.js";
import { createRunner, MAX_ROWS } from "../sparql-run.js";
import {
  tokenize, injectPrefixes, queryType, columnsOf, cellModel, cardSubject, sortRows, errorPosition, errorText, offsetOf,
  toCSV, toResultsJSON, toNTriples, toTurtle, loadHistory, saveHistory, pushHistory, queryHeadline, PREFIXES,
  romeDateTime, scan, serviceCalls, serviceError, prefixLines,
} from "../sparql-model.js";
import { endpointUi } from "../research-model.js";
import { itemTag } from "../model.js";

const PAGE = 500;
const DRAFT_KEY = "iswc26:sparql-draft";
const PREFS_KEY = "iswc26:sparql-prefs";
const plural = (n, one, many = one + "s") => `${n.toLocaleString("en")} ${n === 1 ? one : many}`;

// Survives re-renders (a panel opened on desktop, Back from an item page on a phone): the last answer
// stays on screen without running the query again.
let runner = null;
let idleTimer = 0; // the worker (and its copy of the graph) goes away a minute after leaving the explorer
const IDLE_MS = 60000;
let last = null; // { query, sent, type, result, error, cols, at }
const view = { mode: "table", sort: null, shown: PAGE };

function loadDraft() { try { return sessionStorage.getItem(DRAFT_KEY); } catch { return null; } }
function saveDraft(q) { try { sessionStorage.setItem(DRAFT_KEY, q); } catch { /* not restored */ } }
function loadPrefs() {
  try { const p = JSON.parse(localStorage.getItem(PREFS_KEY)); return { autoPrefix: p?.autoPrefix !== false, mode: p?.mode === "cards" ? "cards" : "table" }; } catch { return { autoPrefix: true, mode: "table" }; }
}
function savePrefs(p) { try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* per visit */ } }

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h("a", { href: url, download: name, hidden: true });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const isMac = () => /Mac|iPhone|iPad/.test(globalThis.navigator?.platform ?? "");

/** renderSparql(root, program, store, clock, params) -> cleanup(). params.q: a query to load. */
export function renderSparql(root, program, store, clock, params = {}) {
  if (program.source !== "rete" || !getGraph()) {
    root.replaceChildren(h("section", { class: "view sparql-view" },
      h("h1", { class: "view-title" }, "SPARQL"),
      h("div", { class: "empty sq-empty" },
        h("h2", {}, "SPARQL needs the .rete engine, which failed to load on this device"),
        h("p", {}, "The rest of the app works from the plain programme file. Reload while online, or try a recent version of Chrome, Safari or Firefox."),
        h("div", { class: "empty-actions" },
          h("button", { type: "button", class: "pill-btn primary", onclick: () => location.reload() }, "Reload"),
          h("a", { class: "pill-btn", href: "#/browse" }, "Browse instead")))));
    return () => {};
  }
  clearTimeout(idleTimer);
  runner ??= createRunner({ workerUrl: new URL("../sparql-worker.js", import.meta.url), getGraph });
  const prefs = loadPrefs();
  view.mode = prefs.mode;
  const ctx = () => ({ keptIds: store.rightIds(), now: clock.now() });
  // The graph's own examples first (read here when the page has the graph, else through the runner below).
  let graphExamples = [];
  try { const g = getGraph(); if (g) graphExamples = exampleEntries(runOnGraph(g, Q_EXAMPLES).rows ?? []); } catch { /* below */ }
  let gallery = [...graphExamples, ...GALLERY];
  let history = loadHistory();
  let running = null; // { started, timer }
  let dead = false;
  let picked = null; // the gallery entry the editor holds, until edited

  // ---- editor: a transparent textarea over a highlighted <pre>, with line numbers ----
  const start = params.q ?? loadDraft() ?? last?.query ?? history[0]?.query ?? galleryQuery(graphExamples[0] ?? GALLERY[0], ctx());
  const ta = h("textarea", {
    class: "sq-input", spellcheck: false, autocapitalize: "off", autocomplete: "off", wrap: "off",
    "aria-label": "SPARQL query", "aria-describedby": "sq-keys",
  });
  ta.value = start;
  const hl = h("pre", { class: "sq-hl", "aria-hidden": "true" });
  const gutter = h("div", { class: "sq-gutter", "aria-hidden": "true" });
  const scroller = h("div", { class: "sq-scroll" }, gutter, h("div", { class: "sq-code" }, hl, ta));
  let errLine = null;

  function paint() {
    const frag = document.createDocumentFragment();
    for (const t of tokenize(ta.value)) frag.append(t.t === "text" ? document.createTextNode(t.s) : h("span", { class: `tk-${t.t}` }, t.s));
    frag.append("\n "); // the last (possibly empty) line keeps its height
    hl.replaceChildren(frag);
    const n = ta.value.split("\n").length;
    if (gutter.childElementCount !== n) gutter.replaceChildren(...Array.from({ length: n }, (_, i) => h("span", {}, String(i + 1))));
    gutter.querySelectorAll(".err").forEach((e) => e.classList.remove("err"));
    if (errLine) gutter.children[errLine - 1]?.classList.add("err");
  }
  ta.addEventListener("input", () => { errLine = null; picked = null; paint(); saveDraft(ta.value); drawRemote(); });
  ta.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); run(); }
  });

  // ---- toolbar ----
  const runBtn = h("button", { type: "button", class: "pill-btn primary sq-run", onclick: () => run() }, icon("play", { size: 18, fill: true }), h("span", {}, "Run"));
  const stopBtn = h("button", { type: "button", class: "pill-btn sq-stop", hidden: true, onclick: () => stop() }, icon("pause", { size: 18 }), "Stop");
  const prefixBtn = h("button", {
    type: "button", class: "chip sq-prefix", "aria-pressed": String(prefs.autoPrefix),
    title: `Adds PREFIX lines for ${Object.keys(PREFIXES).map((p) => p + ":").join(" ")} when the query uses them`,
    onclick: () => { prefs.autoPrefix = !prefs.autoPrefix; prefixBtn.setAttribute("aria-pressed", String(prefs.autoPrefix)); savePrefs(prefs); },
  }, "Auto prefixes");
  const exBtn = h("button", { type: "button", class: "pill-btn sq-ex-btn", onclick: () => openExamples() }, icon("doc", { size: 18 }), "Examples");
  const histBtn = h("button", { type: "button", class: "pill-btn", onclick: () => openHistory() }, icon("undo", { size: 18 }), "History");
  const keys = h("p", { class: "sq-keys", id: "sq-keys" }, `${isMac() ? "⌘" : "Ctrl"} + Enter runs the query. `,
    "Prefixes ic:, schema:, skos:, rdfs:, rdf: and xsd: are added for you.");

  // ---- federated: which hosts the query contacts ----
  const remoteBox = h("div", { class: "sq-remote", role: "note", hidden: true });
  function drawRemote() {
    const calls = serviceCalls(ta.value);
    remoteBox.hidden = !calls.length;
    if (!calls.length) { remoteBox.replaceChildren(); return; }
    const hosts = [...new Set(calls.map((c) => c.host))]; // a dynamic call reads "a service named in the query"
    const unlimited = calls.filter((c) => !c.limited).map((c) => c.host);
    remoteBox.replaceChildren(icon("external", { size: 18 }), h("div", {},
      h("p", {}, h("strong", {}, `This query contacts ${hosts.join(", ")}.`),
        " It is sent only when you press Run, so it needs a connection, and that service sees the query and your IP address."),
      unlimited.length ? h("p", { class: "sq-remote-tip" }, `Add a LIMIT inside SERVICE: only the SERVICE block is sent to ${[...new Set(unlimited)].join(", ")}, so a LIMIT outside it doesn't reach the endpoint and a broad pattern may time out.`) : null));
  }

  // ---- examples ----
  const exList = (onPick) => h("ul", { class: "sq-ex-list" }, gallery.map((e) => h("li", {},
    h("button", { type: "button", class: "sq-ex", onclick: () => onPick(e) },
      h("span", { class: "sq-ex-title" }, e.title, e.remote ? h("span", { class: "sq-ex-remote" }, icon("external", { size: 12 }), e.remote) : null),
      h("span", { class: "sq-ex-about" }, e.about)))));
  const aside = h("aside", { class: "sq-gallery", "aria-labelledby": "sq-ex-h" });
  const drawAside = () => aside.replaceChildren(h("h2", { class: "sq-side-h", id: "sq-ex-h" }, "Examples"), exList(pick));
  function pick(e) {
    ta.value = galleryQuery(e, ctx());
    errLine = null; paint(); saveDraft(ta.value); drawRemote();
    picked = e.id;
    // A federated example waits for Run: picking it must not contact anyone.
    if (e.remote) { runBtn.focus(); status.replaceChildren(h("span", {}, `Loaded. Press Run to send it to ${e.remote}.`)); return; }
    run();
  }
  function openExamples() {
    const s = openSheet({ title: "Examples", label: "Example queries" });
    s.body.append(h("p", { class: "sheet-sub" }, "Pick one to run it. You can edit it afterwards. Examples that ask another service only load: press Run to send them."), exList((e) => { s.close(); pick(e); }));
  }
  function openHistory() {
    const s = openSheet({ title: "History", label: "Query history" });
    const draw = () => {
      s.body.replaceChildren(history.length
        ? h("div", {}, h("ul", { class: "sq-ex-list" }, history.map((e) => h("li", {},
          h("button", { type: "button", class: "sq-ex", onclick: () => { s.close(); ta.value = e.query; errLine = null; paint(); saveDraft(ta.value); drawRemote(); ta.focus(); } },
            h("span", { class: "sq-ex-title sq-code-line" }, queryHeadline(e.query)),
            h("span", { class: "sq-ex-about" }, [new Date(e.at).toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit" }),
              e.rows != null ? plural(e.rows, "result") : null].filter(Boolean).join(", ")))))),
          h("div", { class: "sheet-actions" }, h("button", { type: "button", class: "pill-btn", onclick: () => { history = []; saveHistory(history); draw(); } }, "Clear history")))
        : h("p", { class: "sheet-sub" }, "Queries you run appear here, the last 20, on this device only."));
    };
    draw();
  }

  // ---- results ----
  const status = h("div", { class: "sq-status", role: "status", "aria-live": "polite" });
  const warnBox = h("div", { class: "sq-warnings" });
  const body = h("div", { class: "sq-body" });
  const results = h("section", { class: "sq-results", "aria-label": "Results" }, status, warnBox, body);

  function setRunning(on) {
    runBtn.disabled = on;
    runBtn.lastChild.textContent = on ? "Running…" : "Run";
    stopBtn.hidden = !on || runner.mode() !== "worker";
    results.setAttribute("aria-busy", String(on));
    if (on) {
      const started = performance.now();
      const tick = () => { status.replaceChildren(h("span", { class: "sq-spin", "aria-hidden": "true" }), h("span", {}, `Running… ${((performance.now() - started) / 1000).toFixed(1)} s`)); };
      tick();
      running = { started, timer: setInterval(tick, 100) };
    } else if (running) { clearInterval(running.timer); running = null; }
  }

  async function run() {
    if (running) return;
    const raw = ta.value;
    if (!raw.trim()) { ta.focus(); return; }
    const inj = prefs.autoPrefix ? injectPrefixes(raw) : { query: raw, added: [], lineOffset: 0 };
    const type = queryType(inj.query);
    closeTermPopover({ restoreFocus: false });
    const calls = serviceCalls(inj.query);
    if (calls.length) {
      await runner.ready().catch(() => {});
      const why = runner.mode() !== "worker" ? "Federated queries need the background query engine (a Web Worker), which isn't available here."
        : globalThis.navigator?.onLine === false ? `You're offline, and this query needs ${calls[0].host}.` : null;
      if (why) {
        last = { query: raw, sent: inj.query, added: inj.added, type, result: null, error: { message: why, pos: null, remote: calls[0], prefixes: prefixLines(inj.query) } };
        errLine = null; paint(); drawResults();
        return;
      }
    }
    setRunning(true);
    let out;
    try {
      const r = await runner.run(inj.query);
      out = { query: raw, sent: inj.query, added: inj.added, type: type ?? (r.type === "ask" ? "ask" : r.type === "triples" ? "construct" : "select"), result: r, error: null, example: picked, engine: runner.mode() };
      if (out.type === "select" && r.type === "rows") out.cols = columnsOf(raw, r.rows);
    } catch (e) {
      if (dead) return;
      if (e?.stopped) { setRunning(false); status.replaceChildren(h("span", {}, "Stopped. The query engine restarts on the next run.")); return; }
      const se = serviceError(e?.message);
      const call = se ? calls.find((c) => c.host === se.host) ?? calls[0] : null;
      out = { query: raw, sent: inj.query, added: inj.added, type, result: null,
        error: se ? { message: se.text, pos: null, remote: call, prefixes: prefixLines(inj.query) }
          : { message: String(e?.message ?? e), pos: errorPosition(e?.message, inj.lineOffset) } };
    }
    if (dead) return;
    setRunning(false);
    if (!out.error) {
      // History is a convenience: a storage failure never turns an answer into an error.
      const r = out.result;
      try { history = pushHistory(history, raw, { rows: r.type === "ask" ? null : (r.total ?? r.rows?.length ?? r.triples?.length ?? 0) }); saveHistory(history); } catch { /* not kept */ }
    }
    last = out;
    view.sort = null; view.shown = PAGE;
    errLine = out.error?.pos?.line ?? null;
    paint();
    drawResults();
  }
  function stop() { runner.stop(); }

  function seg() {
    const b = (m, label, ic) => h("button", { type: "button", class: "seg-btn", "aria-pressed": String(view.mode === m),
      onclick: () => { if (view.mode === m) return; view.mode = m; prefs.mode = m; savePrefs(prefs); drawResults(); } }, icon(ic, { size: 16 }), label);
    return h("div", { class: "seg sq-seg", role: "group", "aria-label": "Show results as" }, b("table", "Table", "layers"), b("cards", "Cards", "deck"));
  }
  const dl = (label, fn) => h("button", { type: "button", class: "chip sq-dl", onclick: fn }, icon("dataset", { size: 16 }), label);

  function drawWarnings(r) {
    const ws = r?.warnings ?? [];
    const notes = [];
    if (last.added?.length) notes.push(h("li", { class: "sq-note" }, `Added PREFIX ${last.added.map((p) => p + ":").join(", ")}.`));
    if (r?.autoLimit) notes.push(h("li", { class: "sq-note" }, `Showing at most ${r.autoLimit} rows: queries run on the main thread here, so a LIMIT was added. Add your own LIMIT to change it.`));
    if (r?.truncated) notes.push(h("li", { class: "sq-note" }, `The answer has ${plural(r.total, "row")}; only the first ${plural(MAX_ROWS, "row")} are kept.`));
    if ((last.type === "construct" || last.type === "describe") && /\bLIMIT\b/i.test(scan(last.query))) notes.push(h("li", { class: "sq-note" }, "LIMIT inside CONSTRUCT is ignored by this engine; every matching triple is returned."));
    warnBox.replaceChildren(...(ws.length || notes.length ? [h("ul", { class: "sq-warn-list" },
      ws.map((w) => h("li", { class: "sq-warn" }, icon("filter", { size: 16 }), h("span", {}, w.message))), notes)] : []));
  }

  function drawResults() {
    if (!last) {
      status.replaceChildren(h("span", {}, "Run a query, or pick an example."));
      warnBox.replaceChildren(); body.replaceChildren();
      return;
    }
    if (last.error?.remote) {
      const c = last.error.remote;
      const ui = c.url ? endpointUi(null, c.url, [...last.error.prefixes, c.body].join("\n")) : null;
      status.replaceChildren(h("span", { class: "sq-bad" }, `No answer from ${c.host}`));
      warnBox.replaceChildren();
      body.replaceChildren(h("div", { class: "sq-error", role: "alert" },
        h("p", { class: "sq-error-msg" }, last.error.message),
        c.url ? h("p", {}, ui !== c.url ? `You can run the SERVICE part on ${c.host}'s own query page instead:` : `The endpoint is ${c.url}.`) : null,
        c.url && ui !== c.url ? h("a", { class: "pill-btn", href: ui, target: "_blank", rel: "noopener noreferrer" }, icon("external", { size: 18 }), `Open on ${c.host}`) : null));
      return;
    }
    if (last.error) {
      const p = last.error.pos;
      status.replaceChildren(h("span", { class: "sq-bad" }, "The query has an error"));
      warnBox.replaceChildren();
      body.replaceChildren(h("div", { class: "sq-error", role: "alert" },
        p?.line ? h("p", { class: "sq-error-at" }, `Line ${p.line}, column ${p.col}`) : p ? h("p", { class: "sq-error-at" }, "In the added PREFIX lines") : null,
        h("p", { class: "sq-error-msg" }, errorText(last.error.message)),
        p?.line ? h("button", { type: "button", class: "pill-btn", onclick: () => {
          const off = offsetOf(ta.value, p.line, p.col);
          ta.focus(); ta.setSelectionRange(off, Math.min(off + 1, ta.value.length));
        } }, "Show in the editor") : null));
      return;
    }
    const r = last.result;
    const ms = `${Math.max(1, Math.round(r.ms))} ms`;
    const remote = serviceCalls(last.sent ?? last.query).map((c) => c.host);
    const engine = (last.engine === "main" ? " · main thread" : "") + (remote.length ? ` · with ${[...new Set(remote)].join(", ")}` : "");
    drawWarnings(r);
    if (r.type === "ask") {
      status.replaceChildren(h("span", {}, `ASK · ${ms}${engine}`),
        h("span", { class: "sq-tools" }, dl("JSON", () => download("answer.json", toResultsJSON([], r.boolean), "application/sparql-results+json"))));
      body.replaceChildren(h("div", { class: `sq-ask ${r.boolean ? "yes" : "no"}` },
        h("strong", {}, r.boolean ? "Yes" : "No"), h("span", {}, r.boolean ? "At least one match in the graph (true)." : "Nothing in the graph matches (false).")));
      return;
    }
    if (last.type === "construct" || last.type === "describe" || r.type === "triples") {
      const triples = r.triples ?? [];
      status.replaceChildren(h("span", {}, h("strong", {}, plural(triples.length, "triple")), ` · ${ms}${engine}`),
        h("span", { class: "sq-tools" },
          dl("Turtle", () => download("result.ttl", toTurtle(triples), "text/turtle")),
          dl("N-Triples", () => download("result.nt", toNTriples(triples), "application/n-triples"))));
      const rows = triples.map(([s, p, o]) => ({ subject: s, predicate: p, object: o }));
      body.replaceChildren(table(["subject", "predicate", "object"], rows));
      return;
    }
    const cols = last.cols ?? [];
    const rows = r.rows ?? [];
    status.replaceChildren(h("span", {}, h("strong", {}, plural(rows.length, "row")), ` · ${ms}${engine}`),
      rows.length ? seg() : null,
      rows.length ? h("span", { class: "sq-tools" },
        dl("CSV", () => download("results.csv", toCSV(cols, rows), "text/csv")),
        dl("JSON", () => download("results.json", toResultsJSON(cols, rows), "application/sparql-results+json"))) : null);
    if (!rows.length && last.example === "kept-rooms" && !store.rightIds().length) {
      body.replaceChildren(h("div", { class: "sq-none" }, h("p", {}, "You haven't kept anything yet."),
        h("p", {}, "Keep sessions or papers in the deck, on Home or in Browse, then run this example again.")));
      return;
    }
    if (!rows.length) {
      body.replaceChildren(h("div", { class: "sq-none" }, h("p", {}, "No rows match."),
        h("p", {}, "Check the property names (", h("code", {}, "ic:"), ", ", h("code", {}, "schema:"), ") against an example, or loosen a FILTER.")));
      return;
    }
    body.replaceChildren(view.mode === "cards" ? cards(cols, rows) : table(cols, rows));
  }

  // One value: app links for things the app knows, a popover for glossary terms, text otherwise.
  function cellNode(term, { pretty = false } = {}) {
    const c = cellModel(term, program);
    if (pretty && c.dt === "xsd:dateTime") {
      const when = romeDateTime(c.text);
      if (when) return h("span", { class: "sq-lit", title: c.title }, when);
    }
    if (c.kind === "empty") return h("span", { class: "sq-unbound", title: "unbound" }, "–");
    if (c.link?.kind === "term") {
      return h("button", { type: "button", class: "sq-termlink", title: c.title, "aria-haspopup": "dialog",
        onclick: (e) => openTermPopover(program, c.link.id, e.currentTarget) }, c.text);
    }
    if (c.link) return h("a", { class: `sq-link k-${c.link.kind}`, href: c.link.href, title: c.title }, c.text);
    if (c.kind === "iri") {
      const ext = /^https:\/\//.test(c.title) ? c.title : null;
      return ext && c.short === c.title ? h("a", { class: "sq-iri", href: ext, target: "_blank", rel: "noopener noreferrer", title: c.title }, c.text)
        : h("span", { class: "sq-iri", title: c.title }, c.text);
    }
    return h("span", { class: c.numeric ? "sq-num" : "sq-lit", title: c.title }, c.text,
      c.lang ? h("span", { class: "sq-dt" }, `@${c.lang}`) : null,
      c.dt && !c.numeric ? h("span", { class: "sq-dt" }, c.dt.replace(/^xsd:/, "")) : null);
  }

  function more(total, redraw) {
    if (view.shown >= total) return null;
    return h("div", { class: "sq-more" }, h("button", { type: "button", class: "pill-btn", onclick: () => { view.shown += PAGE; redraw(); } },
      `Show ${Math.min(PAGE, total - view.shown)} more`), h("span", {}, `${plural(total - view.shown, "row")} not shown`));
  }

  function table(cols, rows) {
    const sorted = view.sort ? sortRows(rows, view.sort.col, view.sort.dir, program) : rows;
    const shown = sorted.slice(0, view.shown);
    const numericCol = new Set(cols.filter((c) => { const v = rows.find((r) => r[c]); return v && cellModel(v[c]).numeric; }));
    const head = h("tr", {}, h("th", { class: "sq-rn", scope: "col" }, h("span", { class: "sr-only" }, "Row")), cols.map((c) => {
      const on = view.sort?.col === c;
      return h("th", { scope: "col", class: numericCol.has(c) ? "num" : "", "aria-sort": on ? (view.sort.dir > 0 ? "ascending" : "descending") : "none" },
        h("button", { type: "button", class: "sq-sort", onclick: () => {
          view.sort = !on ? { col: c, dir: 1 } : view.sort.dir > 0 ? { col: c, dir: -1 } : null;
          view.shown = PAGE; redraw();
        } }, `?${c}`, h("span", { class: "sq-arrow", "aria-hidden": "true" }, on ? (view.sort.dir > 0 ? "↑" : "↓") : "↕")));
    }));
    const tbody = h("tbody", {}, shown.map((r, i) => h("tr", {}, h("td", { class: "sq-rn" }, String(i + 1)),
      cols.map((c) => h("td", { class: numericCol.has(c) ? "num" : "" }, cellNode(r[c]))))));
    const wrap = h("div", { class: "sq-table-wrap", tabindex: "0", role: "region", "aria-label": "Results table (scrolls sideways)" },
      h("table", { class: "sq-table" }, h("thead", {}, head), tbody));
    const box = h("div", {}, wrap, more(rows.length, () => redraw()));
    function redraw() { box.replaceWith(table(cols, rows)); }
    return box;
  }

  function cardThumb(link) {
    if (link.kind === "item") return thumbSVG(program.byId.get(link.id), program, { size: "row" });
    if (link.kind === "cluster") return thumbSVG(program.clusters.find((c) => c.id === link.id), program, { size: "row" });
    const initials = link.label.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
    return h("span", { class: "panel-initials" }, initials);
  }
  const kindText = (link) => {
    if (link.kind === "person") return "Person";
    if (link.kind === "cluster") return "Cluster";
    return itemTag(program, program.byId.get(link.id))?.label ?? "Item";
  };

  function cards(cols, rows) {
    const shown = (view.sort ? sortRows(rows, view.sort.col, view.sort.dir, program) : rows).slice(0, view.shown);
    const grid = h("ul", { class: "sq-cards" }, shown.map((r) => {
      const subj = cardSubject(r, cols, program);
      const rest = cols.filter((c) => c !== subj?.col);
      return h("li", { class: `sq-card${subj ? " has-subject" : ""}` },
        subj ? h("a", { class: "sq-card-head", href: subj.link.href },
          h("span", { class: "sq-card-thumb" }, cardThumb(subj.link)),
          h("span", { class: "sq-card-text" }, h("span", { class: "sq-card-kind" }, kindText(subj.link)), h("span", { class: "sq-card-title" }, subj.link.label))) : null,
        rest.length ? h("dl", { class: "sq-kv" }, rest.map((c) => h("div", {}, h("dt", {}, `?${c}`), h("dd", {}, cellNode(r[c], { pretty: true }))))) : null);
    }));
    const box = h("div", {}, grid, more(rows.length, () => box.replaceWith(cards(cols, rows))));
    return box;
  }

  // ---- assemble ----
  paint();
  drawRemote();
  drawAside();
  const editorCard = h("div", { class: "sq-editor" }, scroller,
    h("div", { class: "sq-toolbar" }, runBtn, stopBtn, h("span", { class: "sq-spacer" }), prefixBtn, exBtn, histBtn), remoteBox, keys);
  root.replaceChildren(h("section", { class: "view sparql-view" },
    h("header", { class: "sq-head" },
      h("h1", { class: "view-title" }, "SPARQL"),
      h("p", { class: "sq-lede" }, "Ask the programme's graph your own questions: sessions, papers, people, rooms, topics. It runs on this device, offline. A query with SERVICE can also ask a public endpoint such as Wikidata, when you run it.")),
    h("div", { class: "sq-work" }, editorCard, aside),
    results));
  drawResults();

  runner.ready().then(async ({ examples }) => {
    if (dead) return;
    if (!graphExamples.length) {
      try { graphExamples = exampleEntries((await runner.run(Q_EXAMPLES)).rows ?? []); } catch { /* the card's, below */ }
    }
    if (dead) return;
    gallery = [...graphExamples, ...GALLERY, ...cardEntries(examples, graphExamples)];
    drawAside();
  }).catch(() => {});

  if (params.q != null) saveDraft(ta.value);

  return () => {
    dead = true;
    if (running) { clearInterval(running.timer); runner.stop(); running = null; }
    saveDraft(ta.value);
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { runner?.dispose(); runner = null; }, IDLE_MS);
  };
}

