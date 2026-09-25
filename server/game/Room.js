// A single game world ("room"): authoritative simulation of players, collectibles,
// interactions and mini-games. Network-agnostic — it emits events and the transport
// layer (server/net.js) decides who receives them. This keeps it easy to unit test
// and later to shard rooms across processes.

import { EventEmitter } from 'node:events';
import {
  TILE, BASE_SPEED, PLAYER_RADIUS, INTERACT_RADIUS, JUMP_TIME, SUPERJUMP_TIME,
  ABILITY_INFO, COLLECTIBLES, PLAYER_COLORS, MAX_PLAYERS_PER_ROOM, MAX_CHAT_LENGTH,
  RECONNECT_GRACE_MS, EMOTES,
} from '../../shared/constants.js';
import {
  MAP_W, MAP_H, isBlocked, isWalkableTile, tileCenter, SPAWN, HIDDEN_CATS,
  buildInteractables, inZone, LANDMARKS,
} from '../../shared/map.js';
import { ruleProfile, normalizeProfile } from '../ai/rules.js';
import { Bot } from './Bot.js';

const INTERACTABLES = buildInteractables();
const CATS = HIDDEN_CATS.map((c) => ({ ...c, ...tileCenter(c.tx, c.ty) }));
const EVENT_EVERY = 120;      // seconds between mini-game rounds
const EVENT_LENGTH = 45;
const HAWKER_COOLDOWN = 20;

let nextId = 1;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const round1 = (v) => Math.round(v * 10) / 10;

function cleanText(s, max) {
  return String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

export class Room extends EventEmitter {
  constructor(code, { rand = Math.random } = {}) {
    super();
    this.code = code;
    this.rand = rand;
    this.time = 0;                 // simulation clock (seconds)
    this.players = new Map();
    this.items = new Map();
    this.itemsDirty = true;
    this.parties = [];             // active boombox parties
    this.event = null;             // current mini-game round
    this.nextEventAt = 60;
    this.lastBoardAt = -1;
    this.colorIdx = 0;
    this.createdAt = Date.now();
    this.lastActivity = Date.now();
    this.chatLog = [];
  }

  // ---------------------------------------------------------------- players

  get humanCount() { let n = 0; for (const p of this.players.values()) if (!p.bot) n++; return n; }

  canJoin() { return this.players.size < MAX_PLAYERS_PER_ROOM; }

  addPlayer({ name, sprite = null, profile = null, token = null, bot = false }) {
    if (!this.canJoin()) throw new Error('Room is full');
    const prof = profile ? normalizeProfile(profile) : ruleProfile('', name);
    if (name) prof.name = cleanText(name, 16) || prof.name;
    const spawn = this.findSpawn();
    const p = {
      id: `p${nextId++}`, token, bot,
      name: prof.name, color: PLAYER_COLORS[this.colorIdx++ % PLAYER_COLORS.length],
      sprite, profile: prof,
      x: spawn.x, y: spawn.y, vx: 0, vy: 0, z: 0, facing: 1,
      lastSafe: { ...spawn },
      input: { mx: 0, my: 0 }, lastInputAt: this.time,
      jump: null, ride: null, emote: null, autoWaveAt: 0,
      dashUntil: 0, magnetUntil: 0, danceUntil: 0, abilityReadyAt: 0, hawkerReadyAt: 0,
      score: 0, friends: new Set(), cats: new Set(), stamps: new Set(), highFiveAt: new Map(),
      connected: true, disconnectedAt: 0, hud: '', hint: '',
    };
    this.players.set(p.id, p);
    if (bot) p.brain = new Bot(p, this);
    this.lastActivity = Date.now();
    this.emit('display', 'player:joined', this.publicPlayer(p));
    this.emit(bot ? 'display' : 'all', 'toast', { text: `${prof.emoji} ${p.name} arrived in Kuching!`, color: p.color });
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
    this.players.delete(id);
    for (const q of this.players.values()) q.friends.delete(id);
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
        for (const q of this.nearby(p, 230)) { this.setEmote(q, 'dance', 5); this.addScore(q, 3); }
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
    for (const q of this.players.values()) if (q !== p && !q.ride && dist(p, q) < radius) out.push(q);
    return out;
  }

  /** What would pressing A do right now? Returns {kind, label, target} or null. */
  interactionFor(p) {
    let bestCat = null;
    for (const c of CATS) if (!p.cats.has(c.id) && dist(p, c) < 60) bestCat = c;
    if (bestCat) return { kind: 'cat', label: '🐱 Pet the hidden cat!', target: bestCat };

    let other = null, od = INTERACT_RADIUS;
    for (const q of this.players.values()) {
      if (q === p || q.ride) continue;
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
    if (best.id === 'hawker') return { kind: 'hawker', label: '🍜 Order kolo mee', target: best };
    return { kind: 'landmark', label: `📍 Visit ${best.name}`, target: best };
  }

  interact(p) {
    const it = this.interactionFor(p);
    if (!it) { this.setEmote(p, 'wave', 2); return; }
    const t = it.target;
    switch (it.kind) {
      case 'cat':
        p.cats.add(t.id);
        this.addScore(p, 50);
        this.emit('display', 'fx', { type: 'cat', id: p.id, x: t.x, y: t.y, catId: t.id });
        this.emit('player', p.id, 'toast', { text: `🐱 You found a hidden cat! (${p.cats.size}/${CATS.length})` });
        if (p.cats.size === CATS.length) {
          this.addScore(p, 200);
          this.emit('all', 'toast', { text: `🏆 ${p.name} found ALL the cats of Kuching!`, color: p.color });
        }
        break;
      case 'player': {
        const last = p.highFiveAt.get(t.id) ?? -99;
        if (this.time - last < 3) return;
        p.highFiveAt.set(t.id, this.time); t.highFiveAt.set(p.id, this.time);
        this.setEmote(p, 'wave', 1.5); this.setEmote(t, 'wave', 1.5);
        this.addScore(p, 5); this.addScore(t, 5);
        this.befriend(p, t);
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
      case 'hawker':
        if (this.time < p.hawkerReadyAt) {
          this.emit('player', p.id, 'toast', { text: '🍜 Still cooking… come back soon!' });
          return;
        }
        p.hawkerReadyAt = this.time + HAWKER_COOLDOWN;
        this.addScore(p, 15);
        this.setEmote(p, 'heart', 2);
        this.emit('display', 'fx', { type: 'collect', item: 'kolomee', x: p.x, y: p.y, id: p.id });
        this.emit('player', p.id, 'toast', { text: '🍜 Sedap! Kolo mee +15' });
        break;
      case 'landmark': {
        const first = !p.stamps.has(t.id);
        if (first) { p.stamps.add(t.id); this.addScore(p, 25); }
        this.emit('display', 'fx', { type: 'landmark', id: p.id, x: p.x, y: p.y - 60, landmark: t.id, name: t.name, fact: t.fact, first });
        this.emit('player', p.id, 'landmark', { name: t.name, fact: t.fact, first, stamps: p.stamps.size, total: LANDMARKS.length });
        break;
      }
      default: break;
    }
  }

  befriend(a, b) {
    if (a.bot && b.bot) return;
    if (!a.friends.has(b.id)) {
      a.friends.add(b.id); b.friends.add(a.id);
      this.addScore(a, 20); this.addScore(b, 20);
      this.emit('display', 'fx', { type: 'friend', a: a.id, b: b.id, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      this.emit('all', 'toast', { text: `💞 ${a.name} and ${b.name} are now friends!` });
    } else {
      this.addScore(a, 2); this.addScore(b, 2);
    }
  }

  addScore(p, n) { if (p) p.score += n; }

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
    this.stepItems(dt);
    this.stepSocial();
    this.stepEvent();
    this.parties = this.parties.filter((q) => q.until > this.time);
    this.cleanupDisconnected();
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

    let { mx, my } = p.input;
    if (prof.gait === 'robot' && (mx || my)) {  // robots only move in 4 directions
      if (Math.abs(mx) > Math.abs(my)) { mx = Math.sign(mx) * Math.hypot(mx, my); my = 0; }
      else { my = Math.sign(my) * Math.hypot(mx, my); mx = 0; }
    }
    let speed = BASE_SPEED * prof.speed;
    if (this.time < p.dashUntil) speed *= 2.4;
    if (p.jump?.super) speed *= 1.5;
    const accel = { glide: 3, zoom: 7, robot: 30, waddle: 9 }[prof.gait] ?? 12;
    const k = Math.min(1, accel * dt);
    p.vx += (mx * speed - p.vx) * k;
    p.vy += (my * speed - p.vy) * k;
    if (Math.abs(p.vx) < 1) p.vx = 0;
    if (Math.abs(p.vy) < 1) p.vy = 0;
    if (mx > 0.15) p.facing = 1; else if (mx < -0.15) p.facing = -1;

    const moving = Math.hypot(p.vx, p.vy) > 20;
    // personality-driven hopping
    if (moving && !p.jump) {
      if (prof.gait === 'hop') this.startJump(p, 0.42, 18 + prof.bounce * 16);
      else if (this.rand() < prof.jumpiness * dt * 0.9) this.startJump(p, JUMP_TIME, 30);
    }

    const air = Boolean(p.jump?.super);
    const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt;
    if (!this.blockedCircle(nx, p.y, air)) p.x = nx; else p.vx = 0;
    if (!this.blockedCircle(p.x, ny, air)) p.y = ny; else p.vy = 0;
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

    // stage dancing earns points (music lovers earn more)
    const dancing = this.time < p.danceUntil || this.inParty(p);
    if (dancing && inZone('stage', p.x, p.y)) {
      p.dancePts = (p.dancePts || 0) + dt * (2 + 3 * prof.musicLove) * (this.event?.kind === 'danceoff' ? 2 : 1);
      if (p.dancePts >= 1) { const n = Math.floor(p.dancePts); p.dancePts -= n; this.addScore(p, n); if (this.event?.kind === 'danceoff') this.bumpEvent(p, n); }
    }
  }

  inParty(p) { return this.parties.some((q) => Math.hypot(p.x - q.x, p.y - q.y) < q.radius); }

  anim(p) {
    if (p.ride) return 'ride';
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
      if (p.ride) continue;
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
          const pts = COLLECTIBLES[it.type].points;
          this.addScore(p, pts);
          if (this.event?.kind === 'rush') this.bumpEvent(p, pts);
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
      if (p.profile.sociability < 0.6 || p.emote || p.ride || this.time < p.autoWaveAt) continue;
      const near = this.nearby(p, 170);
      if (near.length) {
        this.setEmote(p, 'wave', 2);
        p.autoWaveAt = this.time + 10 + (1 - p.profile.sociability) * 10;
      }
    }
  }

  // ---------------------------------------------------------------- mini-game rounds

  stepEvent() {
    if (!this.event) {
      if (this.time >= this.nextEventAt && this.humanCount > 0) {
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
    if (ranking[0]) this.addScore(this.players.get(ranking[0].id), 50);
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
        off: p.connected ? 0 : 1,
      });
    }
    const snap = { t: round1(this.time), players };
    if (this.itemsDirty) { snap.items = [...this.items.values()].map((i) => [i.id, i.type, Math.round(i.x), Math.round(i.y)]); this.itemsDirty = false; }
    if (this.time - this.lastBoardAt >= 1) {
      this.lastBoardAt = this.time;
      snap.board = [...this.players.values()].sort((a, b) => b.score - a.score).slice(0, 8)
        .map((p) => ({ id: p.id, name: p.name, color: p.color, score: p.score, friends: p.friends.size, cats: p.cats.size }));
      snap.event = this.publicEvent();
      snap.parties = this.parties.map((q) => ({ x: Math.round(q.x), y: Math.round(q.y), r: q.radius }));
    }
    return snap;
  }

  fullState() {
    const s = this.snapshot();
    s.items = [...this.items.values()].map((i) => [i.id, i.type, Math.round(i.x), Math.round(i.y)]);
    return { code: this.code, players: [...this.players.values()].map((p) => this.publicPlayer(p)),
      snapshot: s, chat: this.chatLog.slice(-20), event: this.publicEvent(), cats: CATS.length };
  }

  /** Per-player HUD for the phone, only returned when it changed. */
  hudFor(p) {
    const it = this.interactionFor(p);
    const hud = {
      score: p.score, friends: p.friends.size, cats: p.cats.size, catsTotal: CATS.length,
      stamps: p.stamps.size, stampsTotal: LANDMARKS.length,
      ability: p.profile.ability, abilityIn: Math.max(0, Math.ceil(p.abilityReadyAt - this.time)),
      hint: p.ride ? '🚣 Enjoy the ride…' : it?.label ?? '',
    };
    const key = JSON.stringify(hud);
    if (key === p.hud) return null;
    p.hud = key;
    return hud;
  }
}
