// SPARQL explorer worker (classic script): runs queries off the main thread, so a long query never
// freezes the page and Stop can terminate it. Opens the same .rete file as the app (the service worker
// serves it from the offline cache) with the vendored rete-graph bundle.
//
// in:  { id, op: "init" }                     -> { id, ok: true, examples: [query] }
//      { id, op: "query", query, maxRows }    -> { id, ok: true, type, rows | triples | boolean, ms, warnings, truncated, total }
// any failure                                 -> { id, ok: false, error }
/* global rete, importScripts */
importScripts("../vendor/rete-graph.min.js");

let opening = null;
function graph() {
  opening ??= fetch(new URL("../data/iswc26.rete", self.location.href))
    .then((r) => { if (!r.ok) throw new Error(`data/iswc26.rete: HTTP ${r.status}`); return r.arrayBuffer(); })
    .then((buf) => rete.open(new Uint8Array(buf)));
  return opening;
}

const plain = (t) => (t == null ? null : { kind: t.kind, value: String(t.value), datatype: t.datatype ?? null, lang: t.lang ?? null });

self.onmessage = async (e) => {
  const { id, op, query, maxRows = 50000 } = e.data ?? {};
  try {
    const g = await graph();
    if (op === "init") {
      let examples = [];
      try { examples = g.card()?.example_queries ?? []; } catch { /* no card */ }
      self.postMessage({ id, ok: true, examples });
      return;
    }
    const t0 = performance.now();
    const res = g.query(query);
    const ms = performance.now() - t0;
    let warnings = [];
    try { warnings = g.lastWarnings() ?? []; } catch { /* older engine */ }
    warnings = warnings.map((w) => ({ message: String(w.message ?? w), count: w.count ?? null, hint: w.hint ?? null }));
    if (typeof res === "boolean") { self.postMessage({ id, ok: true, type: "ask", boolean: res, ms, warnings }); return; }
    const list = Array.isArray(res) ? res : [];
    const total = list.length;
    const cut = list.slice(0, maxRows);
    if (cut.length && Array.isArray(cut[0])) {
      self.postMessage({ id, ok: true, type: "triples", triples: cut.map((t) => t.map(plain)), ms, warnings, truncated: total > maxRows, total });
      return;
    }
    const rows = cut.map((r) => { const o = {}; for (const k in r) o[k] = plain(r[k]); return o; });
    self.postMessage({ id, ok: true, type: "rows", rows, ms, warnings, truncated: total > maxRows, total });
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err?.message ?? err) });
  }
};
