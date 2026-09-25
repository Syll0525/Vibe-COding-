// Owns every Room, drives their simulation clocks and garbage-collects empty ones.
// Swap this for a Redis/sharded registry later without touching Room or the clients.

import { Room } from './game/Room.js';
import { SIM_HZ } from '../shared/constants.js';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I/O to avoid confusion
const IDLE_ROOM_MS = 10 * 60 * 1000;

export class RoomManager {
  constructor({ onTick, store = null } = {}) {
    this.rooms = new Map();
    this.store = store;
    this.onTick = onTick;
    this.timer = null;
  }

  newCode() {
    for (;;) {
      let code = '';
      for (let i = 0; i < 4; i++) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
      if (!this.rooms.has(code)) return code;
    }
  }

  create() {
    const room = new Room(this.newCode(), { store: this.store });
    this.rooms.set(room.code, room);
    return room;
  }

  get(code) { return this.rooms.get(String(code || '').toUpperCase().trim()); }

  start() {
    const dt = 1 / SIM_HZ;
    let last = performance.now();
    let acc = 0;
    this.timer = setInterval(() => {
      const now = performance.now();
      acc += Math.min(0.25, (now - last) / 1000);
      last = now;
      while (acc >= dt) {
        for (const room of this.rooms.values()) room.tick(dt);
        acc -= dt;
      }
      this.onTick?.(this.rooms);
      this.gc();
    }, 1000 / SIM_HZ);
  }

  stop() { clearInterval(this.timer); }

  gc() {
    const now = Date.now();
    for (const [code, room] of this.rooms) {
      if (room.displayCount > 0 || room.humanCount > 0) { room.lastActivity = Math.max(room.lastActivity, now - 1); continue; }
      if (now - room.lastActivity > IDLE_ROOM_MS) { room.removeAllListeners(); this.rooms.delete(code); }
    }
  }
}
