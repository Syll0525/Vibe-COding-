// A player's scanned drawing as a standing paper cut-out in the 3D city.
// It always turns to face the camera (billboard) and is animated from the
// AI profile: gait, bounce, idle behaviour, emotes. Name tag, emote and chat
// bubble are crisp HTML elements projected onto the screen.

import * as THREE from 'three';
import { EMOTE_ICONS } from '/shared/constants.js';
import { drawDoodle } from '../art.js';
import { shadowTexture } from './textures.js';
import { buildSampan } from './buildings.js';

export const CHAR_H = 62;
const hash = (s) => { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h) || 1; };
const tmp = new THREE.Vector3();

export class Character3D {
  constructor(info, scene, overlay) {
    this.id = info.id;
    this.scene = scene;
    this.group = new THREE.Group();
    this.pivot = new THREE.Group();     // yaw towards camera
    this.body = new THREE.Group();      // tilt / squash / lift
    this.group.add(this.pivot);
    this.pivot.add(this.body);
    scene.add(this.group);

    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(56, 24), new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 1;
    this.shadow = shadow;
    this.group.add(shadow);

    this.nameEl = document.createElement('div');
    this.nameEl.className = 'ov-name';
    this.nameEl.append(document.createElement('span'));
    this.headEl = document.createElement('div');
    this.headEl.className = 'ov-head';
    this.bubbleEl = Object.assign(document.createElement('div'), { className: 'ov-bubble' });
    this.emoteEl = Object.assign(document.createElement('div'), { className: 'ov-emote' });
    this.headEl.append(this.bubbleEl, this.emoteEl);
    overlay.append(this.nameEl, this.headEl);

    this.facing = 1;
    this.last = null;
    this.flipT = 0;
    this.lookDir = 1;
    this.bubbleUntil = 0;
    this.trail = [];
    this.setInfo(info);
  }

  setInfo(info) {
    this.name = info.name;
    this.color = info.color;
    this.profile = info.profile || {};
    const span = this.nameEl.firstChild;
    span.textContent = `${this.profile.emoji ?? ''} ${info.name}`.trim();
    span.style.background = info.color;
    const useCanvas = () => this.setImage(drawDoodle(this.color, hash(this.name + this.id)));
    if (info.sprite) {
      const img = new Image();
      img.onload = () => this.setImage(img);
      img.onerror = useCanvas;
      img.src = info.sprite;
    } else useCanvas();
  }

  setImage(img) {
    const w = img.width || img.naturalWidth, h = img.height || img.naturalHeight;
    const tex = img instanceof HTMLCanvasElement ? new THREE.CanvasTexture(img) : new THREE.Texture(img);
    tex.needsUpdate = true;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const height = CHAR_H, width = (CHAR_H * w) / h;
    const scale = Math.min(1, 70 / width);          // very wide drawings are shrunk to fit
    const geom = new THREE.PlaneGeometry(width * scale, height * scale);
    geom.translate(0, (height * scale) / 2, 0);
    if (this.mesh) { this.body.remove(this.mesh); this.mesh.geometry.dispose(); }
    this.mesh = new THREE.Mesh(geom, new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, transparent: false }));
    this.mesh.castShadow = true;
    this.mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: 0.5 });
    this.body.add(this.mesh);
    this.height = height * scale;
  }

  say(text) {
    this.bubbleEl.textContent = text;
    this.bubbleUntil = performance.now() + 6000;
  }

  /** @param s interpolated state; @param cam THREE camera; @param proj screen projector */
  update(s, t, dt, cam, project, groundY = 0) {
    const prof = this.profile;
    const gait = prof.gait || 'walk';
    const bounce = 0.4 + (prof.bounce ?? 0.4);
    this.group.position.set(s.x, groundY, s.y);

    // face the camera (y-axis billboard)
    tmp.setFromMatrixPosition(cam.matrixWorld);
    this.pivot.rotation.y = Math.atan2(tmp.x - s.x, tmp.z - s.y);

    // which way are we walking on screen?
    if (this.last) {
      const vx = s.x - this.last.x, vz = s.y - this.last.y;
      if (Math.hypot(vx, vz) > 0.4) {
        const e = cam.matrixWorld.elements;          // camera right vector = first column
        const d = vx * e[0] + vz * e[2];
        if (Math.abs(d) > 0.2) this.facing = d > 0 ? 1 : -1;
      }
    }
    this.last = { x: s.x, y: s.y };

    let rot = 0, bob = 0, sx = 1, sy = 1, lift = 0;
    let facing = this.facing;
    const moving = s.a === 'move';
    const phase = t * (6 + (s.sp || 0) * 8);
    let anim = s.a?.startsWith('idle:') ? s.a.slice(5) : s.a;
    if (moving || anim === 'dance') {
      switch (anim === 'dance' ? 'dance' : gait) {
        case 'robot': bob = Math.abs(Math.round(Math.sin(phase) * 2)) * 2.5; rot = Math.round(Math.sin(phase)) * 0.04; break;
        case 'hop': sy = s.z < 4 ? 0.85 : 1.08; sx = 2 - sy; break;
        case 'waddle': rot = Math.sin(phase * 0.8) * 0.26; bob = Math.abs(Math.sin(phase * 0.8)) * 3; break;
        case 'glide': rot = Math.sin(t * 2) * 0.08; break;
        case 'dance': rot = Math.sin(t * 7) * 0.32; sy = 1 + Math.sin(t * 14) * 0.06; sx = 1 - Math.sin(t * 14) * 0.05; bob = Math.abs(Math.sin(t * 7)) * 8; break;
        case 'zoom': rot = -0.2 * facing; bob = Math.abs(Math.sin(phase * 1.5)) * 3; sx = 1.08; sy = 0.95; break;
        default: bob = Math.abs(Math.sin(phase)) * 5 * bounce; rot = Math.sin(phase) * 0.07;
      }
    } else if (anim === 'spin') {
      sx = Math.cos(t * 4);
    } else if (anim === 'hop') {
      bob = Math.max(0, Math.sin(t * 5)) * 14;
    } else if (anim === 'nap') {
      rot = -0.25; sy = 0.92 + Math.sin(t * 1.5) * 0.03;
    } else if (anim === 'look') {
      if (t - this.flipT > 1.6) { this.flipT = t; this.lookDir *= -1; }
      facing = this.lookDir;
    } else if (anim === 'wave') {
      rot = Math.sin(t * 5) * 0.08;
    } else if (anim !== 'ride') {
      sy = 1 + Math.sin(t * 2.4) * 0.025;
    }
    if (gait === 'glide') lift = 10 + Math.sin(t * 2.2) * 4;
    const z = (s.z || 0) + bob + lift + (anim === 'ride' ? 10 : 0);

    this.body.position.y = z;
    this.body.rotation.z = rot;
    this.body.scale.set(sx * facing, sy, 1);
    if (this.mesh) this.mesh.material.opacity = s.off ? 0.5 : 1;
    this.mesh && (this.mesh.material.transparent = !!s.off);
    const sh = Math.max(0.35, 1 - z / 140);
    this.shadow.scale.set(sh, sh, 1);

    // sampan while riding
    if (anim === 'ride') {
      if (!this.boat) { this.boat = buildSampan('#a0522d'); this.group.add(this.boat); }
      this.boat.visible = true;
      this.boat.rotation.y = Math.PI / 2;
      this.boat.position.y = Math.sin(t * 3) * 1.5;
    } else if (this.boat) this.boat.visible = false;

    // dash afterimages: simple stretch + transparency pulse
    if (s.dash) this.body.scale.x *= 1.15;

    // HTML overlay
    const feet = project(s.x, groundY, s.y);
    const head = project(s.x, groundY + z + (this.height || CHAR_H) + 6, s.y);
    const visible = feet && head;
    this.nameEl.style.display = visible ? '' : 'none';
    this.headEl.style.display = visible ? '' : 'none';
    if (!visible) return;
    const k = Math.max(0.55, Math.min(1.2, feet.scale));
    this.nameEl.style.transform = `translate(${feet.x}px, ${feet.y + 4}px) translate(-50%, 0) scale(${k})`;
    this.headEl.style.transform = `translate(${head.x}px, ${head.y}px) translate(-50%, -100%) scale(${k})`;

    let icon = '';
    if (s.e) icon = EMOTE_ICONS[s.e];
    else if (anim === 'nap' || s.off) icon = '💤';
    else if (anim === 'dance' && !moving) icon = '🎵';
    else if (anim === 'wave') icon = '👋';
    else if (s.mag) icon = '🧲';
    if (this.emoteEl.textContent !== icon) this.emoteEl.textContent = icon;
    const showBubble = performance.now() < this.bubbleUntil;
    this.bubbleEl.style.display = showBubble ? '' : 'none';
  }

  dispose() {
    this.scene.remove(this.group);
    this.nameEl.remove();
    this.headEl.remove();
  }
}
