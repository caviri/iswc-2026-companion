// One signal for "a keep/skip changed": every view showing verdicts (rows, verdict buttons, Home, the
// dashboard's counts and panels) listens, so a keep in a desktop panel shows in the centre and back.
// watchStore wraps store.swipe/unswipe once, so every change in the app emits, whoever made it.
// Pure (the target is injectable); tested in tests/app/verdict-bus.test.mjs.

export const VERDICT_EVENT = "iswc:verdict";

/** Emit { id, source } on `target` (default: document). */
export function emitVerdict(id, source = "", target = globalThis.document) {
  if (!target?.dispatchEvent) return;
  const Ev = globalThis.CustomEvent;
  target.dispatchEvent(Ev ? new Ev(VERDICT_EVENT, { detail: { id, source } }) : Object.assign(new Event(VERDICT_EVENT), { detail: { id, source } }));
}

/** fn(id, source) on every verdict change -> unsubscribe(). */
export function onVerdict(fn, target = globalThis.document) {
  if (!target?.addEventListener) return () => {};
  const handler = (e) => fn(e.detail?.id ?? null, e.detail?.source ?? "");
  target.addEventListener(VERDICT_EVENT, handler);
  return () => target.removeEventListener(VERDICT_EVENT, handler);
}

/**
 * Like onVerdict, for listeners owned by a DOM node: the listener drops itself the first time it fires
 * after `node` left the document (views that are simply replaced need no explicit cleanup).
 */
export function onVerdictWhile(node, fn, target = globalThis.document) {
  const off = onVerdict((id, source) => {
    if (node && node.isConnected === false) { off(); return; }
    fn(id, source);
  }, target);
  return off;
}

let current = "";
/** Run fn (synchronously) with `source` as the origin of any verdict it changes: "panel" for a desktop panel, "" otherwise. */
export function withVerdictSource(source, fn) {
  const prev = current;
  current = source;
  try { return fn(); } finally { current = prev; }
}

/** Make store.swipe/unswipe emit after they change data. `sourceOf()` names where the change came from. */
export function watchStore(store, { sourceOf = () => current, target = globalThis.document } = {}) {
  if (store.__verdictBus) return store;
  for (const name of ["swipe", "unswipe"]) {
    const orig = store[name].bind(store);
    store[name] = (id, ...rest) => {
      const r = orig(id, ...rest);
      emitVerdict(id, sourceOf(), target);
      return r;
    };
  }
  Object.defineProperty(store, "__verdictBus", { value: true });
  return store;
}
