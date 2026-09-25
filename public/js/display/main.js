// Projector / big-screen client: networking, interpolation and HUD panels.
// Rendering is delegated to a renderer: 3D (default) or classic 2D (?view=2d).

import { COLLECTIBLES, ABILITY_INFO, SNAPSHOT_HZ } from '/shared/constants.js';
import { WORLD_W, WORLD_H } from '/shared/map.js';
import { buildGround } from './world.js';
import { unlock, sfx, setMusic, setMuted, isMuted } from './audio.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const viewMode = params.get('view') === '2d' ? '2d' : '3d';

// ------------------------------------------------------------------ renderer
async function makeRenderer() {
  if (viewMode === '3d') {
    try {
      const { Renderer3D } = await import('./three/renderer3d.js');
      return new Renderer3D($('game'), $('overlay'), { quality: params.get('quality') || 'high' });
    } catch (err) {
      console.error('3D renderer failed, falling back to 2D', err);
    }
  }
  const { Renderer2D } = await import('./renderer2d.js');
  $('game').replaceWith(Object.assign(document.createElement('canvas'), { id: 'game' }));
  $('cam-mode').classList.add('hidden');
  return new Renderer2D($('game'));
}
const renderer = await makeRenderer();

const mini = $('minimap');
const mctx = mini.getContext('2d');
const miniGround = document.createElement('canvas');
miniGround.width = mini.width; miniGround.height = mini.height;
miniGround.getContext('2d').drawImage(buildGround(), 0, 0, mini.width, mini.height);

// ------------------------------------------------------------------ state
const names = new Map();        // id -> {name, color}
let snaps = [];
let clockOffset = null;         // server sim time - local time
let items = [];
let parties = [];
let currentEvent = null;
let roomCode = null;

// ------------------------------------------------------------------ networking
const socket = io({ transports: ['websocket', 'polling'] });

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
  const q = new URLSearchParams(location.search);
  q.set('room', roomCode);
  history.replaceState(null, '', `/display?${q}`);
  $('room-code').textContent = roomCode;
  const url = await joinUrl(roomCode);
  $('join-url').textContent = url.replace(/^https?:\/\//, '');
  $('qr').src = `/api/qr?text=${encodeURIComponent(url)}`;

  renderer.clearPlayers();
  renderer.clearHomes();
  for (const h of state.homes || []) renderer.setHome(h);
  names.clear();
  for (const p of state.players) addPlayer(p);
  snaps = [];
  clockOffset = null;
  onSnap(state.snapshot);
  $('chat-log').innerHTML = '';
  for (const m of state.chat) addChat(m, false);
  setEvent(state.event);
}

function addPlayer(p) { names.set(p.id, { name: p.name, color: p.color }); renderer.addPlayer(p); }

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
  clockOffset = clockOffset === null ? off : Math.max(off, clockOffset - 0.002);
  snaps.push(s);
  if (snaps.length > 30) snaps.shift();
  if (s.items) items = s.items.map(([id, type, x, y]) => ({ id, type, x, y }));
  if (s.board) renderBoard(s.board);
  if (s.parties) parties = s.parties;
  if (s.event !== undefined) updateEventTimer(s.event);
  if (s.races) { renderer.setRaces(s.races); renderRaces(s.races); }
}

socket.on('home', (h) => renderer.setHome(h));

function renderRaces(races) {
  const panel = $('race-panel');
  panel.classList.toggle('hidden', !races.length);
  panel.replaceChildren(...races.map((r) => {
    const box = document.createElement('div');
    box.className = 'race';
    const h = document.createElement('h3');
    h.textContent = r.state === 'lobby' ? `${r.title} — starting in ${r.secs}s! Join on your phone 🏁`
      : r.state === 'countdown' ? `${r.title} — get ready!` : `${r.title} — ${r.secs}s left`;
    const ol = document.createElement('ol');
    for (const x of r.ranking.slice(0, 8)) {
      const li = document.createElement('li');
      const dot = document.createElement('span'); dot.className = 'dot'; dot.style.background = x.color;
      li.append(`${x.finished ? '🏁' : `#${x.pos}`}`, dot, x.name + (r.state === 'running' && r.laps > 1 && !x.finished ? ` (lap ${x.lap})` : ''));
      ol.append(li);
    }
    box.append(h, ol);
    return box;
  }));
}

function bigCount(text, ms = 850) {
  const el = $('bigcount');
  el.textContent = text;
  el.classList.remove('hidden');
  el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
  clearTimeout(bigCount.t);
  bigCount.t = setTimeout(() => el.classList.add('hidden'), ms);
}

socket.on('race', (r) => {
  if (r.state === 'lobby') { toast(`${r.title} starts in ${r.secs}s — join from the 🏁 Games tab on your phone!`); sfx.fanfare(); }
  if (r.state === 'countdown') for (let i = 0; i < r.secs; i++) setTimeout(() => { bigCount(String(r.secs - i)); sfx.jump(); }, i * 1000);
  if (r.state === 'go') { bigCount('GO!'); sfx.fanfare(); }
  if (r.state === 'done') {
    const w = r.ranking?.[0];
    if (w) {
      toast(`🏆 ${r.title} winner: ${w.name}!`);
      const s = latestState(w.id);
      if (s) renderer.burst(s.x, s.y, 60, { count: 40, icons: ['🏆', '⭐', '🎉'] });
    }
  }
});

socket.on('player:joined', (p) => {
  addPlayer(p);
  renderer.burst(p.x, p.y, 40, { count: 24 });
  sfx.fanfare();
});
socket.on('player:left', ({ id }) => { renderer.removePlayer(id); names.delete(id); });

socket.on('chat', (m) => { addChat(m, true); renderer.say(m.id, m.text); sfx.chat(); });
socket.on('toast', ({ text }) => toast(text));
socket.on('event', (e) => {
  if (e.state === 'start') { setEvent(e); sfx.fanfare(); toast(`🎉 ${e.title} ${e.text}`); }
  else {
    setEvent(null);
    const r = e.ranking || [];
    toast(r.length ? `🏆 ${e.title} winner: ${r[0].name} (${r[0].score})!` : `${e.title} is over!`);
    if (r[0]) { const s = latestState(r[0].id); if (s) renderer.burst(s.x, s.y, 60, { count: 40, icons: ['🏆', '⭐', '🎉'] }); }
  }
});

socket.on('fx', (e) => {
  switch (e.type) {
    case 'collect': {
      const c = COLLECTIBLES[e.item];
      renderer.burst(e.x, e.y, 20, { count: 8, icons: [c.icon, '✨'], speed: 120 });
      renderer.text(e.x, e.y, 50, `+${c.points}`, '#ffe066');
      sfx.collect();
      break;
    }
    case 'cat':
      renderer.burst(e.x, e.y, 20, { count: 16, icons: ['🐱', '💖', '✨'] });
      renderer.text(e.x, e.y, 60, '+50 Cat found!', '#ffb8d9'); sfx.cat();
      break;
    case 'highfive':
      renderer.burst(e.x, e.y, 60, { count: 10, icons: ['🙌', '✨'], speed: 100 }); sfx.highfive();
      break;
    case 'friend':
      renderer.burst(e.x, e.y, 60, { count: 20, icons: ['💞', '💖', '🤝'] });
      renderer.text(e.x, e.y, 100, 'New friends!', '#ff9ff3'); sfx.friend();
      break;
    case 'splash':
      renderer.burst(e.x, e.y, 5, { count: 20, colors: ['#74b9ff', '#ffffff', '#0984e3'], speed: 200 });
      renderer.text(e.x, e.y, 50, 'SPLASH!', '#74b9ff'); sfx.splash();
      break;
    case 'sampan': sfx.whoosh(); break;
    case 'finish':
      renderer.burst(e.x, e.y, 50, { count: 24, icons: ['🏁', '⭐', '🎉'] });
      renderer.text(e.x, e.y, 90, `#${e.place}!`, '#ffe066'); sfx.fanfare();
      break;
    case 'buy': renderer.burst(e.x, e.y, 60, { count: 10, icons: ['🛍️', '🪙', '✨'], speed: 110 }); sfx.collect(); break;
    case 'teleport': renderer.burst(e.x, e.y, 30, { count: 14, icons: ['✨', '🏠'], speed: 120 }); sfx.whoosh(); break;
    case 'quiz': renderer.text(e.x, e.y, 80, '🍜 Food quiz!', '#ffe066'); break;
    case 'landmark': showCard(e); if (e.first) renderer.text(e.x ?? 0, e.y ?? 0, 60, '+25', '#ffe066'); sfx.landmark(); break;
    case 'ability': {
      const info = ABILITY_INFO[e.ability];
      renderer.burst(e.x, e.y, 40, { count: 14, icons: [info.icon, '✨'] });
      if (e.ability === 'boombox') renderer.burst(e.x, e.y, 40, { count: 16, icons: ['🎵', '🎶'], speed: 220, gravity: -40, life: 1.6 });
      if (e.ability === 'charm') renderer.burst(e.x, e.y, 40, { count: 20, icons: ['💖', '💕'], speed: 200, gravity: -30, life: 1.5 });
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
    meta.textContent = `${p.coins}🪙 ${p.score}⭐ ${p.friends}💞`;
    li.append(dot, name, meta);
    list.append(li);
  }
  $('empty-hint').classList.toggle('hidden', board.length > 0);
  $('join').classList.toggle('compact', board.length > 0);
}

let cardTimer = null;
function showCard(e) {
  const who = names.get(e.id);
  $('card-who').textContent = `${who ? who.name : 'Someone'} visited${e.first ? ' — new passport stamp! +25' : ''}`;
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
$('cam-mode').onclick = () => { const label = renderer.cycleCamera(); if (label) toast(`🎥 Camera: ${label}`); };
$('view-toggle').textContent = viewMode === '3d' ? '2D' : '3D';
$('view-toggle').onclick = () => {
  const q = new URLSearchParams(location.search);
  if (viewMode === '3d') q.set('view', '2d'); else q.delete('view');
  location.search = q.toString();
};
addEventListener('keydown', (e) => { if (e.key.toLowerCase() === 'c') $('cam-mode').click(); });
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

// ------------------------------------------------------------------ frame loop
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const states = interpolated();
  const dancing = states.some((s) => s.a === 'dance');
  setMusic(dancing || parties.length > 0);
  renderer.frame({ states, items, parties, dancing, danceoff: currentEvent?.kind === 'danceoff', t: now / 1000, dt });
  drawMinimap(states);
  requestAnimationFrame(frame);
}

function drawMinimap(states) {
  const view = renderer.minimapView();
  mini.style.display = view ? 'block' : 'none';
  if (!view) return;
  const sx = mini.width / WORLD_W, sy = mini.height / WORLD_H;
  mctx.drawImage(miniGround, 0, 0);
  if (view.w) {
    mctx.strokeStyle = '#fff'; mctx.lineWidth = 2;
    mctx.strokeRect(view.x * sx, view.y * sy, view.w * sx, view.h * sy);
  }
  for (const s of states) {
    mctx.fillStyle = names.get(s.id)?.color ?? '#fff';
    mctx.beginPath(); mctx.arc(s.x * sx, s.y * sy, 4, 0, Math.PI * 2); mctx.fill();
    mctx.strokeStyle = '#1b1b2f'; mctx.lineWidth = 1.5; mctx.stroke();
  }
}

requestAnimationFrame(frame);
