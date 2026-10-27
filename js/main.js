// App entry: loads the program, owns the store, hash router, tab bar and service worker.
import { mountTicker } from "./views/ticker.js";
import { watchInstall } from "./install.js";
import { welcomeOnce } from "./views/welcome.js";
import { hasRoute } from "./edition.js";
import { loadProgram } from "./data.js";
import { createStore, requestPersistence } from "./store.js";
import { clock } from "./clock.js";
import { parseHash, tabFor, MORE_ROUTES, groupNav, groupOf } from "./model.js";
import { h, icon, toast, openSheet } from "./ui.js";
import { closeTermPopover } from "./terms.js";
import { renderHome } from "./views/home.js";
import { loadFilters } from "./deck-model.js";
import { createLogistics } from "./logistics-model.js";
import { bootScreen, viewSpinner } from "./boot.js";
import { DESKTOP_QUERY, routeIntent, centreOf, withPanels, decodePanelEntries, panelEntries, closePanel, isPinned } from "./panels.js";
import { currentCentre, setCurrentCentre } from "./route-state.js";
import { watchStore, onVerdict } from "./verdict-bus.js";

const root = document.getElementById("app");
const store = createStore();
// The public edition (js/edition.js) never reads imported travel pages: no Logistics route, no workshop agendas from them.
const logistics = hasRoute("logistics") ? createLogistics() : null;
// Every keep/skip emits "iswc:verdict" (js/verdict-bus.js) tagged with where it was made ("panel" for a
// desktop panel, set by the verdict buttons), so the centre can catch up without redrawing itself mid-swipe.
watchStore(store);
const filters = loadFilters();
let program = null;
let cleanup = null;
let dash = null; // the desktop dashboard while the window is ≥ 1024px wide

// "Now" comes from the app clock (js/clock.js): Rome time.

// Every screen but Home loads its code the first time it's opened (the service worker has it offline): the
// first screen draws sooner. Tab screens are fetched in idle time after that, so the tabs answer at once.
const VIEWS = {
  item: () => import("./views/detail.js"), person: () => import("./views/person.js"), mine: () => import("./views/mine.js"),
  logistics: () => import("./views/logistics.js"), map: () => import("./views/map.js"), browse: () => import("./views/browse.js"),
  explore: () => import("./views/explore.js"), deck: () => import("./views/deck.js"), credits: () => import("./views/credits.js"),
  people: () => import("./views/people.js"), bari: () => import("./views/bari.js"), "sci-k": () => import("./views/workshop.js"),
  settings: () => import("./views/settings.js"), grid: () => import("./views/grid.js"), rete: () => import("./views/rete.js"),
  ontology: () => import("./views/ontology.js"), sparql: () => import("./views/sparql.js"),
};
const loaded = new Map(); // route -> its view module
let navToken = 0;
const loadView = (r) => (loaded.has(r) ? Promise.resolve(loaded.get(r)) : VIEWS[r]().then((m) => { loaded.set(r, m); return m; }));
function prefetchViews(routes) {
  const idle = globalThis.requestIdleCallback ?? ((f) => setTimeout(f, 300));
  idle(() => routes.forEach((r) => loadView(r).catch(() => {})));
}

function renderCentre(parsed) {
  const { route: r } = parsed;
  const token = ++navToken;
  try { cleanup?.(); } catch { /* a view's cleanup must never block navigation */ }
  cleanup = null;
  closeTermPopover({ restoreFocus: false });
  // Map, Browse, People, Bari, … have no tab of their own on phones: they light up More (model.js tabFor).
  const tab = tabFor(r, lastTab);
  document.querySelectorAll(".tabbar [data-route]").forEach((a) => {
    if (a.dataset.route === tab) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
  document.body.dataset.route = r;
  if (r !== "item" && r !== "person") lastTab = r;
  if (r !== "explore") loaded.get("explore")?.resetExploreNav();
  dash?.setRoute(r === "item" || r === "person" ? lastTab : r);
  if (VIEWS[r] && !loaded.has(r)) {
    // Its code first: a spinner if that takes a moment, then the screen (unless the user has moved on).
    const wait = setTimeout(() => { if (token === navToken) root.replaceChildren(viewSpinner()); }, 120);
    loadView(r).then(() => { clearTimeout(wait); if (token === navToken) drawCentre(parsed); }, (e) => {
      clearTimeout(wait);
      console.error(e);
      if (token !== navToken) return;
      root.replaceChildren(h("section", { class: "view empty" }, h("h2", {}, "Couldn't open this screen"),
        h("p", {}, "Its code didn't load. Connect to the internet once and try again; after that it works offline."),
        h("div", { class: "empty-actions" }, h("button", { class: "pill-btn primary", type: "button", onclick: () => location.reload() }, "Reload"))));
    });
    return;
  }
  drawCentre(parsed);
}

function drawCentre({ route: r, id, params }) {
  const V = (name) => loaded.get(name);
  let out;
  if (r === "item") out = V(r).renderDetail(root, program, store, id, logistics);
  else if (r === "person") out = V(r).renderPerson(root, program, store, id);
  else if (r === "mine") out = V(r).renderMine(root, program, store, clock, params);
  else if (r === "logistics") out = V(r).renderLogistics(root, program, logistics, id, clock.now(), () => route({ force: true }));
  else if (r === "map") out = V(r).renderMap(root, program, { roomId: params.room ?? null, floor: params.floor != null ? Number(params.floor) : null, now: clock.now });
  else if (r === "browse") out = V(r).renderBrowse(root, program, store, params);
  else if (r === "explore") out = V(r).renderExplore(root, program, store, params, filters);
  else if (r === "deck") out = V(r).renderDeck(root, program, store, filters);
  else if (r === "credits") out = V(r).renderCredits(root, program);
  else if (r === "people") out = V(r).renderPeople(root, program);
  else if (r === "bari") out = V(r).renderBari(root, clock, params);
  else if (r === "sci-k") out = V(r).renderWorkshop(root, program, store, clock);
  else if (r === "settings") out = V(r).renderSettings(root, store, clock);
  else if (r === "grid") out = V(r).renderGrid(root, program, store, clock, params);
  else if (r === "rete") out = V(r).renderRete(root, program, store);
  else if (r === "ontology") out = V(r).renderOntology(root, program, params);
  else if (r === "sparql") out = V(r).renderSparql(root, program, store, clock, params);
  else out = renderHome(root, program, store, clock, params);
  cleanup = typeof out === "function" ? out : null;
  window.scrollTo(0, 0);
}

/**
 * Hash router. Phones: every route renders in the one column. Desktop (dashboard): items, people and
 * clusters open as panels beside the centre route (#/item/x becomes <centre>?panels=…,x in place; from a
 * link inside a panel, right after that panel, see dashboard.js takeSource), and
 * the centre only re-renders when its own route changes. `force` redraws everything (data changed).
 */
function route({ force = false } = {}) {
  if (!program) return;
  const parsed = parseHash(location.hash);
  if (!dash) {
    // Remember the last route that would stay in the centre on desktop, so widening the window on an
    // item page puts that route back in the centre with the item as a panel.
    if (routeIntent(parsed, true).centre) setCurrentCentre(location.hash);
    renderCentre(parsed);
    return;
  }
  const intent = routeIntent(parsed, true);
  if (!intent.panel) dash.takeSource(null); // a link to a centre route: forget the clicked panel
  if (intent.panel && !dash.isKnown(intent.panel)) {
    // Not in this programme: show the full page's "isn't in the current program" state in the centre.
    setCurrentCentre(location.hash);
    renderCentre(parsed);
    dash.apply(dash.stack());
    return;
  }
  if (intent.panel) {
    if (parsed.route === "explore") loaded.get("explore")?.resetExploreNav();
    const centre = currentCentre() ?? "#/home";
    // A link clicked inside a panel opens beside that panel (a trail); anything else counts as the centre.
    const next = dash.open(intent.panel, dash.takeSource(location.hash));
    try { history.replaceState(null, "", withPanels(centre, panelEntries(next))); } catch { /* drawn anyway */ }
    if (force || currentCentre() == null) { setCurrentCentre(centre); renderCentre(parseHash(centre)); }
    else closeTermPopover({ restoreFocus: false });
    dash.apply(next, { focus: intent.panel });
    return;
  }
  const centre = centreOf(location.hash);
  const changed = force || centre !== currentCentre();
  let next;
  if (parsed.params.panels !== undefined) next = dash.restore(decodePanelEntries(parsed.params.panels));
  else if (changed && currentCentre() != null) next = dash.stack(); // a new centre route: panels stay open
  else next = dash.restore([]); // same route without panels (e.g. Back): only pinned ones stay
  // "Open full page" shows the item in the centre: its unpinned panel has done its job.
  if (parsed.params.full) {
    const fullId = parsed.route === "explore" ? parsed.params.cluster : parsed.id;
    if (fullId && !isPinned(next, fullId)) next = closePanel(next, fullId);
  }
  if (changed) { setCurrentCentre(centre); renderCentre(parsed); }
  // An item shown full page in the centre: its pinned panel steps aside (no second note editor).
  dash.setFull(parsed.params.full ? (parsed.route === "explore" ? parsed.params.cluster : parsed.id) ?? null : null);
  dash.apply(next);
}
let lastTab = "home";

/**
 * The phone's More tab: a bottom sheet of the routes without a tab (model.js MORE_ROUTES), each a link
 * with an icon and a line saying what it is. A sheet rather than a #/more route, so More never becomes a
 * page of its own in the history and Back from Bari goes straight back to where you were; the sheet closes
 * itself on the hash change its link makes.
 */
function openMore() {
  const here = tabFor(lastTab) === "more" ? lastTab : null; // the More route on screen (or under an item page)
  const sh = openSheet({ title: "More", label: "More sections" });
  // Grouped like the desktop sidebar, each group an expander: the one holding the current screen opens (else the first).
  const groups = groupNav(MORE_ROUTES);
  const openId = (here && groupOf(here)) ?? groups[0]?.id;
  const link = ([r, label, ic, desc]) => h("li", {},
    h("a", { class: "more-link", href: `#/${r}`, "aria-current": r === here ? "page" : null, onclick: () => { if (location.hash.startsWith(`#/${r}`)) sh.close(); } },
      h("span", { class: "more-ic" }, icon(ic, { size: 22 })),
      h("span", { class: "more-text" }, h("strong", {}, label), h("span", {}, desc))));
  sh.body.append(h("div", { class: "more-groups" }, groups.map((g) => h("details", { class: "more-group", open: g.id === openId || null },
    h("summary", {}, h("span", {}, g.label), h("span", { class: "more-gn" }, String(g.items.length)), icon("chevron", { size: 18 })),
    h("ul", { class: "more-list" }, g.items.map(link))))));
  (sh.el.querySelector(".more-link[aria-current]") ?? sh.el.querySelector(".more-group[open] .more-link") ?? sh.el.querySelector(".more-group > summary"))?.focus({ preventScroll: true });
}
document.querySelector(".tab-more")?.addEventListener("click", openMore);

// Another copy of the app (a browser tab, the installed app) changed the picks: reload them and
// redraw, unless the user is typing (the note editor keeps its text; the next redraw catches up).
function syncFromOtherCopies() {
  if (!store.refresh()) return;
  const typing = document.activeElement?.matches?.("textarea, input");
  if (!typing) { dash?.refresh(); route({ force: true }); }
}

/** Show a top banner; the deck sizes itself to the banner's real (wrapped) height. */
function showBanner(b) {
  document.body.prepend(b);
  document.documentElement.style.setProperty("--banner-h", `${b.offsetHeight}px`);
}

function persistenceBanner() {
  if (store.persistent) return;
  const b = h("div", { class: "banner", role: "status" },
    h("span", {}, "Notes won't be saved in this browser mode."),
    h("button", { type: "button", class: "banner-close", "aria-label": "Dismiss", onclick: () => b.remove() }, "OK"));
  showBanner(b);
}

// Behind the hosting password gate (hf/server.mjs) an expired session answers 401: the cached app would keep
// running an old build without ever seeing the new one, so go to the login page. Offline (no answer) changes nothing.
function checkSession() {
  fetch("sw.js", { cache: "no-store", credentials: "same-origin" })
    .then((r) => { if (r.status === 401) location.replace("login"); })
    .catch(() => {});
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  const hadController = !!navigator.serviceWorker.controller;
  checkSession();
  navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then((reg) => {
    if (hadController) reg.update().catch(() => {}); // a new deploy now, not at the browser's next own check
    // Re-check for a new deploy whenever the app comes back to the foreground.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") { checkSession(); reg.update().catch(() => {}); }
    });
  }).catch((e) => console.warn("service worker not registered:", e));
  // A new build that arrives before the person has touched the page reloads straight away (everything they
  // do is in localStorage); after that, it waits behind a toast so nothing they're looking at jumps.
  let touched = false;
  for (const t of ["pointerdown", "keydown", "touchstart"]) addEventListener(t, () => { touched = true; }, { once: true, capture: true });
  let shown = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController || shown) return; // first install: nothing to refresh
    shown = true;
    if (!touched) { location.reload(); return; }
    toast("A new version of the program is ready.", { action: "Reload", onAction: () => location.reload(), ms: 30000 });
  });
}

// The installed app (phone or desktop) always opens on Home, whatever page it was left on or the OS restores; a
// reload inside it (pull to refresh, a new build) stays where it is. In a browser tab a link opens what it names.
function launchedAsApp() {
  const standalone = matchMedia("(display-mode: standalone)").matches || matchMedia("(display-mode: window-controls-overlay)").matches
    || navigator.standalone === true;
  const nav = performance.getEntriesByType?.("navigation")?.[0];
  return standalone && nav?.type !== "reload";
}

// Desktop dashboard on/off with the window width; switching redraws the shell, keeping route and panels. Its
// code (and the panels' views) loads only on a wide window.
async function setupLayout() {
  const mq = matchMedia(DESKTOP_QUERY);
  let dashboard = null;
  const set = async () => {
    if (mq.matches && !dashboard) dashboard = (await import("./dashboard.js")).createDashboard({ program, store, clock, filters });
    const on = mq.matches; // the window may have changed while the code loaded
    if (on === !!dash) return;
    if (on) { dash = dashboard; dash.mount(); } else { dash.unmount(); dash = null; }
  };
  await set();
  mq.addEventListener("change", () => { set().then(() => route({ force: true }), (e) => console.error(e)); });
}

async function start() {
  requestPersistence();
  persistenceBanner();
  watchInstall(); // before the browser's install offer can fire
  registerServiceWorker();
  const boot = bootScreen();
  try {
    program = await loadProgram({ onProgress: boot.update });
  } catch (e) {
    boot.done();
    console.error(e);
    root.replaceChildren(h("section", { class: "view empty" },
      h("h2", {}, "Couldn't load the program"),
      h("p", {}, "Connect to the internet once and reload. After that the app works offline."),
      h("div", { class: "empty-actions" }, h("button", { class: "pill-btn primary", type: "button", onclick: () => location.reload() }, "Reload"))));
    return;
  }
  boot.done();
  console.info(`program source: ${program.source} (${program.sessions.length} sessions, ${program.papers.length} papers)`);
  const orphans = store.orphans(program);
  if (orphans.length) console.info(`${orphans.length} stored swipes/notes refer to items no longer in the program (kept)`);
  globalThis.iswc = { program, store, clock };
  mountTicker(program); // before the layout: the dashboard grid places it on its first row
  try { await setupLayout(); } catch (e) { console.error("desktop layout unavailable:", e); }
  // Deck and My ISWC draw their lists once; a keep/skip made in a desktop panel redraws them in place.
  onVerdict((_id, source) => {
    if (source !== "panel" || !["deck", "mine"].includes(document.body.dataset.route)) return;
    const x = window.scrollX, y = window.scrollY;
    renderCentre(parseHash(currentCentre() ?? location.hash));
    window.scrollTo(x, y); // the desktop row may be scrolled sideways: stay where the user is
  });
  if (!location.hash || location.hash === "#/" || launchedAsApp()) history.replaceState(null, "", "#/home");
  window.addEventListener("hashchange", route);
  window.addEventListener("storage", (e) => { if (e.key === null || e.key === "iswc26:v1") syncFromOtherCopies(); });
  window.addEventListener("storage", (e) => { if (logistics && (e.key === null || e.key === "iswc26:logistics")) { logistics.refresh(); route({ force: true }); } });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") syncFromOtherCopies(); });
  route();
  prefetchViews(["deck", "mine", "explore", "item"]);
  welcomeOnce(); // the first visit: what this is, installing it as an app, keeping a copy of your data
}

start();
