// Service worker: cache-first for everything the app needs, so it runs offline after the first visit.
// BUILD is rewritten by `make stamp` (part of `make data`) to a hash of app/ contents, so every
// deploy with changed code or data gets a fresh cache and the old one is deleted on activate.
const BUILD = "970218449bca";
const CACHE = `iswc26-${BUILD}`;
// Images (img/, ~0.7 MB) are NOT precached: they are cached when first shown (or all at once from the credits
// page) in a cache of their own that outlives builds. Must equal IMG_CACHE in js/images-model.js.
const IMG_CACHE = "iswc26-img";
// Written by `make stamp`: every file under img/ with a hash of its content. Only these are cached, under the
// url the page asks for (img/x.webp?v=<hash>), so a replaced file is fetched again; other entries are pruned on activate.
const IMAGES = {
 "img/bari/al-sorso-preferito.webp": "771dc385",
 "img/bari/alberobello.webp": "5661d18e",
 "img/bari/auditorium-nino-rota.webp": "dc75454d",
 "img/bari/basilica-san-nicola.webp": "17f134ec",
 "img/bari/biancofiore.webp": "6103639e",
 "img/bari/bitonto.webp": "96a787f8",
 "img/bari/castel-del-monte.webp": "723429a2",
 "img/bari/castello-normanno-svevo.webp": "b83a9cf4",
 "img/bari/cattedrale-san-sabino.webp": "d43742d7",
 "img/bari/classica-in-chiave-brasiliana-2026-10-26.webp": "5c5d7cfa",
 "img/bari/concerto-sinfonico-axelrod-2026-10-31.webp": "2d31d841",
 "img/bari/gelateria-gasperini.webp": "053b1996",
 "img/bari/gelateria-gentile.webp": "94667ad7",
 "img/bari/gelateria-piccinni.webp": "ea2a8651",
 "img/bari/il-gelatiere.webp": "e659dd4f",
 "img/bari/il-trovatore-2026-10-25.webp": "2d31d841",
 "img/bari/il-trovatore-2026-10-27.webp": "2d31d841",
 "img/bari/la-muraya.webp": "3f83db0d",
 "img/bari/la-tana-del-polpo.webp": "2101aee8",
 "img/bari/le-2-aquile.webp": "01846a44",
 "img/bari/locorotondo.webp": "a338a10c",
 "img/bari/lungomare-nazario-sauro.webp": "b26bae79",
 "img/bari/mastrociccio.webp": "b5bf05d5",
 "img/bari/matera.webp": "2190eda4",
 "img/bari/monopoli.webp": "e21a8d58",
 "img/bari/muraglia.webp": "f6fc567e",
 "img/bari/murat.webp": "97311eac",
 "img/bari/museo-santa-scolastica.webp": "a6151406",
 "img/bari/nderr-a-la-lanze.webp": "6964516a",
 "img/bari/neverland-via-toti.webp": "579a2692",
 "img/bari/officina-degli-esordi.webp": "78c5f2d1",
 "img/bari/osteria-delle-travi.webp": "fe4b8620",
 "img/bari/ostuni.webp": "36574778",
 "img/bari/pane-e-pomodoro.webp": "e19b419b",
 "img/bari/panificio-fiore.webp": "346d712f",
 "img/bari/panificio-santa-rita.webp": "16c9c0f6",
 "img/bari/piazza-del-ferrarese.webp": "22829f87",
 "img/bari/piazza-mercantile.webp": "95860a5d",
 "img/bari/pinacoteca-giaquinto.webp": "66bf2496",
 "img/bari/polignano-a-mare.webp": "4a3bfd4d",
 "img/bari/ruvo-di-puglia.webp": "f4738873",
 "img/bari/sgagliozze-bari-vecchia.webp": "6eec1d38",
 "img/bari/spazio-murat.webp": "2567c7e4",
 "img/bari/strada-arco-basso.webp": "380e3fb5",
 "img/bari/teatro-margherita.webp": "47412541",
 "img/bari/teatro-petruzzelli.webp": "a43a670b",
 "img/bari/time-zones-danalogue-system-exclusive-2026-10-30.webp": "78c5f2d1",
 "img/bari/trani.webp": "b3554fd9",
 "img/bari/tuccio-cucina-e-caffe.webp": "9a6fc88f",
 "img/graphs/graph-logo-wikidata.webp": "46dbb611",
 "img/orgs/org-logo-001z21q04.webp": "366949d3",
 "img/orgs/org-logo-002n09z45.webp": "18a47f3c",
 "img/orgs/org-logo-006e5kg04.webp": "20324dfa",
 "img/orgs/org-logo-00cv9y106.webp": "b96a50ab",
 "img/orgs/org-logo-00eaycp31.webp": "949d5562",
 "img/orgs/org-logo-00fbnyb24.webp": "ec0e8605",
 "img/orgs/org-logo-00hmyb194.webp": "351a3ac2",
 "img/orgs/org-logo-00njsd438.webp": "ab7e36e7",
 "img/orgs/org-logo-00sse7z02.webp": "2802bc7a",
 "img/orgs/org-logo-00y0xnp53.webp": "93fc47ba",
 "img/orgs/org-logo-0117jxy09.webp": "00d1609e",
 "img/orgs/org-logo-0161xgx34.webp": "9e488c1a",
 "img/orgs/org-logo-019whta54.webp": "44dfda52",
 "img/orgs/org-logo-01ayc5b57.webp": "3dd40d5d",
 "img/orgs/org-logo-01c27hj86.webp": "e9613b08",
 "img/orgs/org-logo-01fe0jt45.webp": "c1b640be",
 "img/orgs/org-logo-01j33xk10.webp": "cb8cbebe",
 "img/orgs/org-logo-01kg8sb98.webp": "aa83f0b7",
 "img/orgs/org-logo-01kzn7k21.webp": "cc4b2541",
 "img/orgs/org-logo-01qckj285.webp": "a6c65e71",
 "img/orgs/org-logo-01r7awg59.webp": "de8c5a3d",
 "img/orgs/org-logo-01rtyzb94.webp": "48d03cc6",
 "img/orgs/org-logo-01rxvg760.webp": "aa246b10",
 "img/orgs/org-logo-01ryk1543.webp": "355238b2",
 "img/orgs/org-logo-01swzsf04.webp": "5ab6d6a8",
 "img/orgs/org-logo-01tjs6929.webp": "51b3a1b8",
 "img/orgs/org-logo-01xtthb56.webp": "f8fb9e59",
 "img/orgs/org-logo-01xv1nn60.webp": "7e08efdb",
 "img/orgs/org-logo-01yc7t268.webp": "690da2ac",
 "img/orgs/org-logo-01ynf4891.webp": "ba335270",
 "img/orgs/org-logo-0220mzb33.webp": "a94e4dec",
 "img/orgs/org-logo-02309jg23.webp": "a5d4936c",
 "img/orgs/org-logo-0234wmv40.webp": "e4100b1c",
 "img/orgs/org-logo-024d6js02.webp": "83bfb671",
 "img/orgs/org-logo-027m9bs27.webp": "d6044432",
 "img/orgs/org-logo-028hv5492.webp": "ab1f0e64",
 "img/orgs/org-logo-029pk6x14.webp": "f31fbb80",
 "img/orgs/org-logo-02be6w209.webp": "151e7e25",
 "img/orgs/org-logo-02e2c7k09.webp": "de91a792",
 "img/orgs/org-logo-02feahw73.webp": "25fdf2d0",
 "img/orgs/org-logo-02hpadn98.webp": "97eb14d6",
 "img/orgs/org-logo-02j61yw88.webp": "88f6acfe",
 "img/orgs/org-logo-02jx3x895.webp": "41e80146",
 "img/orgs/org-logo-02kcbn207.webp": "09a777ad",
 "img/orgs/org-logo-02kkvpp62.webp": "5985b2b3",
 "img/orgs/org-logo-02p77k626.webp": "3b6e2b28",
 "img/orgs/org-logo-02rmd1t30.webp": "24e259c3",
 "img/orgs/org-logo-02rwycx38.webp": "827c6c3f",
 "img/orgs/org-logo-02w2y2t16.webp": "331bcdb6",
 "img/orgs/org-logo-0304hq317.webp": "1ca2def7",
 "img/orgs/org-logo-030eybx10.webp": "96ddab7e",
 "img/orgs/org-logo-031bsb921.webp": "40d78833",
 "img/orgs/org-logo-035dkdb55.webp": "8e9d6bec",
 "img/orgs/org-logo-0387prb75.webp": "aa9c1fd1",
 "img/orgs/org-logo-039a2re55.webp": "f88639ba",
 "img/orgs/org-logo-039bp8j42.webp": "0c581777",
 "img/orgs/org-logo-03a64bh57.webp": "60cf1a83",
 "img/orgs/org-logo-03awzbc87.webp": "750612f5",
 "img/orgs/org-logo-03cqe8w59.webp": "ca4c3a22",
 "img/orgs/org-logo-03efmqc40.webp": "43eeda21",
 "img/orgs/org-logo-03gnr7b55.webp": "ccc3334f",
 "img/orgs/org-logo-03mb6wj31.webp": "241f7899",
 "img/orgs/org-logo-03n6nwv02.webp": "ba5dd1b2",
 "img/orgs/org-logo-03prydq77.webp": "70ca7451",
 "img/orgs/org-logo-03t54am93.webp": "562420df",
 "img/orgs/org-logo-03wb8xz10.webp": "8dc5e6b6",
 "img/orgs/org-logo-03xjwb503.webp": "89f4b34c",
 "img/orgs/org-logo-03yghzc09.webp": "1a760324",
 "img/orgs/org-logo-03yn8s215.webp": "d84fdcb3",
 "img/orgs/org-logo-041kmwe10.webp": "95b7d0ad",
 "img/orgs/org-logo-0420zvk78.webp": "25d2d1c0",
 "img/orgs/org-logo-042aqky30.webp": "d944a492",
 "img/orgs/org-logo-042tfbd02.webp": "355a3069",
 "img/orgs/org-logo-046rm7j60.webp": "947d3243",
 "img/orgs/org-logo-047gc3g35.webp": "b6025cfe",
 "img/orgs/org-logo-04aj4c181.webp": "d3f105e3",
 "img/orgs/org-logo-04b9vrm74.webp": "2e17b4ff",
 "img/orgs/org-logo-04ct4d772.webp": "62845fd0",
 "img/orgs/org-logo-04d836q62.webp": "3467dc0b",
 "img/orgs/org-logo-04dkp9463.webp": "2a3817b9",
 "img/orgs/org-logo-04knbh022.webp": "cf5f2f9f",
 "img/orgs/org-logo-04m5j1k67.webp": "6e707496",
 "img/orgs/org-logo-04q12yn84.webp": "f646cb8d",
 "img/orgs/org-logo-04q78tk20.webp": "db7342d7",
 "img/orgs/org-logo-04qk6pt94.webp": "67aa4647",
 "img/orgs/org-logo-04t3en479.webp": "84e79516",
 "img/orgs/org-logo-04t5xt781.webp": "08aa81cb",
 "img/orgs/org-logo-04teye511.webp": "05d7135d",
 "img/orgs/org-logo-04tsk2644.webp": "b2980015",
 "img/orgs/org-logo-04vnq7t77.webp": "1cdcd99e",
 "img/orgs/org-logo-04xfq0f34.webp": "834cbc19",
 "img/orgs/org-logo-04yqw9c44.webp": "37f570cc",
 "img/orgs/org-logo-04z8k9a98.webp": "9dd8eb0d",
 "img/orgs/org-logo-04zaypm56.webp": "f2fa4d74",
 "img/orgs/org-logo-058kzsd48.webp": "7418bfe4",
 "img/orgs/org-logo-05a1dws80.webp": "bbf98909",
 "img/orgs/org-logo-05f82e368.webp": "504d232d",
 "img/orgs/org-logo-05f8d4e86.webp": "87cdf2f4",
 "img/orgs/org-logo-05f950310.webp": "d91d7265",
 "img/orgs/org-logo-05hh8d621.webp": "85b4274f",
 "img/orgs/org-logo-05hkkdn48.webp": "385bd1c0",
 "img/orgs/org-logo-05jxfge78.webp": "014d6ec6",
 "img/orgs/org-logo-05mzfcs16.webp": "f14fc037",
 "img/orgs/org-logo-05r3f7h03.webp": "1183c9a8",
 "img/orgs/org-logo-05ynxx418.webp": "1d7503ef",
 "img/people/person-angelo-salatino.webp": "75bac8ef",
 "img/people/person-catia-pesquita.webp": "b07deadd",
 "img/people/person-deborah-l-mcguinness.webp": "b3c712ae",
 "img/people/person-deborah-mcguinness.webp": "b3c712ae",
 "img/people/person-fabian-m-suchanek.webp": "4efc4294",
 "img/people/person-frank-van-harmelen.webp": "3162b88f",
 "img/people/person-katja-hose.webp": "8dc67c66",
 "img/people/person-markus-krotzsch.webp": "a11cd251",
 "img/people/person-meem-arafat-manab.webp": "d30f94e9",
 "img/people/person-michael-farber.webp": "39463b76",
 "img/people/person-nandana-mihindukulasooriya.webp": "60bdd22b",
 "img/people/person-nigel-shadbolt.webp": "eed8ac36",
 "img/people/person-peter-haase.webp": "a7e82d29",
 "img/people/person-raphael-troncy.webp": "021169a0",
 "img/people/person-simon-razniewski.webp": "b8a0e8fd",
 "img/people/person-soren-auer.webp": "df3e40fe",
 "img/people/person-stefan-decker.webp": "24334397",
 "img/people/person-wolfgang-fahl.webp": "b738ade0",
 "img/people/person-yihang-zhao.webp": "258bd6f4",
 "img/place/place-bari-duomo-1329.webp": "b6b32dce",
 "img/place/place-puglia-bari-old-town.webp": "54782f8b",
 "img/repos/repo-paper-221.webp": "fc0cc8f6",
 "img/repos/repo-paper-333.webp": "afc62d1d",
 "img/repos/repo-paper-37.webp": "4fcc55b1",
 "img/repos/repo-paper-444.webp": "b55b44fd",
 "img/repos/repo-paper-89.webp": "d0bc12d3",
 "img/rete/logo.svg": "3dd4d1de"
};
const imgKey = (path, v) => (path in IMAGES && IMAGES[path] === v ? path : null);
/** The cached urls (absolute) that no longer match a current image file and hash. */
function staleImageUrls(urls, scopeUrl) {
  const base = new URL(scopeUrl).pathname;
  return urls.filter((u) => {
    const x = new URL(u);
    return !(x.pathname.startsWith(base) && imgKey(x.pathname.slice(base.length), x.searchParams.get("v")));
  });
}

// Every file the app loads. tests/app/sw.test.mjs checks this list against index.html and the module graph.
const PRECACHE = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "css/app.css",
  "js/main.js",
  "js/data.js",
  "js/queries.js",
  "js/store.js",
  "js/time.js",
  "js/model.js",
  "js/ui.js",
  "js/autosave.js",
  "js/mapmath.js",
  "js/browse-model.js",
  "js/terms.js",
  "js/explore-model.js",
  "js/people-model.js",
  "js/clock.js",
  "js/thumbs.js",
  "js/home-model.js",
  "js/panels.js",
  "js/route-state.js",
  "js/scroll-memory.js",
  "js/dashboard.js",
  "js/verdict-bus.js",
  "js/sparql-model.js",
  "js/research-model.js",
  "js/images-model.js",
  "js/img-versions.js",
  "js/sparql-gallery.js",
  "js/sparql-run.js",
  "js/sparql-worker.js",
  "js/deck-model.js",
  "js/views/home.js",
  "js/logistics-model.js",
  "js/slots-model.js",
  "js/views/deck.js",
  "js/views/deck-cards.js",
  "js/views/detail.js",
  "js/views/mine.js",
  "js/views/map.js",
  "js/views/browse.js",
  "js/views/explore.js",
  "js/views/person.js",
  "js/views/people.js",
  "js/people-dir-model.js",
  "js/views/bari.js",
  "js/views/workshop.js",
  "js/views/settings.js",
  "js/views/grid.js",
  "js/edition.js",
  "js/install.js",
  "js/prefs-model.js",
  "js/views/welcome.js",
  "js/views/rete.js",
  "js/views/ticker.js",
  "js/rete-model.js",
  "js/rete-diagrams.js",
  "js/views/ontology.js",
  "js/views/diagram.js",
  "js/ontology-model.js",
  "data/iswc26-ontology.ttl",
  "js/grid-model.js",
  "js/offline-model.js",
  "js/workshop-model.js",
  "js/bari-model.js",
  "js/boot.js",
  "js/views/sparql.js",
  "js/views/research.js",
  "js/views/images.js",
  "js/views/credits.js",
  "js/views/logistics.js",
  "js/views/slots.js",
  "data/iswc26.rete",
  "data/program.json",
  "data/bari.json",
  "data/rooms.json",
  "maps/maps.json",
  "maps/floor-m1.jpg",
  "maps/floor-1.jpg",
  "maps/floor-2.jpg",
  "vendor/rete-graph.min.js",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // cache: "reload" bypasses the HTTP cache so a new build never precaches stale files.
    await cache.addAll(PRECACHE.map((u) => new Request(u, { cache: "reload" })));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith("iswc26-") && key !== CACHE && key !== IMG_CACHE) await caches.delete(key);
    const imgs = await caches.open(IMG_CACHE);
    const stale = staleImageUrls((await imgs.keys()).map((r) => r.url), self.registration.scope);
    for (const u of stale) await imgs.delete(u);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const scopePath = new URL(self.registration.scope).pathname;
  // The hosting password gate's own pages (hf/server.mjs): always the network, never the app shell.
  if (url.pathname === scopePath + "login" || url.pathname === scopePath + "logout") return;
  if (url.pathname.startsWith(scopePath + "img/")) {
    // Cache-first after the first view, keyed by the versioned url. A file that isn't a current image (or has
    // an old hash) goes to the network and is not cached. A miss offline fails (the page keeps its thumbnail).
    if (!imgKey(url.pathname.slice(scopePath.length), url.searchParams.get("v"))) return;
    event.respondWith((async () => {
      const cache = await caches.open(IMG_CACHE);
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok && res.type === "basic" && !req.headers.has("range")) cache.put(req, res.clone());
      return res;
    })());
    return;
  }
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // App navigations (any ?query, e.g. ?now=) get the cached shell.
    const key = req.mode === "navigate" ? new URL("index.html", self.registration.scope).href : req;
    const hit = await cache.match(key, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res.ok && res.type === "basic" && !req.headers.has("range")) cache.put(req, res.clone());
      return res;
    } catch (e) {
      if (req.mode === "navigate") {
        const shell = await cache.match("./");
        if (shell) return shell;
      }
      throw e;
    }
  })());
});
