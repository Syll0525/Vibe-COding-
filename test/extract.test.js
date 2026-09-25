import test from 'node:test';
import assert from 'node:assert/strict';
import { extractCharacter } from '../shared/extract.js';

/** Paper photo with a slight lighting gradient, a closed pen outline and a blue scribble inside. */
function fakePhoto({ w = 240, h = 200, withTableEdge = false } = {}) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const shade = 235 - x * 0.15; // uneven lighting
      data[i] = shade; data[i + 1] = shade - 4; data[i + 2] = shade - 12; data[i + 3] = 255;
      if (withTableEdge && y > h - 18) { data[i] = 90; data[i + 1] = 60; data[i + 2] = 40; }
      const d = Math.hypot(x - 120, y - 95);
      if (d > 40 && d < 44) { data[i] = 25; data[i + 1] = 25; data[i + 2] = 30; }       // outline
      if (Math.abs(x - 120) < 10 && Math.abs(y - 95) < 10) { data[i] = 40; data[i + 1] = 90; data[i + 2] = 220; } // blue
    }
  }
  return { width: w, height: h, data };
}

test('extracts a closed drawing as an opaque sticker including its interior', () => {
  const res = extractCharacter(fakePhoto(), { maxSize: 200 });
  assert.equal(res.ok, true);
  const { width, height, data } = res.image;
  // circle diameter 88 + outline padding
  assert.ok(width >= 88 && width <= 104, `width ${width}`);
  assert.ok(height >= 88 && height <= 104, `height ${height}`);
  const px = (x, y) => data[(y * width + x) * 4 + 3];
  assert.equal(px(0, 0), 0, 'corner is transparent');
  assert.equal(px(width >> 1, height >> 1), 255, 'centre (inside the outline) is opaque');
  const c = ((height >> 1) * width + (width >> 1)) * 4;
  assert.ok(data[c + 2] > data[c], 'blue colouring survives');
  assert.match(res.color, /^#[0-9a-f]{6}$/);
});

test('ignores a table edge touching the photo border', () => {
  const res = extractCharacter(fakePhoto({ withTableEdge: true }), { maxSize: 200 });
  assert.equal(res.ok, true);
  assert.ok(res.image.height <= 104, `height ${res.image.height}`);
});

test('reports failure on a blank page', () => {
  const w = 100, h = 100;
  const data = new Uint8ClampedArray(w * h * 4).fill(240);
  const res = extractCharacter({ width: w, height: h, data });
  assert.equal(res.ok, false);
  assert.ok(res.reason);
});

test('downscales large drawings to maxSize', () => {
  const res = extractCharacter(fakePhoto(), { maxSize: 64 });
  assert.ok(res.image.width <= 64 && res.image.height <= 64);
});
