// Projector / big-screen client: renders the shared Kuching world and every player.

import { COLLECTIBLES, ABILITY_INFO, SNAPSHOT_HZ } from '/shared/constants.js';
import { WORLD_W, WORLD_H } from '/shared/map.js';
import { buildGround, buildProps, drawWater, LABELS, CAT_SPOTS } from './world.js';
import { CharacterView } from './characters.js';
import { Effects } from './fx.js';
import { unlock, sfx, setMusic, setMuted, isMuted } from './audio.js';

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const ctx = canvas.getContext('2d');
const mini = $('minimap');
const mctx = mini.getContext('2d');

// ------------------------------------------------------------------ static scene
const ground = buildGround();
const props = buildProps();
const miniGround = document.createElement('canvas');
miniGround.width = mini.width; miniGround.height = mini.height;
miniGround.getContext('2d').drawImage(ground, 0, 0, mini.width, mini.height);

// ------------------------------------------------------------------ state
const views = new Map();        // id -> CharacterView
let snaps = [];                 // recent snapshots for interpolation
let clockOffset = null;         // server sim time - local time
let items = [];
let parties = [];
let currentEvent = null;
let roomCode = null;
const fx = new Effects();
const cam = { x: WORLD_W / 2, y: WORLD_H / 2, zoom: 0.4 };

// ------------------------------------------------------------------ networking
const socket = io({ transports: ['websocket', 'polling'] });
const params = new URLSearchParams(location.search);

socket.on('connect', () => {
  $('conn-status').textContent = 'Connected ✓';
  const existing = params.get('room') || sessionStorage.getItem('dk-room');
  if (existing) {
    socket.emit('display:watch', { code: existing }, (res) => (res.ok ? init(res.state) : createRoom()));
  } else createRoom();
});
socket.on('disconnect', () => { $('conn-status').textContent = 'Reconnecting…'; toast('📡 Reconnecting to server…'); });

function createRoom() { socket.emit('display:create', {}, (res) => res.ok && init(res.state)); }

async function init(state) {
  roomCode = state.code;
  sessionStorage.setItem('dk-room', roomCode);
  history.replaceState(null, '', `/display?room=${roomCode}`);
  $('room-code').textContent = roomCode;
  const url = await joinUrl(roomCode);
  $('join-url').textContent = url.replace(/^https?:\/\//, '');
  $('qr').src = `/api/qr?text=${encodeURIComponent(url)}`;

  views.clear();
  for (const p of state.players) views.set(p.id, new CharacterView(p));
  snaps = [];
  clockOffset = null;
  onSnap(state.snapshot);
  $('chat-log').innerHTML = '';
  for (const m of state.chat) addChat(m, false);
  setEvent(state.event);
}

async function joinUrl(code) {
  let origin = location.origin;
  if (['localhost', '127.0.0.1', '::1'].includes(location.hostname)) {
    try {
      const info = await (await fetch('/api/info')).json();
      if (info.ips[0]) origin = `${location.protocol}//${info.ips[0]}:${location.port || info.port}`;
    } catch { /* keep localhost */ }
  }
  return `${origin}/play?room=${code}`;
}

socket.on('snap', onSnap);
function onSnap(s) {
  const localT = performance.now() / 1000;
  const off = s.t - localT;
  clockOffset = clockOffset === null ? off : Math.max(off, clockOffset - 0.002); // track the freshest
  snaps.push(s);
  if (snaps.length > 30) snaps.shift();
  if (s.items) items = s.items.map(([id, type, x, y]) => ({ id, type, x, y }));
  if (s.board) renderBoard(s.board);
  if (s.parties) parties = s.parties;
  if (s.event !== undefined) updateEventTimer(s.event);
}

socket.on('player:joined', (p) => {
  views.set(p.id, new CharacterView(p));
  fx.burst(p.x, p.y - 40, { count: 24 });
  sfx.fanfare();
});
socket.on('player:left', ({ id }) => views.delete(id));

socket.on('chat', (m) => { addChat(m, true); views.get(m.id)?.say(m.text); sfx.chat(); });
socket.on('toast', ({ text }) => toast(text));
socket.on('event', (e) => {
  if (e.state === 'start') { setEvent(e); sfx.fanfare(); toast(`🎉 ${e.title} ${e.text}`); }
  else {
    setEvent(null);
    const r = e.ranking || [];
    toast(r.length ? `🏆 ${e.title} winner: ${r[0].name} (${r[0].score})!` : `${e.title} is over!`);
    if (r[0]) { const s = latestState(r[0].id); if (s) fx.burst(s.x, s.y - 60, { count: 40, icons: ['🏆', '⭐', '🎉'] }); }
  }
});

socket.on('fx', (e) => {
  switch (e.type) {
    case 'collect': {
      const c = COLLECTIBLES[e.item];
      fx.burst(e.x, e.y - 10, { count: 8, icons: [c.icon, '✨'], speed: 120 });
      fx.text(e.x, e.y - 40, `+${c.points}`, '#ffe066');
      sfx.collect();
      break;
    }
    case 'cat':
      fx.burst(e.x, e.y - 20, { count: 16, icons: ['🐱', '💖', '✨'] });
      fx.text(e.x, e.y - 50, '+50 Cat found!', '#ffb8d9'); sfx.cat();
      break;
    case 'highfive':
      fx.burst(e.x, e.y - 50, { count: 10, icons: ['🙌', '✨'], speed: 100 }); sfx.highfive();
      break;
    case 'friend':
      fx.burst(e.x, e.y - 50, { count: 20, icons: ['💞', '💖', '🤝'] }); fx.text(e.x, e.y - 80, 'New friends!', '#ff9ff3'); sfx.friend();
      break;
    case 'splash':
      fx.burst(e.x, e.y, { count: 20, colors: ['#74b9ff', '#ffffff', '#0984e3'], speed: 200 }); fx.text(e.x, e.y - 40, 'SPLASH!', '#74b9ff'); sfx.splash();
      break;
    case 'sampan': sfx.whoosh(); break;
    case 'landmark': showCard(e); if (e.first) { fx.text(e.x ?? 0, e.y ?? 0, '+25', '#ffe066'); } sfx.landmark(); break;
    case 'ability': {
      const info = ABILITY_INFO[e.ability];
      fx.burst(e.x, e.y - 40, { count: 14, icons: [info.icon, '✨'] });
      if (e.ability === 'boombox') fx.burst(e.x, e.y - 40, { count: 16, icons: ['🎵', '🎶'], speed: 220, gravity: -40, life: 1.6 });
      if (e.ability === 'charm') fx.burst(e.x, e.y - 40, { count: 20, icons: ['💖', '💕'], speed: 200, gravity: -30, life: 1.5 });
      if (e.ability === 'superjump') sfx.jump(); else sfx.whoosh();
      break;
    }
    default: break;
  }
});

// ------------------------------------------------------------------ UI panels
function toast(text) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  $('toasts').prepend(el);
  setTimeout(() => el.remove(), 4500);
  while ($('toasts').children.length > 4) $('toasts').lastChild.remove();
}

function addChat(m, animate) {
  const el = document.createElement('div');
  el.className = 'msg';
  if (!animate) el.style.animation = 'none';
  const b = document.createElement('b');
  b.style.color = m.color; b.textContent = m.name;
  el.append(b, document.createTextNode(m.text));
  $('chat-log').append(el);
  while ($('chat-log').children.length > 12) $('chat-log').firstChild.remove();
  $('chat').classList.remove('empty');
}
$('chat').classList.add('empty');

function renderBoard(board) {
  const list = $('board-list');
  list.innerHTML = '';
  for (const p of board) {
    const li = document.createElement('li');
    const dot = document.createElement('span'); dot.className = 'dot'; dot.style.background = p.color;
    const name = document.createElement('span'); name.className = 'name'; name.textContent = p.name;
    const meta = document.createElement('span'); meta.className = 'meta';
    meta.textContent = `${p.score} ⭐ ${p.friends}💞 ${p.cats}🐱`;
    li.append(dot, name, meta);
    list.append(li);
  }
  $('empty-hint').classList.toggle('hidden', board.length > 0);
  $('join').classList.toggle('compact', board.length > 0);
}

let cardTimer = null;
function showCard(e) {
  const v = views.get(e.id);
  $('card-who').textContent = `${v ? v.name : 'Someone'} visited${e.first ? ' — new passport stamp! +25' : ''}`;
  $('card-title').textContent = `📍 ${e.name}`;
  $('card-fact').textContent = e.fact;
  $('card').classList.remove('hidden');
  clearTimeout(cardTimer);
  cardTimer = setTimeout(() => $('card').classList.add('hidden'), 7000);
}

function setEvent(e) {
  currentEvent = e;
  $('event').classList.toggle('hidden', !e);
  if (!e) return;
  $('event-title').textContent = e.kind === 'rush' ? `🍜 ${e.title}` : `💃 ${e.title}`;
  $('event-text').textContent = e.text;
  updateEventTimer(e);
}
function updateEventTimer(e) {
  if (!e) { if (currentEvent) setEvent(null); return; }
  if (!currentEvent) setEvent(e);
  $('event-bar').style.width = `${(e.remaining / e.length) * 100}%`;
}

// host controls
$('bot-add').onclick = () => socket.emit('host:bots', { action: 'add' });
$('bot-clear').onclick = () => socket.emit('host:bots', { action: 'clear' });
$('event-start').onclick = () => socket.emit('host:event', { kind: Math.random() < 0.5 ? 'rush' : 'danceoff' });
$('mute').onclick = () => { setMuted(!isMuted()); $('mute').textContent = isMuted() ? '🔇' : '🔊'; };
$('fullscreen').onclick = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.());
$('start-btn').onclick = () => { unlock(); $('start').remove(); };

// ------------------------------------------------------------------ interpolation
function latestState(id) {
  const s = snaps[snaps.length - 1];
  return s?.players.find((p) => p.id === id);
}

function interpolated() {
  if (!snaps.length) return [];
  const renderT = performance.now() / 1000 + clockOffset - 1.5 / SNAPSHOT_HZ;
  let a = snaps[0], b = snaps[snaps.length - 1];
  for (let i = snaps.length - 1; i > 0; i--) {
    if (snaps[i - 1].t <= renderT) { a = snaps[i - 1]; b = snaps[i]; break; }
  }
  const span = b.t - a.t;
  const k = span > 0 ? Math.min(1, Math.max(0, (renderT - a.t) / span)) : 1;
  const prev = new Map(a.players.map((p) => [p.id, p]));
  return b.players.map((p) => {
    const q = prev.get(p.id);
    if (!q || Math.hypot(p.x - q.x, p.y - q.y) > 200) return p; // teleports (sampan end, splash)
    return { ...p, x: q.x + (p.x - q.x) * k, y: q.y + (p.y - q.y) * k, z: q.z + (p.z - q.z) * k };
  });
}

// ------------------------------------------------------------------ camera
function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(innerWidth * dpr);
  canvas.height = Math.round(innerHeight * dpr);
}
addEventListener('resize', resize);
resize();

function updateCamera(states, dt) {
  const W = canvas.width, H = canvas.height;
  const fitAll = Math.max(W / WORLD_W, H / WORLD_H);
  let tx = WORLD_W / 2, ty = WORLD_H / 2, tz = fitAll;
  const active = states.filter((s) => !s.off);
  if (active.length) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const s of active) { minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x); minY = Math.min(minY, s.y); maxY = Math.max(maxY, s.y); }
    const pad = 420;
    tx = (minX + maxX) / 2; ty = (minY + maxY) / 2 - 30;
    tz = Math.min(W / (maxX - minX + pad * 2), H / (maxY - minY + pad * 1.4));
    tz = Math.max(fitAll, Math.min(tz, 1.5 * (W / 1920)));
  }
  const k = Math.min(1, dt * 2.2);
  cam.zoom += (tz - cam.zoom) * k;
  cam.x += (tx - cam.x) * k;
  cam.y += (ty - cam.y) * k;
  // keep the view inside the world
  const vw = W / cam.zoom, vh = H / cam.zoom;
  cam.x = Math.min(WORLD_W - vw / 2, Math.max(vw / 2, cam.x));
  cam.y = Math.min(WORLD_H - vh / 2, Math.max(vh / 2, cam.y));
  if (vw >= WORLD_W) cam.x = WORLD_W / 2;
  if (vh >= WORLD_H) cam.y = WORLD_H / 2;
  return { x: cam.x - vw / 2, y: cam.y - vh / 2, w: vw, h: vh, fitAll };
}

// ------------------------------------------------------------------ frame loop
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const t = now / 1000;
  const states = interpolated();
  const view = updateCamera(states, dt);
  fx.update(dt);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#2f7d3b';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(cam.zoom, 0, 0, cam.zoom, -view.x * cam.zoom, -view.y * cam.zoom);
  ctx.imageSmoothingQuality = 'high';

  ctx.drawImage(ground, 0, 0);
  drawWater(ctx, t, view);

  // stage party lights
  const dancing = states.some((s) => s.a === 'dance');
  if (dancing || currentEvent?.kind === 'danceoff') {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = ['rgba(255,90,95,0.18)', 'rgba(31,181,173,0.18)', 'rgba(255,180,0,0.18)'][i];
      ctx.beginPath();
      ctx.arc(23.5 * 40 + Math.sin(t * 2 + i * 2) * 110, 24.5 * 40 + Math.cos(t * 1.6 + i) * 40, 90, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  setMusic(dancing || parties.length > 0);

  for (const p of parties) {
    ctx.strokeStyle = `rgba(123,97,255,${0.3 + Math.sin(t * 8) * 0.15})`;
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (0.9 + Math.sin(t * 6) * 0.05), 0, Math.PI * 2); ctx.stroke();
  }

  // hidden cats peek out (subtle bob)
  for (const c of CAT_SPOTS) ctx.drawImage(c.art.canvas, c.x + c.art.ox, c.y + c.art.oy + Math.sin(t * 2 + c.tx) * 1.5);

  // collectibles
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const it of items) {
    const bob = Math.sin(t * 3 + it.x) * 4;
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath(); ctx.ellipse(it.x, it.y + 10, 12, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.font = '28px serif';
    ctx.fillStyle = '#000';
    ctx.fillText(COLLECTIBLES[it.type].icon, it.x, it.y - 6 + bob);
  }

  // depth-sorted props + characters
  const drawables = [];
  for (const p of props) {
    if (p.x > view.x + view.w || p.x + p.img.width < view.x || p.y > view.y + view.h || p.y + p.img.height < view.y) continue;
    drawables.push({ y: p.sortY, draw: () => ctx.drawImage(p.img, p.x, p.y) });
  }
  for (const s of states) {
    const v = views.get(s.id);
    if (v) drawables.push({ y: s.y, draw: () => v.draw(ctx, s, t) });
  }
  drawables.sort((a, b) => a.y - b.y);
  for (const d of drawables) d.draw();

  // landmark labels
  ctx.font = 'bold 16px "Baloo 2", sans-serif';
  for (const l of LABELS) {
    const w = ctx.measureText(l.text).width + 14;
    ctx.fillStyle = 'rgba(27,27,47,0.72)';
    ctx.beginPath(); ctx.roundRect(l.x - w / 2, l.y - 11, w, 22, 11); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillText(l.text, l.x, l.y);
  }

  fx.draw(ctx);
  drawMinimap(states, view);
  requestAnimationFrame(frame);
}

function drawMinimap(states, view) {
  const zoomedIn = view.w < WORLD_W * 0.8;
  mini.style.display = zoomedIn ? 'block' : 'none';
  if (!zoomedIn) return;
  const sx = mini.width / WORLD_W, sy = mini.height / WORLD_H;
  mctx.drawImage(miniGround, 0, 0);
  mctx.strokeStyle = '#fff'; mctx.lineWidth = 2;
  mctx.strokeRect(view.x * sx, view.y * sy, view.w * sx, view.h * sy);
  for (const s of states) {
    const v = views.get(s.id);
    mctx.fillStyle = v?.color ?? '#fff';
    mctx.beginPath(); mctx.arc(s.x * sx, s.y * sy, 4, 0, Math.PI * 2); mctx.fill();
    mctx.strokeStyle = '#1b1b2f'; mctx.lineWidth = 1.5; mctx.stroke();
  }
}

requestAnimationFrame(frame);
