// Debounced save that never drops the last edit: pending work is flushed when the page is
// hidden (app switched / screen locked) or unloaded (pagehide), the two events iOS reliably fires
// before it suspends or kills a standalone web app. DOM-free apart from the injected targets.

/**
 * createAutosave(save, { delay, win, doc, setTimer, clearTimer }) -> { schedule(), flush(), dispose(), pending }
 * schedule(): (re)start the debounce. flush(): run save now if one is pending.
 * dispose(): flush, then remove the lifecycle listeners (call from the view/sheet cleanup).
 */
export function createAutosave(save, {
  delay = 300,
  win = globalThis,
  doc = globalThis.document,
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (t) => clearTimeout(t),
} = {}) {
  let timer = null;
  let pending = false;
  let disposed = false;
  const flush = () => {
    if (timer !== null) { clearTimer(timer); timer = null; }
    if (!pending) return;
    pending = false;
    save();
  };
  const onHide = () => { if (!doc || doc.visibilityState === "hidden") flush(); };
  win?.addEventListener?.("pagehide", flush);
  doc?.addEventListener?.("visibilitychange", onHide);
  return {
    get pending() { return pending; },
    schedule() {
      if (disposed) return;
      pending = true;
      if (timer !== null) clearTimer(timer);
      timer = setTimer(flush, delay);
    },
    flush,
    dispose() {
      if (disposed) return;
      flush();
      disposed = true;
      win?.removeEventListener?.("pagehide", flush);
      doc?.removeEventListener?.("visibilitychange", onHide);
    },
  };
}
