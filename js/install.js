// Installing the app (PWA): remembers the browser's install offer (beforeinstallprompt: Chrome, Edge, Android) so
// a button can use it later, and says how to install where there is no such offer (Safari: Share, then Add to Home
// Screen). platform() is pure given its inputs (tests/app/prefs.test.mjs).
let offer = null;
const listeners = new Set();

/** Start listening (once, early in main.js) for the browser's install offer and for the app being installed. */
export function watchInstall(win = globalThis) {
  win.addEventListener?.("beforeinstallprompt", (e) => { e.preventDefault(); offer = e; listeners.forEach((f) => f()); });
  win.addEventListener?.("appinstalled", () => { offer = null; listeners.forEach((f) => f()); });
}

/** Call fn when the offer comes or goes; returns unsubscribe. */
export function onInstallChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

/** Can a button install the app right now? */
export const canPrompt = () => !!offer;

/** Show the browser's install dialog -> "accepted" | "dismissed" | "unavailable". */
export async function promptInstall() {
  if (!offer) return "unavailable";
  const e = offer;
  offer = null;
  try { await e.prompt(); return (await e.userChoice)?.outcome ?? "dismissed"; } catch { return "unavailable"; }
}

/**
 * Where the app runs, for the install advice: "installed" (already an app), "ios" (Safari: Share, Add to Home
 * Screen), "android", "desktop". Inputs default to the browser's.
 */
export function platform({ ua = globalThis.navigator?.userAgent ?? "", standalone = isStandalone(), touchMac = touchMacOf() } = {}) {
  if (standalone) return "installed";
  if (/iPhone|iPad|iPod/.test(ua) || touchMac) return "ios";
  if (/Android/.test(ua)) return "android";
  return "desktop";
}

function isStandalone() {
  try { return globalThis.matchMedia?.("(display-mode: standalone)").matches || globalThis.navigator?.standalone === true; } catch { return false; }
}
function touchMacOf() {
  try { return globalThis.navigator?.platform === "MacIntel" && globalThis.navigator?.maxTouchPoints > 1; } catch { return false; }
}
