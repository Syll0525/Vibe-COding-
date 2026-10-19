// Social media design studio. Maya writes three concepts (copy + palette + layout);
// this file draws them on a canvas at the platform's real size so they can be
// downloaded as PNGs and posted straight away.

const $ = (id) => document.getElementById(id);

export const SIZES = {
  'instagram-post': [1080, 1080],
  'instagram-story': [1080, 1920],
  'tiktok-cover': [1080, 1920],
  facebook: [1200, 630],
  linkedin: [1200, 627],
  x: [1600, 900],
  'youtube-thumbnail': [1280, 720],
};

const PLATFORM_SITES = {
  'instagram-post': 'instagram', 'instagram-story': 'instagram', 'tiktok-cover': 'tiktok studio',
  facebook: 'meta business suite', linkedin: 'linkedin', x: 'x', 'youtube-thumbnail': 'youtube studio',
};

const FONT = 'Poppins, "Segoe UI", system-ui, sans-serif';

// --- drawing helpers -------------------------------------------------------

function wrap(ctx, text, maxW) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

/** Largest font size (<= start) at which text fits in the box. */
function fit(ctx, text, maxW, maxH, start, weight, lh = 1.08) {
  for (let size = start; size > 10; size -= 2) {
    ctx.font = `${weight} ${size}px ${FONT}`;
    const lines = wrap(ctx, text, maxW);
    const widest = Math.max(0, ...lines.map((l) => ctx.measureText(l).width));
    if (lines.length * size * lh <= maxH && widest <= maxW) return { size, lines, lh };
  }
  ctx.font = `${weight} 10px ${FONT}`;
  return { size: 10, lines: wrap(ctx, text, maxW), lh };
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function cover(ctx, img, x, y, w, h) {
  const s = Math.max(w / img.width, h / img.height);
  const iw = img.width * s, ih = img.height * s;
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
  ctx.restore();
}

function hexToRgba(hex, a) {
  const m = String(hex).replace('#', '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return `rgba(0,0,0,${a})`;
  return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${a})`;
}

function luminance(hex) {
  const m = String(hex).replace('#', '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return 0;
  const [r, g, b] = m.slice(1).map((v) => { const c = parseInt(v, 16) / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const inkOn = (hex) => (luminance(hex) > 0.35 ? '#111111' : '#ffffff');

/**
 * Headline + supporting line + CTA button inside a box.
 * @returns bottom y of what was drawn
 */
function textBlock(ctx, d, box, { align = 'center', color, ctaBg, ctaInk, upper = false, shadow = false, u }) {
  const { x, y, w, h } = box;
  const ax = align === 'center' ? x + w / 2 : x;
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  if (shadow) { ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = u * 1.5; }

  const head = upper ? d.headline.toUpperCase() : d.headline;
  const H = fit(ctx, head, w, h * 0.58, Math.round(u * 13), 800);
  ctx.fillStyle = color;
  ctx.font = `800 ${H.size}px ${FONT}`;
  let cy = y;
  for (const l of H.lines) { ctx.fillText(l, ax, cy); cy += H.size * H.lh; }

  cy += u * 2.2;
  const S = fit(ctx, d.subheadline, w, h * 0.22, Math.round(u * 5), 500, 1.3);
  ctx.font = `500 ${S.size}px ${FONT}`;
  ctx.globalAlpha = 0.9;
  for (const l of S.lines) { ctx.fillText(l, ax, cy); cy += S.size * S.lh; }
  ctx.globalAlpha = 1;
  ctx.shadowColor = 'transparent';

  if (d.cta) {
    cy += u * 3;
    ctx.font = `700 ${Math.round(u * 4.2)}px ${FONT}`;
    const tw = ctx.measureText(d.cta).width;
    const bw = tw + u * 9, bh = u * 9.5;
    const bx = align === 'center' ? x + (w - bw) / 2 : x;
    ctx.fillStyle = ctaBg;
    roundRect(ctx, bx, cy, bw, bh, bh / 2); ctx.fill();
    ctx.fillStyle = ctaInk;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(d.cta, bx + bw / 2, cy + bh / 2 + 1);
    cy += bh;
  }
  return cy;
}

function brandTag(ctx, brand, x, y, color, u, align = 'left') {
  if (!brand) return;
  ctx.font = `700 ${Math.round(u * 3.4)}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = color;
  ctx.fillText(brand.toUpperCase(), x, y);
}

/** Draws one design at W×H. photo is an optional HTMLImageElement. */
export function drawDesign(ctx, W, H, d, { photo = null, brand = '' } = {}) {
  const p = d.palette;
  const u = Math.min(W, H) / 100;
  const pad = u * 8;
  const wide = W / H > 1.3;
  ctx.save();
  ctx.clearRect(0, 0, W, H);
  ctx.textBaseline = 'top';

  switch (d.layout) {
    case 'split': {
      ctx.fillStyle = p.bg; ctx.fillRect(0, 0, W, H);
      const img = H > W * 1.2
        ? { x: 0, y: 0, w: W, h: H * 0.48 }
        : { x: 0, y: 0, w: W * 0.48, h: H };
      if (photo) cover(ctx, photo, img.x, img.y, img.w, img.h);
      else {
        ctx.fillStyle = p.bg2; ctx.fillRect(img.x, img.y, img.w, img.h);
        ctx.font = `${Math.min(img.w, img.h) * 0.45}px ${FONT}`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(d.emoji || '⭐', img.x + img.w / 2, img.y + img.h / 2);
      }
      ctx.fillStyle = p.accent;
      if (img.w === W) ctx.fillRect(0, img.h - u, W, u * 2); else ctx.fillRect(img.w - u, 0, u * 2, H);
      const tb = img.w === W
        ? { x: pad, y: img.h + pad, w: W - pad * 2, h: H - img.h - pad * 2.6 }
        : { x: img.w + pad, y: pad * 1.6, w: W - img.w - pad * 2, h: H - pad * 3.2 };
      textBlock(ctx, d, tb, { align: 'left', color: p.text, ctaBg: p.accent, ctaInk: inkOn(p.accent), u });
      brandTag(ctx, brand, tb.x, H - pad * 0.6, p.accent, u);
      break;
    }
    case 'minimal': {
      ctx.fillStyle = p.bg; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = p.accent; ctx.lineWidth = u * 0.6;
      ctx.strokeRect(u * 4, u * 4, W - u * 8, H - u * 8);
      if (photo) {
        const s = wide ? H * 0.62 : W * 0.38;
        ctx.save(); ctx.beginPath(); ctx.arc(W - pad - s / 2, pad + s / 2 + u * 3, s / 2, 0, Math.PI * 2); ctx.clip();
        cover(ctx, photo, W - pad - s, pad + u * 3, s, s); ctx.restore();
      } else {
        ctx.font = `${u * 16}px ${FONT}`; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
        ctx.fillText(d.emoji || '⭐', W - pad, pad);
      }
      brandTag(ctx, brand, pad, pad + u * 3, p.accent, u);
      const tw = wide && photo ? W * 0.55 : W - pad * 2;
      const top = wide ? H * 0.28 : H * 0.36;
      const bottom = textBlock(ctx, d, { x: pad, y: top, w: tw, h: H - top - pad * 1.4 }, { align: 'left', color: p.text, ctaBg: p.text, ctaInk: p.bg, u });
      ctx.fillStyle = p.accent; ctx.fillRect(pad, Math.min(bottom + u * 4, H - pad), u * 14, u * 1.2);
      break;
    }
    case 'gradient': {
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, p.bg); g.addColorStop(1, p.bg2);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      [[0.15, 0.2, 18], [0.85, 0.15, 26], [0.8, 0.85, 20], [0.1, 0.9, 12]].forEach(([cx, cy, r]) => { ctx.beginPath(); ctx.arc(W * cx, H * cy, u * r, 0, Math.PI * 2); ctx.fill(); });
      let top = pad;
      if (photo && !wide) {
        const s = Math.min(W, H) * 0.36;
        ctx.save(); ctx.beginPath(); ctx.arc(W / 2, pad + s / 2, s / 2, 0, Math.PI * 2); ctx.clip();
        cover(ctx, photo, W / 2 - s / 2, pad, s, s); ctx.restore();
        ctx.strokeStyle = p.accent; ctx.lineWidth = u; ctx.beginPath(); ctx.arc(W / 2, pad + s / 2, s / 2, 0, Math.PI * 2); ctx.stroke();
        top = pad + s + u * 5;
      } else {
        ctx.font = `${u * 12}px ${FONT}`; ctx.textAlign = 'center';
        ctx.fillText(d.emoji || '⭐', W / 2, pad);
        top = pad + u * 17;
      }
      textBlock(ctx, d, { x: pad, y: top, w: W - pad * 2, h: H - top - pad * 1.6 }, { align: 'center', color: p.text, ctaBg: p.accent, ctaInk: inkOn(p.accent), shadow: true, u });
      brandTag(ctx, brand, W / 2, H - pad * 0.6, p.text, u, 'center');
      break;
    }
    case 'frame': {
      if (photo) cover(ctx, photo, 0, 0, W, H);
      else {
        ctx.fillStyle = p.bg2; ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = 0.18; ctx.font = `${u * 10}px ${FONT}`; ctx.textAlign = 'center';
        for (let yy = 0; yy < H; yy += u * 18) for (let xx = (yy / (u * 18)) % 2 ? u * 9 : 0; xx < W + u * 18; xx += u * 18) ctx.fillText(d.emoji || '⭐', xx, yy);
        ctx.globalAlpha = 1;
      }
      const g = ctx.createLinearGradient(0, H * 0.25, 0, H);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, hexToRgba(p.bg, 0.92));
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = u * 0.7;
      ctx.strokeRect(u * 4, u * 4, W - u * 8, H - u * 8);
      const bh = wide ? H * 0.62 : H * 0.48;
      textBlock(ctx, d, { x: pad, y: H - bh - pad * 0.4, w: W * (wide ? 0.6 : 1) - pad * (wide ? 1 : 2), h: bh - pad }, { align: 'left', color: '#ffffff', ctaBg: p.accent, ctaInk: inkOn(p.accent), shadow: true, u });
      brandTag(ctx, brand, W - pad, pad + u * 3, '#ffffff', u, 'right');
      break;
    }
    default: { // bold
      ctx.fillStyle = p.bg; ctx.fillRect(0, 0, W, H);
      if (photo) {
        cover(ctx, photo, 0, 0, W, H);
        ctx.fillStyle = hexToRgba(p.bg, 0.72); ctx.fillRect(0, 0, W, H);
      }
      ctx.fillStyle = p.bg2;
      ctx.beginPath(); ctx.moveTo(W * 0.55, 0); ctx.lineTo(W, 0); ctx.lineTo(W, H * 0.45); ctx.closePath(); ctx.globalAlpha = 0.85; ctx.fill();
      ctx.beginPath(); ctx.moveTo(0, H * 0.7); ctx.lineTo(0, H); ctx.lineTo(W * 0.4, H); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
      ctx.fillStyle = p.accent; ctx.beginPath(); ctx.arc(W - u * 14, u * 14, u * 8, 0, Math.PI * 2); ctx.fill();
      ctx.font = `${u * 8}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(d.emoji || '⭐', W - u * 14, u * 14.5);
      const top = wide ? pad : H * 0.24;
      textBlock(ctx, d, { x: pad, y: top, w: W - pad * (wide ? 6 : 2), h: H - top - pad * 1.6 }, { align: wide ? 'left' : 'center', color: p.text, ctaBg: p.accent, ctaInk: inkOn(p.accent), upper: true, u });
      brandTag(ctx, brand, wide ? pad : W / 2, H - pad * 0.6, p.text, u, wide ? 'left' : 'center');
    }
  }
  ctx.restore();
}

// --- studio UI ---------------------------------------------------------------

export function initDesign({ toast, setMaya, runTask }) {
  let designs = [];
  let current = 0;
  let photo = null;

  const platform = () => $('dPlatform').value;
  const brand = () => $('dBrand').value.trim();

  function renderMain() {
    const d = designs[current];
    if (!d) return;
    const [W, H] = SIZES[platform()];
    const c = $('designCanvas');
    c.width = W; c.height = H;
    drawDesign(c.getContext('2d'), W, H, d, { photo, brand: brand() });
  }

  function renderCards() {
    const [W, H] = SIZES[platform()];
    const scale = 260 / Math.max(W, H);
    $('designCards').innerHTML = '';
    designs.forEach((d, i) => {
      const b = document.createElement('button');
      b.setAttribute('aria-pressed', String(i === current));
      b.title = `Option ${i + 1}: ${d.layout}`;
      const c = document.createElement('canvas');
      c.width = Math.round(W * scale); c.height = Math.round(H * scale);
      const ctx = c.getContext('2d');
      ctx.scale(scale, scale);
      drawDesign(ctx, W, H, d, { photo, brand: brand() });
      b.append(c);
      b.addEventListener('click', () => { current = i; fillEditor(); renderCards(); renderMain(); });
      $('designCards').append(b);
    });
  }

  function fillEditor() {
    const d = designs[current];
    $('eHeadline').value = d.headline;
    $('eSub').value = d.subheadline;
    $('eCta').value = d.cta;
    $('eLayout').value = d.layout;
    $('eBg').value = d.palette.bg;
    $('eAccent').value = d.palette.accent;
    $('eText').value = d.palette.text;
    $('eCaption').value = `${d.caption}\n\n${d.hashtags.join(' ')}`;
  }

  function fromEditor() {
    const d = designs[current];
    if (!d) return;
    d.headline = $('eHeadline').value;
    d.subheadline = $('eSub').value;
    d.cta = $('eCta').value;
    d.layout = $('eLayout').value;
    d.palette = { ...d.palette, bg: $('eBg').value, accent: $('eAccent').value, text: $('eText').value };
    renderMain();
    renderCards();
  }

  ['eHeadline', 'eSub', 'eCta', 'eLayout', 'eBg', 'eAccent', 'eText'].forEach((id) => $(id).addEventListener('input', fromEditor));
  $('dPlatform').addEventListener('change', () => { if (designs.length) { renderCards(); renderMain(); } });
  $('dBrand').addEventListener('input', () => { if (designs.length) { renderCards(); renderMain(); } });

  $('dPhoto').addEventListener('change', () => {
    const file = $('dPhoto').files[0];
    if (!file) { photo = null; return; }
    const img = new Image();
    img.onload = () => { photo = img; if (designs.length) { renderCards(); renderMain(); } };
    img.src = URL.createObjectURL(file);
  });

  $('makeDesigns').addEventListener('click', async () => {
    const btn = $('makeDesigns');
    btn.disabled = true; btn.textContent = '⏳ Maya is designing…';
    setMaya('design', 'Sketching ideas… ✏️', true);
    try {
      const res = await fetch('/api/marketing/designs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brief: $('dBrief').value, brand: brand(), platform: platform(), tone: $('dTone').value }),
      });
      const data = await res.json();
      designs = data.designs;
      current = 0;
      await document.fonts.ready;
      $('designStudio').hidden = false;
      fillEditor(); renderCards(); renderMain();
      setMaya('design', 'Pick your favourite! 😍');
      if (data.source === 'templates') toast('Made with built-in templates. Add an API key for AI-written copy.');
    } catch (err) {
      toast(`Could not design: ${err.message}`);
      setMaya('design', 'Oops, try again 😕');
    } finally {
      btn.disabled = false; btn.textContent = '✨ Design 3 options';
    }
  });

  $('downloadDesign').addEventListener('click', () => {
    const name = `${(brand() || 'post').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${platform()}-${current + 1}.png`;
    $('designCanvas').toBlob((blob) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = name; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }, 'image/png');
  });

  $('copyCaption').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('eCaption').value); toast('Caption copied 📋'); }
    catch { $('eCaption').select(); toast('Press Ctrl+C to copy'); }
  });

  $('openPlatform').addEventListener('click', () => runTask(`open ${PLATFORM_SITES[platform()] || 'instagram'}`));
}
