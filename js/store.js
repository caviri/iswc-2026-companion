// Personal swipes/notes. Pure module; storage is injectable. Never deletes orphan ids.
// A swipe is { v, ts } with v "right" (keep), "left" (skip) or "up" (maybe). Tested in tests/app/store.test.mjs.
const KEY = "iswc26:v1";
const empty = () => ({ swipes: {}, notes: {} });
const isObj = (x) => x && typeof x === "object" && !Array.isArray(x);

function defaultStorage() {
  try {
    const ls = globalThis.localStorage;
    if (!ls) return null;
    ls.getItem(KEY); // some browsers throw on access in private mode
    return ls;
  } catch { return null; }
}

export function createStore(storage = defaultStorage()) {
  // Several live copies (a browser tab and the installed app) may share this storage, so every
  // change is read-modify-write against the latest stored value, never a dump of a stale copy.
  let persistent = !!storage; // result of the latest write (or of the first read)
  let data = empty();
  let lastRaw = null; // stored string `data` was built from (or last written)
  let pending = []; // changes whose write failed; replayed onto every fresh read, retried on the next write

  // Latest stored state, or null when storage can't be read. Corrupt JSON is backed up and read as empty.
  const load = () => {
    let raw;
    try { raw = storage.getItem(KEY); } catch { return null; }
    if (raw == null) return { raw, d: empty() };
    try {
      const d = JSON.parse(raw);
      if (!isObj(d) || (d.swipes !== undefined && !isObj(d.swipes)) || (d.notes !== undefined && !isObj(d.notes))) throw new Error("shape");
      return { raw, d: { swipes: d.swipes || {}, notes: d.notes || {} } };
    } catch {
      try { storage.setItem(KEY + ":corrupt", raw); } catch { /* backup is best effort */ }
      return { raw, d: empty() };
    }
  };

  /** Re-read storage (another copy may have written); keeps our unsaved changes. True if anything changed. */
  const sync = () => {
    if (!storage) return false;
    const r = load();
    if (!r || r.raw === lastRaw) return false;
    data = r.d;
    for (const op of pending) op(data);
    lastRaw = r.raw;
    return true;
  };

  const mutate = (op) => {
    sync();
    op(data);
    if (!storage) return;
    pending.push(op);
    try {
      const raw = JSON.stringify(data);
      storage.setItem(KEY, raw);
      lastRaw = raw;
      pending = [];
      persistent = true;
    } catch { persistent = false; }
  };

  if (storage) {
    const r = load();
    if (r) { data = r.d; lastRaw = r.raw; } else persistent = false;
  }

  const idsWith = (v) => Object.entries(data.swipes).filter(([, s]) => s?.v === v).sort((a, b) => a[1].ts - b[1].ts).map(([id]) => id);

  return {
    get persistent() { return persistent; },
    swipe(id, v) {
      if (v !== "right" && v !== "left" && v !== "up") throw new Error(`bad verdict: ${v}`);
      const ts = Date.now();
      mutate((d) => { d.swipes[id] = { v, ts }; });
    },
    unswipe(id) { mutate((d) => { delete d.swipes[id]; }); },
    verdict(id) { return data.swipes[id]?.v ?? null; },
    note(id) { return data.notes[id]?.text ?? ""; },
    setNote(id, text) {
      const ts = Date.now();
      mutate((d) => { if (text) d.notes[id] = { text, ts }; else delete d.notes[id]; });
    },
    /** Pick up changes another tab/app copy wrote (call on the `storage` event / back to foreground). */
    refresh: sync,
    /** Ids with verdict `v`, oldest swipe first. */
    idsWith,
    rightIds: () => idsWith("right"),
    /** Maybe ids ("up"), oldest first. */
    upIds: () => idsWith("up"),
    /** A copy of everything stored: { swipes: {id: {v, ts}}, notes: {id: {text, ts}} } (for export). */
    snapshot() {
      sync();
      return JSON.parse(JSON.stringify(data));
    },
    /**
     * Merge picks and notes from a backup: per id, the newer timestamp wins (a missing ts counts as oldest);
     * unknown verdicts and empty notes are skipped. -> { swipes, notes } (how many changed).
     */
    merge(incoming = {}) {
      let swipes = 0, notes = 0;
      const ok = (s) => s && ["right", "left", "up"].includes(s.v);
      const ts = (x) => (Number.isFinite(x?.ts) ? x.ts : 0);
      mutate((d) => {
        for (const [id, s] of Object.entries(incoming.swipes ?? {})) {
          if (!ok(s) || (d.swipes[id] && ts(d.swipes[id]) >= ts(s))) continue;
          d.swipes[id] = { v: s.v, ts: ts(s) || Date.now() };
          swipes++;
        }
        for (const [id, n] of Object.entries(incoming.notes ?? {})) {
          if (typeof n?.text !== "string" || !n.text || (d.notes[id] && ts(d.notes[id]) >= ts(n))) continue;
          d.notes[id] = { text: n.text, ts: ts(n) || Date.now() };
          notes++;
        }
      });
      return { swipes, notes };
    },
    orphans(program) {
      return [...new Set([...Object.keys(data.swipes), ...Object.keys(data.notes)])].filter((id) => !program.byId.has(id));
    },
  };
}

/** Ask the browser not to evict our storage. Safe everywhere; resolves false when unsupported. */
export async function requestPersistence() {
  try { return !!(await globalThis.navigator?.storage?.persist?.()); } catch { return false; }
}
