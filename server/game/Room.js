// A single game world ("room"): authoritative simulation of players, collectibles,
// interactions, homes, the coin economy and mini-games. Network-agnostic — it emits
// events and the transport layer (server/net.js) decides who receives them. This keeps
// it easy to unit test and later to shard rooms across processes.

import { EventEmitter } from 'node:events';
import {
  TILE, BASE_SPEED, PLAYER_RADIUS, INTERACT_RADIUS, JUMP_TIME, SUPERJUMP_TIME,
  ABILITY_INFO, COLLECTIBLES, PLAYER_COLORS, MAX_PLAYERS_PER_ROOM, MAX_CHAT_LENGTH,
  RECONNECT_GRACE_MS, EMOTES,
} from '../../shared/constants.js';
import {
  MAP_W, MAP_H, isBlocked, isWalkableTile, tileCenter, SPAWN, HIDDEN_CATS,
  buildInteractables, inZone, LANDMARKS, PLOTS, plotGate, tileAt, T, riverTop, RIVER_HEIGHT,
} from '../../shared/map.js';
import { ITEMS, HOUSE_STYLES, START_COINS, defaultHome, validateHome } from '../../shared/catalog.js';
import { ruleProfile, normalizeProfile } from '../ai/rules.js';
import { Bot } from './Bot.js';
import { Race } from './Race.js';
import { FoodQuiz } from './foodQuiz.js';

const INTERACTABLES = buildInteractables();
const CATS = HIDDEN_CATS.map((c) => ({ ...c, ...tileCenter(c.tx, c.ty) }));
const EVENT_EVERY = 120;      // seconds between whole-city rounds
const EVENT_LENGTH = 45;
const QUIZ_COOLDOWN = 30;
const HIGHFIVE_COOLDOWN = 20;

// Coin rewards (score/leaderboard points are separate and listed alongside)
export const REWARDS = {
  cat: 20, allCats: 100, stamp: 10, newFriend: 15, highFive: 2, eventWin: 30, boombox: 1,
};

let nextId = 1;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const round1 = (v) => Math.round(v * 10) / 10;

function cleanText(s, max) {
  return String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Boats may only float on water (and under the bridge). */
function boatBlocked(x, y) {
  const t = tileAt(Math.floor(x / TILE), Math.floor(y / TILE));
  return t !== T.WATER && t !== T.BRIDGE;
}

export class Room extends EventEmitter {
  constructor(code, { rand = Math.random, store = null } = {}) {
    super();
    this.code = code;
    this.rand = rand;
    this.store = store;
    this.time = 0;                 // simulation clock (seconds)
    this.players = new Map();
    this.items = new Map();
    this.itemsDirty = true;
    this.parties = [];             // active boombox parties
    this.event = null;             // current whole-city round
    this.nextEventAt = 60;
    this.lastBoardAt = -1;
    this.colorIdx = 0;
    this.createdAt = Date.now();
    this.lastActivity = Date.now();
    this.chatLog = [];
    this.plots = new Array(PLOTS.length).fill(null);   // plot index -> player id
    this.races = { kart: null, boat: null };
    this.quizzes = new Map();                            // player id -> FoodQuiz
  }

  // ---------------------------------------------------------------- players

  get humanCount() { let n = 0; for (const p of this.players.values()) if (!p.bot) n++; return n; }

  canJoin() { return this.players.size < MAX_PLAYERS_PER_ROOM; }

  addPlayer({ name, sprite = null, profile = null, token = null, bot = false }) {
    if (!this.canJoin()) throw new Error('Room is full');
    const prof = profile ? normalizeProfile(profile) : ruleProfile('', name);
    if (name) prof.name = cleanText(name, 16) || prof.name;
    const spawn = this.findSpawn();
    const saved = this.store?.get(token) ?? null;
    const p = {
      id: `p${nextId++}`, token, bot,
      name: prof.name, color: PLAYER_COLORS[this.colorIdx++ % PLAYER_COLORS.length],
      sprite, profile: prof,
      x: spawn.x, y: spawn.y, vx: 0, vy: 0, z: 0, facing: 1,
      lastSafe: { ...spawn },
      input: { mx: 0, my: 0 }, lastInputAt: this.time,
      jump: null, ride: null, emote: null, autoWaveAt: 0,
      dashUntil: 0, magnetUntil: 0, danceUntil: 0, abilityReadyAt: 0, quizReadyAt: 0,
      score: 0, friends: new Set(), highFiveAt: new Map(),
      cats: new Set(saved?.cats ?? []), stamps: new Set(saved?.stamps ?? []),
      coins: saved?.coins ?? START_COINS, owned: { ...(saved?.owned ?? {}) },
      home: saved?.home ?? defaultHome(), plot: null,
      game: null, vehicle: null, frozen: false, boatSpeed: 0,
      connected: true, disconnectedAt: 0, hud: '', hint: '',
    };
    this.players.set(p.id, p);
    if (bot) p.brain = new Bot(p, this);
    else this.assignPlot(p);
    this.lastActivity = Date.now();
    this.emit('display', 'player:joined', this.publicPlayer(p));
    this.emit(bot ? 'display' : 'all', 'toast', {
      text: saved ? `${prof.emoji} ${p.name} is back in Kuching!` : `${prof.emoji} ${p.name} arrived in Kuching!`, color: p.color });
    this.persist(p);
    return p;
  }

  findSpawn() {
    for (let k = 0; k < 30; k++) {
      const x = SPAWN.x + (this.rand() - 0.5) * 6 * TILE;
      const y = SPAWN.y + (this.rand() - 0.5) * 1.2 * TILE;
      if (!this.blockedCircle(x, y, false)) return { x, y };
    }
    return { ...SPAWN };
  }

  findByToken(token) {
    if (!token) return null;
    for (const p of this.players.values()) if (p.token === token) return p;
    return null;
  }

  disconnect(id) {
    const p = this.players.get(id);
    if (!p) return;
    p.connected = false;
    p.disconnectedAt = Date.now();
    p.input = { mx: 0, my: 0 };
  }

  reconnect(id) {
    const p = this.players.get(id);
    if (p) { p.connected = true; p.hud = ''; p.hint = ''; }
    return p;
  }

  removePlayer(id) {
    const p = this.players.get(id);
    if (!p) return;
    this.persist(p);
    p.game?.leave(id);
    this.quizzes.delete(id);
    this.players.delete(id);
    for (const q of this.players.values()) q.friends.delete(id);
    if (p.plot !== null) { this.plots[p.plot] = null; this.emit('display', 'home', { plot: p.plot, owner: null }); }
    this.emit('display', 'player:left', { id });
    if (!p.bot) this.emit('all', 'toast', { text: `${p.name} went home. Jumpa lagi!`, color: p.color });
  }

  addBot() {
    const descs = [
      'walks like a robot and likes to make friends', 'jumps a lot and loves music',
      'moves very fast and is always hungry', 'floats like a ghost and is shy',
      'likes to dance', 'waddles like a penguin and is super friendly',
    ];
    const desc = descs[Math.floor(this.rand() * descs.length)];
    const prof = ruleProfile(desc, '', Math.floor(this.rand() * 1e9));
    prof.emoji = '🤖';
    return this.addPlayer({ name: prof.name, profile: prof, bot: true });
  }

  removeBots() { for (const p of [...this.players.values()]) if (p.bot) this.removePlayer(p.id); }

  publicPlayer(p) {
    return {
      id: p.id, name: p.name, color: p.color, sprite: p.sprite, profile: p.profile, bot: p.bot,
      x: p.x, y: p.y, score: p.score,
    };
  }

  // ---------------------------------------------------------------- economy + persistence

  reward(p, coins, score = coins) {
    if (!p) return;
    p.coins += coins;
    p.score += score;
    if (coins) this.persist(p);
  }

  /** Leaderboard points only (kept for dance/snack scoring). */
  addScore(p, n) { if (p) p.score += n; }

  persist(p) {
    if (!this.store || !p.token || p.bot) return;
    this.store.set(p.token, {
      name: p.name, coins: p.coins, owned: p.owned, home: p.home, cats: [...p.cats], stamps: [...p.stamps],
    });
  }

  wallet(p) { return { coins: p.coins, owned: p.owned, home: p.home, plot: p.plot }; }

  /** Buy a catalog item (`sofa`) or a house style (`house:longhouse`). */
  buy(id, itemId) {
    const p = this.players.get(id);
    if (!p) return { ok: false, error: 'Not in the game' };
    let price;
    if (typeof itemId === 'string' && itemId.startsWith('house:')) {
      const style = HOUSE_STYLES[itemId.slice(6)];
      if (!style) return { ok: false, error: 'Unknown house' };
      if (style.price === 0 || p.owned[itemId]) return { ok: false, error: 'You already own this house' };
      price = style.price;
    } else if (ITEMS[itemId]) price = ITEMS[itemId].price;
    else return { ok: false, error: 'Unknown item' };
    if (p.coins < price) return { ok: false, error: `You need ${price - p.coins} more coins` };
    p.coins -= price;
    p.owned[itemId] = (p.owned[itemId] || 0) + 1;
    this.persist(p);
    this.emit('display', 'fx', { type: 'buy', id: p.id, x: p.x, y: p.y, item: itemId });
    return { ok: true, ...this.wallet(p) };
  }

  setHome(id, home) {
    const p = this.players.get(id);
    if (!p) return { ok: false, error: 'Not in the game' };
    const res = validateHome(home, p.owned);
    if (!res.ok) return res;
    p.home = res.home;
    this.persist(p);
    if (p.plot !== null) this.emit('display', 'home', this.publicHome(p));
    return { ok: true, home: p.home };
  }

  assignPlot(p) {
    const idx = this.plots.indexOf(null);
    if (idx < 0) return;
    this.plots[idx] = p.id;
    p.plot = idx;
    this.emit('display', 'home', this.publicHome(p));
  }

  publicHome(p) { return { plot: p.plot, owner: p.id, name: p.name, color: p.color, home: p.home }; }

  goHome(id) {
    const p = this.players.get(id);
    if (!p || p.plot === null || p.game?.state === 'countdown' || p.game?.state === 'running' || p.ride) return false;
    const g = plotGate(PLOTS[p.plot]);
    p.x = g.x; p.y = g.y; p.vx = 0; p.vy = 0; p.lastSafe = { x: p.x, y: p.y };
    this.emit('display', 'fx', { type: 'teleport', id: p.id, x: p.x, y: p.y });
    return true;
  }

  // ---------------------------------------------------------------- mini-games

  joinRace(id, kind) {
    const p = this.players.get(id);
    if (!p || !['kart', 'boat'].includes(kind)) return { ok: false, error: 'Unknown race' };
    let race = this.races[kind];
    if (!race) {
      race = this.races[kind] = new Race(this, kind);
      this.emit('all', 'race', { kind, state: 'lobby', title: race.title, secs: Math.ceil(race.until - this.time) });
      const res = race.join(p);
      // bots love a race
      for (const b of this.players.values()) if (b.bot && !b.game && this.rand() < 0.6) race.join(b);
      return res;
    }
    return race.join(p);
  }

  startQuiz(id) {
    const p = this.players.get(id);
    if (!p) return { ok: false, error: 'Not in the game' };
    if (this.time < p.quizReadyAt) return { ok: false, error: `The kitchen is busy — try again in ${Math.ceil(p.quizReadyAt - this.time)}s` };
    const quiz = new FoodQuiz(this.rand);
    this.quizzes.set(id, quiz);
    this.emit('display', 'fx', { type: 'quiz', id: p.id, x: p.x, y: p.y });
    return { ok: true, question: quiz.question() };
  }

  answerQuiz(id, choice) {
    const p = this.players.get(id);
    const quiz = this.quizzes.get(id);
    if (!p || !quiz) return { ok: false, error: 'No quiz running' };
    const res = quiz.answer(Number(choice));
    if (!quiz.done) return { ok: true, ...res, next: quiz.question() };
    this.quizzes.delete(id);
    p.quizReadyAt = this.time + QUIZ_COOLDOWN;
    const coins = quiz.coins();
    this.reward(p, coins, coins * 2);
    const perfect = quiz.correct === quiz.dishes.length;
    this.emit('all', 'toast', { text: perfect ? `🍜 ${p.name} is a Kuching food expert — 5/5! +${coins} 🪙` : `🍜 ${p.name} got ${quiz.correct}/5 in the food quiz`, color: p.color });
    if (perfect) this.emit('display', 'fx', { type: 'friend', a: p.id, b: p.id, x: p.x, y: p.y });
    return { ok: true, ...res, summary: { correct: quiz.correct, total: quiz.dishes.length, coins } };
  }

  // ---------------------------------------------------------------- inputs

  handleInput(id, { mx = 0, my = 0 } = {}) {
    const p = this.players.get(id);
    if (!p) return;
    mx = Number(mx) || 0; my = Number(my) || 0;
    const m = Math.hypot(mx, my);
    if (m > 1) { mx /= m; my /= m; }
    p.input = { mx, my };
    if (m > 0.1) p.lastInputAt = this.time;
    this.lastActivity = Date.now();
  }

  handleAction(id, { type, emote } = {}) {
    const p = this.players.get(id);
    if (!p || p.ride) return;
    p.lastInputAt = this.time;
    if (p.vehicle === 'boat') {
      if ((type === 'interact' || type === 'jump') && !p.frozen) p.boatSpeed = Math.min(340, p.boatSpeed + 55);
      return;
    }
    if (p.vehicle === 'kart' && type !== 'emote') return;
    switch (type) {
      case 'jump': this.startJump(p, JUMP_TIME, 38); break;
      case 'ability': this.useAbility(p); break;
      case 'emote': if (EMOTES.includes(emote)) this.setEmote(p, emote, emote === 'dance' ? 4 : 2.5); break;
      case 'interact': this.interact(p); break;
      default: break;
    }
  }

  handleChat(id, text) {
    const p = this.players.get(id);
    if (!p) return false;
    const now = Date.now();
    if (p.lastChatAt && now - p.lastChatAt < 700) return false;
    const clean = cleanText(text, MAX_CHAT_LENGTH);
    if (!clean) return false;
    p.lastChatAt = now;
    const msg = { id: p.id, name: p.name, color: p.color, text: clean, t: now };
    this.chatLog.push(msg);
    if (this.chatLog.length > 50) this.chatLog.shift();
    this.emit('all', 'chat', msg);
    return true;
  }

  setEmote(p, type, secs) {
    p.emote = { type, until: this.time + secs };
    if (type === 'dance') p.danceUntil = this.time + secs;
  }

  startJump(p, dur, height, super_ = false) {
    if (p.jump) return false;
    p.jump = { t: 0, dur, height, super: super_ };
    return true;
  }

  useAbility(p) {
    if (this.time < p.abilityReadyAt) return;
    const a = p.profile.ability;
    p.abilityReadyAt = this.time + ABILITY_INFO[a].cooldown;
    switch (a) {
      case 'dash': p.dashUntil = this.time + 1.2; break;
      case 'superjump': p.jump = null; this.startJump(p, SUPERJUMP_TIME, 120, true); break;
      case 'magnet': p.magnetUntil = this.time + 4; break;
      case 'boombox':
        this.parties.push({ x: p.x, y: p.y, until: this.time + 6, owner: p.id, radius: 230 });
        this.setEmote(p, 'dance', 6);
        for (const q of this.nearby(p, 230)) { this.setEmote(q, 'dance', 5); this.reward(q, REWARDS.boombox, 3); }
        break;
      case 'charm':
        this.setEmote(p, 'heart', 2.5);
        for (const q of this.nearby(p, 200)) { this.befriend(p, q); this.setEmote(q, 'heart', 2); }
        break;
      default: break;
    }
    this.emit('display', 'fx', { type: 'ability', ability: a, id: p.id, x: p.x, y: p.y });
  }

  nearby(p, radius) {
    const out = [];
    for (const q of this.players.values()) if (q !== p && !q.ride && !q.vehicle && dist(p, q) < radius) out.push(q);
    return out;
  }

  /** What would pressing A do right now? Returns {kind, label, target} or null. */
  interactionFor(p) {
    if (p.vehicle === 'boat') return { kind: 'paddle', label: p.frozen ? '🚣 Get ready…' : '🚣 TAP A (or B) FAST TO PADDLE!' };
    if (p.vehicle === 'kart') return { kind: 'drive', label: p.frozen ? '🏎️ Get ready…' : '🏎️ Steer with the joystick!' };
    let bestCat = null;
    for (const c of CATS) if (!p.cats.has(c.id) && dist(p, c) < 60) bestCat = c;
    if (bestCat) return { kind: 'cat', label: '🐱 Pet the hidden cat!', target: bestCat };

    let other = null, od = INTERACT_RADIUS;
    for (const q of this.players.values()) {
      if (q === p || q.ride || q.vehicle) continue;
      const d = dist(p, q);
      if (d < od) { od = d; other = q; }
    }
    if (other) return { kind: 'player', label: `🙌 High-five ${other.name}`, target: other };

    let best = null, bd = Infinity;
    for (const it of INTERACTABLES) {
      const d = dist(p, it);
      if (d < it.radius && d < bd) { bd = d; best = it; }
    }
    if (!best) return null;
    if (best.type === 'sampan') return { kind: 'sampan', label: '🚣 Ride the sampan across', target: best };
    if (best.type === 'stage') return { kind: 'stage', label: '💃 Dance on the stage', target: best };
    if (best.type === 'game') return { kind: 'game', label: p.game ? '⏳ Waiting for the race to start…' : `🏁 Join the ${best.name}`, target: best };
    if (best.id === 'hawker') return { kind: 'hawker', label: '🍜 Order food & guess the dish', target: best };
    return { kind: 'landmark', label: `📍 Visit ${best.name}`, target: best };
  }

  interact(p) {
    const it = this.interactionFor(p);
    if (!it) { this.setEmote(p, 'wave', 2); return; }
    const t = it.target;
    switch (it.kind) {
      case 'cat':
        p.cats.add(t.id);
        this.reward(p, REWARDS.cat, 50);
        this.emit('display', 'fx', { type: 'cat', id: p.id, x: t.x, y: t.y, catId: t.id });
        this.emit('player', p.id, 'toast', { text: `🐱 You found a hidden cat! (${p.cats.size}/${CATS.length}) +${REWARDS.cat} 🪙` });
        if (p.cats.size === CATS.length) {
          this.reward(p, REWARDS.allCats, 200);
          this.emit('all', 'toast', { text: `🏆 ${p.name} found ALL the cats of Kuching! +${REWARDS.allCats} 🪙`, color: p.color });
        }
        break;
      case 'player': {
        const last = p.highFiveAt.get(t.id) ?? -99;
        if (this.time - last < 3) return;
        const paid = this.time - last >= HIGHFIVE_COOLDOWN;
        p.highFiveAt.set(t.id, this.time); t.highFiveAt.set(p.id, this.time);
        this.setEmote(p, 'wave', 1.5); this.setEmote(t, 'wave', 1.5);
        this.befriend(p, t, paid);
        this.emit('display', 'fx', { type: 'highfive', x: (p.x + t.x) / 2, y: (p.y + t.y) / 2, a: p.id, b: t.id });
        break;
      }
      case 'sampan': {
        const to = INTERACTABLES.find((i) => i.id === t.pair);
        p.jump = null; p.vx = 0; p.vy = 0;
        p.ride = { fx: p.x, fy: p.y, tx: to.x, ty: to.y, t: 0, dur: 2.4 };
        this.emit('display', 'fx', { type: 'sampan', id: p.id });
        break;
      }
      case 'stage':
        this.setEmote(p, 'dance', 4);
        break;
      case 'game': {
        if (p.game) return;
        const res = this.joinRace(p.id, t.game);
        this.emit('player', p.id, 'toast', { text: res.ok ? `🏁 You joined the ${t.name}! Starting soon…` : res.error });
        break;
      }
      case 'hawker': {
        const res = this.startQuiz(p.id);
        if (res.ok) this.emit('player', p.id, 'quiz:question', res.question);
        else this.emit('player', p.id, 'toast', { text: res.error });
        break;
      }
      case 'landmark': {
        const first = !p.stamps.has(t.id);
        if (first) { p.stamps.add(t.id); this.reward(p, REWARDS.stamp, 25); }
        this.emit('display', 'fx', { type: 'landmark', id: p.id, x: p.x, y: p.y - 60, landmark: t.id, name: t.name, fact: t.fact, first });
        this.emit('player', p.id, 'landmark', { name: t.name, fact: t.fact, first, stamps: p.stamps.size, total: LANDMARKS.length });
        break;
      }
      default: break;
    }
  }

  befriend(a, b, paid = true) {
    if (a.bot && b.bot) return;
    if (!a.friends.has(b.id)) {
      a.friends.add(b.id); b.friends.add(a.id);
      this.reward(a, REWARDS.newFriend, 20); this.reward(b, REWARDS.newFriend, 20);
      this.emit('display', 'fx', { type: 'friend', a: a.id, b: b.id, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      this.emit('all', 'toast', { text: `💞 ${a.name} and ${b.name} are now friends! +${REWARDS.newFriend} 🪙 each` });
    } else if (paid) {
      this.reward(a, REWARDS.highFive, 5); this.reward(b, REWARDS.highFive, 5);
    } else {
      this.addScore(a, 1); this.addScore(b, 1);
    }
  }

  // ---------------------------------------------------------------- simulation

  blockedCircle(x, y, airborne) {
    const r = PLAYER_RADIUS;
    return isBlocked(x, y, airborne) || isBlocked(x - r, y, airborne) || isBlocked(x + r, y, airborne) ||
      isBlocked(x, y - r * 0.5, airborne) || isBlocked(x, y + r * 0.5, airborne);
  }

  tick(dt) {
    this.time += dt;
    for (const p of this.players.values()) {
      if (p.brain) p.brain.update(dt);
      this.stepPlayer(p, dt);
    }
    for (const kind of ['kart', 'boat']) this.races[kind]?.tick();
    this.stepItems(dt);
    this.stepSocial();
    this.stepEvent();
    this.parties = this.parties.filter((q) => q.until > this.time);
    this.cleanupDisconnected();
  }

  stepBoat(p, dt) {
    p.boatSpeed = Math.max(0, p.boatSpeed * (1 - 0.7 * dt) - 8 * dt);
    let { mx, my } = p.input;
    if (Math.hypot(mx, my) < 0.2) {
      // no steering: follow the middle of the river downstream
      const ahead = Math.min(MAP_W - 1, Math.floor(p.x / TILE) + 3);
      mx = 3 * TILE; my = (riverTop(ahead) + RIVER_HEIGHT / 2) * TILE - p.y;
    }
    const d = Math.hypot(mx, my);
    p.vx = (mx / d) * p.boatSpeed; p.vy = (my / d) * p.boatSpeed * 0.7;
    const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt;
    if (!boatBlocked(nx, p.y) && !boatBlocked(nx, p.y + (p.vy > 0 ? 14 : -14))) p.x = nx; else p.boatSpeed *= 0.5;
    if (!boatBlocked(p.x, ny + Math.sign(p.vy) * 14)) p.y = ny;
    if (p.vx > 5) p.facing = 1; else if (p.vx < -5) p.facing = -1;
    p.x = Math.max(TILE * 0.5, Math.min((MAP_W - 0.5) * TILE, p.x));
  }

  stepPlayer(p, dt) {
    const prof = p.profile;
    if (p.ride) {
      const r = p.ride;
      r.t += dt;
      const k = Math.min(1, r.t / r.dur);
      const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      p.x = r.fx + (r.tx - r.fx) * e; p.y = r.fy + (r.ty - r.fy) * e;
      p.facing = r.tx >= r.fx ? 1 : -1;
      if (k >= 1) { p.ride = null; p.lastSafe = { x: p.x, y: p.y }; }
      return;
    }
    if (p.frozen) { p.vx = 0; p.vy = 0; return; }
    if (p.vehicle === 'boat') { this.stepBoat(p, dt); return; }

    let { mx, my } = p.input;
    if (prof.gait === 'robot' && !p.vehicle && (mx || my)) {  // robots only move in 4 directions
      if (Math.abs(mx) > Math.abs(my)) { mx = Math.sign(mx) * Math.hypot(mx, my); my = 0; }
      else { my = Math.sign(my) * Math.hypot(mx, my); mx = 0; }
    }
    let speed = BASE_SPEED * prof.speed;
    let accel = { glide: 3, zoom: 7, robot: 30, waddle: 9 }[prof.gait] ?? 12;
    if (p.vehicle === 'kart') { speed = BASE_SPEED * (1.95 + 0.1 * prof.speed); accel = 4; }
    if (this.time < p.dashUntil) speed *= 2.4;
    if (p.jump?.super) speed *= 1.5;
    const k = Math.min(1, accel * dt);
    p.vx += (mx * speed - p.vx) * k;
    p.vy += (my * speed - p.vy) * k;
    if (Math.abs(p.vx) < 1) p.vx = 0;
    if (Math.abs(p.vy) < 1) p.vy = 0;
    if (mx > 0.15) p.facing = 1; else if (mx < -0.15) p.facing = -1;

    const moving = Math.hypot(p.vx, p.vy) > 20;
    // personality-driven hopping
    if (moving && !p.jump && !p.vehicle) {
      if (prof.gait === 'hop') this.startJump(p, 0.42, 18 + prof.bounce * 16);
      else if (this.rand() < prof.jumpiness * dt * 0.9) this.startJump(p, JUMP_TIME, 30);
    }

    const air = Boolean(p.jump?.super);
    const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt;
    if (!this.blockedCircle(nx, p.y, air)) p.x = nx; else p.vx *= p.vehicle ? -0.3 : 0;
    if (!this.blockedCircle(p.x, ny, air)) p.y = ny; else p.vy *= p.vehicle ? -0.3 : 0;
    p.x = Math.max(TILE, Math.min((MAP_W - 1) * TILE, p.x));
    p.y = Math.max(TILE, Math.min((MAP_H - 1) * TILE, p.y));

    if (p.jump) {
      p.jump.t += dt;
      const t = p.jump.t / p.jump.dur;
      p.z = Math.sin(Math.PI * Math.min(1, t)) * p.jump.height;
      if (t >= 1) {
        p.z = 0;
        const wasSuper = p.jump.super;
        p.jump = null;
        if (wasSuper && this.blockedCircle(p.x, p.y, false)) {
          // landed in the river — splash back to the last safe spot
          this.emit('display', 'fx', { type: 'splash', x: p.x, y: p.y, id: p.id });
          p.x = p.lastSafe.x; p.y = p.lastSafe.y; p.vx = 0; p.vy = 0;
        }
      }
    }
    if (!p.jump && !this.blockedCircle(p.x, p.y, false)) p.lastSafe = { x: p.x, y: p.y };

    if (p.emote && p.emote.until < this.time) p.emote = null;

    // stage dancing earns points and a trickle of coins (music lovers earn more)
    const dancing = this.time < p.danceUntil || this.inParty(p);
    if (dancing && inZone('stage', p.x, p.y)) {
      p.dancePts = (p.dancePts || 0) + dt * (2 + 3 * prof.musicLove) * (this.event?.kind === 'danceoff' ? 2 : 1);
      if (p.dancePts >= 1) {
        const n = Math.floor(p.dancePts); p.dancePts -= n;
        this.addScore(p, n);
        p.danceCoins = (p.danceCoins || 0) + n / 4;
        if (p.danceCoins >= 1) { const c = Math.floor(p.danceCoins); p.danceCoins -= c; this.reward(p, c, 0); }
        if (this.event?.kind === 'danceoff') this.bumpEvent(p, n);
      }
    }
  }

  inParty(p) { return this.parties.some((q) => Math.hypot(p.x - q.x, p.y - q.y) < q.radius); }

  anim(p) {
    if (p.ride) return 'ride';
    if (p.vehicle) return Math.hypot(p.vx, p.vy) > 20 ? 'drive' : 'idle';
    if (this.time < p.danceUntil || this.inParty(p)) return 'dance';
    const moving = Math.hypot(p.vx, p.vy) > 20;
    if (moving) return 'move';
    const idleFor = this.time - p.lastInputAt;
    if (idleFor > 3) {
      // music lovers can't help dancing on the stage
      if (p.profile.musicLove > 0.6 && inZone('stage', p.x, p.y)) return 'dance';
      return `idle:${p.profile.idle}`;
    }
    return 'idle';
  }

  stepItems(dt) {
    const target = Math.min(42, 16 + this.players.size * 2 + (this.event?.kind === 'rush' ? 18 : 0));
    let spawned = 0;
    while (this.items.size < target && spawned < 3) { this.spawnItem(); spawned++; }

    for (const p of this.players.values()) {
      if (p.ride || p.vehicle === 'boat') continue;
      const magnet = this.time < p.magnetUntil;
      for (const it of this.items.values()) {
        const d = Math.hypot(it.x - p.x, it.y - p.y);
        if (magnet && d < 280 && d > 1) {
          const s = Math.min(d, 320 * dt) / d;
          it.x += (p.x - it.x) * s; it.y += (p.y - it.y) * s;
          this.itemsDirty = true;
        }
        if (d < 30 && p.z < 25) {
          this.items.delete(it.id);
          this.itemsDirty = true;
          const c = COLLECTIBLES[it.type];
          this.reward(p, c.coins, c.points);
          if (this.event?.kind === 'rush') this.bumpEvent(p, c.points);
          this.emit('display', 'fx', { type: 'collect', item: it.type, x: it.x, y: it.y, id: p.id });
        }
      }
    }
  }

  spawnItem() {
    for (let k = 0; k < 40; k++) {
      const tx = 1 + Math.floor(this.rand() * (MAP_W - 2));
      const ty = 1 + Math.floor(this.rand() * (MAP_H - 2));
      if (!isWalkableTile(tx, ty)) continue;
      const c = tileCenter(tx, ty);
      const r = this.rand();
      const type = r < 0.6 ? 'kolomee' : r < 0.9 ? 'keklapis' : 'laksa';
      const id = `i${nextId++}`;
      this.items.set(id, { id, type, x: c.x, y: c.y });
      this.itemsDirty = true;
      return;
    }
  }

  stepSocial() {
    // Friendly characters wave at people they meet (checked ~3x a second)
    if (this.time < (this.socialAt || 0)) return;
    this.socialAt = this.time + 0.33;
    for (const p of this.players.values()) {
      if (p.profile.sociability < 0.6 || p.emote || p.ride || p.vehicle || this.time < p.autoWaveAt) continue;
      const near = this.nearby(p, 170);
      if (near.length) {
        this.setEmote(p, 'wave', 2);
        p.autoWaveAt = this.time + 10 + (1 - p.profile.sociability) * 10;
      }
    }
  }

  // ---------------------------------------------------------------- whole-city rounds

  stepEvent() {
    if (!this.event) {
      const racing = this.races.kart || this.races.boat;
      if (this.time >= this.nextEventAt && this.humanCount > 0 && !racing) {
        const kind = this.lastEventKind === 'rush' ? 'danceoff' : 'rush';
        this.startEvent(kind);
      }
      return;
    }
    if (this.time >= this.event.endsAt) this.endEvent();
  }

  startEvent(kind, length = EVENT_LENGTH) {
    this.lastEventKind = kind;
    this.event = {
      kind, endsAt: this.time + length, length, scores: {},
      title: kind === 'rush' ? 'Kolo Mee Rush!' : 'Waterfront Dance-Off!',
      text: kind === 'rush' ? 'Grab as much food as you can!' : 'Dance on the Waterfront Stage for double points!',
    };
    this.emit('all', 'event', { state: 'start', ...this.publicEvent() });
  }

  bumpEvent(p, n) { this.event.scores[p.id] = (this.event.scores[p.id] || 0) + n; }

  endEvent() {
    const ranking = Object.entries(this.event.scores)
      .map(([id, s]) => ({ p: this.players.get(id), s }))
      .filter((r) => r.p).sort((a, b) => b.s - a.s).slice(0, 3)
      .map((r) => ({ id: r.p.id, name: r.p.name, color: r.p.color, score: Math.round(r.s) }));
    if (ranking[0]) this.reward(this.players.get(ranking[0].id), REWARDS.eventWin, 50);
    this.emit('all', 'event', { state: 'end', ...this.publicEvent(), ranking });
    this.event = null;
    this.nextEventAt = this.time + EVENT_EVERY;
  }

  publicEvent() {
    if (!this.event) return null;
    return { kind: this.event.kind, title: this.event.title, text: this.event.text,
      remaining: Math.max(0, Math.ceil(this.event.endsAt - this.time)), length: this.event.length };
  }

  cleanupDisconnected() {
    const now = Date.now();
    for (const p of [...this.players.values()]) {
      if (!p.bot && !p.connected && now - p.disconnectedAt > RECONNECT_GRACE_MS) this.removePlayer(p.id);
    }
  }

  // ---------------------------------------------------------------- outbound state

  snapshot() {
    const players = [];
    for (const p of this.players.values()) {
      players.push({
        id: p.id, x: round1(p.x), y: round1(p.y), z: Math.round(p.z), f: p.facing,
        a: this.anim(p), e: p.emote?.type ?? null, sp: round1(Math.min(1, Math.hypot(p.vx, p.vy) / BASE_SPEED)),
        dash: this.time < p.dashUntil ? 1 : 0, mag: this.time < p.magnetUntil ? 1 : 0,
        off: p.connected ? 0 : 1, veh: p.vehicle,
      });
    }
    const snap = { t: round1(this.time), players };
    if (this.itemsDirty) { snap.items = [...this.items.values()].map((i) => [i.id, i.type, Math.round(i.x), Math.round(i.y)]); this.itemsDirty = false; }
    if (this.time - this.lastBoardAt >= 0.5) {
      this.lastBoardAt = this.time;
      snap.board = [...this.players.values()].sort((a, b) => b.score - a.score).slice(0, 8)
        .map((p) => ({ id: p.id, name: p.name, color: p.color, score: p.score, coins: p.coins, friends: p.friends.size, cats: p.cats.size }));
      snap.event = this.publicEvent();
      snap.parties = this.parties.map((q) => ({ x: Math.round(q.x), y: Math.round(q.y), r: q.radius }));
      snap.races = ['kart', 'boat'].map((k) => this.races[k]?.publicState()).filter(Boolean);
    }
    return snap;
  }

  fullState() {
    const s = this.snapshot();
    s.items = [...this.items.values()].map((i) => [i.id, i.type, Math.round(i.x), Math.round(i.y)]);
    const homes = [];
    for (const p of this.players.values()) if (p.plot !== null) homes.push(this.publicHome(p));
    return { code: this.code, players: [...this.players.values()].map((p) => this.publicPlayer(p)),
      snapshot: s, chat: this.chatLog.slice(-20), event: this.publicEvent(), cats: CATS.length, homes };
  }

  /** Hot/cold hint towards the nearest cat this player hasn't found yet. */
  catHint(p) {
    let best = Infinity;
    for (const c of CATS) if (!p.cats.has(c.id)) best = Math.min(best, dist(p, c));
    if (best === Infinity) return '🏆 All cats found!';
    if (best < 120) return '🔥🔥 Super hot! A cat is right here!';
    if (best < 300) return '🔥 Hot!';
    if (best < 600) return '🌤️ Warm…';
    if (best < 1000) return '❄️ Cold';
    return '🧊 Freezing';
  }

  /** Per-player HUD for the phone, only returned when it changed. */
  hudFor(p) {
    const it = this.interactionFor(p);
    const hud = {
      score: p.score, coins: p.coins, friends: p.friends.size, cats: p.cats.size, catsTotal: CATS.length,
      stamps: p.stamps.size, stampsTotal: LANDMARKS.length,
      ability: p.profile.ability, abilityIn: Math.max(0, Math.ceil(p.abilityReadyAt - this.time)),
      hint: p.ride ? '🚣 Enjoy the ride…' : it?.label ?? '',
      catHint: this.catHint(p),
      race: p.game?.statusFor(p.id) ?? null,
      vehicle: p.vehicle,
    };
    const key = JSON.stringify(hud);
    if (key === p.hud) return null;
    p.hud = key;
    return hud;
  }
}

