// Builds the static Kuching scene: a pre-rendered ground layer plus a list of
// y-sortable props (buildings, trees, lamps) that are drawn together with characters.

import { TILE } from '/shared/constants.js';
import {
  MAP_W, MAP_H, WORLD_W, WORLD_H, TILES, T, SOLIDS, DECOR, ZONES, LANDMARKS, JETTIES,
  HIDDEN_CATS, riverTop, RIVER_HEIGHT, mulberry32, tileCenter,
} from '/shared/map.js';
import { makeCanvas, drawBuilding, drawTree, drawLamp, drawHiddenCat } from './art.js';

const COLORS = {
  [T.GRASS]: '#8fd16a', [T.ROAD]: '#5d5d63', [T.WATER]: '#3aa0d8', [T.BOARDWALK]: '#d9a566',
  [T.BRIDGE]: '#f5c542', [T.PLAZA]: '#efe3cc', [T.MUD]: '#c7a46e', [T.JUNGLE]: '#2f7d3b',
};

export function buildGround() {
  const c = makeCanvas(WORLD_W, WORLD_H);
  const ctx = c.getContext('2d');
  const rand = mulberry32(42);
  const tileAt = (x, y) => (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H ? T.JUNGLE : TILES[y * MAP_W + x]);

  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const t = tileAt(x, y);
      const px = x * TILE, py = y * TILE;
      ctx.fillStyle = COLORS[t];
      ctx.fillRect(px, py, TILE + 1, TILE + 1);
      if (t === T.GRASS) {
        ctx.fillStyle = 'rgba(40,120,40,0.12)';
        for (let k = 0; k < 3; k++) ctx.fillRect(px + rand() * TILE, py + rand() * TILE, 6, 3);
        if (rand() < 0.08) { // flowers
          ctx.fillStyle = ['#ff7675', '#fdcb6e', '#ffffff', '#a29bfe'][Math.floor(rand() * 4)];
          ctx.beginPath(); ctx.arc(px + rand() * TILE, py + rand() * TILE, 3, 0, Math.PI * 2); ctx.fill();
        }
      } else if (t === T.BOARDWALK || t === T.BRIDGE) {
        ctx.strokeStyle = t === T.BRIDGE ? 'rgba(150,100,0,0.35)' : 'rgba(110,60,20,0.3)';
        ctx.lineWidth = 2;
        for (let k = 0; k < TILE; k += 10) {
          ctx.beginPath();
          if (t === T.BRIDGE) { ctx.moveTo(px, py + k); ctx.lineTo(px + TILE, py + k); }
          else { ctx.moveTo(px + k, py); ctx.lineTo(px + k, py + TILE); }
          ctx.stroke();
        }
      } else if (t === T.PLAZA) {
        ctx.strokeStyle = 'rgba(150,120,80,0.18)'; ctx.lineWidth = 1;
        ctx.strokeRect(px + 1, py + 1, TILE / 2, TILE / 2); ctx.strokeRect(px + TILE / 2, py + TILE / 2, TILE / 2 - 1, TILE / 2 - 1);
      } else if (t === T.ROAD) {
        // asphalt speckle + lane markings (yellow between two-lane roads, white dashes on single lanes)
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        for (let k = 0; k < 4; k++) ctx.fillRect(px + rand() * TILE, py + rand() * TILE, 3, 2);
        const horiz = tileAt(x - 1, y) === T.ROAD && tileAt(x + 1, y) === T.ROAD;
        const below = tileAt(x, y + 1) === T.ROAD, above = tileAt(x, y - 1) === T.ROAD;
        const right = tileAt(x + 1, y) === T.ROAD, left = tileAt(x - 1, y) === T.ROAD;
        if (horiz && below && !above) { ctx.fillStyle = '#f2c230'; ctx.fillRect(px, py + TILE - 3, TILE + 1, 2); ctx.fillRect(px, py + TILE + 1, TILE + 1, 2); }
        else if (horiz && !below && !above && x % 2 === 0) { ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillRect(px + 6, py + TILE / 2 - 1.5, TILE / 2, 3); }
        if (!horiz && right && !left) { ctx.fillStyle = '#f2c230'; ctx.fillRect(px + TILE - 3, py, 2, TILE + 1); ctx.fillRect(px + TILE + 1, py, 2, TILE + 1); }
        else if (!horiz && right && left && y % 2 === 0 && tileAt(x, y - 1) === T.ROAD) { ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillRect(px + TILE / 2 - 1.5, py + 6, 3, TILE / 2); }
      } else if (t === T.JUNGLE) {
        for (let k = 0; k < 3; k++) {
          ctx.beginPath();
          ctx.arc(px + rand() * TILE, py + rand() * TILE, 12 + rand() * 10, 0, Math.PI * 2);
          ctx.fillStyle = ['#2f7d3b', '#3a9448', '#236b30'][k]; ctx.fill();
        }
      }
    }
  }

  // Pavements (sidewalks) wherever land meets a road
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const t = tileAt(x, y);
      if (t === T.ROAD || t === T.WATER || t === T.JUNGLE || t === T.BRIDGE) continue;
      const px = x * TILE, py = y * TILE, w = 12;
      ctx.fillStyle = '#d8d0c0';
      if (tileAt(x, y - 1) === T.ROAD) ctx.fillRect(px, py, TILE, w);
      if (tileAt(x, y + 1) === T.ROAD) ctx.fillRect(px, py + TILE - w, TILE, w);
      if (tileAt(x - 1, y) === T.ROAD) ctx.fillRect(px, py, w, TILE);
      if (tileAt(x + 1, y) === T.ROAD) ctx.fillRect(px + TILE - w, py, w, TILE);
    }
  }

  // Soft river banks
  ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  for (const edge of [0, RIVER_HEIGHT]) {
    ctx.beginPath();
    for (let x = 0; x <= MAP_W; x++) {
      const y = (riverTop(Math.min(MAP_W - 1, x)) + edge) * TILE;
      if (x === 0) ctx.moveTo(0, y); else ctx.lineTo(x * TILE, y);
    }
    ctx.stroke();
  }

  // Waterfront stage: coloured dance floor
  const stage = ZONES.find((z) => z.id === 'stage');
  const palette = ['#ff7675', '#74b9ff', '#55efc4', '#ffeaa7', '#a29bfe', '#fd79a8'];
  for (let y = 0; y < stage.h * 2; y++) {
    for (let x = 0; x < stage.w * 2; x++) {
      ctx.fillStyle = palette[(x + y * 3) % palette.length];
      ctx.globalAlpha = 0.75;
      ctx.fillRect((stage.x + x / 2) * TILE + 1, (stage.y + y / 2) * TILE + 1, TILE / 2 - 2, TILE / 2 - 2);
    }
  }
  ctx.globalAlpha = 1;
  ctx.lineWidth = 4; ctx.strokeStyle = '#2b2340';
  ctx.strokeRect(stage.x * TILE, stage.y * TILE, stage.w * TILE, stage.h * TILE);

  // Padang Merdeka: grass oval + path
  const pad = ZONES.find((z) => z.id === 'padang');
  ctx.fillStyle = '#7bc75a';
  ctx.beginPath();
  ctx.ellipse((pad.x + pad.w / 2) * TILE, (pad.y + pad.h / 2) * TILE, pad.w * TILE * 0.45, pad.h * TILE * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#efe3cc'; ctx.lineWidth = 8; ctx.stroke();

  // Cat roundabout ring
  ctx.strokeStyle = '#c9c2b4'; ctx.lineWidth = 26;
  ctx.beginPath(); ctx.arc(57 * TILE, 34 * TILE, 2.3 * TILE, 0, Math.PI * 2); ctx.stroke();

  // Jetties
  for (const j of JETTIES) {
    const c0 = tileCenter(j.tx, j.ty);
    ctx.fillStyle = '#8d6e63'; ctx.strokeStyle = '#2b2340'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.roundRect(c0.x - 22, c0.y - 16, 44, 32, 5); ctx.fill(); ctx.stroke();
    ctx.font = '22px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('⚓', c0.x, c0.y);
  }

  // Street names for flavour
  ctx.font = 'bold 15px "Baloo 2", sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fillText('MAIN BAZAAR', 3 * TILE, 27 * TILE);
  ctx.fillText('JALAN CARPENTER', 43 * TILE, 27 * TILE);
  ctx.fillText('JALAN INDIA', 3 * TILE, 38.5 * TILE);
  ctx.fillText('JALAN ASTANA', 14 * TILE, 7.5 * TILE);
  ctx.fillText('JALAN TAMAN', 4 * TILE, 46 * TILE);
  ctx.fillText('JALAN TAMAN', 40 * TILE, 46 * TILE);
  ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.font = 'bold 22px "Baloo 2", sans-serif';
  ctx.fillText('~ SUNGAI SARAWAK ~', 4 * TILE, 17.2 * TILE);
  ctx.fillText('~ SARAWAK RIVER ~', 42 * TILE, 17.4 * TILE);
  return c;
}

/** Static props, each with an anchor y used for depth sorting against characters. */
export function buildProps() {
  const props = [];
  let seed = 0;
  for (const s of SOLIDS) {
    const b = drawBuilding(s.kind, s.w, s.h, seed++);
    props.push({ img: b.canvas, x: s.x * TILE + b.ox, y: s.y * TILE + b.oy, sortY: (s.y + s.h) * TILE - 4 });
  }
  const treeCache = new Map();
  for (const t of DECOR.trees) {
    const key = `${t.kind}${t.s.toFixed(1)}`;
    if (!treeCache.has(key)) treeCache.set(key, drawTree(t.kind, Number(t.s.toFixed(1))));
    const d = treeCache.get(key);
    props.push({ img: d.canvas, x: t.x + d.ox, y: t.y + d.oy, sortY: t.y });
  }
  const lamp = drawLamp();
  for (const l of DECOR.lamps) props.push({ img: lamp.canvas, x: l.x + lamp.ox, y: l.y + lamp.oy, sortY: l.y });
  // Bridge towers of the Darul Hana bridge
  const bx = 31.5 * TILE, by = (riverTop(31) + 2) * TILE;
  const tower = makeCanvas(60, 140);
  const tctx = tower.getContext('2d');
  tctx.fillStyle = '#f5c542'; tctx.strokeStyle = '#2b2340'; tctx.lineWidth = 3;
  tctx.beginPath(); tctx.moveTo(10, 136); tctx.lineTo(24, 10); tctx.lineTo(36, 10); tctx.lineTo(50, 136); tctx.closePath(); tctx.fill(); tctx.stroke();
  tctx.beginPath(); tctx.arc(30, 10, 8, 0, Math.PI * 2); tctx.fill(); tctx.stroke();
  props.push({ img: tower, x: bx - 30 - 58, y: by - 136, sortY: by });
  props.push({ img: tower, x: bx - 30 + 58, y: by - 136, sortY: by });
  return props;
}

/** Landmark name plates (drawn above props so the big screen doubles as a map). */
export const LABELS = LANDMARKS.map((l) => ({ text: l.name.replace(/ \(DUN\)/, ''), x: (l.x + l.w / 2) * TILE, y: (l.y + l.h) * TILE + 14 }));

export const CAT_SPOTS = HIDDEN_CATS.map((c, i) => ({ ...c, ...tileCenter(c.tx, c.ty), art: drawHiddenCat(['#f39c12', '#dfe6e9', '#636e72', '#e17055'][i % 4]) }));

/** Animated water shimmer, drawn every frame over the ground layer. */
export function drawWater(ctx, time, view) {
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  const x0 = Math.max(0, Math.floor(view.x / TILE)), x1 = Math.min(MAP_W, Math.ceil((view.x + view.w) / TILE));
  for (let x = x0; x < x1; x += 1) {
    const top = riverTop(x);
    for (let r = 0; r < RIVER_HEIGHT; r++) {
      if (x >= 30 && x <= 32) continue;
      const phase = time * 1.4 + x * 0.9 + r * 2.1;
      const px = x * TILE + ((phase * 12) % TILE);
      const py = (top + r) * TILE + 12 + Math.sin(phase) * 5;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.quadraticCurveTo(px + 7, py - 5, px + 14, py); ctx.stroke();
    }
  }
  ctx.restore();
}
