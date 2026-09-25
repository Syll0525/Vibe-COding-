// Low-poly models for everything in the shop. Each builder returns a Group sized to
// fit one 40×40 home cell, standing on y = 0, facing +z (towards the house door).

import * as THREE from 'three';
import { ITEMS } from '/shared/catalog.js';
import { mat, box, buildCat } from './buildings.js';
import { canvasTexture, emojiTexture } from './textures.js';

function cyl(g, rTop, rBot, h, material, x, y, z, seg = 12) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), material);
  m.position.set(x, y + h / 2, z);
  m.castShadow = true; m.receiveShadow = true;
  g.add(m);
  return m;
}
function ball(g, r, material, x, y, z, seg = 10) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg, seg), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  g.add(m);
  return m;
}
const glow = (color, k = 0.8) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: k });

function puaKumbu() {
  return canvasTexture('pua', 64, 64, (c, w, h) => {
    c.fillStyle = '#8e1b1b'; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#f5e6c8'; c.lineWidth = 3;
    for (let y = 8; y < h; y += 16) for (let x = 8; x < w; x += 16) {
      c.beginPath(); c.moveTo(x, y - 6); c.lineTo(x + 6, y); c.lineTo(x, y + 6); c.lineTo(x - 6, y); c.closePath(); c.stroke();
    }
    c.strokeStyle = '#111'; c.lineWidth = 4; c.strokeRect(2, 2, w - 4, h - 4);
  });
}

const BUILDERS = {
  sofa(g) {
    const fabric = mat('#e17055');
    box(g, 34, 10, 16, fabric, 0, 2, 2);
    box(g, 34, 14, 5, fabric, 0, 2, -8);
    box(g, 5, 14, 16, fabric, -15, 2, 2); box(g, 5, 14, 16, fabric, 15, 2, 2);
    box(g, 10, 6, 10, mat('#fdcb6e'), -6, 12, 2);
  },
  bed(g) {
    box(g, 28, 8, 36, mat('#8d5a3b'), 0, 0, 0);
    box(g, 26, 5, 26, mat('#74b9ff'), 0, 8, 4);
    box(g, 20, 5, 7, mat('#ffffff'), 0, 8, -12);
    box(g, 28, 18, 3, mat('#6d4c41'), 0, 0, -17);
  },
  table(g) {
    box(g, 32, 3, 24, mat('#a0522d'), 0, 16, 0);
    for (const [x, z] of [[-13, -9], [13, -9], [-13, 9], [13, 9]]) box(g, 3, 16, 3, mat('#6d4c41'), x, 0, z);
    ball(g, 4, mat('#fdcb6e'), 0, 22, 0);
  },
  chair(g) {
    box(g, 16, 3, 16, mat('#b07a4a'), 0, 10, 0);
    box(g, 16, 16, 3, mat('#b07a4a'), 0, 10, -7);
    for (const [x, z] of [[-6, -6], [6, -6], [-6, 6], [6, 6]]) box(g, 2.5, 10, 2.5, mat('#6d4c41'), x, 0, z);
  },
  tv(g) {
    box(g, 30, 10, 12, mat('#6d4c41'), 0, 0, -6);
    box(g, 30, 18, 3, mat('#1e1e24'), 0, 10, -8);
    box(g, 27, 15, 1, glow('#4fa3ff', 0.9), 0, 11.5, -6.3);
  },
  lamp(g) {
    cyl(g, 5, 6, 2, mat('#2d3436'), 0, 0, 0);
    cyl(g, 1, 1, 26, mat('#2d3436'), 0, 2, 0);
    const shade = new THREE.Mesh(new THREE.ConeGeometry(9, 10, 12, 1, true), glow('#ffe08a', 0.9));
    shade.position.set(0, 32, 0); shade.material.side = THREE.DoubleSide;
    g.add(shade);
  },
  rug(g) {
    box(g, 36, 1, 30, new THREE.MeshStandardMaterial({ map: puaKumbu(), roughness: 1 }), 0, 0.2, 0, { shadow: false });
  },
  bookshelf(g) {
    box(g, 34, 40, 10, mat('#8d5a3b'), 0, 0, -12);
    const colors = ['#e17055', '#0984e3', '#00b894', '#fdcb6e', '#6c5ce7', '#d63031'];
    for (let shelf = 0; shelf < 3; shelf++) for (let i = 0; i < 6; i++) box(g, 4, 9, 7, mat(colors[(i + shelf) % 6]), -13 + i * 5, 3 + shelf * 12, -7);
  },
  plant(g) {
    cyl(g, 7, 5, 10, mat('#d35400'), 0, 0, 0);
    for (const [x, y, z, r] of [[0, 18, 0, 9], [-5, 14, 3, 6], [5, 15, -2, 6]]) ball(g, r, mat('#27ae60', { flatShading: true }), x, y, z, 6);
  },
  stove(g) {
    box(g, 30, 18, 18, mat('#dfe6e9'), 0, 0, -8);
    box(g, 30, 2, 18, mat('#2d3436'), 0, 18, -8);
    cyl(g, 6, 6, 7, mat('#636e72'), -6, 20, -8);
    ball(g, 3, glow('#ff7043', 1), 7, 21, -8);
  },
  piano(g) {
    box(g, 34, 26, 14, mat('#1e1e24', { roughness: 0.3 }), 0, 0, -10);
    box(g, 32, 2, 6, mat('#ffffff'), 0, 16, -1);
    box(g, 12, 8, 8, mat('#2d3436'), 0, 0, 10);
  },
  sape(g) {
    const body = box(g, 10, 30, 3, mat('#c0392b'), 0, 2, 0);
    body.rotation.z = 0.2;
    const neck = box(g, 3, 16, 2, mat('#6d4c41'), 4, 30, 0);
    neck.rotation.z = 0.2;
    box(g, 8, 2, 12, mat('#8d5a3b'), 0, 0, 2);
  },
  aquarium(g) {
    box(g, 32, 12, 16, mat('#6d4c41'), 0, 0, -6);
    box(g, 30, 18, 14, new THREE.MeshStandardMaterial({ color: '#74b9ff', transparent: true, opacity: 0.45, roughness: 0.1 }), 0, 12, -6, { shadow: false });
    for (const [x, y, c] of [[-6, 20, '#ff9f43'], [5, 24, '#fdcb6e'], [0, 17, '#ff6b6b']]) ball(g, 2.5, mat(c), x, y, -6, 6);
  },
  catbed(g) {
    cyl(g, 14, 15, 6, mat('#a29bfe'), 0, 0, 0, 16);
    const cat = buildCat({ color: '#f39c12', s: 18, pose: 'lie', striped: true });
    cat.position.y = 4; g.add(cat);
  },
  arcade(g) {
    box(g, 20, 44, 18, mat('#6c5ce7'), 0, 0, -8);
    box(g, 16, 12, 1, glow('#55efc4', 1), 0, 28, 1.2);
    box(g, 16, 3, 8, mat('#2d3436'), 0, 18, 4);
    ball(g, 2, glow('#ff5a5f', 1), -4, 22, 5, 6);
  },
  flowers(g) {
    ball(g, 12, mat('#2ecc71', { flatShading: true }), 0, 8, 0, 6);
    for (let i = 0; i < 6; i++) ball(g, 3.5, mat(i % 2 ? '#ff4757' : '#ff6b81'), Math.cos(i) * 9, 12 + (i % 3) * 3, Math.sin(i * 2) * 9, 6);
  },
  palm(g) {
    const trunk = cyl(g, 2.5, 4, 56, mat('#8d6e63'), 0, 0, 0, 6);
    trunk.rotation.z = 0.08;
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2;
      const f = box(g, 30, 1.5, 7, mat('#2ecc71', { flatShading: true }), Math.cos(a) * 12, 54, Math.sin(a) * 12);
      f.rotation.set(0, -a, -0.4);
    }
  },
  tree(g) {
    cyl(g, 3, 4, 26, mat('#795548'), 0, 0, 0, 6);
    ball(g, 18, mat('#3fae49', { flatShading: true }), 0, 38, 0, 1);
    for (let i = 0; i < 6; i++) ball(g, 2.5, mat('#e74c3c'), Math.cos(i) * 14, 34 + (i % 2) * 8, Math.sin(i * 1.7) * 14, 6); // rambutans!
  },
  fence(g) {
    for (let x = -17; x <= 17; x += 6) box(g, 4, 16, 2, mat('#c8a26b'), x, 0, 0);
    box(g, 38, 2, 2, mat('#a47c48'), 0, 11, 0);
  },
  pond(g) {
    cyl(g, 17, 18, 2, mat('#7f8c8d'), 0, 0, 0, 16);
    cyl(g, 15, 15, 2.5, new THREE.MeshStandardMaterial({ color: '#3d8fc4', roughness: 0.1, metalness: 0.3 }), 0, 0.5, 0, 16);
    ball(g, 2.5, mat('#ff9f43'), 4, 3, 2, 6); ball(g, 2.5, mat('#ffffff'), -5, 3, -3, 6);
    ball(g, 4, mat('#27ae60'), -9, 3, 7, 6);
  },
  bench(g) {
    box(g, 32, 3, 12, mat('#b07a4a'), 0, 10, 0);
    box(g, 32, 10, 2, mat('#b07a4a'), 0, 13, -6);
    for (const x of [-13, 13]) box(g, 3, 10, 10, mat('#2d3436'), x, 0, 0);
  },
  swing(g) {
    const post = mat('#8d5a3b');
    for (const x of [-16, 16]) { const p = box(g, 3, 44, 3, post, x, 0, 0); }
    box(g, 36, 3, 3, post, 0, 44, 0);
    for (const x of [-6, 6]) box(g, 1, 28, 1, mat('#2d3436'), x, 16, 0);
    box(g, 16, 2, 8, mat('#e17055'), 0, 14, 0);
  },
  bbq(g) {
    for (const [x, z] of [[-6, -4], [6, -4], [0, 6]]) box(g, 2, 14, 2, mat('#2d3436'), x, 0, z);
    cyl(g, 12, 9, 8, mat('#2d3436'), 0, 14, 0);
    cyl(g, 10, 10, 1, glow('#ff7043', 1.2), 0, 21, 0);
    for (let i = -1; i <= 1; i++) box(g, 3, 2, 12, mat('#d35400'), i * 6, 22, 0); // satay sticks
  },
  lantern(g) {
    cyl(g, 1, 1, 30, mat('#2d3436'), 0, 0, 0, 6);
    const l = ball(g, 8, glow('#e74c3c', 0.9), 0, 30, 0, 12);
    l.scale.set(1, 0.8, 1);
    cyl(g, 4, 4, 3, mat('#f1c40f'), 0, 35, 0, 8);
  },
  bicycle(g) {
    const tire = mat('#2d3436');
    for (const x of [-11, 11]) {
      const w = new THREE.Mesh(new THREE.TorusGeometry(7, 1.2, 6, 16), tire);
      w.position.set(x, 8, 0); w.castShadow = true; g.add(w);
    }
    const frame = mat('#e84393');
    const f1 = box(g, 22, 2, 2, frame, 0, 12, 0); f1.rotation.z = 0.1;
    box(g, 2, 8, 2, frame, -4, 12, 0);
    box(g, 6, 2, 4, mat('#2d3436'), -4, 20, 0);
    box(g, 2, 10, 2, frame, 9, 12, 0);
    box(g, 2, 2, 10, frame, 9, 22, 0);
  },
  kite(g) {
    cyl(g, 1, 1, 10, mat('#8d5a3b'), 0, 0, 0, 6);
    const shape = new THREE.Shape();
    shape.moveTo(0, 14); shape.lineTo(10, 0); shape.lineTo(0, -10); shape.lineTo(-10, 0); shape.closePath();
    const kite = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshStandardMaterial({ color: '#fdcb6e', side: THREE.DoubleSide, emissive: '#f39c12', emissiveIntensity: 0.3 }));
    kite.position.set(8, 70, -6); kite.rotation.y = 0.4; kite.userData.kite = true;
    g.add(kite);
    const string = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 10, 0), new THREE.Vector3(8, 62, -6)]), new THREE.LineBasicMaterial({ color: '#555' }));
    g.add(string);
  },
  trampoline(g) {
    for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.7; box(g, 2, 8, 2, mat('#2d3436'), Math.cos(a) * 15, 0, Math.sin(a) * 15); }
    cyl(g, 18, 18, 2, mat('#0984e3'), 0, 8, 0, 20);
    cyl(g, 15, 15, 2.2, mat('#1e1e24'), 0, 8, 0, 20);
  },
  hornbill(g) {
    box(g, 16, 10, 16, mat('#b2bec3'), 0, 0, 0);
    const body = ball(g, 9, mat('#1e1e24'), 0, 22, 0, 10); body.scale.set(0.8, 1.1, 1);
    ball(g, 6, mat('#1e1e24'), 0, 34, 3, 10);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(3, 14, 8), mat('#f1c40f'));
    beak.rotation.x = Math.PI / 2; beak.position.set(0, 33, 12); g.add(beak);
    const casque = box(g, 3, 5, 10, mat('#e67e22'), 0, 37, 8); casque.rotation.x = 0.3;
    box(g, 12, 2, 6, mat('#ffffff'), 0, 13, -8);
  },
  catstatue(g) {
    box(g, 20, 8, 20, mat('#b2bec3'), 0, 0, 0);
    const cat = buildCat({ color: '#ffffff', s: 42, pose: 'stand' });
    cat.position.y = 8; g.add(cat);
  },
};

const cache = new Map();

/** Build (or clone from cache) the model for a shop item id. */
export function buildItem(id) {
  if (!cache.has(id)) {
    const g = new THREE.Group();
    if (BUILDERS[id]) BUILDERS[id](g);
    else {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture(ITEMS[id]?.icon ?? '❓') }));
      s.scale.set(32, 32, 1); s.position.y = 18;
      g.add(s);
    }
    cache.set(id, g);
  }
  return cache.get(id).clone();
}
