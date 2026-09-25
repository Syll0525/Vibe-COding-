// Classic top-down 2D canvas renderer (used with /display?view=2d — handy on slow machines).

import { COLLECTIBLES } from '/shared/constants.js';
import { WORLD_W, WORLD_H, PLOTS, PLOT_W, PLOT_H, TRACKS, plotCell } from '/shared/map.js';
import { ITEMS, HOUSE_STYLES, HOUSE_ROWS } from '/shared/catalog.js';
import { buildGround, buildProps, drawWater, LABELS, CAT_SPOTS } from './world.js';
import { CharacterView } from './characters.js';
import { Effects } from './fx.js';

export class Renderer2D {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ground = buildGround();
    this.props = buildProps();
    this.views = new Map();
    this.homes = new Map();     // plot -> public home
    this.races = [];
    this.fx = new Effects();
    this.cam = { x: WORLD_W / 2, y: WORLD_H / 2, zoom: 0.4 };
    this.view = null;
    addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(innerWidth * dpr);
    this.canvas.height = Math.round(innerHeight * dpr);
  }

  clearPlayers() { this.views.clear(); }
  addPlayer(info) { this.views.set(info.id, new CharacterView(info)); }
  removePlayer(id) { this.views.delete(id); }
  say(id, text) { this.views.get(id)?.say(text); }
  burst(x, y, h, opts) { this.fx.burst(x, y - h, opts); }
  text(x, y, h, str, color) { this.fx.text(x, y - h, str, color); }
  cycleCamera() { return null; }
  setHome(h) { if (h.owner) this.homes.set(h.plot, h); else this.homes.delete(h.plot); }
  clearHomes() { this.homes.clear(); }
  setRaces(races) { this.races = races; }

  drawHomes(ctx, states) {
    const T = 40;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const plot of PLOTS) {
      const x = plot.x * T, y = plot.y * T;
      ctx.strokeStyle = '#e8d9b5'; ctx.lineWidth = 4; ctx.setLineDash([6, 6]);
      ctx.strokeRect(x + 3, y + 3, PLOT_W * T - 6, PLOT_H * T - 6);
      ctx.setLineDash([]);
      const h = this.homes.get(plot.id);
      if (!h) { ctx.font = 'bold 14px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillText('FREE PLOT', x + PLOT_W * T / 2, y + PLOT_H * T / 2); continue; }
      const inside = states.some((s) => s.x > x && s.x < x + PLOT_W * T && s.y > y && s.y < y + PLOT_H * T);
      const houseY = plot.facing === 'S' ? y : y + (PLOT_H - HOUSE_ROWS) * T;
      ctx.fillStyle = '#e0c29a'; ctx.fillRect(x + 6, houseY + 4, PLOT_W * T - 12, HOUSE_ROWS * T - 8);
      ctx.strokeStyle = h.home.wall; ctx.lineWidth = 8; ctx.strokeRect(x + 6, houseY + 4, PLOT_W * T - 12, HOUSE_ROWS * T - 8);
      for (const it of h.home.items) {
        const cell = plotCell(plot, it.c, it.r);
        ctx.font = '26px serif'; ctx.fillStyle = '#000';
        ctx.fillText(ITEMS[it.id].icon, (cell.tx + 0.5) * T, (cell.ty + 0.5) * T);
      }
      if (!inside) { // roof covers the inside until someone walks in
        ctx.fillStyle = h.home.roof; ctx.globalAlpha = 0.92;
        ctx.fillRect(x + 2, houseY, PLOT_W * T - 4, HOUSE_ROWS * T);
        ctx.globalAlpha = 1;
        ctx.font = '34px serif'; ctx.fillStyle = '#000';
        ctx.fillText(HOUSE_STYLES[h.home.style].icon, x + PLOT_W * T / 2, houseY + HOUSE_ROWS * T / 2);
      }
      const gy = plot.facing === 'S' ? y + PLOT_H * T : y;
      ctx.font = 'bold 15px "Baloo 2", sans-serif';
      const label = `🏠 ${h.name}`;
      const w = ctx.measureText(label).width + 14;
      ctx.fillStyle = h.color; ctx.beginPath(); ctx.roundRect(x + PLOT_W * T / 2 - w / 2, gy - 11, w, 22, 11); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillText(label, x + PLOT_W * T / 2, gy);
    }
  }

  drawRaces(ctx) {
    for (const race of this.races) {
      const track = TRACKS[race.kind];
      track.checkpoints.forEach((cp, i) => {
        const last = i === track.checkpoints.length - 1;
        ctx.strokeStyle = last ? '#ffffff' : '#ffb400'; ctx.lineWidth = 6; ctx.setLineDash(last ? [8, 8] : []);
        ctx.beginPath(); ctx.arc(cp.x * 40, cp.y * 40, track.radius * 0.7, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = 'bold 18px sans-serif'; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(last ? '🏁' : String(i + 1), cp.x * 40, cp.y * 40);
      });
    }
  }
  minimapView() { return this.view && this.view.w < WORLD_W * 0.8 ? this.view : null; }

  updateCamera(states, dt) {
    const { cam, canvas } = this;
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
    const vw = W / cam.zoom, vh = H / cam.zoom;
    cam.x = Math.min(WORLD_W - vw / 2, Math.max(vw / 2, cam.x));
    cam.y = Math.min(WORLD_H - vh / 2, Math.max(vh / 2, cam.y));
    if (vw >= WORLD_W) cam.x = WORLD_W / 2;
    if (vh >= WORLD_H) cam.y = WORLD_H / 2;
    return { x: cam.x - vw / 2, y: cam.y - vh / 2, w: vw, h: vh };
  }

  frame({ states, items, parties, dancing, danceoff, t, dt }) {
    const { ctx, canvas, cam } = this;
    const view = this.view = this.updateCamera(states, dt);
    this.fx.update(dt);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#2f7d3b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(cam.zoom, 0, 0, cam.zoom, -view.x * cam.zoom, -view.y * cam.zoom);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this.ground, 0, 0);
    drawWater(ctx, t, view);

    if (dancing || danceoff) {
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
    for (const p of parties) {
      ctx.strokeStyle = `rgba(123,97,255,${0.3 + Math.sin(t * 8) * 0.15})`;
      ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (0.9 + Math.sin(t * 6) * 0.05), 0, Math.PI * 2); ctx.stroke();
    }
    this.drawHomes(ctx, states);
    this.drawRaces(ctx);
    for (const s of states) {
      if (!s.veh) continue;
      const v = this.views.get(s.id);
      ctx.fillStyle = s.veh === 'kart' ? (v?.color ?? '#ff5a5f') : '#8d5a3b';
      ctx.strokeStyle = '#2b2340'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.roundRect(s.x - (s.veh === 'kart' ? 26 : 44), s.y - 12, s.veh === 'kart' ? 52 : 88, 22, 10); ctx.fill(); ctx.stroke();
    }
    for (const c of CAT_SPOTS) ctx.drawImage(c.art.canvas, c.x + c.art.ox, c.y + c.art.oy + Math.sin(t * 2 + c.tx) * 1.5);

    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const it of items) {
      const bob = Math.sin(t * 3 + it.x) * 4;
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.beginPath(); ctx.ellipse(it.x, it.y + 10, 12, 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.font = '28px serif';
      ctx.fillStyle = '#000';
      ctx.fillText(COLLECTIBLES[it.type].icon, it.x, it.y - 6 + bob);
    }

    const drawables = [];
    for (const p of this.props) {
      if (p.x > view.x + view.w || p.x + p.img.width < view.x || p.y > view.y + view.h || p.y + p.img.height < view.y) continue;
      drawables.push({ y: p.sortY, draw: () => ctx.drawImage(p.img, p.x, p.y) });
    }
    for (const s of states) {
      const v = this.views.get(s.id);
      if (v) drawables.push({ y: s.y, draw: () => v.draw(ctx, s, t) });
    }
    drawables.sort((a, b) => a.y - b.y);
    for (const d of drawables) d.draw();

    ctx.font = 'bold 16px "Baloo 2", sans-serif';
    for (const l of LABELS) {
      const w = ctx.measureText(l.text).width + 14;
      ctx.fillStyle = 'rgba(27,27,47,0.72)';
      ctx.beginPath(); ctx.roundRect(l.x - w / 2, l.y - 11, w, 22, 11); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillText(l.text, l.x, l.y);
    }
    this.fx.draw(ctx);
  }
}
