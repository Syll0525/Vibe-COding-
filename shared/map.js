// Stylized Kuching city map — shared by the server (collision, spawning, interactions)
// and the display (rendering). Everything is generated deterministically from data
// below so both sides agree without shipping a big tile file over the network.
//
// Layout (not to scale, very cartoon):
//   north bank : Astana, the golden DUN building, Fort Margherita, kampung houses
//   middle     : the Sarawak River, crossed by the Darul Hana Bridge and sampan boats
//   south bank : Waterfront promenade + stage, Main Bazaar shophouses, Chinese History
//                Museum, Square Tower, Tua Pek Kong, Old Courthouse, Borneo Cultures
//                Museum, Padang Merdeka, hawker centre, and the Great Cat Statue.

import { TILE } from './constants.js';

export const MAP_W = 64;
export const MAP_H = 54;
export const WORLD_W = MAP_W * TILE;
export const WORLD_H = MAP_H * TILE;

export const T = {
  GRASS: 0, ROAD: 1, WATER: 2, BOARDWALK: 3, BRIDGE: 4, PLAZA: 5, MUD: 6, JUNGLE: 7,
};
const WALKABLE = new Set([T.GRASS, T.ROAD, T.BOARDWALK, T.BRIDGE, T.PLAZA, T.MUD]);

// River top row for a column; the river is 5 tiles tall and gently wiggles.
export function riverTop(x) { return 15 + Math.round(1.2 * Math.sin(x / 7)); }
export const RIVER_HEIGHT = 5;
const BRIDGE_COLS = [30, 31, 32];

/** Landmarks: solid footprints (tile units) with info cards. */
export const LANDMARKS = [
  { id: 'astana', kind: 'astana', name: 'The Astana', x: 5, y: 9, w: 8, h: 4,
    fact: 'Built in 1870 by Rajah Charles Brooke as a wedding gift for his wife Margaret. Today it is the official residence of the Governor of Sarawak.' },
  { id: 'dun', kind: 'dun', name: 'Sarawak State Legislative Assembly (DUN)', x: 26, y: 8, w: 11, h: 5,
    fact: 'Its golden roof is shaped like a traditional umbrella (terendak) — you can see it shining from across the river!' },
  { id: 'fort', kind: 'fort', name: 'Fort Margherita', x: 46, y: 9, w: 6, h: 4,
    fact: 'A castle-like fort built in 1879 to guard Kuching from river pirates, named after Ranee Margaret Brooke.' },
  { id: 'squaretower', kind: 'tower', name: 'The Square Tower', x: 7, y: 23, w: 3, h: 2,
    fact: 'Built in 1879 as a prison, it later became a fortress and even a dance hall!' },
  { id: 'chinesemuseum', kind: 'museum_small', name: 'Chinese History Museum', x: 34, y: 23, w: 4, h: 2,
    fact: 'Once a court for the Chinese community, it now tells the story of Chinese settlers in Sarawak.' },
  { id: 'tuapekkong', kind: 'temple', name: 'Tua Pek Kong Temple', x: 44, y: 23, w: 4, h: 2,
    fact: 'One of the oldest Chinese temples in Kuching — people say it dates back to the 1840s.' },
  { id: 'courthouse', kind: 'courthouse', name: 'Old Courthouse', x: 15, y: 32, w: 6, h: 4,
    fact: 'Built in 1874 with a grand clock tower. Now a cultural hub with cafés and art.' },
  { id: 'museum', kind: 'museum', name: 'Borneo Cultures Museum', x: 3, y: 32, w: 8, h: 5,
    fact: 'One of the biggest museums in Malaysia — its shape is inspired by the patterns of Sarawak rattan mats.' },
  { id: 'masjid', kind: 'mosque', name: 'Old State Mosque', x: 43, y: 32, w: 5, h: 4,
    fact: 'The golden domes of the old Masjid Bandaraya sit on a hill that was once the site of a wooden mosque from 1847.' },
  { id: 'hawker', kind: 'hawker', name: 'Top Spot Hawker Centre', x: 34, y: 33, w: 5, h: 3,
    fact: 'Kuching is famous for kolo mee, Sarawak laksa and layered kek lapis. Grab a bite here!' },
  { id: 'catstatue', kind: 'cat', name: 'Great Cat of Kuching', x: 56, y: 33, w: 2, h: 2,
    fact: '"Kuching" sounds like "kucing" — Malay for cat! The city loves cats so much it has cat statues and even a cat museum.' },
];

/** Rows of colourful shophouses along Main Bazaar (solid, decorative). */
export const SHOPHOUSES = [
  { x: 1, y: 28, w: 11, h: 2 }, { x: 14, y: 28, w: 16, h: 2 },
  { x: 33, y: 28, w: 7, h: 2 }, { x: 42, y: 28, w: 10, h: 2 }, { x: 54, y: 28, w: 9, h: 2 },
];

/** Little kampung (village) houses on stilts on the north bank. */
export const KAMPUNG = [
  { x: 38, y: 3, w: 2, h: 2 }, { x: 42, y: 4, w: 2, h: 2 }, { x: 46, y: 3, w: 2, h: 2 },
  { x: 50, y: 4, w: 2, h: 2 }, { x: 54, y: 3, w: 2, h: 2 }, { x: 58, y: 5, w: 2, h: 2 },
  { x: 56, y: 9, w: 2, h: 2 }, { x: 60, y: 10, w: 2, h: 2 },
];

/** Open zones (walkable) with special behaviour. Tile units. */
export const ZONES = [
  { id: 'stage', kind: 'stage', name: 'Waterfront Stage', x: 20, y: 23, w: 7, h: 3 },
  { id: 'padang', kind: 'park', name: 'Padang Merdeka', x: 22, y: 32, w: 7, h: 6 },
];

/** Sampan boat jetties: interacting at one ferries you to its partner. */
export const JETTIES = [
  { id: 'jetty-w-n', pair: 'jetty-w-s', tx: 18, ty: riverTop(18) - 1 },
  { id: 'jetty-w-s', pair: 'jetty-w-n', tx: 18, ty: riverTop(18) + RIVER_HEIGHT },
  { id: 'jetty-e-n', pair: 'jetty-e-s', tx: 55, ty: riverTop(55) - 1 },
  { id: 'jetty-e-s', pair: 'jetty-e-n', tx: 55, ty: riverTop(55) + RIVER_HEIGHT },
];

/** Hidden cats for the Cat Hunt mini-game (tile coords, all on walkable tiles). */
export const HIDDEN_CATS = [
  { id: 'cat1', tx: 2, ty: 13 }, { id: 'cat2', tx: 33, ty: 20 }, { id: 'cat3', tx: 52, ty: 7 },
  { id: 'cat4', tx: 23, ty: 36 }, { id: 'cat5', tx: 41, ty: 38 }, { id: 'cat6', tx: 61, ty: 22 },
  { id: 'cat7', tx: 11, ty: 4 }, { id: 'cat8', tx: 60, ty: 37 },
];

/** Taman Lukis housing estate: 16 player home plots south of the old town (tile units).
 *  Row A plots (y 40–44) face south onto Jalan Taman, row B plots (y 47–51) face north. */
export const PLOT_W = 6, PLOT_H = 5;
export const PLOTS = [];
for (const [row, y, facing] of [[0, 40, 'S'], [1, 47, 'N']]) {
  for (let i = 0; i < 8; i++) PLOTS.push({ id: row * 8 + i, x: 3 + i * 7, y, w: PLOT_W, h: PLOT_H, facing });
}

/** Convert a canonical home cell (house at rows 0–2) to world tile coords for a plot. */
export function plotCell(plot, c, r) {
  return plot.facing === 'S' ? { tx: plot.x + c, ty: plot.y + r } : { tx: plot.x + c, ty: plot.y + (PLOT_H - 1 - r) };
}
/** The plot's gate (front middle, on the road side) in world coordinates. */
export function plotGate(plot) {
  const tx = plot.x + PLOT_W / 2;
  return plot.facing === 'S' ? { x: tx * TILE, y: (plot.y + PLOT_H - 0.4) * TILE } : { x: tx * TILE, y: (plot.y + 0.4) * TILE };
}
export function plotAt(wx, wy) {
  const tx = wx / TILE, ty = wy / TILE;
  return PLOTS.find((p) => tx >= p.x && tx < p.x + p.w && ty >= p.y && ty < p.y + p.h) || null;
}

/** Race tracks (tile units). Checkpoints are passed in order; the last one is the finish line. */
const riverMid = (x) => riverTop(x) + RIVER_HEIGHT / 2;
export const TRACKS = {
  kart: {
    name: 'Main Bazaar Grand Prix', laps: 2, radius: 100,
    checkpoints: [{ x: 34, y: 27 }, { x: 52.8, y: 32 }, { x: 32, y: 38.5 }, { x: 12.8, y: 32 }, { x: 17, y: 27 }],
    grid: [[15.5, 26.5], [15.5, 27.5], [14, 26.5], [14, 27.5], [12.5, 26.5], [12.5, 27.5], [11, 26.5], [11, 27.5],
      [9.5, 26.5], [9.5, 27.5], [8, 26.5], [8, 27.5], [6.5, 26.5], [6.5, 27.5], [5, 26.5], [5, 27.5]],
    sign: { x: 16.5, y: 25.3 },
  },
  boat: {
    name: 'Sarawak River Sampan Race', laps: 1, radius: 110,
    checkpoints: [{ x: 16, y: riverMid(16) }, { x: 31.5, y: riverMid(31) }, { x: 46, y: riverMid(46) }, { x: 61, y: riverMid(61) }],
    // 16 starting spots in the three middle lanes of the river, staggered upstream
    grid: Array.from({ length: 16 }, (_, k) => {
      const x = 7.4 - Math.floor(k / 3) * 1.2;
      return [x, riverTop(Math.floor(x)) + 1.5 + (k % 3)];
    }),
    sign: { x: 5.5, y: 21.3 },
  },
};

function inRect(x, y, r) { return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h; }

function hline(g, y, x0, x1, v) { for (let x = x0; x <= x1; x++) g[y * MAP_W + x] = v; }
function vline(g, x, y0, y1, v) { for (let y = y0; y <= y1; y++) g[y * MAP_W + x] = v; }
function fill(g, r, v) { for (let y = r.y; y < r.y + r.h; y++) hline(g, y, r.x, r.x + r.w - 1, v); }

/** Deterministic PRNG so server and clients generate identical decorations. */
export function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildTiles() {
  const g = new Uint8Array(MAP_W * MAP_H).fill(T.GRASS);

  // Roads
  hline(g, 7, 1, 62, T.ROAD);                    // north road (Jalan Astana-ish)
  vline(g, 31, 7, 13, T.ROAD); vline(g, 32, 7, 13, T.ROAD);
  hline(g, 26, 1, 62, T.ROAD); hline(g, 27, 1, 62, T.ROAD); // Main Bazaar
  hline(g, 38, 1, 62, T.ROAD);
  for (const x of [12, 13, 40, 41, 52, 53]) vline(g, x, 23, 38, T.ROAD);
  for (const x of BRIDGE_COLS) vline(g, x, 21, 38, T.ROAD);

  // Taman Lukis housing estate
  hline(g, 45, 1, 62, T.ROAD); hline(g, 46, 1, 62, T.ROAD);      // Jalan Taman
  vline(g, 30, 39, 44, T.ROAD); vline(g, 60, 39, 44, T.ROAD);      // links to the town
  for (const p of PLOTS) fill(g, p, T.GRASS);

  // River, muddy north bank, waterfront boardwalk on the south bank
  for (let x = 0; x < MAP_W; x++) {
    const top = riverTop(x);
    for (let y = top; y < top + RIVER_HEIGHT; y++) g[y * MAP_W + x] = T.WATER;
    g[(top - 1) * MAP_W + x] = T.MUD;
    for (let y = top + RIVER_HEIGHT; y <= 22; y++) g[y * MAP_W + x] = T.BOARDWALK;
  }
  // Darul Hana pedestrian bridge
  for (const x of BRIDGE_COLS) {
    const top = riverTop(x);
    for (let y = top - 1; y < top + RIVER_HEIGHT; y++) g[y * MAP_W + x] = T.BRIDGE;
  }
  // Plazas around landmarks and zones
  fill(g, { x: 25, y: 13, w: 13, h: 1 }, T.PLAZA);
  for (const z of ZONES) fill(g, z, z.kind === 'stage' ? T.BOARDWALK : T.PLAZA);
  fill(g, { x: 54, y: 31, w: 6, h: 6 }, T.PLAZA);   // cat roundabout

  // Jungle border (Borneo rainforest!) — blocks the map edge
  for (let x = 0; x < MAP_W; x++) { g[x] = T.JUNGLE; g[(MAP_H - 1) * MAP_W + x] = T.JUNGLE; }
  for (let y = 0; y < MAP_H; y++) {
    if (g[y * MAP_W] !== T.WATER) g[y * MAP_W] = T.JUNGLE;
    if (g[y * MAP_W + MAP_W - 1] !== T.WATER) g[y * MAP_W + MAP_W - 1] = T.JUNGLE;
  }
  // Bukit (hill) forest in the north-west corner
  for (let y = 1; y < 6; y++) for (let x = 1; x < 9 - y; x++) g[y * MAP_W + x] = T.JUNGLE;
  return g;
}

function buildSolids() {
  const solids = [];
  for (const l of LANDMARKS) solids.push({ ...l, solid: true });
  for (const s of SHOPHOUSES) solids.push({ ...s, kind: 'shophouse' });
  for (const k of KAMPUNG) solids.push({ ...k, kind: 'kampung' });
  return solids;
}

function buildDecor(tiles, solids) {
  const rand = mulberry32(1839); // Kuching founded as Brooke's capital around 1839–41
  const trees = [];
  const occupied = (x, y) => solids.some((s) => inRect(x, y, { x: s.x - 1, y: s.y - 1, w: s.w + 2, h: s.h + 2 }))
    || PLOTS.some((p) => inRect(x, y, { x: p.x - 1, y: p.y - 1, w: p.w + 2, h: p.h + 2 }))
    || Object.values(TRACKS).some((t) => Math.abs(x + 0.5 - t.sign.x) < 2 && Math.abs(y + 0.5 - t.sign.y) < 2);
  for (let y = 1; y < MAP_H - 1; y++) {
    for (let x = 1; x < MAP_W - 1; x++) {
      const t = tiles[y * MAP_W + x];
      if (t !== T.GRASS || occupied(x, y)) continue;
      if (rand() < 0.11) {
        trees.push({ x: (x + 0.2 + rand() * 0.6) * TILE, y: (y + 0.3 + rand() * 0.5) * TILE,
          kind: rand() < 0.35 ? 'palm' : 'tree', s: 0.8 + rand() * 0.5 });
      }
    }
  }
  // Palm trees + lamps along the waterfront promenade
  const lamps = [];
  for (let x = 3; x < MAP_W - 3; x += 4) {
    if (BRIDGE_COLS.includes(x) || (x >= 19 && x <= 27)) continue;
    lamps.push({ x: x * TILE + TILE / 2, y: 22 * TILE + TILE * 0.9 });
  }
  return { trees, lamps };
}

export const TILES = buildTiles();
export const SOLIDS = buildSolids();
export const DECOR = buildDecor(TILES, SOLIDS);

export function tileAt(tx, ty) {
  if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return T.JUNGLE;
  return TILES[ty * MAP_W + tx];
}

/** Is a world point blocked? `airborne` lets super-jumpers sail over water. */
export function isBlocked(wx, wy, airborne = false) {
  const tx = Math.floor(wx / TILE), ty = Math.floor(wy / TILE);
  const t = tileAt(tx, ty);
  if (t === T.JUNGLE) return true;
  if (t === T.WATER && !airborne) return true;
  for (const s of SOLIDS) {
    // footprints are slightly inset so characters can hug building fronts
    if (wx > s.x * TILE + 4 && wx < (s.x + s.w) * TILE - 4 &&
        wy > s.y * TILE + 4 && wy < (s.y + s.h) * TILE - 2) return true;
  }
  return false;
}

export function isWalkableTile(tx, ty) {
  if (!WALKABLE.has(tileAt(tx, ty))) return false;
  const cx = (tx + 0.5) * TILE, cy = (ty + 0.5) * TILE;
  return !isBlocked(cx, cy);
}

export function tileCenter(tx, ty) { return { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE }; }

/** A good spawn spot: the Waterfront, near the stage. */
export const SPAWN = { x: 23.5 * TILE, y: 21.5 * TILE };

/** Every interactable point, in world coordinates, for the server's "press A" logic. */
export function buildInteractables() {
  const list = [];
  for (const l of LANDMARKS) {
    // interaction point: just in front (south side) of the building
    list.push({ id: l.id, type: 'landmark', name: l.name, fact: l.fact,
      x: (l.x + l.w / 2) * TILE, y: (l.y + l.h) * TILE + 16,
      radius: Math.max(l.w, 3) * TILE * 0.55 });
  }
  for (const j of JETTIES) {
    const c = tileCenter(j.tx, j.ty);
    list.push({ id: j.id, type: 'sampan', name: 'Sampan boat', pair: j.pair, x: c.x, y: c.y, radius: 60 });
  }
  list.push({ id: 'game-kart', type: 'game', game: 'kart', name: 'Road Race', x: TRACKS.kart.sign.x * TILE, y: TRACKS.kart.sign.y * TILE, radius: 70 });
  list.push({ id: 'game-boat', type: 'game', game: 'boat', name: 'Sampan Race', x: TRACKS.boat.sign.x * TILE, y: TRACKS.boat.sign.y * TILE, radius: 70 });
  const stage = ZONES.find((z) => z.id === 'stage');
  list.push({ id: 'stage', type: 'stage', name: stage.name,
    x: (stage.x + stage.w / 2) * TILE, y: (stage.y + stage.h / 2) * TILE, radius: stage.w * TILE * 0.5 });
  return list;
}

export function inZone(zoneId, wx, wy) {
  const z = ZONES.find((q) => q.id === zoneId);
  return z && inRect(wx / TILE, wy / TILE, z);
}
