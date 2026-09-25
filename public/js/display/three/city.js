// Assembles the static 3D Kuching: ground, river, bridge, buildings, trees, street
// furniture and distant scenery. Returns handles for things that animate.

import * as THREE from 'three';
import { TILE } from '/shared/constants.js';
import {
  MAP_W, MAP_H, WORLD_W, WORLD_H, TILES, T, SOLIDS, DECOR, ZONES, JETTIES, HIDDEN_CATS,
  riverTop, RIVER_HEIGHT, mulberry32, tileCenter,
} from '/shared/map.js';
import { buildGround } from '../world.js';
import { buildBuilding, buildCat, buildSampan, mat, box } from './buildings.js';
import { waterTexture, danceFloor, skyTexture, canvasTexture } from './textures.js';

const tileAt = (x, y) => (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H ? T.JUNGLE : TILES[y * MAP_W + x]);

function instanced(geom, material, matrices, { shadow = true } = {}) {
  const m = new THREE.InstancedMesh(geom, material, Math.max(1, matrices.length));
  matrices.forEach((mx, i) => m.setMatrixAt(i, mx));
  m.count = matrices.length;
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}
const M = (x, y, z, sx = 1, sy = 1, sz = 1, ry = 0, rx = 0, rz = 0) => new THREE.Matrix4().compose(
  new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));

export function buildCity(scene, { shadows = true } = {}) {
  const anim = { water: null, flags: [], trafficLights: [], stageLights: [], boats: [] };

  // ------------------------------------------------------------ sky + light
  const sky = new THREE.Mesh(new THREE.SphereGeometry(9000, 24, 16), new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false }));
  sky.position.set(WORLD_W / 2, 0, WORLD_H / 2);
  scene.add(sky);
  scene.fog = new THREE.Fog('#f1dfbf', 2600, 8000);
  scene.add(new THREE.HemisphereLight('#dcecff', '#8a7a5a', 1.4));
  const sun = new THREE.DirectionalLight('#fff1d6', 2.4);
  sun.position.set(WORLD_W / 2 - 900, 1500, WORLD_H / 2 + 700);
  sun.target.position.set(WORLD_W / 2, 0, WORLD_H / 2);
  if (shadows) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    const sc = sun.shadow.camera;
    sc.left = -1800; sc.right = 1800; sc.top = 1400; sc.bottom = -1400; sc.near = 100; sc.far = 4000;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 1.5;
  }
  scene.add(sun, sun.target);

  // ------------------------------------------------------------ ground
  const groundCanvas = buildGround();
  const groundTex = new THREE.CanvasTexture(groundCanvas);
  groundTex.colorSpace = THREE.SRGBColorSpace;
  groundTex.anisotropy = 8;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_W, WORLD_H), new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(WORLD_W / 2, 0, WORLD_H / 2);
  ground.receiveShadow = true;
  scene.add(ground);
  // surrounding countryside so the edges don't look like a table top
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(20000, 20000), mat('#4f8f3f'));
  outer.rotation.x = -Math.PI / 2;
  outer.position.set(WORLD_W / 2, -1, WORLD_H / 2);
  scene.add(outer);

  // ------------------------------------------------------------ river
  const shape = new THREE.Shape();
  shape.moveTo(-400, riverTop(0) * TILE);
  for (let x = 0; x <= MAP_W; x++) shape.lineTo(x * TILE, riverTop(Math.min(MAP_W - 1, x)) * TILE);
  shape.lineTo(WORLD_W + 400, riverTop(MAP_W - 1) * TILE);
  shape.lineTo(WORLD_W + 400, (riverTop(MAP_W - 1) + RIVER_HEIGHT) * TILE);
  for (let x = MAP_W; x >= 0; x--) shape.lineTo(x * TILE, (riverTop(Math.min(MAP_W - 1, x)) + RIVER_HEIGHT) * TILE);
  shape.lineTo(-400, (riverTop(0) + RIVER_HEIGHT) * TILE);
  const wtex = waterTexture();
  wtex.repeat.set(0.004, 0.004);
  const water = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshStandardMaterial({ map: wtex, color: '#7cc3ea', roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.92, side: THREE.DoubleSide }));
  water.rotation.x = Math.PI / 2;           // shape y → world z
  water.position.y = 1.5;
  water.receiveShadow = true;
  scene.add(water);
  anim.water = wtex;

  // riverside railing along the Waterfront + embankment walls
  const rails = [], posts = [];
  for (let x = 0; x < MAP_W; x++) {
    const zS = (riverTop(x) + RIVER_HEIGHT) * TILE, zN = riverTop(x) * TILE;
    if (x >= 30 && x <= 32) continue;
    rails.push(M(x * TILE + TILE / 2, 16, zS + 2, TILE, 1, 1));
    posts.push(M(x * TILE + 4, 8, zS + 2));
    rails.push(M(x * TILE + TILE / 2, 3, zN - 2, TILE, 1, 1));
  }
  scene.add(instanced(new THREE.BoxGeometry(1, 3, 3), mat('#fafafa'), rails));
  scene.add(instanced(new THREE.BoxGeometry(3, 16, 3), mat('#2d3436'), posts));

  // ------------------------------------------------------------ Darul Hana bridge
  const bx0 = 30 * TILE, bx1 = 33 * TILE, bz0 = (riverTop(31) - 1) * TILE, bz1 = (riverTop(31) + RIVER_HEIGHT) * TILE;
  const bridge = new THREE.Group();
  box(bridge, bx1 - bx0, 4, bz1 - bz0, mat('#e9c46a'), (bx0 + bx1) / 2, 0, (bz0 + bz1) / 2);
  for (const x of [bx0 + 2, bx1 - 2]) box(bridge, 3, 14, bz1 - bz0, mat('#ffffff'), x, 4, (bz0 + bz1) / 2);
  const towerMat = mat('#f4c430', { metalness: 0.3, roughness: 0.4 });
  const midZ = (bz0 + bz1) / 2;
  for (const x of [bx0 - 12, bx1 + 12]) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(5, 12, 260, 8), towerMat);
    t.position.set(x, 130, midZ); t.castShadow = true;
    bridge.add(t);
    const orb = new THREE.Mesh(new THREE.SphereGeometry(12, 12, 8), towerMat);
    orb.position.set(x, 265, midZ); bridge.add(orb);
    // cables fanning to the deck
    const pts = [];
    for (let k = 0; k < 7; k++) {
      const z = bz0 + ((bz1 - bz0) * k) / 6;
      pts.push(new THREE.Vector3(x, 240, midZ), new THREE.Vector3(x < bx0 ? bx0 + 2 : bx1 - 2, 14, z));
    }
    bridge.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: '#fff7d6' })));
  }
  scene.add(bridge);

  // ------------------------------------------------------------ buildings + landmarks
  let seed = 0;
  for (const s of SOLIDS) {
    const b = buildBuilding(s.kind, s.w, s.h, seed++);
    b.position.set(s.x * TILE, 0, s.y * TILE);
    b.traverse((o) => { if (o.userData.flag) anim.flags.push(o); });
    scene.add(b);
  }

  // Waterfront stage with truss and speakers
  const st = ZONES.find((z) => z.id === 'stage');
  const stage = new THREE.Group();
  const floor = new THREE.Mesh(new THREE.BoxGeometry(st.w * TILE, 4, st.h * TILE), [mat('#333'), mat('#333'), new THREE.MeshStandardMaterial({ map: danceFloor(), emissive: '#ffffff', emissiveMap: danceFloor(), emissiveIntensity: 0.25 }), mat('#333'), mat('#333'), mat('#333')]);
  floor.position.set((st.x + st.w / 2) * TILE, 2, (st.y + st.h / 2) * TILE);
  floor.receiveShadow = true;
  stage.add(floor);
  const truss = mat('#9aa0a6', { metalness: 0.6, roughness: 0.4 });
  const sx0 = st.x * TILE, sx1 = (st.x + st.w) * TILE, sz0 = st.y * TILE;
  for (const x of [sx0 + 4, sx1 - 4]) box(stage, 6, 130, 6, truss, x, 0, sz0 + 4);
  box(stage, sx1 - sx0, 6, 6, truss, (sx0 + sx1) / 2, 128, sz0 + 4);
  for (const x of [sx0 + 18, sx1 - 18]) box(stage, 22, 44, 18, mat('#1e1e24'), x, 4, sz0 + 14);
  for (let i = 0; i < 4; i++) {
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(5, 7, 12, 8), new THREE.MeshStandardMaterial({ color: '#222', emissive: ['#ff5a5f', '#1fb5ad', '#ffb400', '#7b61ff'][i], emissiveIntensity: 1 }));
    lamp.position.set(sx0 + 40 + i * ((sx1 - sx0 - 80) / 3), 120, sz0 + 4);
    stage.add(lamp);
    anim.stageLights.push(lamp);
  }
  scene.add(stage);

  // Jetty platforms + moored sampans
  for (const j of JETTIES) {
    const c = tileCenter(j.tx, j.ty);
    box(scene, 50, 4, 36, mat('#8d6e63'), c.x, 0, c.y);
  }
  for (const [x, z, ry] of [[16.5, 16.2, 0.2], [20, 18.8, -0.1], [53, 16.8, 0], [57.2, 18.7, 0.3], [8, 17.5, 0.5]]) {
    const b = buildSampan(['#8d5a3b', '#a0522d', '#6d4c41'][Math.round(x) % 3]);
    b.position.set(x * TILE, 0, z * TILE);
    b.rotation.y = ry;
    scene.add(b);
    anim.boats.push({ obj: b, baseY: 0, phase: x });
  }
  // a couple of sampans ferrying across the river (cosmetic)
  for (const [x, speed] of [[12, 0.12], [45, -0.1]]) {
    const b = buildSampan('#7a4a2b');
    b.position.set(x * TILE, 0, (riverTop(x) + 2.5) * TILE);
    scene.add(b);
    anim.boats.push({ obj: b, baseY: 0, phase: x, ferry: { x: x * TILE, speed, z0: (riverTop(x) + 0.7) * TILE, z1: (riverTop(x) + 4.3) * TILE } });
  }

  // Hidden cats: small real cats lounging around the city
  const catColors = ['#f39c12', '#dfe6e9', '#636e72', '#e17055', '#f5f5f5', '#2d3436', '#f5a623', '#b2bec3'];
  HIDDEN_CATS.forEach((c, i) => {
    const cat = buildCat({ color: catColors[i % catColors.length], s: 22, pose: i % 3 === 0 ? 'lie' : 'sit', striped: i % 2 === 0 });
    const p = tileCenter(c.tx, c.ty);
    cat.position.set(p.x, 0, p.y);
    cat.rotation.y = i * 1.3;
    scene.add(cat);
  });

  // ------------------------------------------------------------ vegetation
  const rand = mulberry32(7);
  const trunks = [], crowns = [], crowns2 = [], palmTrunks = [], fronds = [];
  const addTree = (x, z, s, dense = false) => {
    trunks.push(M(x, 18 * s, z, s, s, s));
    crowns.push(M(x, 50 * s, z, s * (1 + rand() * 0.2), s * 0.9, s * (1 + rand() * 0.2), rand() * 3));
    crowns2.push(M(x + 10 * s, (dense ? 70 : 64) * s, z - 6 * s, s * 0.7, s * 0.7, s * 0.7, rand() * 3));
  };
  const addPalm = (x, z, s) => {
    const lean = (rand() - 0.5) * 0.25;
    palmTrunks.push(M(x, 45 * s, z, s, s, s, 0, 0, lean));
    const topX = x - Math.sin(lean) * 90 * s, topY = 90 * s;
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2 + rand();
      fronds.push(M(topX + Math.cos(a) * 22 * s, topY - 6 * s, z + Math.sin(a) * 22 * s, s, s, s, -a, 0, -0.4));
    }
  };
  for (const t of DECOR.trees) (t.kind === 'palm' ? addPalm : addTree)(t.x, t.y, t.s);
  for (const l of DECOR.lamps) addPalm(l.x + 60, l.y + 6, 0.9);
  // rainforest border (jungle tiles) + outer forest ring
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
    if (tileAt(x, y) !== T.JUNGLE) continue;
    addTree((x + 0.5) * TILE + (rand() - 0.5) * 20, (y + 0.5) * TILE + (rand() - 0.5) * 20, 1.3 + rand() * 0.6, true);
  }
  for (let i = 0; i < 200; i++) {
    const side = i % 4;
    const u = rand();
    // the south side faces the default camera: keep that ring sparse and further out
    const d = side === 1 ? 700 + rand() * 900 : 60 + rand() * 500;
    if (side === 1 && rand() < 0.5) continue;
    const x = side < 2 ? u * WORLD_W : side === 2 ? -d : WORLD_W + d;
    const z = side === 0 ? -d : side === 1 ? WORLD_H + d : u * WORLD_H;
    if (side >= 2 && Math.abs(z - (riverTop(0) + 2.5) * TILE) < 130) continue; // river exits
    (rand() < 0.3 ? addPalm : addTree)(x, z, 1.4 + rand() * 0.8);
  }
  const leaf = mat('#3fae49', { flatShading: true });
  const leaf2 = mat('#5ec95e', { flatShading: true });
  const bark = mat('#795548');
  scene.add(instanced(new THREE.CylinderGeometry(4, 6, 36, 6), bark, trunks));
  scene.add(instanced(new THREE.IcosahedronGeometry(28, 0), leaf, crowns));
  scene.add(instanced(new THREE.IcosahedronGeometry(22, 0), leaf2, crowns2));
  scene.add(instanced(new THREE.CylinderGeometry(3, 5, 90, 6), mat('#8d6e63'), palmTrunks));
  const frondGeom = new THREE.BoxGeometry(44, 2, 12);
  scene.add(instanced(frondGeom, mat('#2ecc71', { flatShading: true }), fronds));

  // ------------------------------------------------------------ street furniture
  // Curbs along every road edge (raised pavements like the reference)
  const curbs = [];
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
    if (tileAt(x, y) !== T.ROAD) continue;
    const px = x * TILE, pz = y * TILE;
    const land = (t) => t !== T.ROAD && t !== T.WATER && t !== T.JUNGLE && t !== T.BRIDGE;
    if (land(tileAt(x, y - 1))) curbs.push(M(px + TILE / 2, 1.5, pz, TILE, 1, 1));
    if (land(tileAt(x, y + 1))) curbs.push(M(px + TILE / 2, 1.5, pz + TILE, TILE, 1, 1));
    if (land(tileAt(x - 1, y))) curbs.push(M(px, 1.5, pz + TILE / 2, 1, 1, TILE));
    if (land(tileAt(x + 1, y))) curbs.push(M(px + TILE, 1.5, pz + TILE / 2, 1, 1, TILE));
  }
  scene.add(instanced(new THREE.BoxGeometry(1, 3, 1), mat('#bdb5a6'), curbs, { shadow: false }));

  // Street lamps along the Waterfront
  const lampPosts = [], lampHeads = [];
  for (const l of DECOR.lamps) { lampPosts.push(M(l.x, 30, l.y)); lampHeads.push(M(l.x, 62, l.y)); }
  scene.add(instanced(new THREE.CylinderGeometry(2, 3, 60, 6), mat('#2d3436'), lampPosts));
  scene.add(instanced(new THREE.SphereGeometry(7, 10, 8), new THREE.MeshStandardMaterial({ color: '#fff4c2', emissive: '#ffe08a', emissiveIntensity: 0.6 }), lampHeads));

  // Power poles + sagging wires along Main Bazaar and the north road (very San Andreas)
  const poles = [], wirePts = [];
  for (const [row, side] of [[26, -10], [27, TILE + 10], [7, -10]]) {
    let prev = null;
    for (let x = 2; x < MAP_W - 1; x += 5) {
      const px = x * TILE, pz = row * TILE + side;
      if (SOLIDS.some((s) => px > s.x * TILE - 10 && px < (s.x + s.w) * TILE + 10 && pz > s.y * TILE - 10 && pz < (s.y + s.h) * TILE + 10)) { prev = null; continue; }
      poles.push(M(px, 60, pz));
      const top = new THREE.Vector3(px, 112, pz);
      if (prev) {
        for (const dy of [0, -8]) {
          const a = prev.clone().setY(prev.y + dy), b = top.clone().setY(top.y + dy);
          const mid = a.clone().lerp(b, 0.5).setY(Math.min(a.y, b.y) - 18);
          const curve = new THREE.QuadraticBezierCurve3(a, mid, b).getPoints(8);
          for (let i = 0; i < curve.length - 1; i++) wirePts.push(curve[i], curve[i + 1]);
        }
      }
      prev = top;
    }
  }
  scene.add(instanced(new THREE.CylinderGeometry(2.5, 3.5, 120, 6), mat('#6d5a48'), poles));
  scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(wirePts), new THREE.LineBasicMaterial({ color: '#222222' })));

  // Traffic lights where the side streets meet Main Bazaar
  for (const x of [12, 30, 40, 52]) {
    const px = x * TILE - 6, pz = 28 * TILE + 6;
    const g = new THREE.Group();
    box(g, 4, 110, 4, mat('#555'), 0, 0, 0);
    box(g, 70, 4, 4, mat('#555'), 35, 106, 0);
    box(g, 12, 30, 12, mat('#222'), 64, 76, 0);
    const bulbs = ['#ff3b30', '#ffcc00', '#34c759'].map((c, i) => {
      const b = new THREE.Mesh(new THREE.SphereGeometry(4, 8, 6), new THREE.MeshStandardMaterial({ color: '#333', emissive: c, emissiveIntensity: 0 }));
      b.position.set(64, 99 - i * 9, 7);
      g.add(b);
      return b;
    });
    g.position.set(px, 0, pz);
    g.rotation.y = Math.PI; // arm reaches over the road
    scene.add(g);
    anim.trafficLights.push({ bulbs, offset: x });
  }

  // ------------------------------------------------------------ distant scenery
  // Mount Santubong across the river to the north, hills all around
  const hillMat = mat('#6f9f73', { flatShading: true });
  const farHill = mat('#8fb39a', { flatShading: true });
  const santubong = new THREE.Mesh(new THREE.ConeGeometry(900, 900, 9), hillMat);
  santubong.position.set(WORLD_W * 0.72, 350, -1500);
  santubong.scale.set(1.3, 1, 1);
  scene.add(santubong);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const h = new THREE.Mesh(new THREE.ConeGeometry(500 + (i % 3) * 200, 350 + (i % 4) * 120, 7), farHill);
    h.position.set(WORLD_W / 2 + Math.cos(a) * 4200, 100, WORLD_H / 2 + Math.sin(a) * 3600);
    scene.add(h);
  }
  // Modern Kuching skyline behind the old town (south)
  const towerColors = ['#cfd8dc', '#b0bec5', '#e0e0e0', '#90a4ae', '#d7ccc8'];
  for (let i = 0; i < 12; i++) {
    const g = new THREE.Group();
    const h = 220 + ((i * 97) % 280);
    const w = 90 + ((i * 53) % 80);
    const glass = canvasTexture(`glass-${i % 3}`, 64, 128, (c, W, H) => {
      c.fillStyle = towerColors[i % towerColors.length]; c.fillRect(0, 0, W, H);
      c.fillStyle = 'rgba(40,70,100,0.55)';
      for (let y = 6; y < H; y += 12) for (let x = 6; x < W; x += 14) c.fillRect(x, y, 9, 7);
    });
    const m = new THREE.MeshStandardMaterial({ map: glass, roughness: 0.6 });
    box(g, w, h, w * 0.8, m, 0, 0, 0, { shadow: false });
    g.position.set(200 + i * 210 + ((i * 31) % 60), 0, WORLD_H + 1500 + ((i * 71) % 500));
    scene.add(g);
  }

  return anim;
}
