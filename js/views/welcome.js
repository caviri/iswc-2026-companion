// The welcome dialog: shown once on the first visit (and from Settings). What the app is (a static page: no
// account, nothing leaves this device), how to install it as an app on this device, and where to back up your
// picks. A native <dialog> (focus stays inside, Escape closes it).
import { h, icon } from "../ui.js";
import { canPrompt, promptInstall, onInstallChange, platform } from "../install.js";

const SEEN_KEY = "iswc26:welcome";
const seen = () => { try { return !!localStorage.getItem(SEEN_KEY); } catch { return false; } };
const markSeen = () => { try { localStorage.setItem(SEEN_KEY, "seen"); } catch { /* shown again next visit */ } };

const how = (where) => ({
  ios: ["In Safari, tap ", h("strong", {}, "Share"), " (the square with an arrow), then ", h("strong", {}, "Add to Home Screen"),
    ". Do it before you start swiping: picks made in a Safari tab stay in Safari, the installed app has its own."],
  android: ["Use the button below, or your browser's menu, then ", h("strong", {}, "Install app"), " (or Add to Home screen)."],
  desktop: ["Use the button below, or the install icon at the right of the address bar (Chrome, Edge). In other browsers, keep this page as a bookmark: it works offline once loaded."],
})[where];

/** Open the welcome dialog -> close(). */
export function showWelcome() {
  const where = platform();
  const installBtn = h("button", { type: "button", class: "pill-btn primary" }, icon("download", { size: 18 }), "Install the app");
  const drawInstall = () => { installBtn.hidden = !canPrompt(); };
  installBtn.addEventListener("click", async () => { if ((await promptInstall()) === "accepted") close(); drawInstall(); });
  const offInstall = onInstallChange(drawInstall);
  drawInstall();
  const dlg = h("dialog", { class: "welcome", "aria-labelledby": "welcome-h" },
    h("div", { class: "wl-body" },
      h("p", { class: "wl-k" }, "ISWC 2026 · Bari, 25–29 October"),
      h("h2", { id: "welcome-h", class: "wl-h" }, "Welcome to the ISWC 2026 Companion"),
      h("p", {}, "Swipe through the programme, keep what matters, take notes, and find your way: the timetable by room, workshop programmes, people, maps and a guide to Bari."),
      h("ul", { class: "wl-points" },
        h("li", {}, icon("check", { size: 18 }), h("span", {}, h("strong", {}, "A static page. "), "No account and no server behind it: your picks and notes stay in this browser, on this device.")),
        h("li", {}, icon("download", { size: 18 }), h("span", {}, h("strong", {}, "Install it as an app. "), "It's a progressive web app: once installed it opens like any app, full screen, and works offline at the venue.")),
        h("li", {}, icon("gear", { size: 18 }), h("span", {}, h("strong", {}, "Keep a copy. "), "Settings → Your data downloads your picks and notes as JSON or as a .rete graph, and imports them on another device."))),
      where === "installed" ? h("p", { class: "wl-note" }, "You're already using the installed app.")
        : h("div", { class: "wl-how" }, h("h3", {}, where === "ios" ? "Install on iPhone or iPad" : where === "android" ? "Install on Android" : "Install on this computer"),
          h("p", {}, how(where)))),
    h("div", { class: "wl-actions" }, where === "installed" ? null : installBtn,
      h("button", { type: "button", class: "pill-btn primary wl-start", onclick: () => close() }, "Start")));
  function close() {
    markSeen();
    offInstall();
    if (dlg.open) dlg.close();
    dlg.remove();
  }
  dlg.addEventListener("cancel", () => markSeen());
  dlg.addEventListener("close", () => { markSeen(); offInstall(); dlg.remove(); });
  document.body.append(dlg);
  if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", "");
  return close;
}

/** On the first visit only (not inside the installed app once seen). */
export function welcomeOnce() {
  if (seen()) return null;
  return showWelcome();
}
