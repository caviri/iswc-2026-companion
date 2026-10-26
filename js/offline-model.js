// Settings > Offline (#/settings): what "everything" is and how it is described. Pure: no DOM, no caches;
// views/settings.js does the work. Tested in tests/app/settings.test.mjs.
import { IMG_VERSIONS } from "./img-versions.js";
import { localFile } from "./images-model.js";

/** Every image the app ships (all of app/img, as `make stamp` lists them): their versioned urls (as imgUrl renders them), by file. */
export function allImageUrls(versions = IMG_VERSIONS) {
  return Object.keys(versions).filter(localFile).sort().map((f) => `${f}?v=${versions[f]}`);
}

/** The app's build cache among cache names: "iswc26-<12 hex>" (the image cache and others are not it) -> name | null. */
export function buildCacheName(names) {
  return names.find((n) => /^iswc26-[0-9a-f]{12}$/.test(n)) ?? null;
}

/** The build id shown as the app's version: "iswc26-54f452b3d70d" -> "54f452b3d70d"; null -> null. */
export const buildId = (cacheName) => (cacheName ? cacheName.slice("iswc26-".length) : null);

/** 1536 -> "1.5 KB", 5.6e6 -> "5.3 MB"; null for a missing value. */
export function formatBytes(n) {
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return null;
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB"];
  let v = n / 1024, i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v >= 10 ? Math.round(v) : Math.round(v * 10) / 10} ${units[i]}`;
}

/**
 * The offline status line. shell: the app and its data are cached; images / total: saved images;
 * persisted: the browser keeps the storage (true / false / null = unknown).
 * -> { level: "all" | "some" | "none", text }
 */
export function offlineSummary({ shell, images, total, persisted = null }) {
  const level = shell && images >= total ? "all" : shell || images > 0 ? "some" : "none";
  const text = level === "all"
    ? `Everything is on this device: the programme, the maps, the guide and all ${total} images.`
    : level === "some"
      ? `${shell ? "The programme, maps and guide work offline" : "The app isn't saved yet"}; ${images} of ${total} images are saved.`
      : "Nothing is saved on this device yet.";
  const keep = persisted === true ? " The browser keeps it until you remove it." : persisted === false && level !== "none"
    ? " The browser may clear it if the device runs short of space." : "";
  return { level, text: text + keep };
}
