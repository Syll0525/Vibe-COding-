// Phone flow: join → scan drawing → describe → AI profile → controller.

import { ABILITY_INFO, INPUT_HZ, GAITS } from '/shared/constants.js';
import { fileToCanvas, extractToCanvas, setupDrawPad } from './scan.js';
import { setupPad } from './pad.js';
import { setupHome } from './home.js';
import { setupGames } from './games.js';

const $ = (id) => document.getElementById(id);
const screens = ['s-join', 's-scan', 's-draw', 's-preview', 's-describe', 's-profile', 's-play'];
const show = (id) => { for (const s of screens) $(s).classList.toggle('hidden', s !== id); scrollTo(0, 0); };
const params = new URLSearchParams(location.search);

const state = {
  code: (params.get('room') || '').toUpperCase(),
  name: '',
  source: null,          // canvas with the photo/drawing
  sprite: null,          // data URL of extracted sprite
  profile: null,
  me: null,              // {id, color, name}
  token: localStorage.getItem('dk-token') || crypto.randomUUID?.() || String(Math.random()).slice(2),
};
localStorage.setItem('dk-token', state.token);

function toast(text, ms = 2600) {
  const el = $('toast');
  el.textContent = text;
  el.classList.remove('hidden');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.add('hidden'), ms);
}
function busy(text) { $('busy').classList.toggle('hidden', !text); if (text) $('busy-text').textContent = text; }
function modal(title, text) { $('modal-title').textContent = title; $('modal-text').textContent = text; $('modal').classList.remove('hidden'); }
$('modal-ok').onclick = () => $('modal').classList.add('hidden');
const buzz = (ms = 15) => navigator.vibrate?.(ms);

// ------------------------------------------------------------------ 1. join
$('in-code').value = state.code;
$('in-name').value = localStorage.getItem('dk-name') || '';
const saved = JSON.parse(sessionStorage.getItem('dk-session') || 'null');
if (saved && saved.code === state.code && state.code) {
  $('btn-resume').textContent = `▶ Continue as ${saved.name}`;
  $('btn-resume').classList.remove('hidden');
  $('btn-resume').onclick = () => { Object.assign(state, saved); enterWorld(); };
}

$('btn-join-next').onclick = () => {
  state.code = $('in-code').value.trim().toUpperCase();
  state.name = $('in-name').value.trim();
  if (state.code.length !== 4) { $('join-error').textContent = 'Enter the 4-letter code shown on the big screen.'; return; }
  localStorage.setItem('dk-name', state.name);
  show('s-scan');
};

// ------------------------------------------------------------------ 2. scan
async function onFile(e) {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  busy('Loading photo…');
  try {
    state.source = await fileToCanvas(file);
    show('s-preview');
    runExtraction();
  } catch (err) {
    modal('Hmm…', 'Could not read that photo. Try again?');
  } finally { busy(null); }
}
$('file-camera').onchange = onFile;
$('file-gallery').onchange = onFile;

const pad = setupDrawPad($('drawpad'), $('swatches'));
$('btn-drawpad').onclick = () => show('s-draw');
$('btn-draw-back').onclick = () => show('s-scan');
$('btn-draw-clear').onclick = () => pad.clear();
$('btn-draw-done').onclick = () => {
  const c = document.createElement('canvas');
  c.width = $('drawpad').width; c.height = $('drawpad').height;
  c.getContext('2d').drawImage($('drawpad'), 0, 0);
  state.source = c;
  show('s-preview');
  runExtraction();
};
$('btn-skip-scan').onclick = () => { state.sprite = null; show('s-describe'); };

function runExtraction() {
  $('preview-busy').classList.remove('hidden');
  $('preview-error').textContent = '';
  requestAnimationFrame(() => setTimeout(() => {
    const res = extractToCanvas(state.source, $('preview'), Number($('sensitivity').value));
    $('preview-busy').classList.add('hidden');
    if (!res.ok) {
      $('preview-error').textContent = res.reason;
      state.sprite = null;
      $('btn-preview-ok').disabled = true;
      return;
    }
    $('btn-preview-ok').disabled = false;
    state.sprite = $('preview').toDataURL('image/png');
  }, 30));
}
let sliderTimer;
$('sensitivity').oninput = () => { clearTimeout(sliderTimer); sliderTimer = setTimeout(runExtraction, 150); };
$('btn-retake').onclick = () => show('s-scan');
$('btn-preview-ok').onclick = () => show('s-describe');

// ------------------------------------------------------------------ 3. describe + AI
const SUGGESTIONS = ['walks like a robot', 'jumps a lot', 'moves very fast', 'likes to dance', 'loves music',
  'likes to make friends', 'floats like a ghost', 'waddles like a penguin', 'always hungry', 'super strong', 'a bit shy', 'loves cats'];
for (const s of SUGGESTIONS) {
  const b = document.createElement('button');
  b.textContent = s;
  b.onclick = () => {
    const ta = $('in-desc');
    const parts = ta.value.split(',').map((x) => x.trim()).filter(Boolean);
    const i = parts.indexOf(s);
    if (i >= 0) parts.splice(i, 1); else parts.push(s);
    ta.value = parts.join(', ');
    b.classList.toggle('on', i < 0);
  };
  $('chips').append(b);
}

$('btn-generate').onclick = async () => {
  busy('✨ The AI is bringing your character to life…');
  try {
    const res = await fetch('/api/character', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: $('in-desc').value, name: state.name, sprite: state.sprite }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
    const { profile } = await res.json();
    state.profile = profile;
    renderProfile();
    show('s-profile');
  } catch (err) {
    modal('Oops', `Could not create the character: ${err.message}`);
  } finally { busy(null); }
};

const GAIT_TEXT = { walk: 'Walks normally', robot: 'Moves like a robot', hop: 'Hops everywhere', waddle: 'Waddles side to side',
  glide: 'Floats and glides', dance: 'Dances while walking', zoom: 'Zooms super fast' };

function renderProfile() {
  const p = state.profile;
  $('pf-img').src = state.sprite || 'data:image/svg+xml,' + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='80'>🎲</text></svg>");
  $('pf-name').textContent = `${p.emoji} ${p.name}`;
  $('pf-traits').replaceChildren(...p.traits.map((t) => Object.assign(document.createElement('span'), { textContent: t })));
  $('pf-quote').textContent = `“${p.catchphrase}”`;
  $('pf-bio').textContent = p.bio;
  const stats = [['🏃 Speed', (p.speed - 0.6) / 1.2], ['🦘 Bounce', Math.max(p.bounce, p.jumpiness)], ['🤗 Friendly', p.sociability], ['🎵 Music', p.musicLove]];
  $('pf-stats').replaceChildren(...stats.flatMap(([label, v]) => {
    const l = document.createElement('span'); l.textContent = label;
    const bar = document.createElement('div'); bar.className = 'bar';
    const fill = document.createElement('i'); fill.style.width = `${Math.round(Math.max(0.05, Math.min(1, v)) * 100)}%`;
    bar.append(fill);
    return [l, bar];
  }));
  const a = ABILITY_INFO[p.ability];
  $('pf-ability').textContent = `${a.icon} Special: ${a.label} — ${a.text}  ·  ${GAIT_TEXT[p.gait] ?? GAITS[0]}`;
  $('pf-source').textContent = p.source === 'ai' ? 'Designed by Claude AI ✨' : `Designed by the built-in personality engine${p.note ? ` (${p.note})` : ''}`;
}
$('btn-reroll').onclick = () => show('s-describe');
$('btn-enter').onclick = () => enterWorld();

// ------------------------------------------------------------------ 4. play
const socket = io({ transports: ['websocket', 'polling'], autoConnect: false });
let joined = false;
let lastHud = null;
const home = setupHome({ socket, toast, buzz });
const games = setupGames({ socket, toast, buzz, getHud: () => lastHud, getMe: () => state.me });

// bottom tabs: Play / Home / Shop / Games
let currentTab = 'pad';
function showTab(tab) {
  currentTab = tab;
  for (const b of document.querySelectorAll('#tabs button')) b.classList.toggle('on', b.dataset.tab === tab);
  for (const id of ['pad', 'panel-home', 'panel-shop', 'panel-games']) {
    $(id).classList.toggle('hidden', id !== (tab === 'pad' ? 'pad' : `panel-${tab}`));
  }
  $('hint').classList.toggle('hidden', tab !== 'pad');
  if (tab === 'games') games.renderGames();
  if (tab === 'home' || tab === 'shop') home.refresh();
  if (tab !== 'pad') socket.emit('input', { mx: 0, my: 0 });
}
for (const b of document.querySelectorAll('#tabs button')) b.onclick = () => showTab(b.dataset.tab);
document.addEventListener('dk:tab', (e) => showTab(e.detail));

function enterWorld() {
  $('enter-error').textContent = '';
  busy('Entering Kuching…');
  if (!socket.connected) socket.connect(); else join();
}

function join() {
  socket.emit('player:join', {
    code: state.code, name: state.profile?.name || state.name, sprite: state.sprite, profile: state.profile, token: state.token,
  }, (res) => {
    busy(null);
    if (!res.ok) {
      joined = false;
      $('enter-error').textContent = res.error;
      $('join-error').textContent = res.error;
      if (!$('s-play').classList.contains('hidden') || !state.profile) show('s-join');
      return;
    }
    joined = true;
    state.me = res;
    state.profile = res.profile;
    sessionStorage.setItem('dk-session', JSON.stringify({ code: state.code, name: res.name, profile: res.profile, sprite: state.sprite }));
    startController();
    home.setWallet(res.wallet);
    if (res.event) setEvent({ state: 'start', ...res.event });
    $('chat-log').replaceChildren();
    for (const m of res.chat || []) addChat(m);
  });
}

socket.on('connect', () => { if (!$('busy').classList.contains('hidden') || joined) join(); });
socket.on('disconnect', () => { if (joined) toast('📡 Reconnecting…', 5000); });

let controllerReady = false;
function startController() {
  show('s-play');
  const me = state.me;
  $('hud-me').textContent = `${state.profile.emoji} ${me.name}`;
  $('hud-me').style.background = me.color;
  $('ability-icon').textContent = ABILITY_INFO[state.profile.ability].icon;
  navigator.wakeLock?.request('screen').catch(() => {});
  if (controllerReady) return;
  controllerReady = true;

  let current = { mx: 0, my: 0 };
  let lastSent = '';
  setupPad({
    zone: $('stick-zone'), base: $('stick-base'), knob: $('stick-knob'),
    onMove: (v) => { current = v; },
    onButton: (b) => action(b),
  });
  setInterval(() => {
    const key = `${current.mx.toFixed(2)},${current.my.toFixed(2)}`;
    if (key === lastSent && key === '0.00,0.00') return;
    lastSent = key;
    socket.volatile.emit('input', current);
  }, 1000 / INPUT_HZ);

  const press = (id, type) => {
    const el = $(id);
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); el.classList.add('pressed'); action(type); });
    const up = () => el.classList.remove('pressed');
    el.addEventListener('pointerup', up); el.addEventListener('pointerleave', up); el.addEventListener('pointercancel', up);
  };
  press('btn-a', 'interact');
  press('btn-jump', 'jump');
  press('btn-ability', 'ability');
  for (const b of document.querySelectorAll('[data-emote]')) {
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); buzz(10); socket.emit('action', { type: 'emote', emote: b.dataset.emote }); });
  }
}

function action(type) {
  buzz(type === 'ability' ? 40 : 15);
  socket.emit('action', { type });
}

socket.on('hud', (h) => {
  const prev = lastHud;
  lastHud = h;
  $('hud-coins').textContent = h.coins;
  if (prev && h.coins > prev.coins) { const el = $('hud-coins').parentElement; el.style.animation = 'none'; void el.offsetWidth; el.style.animation = 'pop 0.4s ease'; }
  home.setCoins(h.coins);
  games.updateRace(h);
  if (currentTab === 'games' && (!prev || prev.cats !== h.cats || prev.friends !== h.friends || prev.catHint !== h.catHint || !!prev.race !== !!h.race)) games.renderGames();
  if (h.race && h.race.state !== 'lobby' && currentTab !== 'pad') showTab('pad');
  $('hud-score').textContent = h.score;
  $('hud-friends').textContent = h.friends;
  $('hud-cats').textContent = `${h.cats}/${h.catsTotal}`;
  $('hud-stamps').textContent = `${h.stamps}/${h.stampsTotal}`;
  $('hint').textContent = h.hint;
  const ab = $('btn-ability');
  ab.classList.toggle('cooling', h.abilityIn > 0);
  $('ability-cd').textContent = h.abilityIn || '';
});

socket.on('toast', ({ text }) => toast(text));
socket.on('landmark', (l) => {
  buzz(30);
  modal(`📍 ${l.name}`, `${l.fact}${l.first ? `\n\n🎟️ New passport stamp! (${l.stamps}/${l.total}) +🪙10` : ''}`);
});

function setEvent(e) {
  const el = $('event-strip');
  if (e.state === 'start') {
    el.textContent = `🎉 ${e.title} ${e.text}`;
    el.classList.remove('hidden');
    buzz(80);
  } else {
    el.classList.add('hidden');
    const r = e.ranking || [];
    const mine = r.findIndex((x) => x.id === state.me?.id);
    toast(mine === 0 ? `🏆 You won the ${e.title}! +🪙30` : r[0] ? `🏆 ${r[0].name} won the ${e.title}` : `${e.title} is over`, 4000);
  }
}
socket.on('event', setEvent);

// ------------------------------------------------------------------ chat
const QUICK = ['Hi! 👋', 'Follow me!', 'Want to be friends? 💞', 'Race to the bridge! 🌉', 'Found a cat! 🐱', 'Let\'s dance! 💃', 'Sedap! 🍜'];
for (const q of QUICK) {
  const b = document.createElement('button');
  b.textContent = q;
  b.onclick = () => sendChat(q);
  $('quick').append(b);
}
$('btn-chat').onclick = () => { $('chat').classList.remove('hidden'); $('chat-dot').classList.add('hidden'); scrollChat(); };
$('btn-chat-close').onclick = () => $('chat').classList.add('hidden');
$('chat-form').onsubmit = (e) => {
  e.preventDefault();
  sendChat($('chat-input').value);
  $('chat-input').value = '';
};
function sendChat(text) { if (text.trim()) socket.emit('chat', { text }); }
function scrollChat() { const log = $('chat-log'); log.scrollTop = log.scrollHeight; }
function addChat(m) {
  const el = document.createElement('div');
  el.className = 'm';
  const b = document.createElement('b');
  b.style.color = m.color; b.textContent = m.name;
  el.append(b, document.createTextNode(m.text));
  $('chat-log').append(el);
  while ($('chat-log').children.length > 60) $('chat-log').firstChild.remove();
  scrollChat();
}
socket.on('chat', (m) => {
  addChat(m);
  if ($('chat').classList.contains('hidden') && m.id !== state.me?.id) {
    $('chat-dot').classList.remove('hidden');
    toast(`💬 ${m.name}: ${m.text}`);
  }
});

// Start
if (state.code && $('in-name').value) $('btn-join-next').focus();
