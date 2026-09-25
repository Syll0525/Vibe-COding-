// Simple autonomous "NPC doodle" used to demo the world and to load-test multiplayer.
// Bots drive the same input API as phones, so they exercise the real simulation.

import { MAP_W, MAP_H, isWalkableTile, tileCenter } from '../../shared/map.js';

export class Bot {
  constructor(player, room) {
    this.p = player;
    this.room = room;
    this.target = null;
    this.stuckFor = 0;
    this.thinkIn = 0;
    this.last = { x: player.x, y: player.y };
  }

  pickTarget() {
    const { rand, items } = this.room;
    // sometimes go for a snack, otherwise wander somewhere random
    if (items.size && rand() < 0.5) {
      let best = null, bd = 500;
      for (const it of items.values()) {
        const d = Math.hypot(it.x - this.p.x, it.y - this.p.y);
        if (d < bd) { bd = d; best = it; }
      }
      if (best) return { x: best.x, y: best.y };
    }
    for (let k = 0; k < 30; k++) {
      const tx = Math.floor(this.p.x / 40 + (rand() - 0.5) * 24);
      const ty = Math.floor(this.p.y / 40 + (rand() - 0.5) * 16);
      if (tx > 0 && ty > 0 && tx < MAP_W - 1 && ty < MAP_H - 1 && isWalkableTile(tx, ty)) return tileCenter(tx, ty);
    }
    return null;
  }

  update(dt) {
    const { p, room } = this;
    this.thinkIn -= dt;
    if (!this.target || this.thinkIn <= 0) {
      this.target = this.pickTarget();
      this.thinkIn = 4 + room.rand() * 5;
      if (room.rand() < 0.25) room.handleAction(p.id, { type: 'emote', emote: ['wave', 'dance', 'heart', 'laugh'][Math.floor(room.rand() * 4)] });
      if (room.rand() < 0.15) room.handleAction(p.id, { type: 'ability' });
    }
    if (!this.target) return room.handleInput(p.id, { mx: 0, my: 0 });
    const dx = this.target.x - p.x, dy = this.target.y - p.y;
    const d = Math.hypot(dx, dy);
    if (d < 20) { this.target = null; room.handleInput(p.id, { mx: 0, my: 0 }); return; }
    room.handleInput(p.id, { mx: dx / d, my: dy / d });

    const moved = Math.hypot(p.x - this.last.x, p.y - this.last.y);
    this.last = { x: p.x, y: p.y };
    this.stuckFor = moved < 0.5 ? this.stuckFor + dt : 0;
    if (this.stuckFor > 0.8) { this.target = this.pickTarget(); this.stuckFor = 0; }
  }
}
