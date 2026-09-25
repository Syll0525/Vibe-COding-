// Photo → sprite on the phone, using the shared extraction pipeline.

import { extractCharacter } from '/shared/extract.js';

const WORK_SIZE = 480; // analysis resolution: fast on phones, plenty for a 160px sprite

/** Load a File/Blob into a canvas no larger than WORK_SIZE (EXIF orientation respected). */
export async function fileToCanvas(file) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    bitmap = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }
  const w = bitmap.width, h = bitmap.height;
  const s = Math.min(1, WORK_SIZE / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * s); c.height = Math.round(h * s);
  c.getContext('2d').drawImage(bitmap, 0, 0, c.width, c.height);
  return c;
}

/** Run extraction on a source canvas and draw the result into `out`. */
export function extractToCanvas(src, out, sensitivity) {
  const ctx = src.getContext('2d', { willReadFrequently: true });
  const img = ctx.getImageData(0, 0, src.width, src.height);
  const res = extractCharacter(img, { sensitivity, maxSize: 160 });
  if (!res.ok) return res;
  out.width = res.image.width; out.height = res.image.height;
  out.getContext('2d').putImageData(new ImageData(res.image.data, res.image.width, res.image.height), 0, 0);
  return res;
}

/** Finger-drawing pad (for kids without paper, or for testing on desktop). */
export function setupDrawPad(canvas, swatchBox) {
  const ctx = canvas.getContext('2d');
  const colors = ['#1b1b2f', '#ff5a5f', '#ffb400', '#1fb5ad', '#3a86ff', '#8ac926', '#f15bb5', '#8d5a3b'];
  let color = colors[0];
  let drawing = false;
  let last = null;
  const clear = () => { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); };
  clear();

  for (const c of colors) {
    const b = document.createElement('button');
    b.style.background = c;
    b.setAttribute('aria-label', `colour ${c}`);
    if (c === color) b.classList.add('on');
    b.onclick = () => { color = c; swatchBox.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); };
    swatchBox.append(b);
  }

  const pos = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * canvas.width, y: ((e.clientY - r.top) / r.height) * canvas.height };
  };
  canvas.addEventListener('pointerdown', (e) => { drawing = true; last = pos(e); canvas.setPointerCapture(e.pointerId); dot(last); });
  canvas.addEventListener('pointermove', (e) => {
    if (!drawing) return;
    const p = pos(e);
    ctx.strokeStyle = color; ctx.lineWidth = color === colors[0] ? 7 : 14; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    last = p;
  });
  const end = () => { drawing = false; };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  function dot(p) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill(); }
  return { clear };
}
