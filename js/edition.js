// Which edition this copy of the app is. The public edition (built by `make public` for GitHub Pages; its
// index.html says <meta name="iswc26-edition" content="public">) has no Logistics: no menu entry, no route,
// no imported travel pages anywhere. Everywhere else (the Space, local, tests) it is "full".
const meta = () => globalThis.document?.querySelector?.('meta[name="iswc26-edition"]')?.getAttribute("content");

export const EDITION = meta() === "public" ? "public" : "full";

/** Routes the public edition leaves out. */
export const PRIVATE_ROUTES = new Set(["logistics"]);

/** Is route `r` part of this edition? (`edition` is for tests.) */
export const hasRoute = (r, edition = EDITION) => edition !== "public" || !PRIVATE_ROUTES.has(r);
