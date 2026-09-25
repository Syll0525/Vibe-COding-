// 3D projector renderer (Three.js). Same interface as Renderer2D.
//
// Camera modes (press C or the 🎥 button):
//   auto     – street-level chase cam when one player is in, group framing otherwise
//   group    – angled city view that keeps every player on screen
//   follow   – GTA-style chase camera behind one player (rotates between players)
//   overview – slow orbit around the whole city (also used when nobody is playing)

import * as THREE from 'three';
import { TILE, COLLECTIBLES } from '/shared/constants.js';
import { WORLD_W, WORLD_H, LANDMARKS, TILES, T, MAP_W, MAP_H, inZone, TRACKS } from '/shared/map.js';
import { Homes3D } from './homes3d.js';
import { buildCity } from './city.js';
import { Character3D } from './character3d.js';
import { mat, box } from './buildings.js';
import { emojiTexture, dotTexture, shadowTexture, signTexture, canvasTexture } from './textures.js';

const MODES = ['auto', 'group', 'follow', 'overview'];
const MODE_LABEL = { auto: 'Auto', group: 'Everyone', follow: 'Chase cam', overview: 'City tour' };
const LANDMARK_HEIGHT = { dun: 240, fort: 190, courthouse: 190, mosque: 170, cat: 200, astana: 120, museum: 110, tower: 110, temple: 110, museum_small: 110, hawker: 120 };

export class Renderer3D {
  constructor(canvas, overlay, { quality = 'high' } = {}) {
    this.canvas = canvas;
    this.overlay = overlay;
    this.shadows = quality !== 'low';
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality === 'low' ? 1 : 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = this.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 1, 5, 14000);
    this.camera.position.set(WORLD_W / 2, 1400, WORLD_H + 1400);
    this.anim = buildCity(this.scene, { shadows: this.shadows });
    this.stageLights = ['#ff5a5f', '#1fb5ad', '#7b61ff'].map((c) => {
      const l = new THREE.PointLight(c, 0, 420, 1.5);
      l.position.set(23.5 * TILE, 110, 24 * TILE);
      this.scene.add(l);
      return l;
    });

    this.homes = new Homes3D(this.scene, overlay);
    this.gates = this.buildGates();
    this.buildSigns();
    this.chars = new Map();
    this.itemSprites = new Map();
    this.partyRings = [];
    this.particles = [];
    this.texts = [];
    this.cars = this.buildTraffic();
    this.labels = LANDMARKS.map((l) => {
      const el = document.createElement('div');
      el.className = 'ov-label';
      el.textContent = l.name.replace(/ \(DUN\)/, '');
      overlay.append(el);
      return { el, x: (l.x + l.w / 2) * TILE, y: LANDMARK_HEIGHT[l.kind] ?? 110, z: (l.y + l.h / 2) * TILE };
    });

    this.mode = 'auto';
    this.followIdx = 0;
    this.followSwitchAt = 0;
    this.heading = new THREE.Vector3(0, 0, -1);
    this.camPos = this.camera.position.clone();
    this.camLook = new THREE.Vector3(WORLD_W / 2, 0, WORLD_H / 2);
    this.activeMode = 'overview';
    this.v = new THREE.Vector3();

    addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize() {
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.canvas.style.width = '100vw';
    this.canvas.style.height = '100vh';
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
  }

  // ------------------------------------------------------------ renderer interface
  clearPlayers() { for (const c of this.chars.values()) c.dispose(); this.chars.clear(); }
  addPlayer(info) { this.chars.get(info.id)?.dispose(); this.chars.set(info.id, new Character3D(info, this.scene, this.overlay)); }
  removePlayer(id) { this.chars.get(id)?.dispose(); this.chars.delete(id); }
  say(id, text) { this.chars.get(id)?.say(text); }
  setHome(h) { this.homes.set(h); }
  clearHomes() { this.homes.clear(); }
  setRaces(races) {
    for (const kind of Object.keys(this.gates)) {
      const race = races.find((r) => r.kind === kind);
      this.gates[kind].visible = Boolean(race);
    }
  }

  buildGates() {
    const checker = canvasTexture('checker', 64, 16, (c, w, h) => {
      for (let x = 0; x < w; x += 8) for (let y = 0; y < h; y += 8) { c.fillStyle = (x + y) % 16 ? '#111' : '#fff'; c.fillRect(x, y, 8, 8); }
    });
    const gates = {};
    for (const [kind, track] of Object.entries(TRACKS)) {
      const g = new THREE.Group();
      track.checkpoints.forEach((cp, i) => {
        const last = i === track.checkpoints.length - 1;
        const arch = new THREE.Group();
        const w = kind === 'kart' ? 100 : 190;
        const pole = mat(last ? '#ffffff' : ['#ff5a5f', '#ffb400', '#1fb5ad', '#7b61ff'][i % 4]);
        box(arch, 6, 90, 6, pole, -w / 2, 0, 0);
        box(arch, 6, 90, 6, pole, w / 2, 0, 0);
        const banner = new THREE.Mesh(new THREE.BoxGeometry(w + 6, 16, 3), last ? new THREE.MeshStandardMaterial({ map: checker }) : new THREE.MeshStandardMaterial({ map: signTexture(`CHECKPOINT ${i + 1}`, '#ffffff', '#2b2340') }));
        banner.position.y = 90;
        arch.add(banner);
        if (kind === 'boat') for (const x of [-w / 2, w / 2]) { const b = new THREE.Mesh(new THREE.SphereGeometry(10, 10, 8), mat('#ff7043')); b.position.set(x, 2, 0); arch.add(b); }
        // orient the arch across the direction of travel
        const next = track.checkpoints[(i + 1) % track.checkpoints.length], prev = track.checkpoints[(i - 1 + track.checkpoints.length) % track.checkpoints.length];
        const dir = new THREE.Vector2(next.x - prev.x, next.y - prev.y);
        arch.rotation.y = -Math.atan2(dir.y, dir.x) + Math.PI / 2;
        arch.position.set(cp.x * TILE, kind === 'boat' ? 2 : 0, cp.y * TILE);
        g.add(arch);
      });
      g.visible = false;
      this.scene.add(g);
      gates[kind] = g;
    }
    return gates;
  }

  buildSigns() {
    const signs = [
      [TRACKS.kart.sign, '🏁 ROAD RACE', '#ffb400'],
      [TRACKS.boat.sign, '🚣 SAMPAN RACE', '#1fb5ad'],
      [{ x: 30.5, y: 39.2 }, 'TAMAN LUKIS', '#ff5a5f'],
    ];
    for (const [pos, text, color] of signs) {
      const g = new THREE.Group();
      box(g, 4, 60, 4, mat('#555'), -34, 0, 0);
      box(g, 4, 60, 4, mat('#555'), 34, 0, 0);
      const board = new THREE.Mesh(new THREE.BoxGeometry(84, 24, 3), [mat(color), mat(color), mat(color), mat(color),
        new THREE.MeshStandardMaterial({ map: signTexture(text, color, '#ffffff') }), new THREE.MeshStandardMaterial({ map: signTexture(text, color, '#ffffff') })]);
      board.position.y = 60; board.castShadow = true;
      g.add(board);
      g.position.set(pos.x * TILE, 0, pos.y * TILE);
      this.scene.add(g);
    }
  }

  cycleCamera() {
    this.mode = MODES[(MODES.indexOf(this.mode) + 1) % MODES.length];
    this.followSwitchAt = 0;
    return MODE_LABEL[this.mode];
  }
  minimapView() { return this.activeMode === 'overview' ? null : { x: 0, y: 0, w: 0, h: 0 }; }

  burst(x, y, h, { count = 14, icons = null, colors = ['#ff5a5f', '#ffb400', '#1fb5ad', '#7b61ff'], speed = 160, gravity = 260, life = 1 } = {}) {
    for (let i = 0; i < count; i++) {
      const map = icons ? emojiTexture(icons[i % icons.length]) : dotTexture(colors[i % colors.length]);
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false }));
      const size = icons ? 22 + Math.random() * 12 : 8 + Math.random() * 6;
      sprite.scale.set(size, size, 1);
      sprite.position.set(x, h, y);
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.8);
      this.scene.add(sprite);
      this.particles.push({ sprite, vx: Math.cos(a) * v * 0.6, vz: Math.sin(a) * v * 0.6, vy: speed * (0.5 + Math.random() * 0.7), g: gravity, life, max: life });
    }
  }

  text(x, y, h, str, color = '#ffe066') {
    const el = document.createElement('div');
    el.className = 'ov-text';
    el.textContent = str;
    el.style.color = color;
    this.overlay.append(el);
    this.texts.push({ el, x, y: h, z: y, life: 1.4, max: 1.4 });
  }

  // ------------------------------------------------------------ helpers
  project(x, y, z) {
    const v = this.v.set(x, y, z).project(this.camera);
    if (v.z > 1 || v.z < -1) return null;
    const sx = (v.x + 1) / 2 * innerWidth, sy = (1 - v.y) / 2 * innerHeight;
    if (sx < -200 || sx > innerWidth + 200 || sy < -200 || sy > innerHeight + 200) return null;
    const dist = this.camera.position.distanceTo(this.v.set(x, y, z));
    return { x: sx, y: sy, scale: 700 / dist };
  }

  groundAt(x, z) {
    if (inZone('stage', x, z)) return 4;
    const tx = Math.floor(x / TILE), ty = Math.floor(z / TILE);
    if (tx >= 0 && ty >= 0 && tx < MAP_W && ty < MAP_H && TILES[ty * MAP_W + tx] === T.BRIDGE) return 4;
    return 0;
  }

  buildTraffic() {
    const lanes = [
      { z: 26.5 * TILE, dir: -1 }, { z: 27.5 * TILE, dir: 1 },
      { z: 7.5 * TILE - 9, dir: -1 }, { z: 7.5 * TILE + 9, dir: 1 },
      { z: 38.5 * TILE + 9, dir: 1 },
      { z: 45.5 * TILE, dir: -1 }, { z: 46.5 * TILE, dir: 1 },
    ];
    const colors = ['#f6c90e', '#6d4c41', '#c0392b', '#ecf0f1', '#2e86de', '#f6c90e', '#27ae60', '#8e44ad'];
    const cars = [];
    let n = 0;
    for (const lane of lanes) {
      const count = lane.z > 20 * TILE && lane.z < 30 * TILE ? 3 : 2;
      for (let i = 0; i < count; i++) {
        const color = colors[n++ % colors.length];
        const g = new THREE.Group();
        box(g, 58, 14, 28, mat(color, { roughness: 0.4, metalness: 0.3 }), 0, 6, 0);
        box(g, 30, 13, 24, mat('#9fd3f0', { roughness: 0.1, metalness: 0.5 }), -4, 20, 0);
        box(g, 30, 2, 25, mat(color, { roughness: 0.4 }), -4, 33, 0);
        if (color === '#f6c90e' && n % 2) box(g, 12, 6, 8, mat('#ffffff'), -4, 35, 0); // taxi sign
        for (const [wx, wz] of [[-18, -14], [18, -14], [-18, 14], [18, 14]]) {
          const w = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 5, 10), mat('#222'));
          w.rotation.x = Math.PI / 2; w.position.set(wx, 7, wz);
          g.add(w);
        }
        for (const wz of [-9, 9]) box(g, 2, 4, 5, new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#fff6c8', emissiveIntensity: 0.8 }), 29, 10, wz, { shadow: false });
        g.rotation.y = lane.dir > 0 ? 0 : Math.PI;
        g.position.set((i + 0.3 * n) / count * WORLD_W % WORLD_W, 0, lane.z);
        this.scene.add(g);
        cars.push({ obj: g, lane, speed: 0, max: 110 + (n % 3) * 25 });
      }
    }
    return cars;
  }

  updateTraffic(dt, states) {
    for (const car of this.cars) {
      const { obj, lane } = car;
      let blocked = false;
      for (const s of states) {
        const dx = (s.x - obj.position.x) * lane.dir;
        if (dx > 0 && dx < 120 && Math.abs(s.y - lane.z) < 34) { blocked = true; break; }
      }
      for (const other of this.cars) {
        if (other === car || other.lane !== lane) continue;
        const dx = (other.obj.position.x - obj.position.x) * lane.dir;
        if (dx > 0 && dx < 90) { blocked = true; break; }
      }
      const target = blocked ? 0 : car.max;
      car.speed += (target - car.speed) * Math.min(1, dt * (blocked ? 6 : 1.2));
      obj.position.x += car.speed * lane.dir * dt;
      if (obj.position.x > WORLD_W + 150) obj.position.x = -150;
      if (obj.position.x < -150) obj.position.x = WORLD_W + 150;
    }
  }

  // ------------------------------------------------------------ camera
  updateCamera(states, dt, t) {
    const active = states.filter((s) => !s.off);
    let mode = this.mode;
    if (mode === 'auto') mode = active.length === 0 ? 'overview' : active.length === 1 ? 'follow' : 'group';
    if (mode !== 'overview' && active.length === 0) mode = 'overview';
    this.activeMode = mode;
    const pos = new THREE.Vector3(), look = new THREE.Vector3();
    let k = Math.min(1, dt * 2);

    if (mode === 'overview') {
      const a = t * 0.04;
      pos.set(WORLD_W / 2 + Math.sin(a) * 1900, 1250, WORLD_H / 2 + Math.cos(a) * 1600);
      look.set(WORLD_W / 2, 0, WORLD_H / 2);
      k = Math.min(1, dt * 0.8);
    } else if (mode === 'group') {
      let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
      for (const s of active) { minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x); minZ = Math.min(minZ, s.y); maxZ = Math.max(maxZ, s.y); }
      const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
      const spread = Math.max((maxX - minX) / this.camera.aspect * 1.1, maxZ - minZ);
      const dist = Math.min(2600, Math.max(560, spread * 1.25 + 460));
      pos.set(cx, dist * 0.82, cz + dist * 0.66);   // ~50° down: see over the shophouse roofs
      look.set(cx, 20, cz - 30);
    } else {
      if (t > this.followSwitchAt) {
        this.followIdx++;
        this.followSwitchAt = t + 14;
      }
      const s = active[this.followIdx % active.length];
      const prev = this.followPrev?.id === s.id ? this.followPrev : null;
      if (prev) {
        const vx = s.x - prev.x, vz = s.y - prev.y;
        const d = Math.hypot(vx, vz);
        if (d > 0.5) {
          const target = new THREE.Vector3(vx / d, 0, vz / d);
          this.heading.lerp(target, Math.min(1, dt * 2.5)).normalize();
        }
      } else this.heading.set(0, 0, -1);
      this.followPrev = { id: s.id, x: s.x, y: s.y };
      const gy = this.groundAt(s.x, s.y);
      pos.set(s.x - this.heading.x * 230, gy + 125, s.y - this.heading.z * 230);
      look.set(s.x + this.heading.x * 90, gy + 38, s.y + this.heading.z * 90);
      k = Math.min(1, dt * 3.5);
    }
    this.camPos.lerp(pos, k);
    this.camLook.lerp(look, k);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    this.camera.updateMatrixWorld();
  }

  // ------------------------------------------------------------ frame
  frame({ states, items, parties, dancing, danceoff, t, dt }) {
    this.updateCamera(states, dt, t);
    this.updateTraffic(dt, states);

    // ambient animation
    this.anim.water.offset.x = (this.anim.water.offset.x + dt * 0.006) % 1;
    this.anim.water.offset.y = (this.anim.water.offset.y + dt * 0.003) % 1;
    for (const f of this.anim.flags) f.rotation.y = Math.sin(t * 3) * 0.25;
    for (const b of this.anim.boats) {
      b.obj.position.y = b.baseY + Math.sin(t * 2 + b.phase) * 1.5;
      b.obj.rotation.z = Math.sin(t * 1.5 + b.phase) * 0.03;
      if (b.ferry) {
        const u = (Math.sin(t * b.ferry.speed * 2 + b.phase) + 1) / 2;
        b.obj.position.z = b.ferry.z0 + (b.ferry.z1 - b.ferry.z0) * u;
        b.obj.rotation.y = Math.PI / 2 + (Math.cos(t * b.ferry.speed * 2 + b.phase) > 0 ? 0 : Math.PI);
      }
    }
    for (const tl of this.anim.trafficLights) {
      const p = (t + tl.offset) % 12;
      const on = p < 5 ? 2 : p < 6.5 ? 1 : 0;
      tl.bulbs.forEach((b, i) => { b.material.emissiveIntensity = i === on ? 1.6 : 0.05; });
    }
    const party = dancing || danceoff;
    this.anim.stageLights.forEach((l, i) => { l.material.emissiveIntensity = party ? 1 + Math.sin(t * 8 + i) : 0.4; });
    this.stageLights.forEach((l, i) => {
      l.intensity = party ? 60000 * (0.6 + 0.4 * Math.sin(t * 6 + i * 2)) : 0;
      l.position.x = 23.5 * TILE + Math.sin(t * 2 + i * 2) * 110;
      l.position.z = 24 * TILE + Math.cos(t * 1.6 + i) * 40;
    });

    this.homes.update(states, (x, y, z) => this.project(x, y, z), t, dt);

    // characters
    const seen = new Set();
    for (const s of states) {
      const c = this.chars.get(s.id);
      if (!c) continue;
      seen.add(s.id);
      c.update(s, t, dt, this.camera, (x, y, z) => this.project(x, y, z), this.groundAt(s.x, s.y));
    }
    for (const [id, c] of this.chars) if (!seen.has(id)) { c.nameEl.style.display = 'none'; c.headEl.style.display = 'none'; }

    // collectibles
    const live = new Set();
    for (const it of items) {
      live.add(it.id);
      let spr = this.itemSprites.get(it.id);
      if (!spr) {
        spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture(COLLECTIBLES[it.type].icon) }));
        spr.scale.set(36, 36, 1);
        const sh = new THREE.Mesh(new THREE.PlaneGeometry(30, 14), new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }));
        sh.rotation.x = -Math.PI / 2;
        spr.userData.shadow = sh;
        this.scene.add(spr, sh);
        this.itemSprites.set(it.id, spr);
      }
      spr.position.set(it.x, 26 + Math.sin(t * 3 + it.x) * 5, it.y);
      spr.userData.shadow.position.set(it.x, 1.2, it.y);
    }
    for (const [id, spr] of this.itemSprites) {
      if (live.has(id)) continue;
      this.scene.remove(spr, spr.userData.shadow);
      spr.material.dispose();
      this.itemSprites.delete(id);
    }

    // boombox party rings
    while (this.partyRings.length < parties.length) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.93, 1, 48), new THREE.MeshBasicMaterial({ color: '#7b61ff', transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2;
      this.scene.add(ring);
      this.partyRings.push(ring);
    }
    this.partyRings.forEach((ring, i) => {
      const p = parties[i];
      ring.visible = !!p;
      if (!p) return;
      const r = p.r * (0.9 + Math.sin(t * 6) * 0.05);
      ring.scale.set(r, r, r);
      ring.position.set(p.x, 3, p.y);
    });

    // particles + floating texts
    for (const p of this.particles) {
      p.life -= dt;
      p.vy -= p.g * dt;
      p.sprite.position.x += p.vx * dt;
      p.sprite.position.y = Math.max(2, p.sprite.position.y + p.vy * dt);
      p.sprite.position.z += p.vz * dt;
      p.sprite.material.opacity = Math.min(1, (p.life / p.max) * 1.5);
    }
    this.particles = this.particles.filter((p) => {
      if (p.life > 0) return true;
      this.scene.remove(p.sprite); p.sprite.material.dispose();
      return false;
    });
    for (const tx of this.texts) {
      tx.life -= dt;
      tx.y += 45 * dt;
      const pr = this.project(tx.x, tx.y, tx.z);
      tx.el.style.display = pr ? '' : 'none';
      if (pr) {
        tx.el.style.transform = `translate(${pr.x}px, ${pr.y}px) translate(-50%, -50%) scale(${Math.max(0.6, Math.min(1.4, pr.scale))})`;
        tx.el.style.opacity = Math.min(1, (tx.life / tx.max) * 2);
      }
    }
    this.texts = this.texts.filter((tx) => (tx.life > 0 ? true : (tx.el.remove(), false)));

    // landmark labels (hidden in chase cam unless close)
    for (const l of this.labels) {
      const pr = this.project(l.x, l.y, l.z);
      const show = pr && (this.activeMode !== 'follow' || pr.scale > 0.6);
      l.el.style.display = show ? '' : 'none';
      if (show) l.el.style.transform = `translate(${pr.x}px, ${pr.y}px) translate(-50%, -50%)`;
    }

    this.renderer.render(this.scene, this.camera);
  }
}
