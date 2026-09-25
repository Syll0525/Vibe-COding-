// Race mini-game used for both the go-kart road race and the sampan river race.
// Lifecycle: lobby (players join) → countdown (frozen on the grid) → running → done.

import { TILE } from '../../shared/constants.js';
import { TRACKS, riverTop, RIVER_HEIGHT, isBlocked } from '../../shared/map.js';

export const LOBBY_SECS = 15;
export const COUNTDOWN_SECS = 3;
export const RACE_LIMIT = { kart: 100, boat: 70 };
export const PRIZES = [60, 40, 25];
export const FINISH_PRIZE = 10;

export class Race {
  constructor(room, kind) {
    this.room = room;
    this.kind = kind;
    this.track = TRACKS[kind];
    this.cps = this.track.checkpoints.map((c) => ({ x: c.x * TILE, y: c.y * TILE }));
    this.state = 'lobby';
    this.until = room.time + LOBBY_SECS;
    this.racers = new Map();   // id -> { cp, lap, finished, time, dist }
    this.results = [];
  }

  get title() { return this.kind === 'kart' ? '🏎️ Road Race' : '🚣 Sampan Race'; }

  join(p) {
    if (this.state !== 'lobby') return { ok: false, error: 'This race already started — wait for the next one!' };
    if (p.game) return { ok: false, error: 'You are already in a game' };
    if (this.racers.size >= this.track.grid.length) return { ok: false, error: 'The race is full' };
    this.racers.set(p.id, { cp: 0, lap: 1, finished: false, time: 0, dist: 0 });
    p.game = this;
    // a new racer buys everyone a little more lobby time
    this.until = Math.max(this.until, this.room.time + 6);
    this.room.emit('all', 'toast', { text: `${this.title}: ${p.name} joined! (${this.racers.size})`, color: p.color });
    return { ok: true };
  }

  leave(id) {
    const p = this.room.players.get(id);
    if (p && p.game === this) this.release(p);
    this.racers.delete(id);
  }

  /** Take a player out of race mode; boaters are put ashore on the Waterfront. */
  release(p) {
    const wasBoat = p.vehicle === 'boat';
    p.game = null; p.vehicle = null; p.frozen = false; p.boatSpeed = 0; p.vx = 0; p.vy = 0;
    if (wasBoat) {
      const tx = Math.max(2, Math.min(61, Math.floor(p.x / TILE)));
      p.x = (tx + 0.5) * TILE;
      p.y = (riverTop(tx) + RIVER_HEIGHT + 0.6) * TILE;
      if (isBlocked(p.x, p.y)) p.y += TILE;
      p.lastSafe = { x: p.x, y: p.y };
    }
  }

  start() {
    this.state = 'countdown';
    this.until = this.room.time + COUNTDOWN_SECS;
    let i = 0;
    for (const id of this.racers.keys()) {
      const p = this.room.players.get(id);
      const [gx, gy] = this.track.grid[i++];
      if (this.kind === 'kart') p.lastSafe = { x: gx * TILE, y: gy * TILE };
      Object.assign(p, { x: gx * TILE, y: gy * TILE, vx: 0, vy: 0, jump: null, ride: null, z: 0,
        vehicle: this.kind, frozen: true, boatSpeed: 0, facing: 1 });
    }
    this.room.emit('all', 'race', { kind: this.kind, state: 'countdown', title: this.title, secs: COUNTDOWN_SECS });
  }

  go() {
    this.state = 'running';
    this.startedAt = this.room.time;
    this.until = this.room.time + RACE_LIMIT[this.kind];
    for (const id of this.racers.keys()) { const p = this.room.players.get(id); if (p) p.frozen = false; }
    this.room.emit('all', 'race', { kind: this.kind, state: 'go', title: this.title });
  }

  tick() {
    for (const id of [...this.racers.keys()]) if (!this.room.players.has(id)) this.racers.delete(id);
    if (!this.racers.size && this.state !== 'lobby') return this.finish();
    if (this.state === 'lobby') {
      if (this.room.time >= this.until) (this.racers.size ? this.start() : this.finish());
      return;
    }
    if (this.state === 'countdown') { if (this.room.time >= this.until) this.go(); return; }
    if (this.state !== 'running') return;

    const r2 = this.track.radius ** 2;
    for (const [id, r] of this.racers) {
      if (r.finished) continue;
      const p = this.room.players.get(id);
      const cp = this.cps[r.cp];
      const dx = p.x - cp.x, dy = p.y - cp.y;
      r.dist = Math.sqrt(dx * dx + dy * dy);
      if (dx * dx + dy * dy < r2) {
        r.cp++;
        if (r.cp >= this.cps.length) {
          if (r.lap >= this.track.laps) {
            r.finished = true;
            r.time = this.room.time - this.startedAt;
            this.results.push(id);
            const place = this.results.length;
            const coins = (PRIZES[place - 1] ?? 0) + FINISH_PRIZE;
            this.room.reward(p, coins);
            this.room.emit('all', 'toast', { text: `${this.title}: ${p.name} finished #${place}! +${coins} 🪙`, color: p.color });
            this.room.emit('display', 'fx', { type: 'finish', id, x: p.x, y: p.y, place });
            this.release(p);
          } else {
            r.lap++; r.cp = 0;
          }
        }
      }
    }
    const everyone = [...this.racers.values()].every((r) => r.finished);
    if (everyone || this.room.time >= this.until) this.finish();
  }

  ranking() {
    return [...this.racers.entries()]
      .map(([id, r]) => ({ id, r, p: this.room.players.get(id) }))
      .filter((x) => x.p)
      .sort((a, b) => {
        if (a.r.finished !== b.r.finished) return a.r.finished ? -1 : 1;
        if (a.r.finished) return a.r.time - b.r.time;
        return (b.r.lap - a.r.lap) || (b.r.cp - a.r.cp) || (a.r.dist - b.r.dist);
      })
      .map(({ id, r, p }, i) => ({ id, name: p.name, color: p.color, pos: i + 1, lap: r.lap, cp: r.cp, finished: r.finished, time: Math.round(r.time * 10) / 10 }));
  }

  /** Per-racer status for the phone HUD. */
  statusFor(id) {
    const r = this.racers.get(id);
    if (!r) return null;
    const rank = this.ranking();
    return {
      kind: this.kind, state: this.state, title: this.title,
      pos: rank.findIndex((x) => x.id === id) + 1, of: rank.length,
      lap: r.lap, laps: this.track.laps, cp: r.cp, cps: this.cps.length,
      secs: Math.max(0, Math.ceil(this.until - this.room.time)), finished: r.finished,
    };
  }

  publicState() {
    return { kind: this.kind, title: this.title, state: this.state, secs: Math.max(0, Math.ceil(this.until - this.room.time)),
      laps: this.track.laps, ranking: this.ranking() };
  }

  finish() {
    if (this.state === 'done') return;
    const rank = this.ranking();
    this.state = 'done';
    for (const id of this.racers.keys()) {
      const p = this.room.players.get(id);
      if (p && p.game === this) this.release(p);
    }
    if (rank.length) this.room.emit('all', 'race', { kind: this.kind, state: 'done', title: this.title, ranking: rank.slice(0, 5) });
    this.room.races[this.kind] = null;
  }
}
