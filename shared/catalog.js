// Shop catalog, house styles and home-layout rules. Shared by the server (which
// validates every purchase and layout) and the phone (which shows the shop/editor).

export const START_COINS = 60;

// A home plot is a 6×5 grid. In the canonical layout the house fills rows 0–2 and
// the garden rows 3–4 (plots that face north are mirrored when placed in the world).
export const HOME_COLS = 6;
export const HOME_ROWS = 5;
export const HOUSE_ROWS = 3;
export const MAX_HOME_ITEMS = 30;

export const HOUSE_STYLES = {
  kampung:   { name: 'Kampung House',   icon: '🛖', price: 0 },
  shophouse: { name: 'Shophouse',       icon: '🏘️', price: 250 },
  modern:    { name: 'Modern Bungalow', icon: '🏡', price: 300 },
  longhouse: { name: 'Iban Longhouse',  icon: '🏠', price: 450 },
};

export const WALL_COLORS = ['#c48a55', '#f7d794', '#f8a5c2', '#9ad0ec', '#badc58', '#ffffff', '#b8a6ff', '#ff9f68'];
export const ROOF_COLORS = ['#e17055', '#b5533c', '#2e86de', '#00b894', '#6c5ce7', '#2d3436', '#fdcb6e', '#e84393'];

/** zone: 'in' = inside the house, 'out' = garden. */
export const ITEMS = {
  // indoor
  sofa:      { name: 'Sofa',           icon: '🛋️', price: 40,  zone: 'in' },
  bed:       { name: 'Bed',            icon: '🛏️', price: 50,  zone: 'in' },
  table:     { name: 'Dining Table',   icon: '🍽️', price: 35,  zone: 'in' },
  chair:     { name: 'Chair',          icon: '🪑', price: 15,  zone: 'in' },
  tv:        { name: 'TV',             icon: '📺', price: 60,  zone: 'in' },
  lamp:      { name: 'Lamp',           icon: '💡', price: 20,  zone: 'in' },
  rug:       { name: 'Pua Kumbu Rug',  icon: '🟥', price: 25,  zone: 'in' },
  bookshelf: { name: 'Bookshelf',      icon: '📚', price: 45,  zone: 'in' },
  plant:     { name: 'Potted Plant',   icon: '🪴', price: 15,  zone: 'any' },
  stove:     { name: 'Kitchen Stove',  icon: '🍳', price: 45,  zone: 'in' },
  piano:     { name: 'Piano',          icon: '🎹', price: 120, zone: 'in' },
  sape:      { name: 'Sape Lute',      icon: '🎸', price: 70,  zone: 'in' },
  aquarium:  { name: 'Aquarium',       icon: '🐠', price: 90,  zone: 'in' },
  catbed:    { name: 'Cat Bed',        icon: '🐈', price: 30,  zone: 'any' },
  arcade:    { name: 'Arcade Machine', icon: '🕹️', price: 150, zone: 'in' },
  // garden
  flowers:   { name: 'Hibiscus Flowers', icon: '🌺', price: 10, zone: 'out' },
  palm:      { name: 'Palm Tree',      icon: '🌴', price: 30,  zone: 'out' },
  tree:      { name: 'Rambutan Tree',  icon: '🌳', price: 25,  zone: 'out' },
  fence:     { name: 'Wooden Fence',   icon: '🪵', price: 8,   zone: 'out' },
  pond:      { name: 'Fish Pond',      icon: '🐟', price: 60,  zone: 'out' },
  bench:     { name: 'Garden Bench',   icon: '🪑', price: 25,  zone: 'out' },
  swing:     { name: 'Swing',          icon: '🎠', price: 70,  zone: 'out' },
  bbq:       { name: 'BBQ Grill',      icon: '🍖', price: 50,  zone: 'out' },
  lantern:   { name: 'Red Lantern',    icon: '🏮', price: 20,  zone: 'any' },
  bicycle:   { name: 'Bicycle',        icon: '🚲', price: 40,  zone: 'out' },
  kite:      { name: 'Wau Kite',       icon: '🪁', price: 30,  zone: 'out' },
  trampoline:{ name: 'Trampoline',     icon: '🤸', price: 100, zone: 'out' },
  hornbill:  { name: 'Hornbill Statue', icon: '🦜', price: 180, zone: 'out' },
  catstatue: { name: 'Cat Statue',     icon: '🐱', price: 220, zone: 'out' },
};

export function defaultHome() {
  return { style: 'kampung', wall: WALL_COLORS[0], roof: ROOF_COLORS[0], items: [] };
}

export function cellZone(r) { return r < HOUSE_ROWS ? 'in' : 'out'; }

export function canPlace(itemId, r) {
  const it = ITEMS[itemId];
  return Boolean(it) && (it.zone === 'any' || it.zone === cellZone(r));
}

/**
 * Validate a home layout against what the player owns.
 * @returns {{ok:true, home:object} | {ok:false, error:string}}
 */
export function validateHome(home, owned = {}) {
  if (!home || typeof home !== 'object') return { ok: false, error: 'Bad home data' };
  const style = HOUSE_STYLES[home.style] ? home.style : null;
  if (!style) return { ok: false, error: 'Unknown house style' };
  if (HOUSE_STYLES[style].price > 0 && !owned[`house:${style}`]) return { ok: false, error: 'You have not bought that house yet' };
  const wall = WALL_COLORS.includes(home.wall) ? home.wall : WALL_COLORS[0];
  const roof = ROOF_COLORS.includes(home.roof) ? home.roof : ROOF_COLORS[0];
  const items = Array.isArray(home.items) ? home.items : [];
  if (items.length > MAX_HOME_ITEMS) return { ok: false, error: 'Too many items' };
  const used = {};
  const cells = new Set();
  const out = [];
  for (const raw of items) {
    const id = raw?.id, c = Number(raw?.c), r = Number(raw?.r);
    if (!ITEMS[id]) return { ok: false, error: `Unknown item ${id}` };
    if (!Number.isInteger(c) || !Number.isInteger(r) || c < 0 || r < 0 || c >= HOME_COLS || r >= HOME_ROWS) return { ok: false, error: 'Item outside the plot' };
    if (!canPlace(id, r)) return { ok: false, error: `${ITEMS[id].name} can't go there` };
    const key = `${c},${r}`;
    if (cells.has(key)) return { ok: false, error: 'Two items in one spot' };
    cells.add(key);
    used[id] = (used[id] || 0) + 1;
    if (used[id] > (owned[id] || 0)) return { ok: false, error: `You don't own enough ${ITEMS[id].name}` };
    out.push({ id, c, r, rot: [0, 1, 2, 3].includes(raw.rot) ? raw.rot : 0 });
  }
  return { ok: true, home: { style, wall, roof, items: out } };
}
