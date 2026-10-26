// Settings (#/settings). Offline: whether the app, its data and every image are saved on this device, one button
// that saves everything (the service worker's precache: app, programme, maps, guide; then every image under img/)
// and asks the browser to keep it, the space it takes, and a button that removes the saved images again.
// Version: the build this device runs, and a check for a newer one. Pure parts: js/offline-model.js.
import { h, icon, toast } from "../ui.js";
import { IMG_CACHE, saveImages, countCached } from "../images-model.js";
import { allImageUrls, buildCacheName, buildId, formatBytes, offlineSummary } from "../offline-model.js";
import { getGraph, ensureEngine } from "../data.js";
import { Q_DATASET } from "../queries.js";
import { dayLong } from "../model.js";
import { fileName, pickSettings, toJSON, parseJSON, toTurtle, fromRows, importSummary, isSettingKey,
  Q_EXPORT_META, Q_EXPORT_VERDICTS, Q_EXPORT_NOTES, Q_EXPORT_SETTINGS } from "../prefs-model.js";
import { showWelcome } from "./welcome.js";

/** The data's version from the graph (data/VERSION, dated by data/CHANGELOG.md): "Data 1.0.0, Mon 26 October". */
function dataVersion() {
  try {
    const r = getGraph()?.query(Q_DATASET)?.[0];
    const v = (t) => (t && typeof t === "object" && "value" in t ? t.value : t);
    return r ? `Data ${v(r.version)}, released ${dayLong(String(v(r.issued)).slice(0, 10))}` : null;
  } catch { return null; }
}

const hasCaches = () => typeof caches !== "undefined";
const sw = () => (typeof navigator !== "undefined" && "serviceWorker" in navigator ? navigator.serviceWorker : null);

/** { shell, images, total, persisted, usage, build } from the caches and the storage manager; never throws. */
async function readState(urls) {
  const out = { shell: false, images: 0, total: urls.length, persisted: null, usage: null, build: null };
  if (hasCaches()) {
    try {
      const name = buildCacheName(await caches.keys());
      out.build = buildId(name);
      if (name) {
        const c = await caches.open(name);
        out.shell = !!(await c.match("index.html")) && !!(await c.match("data/program.json"));
      }
      out.images = await countCached(urls, await caches.open(IMG_CACHE));
    } catch { /* unknown: shown as not saved */ }
  }
  try { out.persisted = (await navigator.storage?.persisted?.()) ?? null; } catch { /* unknown */ }
  try { out.usage = (await navigator.storage?.estimate?.())?.usage ?? null; } catch { /* unknown */ }
  return out;
}

function offlineSection() {
  const urls = allImageUrls();
  const status = h("p", { class: "st-status", "aria-live": "polite" }, "Checking what's saved…");
  const usage = h("p", { class: "src-note" });
  const bar = h("progress", { class: "cr-bar", max: String(urls.length + 1), value: "0", hidden: true });
  const saveBtn = h("button", { type: "button", class: "pill-btn primary" }, icon("check", { size: 18 }), "Download everything");
  const clearBtn = h("button", { type: "button", class: "pill-btn" }, icon("x", { size: 18 }), "Remove saved images");
  // .pill-btn sets display, which beats the hidden attribute: show / hide through the style.
  const show = (el, on) => { el.style.display = on ? "" : "none"; };
  const label = (text) => { saveBtn.lastChild.textContent = text; };
  let busy = false;

  const draw = async () => {
    const s = await readState(urls);
    const m = offlineSummary(s);
    status.textContent = m.text;
    status.dataset.level = m.level;
    usage.textContent = s.usage != null ? `This app uses ${formatBytes(s.usage)} on this device.` : "";
    saveBtn.disabled = busy || m.level === "all";
    label(m.level === "all" ? "Everything saved" : "Download everything");
    show(clearBtn, !busy && s.images > 0);
    return s;
  };

  saveBtn.addEventListener("click", async () => {
    if (busy || !hasCaches()) return;
    busy = true; saveBtn.disabled = true; show(clearBtn, false); bar.hidden = false; bar.value = 0;
    try { await navigator.storage?.persist?.(); } catch { /* the browser decides */ }
    // 1. The app, programme, maps and guide: the service worker precaches them on install.
    status.textContent = "Saving the app and the programme…";
    try { const reg = await sw()?.ready; await reg?.update?.(); } catch { /* offline or no worker: images still go */ }
    bar.value = 1;
    // 2. Every image.
    const cache = await caches.open(IMG_CACHE);
    const r = await saveImages(urls, { cache, fetchFn: (u) => fetch(u), concurrency: 6, onProgress: ({ done, total, failed }) => {
      bar.value = 1 + done + failed;
      status.textContent = `Saving images: ${done + failed} of ${total}`;
    } });
    busy = false; bar.hidden = true;
    await draw();
    if (r.failed) {
      status.textContent = `${r.done} of ${r.total} images saved; ${r.failed} could not be loaded. Check the connection and try again.`;
      label("Try again");
    } else toast("Everything is saved for offline use.");
  });

  clearBtn.addEventListener("click", async () => {
    if (busy || !hasCaches()) return;
    await caches.delete(IMG_CACHE);
    await draw();
    toast("Saved images removed. They download again when shown.");
  });

  draw();
  return h("section", { class: "st-section", "aria-labelledby": "st-offline" },
    h("h2", { class: "st-h", id: "st-offline" }, icon("download", { size: 20 }), "Offline"),
    h("p", { class: "st-sub" }, "The programme, your picks and notes already work without a connection. Download everything to also have every photo, logo and figure (" + urls.length + " images) on the plane or in a basement room."),
    status, bar, h("div", { class: "st-actions" }, saveBtn, clearBtn), usage,
    h("p", { class: "src-note" }, "Your picks and notes stay on this device either way; removing images never touches them."));
}

function versionSection() {
  const line = h("p", { class: "st-status" }, "…");
  const data = dataVersion();
  const btn = h("button", { type: "button", class: "pill-btn" }, icon("refresh", { size: 18 }), "Check for an update");
  const draw = async () => {
    let name = null;
    try { name = hasCaches() ? buildCacheName(await caches.keys()) : null; } catch { /* unknown */ }
    line.textContent = name ? `App ${buildId(name)}` : "Not installed for offline use yet.";
  };
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    const before = line.textContent;
    try {
      const reg = await sw()?.getRegistration?.();
      await reg?.update();
      await new Promise((r) => setTimeout(r, 1500));
      await draw();
      // A new build reloads the page by itself (main.js); otherwise say so.
      if (line.textContent === before) toast("You have the latest version.");
    } catch { toast("Couldn't check: no connection?"); }
    btn.disabled = false;
  });
  draw();
  return h("section", { class: "st-section", "aria-labelledby": "st-version" },
    h("h2", { class: "st-h", id: "st-version" }, icon("info", { size: 20 }), "Version"),
    line, data ? h("p", { class: "src-note" }, data) : null, h("div", { class: "st-actions" }, btn));
}

// ---------- your data: export / import ----------
const storageEntries = () => {
  try { return Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)).map((k) => [k, localStorage.getItem(k)]); } catch { return []; }
};
function download(name, blob) {
  const url = URL.createObjectURL(blob);
  const a = h("a", { href: url, download: name, hidden: true });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}
async function appBuild() {
  try { return buildId(buildCacheName(await caches.keys())); } catch { return null; }
}
function dataVersionId() {
  try { const r = getGraph()?.query(Q_DATASET)?.[0]; return r ? String(r.version?.value ?? r.version) : null; } catch { return null; }
}
/** The export's contents, now. */
async function exportParts(store, clock) {
  return { snapshot: store.snapshot(), settings: pickSettings(storageEntries()), exported: clock.now(), app: await appBuild(), data: dataVersionId() };
}
/** A chosen file -> { swipes, notes, settings }: a .rete export is opened and read with SPARQL, anything else as JSON. */
async function readImport(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const looksJson = bytes[0] === 0x7b || /\.json$/i.test(file.name);
  if (looksJson) return parseJSON(new TextDecoder().decode(bytes));
  const engine = await ensureEngine().catch(() => null);
  if (!engine) throw new Error("Reading .rete files needs the graph engine, which hasn't loaded: try again online.");
  let g;
  try { g = await engine.open(bytes); } catch { throw new Error("That file isn't a .rete graph or a JSON export."); }
  const q = async (s) => { try { return await g.query(s); } catch { return []; } };
  return fromRows({ meta: await q(Q_EXPORT_META), verdicts: await q(Q_EXPORT_VERDICTS), notes: await q(Q_EXPORT_NOTES), settings: await q(Q_EXPORT_SETTINGS) });
}

function dataSection(store, clock) {
  const status = h("p", { class: "st-status", "aria-live": "polite" });
  const counts = () => {
    const s = store.snapshot();
    const v = Object.values(s.swipes);
    const n = (x) => v.filter((w) => w.v === x).length;
    const notes = Object.keys(s.notes).length;
    return `${n("right")} kept, ${n("up")} maybe, ${n("left")} skipped, ${notes} ${notes === 1 ? "note" : "notes"} on this device.`;
  };
  status.textContent = counts();
  const jsonBtn = h("button", { type: "button", class: "pill-btn primary" }, icon("download", { size: 18 }), "Download as JSON");
  const reteBtn = h("button", { type: "button", class: "pill-btn" }, icon("download", { size: 18 }), "Download as .rete");
  const file = h("input", { type: "file", accept: ".json,.rete,application/json,application/octet-stream", hidden: true });
  const importBtn = h("button", { type: "button", class: "pill-btn" }, icon("refresh", { size: 18 }), "Import a file");
  const note = h("p", { class: "src-note" });

  jsonBtn.addEventListener("click", async () => {
    const parts = await exportParts(store, clock);
    download(fileName(parts.exported, "json"), new Blob([toJSON(parts)], { type: "application/json" }));
    note.textContent = `Saved ${fileName(parts.exported, "json")}.`;
  });
  reteBtn.addEventListener("click", async () => {
    reteBtn.disabled = true;
    const engine = await ensureEngine().catch(() => null);
    if (!engine?.build) { note.textContent = "The graph engine hasn't loaded yet: try again in a moment, online."; reteBtn.disabled = false; return; }
    try {
      const parts = await exportParts(store, clock);
      const bytes = await engine.build(toTurtle(parts), "ttl");
      download(fileName(parts.exported, "rete"), new Blob([bytes], { type: "application/octet-stream" }));
      note.textContent = `Saved ${fileName(parts.exported, "rete")}: your picks and notes as a graph, linked to the programme's own identifiers.`;
    } catch (e) {
      note.textContent = `Couldn't build the .rete file: ${e?.message ?? e}`;
    }
    reteBtn.disabled = false;
  });
  importBtn.addEventListener("click", () => file.click());
  file.addEventListener("change", async () => {
    const f = file.files?.[0];
    file.value = "";
    if (!f) return;
    try {
      const got = await readImport(f);
      const merged = store.merge(got);
      let settings = 0;
      for (const [k, v] of Object.entries(got.settings)) {
        try { if (isSettingKey(k) && localStorage.getItem(k) !== v) { localStorage.setItem(k, v); settings++; } } catch { /* storage full or blocked */ }
      }
      const what = importSummary({ swipes: merged.swipes, notes: merged.notes, settings });
      status.textContent = counts();
      note.textContent = `Imported ${what} from ${f.name}${got.exported ? ` (exported ${String(got.exported).slice(0, 16).replace("T", " ")})` : ""}.`;
      if (what !== "nothing new") {
        toast(`Imported ${what}.`, { action: "Reload", onAction: () => location.reload(), ms: 15000 });
      }
    } catch (e) {
      note.textContent = e?.message ?? String(e);
    }
  });

  return h("section", { class: "st-section", "aria-labelledby": "st-data" },
    h("h2", { class: "st-h", id: "st-data" }, icon("check", { size: 20 }), "Your data"),
    h("p", { class: "st-sub" }, "Your picks (keep, maybe, skip), your notes and the app's settings live only in this browser. Download a copy to keep it safe or to move it to another device, then import it there: picks and notes are merged, the newer one wins."),
    status,
    h("div", { class: "st-actions" }, jsonBtn, reteBtn, importBtn, file),
    note,
    h("p", { class: "src-note" }, "Files are named iswc26- and the date and time. The .rete file is an RDF graph (ic:Verdict, ic:Note, ic:Setting) you can open with any rete tool or query together with the programme's graph. Imported travel pages are never included."));
}

function welcomeSection() {
  return h("section", { class: "st-section", "aria-labelledby": "st-welcome" },
    h("h2", { class: "st-h", id: "st-welcome" }, icon("info", { size: 20 }), "About this app"),
    h("p", { class: "st-sub" }, "A static page you can install as an app (PWA). It works offline and keeps everything on this device."),
    h("div", { class: "st-actions" }, h("button", { type: "button", class: "pill-btn", onclick: () => showWelcome() }, "Show the welcome again")));
}

/** renderSettings(root, store, clock) -> cleanup() */
export function renderSettings(root, store, clock) {
  root.replaceChildren(h("section", { class: "view settings-view" },
    h("div", { class: "view-head" }, h("h1", { class: "view-title" }, "Settings")),
    dataSection(store, clock),
    offlineSection(),
    welcomeSection(),
    versionSection()));
  return () => {};
}
