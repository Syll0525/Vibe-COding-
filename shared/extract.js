// Drawing extraction: turns a phone photo of a paper drawing into a transparent
// "sticker" sprite. Pure functions over ImageData-like objects ({width, height, data})
// so the exact same code runs in the browser (live preview) and in Node tests.
//
// Pipeline
//   1. Estimate the paper colour locally (handles shadows / warm indoor lighting).
//   2. Ink = pixels that differ enough from the local paper colour (dark lines AND colours).
//   3. Close small gaps in the outline, then flood-fill the background from the border.
//      Anything the flood can't reach (line art + the inside of closed shapes) is the character.
//   4. Keep the main blobs, drop specks and things touching the photo edge (table, fingers).
//   5. Normalise colours against the paper (clean white), crop, add a sticker outline.

const BLOCK = 24;

function lum(r, g, b) { return 0.299 * r + 0.587 * g + 0.114 * b; }

/** Per-block paper colour, smoothed and interpolated to a per-pixel lookup. */
function estimatePaper(img) {
  const { width: w, height: h, data } = img;
  const bw = Math.ceil(w / BLOCK), bh = Math.ceil(h / BLOCK);
  const blocks = new Float32Array(bw * bh * 4); // r,g,b,lum
  const lums = [];
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      const px = [];
      for (let y = by * BLOCK; y < Math.min(h, (by + 1) * BLOCK); y++) {
        for (let x = bx * BLOCK; x < Math.min(w, (bx + 1) * BLOCK); x++) {
          const i = (y * w + x) * 4;
          px.push([data[i], data[i + 1], data[i + 2], lum(data[i], data[i + 1], data[i + 2])]);
        }
      }
      px.sort((a, b) => b[3] - a[3]);
      // brightest 30% of the block approximates the paper
      const n = Math.max(1, Math.floor(px.length * 0.3));
      let r = 0, g = 0, b = 0, l = 0;
      for (let k = 0; k < n; k++) { r += px[k][0]; g += px[k][1]; b += px[k][2]; l += px[k][3]; }
      const o = (by * bw + bx) * 4;
      blocks[o] = r / n; blocks[o + 1] = g / n; blocks[o + 2] = b / n; blocks[o + 3] = l / n;
      lums.push(l / n);
    }
  }
  // Blocks fully covered by colouring look "dark"; replace them with the typical paper.
  const sorted = [...lums].sort((a, b) => a - b);
  const paperLum = sorted[Math.floor(sorted.length * 0.75)] || 255;
  let pr = 0, pg = 0, pb = 0, pn = 0;
  for (let k = 0; k < bw * bh; k++) {
    if (blocks[k * 4 + 3] >= paperLum * 0.9) { pr += blocks[k * 4]; pg += blocks[k * 4 + 1]; pb += blocks[k * 4 + 2]; pn++; }
  }
  const paper = pn ? [pr / pn, pg / pn, pb / pn] : [255, 255, 255];
  for (let k = 0; k < bw * bh; k++) {
    if (blocks[k * 4 + 3] < paperLum * 0.8) {
      blocks[k * 4] = paper[0]; blocks[k * 4 + 1] = paper[1]; blocks[k * 4 + 2] = paper[2];
      blocks[k * 4 + 3] = lum(...paper);
    }
  }
  return {
    paper,
    at(x, y, out) {
      // bilinear interpolation between block centres
      const fx = Math.min(bw - 1, Math.max(0, x / BLOCK - 0.5));
      const fy = Math.min(bh - 1, Math.max(0, y / BLOCK - 0.5));
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      const x1 = Math.min(bw - 1, x0 + 1), y1 = Math.min(bh - 1, y0 + 1);
      const ax = fx - x0, ay = fy - y0;
      for (let c = 0; c < 3; c++) {
        const a = blocks[(y0 * bw + x0) * 4 + c], b = blocks[(y0 * bw + x1) * 4 + c];
        const d = blocks[(y1 * bw + x0) * 4 + c], e = blocks[(y1 * bw + x1) * 4 + c];
        out[c] = (a * (1 - ax) + b * ax) * (1 - ay) + (d * (1 - ax) + e * ax) * ay;
      }
      return out;
    },
  };
}

function dilate(mask, w, h, r) {
  const out = new Uint8Array(mask.length);
  const tmp = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++) {           // horizontal pass
    let run = -1e9;
    for (let x = 0; x < w; x++) { if (mask[y * w + x]) run = x; if (x - run <= r) tmp[y * w + x] = 1; }
    run = 1e9;
    for (let x = w - 1; x >= 0; x--) { if (mask[y * w + x]) run = x; if (run - x <= r) tmp[y * w + x] = 1; }
  }
  for (let x = 0; x < w; x++) {           // vertical pass (square structuring element)
    let run = -1e9;
    for (let y = 0; y < h; y++) { if (tmp[y * w + x]) run = y; if (y - run <= r) out[y * w + x] = 1; }
    run = 1e9;
    for (let y = h - 1; y >= 0; y--) { if (tmp[y * w + x]) run = y; if (run - y <= r) out[y * w + x] = 1; }
  }
  return out;
}

function erode(mask, w, h, r) {
  const inv = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) inv[i] = mask[i] ? 0 : 1;
  const d = dilate(inv, w, h, r);
  for (let i = 0; i < d.length; i++) d[i] = d[i] ? 0 : 1;
  return d;
}

/** Label 4-connected components of `mask`; returns {labels, comps:[{area,minX,..}]} */
function components(mask, w, h) {
  const labels = new Int32Array(mask.length).fill(-1);
  const comps = [];
  const stack = new Int32Array(mask.length);
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || labels[i] !== -1) continue;
    const id = comps.length;
    const c = { id, area: 0, minX: w, minY: h, maxX: 0, maxY: 0 };
    let sp = 0; stack[sp++] = i; labels[i] = id;
    while (sp) {
      const p = stack[--sp];
      const x = p % w, y = (p / w) | 0;
      c.area++;
      if (x < c.minX) c.minX = x; if (x > c.maxX) c.maxX = x;
      if (y < c.minY) c.minY = y; if (y > c.maxY) c.maxY = y;
      if (x > 0 && mask[p - 1] && labels[p - 1] === -1) { labels[p - 1] = id; stack[sp++] = p - 1; }
      if (x < w - 1 && mask[p + 1] && labels[p + 1] === -1) { labels[p + 1] = id; stack[sp++] = p + 1; }
      if (y > 0 && mask[p - w] && labels[p - w] === -1) { labels[p - w] = id; stack[sp++] = p - w; }
      if (y < h - 1 && mask[p + w] && labels[p + w] === -1) { labels[p + w] = id; stack[sp++] = p + w; }
    }
    comps.push(c);
  }
  return { labels, comps };
}

/**
 * @param {{width:number,height:number,data:Uint8ClampedArray}} img  source photo (ideally ≤ 512px)
 * @param {{sensitivity?:number, maxSize?:number, outline?:boolean}} opts
 *   sensitivity 0..1 — higher picks up fainter lines (default 0.5)
 * @returns {{ok:boolean, reason?:string, image?:{width,height,data}, coverage:number, color:string}}
 */
export function extractCharacter(img, opts = {}) {
  const { width: w, height: h, data } = img;
  const sensitivity = opts.sensitivity ?? 0.5;
  const maxSize = opts.maxSize ?? 160;
  const threshold = 95 - sensitivity * 70; // colour distance from paper that counts as ink

  const paper = estimatePaper(img);
  const ink = new Uint8Array(w * h);
  const bg = [0, 0, 0];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      paper.at(x, y, bg);
      const dr = data[i] - bg[0], dg = data[i + 1] - bg[1], db = data[i + 2] - bg[2];
      // darker-than-paper counts extra (pencil), lighter-than-paper counts less (glare)
      const dl = lum(data[i], data[i + 1], data[i + 2]) - lum(bg[0], bg[1], bg[2]);
      const dist = Math.sqrt(dr * dr + dg * dg + db * db) + (dl < 0 ? -dl * 0.35 : -dl * 0.5);
      if (dist > threshold) ink[y * w + x] = 1;
    }
  }

  // Seal small gaps in hand-drawn outlines
  const gap = Math.max(1, Math.round(Math.min(w, h) / 160));
  const closed = erode(dilate(ink, w, h, gap), w, h, gap);

  // Flood the background from the photo border through non-ink pixels
  const outside = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  let sp = 0;
  const seed = (p) => { if (!closed[p] && !outside[p]) { outside[p] = 1; stack[sp++] = p; } };
  for (let x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }
  while (sp) {
    const p = stack[--sp];
    const x = p % w;
    if (x > 0) seed(p - 1);
    if (x < w - 1) seed(p + 1);
    if (p >= w) seed(p - w);
    if (p < w * (h - 1)) seed(p + w);
  }
  const fg = new Uint8Array(w * h);
  for (let i = 0; i < fg.length; i++) fg[i] = outside[i] ? 0 : 1;

  // Keep the meaningful blobs
  const { labels, comps } = components(fg, w, h);
  if (!comps.length) return { ok: false, reason: 'No drawing found — try more light or a darker pen.', coverage: 0, color: '#888888' };
  const edgeSides = (c) => (c.minX === 0) + (c.minY === 0) + (c.maxX === w - 1) + (c.maxY === h - 1);
  let candidates = comps.filter((c) => edgeSides(c) < 2 && c.area > w * h * 0.0015);
  if (!candidates.length) candidates = [...comps].sort((a, b) => b.area - a.area).slice(0, 1);
  const biggest = Math.max(...candidates.map((c) => c.area));
  const keep = new Set(candidates.filter((c) => c.area >= biggest * 0.12).map((c) => c.id));

  let minX = w, minY = h, maxX = 0, maxY = 0, area = 0;
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < mask.length; i++) {
    if (labels[i] >= 0 && keep.has(labels[i])) {
      mask[i] = 1; area++;
      const x = i % w, y = (i / w) | 0;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  const coverage = area / (w * h);
  if (coverage < 0.004) return { ok: false, reason: 'The drawing looks too small or faint. Move closer and try again.', coverage, color: '#888888' };
  if (coverage > 0.85) return { ok: false, reason: 'Could not separate the drawing from the background. Try a plain white paper.', coverage, color: '#888888' };

  // Crop + scale into a sprite with room for the sticker outline
  const pad = opts.outline === false ? 0 : 4;
  const cw = maxX - minX + 1, ch = maxY - minY + 1;
  const scale = Math.min(1, (maxSize - pad * 2) / Math.max(cw, ch));
  const ow = Math.max(1, Math.round(cw * scale)) + pad * 2;
  const oh = Math.max(1, Math.round(ch * scale)) + pad * 2;
  const out = new Uint8ClampedArray(ow * oh * 4);
  const omask = new Uint8Array(ow * oh);

  let sr = 0, sg = 0, sb = 0, sn = 0;
  for (let oy = pad; oy < oh - pad; oy++) {
    for (let ox = pad; ox < ow - pad; ox++) {
      // box-sample the source area for this output pixel
      const sx0 = minX + (ox - pad) / scale, sy0 = minY + (oy - pad) / scale;
      const sx1 = Math.min(maxX + 1, sx0 + 1 / scale), sy1 = Math.min(maxY + 1, sy0 + 1 / scale);
      let r = 0, g = 0, b = 0, cov = 0, n = 0;
      for (let sy = Math.floor(sy0); sy < Math.max(Math.floor(sy0) + 1, Math.ceil(sy1)); sy++) {
        for (let sx = Math.floor(sx0); sx < Math.max(Math.floor(sx0) + 1, Math.ceil(sx1)); sx++) {
          if (sx > maxX || sy > maxY) continue;
          const p = sy * w + sx;
          n++;
          if (!mask[p]) continue;
          paper.at(sx, sy, bg);
          const i = p * 4;
          // normalise against paper so the page becomes clean white and colours pop
          r += Math.min(255, (data[i] / Math.max(1, bg[0])) * 255 * 1.04);
          g += Math.min(255, (data[i + 1] / Math.max(1, bg[1])) * 255 * 1.04);
          b += Math.min(255, (data[i + 2] / Math.max(1, bg[2])) * 255 * 1.04);
          cov++;
        }
      }
      if (!cov || cov / n < 0.4) continue;
      const o = (oy * ow + ox) * 4;
      out[o] = r / cov; out[o + 1] = g / cov; out[o + 2] = b / cov; out[o + 3] = 255;
      omask[oy * ow + ox] = 1;
      const pr = r / cov, pg = g / cov, pb = b / cov;
      if (Math.max(pr, pg, pb) - Math.min(pr, pg, pb) > 40) { sr += pr; sg += pg; sb += pb; sn++; }
    }
  }

  if (pad) {
    // sticker outline: white ring + soft dark rim so the doodle reads on any background
    const ring = dilate(omask, ow, oh, 3);
    const rim = dilate(omask, ow, oh, 4);
    for (let i = 0; i < omask.length; i++) {
      if (omask[i]) continue;
      const o = i * 4;
      if (ring[i]) { out[o] = 255; out[o + 1] = 255; out[o + 2] = 255; out[o + 3] = 255; }
      else if (rim[i]) { out[o] = 30; out[o + 1] = 30; out[o + 2] = 40; out[o + 3] = 110; }
    }
  }

  const hex = (v) => Math.round(v).toString(16).padStart(2, '0');
  const color = sn > 10 ? `#${hex(sr / sn)}${hex(sg / sn)}${hex(sb / sn)}` : '#555566';
  return { ok: true, image: { width: ow, height: oh, data: out }, coverage, color };
}
