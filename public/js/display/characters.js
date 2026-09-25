// Renders a player's scanned drawing as an animated character. The AI-generated
// profile (gait, bounce, idle behaviour…) drives the procedural animation here —
// this is the place to plug in skeletal / mesh-deform animation later.

import { EMOTE_ICONS } from '/shared/constants.js';
import { drawDoodle } from './art.js';

const SPRITE_H = 76;   // on-screen height in world units
const hash = (s) => { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h) || 1; };

export class CharacterView {
  constructor(info) {
    this.id = info.id;
    this.update(info);
    this.bubble = null;
    this.trail = [];
    this.flipT = 0;
    this.lookDir = 1;
  }

  update(info) {
    this.name = info.name;
    this.color = info.color;
    this.profile = info.profile;
    this.bot = info.bot;
    this.img = null;
    this.ready = false;
    if (info.sprite) {
      const img = new Image();
      img.onload = () => { this.img = img; this.ready = true; };
      img.onerror = () => { this.img = drawDoodle(this.color, hash(this.id)); this.ready = true; };
      img.src = info.sprite;
    } else {
      this.img = drawDoodle(this.color, hash(this.name + this.id));
      this.ready = true;
    }
  }

  say(text) { this.bubble = { text, until: performance.now() + 6000 }; }

  /**
   * @param ctx  canvas context in world space
   * @param s    interpolated state {x,y,z,f,a,e,sp,dash,mag,off}
   * @param t    seconds (display clock)
   */
  draw(ctx, s, t) {
    if (!this.ready) return;
    const prof = this.profile || {};
    const gait = prof.gait || 'walk';
    const bounce = 0.4 + (prof.bounce ?? 0.4);
    const img = this.img;
    const iw = img.width || img.naturalWidth, ih = img.height || img.naturalHeight;
    const scale = SPRITE_H / Math.max(ih, iw * 0.8);
    const w = iw * scale, h = ih * scale;

    let rot = 0, bob = 0, sx = 1, sy = 1, lift = 0;
    let facing = s.f || 1;
    const moving = s.a === 'move';
    const phase = t * (6 + (s.sp || 0) * 8);
    let anim = s.a;
    if (anim?.startsWith('idle:')) anim = anim.slice(5);

    if (moving || anim === 'dance') {
      switch (anim === 'dance' ? 'dance' : gait) {
        case 'robot': bob = Math.abs(Math.round(Math.sin(phase) * 2)) * 2.5; rot = Math.round(Math.sin(phase)) * 0.04; break;
        case 'hop': sy = s.z < 4 ? 0.85 : 1.08; sx = 2 - sy; break;
        case 'waddle': rot = Math.sin(phase * 0.8) * 0.26; bob = Math.abs(Math.sin(phase * 0.8)) * 3; break;
        case 'glide': rot = Math.sin(t * 2) * 0.08; break;
        case 'dance': rot = Math.sin(t * 7) * 0.32; sy = 1 + Math.sin(t * 14) * 0.06; sx = 1 - Math.sin(t * 14) * 0.05; bob = Math.abs(Math.sin(t * 7)) * 8; break;
        case 'zoom': rot = 0.2 * facing; bob = Math.abs(Math.sin(phase * 1.5)) * 3; sx = 1.08; sy = 0.95; break;
        default: bob = Math.abs(Math.sin(phase)) * 5 * bounce; rot = Math.sin(phase) * 0.07;
      }
    } else if (anim === 'spin') {
      sx = Math.cos(t * 4);
    } else if (anim === 'hop') {
      bob = Math.max(0, Math.sin(t * 5)) * 14;
    } else if (anim === 'nap') {
      rot = 0.25; sy = 0.92 + Math.sin(t * 1.5) * 0.03;
    } else if (anim === 'look') {
      if (t - this.flipT > 1.6) { this.flipT = t; this.lookDir *= -1; }
      facing = this.lookDir;
    } else if (anim === 'wave') {
      rot = Math.sin(t * 5) * 0.08;
    } else if (anim !== 'ride') {
      sy = 1 + Math.sin(t * 2.4) * 0.025; // breathing
    }
    if (gait === 'glide') lift = 10 + Math.sin(t * 2.2) * 4;
    const z = (s.z || 0) + bob + lift;

    // afterimages while dashing
    if (s.dash) {
      this.trail.push({ x: s.x, y: s.y, z, a: 0.45 });
      if (this.trail.length > 6) this.trail.shift();
    } else if (this.trail.length) this.trail.shift();
    for (const tr of this.trail) {
      ctx.globalAlpha = tr.a * 0.5;
      ctx.drawImage(img, tr.x - w / 2, tr.y - h - tr.z, w, h);
    }
    ctx.globalAlpha = 1;

    // sampan boat
    if (s.a === 'ride') {
      ctx.save();
      ctx.translate(s.x, s.y + 4);
      ctx.fillStyle = '#8d5a3b'; ctx.strokeStyle = '#2b2340'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-50, -8); ctx.quadraticCurveTo(0, 26, 50, -8); ctx.quadraticCurveTo(0, 4, -50, -8); ctx.fill(); ctx.stroke();
      ctx.restore();
    }

    // shadow
    const shadowScale = Math.max(0.4, 1 - z / 140);
    ctx.fillStyle = 'rgba(20,20,40,0.25)';
    ctx.beginPath(); ctx.ellipse(s.x, s.y, 22 * shadowScale, 8 * shadowScale, 0, 0, Math.PI * 2); ctx.fill();

    // magnet aura
    if (s.mag) {
      ctx.strokeStyle = `rgba(255,90,95,${0.35 + Math.sin(t * 10) * 0.15})`;
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(s.x, s.y - h / 2, 60 + Math.sin(t * 8) * 6, 0, Math.PI * 2); ctx.stroke();
    }

    ctx.save();
    ctx.translate(s.x, s.y - z);
    ctx.rotate(rot);
    ctx.scale(sx * facing, sy);
    if (s.off) ctx.globalAlpha = 0.45;
    ctx.drawImage(img, -w / 2, -h, w, h);
    ctx.restore();
    ctx.globalAlpha = 1;

    // name tag
    ctx.font = 'bold 15px "Baloo 2", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const label = `${prof.emoji ?? ''} ${this.name}`.trim();
    const tw = ctx.measureText(label).width + 16;
    ctx.fillStyle = this.color;
    ctx.beginPath(); ctx.roundRect(s.x - tw / 2, s.y + 8, tw, 20, 10); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = '#2b2340'; ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.fillText(label, s.x, s.y + 19);

    // status icons above the head
    const top = s.y - z - h - 10;
    let icon = null;
    if (s.e) icon = EMOTE_ICONS[s.e];
    else if (anim === 'nap' || s.off) icon = '💤';
    else if (anim === 'dance' && !moving) icon = '🎵';
    else if (anim === 'wave') icon = '👋';
    if (icon) {
      ctx.font = '30px serif';
      ctx.fillStyle = '#000';
      ctx.fillText(icon, s.x + Math.sin(t * 4) * 3, top - 8 + Math.sin(t * 6) * 3);
    }

    if (this.bubble) {
      if (performance.now() > this.bubble.until) this.bubble = null;
      else drawBubble(ctx, s.x, top - (icon ? 34 : 4), this.bubble.text);
    }
  }
}

function drawBubble(ctx, x, y, text) {
  ctx.font = '600 17px "Baloo 2", sans-serif';
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const wd of words) {
    const test = line ? `${line} ${wd}` : wd;
    if (ctx.measureText(test).width > 220 && line) { lines.push(line); line = wd; } else line = test;
  }
  if (line) lines.push(line);
  const shown = lines.slice(0, 3);
  const w = Math.min(240, Math.max(...shown.map((l) => ctx.measureText(l).width))) + 20;
  const h = shown.length * 20 + 12;
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#2b2340'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.roundRect(x - w / 2, y - h - 10, w, h, 12);
  ctx.moveTo(x - 8, y - 10); ctx.lineTo(x, y); ctx.lineTo(x + 8, y - 10);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#2b2340'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  shown.forEach((l, i) => ctx.fillText(l, x, y - h - 10 + 16 + i * 20));
}
