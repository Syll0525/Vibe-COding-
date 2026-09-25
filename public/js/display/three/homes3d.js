// Taman Lukis housing estate: renders every player's home on its plot.
// When someone walks into a house, its roof and front wall lift away (Sims-style
// cutaway) so everyone on the big screen can see the furniture inside.

import * as THREE from 'three';
import { TILE } from '/shared/constants.js';
import { PLOTS, PLOT_W, PLOT_H } from '/shared/map.js';
import { HOUSE_ROWS } from '/shared/catalog.js';
import { mat, box, gableRoof } from './buildings.js';
import { buildItem } from './furniture.js';
import { woodTexture, shophouseFacade, roofTiles, signTexture } from './textures.js';

const W = PLOT_W * TILE, D = PLOT_H * TILE, HD = HOUSE_ROWS * TILE;

function texMat(map) { return new THREE.MeshStandardMaterial({ map, roughness: 0.9 }); }

/** Picket fence around a plot with a gate gap at the front (local +z side). */
function buildFence(g) {
  const wood = mat('#e8d9b5');
  const posts = [];
  for (let x = 4; x <= W - 4; x += 12) { posts.push([x, 2]); if (Math.abs(x - W / 2) > 26) posts.push([x, D - 2]); }
  for (let z = 14; z <= D - 14; z += 12) { posts.push([2, z]); posts.push([W - 2, z]); }
  const geom = new THREE.BoxGeometry(3, 14, 3);
  const inst = new THREE.InstancedMesh(geom, wood, posts.length);
  posts.forEach(([x, z], i) => inst.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, 7, z)));
  inst.castShadow = true;
  g.add(inst);
}

/** House shell for a style. Returns { group, roof: Object3D[], front: Object3D[], floorY }. */
function buildHouse(style, wall, roof) {
  const g = new THREE.Group();
  const cut = [];        // things hidden when someone is inside
  let floorY = 2, H = 64;
  const wallMat = style === 'kampung' || style === 'longhouse' ? texMat(woodTexture(wall)) : mat(wall);
  const addWalls = (y0, h) => {
    box(g, W - 8, h, 4, wallMat, W / 2, y0, 6);                    // back
    box(g, 4, h, HD - 8, wallMat, 6, y0, HD / 2);                  // left
    box(g, 4, h, HD - 8, wallMat, W - 6, y0, HD / 2);              // right
    const front = new THREE.Group();
    const side = (W - 8 - 44) / 2;
    box(front, side, h, 4, wallMat, 4 + side / 2, y0, HD - 4);
    box(front, side, h, 4, wallMat, W - 4 - side / 2, y0, HD - 4);
    box(front, 44, h - 38, 4, wallMat, W / 2, y0 + 38, HD - 4);    // above the door
    g.add(front);
    cut.push(front);
  };

  if (style === 'kampung' || style === 'longhouse') {
    floorY = style === 'longhouse' ? 18 : 12;
    H = style === 'longhouse' ? 52 : 58;
    const wood = mat('#6d4c41');
    for (let x = 12; x < W; x += 54) for (const z of [10, HD - 10]) box(g, 5, floorY, 5, wood, x, 0, z);
    box(g, W - 4, 3, HD - 4, mat('#b98a5a'), W / 2, floorY - 3, HD / 2);
    // stairs to the door
    for (let i = 0; i < 3; i++) box(g, 30, 3, 8, wood, W / 2, (floorY / 3) * i, HD + 4 + (2 - i) * 7);
    addWalls(floorY, H);
    const r = gableRoof(g, W + 16, HD + (style === 'longhouse' ? 50 : 22), style === 'longhouse' ? 44 : 38,
      texMat(roofTiles(roof)), W / 2, floorY + H, HD / 2 + (style === 'longhouse' ? 14 : 0));
    cut.push(r);
    if (style === 'longhouse') { // open ruai veranda posts
      for (let x = 12; x < W; x += 36) box(g, 4, H, 4, wood, x, floorY, HD + 22);
      box(g, W - 4, 3, 30, mat('#b98a5a'), W / 2, floorY - 3, HD + 14);
    }
  } else if (style === 'shophouse') {
    H = 96;
    box(g, W - 4, 2, HD - 4, mat('#e0c9a6'), W / 2, 0, HD / 2);
    addWalls(floorY, H);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(W - 30, 70), texMat(shophouseFacade(wall, 3)));
    sign.position.set(W / 2, floorY + H - 40, HD - 1.5);
    g.add(sign); cut.push(sign);
    const r = gableRoof(g, W + 8, HD + 14, 30, texMat(roofTiles(roof)), W / 2, floorY + H, HD / 2);
    cut.push(r);
    box(g, W, 3, 16, mat('#8d5a3b'), W / 2, 40, HD + 6);        // five-foot-way canopy
  } else { // modern bungalow
    H = 66;
    box(g, W - 4, 2, HD - 4, mat('#dfe6e9'), W / 2, 0, HD / 2);
    addWalls(floorY, H);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(W * 0.3, 30, 2), new THREE.MeshStandardMaterial({ color: '#9fd3f0', roughness: 0.1, metalness: 0.4, transparent: true, opacity: 0.8 }));
    glass.position.set(W * 0.22, floorY + 36, HD - 1.5);
    g.add(glass); cut.push(glass);
    const slab = box(g, W + 20, 8, HD + 24, mat(roof), W / 2, floorY + H, HD / 2 + 6);
    cut.push(slab);
    box(g, 50, 3, 40, mat('#b2bec3'), W - 40, 0, HD + 20);    // car porch
  }
  return { group: g, cut, floorY };
}

export class Homes3D {
  constructor(scene, overlay) {
    this.scene = scene;
    this.overlay = overlay;
    this.plots = PLOTS.map((plot) => {
      const root = new THREE.Group();
      // local frame: house at the back (z 0..HD), garden + gate at the front (+z)
      if (plot.facing === 'S') root.position.set(plot.x * TILE, 0, plot.y * TILE);
      else { root.position.set((plot.x + PLOT_W) * TILE, 0, (plot.y + PLOT_H) * TILE); root.rotation.y = Math.PI; }
      buildFence(root);
      const lot = new THREE.Mesh(new THREE.PlaneGeometry(W - 8, D - 8), mat('#9ad86f'));
      lot.rotation.x = -Math.PI / 2; lot.position.set(W / 2, 0.6, D / 2); lot.receiveShadow = true;
      root.add(lot);
      const empty = new THREE.Group();
      const face = new THREE.MeshBasicMaterial({ map: signTexture('FREE PLOT', '#fff4d6', '#1fb5ad') });
      const edge = mat('#8d5a3b');
      const sign = new THREE.Mesh(new THREE.BoxGeometry(56, 16, 1.5), [edge, edge, edge, edge, face, face]);
      sign.position.set(W / 2, 26, D - 20);
      empty.add(sign);
      box(empty, 3, 20, 3, mat('#8d5a3b'), W / 2, 0, D - 21);
      root.add(empty);
      scene.add(root);
      const label = document.createElement('div');
      label.className = 'ov-label ov-home';
      label.style.display = 'none';
      overlay.append(label);
      return { plot, root, empty, house: null, cut: [], label, owner: null, open: 0 };
    });
  }

  set({ plot, owner, name, color, home }) {
    const slot = this.plots[plot];
    if (!slot) return;
    if (slot.house) { slot.root.remove(slot.house); slot.house = null; slot.cut = []; }
    slot.owner = owner;
    slot.empty.visible = !owner;
    if (!owner) { slot.label.style.display = 'none'; return; }
    slot.label.textContent = `🏠 ${name}`;
    slot.label.style.background = color;
    const { group, cut, floorY } = buildHouse(home.style, home.wall, home.roof);
    for (const it of home.items) {
      const m = buildItem(it.id);
      const inside = it.r < HOUSE_ROWS;
      m.position.set((it.c + 0.5) * TILE, inside ? floorY : 0.5, (it.r + 0.5) * TILE);
      m.rotation.y = -(it.rot || 0) * Math.PI / 2;
      group.add(m);
    }
    slot.house = group;
    slot.cut = cut;
    slot.root.add(group);
  }

  clear() { for (let i = 0; i < this.plots.length; i++) this.set({ plot: i, owner: null }); }

  /** Cutaway when someone is inside; name labels; animate kites. */
  update(states, project, t, dt) {
    for (const slot of this.plots) {
      if (!slot.house) continue;
      const { plot } = slot;
      const inside = states.some((s) => s.x > plot.x * TILE && s.x < (plot.x + PLOT_W) * TILE && s.y > plot.y * TILE && s.y < (plot.y + PLOT_H) * TILE);
      slot.open += ((inside ? 1 : 0) - slot.open) * Math.min(1, dt * 5);
      for (const o of slot.cut) {
        // pop up a little, then vanish (never float in front of the chase camera)
        o.userData.baseY ??= o.position.y;
        o.visible = slot.open < 0.35;
        o.position.y = o.userData.baseY + slot.open * 40;
      }
      slot.house.traverse((o) => { if (o.userData.kite) o.rotation.z = Math.sin(t * 2 + plot.id) * 0.3; });
      // name tag floats above the roof so it never covers the players' own tags
      const houseZ = plot.facing === 'S' ? plot.y * TILE + HD / 2 : (plot.y + PLOT_H) * TILE - HD / 2;
      const pr = project((plot.x + PLOT_W / 2) * TILE, 125, houseZ);
      slot.label.style.display = pr ? '' : 'none';
      if (pr) slot.label.style.transform = `translate(${pr.x}px, ${pr.y}px) translate(-50%, -100%) scale(${Math.max(0.6, Math.min(1.1, pr.scale))})`;
    }
  }
}
