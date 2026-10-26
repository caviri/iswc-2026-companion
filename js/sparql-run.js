// Runs explorer queries. Preferred: a Web Worker (js/sparql-worker.js) with its own copy of the graph,
// so the page stays responsive and Stop can terminate a long query. If workers are unavailable or the
// worker cannot open the graph, queries run on the app's own graph (data.js getGraph()) on the main
// thread, with an automatic LIMIT so a careless query cannot freeze the page for long.
import { withAutoLimit } from "./sparql-model.js";

export const AUTO_LIMIT = 1000;
export const MAX_ROWS = 50000;
const INIT_MS = 20000;

const plain = (t) => (t == null ? null : { kind: t.kind, value: String(t.value), datatype: t.datatype ?? null, lang: t.lang ?? null });

/** Same result shape as the worker's, from a graph on this thread. */
export function runOnGraph(g, query, maxRows = MAX_ROWS) {
  const t0 = performance.now();
  const res = g.query(query);
  const ms = performance.now() - t0;
  let warnings = [];
  try { warnings = (g.lastWarnings?.() ?? []).map((w) => ({ message: String(w.message ?? w), count: w.count ?? null, hint: w.hint ?? null })); } catch { /* none */ }
  if (typeof res === "boolean") return { type: "ask", boolean: res, ms, warnings };
  const list = Array.isArray(res) ? res : [];
  const cut = list.slice(0, maxRows);
  const base = { ms, warnings, truncated: list.length > maxRows, total: list.length };
  if (cut.length && Array.isArray(cut[0])) return { type: "triples", triples: cut.map((t) => t.map(plain)), ...base };
  return { type: "rows", rows: cut.map((r) => { const o = {}; for (const k in r) o[k] = plain(r[k]); return o; }), ...base };
}

export class Stopped extends Error { constructor() { super("Stopped"); this.stopped = true; } }

/**
 * createRunner({ workerUrl, getGraph }) -> { ready(): Promise<{ mode, examples }>, run(query), stop(), mode() }.
 * mode: "worker" | "main" | "none". run() resolves to a result (see the worker) plus `autoLimit` (main
 * thread only), or rejects with { message } (a query error) or Stopped.
 */
export function createRunner({ workerUrl, getGraph = () => null, WorkerCtor = globalThis.Worker } = {}) {
  let worker = null, mode = null, examples = [], seq = 0;
  const pending = new Map();
  let readyP = null;

  const failAll = (err) => { for (const [, p] of pending) p.reject(err); pending.clear(); };

  function spawn() {
    const w = new WorkerCtor(workerUrl);
    w.onmessage = (e) => {
      const m = e.data ?? {};
      const p = pending.get(m.id);
      if (!p) return;
      pending.delete(m.id);
      if (m.ok) p.resolve(m); else p.reject(new Error(m.error));
    };
    w.onerror = (e) => {
      e.preventDefault?.();
      // A crashed worker is not reused: the next run spawns a fresh one.
      w.terminate();
      if (worker === w) worker = null;
      failAll(new Error(e.message || "The query worker stopped"));
    };
    return w;
  }
  const ask = (w, msg, ms = 0) => new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = ms ? setTimeout(() => { if (pending.delete(id)) reject(new Error("timeout")); }, ms) : null;
    const done = (fn) => (v) => { clearTimeout(timer); fn(v); };
    pending.set(id, { resolve: done(resolve), reject: done(reject) });
    w.postMessage({ id, ...msg });
  });

  function mainExamples() {
    try { return getGraph()?.card?.()?.example_queries ?? []; } catch { return []; }
  }

  function ready() {
    readyP ??= (async () => {
      if (typeof WorkerCtor === "function" && workerUrl) {
        try {
          worker = spawn();
          const r = await ask(worker, { op: "init" }, INIT_MS);
          examples = r.examples ?? [];
          mode = "worker";
          return { mode, examples };
        } catch (e) {
          console.warn("SPARQL worker unavailable, running on the main thread:", e?.message ?? e);
          worker?.terminate(); worker = null;
        }
      }
      mode = getGraph() ? "main" : "none";
      examples = mode === "main" ? mainExamples() : [];
      return { mode, examples };
    })();
    return readyP;
  }

  async function run(query) {
    const { mode: m } = await ready();
    if (m === "worker") {
      if (!worker) { worker = spawn(); } // re-spawned after a Stop; the graph opens again on first use
      return ask(worker, { op: "query", query, maxRows: MAX_ROWS });
    }
    if (m === "main") {
      const { query: q, applied } = withAutoLimit(query, AUTO_LIMIT);
      await new Promise((r) => setTimeout(r, 30)); // let "Running…" paint before the thread blocks
      try { return { ...runOnGraph(getGraph(), q), autoLimit: applied ? AUTO_LIMIT : null }; } catch (e) { throw new Error(String(e?.message ?? e)); }
    }
    throw new Error("SPARQL needs the .rete engine, which failed to load on this device.");
  }

  /** Abort the running query (worker mode): the worker is terminated and re-created on the next run. */
  function stop() {
    if (mode !== "worker" || !worker || !pending.size) return false;
    worker.terminate();
    worker = null;
    failAll(new Stopped());
    return true;
  }

  return { ready, run, stop, mode: () => mode, examples: () => examples, dispose: () => { worker?.terminate(); worker = null; failAll(new Stopped()); } };
}
