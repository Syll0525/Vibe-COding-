// Hand-coded cartoon art for Kuching. Every prop is pre-rendered once into its own
// offscreen canvas so the frame loop only blits images.
// Swapping these functions for real illustrated PNGs later only touches this file.

import { TILE } from '/shared/constants.js';

const OUTLINE = '#2b2340';

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.ceil(w); c.height = Math.ceil(h);
  return c;
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}
function stroke(ctx, w = 3) { ctx.lineWidth = w; ctx.strokeStyle = OUTLINE; ctx.stroke(); }
function fillStroke(ctx, fill, w = 3) { ctx.fillStyle = fill; ctx.fill(); stroke(ctx, w); }

function windows(ctx, x0, y0, w, h, cols, rows, color = '#6fb6d9', shutter = null) {
  const cw = w / cols, ch = h / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = x0 + c * cw + cw * 0.25, y = y0 + r * ch + ch * 0.2;
      rr(ctx, x, y, cw * 0.5, ch * 0.6, 3);
      fillStroke(ctx, color, 2);
      if (shutter) {
        ctx.fillStyle = shutter;
        ctx.fillRect(x - cw * 0.12, y, cw * 0.1, ch * 0.6);
        ctx.fillRect(x + cw * 0.52, y, cw * 0.1, ch * 0.6);
      }
    }
  }
}

function crenellations(ctx, x, y, w, size, color) {
  const n = Math.max(3, Math.floor(w / size));
  const step = w / n;
  for (let i = 0; i < n; i += 2) {
    rr(ctx, x + i * step, y - size * 0.8, step, size * 0.8, 2);
    fillStroke(ctx, color, 2);
  }
}

/**
 * Draw a building into a new canvas. Footprint is w×h tiles; `lift` extra pixels of
 * facade/roof rise above the footprint (3/4 top-down view). Returns {canvas, ox, oy}
 * where (ox, oy) is the canvas offset relative to the footprint's top-left corner.
 */
export function drawBuilding(kind, wT, hT, seed = 0) {
  const W = wT * TILE, H = hT * TILE;
  const lift = { dun: 120, fort: 70, courthouse: 80, mosque: 70, cat: 80, astana: 50, museum: 60,
    tower: 60, temple: 45, museum_small: 42, hawker: 30, shophouse: 46, kampung: 34 }[kind] ?? 40;
  const c = makeCanvas(W + 8, H + lift + 8);
  const ctx = c.getContext('2d');
  ctx.translate(4, lift + 4);
  ctx.lineJoin = 'round';
  // soft ground shadow
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  rr(ctx, 4, H - 12, W - 4, 14, 8); ctx.fill();

  const facade = (top, color) => { rr(ctx, 0, top, W, H - top, 6); fillStroke(ctx, color); };

  switch (kind) {
    case 'shophouse': {
      const units = Math.max(1, Math.round(wT / 2));
      const uw = W / units;
      const colors = ['#f7d794', '#f8a5c2', '#9ad0ec', '#c7ecee', '#f3c4fb', '#badc58', '#ffbe76', '#dff9fb'];
      for (let i = 0; i < units; i++) {
        const x = i * uw;
        const col = colors[(i + seed) % colors.length];
        rr(ctx, x, -lift + 18, uw, H + lift - 18, 4); fillStroke(ctx, col);
        // clay tile roof
        rr(ctx, x - 2, -lift + 6, uw + 4, 20, 4); fillStroke(ctx, '#c0563b');
        windows(ctx, x + 6, -lift + 32, uw - 12, 26, 2, 1, '#5b8fb0', '#2e7d5b');
        // five-foot-way arches
        ctx.fillStyle = 'rgba(40,30,60,0.55)';
        ctx.beginPath(); ctx.ellipse(x + uw / 2, H - 4, uw * 0.32, 26, 0, Math.PI, 0); ctx.fill();
      }
      // shop sign
      rr(ctx, W * 0.1, H - 44, W * 0.8, 12, 3); fillStroke(ctx, '#fff4d6', 2);
      break;
    }
    case 'kampung': {
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = 4;
      for (const sx of [8, W / 2, W - 8]) { ctx.beginPath(); ctx.moveTo(sx, H - 20); ctx.lineTo(sx, H); ctx.stroke(); }
      rr(ctx, 0, -lift + 26, W, H + lift - 48, 4); fillStroke(ctx, ['#b07a4a', '#9c6b3f', '#c48a55'][seed % 3]);
      ctx.beginPath(); ctx.moveTo(-6, -lift + 30); ctx.lineTo(W / 2, -lift - 2); ctx.lineTo(W + 6, -lift + 30); ctx.closePath();
      fillStroke(ctx, ['#e17055', '#6c5ce7', '#00b894'][seed % 3]);
      windows(ctx, 8, -lift + 40, W - 16, 20, 2, 1, '#ffeaa7');
      break;
    }
    case 'astana': {
      facade(-lift + 30, '#fbfbf5');
      for (const [x, w] of [[0, W * 0.3], [W * 0.35, W * 0.3], [W * 0.7, W * 0.3]]) {
        ctx.beginPath(); ctx.moveTo(x - 4, -lift + 34); ctx.lineTo(x + w / 2, -lift); ctx.lineTo(x + w + 4, -lift + 34); ctx.closePath();
        fillStroke(ctx, '#b33939');
      }
      windows(ctx, 10, -lift + 44, W - 20, 40, 8, 1, '#7ec8e3', '#1e6f5c');
      rr(ctx, W / 2 - 14, H - 34, 28, 34, 10); fillStroke(ctx, '#6d4c41');
      break;
    }
    case 'dun': {
      // wide white base with columns
      facade(-10, '#f5f3ee');
      for (let x = 14; x < W - 10; x += 22) { ctx.fillStyle = '#d9d4c7'; ctx.fillRect(x, 0, 8, H - 16); }
      // the golden umbrella roof
      const g = ctx.createLinearGradient(0, -lift, 0, 0);
      g.addColorStop(0, '#ffe066'); g.addColorStop(1, '#f0a500');
      ctx.beginPath();
      ctx.moveTo(-6, 4);
      ctx.quadraticCurveTo(W * 0.25, -lift * 0.35, W / 2, -lift);
      ctx.quadraticCurveTo(W * 0.75, -lift * 0.35, W + 6, 4);
      ctx.closePath();
      fillStroke(ctx, g, 4);
      ctx.strokeStyle = 'rgba(160,90,0,0.55)'; ctx.lineWidth = 2;
      for (let i = 1; i < 8; i++) {
        ctx.beginPath(); ctx.moveTo(W / 2, -lift); ctx.lineTo((W * i) / 8, 2); ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(W / 2, -lift - 6, 7, 0, Math.PI * 2); fillStroke(ctx, '#ffe066', 2);
      break;
    }
    case 'fort': {
      facade(-lift + 40, '#fdfdfb');
      crenellations(ctx, 0, -lift + 40, W, 14, '#fdfdfb');
      // central tower
      rr(ctx, W * 0.3, -lift + 6, W * 0.4, H + lift - 6, 4); fillStroke(ctx, '#f4f1ea');
      crenellations(ctx, W * 0.3, -lift + 6, W * 0.4, 12, '#f4f1ea');
      windows(ctx, W * 0.33, -lift + 18, W * 0.34, 50, 2, 2, '#34495e');
      rr(ctx, W / 2 - 12, H - 30, 24, 30, 12); fillStroke(ctx, '#5d4037');
      // flag
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(W / 2, -lift + 4); ctx.lineTo(W / 2, -lift - 26); ctx.stroke();
      ctx.fillStyle = '#ffd32a'; ctx.fillRect(W / 2, -lift - 26, 22, 8);
      ctx.fillStyle = '#e74c3c'; ctx.fillRect(W / 2, -lift - 18, 22, 5);
      ctx.fillStyle = '#2c3e50'; ctx.fillRect(W / 2, -lift - 13, 22, 5);
      break;
    }
    case 'tower': {
      facade(-lift + 12, '#f7f5ef');
      crenellations(ctx, 0, -lift + 12, W, 14, '#f7f5ef');
      windows(ctx, 8, -lift + 30, W - 16, 40, 3, 2, '#2d3436');
      break;
    }
    case 'museum_small': {
      facade(-lift + 22, '#fffdf7');
      ctx.beginPath(); ctx.moveTo(-6, -lift + 26); ctx.lineTo(W / 2, -lift); ctx.lineTo(W + 6, -lift + 26); ctx.closePath();
      fillStroke(ctx, '#c0392b');
      windows(ctx, 8, -lift + 34, W - 16, 30, 4, 1, '#88c0d0', '#2e7d5b');
      break;
    }
    case 'temple': {
      facade(-lift + 20, '#d63031');
      ctx.beginPath();
      ctx.moveTo(-10, -lift + 26);
      ctx.quadraticCurveTo(W / 2, -lift + 6, W + 10, -lift + 26);
      ctx.lineTo(W + 16, -lift + 12);
      ctx.quadraticCurveTo(W / 2, -lift - 10, -16, -lift + 12);
      ctx.closePath();
      fillStroke(ctx, '#00a085');
      ctx.fillStyle = '#fdcb6e';
      ctx.beginPath(); ctx.arc(W / 2, -lift - 4, 6, 0, Math.PI * 2); ctx.fill();
      rr(ctx, W / 2 - 16, H - 34, 32, 34, 4); fillStroke(ctx, '#2d3436');
      for (const x of [10, W - 22]) { rr(ctx, x, -lift + 34, 12, 18, 6); fillStroke(ctx, '#ffeaa7', 2); } // lanterns
      break;
    }
    case 'courthouse': {
      facade(-lift + 44, '#fbf8f0');
      for (let x = 10; x < W - 10; x += 24) { rr(ctx, x, -lift + 56, 10, H + lift - 64, 3); fillStroke(ctx, '#ffffff', 2); }
      ctx.beginPath(); ctx.moveTo(-6, -lift + 48); ctx.lineTo(W + 6, -lift + 48); ctx.lineTo(W - 10, -lift + 36); ctx.lineTo(10, -lift + 36); ctx.closePath();
      fillStroke(ctx, '#a0522d');
      // clock tower
      rr(ctx, W / 2 - 18, -lift, 36, 60, 3); fillStroke(ctx, '#fbf8f0');
      ctx.beginPath(); ctx.arc(W / 2, -lift + 20, 11, 0, Math.PI * 2); fillStroke(ctx, '#ffffff', 2);
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(W / 2, -lift + 20); ctx.lineTo(W / 2, -lift + 12); ctx.moveTo(W / 2, -lift + 20); ctx.lineTo(W / 2 + 6, -lift + 22); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(W / 2 - 22, -lift + 2); ctx.lineTo(W / 2, -lift - 20); ctx.lineTo(W / 2 + 22, -lift + 2); ctx.closePath();
      fillStroke(ctx, '#a0522d');
      break;
    }
    case 'museum': {
      facade(-lift + 16, '#e8d8c3');
      // rattan-mat diamond pattern
      ctx.save();
      rr(ctx, 0, -lift + 16, W, H + lift - 16, 6); ctx.clip();
      ctx.strokeStyle = '#8d6e63'; ctx.lineWidth = 3;
      for (let i = -H - lift; i < W + H + lift; i += 22) {
        ctx.beginPath(); ctx.moveTo(i, -lift); ctx.lineTo(i + H + lift, H); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(i, H); ctx.lineTo(i + H + lift, -lift); ctx.stroke();
      }
      ctx.restore();
      rr(ctx, 0, -lift + 16, W, H + lift - 16, 6); stroke(ctx);
      rr(ctx, W * 0.3, H - 30, W * 0.4, 30, 4); fillStroke(ctx, '#74b9ff');
      break;
    }
    case 'mosque': {
      facade(-lift + 44, '#fdfbf6');
      windows(ctx, 8, -lift + 56, W - 16, 30, 5, 1, '#55efc4');
      const dome = (x, r) => {
        ctx.beginPath(); ctx.arc(x, -lift + 44, r, Math.PI, 0); ctx.closePath();
        fillStroke(ctx, '#f9ca24');
        ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x, -lift + 44 - r); ctx.lineTo(x, -lift + 30 - r); ctx.stroke();
      };
      dome(W / 2, W * 0.24); dome(W * 0.15, W * 0.1); dome(W * 0.85, W * 0.1);
      break;
    }
    case 'hawker': {
      rr(ctx, 0, -lift + 20, W, H + lift - 20, 6); fillStroke(ctx, '#ffeaa7');
      // striped awning
      const stripes = 10;
      for (let i = 0; i < stripes; i++) {
        ctx.fillStyle = i % 2 ? '#ffffff' : '#e84393';
        ctx.fillRect((W / stripes) * i, -lift + 4, W / stripes, 22);
      }
      rr(ctx, 0, -lift + 4, W, 22, 4); stroke(ctx);
      ctx.font = 'bold 18px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = OUTLINE;
      ctx.fillText('TOP SPOT', W / 2, -lift + 48);
      for (let x = 16; x < W - 10; x += 40) { ctx.font = '22px serif'; ctx.fillText('🍜', x + 8, H - 12); }
      break;
    }
    case 'cat': {
      rr(ctx, 6, H - 34, W - 12, 34, 6); fillStroke(ctx, '#b2bec3');
      // a big friendly white cat
      const cx = W / 2, base = H - 34;
      ctx.beginPath(); ctx.ellipse(cx, base - 26, 26, 30, 0, 0, Math.PI * 2); fillStroke(ctx, '#ffffff');
      ctx.beginPath(); ctx.arc(cx, base - 64, 22, 0, Math.PI * 2); fillStroke(ctx, '#ffffff');
      for (const s of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(cx + s * 20, base - 72); ctx.lineTo(cx + s * 16, base - 94); ctx.lineTo(cx + s * 5, base - 82); ctx.closePath();
        fillStroke(ctx, '#ffffff');
        ctx.beginPath(); ctx.arc(cx + s * 8, base - 66, 3, 0, Math.PI * 2); ctx.fillStyle = OUTLINE; ctx.fill();
      }
      ctx.fillStyle = '#fd79a8'; ctx.beginPath(); ctx.arc(cx, base - 59, 3, 0, Math.PI * 2); ctx.fill();
      // raised paw — "welcome to Kuching"
      ctx.beginPath(); ctx.ellipse(cx + 28, base - 44, 8, 14, -0.5, 0, Math.PI * 2); fillStroke(ctx, '#ffffff');
      break;
    }
    default:
      facade(-lift, '#dfe6e9');
  }
  return { canvas: c, ox: -4, oy: -lift - 4 };
}

export function drawTree(kind, s = 1) {
  const c = makeCanvas(70 * s, 96 * s);
  const ctx = c.getContext('2d');
  ctx.scale(s, s);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath(); ctx.ellipse(35, 88, 20, 7, 0, 0, Math.PI * 2); ctx.fill();
  if (kind === 'palm') {
    ctx.strokeStyle = '#8d6e63'; ctx.lineWidth = 7; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(35, 88); ctx.quadraticCurveTo(28, 55, 36, 26); ctx.stroke();
    ctx.lineWidth = 2; ctx.strokeStyle = OUTLINE;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(36, 26);
      ctx.quadraticCurveTo(36 + Math.cos(a) * 20, 18 + Math.sin(a) * 6, 36 + Math.cos(a) * 30, 30 + Math.sin(a) * 12);
      ctx.quadraticCurveTo(36 + Math.cos(a) * 14, 26 + Math.sin(a) * 10, 36, 28);
      ctx.fillStyle = i % 2 ? '#2ecc71' : '#27ae60'; ctx.fill(); ctx.stroke();
    }
  } else {
    ctx.fillStyle = '#795548'; ctx.fillRect(31, 56, 8, 32);
    ctx.lineWidth = 3; ctx.strokeStyle = OUTLINE;
    ctx.strokeRect(31, 56, 8, 32);
    const blobs = [[35, 30, 22], [20, 44, 16], [50, 44, 16], [35, 48, 18]];
    for (const [x, y, r] of blobs) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = '#3fae49'; ctx.fill(); ctx.stroke(); }
    for (const [x, y, r] of blobs) { ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.45, 0, Math.PI * 2); ctx.fillStyle = '#6fd66f'; ctx.fill(); }
  }
  return { canvas: c, ox: -35 * s, oy: -88 * s };
}

export function drawLamp() {
  const c = makeCanvas(20, 70);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#2d3436'; ctx.fillRect(8, 14, 4, 54);
  ctx.beginPath(); ctx.arc(10, 12, 8, 0, Math.PI * 2); ctx.fillStyle = '#ffeaa7'; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = OUTLINE; ctx.stroke();
  return { canvas: c, ox: -10, oy: -68 };
}

export function drawHiddenCat(color = '#f39c12') {
  const c = makeCanvas(34, 30);
  const ctx = c.getContext('2d');
  ctx.lineWidth = 2; ctx.strokeStyle = OUTLINE; ctx.fillStyle = color;
  ctx.beginPath(); ctx.ellipse(17, 20, 10, 8, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.arc(17, 11, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  for (const s of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(17 + s * 6, 8); ctx.lineTo(17 + s * 6, 1); ctx.lineTo(17 + s * 1, 5); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  ctx.beginPath(); ctx.moveTo(27, 22); ctx.quadraticCurveTo(34, 18, 30, 10); ctx.stroke();
  ctx.fillStyle = OUTLINE; ctx.fillRect(13, 10, 2, 2); ctx.fillRect(19, 10, 2, 2);
  return { canvas: c, ox: -17, oy: -26 };
}

/** Procedural doodle for players who skipped scanning (and for bots). */
export function drawDoodle(color, seed = 1) {
  const c = makeCanvas(96, 110);
  const ctx = c.getContext('2d');
  let s = seed;
  const r = () => { s = (s * 16807) % 2147483647; return (s % 1000) / 1000; };
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const body = () => {
    ctx.beginPath();
    const n = 9;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const rad = 32 + r() * 8;
      const x = 48 + Math.cos(a) * rad * 0.9, y = 56 + Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  };
  // white sticker border
  ctx.lineWidth = 12; ctx.strokeStyle = '#fff'; body(); ctx.stroke();
  ctx.fillStyle = color; ctx.fill();
  ctx.lineWidth = 3.5; ctx.strokeStyle = OUTLINE; ctx.stroke();
  // legs & arms
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(36, 88); ctx.lineTo(32, 104); ctx.moveTo(60, 88); ctx.lineTo(64, 104);
  ctx.moveTo(16, 56); ctx.lineTo(4, 44); ctx.moveTo(80, 56); ctx.lineTo(92, 44); ctx.stroke();
  // eyes + smile
  for (const x of [38, 58]) {
    ctx.beginPath(); ctx.arc(x, 48, 8, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 2.5; ctx.stroke();
    ctx.beginPath(); ctx.arc(x + 2, 49, 3.5, 0, Math.PI * 2); ctx.fillStyle = OUTLINE; ctx.fill();
  }
  ctx.beginPath(); ctx.arc(48, 62, 10, 0.15 * Math.PI, 0.85 * Math.PI); ctx.lineWidth = 3; ctx.stroke();
  if (r() > 0.5) { // antenna / hair tuft
    ctx.beginPath(); ctx.moveTo(48, 22); ctx.lineTo(48, 8); ctx.stroke();
    ctx.beginPath(); ctx.arc(48, 6, 5, 0, Math.PI * 2); ctx.fillStyle = '#ffd32a'; ctx.fill(); ctx.stroke();
  }
  return c;
}
