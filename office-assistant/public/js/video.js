// In-browser video editor: trim, reframe for Reels/TikTok/YouTube, filters, fades,
// timed text overlays and a watermark, exported with MediaRecorder. Nothing is uploaded;
// only the text brief goes to the server when Maya writes captions.

const $ = (id) => document.getElementById(id);
const FONT = 'Poppins, "Segoe UI", system-ui, sans-serif';

const OUTPUT = { '9:16': [720, 1280], '1:1': [1080, 1080], '4:5': [864, 1080], '16:9': [1280, 720] };
const FILTERS = {
  none: 'none',
  vivid: 'saturate(1.45) contrast(1.1)',
  warm: 'sepia(0.25) saturate(1.3) hue-rotate(-10deg)',
  cool: 'saturate(1.1) hue-rotate(12deg) brightness(1.03)',
  bw: 'grayscale(1) contrast(1.15)',
  vintage: 'sepia(0.5) contrast(0.9) brightness(1.05)',
};
const FADE = 0.6;

function pickMime() {
  const options = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  return options.find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
}

function wrap(ctx, text, maxW) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}

export function initVideo({ toast, setMaya }) {
  const video = document.createElement('video');
  video.playsInline = true;
  video.preload = 'auto';
  video.crossOrigin = 'anonymous';
  video.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:-10px;top:-10px';
  document.body.append(video);

  const canvas = $('videoCanvas');
  const ctx = canvas.getContext('2d');
  const s = { start: 0, end: 0, overlays: [], exporting: false, audio: null };

  const opts = () => ({
    aspect: $('vAspect').value, fit: $('vFit').value, speed: Number($('vSpeed').value),
    filter: FILTERS[$('vFilter').value] || 'none', fade: $('vFade').checked, mark: $('vMark').value.trim(),
  });

  function sizeCanvas() {
    const [W, H] = OUTPUT[opts().aspect];
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
  }

  function drawFrame() {
    const o = opts();
    const W = canvas.width, H = canvas.height;
    const vw = video.videoWidth, vh = video.videoHeight;
    ctx.save();
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    if (vw && vh) {
      const coverS = Math.max(W / vw, H / vh);
      if (o.fit === 'contain') {
        ctx.filter = 'blur(24px) brightness(0.55)';
        ctx.drawImage(video, (W - vw * coverS) / 2, (H - vh * coverS) / 2, vw * coverS, vh * coverS);
        const cs = Math.min(W / vw, H / vh);
        ctx.filter = o.filter;
        ctx.drawImage(video, (W - vw * cs) / 2, (H - vh * cs) / 2, vw * cs, vh * cs);
      } else {
        ctx.filter = o.filter;
        ctx.drawImage(video, (W - vw * coverS) / 2, (H - vh * coverS) / 2, vw * coverS, vh * coverS);
      }
    }
    ctx.filter = 'none';

    const t = video.currentTime - s.start;
    const len = s.end - s.start;
    const u = Math.min(W, H) / 100;

    for (const ov of s.overlays) {
      if (!ov.text || t < ov.start || t > ov.end) continue;
      const pop = Math.min(1, (t - ov.start) / 0.25);
      const scale = 0.85 + 0.15 * pop;
      const size = Math.round(u * 6.2);
      ctx.font = `800 ${size}px ${FONT}`;
      const lines = wrap(ctx, ov.text, W * 0.8);
      const lh = size * 1.25;
      const boxW = Math.max(...lines.map((l) => ctx.measureText(l).width)) + u * 6;
      const boxH = lines.length * lh + u * 3;
      const cy = ov.position === 'top' ? H * 0.14 : ov.position === 'center' ? H * 0.5 : H * 0.78;
      ctx.save();
      ctx.globalAlpha = pop;
      ctx.translate(W / 2, cy);
      ctx.scale(scale, scale);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.beginPath(); ctx.roundRect(-boxW / 2, -boxH / 2, boxW, boxH, u * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      lines.forEach((l, i) => ctx.fillText(l, 0, -boxH / 2 + u * 1.5 + lh * (i + 0.5)));
      ctx.restore();
    }

    if (o.mark) {
      ctx.font = `700 ${Math.round(u * 3.2)}px ${FONT}`;
      ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = u;
      ctx.fillText(o.mark, W - u * 4, H - u * 4);
      ctx.shadowColor = 'transparent';
    }

    if (o.fade && len > FADE * 2) {
      const a = t < FADE ? 1 - t / FADE : t > len - FADE ? (t - (len - FADE)) / FADE : 0;
      if (a > 0) { ctx.fillStyle = `rgba(0,0,0,${Math.min(1, a)})`; ctx.fillRect(0, 0, W, H); }
    }
    ctx.restore();
  }

  function loop() {
    if (video.readyState >= 2) {
      sizeCanvas();
      if (!video.paused && video.currentTime >= s.end - 0.02) {
        if (s.exporting) s.onExportEnd?.();
        else { video.pause(); video.currentTime = s.start; updatePlay(); }
      }
      drawFrame();
      $('vTime').textContent = `${Math.max(0, video.currentTime - s.start).toFixed(1)}s / ${(s.end - s.start).toFixed(1)}s`;
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  function ensureAudio() {
    if (s.audio) { s.audio.ctx.resume(); return s.audio; }
    const actx = new AudioContext();
    const src = actx.createMediaElementSource(video);
    const dest = actx.createMediaStreamDestination();
    src.connect(actx.destination);
    src.connect(dest);
    s.audio = { ctx: actx, dest };
    return s.audio;
  }

  function updatePlay() { $('vPlay').textContent = video.paused ? '▶ Play' : '⏸ Pause'; }

  function syncTrimLabels() {
    $('vStartLabel').textContent = `${s.start.toFixed(1)}s`;
    $('vEndLabel').textContent = `${s.end.toFixed(1)}s`;
  }

  // --- overlays list -------------------------------------------------------

  function renderOverlays() {
    const list = $('overlayList');
    list.innerHTML = '';
    s.overlays.forEach((ov, i) => {
      const row = document.createElement('div');
      row.className = 'overlay';
      row.innerHTML = `
        <input type="text" aria-label="Text" placeholder="Text on screen">
        <input type="number" aria-label="Start second" min="0" step="0.1">
        <input type="number" aria-label="End second" min="0" step="0.1">
        <select aria-label="Position"><option value="top">Top</option><option value="center">Middle</option><option value="bottom">Bottom</option></select>
        <button aria-label="Remove text">✕</button>`;
      const [text, start, end] = row.querySelectorAll('input');
      const pos = row.querySelector('select');
      text.value = ov.text; start.value = ov.start; end.value = ov.end; pos.value = ov.position;
      text.addEventListener('input', () => { ov.text = text.value; });
      start.addEventListener('input', () => { ov.start = Number(start.value) || 0; });
      end.addEventListener('input', () => { ov.end = Number(end.value) || 0; });
      pos.addEventListener('change', () => { ov.position = pos.value; });
      row.querySelector('button').addEventListener('click', () => { s.overlays.splice(i, 1); renderOverlays(); });
      list.append(row);
    });
  }

  $('addOverlay').addEventListener('click', () => {
    const t = Math.max(0, video.currentTime - s.start);
    s.overlays.push({ text: 'Your text here', start: +t.toFixed(1), end: +Math.min(s.end - s.start, t + 3).toFixed(1), position: 'bottom' });
    renderOverlays();
  });

  // --- loading & controls ----------------------------------------------------

  $('vFile').addEventListener('change', () => {
    const file = $('vFile').files[0];
    if (!file) return;
    if (video.src) URL.revokeObjectURL(video.src);
    video.src = URL.createObjectURL(file);
    $('vDownload').hidden = true;
  });

  video.addEventListener('loadedmetadata', async () => {
    // Clips recorded in a browser (WebM) often report Infinity until the end is reached.
    if (!Number.isFinite(video.duration)) {
      video.currentTime = 1e9;
      await new Promise((resolve) => {
        const check = () => { if (Number.isFinite(video.duration)) { video.removeEventListener('durationchange', check); resolve(); } };
        video.addEventListener('durationchange', check);
      });
      video.currentTime = 0;
    }
    const d = video.duration;
    s.start = 0; s.end = d;
    for (const id of ['vStart', 'vEnd']) { $(id).max = d.toFixed(1); }
    $('vStart').value = 0; $('vEnd').value = d.toFixed(1);
    syncTrimLabels();
    $('videoStudio').hidden = false;
    setMaya('video', 'Nice clip! 🎬');
  });
  video.addEventListener('play', updatePlay);
  video.addEventListener('pause', updatePlay);

  $('vStart').addEventListener('input', () => {
    s.start = Math.min(Number($('vStart').value), s.end - 0.5);
    $('vStart').value = s.start;
    video.currentTime = s.start;
    syncTrimLabels();
  });
  $('vEnd').addEventListener('input', () => {
    s.end = Math.max(Number($('vEnd').value), s.start + 0.5);
    $('vEnd').value = s.end;
    video.currentTime = Math.max(s.start, s.end - 0.05);
    syncTrimLabels();
  });
  $('vSpeed').addEventListener('change', () => { video.playbackRate = Number($('vSpeed').value); });

  $('vPlay').addEventListener('click', () => {
    if (s.exporting) return;
    ensureAudio();
    if (video.paused) {
      if (video.currentTime < s.start || video.currentTime >= s.end - 0.05) video.currentTime = s.start;
      video.playbackRate = Number($('vSpeed').value);
      video.play();
    } else video.pause();
  });

  // --- AI captions -------------------------------------------------------------

  $('vPlan').addEventListener('click', async () => {
    const btn = $('vPlan');
    btn.disabled = true; btn.textContent = '⏳ Writing…';
    setMaya('video', 'Writing captions… ✍️', true);
    try {
      const res = await fetch('/api/marketing/video-plan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brief: $('vBrief').value, duration: s.end - s.start, platform: $('vAspect').value === '16:9' ? 'youtube' : 'reels/tiktok' }),
      });
      const plan = await res.json();
      s.overlays = plan.overlays.map((o) => ({ ...o }));
      renderOverlays();
      const box = $('vCaptionBox');
      box.hidden = false;
      box.textContent = `📝 Caption\n${plan.caption}\n\n${plan.hashtags.join(' ')}\n\n🎵 Music: ${plan.musicMood}\n💡 ${plan.tips.join('\n💡 ')}`;
      setMaya('video', 'Captions ready! ✅');
    } catch (err) {
      toast(`Could not write captions: ${err.message}`);
      setMaya('video', 'Oops, try again 😕');
    } finally {
      btn.disabled = false; btn.textContent = '✨ Maya, write captions';
    }
  });

  // --- export --------------------------------------------------------------------

  $('vExport').addEventListener('click', async () => {
    if (s.exporting) return;
    const mime = pickMime();
    if (!mime || !canvas.captureStream) { toast('This browser cannot export video. Please use Google Chrome.'); return; }
    const btn = $('vExport');
    s.exporting = true;
    btn.disabled = true; btn.textContent = '⏳ Exporting… keep this tab open';
    $('vProgress').hidden = false; $('vProgress').value = 0;
    $('vDownload').hidden = true;
    setMaya('video', 'Rendering your video… 🎞️', true);

    video.pause();
    video.playbackRate = Number($('vSpeed').value);
    video.currentTime = s.start;
    await new Promise((r) => video.addEventListener('seeked', r, { once: true }));

    const stream = canvas.captureStream(30);
    try { ensureAudio().dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t)); } catch { /* no audio track */ }
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const finished = new Promise((r) => { rec.onstop = r; });

    const progress = setInterval(() => { $('vProgress').value = Math.min(1, (video.currentTime - s.start) / (s.end - s.start)); }, 200);
    const stop = () => { if (rec.state !== 'inactive') { video.pause(); rec.stop(); } };
    s.onExportEnd = stop;
    video.addEventListener('ended', stop, { once: true });

    rec.start(250);
    await video.play();
    await finished;
    clearInterval(progress);
    s.onExportEnd = null;
    s.exporting = false;

    const type = mime.split(';')[0];
    const blob = new Blob(chunks, { type });
    const a = $('vDownload');
    if (a.href) URL.revokeObjectURL(a.href);
    a.href = URL.createObjectURL(blob);
    a.download = `maya-edit-${$('vAspect').value.replace(':', 'x')}.${type === 'video/mp4' ? 'mp4' : 'webm'}`;
    a.hidden = false;
    $('vProgress').value = 1;
    btn.disabled = false; btn.textContent = '🎬 Export video';
    video.currentTime = s.start;
    setMaya('video', 'Video ready! 🎉');
    toast(`Exported ${(blob.size / 1e6).toFixed(1)} MB. Click Download to save it.`);
  });
}
