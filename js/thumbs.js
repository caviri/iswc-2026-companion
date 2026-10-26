// Generative thumbnails for sessions, papers and clusters: small abstract SVG drawings in the
// programme's graph vernacular (nodes, edges, lattices, triples, streams). Deterministic: the id
// seeds the drawing, the kind picks the motif, the item's topics pick the colours (--tp-* tokens,
// so light and dark themes both work). No images, nothing fetched; each one is a handful of paths.
// thumbSpec() is pure (unit-tested in tests/app/thumbs.test.mjs); thumbSVG() turns it into DOM.
import { topicSwatch, TOPIC_SWATCHES } from "./explore-model.js";

const NS = "http://www.w3.org/2000/svg";

/** Every motif name; a motif's class on the svg is `m-<name>`. */
export const MOTIFS = ["keynote", "workshop", "tutorial", "parallel", "poster", "doctoral", "dag", "ceremony", "break", "other", "paper", "cluster"];

/**
 * size -> [viewBox width, height, mini]. hero ~16:9 (cards), band ~3.6:1 (strips across a card or header),
 * tile square, row square and simplified (44–56 px).
 */
const SIZES = { hero: [160, 90, false], band: [200, 56, false], tile: [100, 100, false], row: [100, 100, true] };

// Paint layers, bottom to top. Each is one <path class="th-<name>"> (styled in app.css).
const LAYERS = ["wa", "wb", "hi", "li", "lb", "la", "ha", "hb", "fb", "fa"];

const isSession = (x) => Array.isArray(x?.paperIds);
const isPaper = (x) => Array.isArray(x?.authors);

/** Motif name for an item. */
export function motifOf(x) {
  if (isSession(x)) return MOTIFS.includes(x.kind) && x.kind !== "paper" && x.kind !== "cluster" ? x.kind : "other";
  if (isPaper(x)) return "paper";
  return "cluster";
}

// ---------- seeded randomness ----------
function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
function rng(seed) {
  let a = seed >>> 0;
  const r = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.range = (lo, hi) => lo + (hi - lo) * r();
  r.int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  r.chance = (p) => r() < p;
  return r;
}

// ---------- pen: geometry appended to per-class path strings ----------
const f = (n) => Math.round(n * 10) / 10;
function pen() {
  const L = new Map(LAYERS.map((k) => [k, ""]));
  const add = (k, d) => L.set(k, L.get(k) + d);
  return {
    layers: L,
    dot(k, x, y, r) { add(k, `M${f(x - r)} ${f(y)}a${f(r)} ${f(r)} 0 1 0 ${f(2 * r)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-2 * r)} 0Z`); },
    line(k, x1, y1, x2, y2) { add(k, `M${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}`); },
    curve(k, x1, y1, c1x, c1y, c2x, c2y, x2, y2) { add(k, `M${f(x1)} ${f(y1)}C${f(c1x)} ${f(c1y)} ${f(c2x)} ${f(c2y)} ${f(x2)} ${f(y2)}`); },
    rect(k, x, y, w, h) { add(k, `M${f(x)} ${f(y)}h${f(w)}v${f(h)}h${f(-w)}Z`); },
    raw(k, d) { add(k, d); },
  };
}

/** Smooth path through points (Catmull-Rom as cubic Béziers), without the leading M when `cont`. */
function smooth(pts, cont = false) {
  let d = cont ? `L${f(pts[0][0])} ${f(pts[0][1])}` : `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2;
    d += `C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d;
}

const TAU = Math.PI * 2;

// ---------- motifs: (pen, rng, W, H, mini, ctx) ----------
const DRAW = {
  // A voice and its reach: a hub with ripples, spokes out to the room.
  keynote(p, r, W, H, mini) {
    const m = Math.min(W, H);
    const cx = W * r.range(0.34, 0.62), cy = H * r.range(0.4, 0.6);
    const R0 = m * (mini ? 0.16 : 0.1);
    const rings = mini ? 2 : 4;
    // Ripples drift away from the source, like a voice carrying across a hall.
    const drift = r.range(0, TAU), dd = R0 * (mini ? 0.18 : 0.32);
    for (let i = 1; i <= rings; i++) {
      p.dot(i <= 1 ? "la" : "li", cx + Math.cos(drift) * dd * i, cy + Math.sin(drift) * dd * i, R0 * (1 + i * (mini ? 0.75 : 0.85)));
    }
    const n = mini ? 5 : r.int(7, 10);
    const a0 = r.range(0, TAU);
    const ex = W * 0.62, ey = H * 0.62;
    for (let i = 0; i < n; i++) {
      const a = a0 + (i * TAU) / n + r.range(-0.18, 0.18);
      const k = r.range(0.72, 1.05);
      const x = cx + Math.cos(a) * ex * k, y = cy + Math.sin(a) * ey * k;
      const s = R0 * (1 + rings * (mini ? 0.75 : 0.85));
      p.line("li", cx + Math.cos(a) * s, cy + Math.sin(a) * s, x, y);
      if (!mini) p.dot(i % 3 === 0 ? "fb" : "hb", x, y, m * 0.03);
    }
    p.dot("fa", cx, cy, R0);
  },

  // People building a graph together: a jittered lattice, partly wired.
  workshop(p, r, W, H, mini) {
    const cols = mini ? 3 : W > 3 * H ? 12 : W > H ? 8 : 4, rows = mini ? 3 : W > 3 * H ? 3 : 4;
    const sx = W / cols, sy = H / rows, j = mini ? 0.12 : 0.26;
    const pt = [];
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      pt.push([sx * (x + 0.5 + r.range(-j, j)), sy * (y + 0.5 + r.range(-j, j))]);
    }
    const at = (x, y) => pt[y * cols + x];
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const a = at(x, y);
      if (x + 1 < cols && r.chance(mini ? 1 : 0.72)) p.line("li", ...a, ...at(x + 1, y));
      if (y + 1 < rows && r.chance(mini ? 1 : 0.6)) p.line("li", ...a, ...at(x, y + 1));
      if (!mini && x + 1 < cols && y + 1 < rows && r.chance(0.16)) p.line("lb", ...a, ...at(x + 1, y + 1));
    }
    const rad = mini ? 7 : Math.min(sx, sy) * 0.17;
    const hot = r.int(0, pt.length - 1);
    pt.forEach((q, i) => {
      const u = r();
      if (i === hot || u < (mini ? 0.12 : 0.16)) p.dot("fa", q[0], q[1], rad * 1.15);
      else if (u < (mini ? 0.3 : 0.3)) p.dot("fb", q[0], q[1], rad * 0.9);
      else p.dot("ha", q[0], q[1], rad * 0.75);
    });
  },

  // Learning step by step: subject -> predicate -> object, each object the next subject.
  tutorial(p, r, W, H, mini) {
    const n = mini || W > 3 * H ? 2 : 3;
    const len = W * (mini ? 0.42 : W > 3 * H ? r.range(0.3, 0.38) : r.range(0.26, 0.32));
    const rad = mini ? 9 : Math.min(W, H) * 0.065;
    let x = W * (mini ? 0.2 : r.range(0.1, 0.18));
    const ys = Array.from({ length: n }, (_, i) => H * ((i + 0.62) / (n + 0.25)));
    for (let i = 0; i < n; i++) {
      const y = ys[i], xo = Math.min(x + len, W - rad * 1.6);
      if (i) p.curve("lb", x, ys[i - 1] + rad, x - rad * 1.6, (ys[i - 1] + y) / 2, x - rad * 1.6, (ys[i - 1] + y) / 2, x - rad * 0.9, y - rad * 0.4);
      p.line("li", x + rad * 1.4, y, xo - rad * 1.5, y);
      const ah = rad * 0.55;
      p.line("li", xo - rad * 1.5 - ah, y - ah, xo - rad * 1.5, y);
      p.line("li", xo - rad * 1.5 - ah, y + ah, xo - rad * 1.5, y);
      p.dot(i ? "fb" : "fa", x, y, rad);
      p.rect(i === n - 1 ? "fa" : "hb", xo - rad, y - rad, rad * 2, rad * 2);
      x = xo;
    }
  },

  // Parallel tracks: lanes of talks with a few links across.
  parallel(p, r, W, H, mini, ctx) {
    const n = mini ? 3 : Math.max(3, Math.min(W > 3 * H ? 4 : W > H ? 5 : 6, ctx.papers || 4));
    const ys = Array.from({ length: n }, (_, i) => H * ((i + 0.5) / n) + r.range(-1.5, 1.5));
    const lead = r.int(0, n - 1);
    const rad = mini ? 6.5 : Math.min(W, H) * 0.035;
    const nodes = ys.map(() => []);
    ys.forEach((y, i) => {
      p.line(i === lead ? "la" : "li", -2, y, W + 2, y);
      const k = mini ? 2 : r.int(2, 4);
      for (let j = 0; j < k; j++) nodes[i].push(W * ((j + r.range(0.2, 0.8)) / k));
    });
    const links = mini ? 1 : r.int(2, 4);
    for (let l = 0; l < links; l++) {
      const i = r.int(0, n - 2);
      const x1 = nodes[i][r.int(0, nodes[i].length - 1)];
      const x2 = nodes[i + 1].reduce((b, x) => (Math.abs(x - x1) < Math.abs(b - x1) ? x : b));
      p.curve("lb", x1, ys[i], x1, (ys[i] + ys[i + 1]) / 2, x2, (ys[i] + ys[i + 1]) / 2, x2, ys[i + 1]);
    }
    ys.forEach((y, i) => nodes[i].forEach((x, j) => p.dot(i === lead && j === 0 ? "fa" : i === lead ? "ha" : "hb", x, y, rad)));
  },

  // The poster hall: a board of sheets, some lit up.
  poster(p, r, W, H, mini) {
    const cols = mini ? 2 : W > H ? 5 : 3, g = mini ? 7 : 3.5;
    const cw = (W - g * (cols + 1)) / cols;
    for (let c = 0; c < cols; c++) {
      let y = -r.range(0, H * 0.25);
      const x = g + c * (cw + g);
      while (y < H) {
        const h = H * r.range(mini ? 0.4 : 0.22, mini ? 0.6 : 0.42);
        const u = r();
        p.rect(u < 0.22 ? "wa" : u < 0.4 ? "wb" : "hi", x, y, cw, h);
        if (!mini) {
          p.line("li", x + cw * 0.18, y + 5, x + cw * r.range(0.5, 0.82), y + 5);
          if (u < 0.22) p.dot("fa", x + cw * 0.78, y + h - 6, 2.2);
        }
        y += h + g;
      }
    }
  },

  // A young idea branching out.
  doctoral(p, r, W, H, mini) {
    const depth = mini ? 3 : 4;
    const base = [W * r.range(0.42, 0.58), H + 2];
    const leaves = [];
    const grow = (x, y, a, len, d) => {
      const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
      p.line(d < 2 ? "la" : "li", x, y, x2, y2);
      if (d === depth) { leaves.push([x2, y2]); return; }
      const spread = r.range(0.38, 0.7) * (d === 1 ? 1.15 : 1);
      grow(x2, y2, a - spread + r.range(-0.12, 0.12), len * r.range(0.7, 0.84), d + 1);
      grow(x2, y2, a + spread + r.range(-0.12, 0.12), len * r.range(0.7, 0.84), d + 1);
    };
    // A wide strip holds a small cohort of them.
    const trees = W > 3 * H ? 3 : 1;
    for (let t = 0; t < trees; t++) {
      const bx = trees === 1 ? base[0] : W * ((t + 0.5) / trees) + r.range(-W * 0.06, W * 0.06);
      grow(bx, base[1], -Math.PI / 2 + r.range(-0.12, 0.12), H * (mini ? 0.34 : trees > 1 ? r.range(0.32, 0.4) : 0.3), 1);
    }
    const rad = mini ? 6 : Math.min(W, H) * 0.028;
    leaves.forEach((q, i) => p.dot(r.chance(0.22) || i === 0 ? "fb" : "ha", q[0], q[1], rad));
  },

  // Dagstuhl-style: ideas flowing through layers, a directed acyclic graph.
  dag(p, r, W, H, mini) {
    const L = mini ? 3 : W > 3 * H ? 6 : W > H ? 5 : 4;
    const layers = Array.from({ length: L }, (_, i) => {
      const k = mini ? (i === 1 ? 2 : 1) : i === 0 || i === L - 1 ? r.int(1, 2) : r.int(2, 3);
      return Array.from({ length: k }, (_, j) => [W * ((i + 0.5) / L), H * ((j + 0.5) / k) + r.range(-H * 0.06, H * 0.06)]);
    });
    const rad = mini ? 7.5 : Math.min(W, H) * 0.05;
    const edge = (a, b) => {
      const dx = (b[0] - a[0]) * 0.5;
      const ex = b[0] - rad * 1.25, ah = rad * 0.55;
      p.curve("la", a[0] + rad, a[1], a[0] + dx, a[1], ex - dx * 0.6, b[1], ex, b[1]);
      p.line("la", ex - ah, b[1] - ah, ex, b[1]);
      p.line("la", ex - ah, b[1] + ah, ex, b[1]);
    };
    for (let i = 0; i < L - 1; i++) {
      const next = layers[i + 1], fed = new Set();
      layers[i].forEach((a) => {
        const t = r.int(0, next.length - 1);
        edge(a, next[t]); fed.add(t);
        if (!mini && next.length > 1 && r.chance(0.5)) { const u = (t + 1) % next.length; edge(a, next[u]); fed.add(u); }
      });
      next.forEach((b, j) => { if (!fed.has(j)) { edge(layers[i][r.int(0, layers[i].length - 1)], b); } });
    }
    layers.forEach((ly, i) => ly.forEach((q) => p.dot(i === 0 ? "fb" : i === L - 1 ? "fa" : "ha", q[0], q[1], rad)));
  },

  // Openings and closings: a fan of rays rising from the stage.
  ceremony(p, r, W, H, mini) {
    const cx = W * r.range(0.44, 0.56), cy = H * 1.02;
    const R1 = Math.min(W, H) * (mini ? 0.3 : 0.24), R2 = Math.max(W, H) * (mini ? 0.62 : 0.56);
    const n = mini ? 9 : 17;
    for (let i = 0; i < n; i++) {
      const a = Math.PI + (Math.PI * (i + 0.5)) / n;
      const long = i % 2 === 0;
      const l = (long ? R2 : R2 * r.range(0.62, 0.78));
      const x2 = cx + Math.cos(a) * l, y2 = cy + Math.sin(a) * l;
      p.line(long ? "la" : "lb", cx + Math.cos(a) * R1 * 1.2, cy + Math.sin(a) * R1 * 1.2, x2, y2);
      if (long && !mini) p.dot("hb", x2, y2, Math.min(W, H) * 0.025);
    }
    p.raw("li", `M${f(cx - R1 * 1.2)} ${f(cy)}A${f(R1 * 1.2)} ${f(R1 * 1.2)} 0 0 1 ${f(cx + R1 * 1.2)} ${f(cy)}`);
    p.dot("fa", cx, cy, R1);
  },

  // Coffee: slow ripples, nothing to do.
  break(p, r, W, H, mini) {
    const n = mini ? 3 : 4;
    for (let i = 0; i < n; i++) {
      const y = H * ((i + 0.6) / (n + 0.2)), amp = H * (mini ? 0.05 : 0.035), ph = r.range(0, TAU), fq = r.range(1.5, 2.5);
      const pts = Array.from({ length: 9 }, (_, j) => [(W + 8) * (j / 8) - 4, y + Math.sin(ph + (j / 8) * TAU * fq * 0.5) * amp]);
      p.raw(i === 1 ? "la" : "li", smooth(pts));
    }
  },

  // Everything else: orbits around a centre.
  other(p, r, W, H, mini) {
    const cx = W / 2 + r.range(-W * 0.08, W * 0.08), cy = H / 2;
    const n = mini ? 2 : 3;
    for (let i = 0; i < n; i++) {
      const rx = (W * 0.5) * (0.45 + i * 0.22), ry = (H * 0.5) * (0.28 + i * 0.16), rot = r.range(-0.5, 0.5);
      const pt = (t) => [cx + Math.cos(rot) * rx * Math.cos(t) - Math.sin(rot) * ry * Math.sin(t), cy + Math.sin(rot) * rx * Math.cos(t) + Math.cos(rot) * ry * Math.sin(t)];
      const [a, b] = [pt(0), pt(Math.PI)];
      const deg = f((rot * 180) / Math.PI);
      p.raw(i === 0 ? "la" : "li", `M${f(a[0])} ${f(a[1])}A${f(rx)} ${f(ry)} ${deg} 1 1 ${f(b[0])} ${f(b[1])}A${f(rx)} ${f(ry)} ${deg} 1 1 ${f(a[0])} ${f(a[1])}`);
      const q = pt(r.range(0, TAU));
      p.dot(i === n - 1 ? "fb" : "hb", q[0], q[1], mini ? 6 : Math.min(W, H) * 0.035);
    }
    p.dot("fa", cx, cy, Math.min(W, H) * (mini ? 0.1 : 0.07));
  },

  // A paper: its own small knowledge graph, one resource at the centre, literals as boxes.
  paper(p, r, W, H, mini, ctx) {
    const n = mini ? 4 : r.int(7, 10);
    const m = Math.min(W, H), pad = m * (mini ? 0.2 : 0.16);
    const minD = m * (mini ? 0.3 : 0.15);
    const pts = [[W * r.range(0.38, 0.62), H * r.range(0.4, 0.6)]];
    for (let tries = 0; pts.length < n && tries < 80; tries++) {
      const q = [r.range(pad, W - pad), r.range(pad, H - pad)];
      if (pts.every((o) => Math.hypot(o[0] - q[0], o[1] - q[1]) > minD)) pts.push(q);
    }
    const near = (i) => {
      let best = 0, bd = Infinity;
      for (let j = 0; j < i; j++) { const d = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]); if (d < bd) { bd = d; best = j; } }
      return best;
    };
    for (let i = 1; i < pts.length; i++) p.line("li", ...pts[i], ...pts[near(i)]);
    if (!mini && pts.length > 3) p.line("lb", ...pts[1], ...pts[pts.length - 1]);
    const lit = ctx.track === "Resource" || ctx.track === "Demos" ? 0.45 : 0.25;
    const rad = m * (mini ? 0.075 : 0.045);
    pts.forEach((q, i) => {
      if (i === 0) { p.dot("fa", q[0], q[1], rad * 1.7); return; }
      if (r.chance(lit)) p.rect(i % 2 ? "hb" : "ha", q[0] - rad * 1.5, q[1] - rad * 0.9, rad * 3, rad * 1.8);
      else p.dot(r.chance(0.3) ? "fb" : "ha", q[0], q[1], rad);
    });
  },
};

/** Cluster: stacked streams, one band per topic in its mix (biggest first). */
function drawCluster(p, r, W, H, mini, mix, bands) {
  // Square-root widths so a dominant topic doesn't drown the others.
  const top = mix.slice(0, mini ? 3 : 5).map((m) => ({ ...m, count: Math.sqrt(m.count) }));
  const total = top.reduce((n, m) => n + m.count, 0) || 1;
  const steps = mini ? 5 : 8;
  const ph = r.range(0, TAU), fq = r.range(0.8, 1.4);
  let cum = 0;
  const edges = [Array.from({ length: steps + 1 }, (_, j) => [(W + 8) * (j / steps) - 4, -2])];
  top.forEach((m, i) => {
    cum += i === top.length - 1 ? total - cum : m.count;
    const base = (H + 4) * (cum / total) - 2;
    const amp = i === top.length - 1 ? 0 : H * (mini ? 0.08 : 0.07);
    edges.push(Array.from({ length: steps + 1 }, (_, j) => [(W + 8) * (j / steps) - 4, base + Math.sin(ph + i * 0.9 + (j / steps) * TAU * fq) * amp]));
  });
  top.forEach((m, i) => {
    const a = edges[i], b = edges[i + 1];
    bands.push(["path", { class: "th-band", style: `--c: var(--tp-${m.swatch})`, d: `${smooth(a)}${smooth([...b].reverse(), true)}Z` }]);
  });
  top.forEach((m, i) => {
    if (i < top.length - 1) bands.push(["path", { class: "th-band-edge", style: `--c: var(--tp-${m.swatch})`, d: smooth(edges[i + 1]) }]);
  });
  if (top.length === 1) { // one topic (or old data): its stream still flows
    for (const k of [0.36, 0.66]) {
      p.raw("li", smooth(Array.from({ length: steps + 1 }, (_, j) => [(W + 8) * (j / steps) - 4, H * k + Math.sin(ph + k * 5 + (j / steps) * TAU * fq) * H * 0.07])));
    }
  }
  if (!mini) {
    for (let i = 1; i < edges.length - 1; i++) {
      const e = edges[i], j = r.int(1, steps - 1);
      p.dot("ha", e[j][0], e[j][1], Math.min(W, H) * 0.035);
    }
  }
}

// Topic mix per cluster id, computed once per programme for clusters given as raw data.
const mixCache = new WeakMap();
function clusterMix(program, c) {
  if (Array.isArray(c.mix) && c.mix.length) return c.mix.map((m) => ({ count: m.count, swatch: topicSwatch(m.topic) }));
  let all = mixCache.get(program);
  if (!all) {
    all = new Map();
    for (const x of [...(program.sessions ?? []).filter((s) => s.kind !== "break"), ...(program.papers ?? [])]) {
      if (!x.cluster) continue;
      const m = all.get(x.cluster) ?? new Map();
      for (const t of x.topics ?? []) m.set(t, (m.get(t) ?? 0) + 1);
      all.set(x.cluster, m);
    }
    mixCache.set(program, all);
  }
  return [...(all.get(c.id) ?? new Map())].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([t, count]) => ({ count, swatch: topicSwatch(t) }));
}

/**
 * thumbSpec(item, program, {size}) -> { motif, size, viewBox, vars, nodes: [[tag, attrs]] }
 * item: a session, a paper, or a cluster (raw from program.clusters, or explore-model's with `mix`).
 * size: "hero" (160×90), "band" (200×56), "tile" (100×100) or "row" (100×100, simplified for 44–56 px).
 * vars: --a, --b (topic swatches) and --k (kind colour) for the svg's style attribute.
 */
export function thumbSpec(x, program, { size = "tile" } = {}) {
  const [W, H, mini] = SIZES[size] ?? SIZES.tile;
  const motif = motifOf(x);
  const id = String(x?.id ?? x?.title ?? "");
  const r = rng(hash(`${motif}:${id}`));
  const topics = x?.topics ?? [];
  const sw = topics.length ? topicSwatch(topics[0]) : hash(id) % TOPIC_SWATCHES;
  const sw2 = topics.length > 1 ? topicSwatch(topics[1]) : (sw + 3) % TOPIC_SWATCHES;
  const session = isSession(x) ? x : isPaper(x) && x.sessionId ? program?.byId?.get(x.sessionId) : null;
  const vars = motif === "break"
    ? { "--a": "var(--ink-2)", "--b": "var(--ink-2)", "--k": "var(--ink-2)" }
    : { "--a": `var(--tp-${sw})`, "--b": `var(--tp-${sw2 === sw ? (sw + 3) % TOPIC_SWATCHES : sw2})`, "--k": program?.kinds?.[session?.kind]?.color ?? "var(--sea)" };
  const p = pen();
  const bands = [];
  if (motif === "cluster") {
    let mix = clusterMix(program ?? {}, x);
    if (!mix.length) mix = [{ count: 1, swatch: sw }];
    vars["--a"] = `var(--tp-${mix[0].swatch})`;
    drawCluster(p, r, W, H, mini, mix, bands);
  } else {
    DRAW[motif](p, r, W, H, mini, { papers: x.paperIds?.length ?? 0, track: x.track ?? null });
  }
  const nodes = [...bands];
  for (const [k, d] of p.layers) if (d) nodes.push(["path", { class: `th-${k}`, d }]);
  return { motif, size: SIZES[size] ? size : "tile", viewBox: [0, 0, W, H], vars, nodes };
}

/**
 * thumbSVG(item, program, {size, className, doc}) -> SVGElement, decorative (aria-hidden).
 * Classes: "thumb thumb-<size> m-<motif>" (+ className). It fills its box (preserveAspectRatio slice),
 * so give it a width/height or aspect-ratio in CSS.
 */
export function thumbSVG(x, program, { size = "tile", className = "", doc = globalThis.document } = {}) {
  const sp = thumbSpec(x, program, { size });
  const svg = doc.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", sp.viewBox.join(" "));
  svg.setAttribute("preserveAspectRatio", "xMidYMid slice");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("class", `thumb thumb-${sp.size} m-${sp.motif}${className ? " " + className : ""}`);
  svg.setAttribute("style", Object.entries(sp.vars).map(([k, v]) => `${k}: ${v}`).join("; "));
  for (const [tag, attrs] of sp.nodes) {
    const el = doc.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    svg.append(el);
  }
  return svg;
}
