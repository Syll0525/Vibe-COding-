// Low-poly 3D models for Kuching landmarks, built from primitives + canvas textures.
// Every builder returns a THREE.Group whose local origin is the footprint's
// north-west ground corner; x runs east (width W), z runs south (depth D).

import * as THREE from 'three';
import { TILE } from '/shared/constants.js';
import {
  shophouseFacade, windowsFacade, woodTexture, roofTiles, stripes, rattanPattern,
  sarawakFlag, clockFace, signTexture,
} from './textures.js';

const mats = new Map();
export function mat(color, opts = {}) {
  const key = `${color}|${JSON.stringify(opts)}`;
  if (!mats.has(key)) mats.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...opts }));
  return mats.get(key);
}
const texMat = (map, extra = {}) => new THREE.MeshStandardMaterial({ map, roughness: 0.9, ...extra });

function add(group, geom, material, x, y, z, { shadow = true } = {}) {
  const m = new THREE.Mesh(geom, material);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  group.add(m);
  return m;
}

/** Box resting on the ground at (x,z) centre; `mats6` optional per-face materials. */
export function box(group, w, h, d, material, x, y, z, opts) {
  return add(group, new THREE.BoxGeometry(w, h, d), material, x, y + h / 2, z, opts);
}

/** Box whose north & south faces show a facade texture. */
function facadeBox(group, w, h, d, side, frontTex, x, z, y = 0, top = side) {
  const front = texMat(frontTex);
  return add(group, new THREE.BoxGeometry(w, h, d), [side, side, top, side, front, front], x, y + h / 2, z);
}

/** Gable roof running along x. */
export function gableRoof(group, len, depth, height, material, x, y, z) {
  const shape = new THREE.Shape();
  shape.moveTo(-depth / 2, 0); shape.lineTo(depth / 2, 0); shape.lineTo(0, height); shape.closePath();
  const geom = new THREE.ExtrudeGeometry(shape, { depth: len, bevelEnabled: false });
  geom.translate(0, 0, -len / 2);
  const m = add(group, geom, material, x, y, z);
  m.rotation.y = Math.PI / 2;
  return m;
}

/** Four-sided hip/pyramid roof with a w×d base. */
export function pyramid(group, w, d, h, material, x, y, z) {
  const geom = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1);
  geom.rotateY(Math.PI / 4);
  geom.translate(0, 0.5, 0);
  geom.scale(w, h, d);
  return add(group, geom, material, x, y, z);
}

function crenellations(group, w, d, y, material, x0 = 0, z0 = 0, size = 10) {
  for (let x = x0 + size / 2; x < x0 + w; x += size * 2) {
    box(group, size, size, size, material, x, y, z0 + size / 2);
    box(group, size, size, size, material, x, y, z0 + d - size / 2);
  }
  for (let z = z0 + size * 1.5; z < z0 + d - size; z += size * 2) {
    box(group, size, size, size, material, x0 + size / 2, y, z);
    box(group, size, size, size, material, x0 + w - size / 2, y, z);
  }
}

function sign(group, text, w, h, x, y, z, bg, fg) {
  const m = add(group, new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: signTexture(text, bg, fg), side: THREE.DoubleSide }), x, y, z, { shadow: false });
  return m;
}

// ---------------------------------------------------------------- cats

/** Chunky cartoon cat. pose: 'sit' | 'stand' | 'lie'. `s` ≈ its height. */
export function buildCat({ color = '#f5a623', s = 60, pose = 'sit', belly = '#ffffff', stripes: striped = false } = {}) {
  const g = new THREE.Group();
  const fur = mat(color, { roughness: 0.6 });
  const light = mat(belly, { roughness: 0.6 });
  const dark = mat('#2b2340');
  const sphere = (r, material, x, y, z, sx = 1, sy = 1, sz = 1) => {
    const m = add(g, new THREE.SphereGeometry(r, 16, 12), material, x, y, z);
    m.scale.set(sx, sy, sz);
    return m;
  };
  let headY, headZ = 0;
  if (pose === 'stand') {
    const body = add(g, new THREE.CapsuleGeometry(s * 0.2, s * 0.42, 6, 14), fur, 0, s * 0.42, 0);
    body.scale.set(1, 1, 0.85);
    sphere(s * 0.14, light, 0, s * 0.45, s * 0.12, 1, 1.4, 0.6);
    sphere(s * 0.07, fur, -s * 0.16, s * 0.62, s * 0.12);           // raised paw
    sphere(s * 0.07, fur, s * 0.14, s * 0.4, s * 0.14);
    sphere(s * 0.09, fur, -s * 0.1, s * 0.05, s * 0.05, 1, 0.6, 1.3); // feet
    sphere(s * 0.09, fur, s * 0.1, s * 0.05, s * 0.05, 1, 0.6, 1.3);
    headY = s * 0.86;
  } else if (pose === 'lie') {
    sphere(s * 0.5, fur, 0, s * 0.32, 0, 0.55, 0.62, 1.15);
    sphere(s * 0.12, fur, -s * 0.16, s * 0.08, s * 0.55, 1, 0.6, 1.4);
    sphere(s * 0.12, fur, s * 0.16, s * 0.08, s * 0.55, 1, 0.6, 1.4);
    headY = s * 0.62; headZ = s * 0.52;
  } else {
    sphere(s * 0.3, fur, 0, s * 0.3, 0, 1, 1.05, 0.95);
    sphere(s * 0.16, light, 0, s * 0.32, s * 0.16, 1, 1.3, 0.6);
    sphere(s * 0.08, fur, -s * 0.1, s * 0.06, s * 0.22, 1, 0.7, 1.3);
    sphere(s * 0.08, fur, s * 0.1, s * 0.06, s * 0.22, 1, 0.7, 1.3);
    headY = s * 0.72;
  }
  // head, ears, face
  sphere(s * 0.2, fur, 0, headY, headZ, 1.1, 1, 1);
  for (const sx of [-1, 1]) {
    const ear = add(g, new THREE.ConeGeometry(s * 0.08, s * 0.16, 4), fur, sx * s * 0.12, headY + s * 0.2, headZ);
    ear.rotation.z = -sx * 0.25;
    sphere(s * 0.03, dark, sx * s * 0.08, headY + s * 0.04, headZ + s * 0.18);
  }
  sphere(s * 0.025, mat('#ff8fb1'), 0, headY - s * 0.03, headZ + s * 0.2);
  sphere(s * 0.07, light, 0, headY - s * 0.07, headZ + s * 0.15, 1.3, 0.8, 0.8);
  // tail
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, s * 0.12, -s * 0.25), new THREE.Vector3(s * 0.22, s * 0.2, -s * 0.35),
    new THREE.Vector3(s * 0.3, s * 0.45, -s * 0.3), new THREE.Vector3(s * 0.26, s * 0.62, -s * 0.2),
  ]);
  add(g, new THREE.TubeGeometry(curve, 12, s * 0.045, 6), fur, 0, 0, 0);
  if (striped) {
    for (let i = 0; i < 3; i++) sphere(s * 0.05, mat('#c26a12'), 0, headY + s * 0.15, headZ + s * (0.02 - i * 0.07), 2.5, 0.4, 0.6);
  }
  return g;
}

/** Kuching's famous cat roundabout: rocky mound with a family of cat statues. */
function catStatue(g, W, D) {
  const cx = W / 2, cz = D / 2;
  const rock = mat('#5f5a57', { flatShading: true });
  const rock2 = mat('#77716d', { flatShading: true });
  // flower bed ring + pedestal
  add(g, new THREE.CylinderGeometry(W * 0.95, W * 1.0, 8, 24), mat('#c5b39a'), cx, 4, cz);
  add(g, new THREE.CylinderGeometry(W * 0.85, W * 0.88, 10, 24), mat('#4caf50'), cx, 9, cz);
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    const r = W * (0.45 + (i % 3) * 0.08);
    const m = add(g, new THREE.DodecahedronGeometry(14 + (i % 4) * 5), i % 2 ? rock : rock2, cx + Math.cos(a) * r, 14 + (i % 3) * 6, cz + Math.sin(a) * r);
    m.rotation.set(i, i * 2, 0);
  }
  add(g, new THREE.DodecahedronGeometry(W * 0.34), rock, cx, 26, cz).scale.set(1, 0.7, 1);
  const tall = buildCat({ color: '#f4f1ea', belly: '#ffffff', s: 150, pose: 'stand' });
  tall.position.set(cx - 6, 42, cz - 8); g.add(tall);
  const orange = buildCat({ color: '#f39c33', s: 80, pose: 'sit', striped: true });
  orange.position.set(cx + 34, 40, cz - 18); orange.rotation.y = -0.4; g.add(orange);
  const lying1 = buildCat({ color: '#f5a623', s: 58, pose: 'lie', striped: true });
  lying1.position.set(cx - 44, 22, cz + 26); lying1.rotation.y = 0.5; g.add(lying1);
  const lying2 = buildCat({ color: '#efe6d8', s: 50, pose: 'lie' });
  lying2.position.set(cx + 30, 22, cz + 34); lying2.rotation.y = -0.3; g.add(lying2);
  const calico = buildCat({ color: '#8d8a86', belly: '#f5f5f5', s: 46, pose: 'sit' });
  calico.position.set(cx - 30, 30, cz - 30); calico.rotation.y = 0.8; g.add(calico);
}

// ---------------------------------------------------------------- buildings

const PASTELS = ['#f7d794', '#f8a5c2', '#9ad0ec', '#c7ecee', '#f3c4fb', '#badc58', '#ffbe76', '#dff9fb', '#f6e58d', '#e8d1ff'];

export function buildBuilding(kind, wT, hT, seed = 0) {
  const g = new THREE.Group();
  const W = wT * TILE, D = hT * TILE;
  const white = mat('#f6f3ec');
  const cx = W / 2, cz = D / 2;

  switch (kind) {
    case 'shophouse': {
      const units = Math.max(1, Math.round(wT / 2));
      const uw = W / units;
      const roof = texMat(roofTiles('#b5533c'));
      for (let i = 0; i < units; i++) {
        const color = PASTELS[(i * 3 + seed * 7) % PASTELS.length];
        const h = 92 + ((i + seed) % 3) * 10;
        const x = uw * i + uw / 2;
        facadeBox(g, uw - 1, h, D, mat(color), shophouseFacade(color, i + seed * 5), x, cz);
        gableRoof(g, uw + 1, D + 10, 26, roof, x, h, cz);
        // five-foot-way canopy on both sides
        box(g, uw, 3, 12, mat('#8d5a3b'), x, 40, -5);
        box(g, uw, 3, 12, mat('#8d5a3b'), x, 40, D + 5);
      }
      break;
    }
    case 'kampung': {
      const wood = mat('#8d5a3b');
      for (const [x, z] of [[6, 6], [W - 6, 6], [6, D - 6], [W - 6, D - 6]]) add(g, new THREE.CylinderGeometry(2.5, 2.5, 24, 6), wood, x, 12, z);
      const walls = texMat(woodTexture(['#b07a4a', '#9c6b3f', '#c48a55'][seed % 3]));
      add(g, new THREE.BoxGeometry(W - 6, 44, D - 6), walls, cx, 24 + 22, cz);
      gableRoof(g, W + 4, D + 8, 30, mat(['#e17055', '#6c5ce7', '#00b894', '#0984e3'][seed % 4], { flatShading: true }), cx, 68, cz);
      box(g, 12, 3, 16, wood, cx, 22, D + 4);
      break;
    }
    case 'astana': {
      facadeBox(g, W, 64, D, white, windowsFacade('#f6f3ec', { cols: 10, rows: 2, shutter: '#1e6f5c' }), cx, cz);
      const red = texMat(roofTiles('#a93226'));
      for (const [x, w] of [[W * 0.17, W * 0.34], [W * 0.5, W * 0.3], [W * 0.83, W * 0.34]]) pyramid(g, w, D + 10, 40, red, x, 64, cz);
      box(g, 30, 36, 8, mat('#6d4c41'), cx, 0, D + 2);
      break;
    }
    case 'dun': {
      facadeBox(g, W, 50, D, white, windowsFacade('#f6f3ec', { cols: 14, rows: 1, win: '#b8c6d1' }), cx, cz);
      for (let x = 14; x < W - 6; x += 24) add(g, new THREE.CylinderGeometry(4, 4, 50, 8), mat('#ffffff'), x, 25, D + 6);
      box(g, W + 10, 6, D + 20, mat('#e8e2d6'), cx, 50, cz);
      // golden terendak (umbrella) roof
      const r = 1;
      const pts = [];
      for (let i = 0; i <= 12; i++) {
        const t = i / 12;
        pts.push(new THREE.Vector2(r * (1 - t) ** 1.6 + 0.001, t));
      }
      const geom = new THREE.LatheGeometry(pts, 16);
      geom.scale(W * 0.62, 150, D * 0.9);
      const gold = new THREE.MeshStandardMaterial({ color: '#f7b500', metalness: 0.55, roughness: 0.3, flatShading: true, emissive: '#5a3a00', emissiveIntensity: 0.25 });
      add(g, geom, gold, cx, 56, cz);
      add(g, new THREE.SphereGeometry(8, 12, 8), gold, cx, 210, cz);
      add(g, new THREE.CylinderGeometry(1.5, 1.5, 30, 6), gold, cx, 225, cz);
      break;
    }
    case 'fort': {
      facadeBox(g, W, 60, D, white, windowsFacade('#fdfdfb', { cols: 6, rows: 1, win: '#34495e' }), cx, cz);
      crenellations(g, W, D, 60, white);
      facadeBox(g, W * 0.38, 118, D * 0.55, white, windowsFacade('#fdfdfb', { cols: 2, rows: 3, win: '#34495e' }), cx, cz);
      crenellations(g, W * 0.38, D * 0.55, 118, white, cx - W * 0.19, cz - D * 0.275, 8);
      box(g, 22, 34, 6, mat('#5d4037'), cx, 0, D + 2);
      add(g, new THREE.CylinderGeometry(1.5, 1.5, 50, 6), mat('#555'), cx, 150, cz);
      const flag = add(g, new THREE.PlaneGeometry(36, 24), new THREE.MeshStandardMaterial({ map: sarawakFlag(), side: THREE.DoubleSide }), cx + 18, 162, cz);
      flag.userData.flag = true;
      break;
    }
    case 'tower': {
      facadeBox(g, W, 84, D, white, windowsFacade('#f7f5ef', { cols: 3, rows: 3, win: '#2d3436' }), cx, cz);
      crenellations(g, W, D, 84, white);
      break;
    }
    case 'museum_small': {
      facadeBox(g, W, 58, D, white, windowsFacade('#fffdf7', { cols: 5, rows: 2, shutter: '#2e7d5b', arch: true }), cx, cz);
      pyramid(g, W + 10, D + 10, 30, texMat(roofTiles('#c0392b')), cx, 58, cz);
      break;
    }
    case 'temple': {
      const red = mat('#c0392b');
      facadeBox(g, W, 46, D, red, windowsFacade('#c0392b', { cols: 4, rows: 1, win: '#f6d365' }), cx, cz);
      gableRoof(g, W + 24, D + 20, 30, mat('#16a085', { flatShading: true }), cx, 46, cz);
      const gold = mat('#f1c40f', { metalness: 0.4, roughness: 0.4 });
      for (const sx of [-1, 1]) { // upturned roof ridge ends (dragons)
        const m = add(g, new THREE.ConeGeometry(6, 26, 5), gold, cx + sx * (W / 2 + 10), 80, cz);
        m.rotation.z = sx * -0.9;
      }
      add(g, new THREE.SphereGeometry(7, 10, 8), gold, cx, 80, cz);
      for (const x of [16, W - 16]) add(g, new THREE.SphereGeometry(7, 10, 8), mat('#e74c3c', { emissive: '#e74c3c', emissiveIntensity: 0.4 }), x, 36, D + 10);
      break;
    }
    case 'courthouse': {
      facadeBox(g, W, 60, D, white, windowsFacade('#fbf8f0', { cols: 8, rows: 2, win: '#8fb3c7', arch: true }), cx, cz);
      pyramid(g, W + 16, D + 16, 26, texMat(roofTiles('#8e4b2c')), cx, 60, cz);
      for (let x = 14; x < W; x += 26) add(g, new THREE.CylinderGeometry(4, 4, 58, 8), mat('#ffffff'), x, 29, D + 10);
      // clock tower
      const tower = add(g, new THREE.BoxGeometry(38, 140, 38), [white, white, white, white, texMat(clockFace()), texMat(clockFace())], cx, 70, D - 10);
      tower.castShadow = true;
      pyramid(g, 44, 44, 34, mat('#8e4b2c'), cx, 140, D - 10);
      break;
    }
    case 'museum': {
      const pattern = rattanPattern();
      const m = texMat(pattern);
      pattern.repeat.set(3, 1);
      add(g, new THREE.BoxGeometry(W, 80, D), [m, m, mat('#d7c3a3'), m, m, m], cx, 40, cz);
      const top = box(g, W + 16, 8, D + 16, mat('#d7c3a3'), cx, 80, cz);
      top.rotation.z = 0.06;
      box(g, W * 0.4, 30, 6, mat('#74b9ff', { metalness: 0.3, roughness: 0.2 }), cx, 0, D + 2);
      break;
    }
    case 'mosque': {
      facadeBox(g, W, 54, D, white, windowsFacade('#fdfbf6', { cols: 6, rows: 1, win: '#55efc4', arch: true }), cx, cz);
      const gold = new THREE.MeshStandardMaterial({ color: '#f9c21a', metalness: 0.5, roughness: 0.3 });
      add(g, new THREE.CylinderGeometry(W * 0.22, W * 0.22, 20, 20), white, cx, 64, cz);
      add(g, new THREE.SphereGeometry(W * 0.24, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), gold, cx, 74, cz);
      add(g, new THREE.ConeGeometry(3, 26, 6), gold, cx, 74 + W * 0.24 + 12, cz);
      for (const [x, z] of [[14, 14], [W - 14, 14], [14, D - 14], [W - 14, D - 14]]) add(g, new THREE.SphereGeometry(12, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), gold, x, 54, z);
      add(g, new THREE.CylinderGeometry(7, 8, 150, 10), white, W - 10, 75, D - 10);
      add(g, new THREE.SphereGeometry(10, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), gold, W - 10, 150, D - 10);
      break;
    }
    case 'hawker': {
      const post = mat('#636e72');
      for (const [x, z] of [[4, 4], [W - 4, 4], [4, D - 4], [W - 4, D - 4], [cx, 4], [cx, D - 4]]) add(g, new THREE.CylinderGeometry(2.5, 2.5, 56, 6), post, x, 28, z);
      const awning = stripes('#e84393', '#ffffff', 12);
      const roofMat = texMat(awning);
      gableRoof(g, W + 10, D + 14, 22, roofMat, cx, 56, cz);
      sign(g, 'TOP SPOT FOOD COURT', 110, 26, cx, 90, D + 8, '#fff4d6', '#c0392b');
      for (let i = 0; i < 3; i++) box(g, 30, 22, 14, mat(['#fdcb6e', '#74b9ff', '#55efc4'][i]), 22 + i * 38, 0, 16);
      for (let i = 0; i < 4; i++) {
        add(g, new THREE.CylinderGeometry(9, 9, 2, 12), mat('#ffffff'), 24 + i * 34, 20, D - 28);
        add(g, new THREE.CylinderGeometry(1.5, 1.5, 20, 6), post, 24 + i * 34, 10, D - 28);
      }
      break;
    }
    case 'cat': catStatue(g, W, D); break;
    default: box(g, W, 60, D, mat('#dfe6e9'), cx, 0, cz);
  }
  return g;
}

/** A waterfront sampan (river boat). Returns a group with its bow pointing +x. */
export function buildSampan(color = '#8d5a3b') {
  const g = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(-55, 0); shape.quadraticCurveTo(0, -16, 55, 0); shape.quadraticCurveTo(0, 16, -55, 0);
  const hull = new THREE.ExtrudeGeometry(shape, { depth: 12, bevelEnabled: false });
  hull.rotateX(Math.PI / 2);
  hull.translate(0, 12, 0);
  add(g, hull, mat(color), 0, 0, 0);
  const roof = add(g, new THREE.CylinderGeometry(14, 14, 36, 10, 1, true, 0, Math.PI), mat('#2e86de', { side: THREE.DoubleSide }), -8, 14, 0);
  roof.rotation.z = Math.PI / 2;
  return g;
}
