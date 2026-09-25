// Procedural canvas textures for the 3D city (no image assets needed).

import * as THREE from 'three';

const cache = new Map();

export function canvasTexture(key, w, h, draw, { repeat = false } = {}) {
  if (key && cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  if (key) cache.set(key, tex);
  return tex;
}

const OUTLINE = '#3a3148';

/** Kuching shophouse front: shuttered windows upstairs, five-foot-way arches downstairs, shop sign. */
export function shophouseFacade(color, seed = 0) {
  const signs = ['KEDAI KOPI', 'KOLO MEE', 'EMAS', 'KEK LAPIS', 'UBAT', 'KAIN', 'BATIK', 'KUCING', 'ANTIK', 'LAKSA'];
  const shutter = ['#2e7d5b', '#1f6f8b', '#8b3a3a', '#6d4c41'][seed % 4];
  return canvasTexture(`shop-${color}-${seed}`, 128, 160, (g, w, h) => {
    g.fillStyle = color; g.fillRect(0, 0, w, h);
    // cornice / trim
    g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillRect(0, 8, w, 6); g.fillRect(0, h * 0.55, w, 5);
    // upstairs windows with shutters
    for (const x of [22, 74]) {
      g.fillStyle = '#35516b'; g.fillRect(x, 26, 32, 44);
      g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x + 4, 30, 10, 36);
      g.fillStyle = shutter; g.fillRect(x - 10, 26, 10, 44); g.fillRect(x + 32, 26, 10, 44);
      g.strokeStyle = OUTLINE; g.lineWidth = 2; g.strokeRect(x, 26, 32, 44);
    }
    // sign board
    g.fillStyle = '#fff4d6'; g.fillRect(10, h * 0.55 - 20, w - 20, 16);
    g.fillStyle = '#b3261e'; g.font = 'bold 12px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(signs[seed % signs.length], w / 2, h * 0.55 - 12);
    // arcade arches (five-foot way)
    g.fillStyle = 'rgba(40,30,55,0.75)';
    g.beginPath(); g.moveTo(14, h); g.lineTo(14, h * 0.72); g.arc(w / 2, h * 0.72, w / 2 - 14, Math.PI, 0); g.lineTo(w - 14, h); g.fill();
    g.fillStyle = 'rgba(255,220,150,0.35)'; g.fillRect(34, h * 0.78, w - 68, h * 0.22);
  });
}

/** Generic colonial facade with rows of windows. */
export function windowsFacade(color, { cols = 6, rows = 2, win = '#6fa9c9', shutter = null, arch = false } = {}) {
  return canvasTexture(`win-${color}-${cols}-${rows}-${win}-${shutter}-${arch}`, 256, 128, (g, w, h) => {
    g.fillStyle = color; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(0,0,0,0.06)'; g.fillRect(0, h - 10, w, 10);
    const cw = w / cols, rh = h / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * cw + cw * 0.28, y = r * rh + rh * 0.22, ww = cw * 0.44, hh = rh * 0.56;
        g.fillStyle = win;
        g.beginPath();
        if (arch) { g.moveTo(x, y + hh); g.lineTo(x, y + ww / 2); g.arc(x + ww / 2, y + ww / 2, ww / 2, Math.PI, 0); g.lineTo(x + ww, y + hh); }
        else g.rect(x, y, ww, hh);
        g.fill();
        g.strokeStyle = OUTLINE; g.lineWidth = 1.5; g.stroke();
        if (shutter) { g.fillStyle = shutter; g.fillRect(x - 6, y, 5, hh); g.fillRect(x + ww + 1, y, 5, hh); }
      }
    }
  });
}

export function woodTexture(color) {
  return canvasTexture(`wood-${color}`, 64, 64, (g, w, h) => {
    g.fillStyle = color; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(0,0,0,0.22)'; g.lineWidth = 2;
    for (let x = 0; x < w; x += 8) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    g.fillStyle = '#ffeaa7'; g.fillRect(22, 18, 20, 16); g.strokeRect(22, 18, 20, 16);
  });
}

export function roofTiles(color) {
  return canvasTexture(`roof-${color}`, 64, 64, (g, w, h) => {
    g.fillStyle = color; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 2;
    for (let y = 0; y < h; y += 8) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    for (let y = 0; y < h; y += 8) for (let x = (y / 8) % 2 ? 0 : 6; x < w; x += 12) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 8); g.stroke(); }
  }, { repeat: true });
}

export function stripes(c1, c2, n = 10) {
  return canvasTexture(`stripes-${c1}-${c2}-${n}`, 128, 16, (g, w, h) => {
    for (let i = 0; i < n; i++) { g.fillStyle = i % 2 ? c2 : c1; g.fillRect((w / n) * i, 0, w / n + 1, h); }
  });
}

export function rattanPattern() {
  return canvasTexture('rattan', 128, 128, (g, w, h) => {
    g.fillStyle = '#e3cfb0'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#7b5a43'; g.lineWidth = 5;
    for (let i = -h; i < w + h; i += 22) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke();
      g.beginPath(); g.moveTo(i, h); g.lineTo(i + h, 0); g.stroke();
    }
  }, { repeat: true });
}

export function sarawakFlag() {
  return canvasTexture('flag', 96, 64, (g, w, h) => {
    g.fillStyle = '#ffd200'; g.fillRect(0, 0, w, h);
    g.save(); g.translate(0, h); g.rotate(-Math.atan2(h, w));
    const len = Math.hypot(w, h);
    g.fillStyle = '#d0021b'; g.fillRect(0, -14, len, 14);
    g.fillStyle = '#111'; g.fillRect(0, -26, len, 12);
    g.restore();
    g.fillStyle = '#ffd200'; g.font = 'bold 18px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('★', w * 0.5, h * 0.5);
  });
}

export function clockFace() {
  return canvasTexture('clock', 64, 64, (g) => {
    g.fillStyle = '#fbf8f0'; g.fillRect(0, 0, 64, 64);
    g.beginPath(); g.arc(32, 32, 24, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill();
    g.lineWidth = 3; g.strokeStyle = OUTLINE; g.stroke();
    g.beginPath(); g.moveTo(32, 32); g.lineTo(32, 16); g.moveTo(32, 32); g.lineTo(44, 36); g.stroke();
  });
}

export function signTexture(text, bg = '#fff4d6', fg = '#b3261e') {
  return canvasTexture(`sign-${text}-${bg}`, 256, 64, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.strokeStyle = OUTLINE; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6);
    g.fillStyle = fg; g.font = 'bold 34px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 2);
  });
}

export function emojiTexture(emoji, size = 128) {
  return canvasTexture(`emoji-${emoji}`, size, size, (g, w, h) => {
    g.font = `${Math.round(size * 0.8)}px serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#000';
    g.fillText(emoji, w / 2, h / 2 + size * 0.05);
  });
}

export function dotTexture(color) {
  return canvasTexture(`dot-${color}`, 32, 32, (g) => {
    g.fillStyle = color; g.fillRect(6, 10, 20, 12);
  });
}

export function shadowTexture() {
  return canvasTexture('shadow', 64, 64, (g) => {
    const grd = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    grd.addColorStop(0, 'rgba(0,0,0,0.45)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  });
}

export function waterTexture() {
  return canvasTexture('water', 256, 256, (g, w, h) => {
    g.fillStyle = '#3d8fc4'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 3; g.lineCap = 'round';
    for (let i = 0; i < 40; i++) {
      const x = (i * 97) % w, y = (i * 61) % h;
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 10, y - 6, x + 20, y); g.stroke();
    }
  }, { repeat: true });
}

export function danceFloor() {
  return canvasTexture('dancefloor', 256, 128, (g, w, h) => {
    const pal = ['#ff7675', '#74b9ff', '#55efc4', '#ffeaa7', '#a29bfe', '#fd79a8'];
    for (let y = 0; y < 4; y++) for (let x = 0; x < 8; x++) { g.fillStyle = pal[(x + y * 3) % pal.length]; g.fillRect(x * 32 + 1, y * 32 + 1, 30, 30); }
  });
}

export function skyTexture() {
  return canvasTexture('sky', 16, 512, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#5aa6e0');
    grd.addColorStop(0.42, '#a9d4ef');
    grd.addColorStop(0.5, '#f4e3c3');
    grd.addColorStop(1, '#f4e3c3');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
  });
}
