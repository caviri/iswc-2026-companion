// The boot screen (in index.html until the first view draws): a spinner, what is happening, and a progress bar
// while the engine and the graph download (determinate once both sizes are known). After a few seconds it adds
// that the download happens once. Also the small spinner a lazily loaded screen shows while its code arrives.
// bootLabel is pure (tests/app/boot.test.mjs).
import { h } from "./ui.js";
import { formatBytes } from "./offline-model.js";

/** loadProgram's progress -> { text, pct (0–100) | null, detail }. */
export function bootLabel(p = {}) {
  if (p.step === "open") return { text: "Opening the graph", pct: 100, detail: "" };
  if (p.step === "read") return { text: "Reading the programme with SPARQL", pct: 100, detail: "" };
  if (p.step === "download" && p.loaded > 0) {
    const pct = p.total ? Math.min(100, Math.round((p.loaded / p.total) * 100)) : null;
    return { text: "Downloading the programme", pct, detail: p.total ? `${formatBytes(p.loaded)} of ${formatBytes(p.total)}` : formatBytes(p.loaded) };
  }
  return { text: "Loading the programme", pct: null, detail: "" };
}

const SLOW_MS = 5000;

/** Follow loadProgram's progress on the boot screen; returns { update(progress), done() }. */
export function bootScreen(doc = document) {
  const box = doc.querySelector("#app .boot");
  if (!box) return { update() {}, done() {} };
  const step = box.querySelector(".boot-step");
  const detail = box.querySelector(".boot-detail");
  const bar = box.querySelector(".boot-bar");
  const fill = box.querySelector(".boot-bar i");
  const slow = setTimeout(() => box.querySelector(".boot-slow")?.removeAttribute("hidden"), SLOW_MS);
  let last = "";
  return {
    update(p) {
      const l = bootLabel(p);
      const key = `${l.text}|${l.pct}|${l.detail}`;
      if (key === last) return;
      last = key;
      if (step) step.textContent = l.text;
      if (detail) detail.textContent = l.detail;
      if (bar) {
        bar.classList.toggle("indeterminate", l.pct == null);
        if (l.pct != null) bar.setAttribute("aria-valuenow", String(l.pct)); else bar.removeAttribute("aria-valuenow");
      }
      if (fill) fill.style.width = l.pct == null ? "" : `${l.pct}%`;
    },
    done() { clearTimeout(slow); },
  };
}

/** The spinner a screen shows while its code loads (only when that takes a moment). */
export const viewSpinner = (label = "Loading") =>
  h("div", { class: "view-loading", role: "status" }, h("span", { class: "spinner", "aria-hidden": "true" }), h("span", {}, label));
