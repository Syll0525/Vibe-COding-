// The 3D office: a two-level open-plan floor seen from above. The top floor holds the
// Lounge, Manager and Boss rooms; the main floor is a grid of department rooms with
// workers at dual-monitor desks. Rooms that have working skills open Maya's panel.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const UPPER = 3; // height of the top floor

const SKIN = ['#f1c7a1', '#d9a07a', '#b07a53', '#8a5a3c', '#e8b48f'];
const HAIR = ['#2b1a12', '#3b2416', '#111111', '#5a3a22', '#1f1f2e'];
const SHIRTS = ['#2f3b52', '#c2410c', '#6b7280', '#1e3a8a', '#7c2d12', '#334155', '#9a3412', '#4b5563', '#0f766e', '#7c3aed'];

// Department rooms on the main floor. action = which Maya tab the room opens.
export const ROOMS = [
  { id: 'sosmed', label: 'Sosmed Specialist', col: 0, row: 0, floor: '#f4ecd6', accent: '#f5c451', action: 'design', desks: 5 },
  { id: 'digital', label: 'Digital Marketing', col: 1, row: 0, floor: '#dde6f4', accent: '#6c8fd8', action: 'chrome', desks: 4, maya: true },
  { id: 'product', label: 'Product Developer', col: 2, row: 0, floor: '#f4e2e7', accent: '#f08ba5', desks: 3 },
  { id: 'content', label: 'Content Manager', col: 0, row: 1, floor: '#e2efe0', accent: '#86c99a', action: 'design', desks: 2 },
  { id: 'data', label: 'Data Analyst', col: 1, row: 1, floor: '#e7e2f3', accent: '#a493dc', desks: 2 },
  { id: 'mentoring', label: 'Mentoring', col: 2, row: 1, floor: '#f3e7dc', accent: '#f0a36b', desks: 2 },
  { id: 'automation', label: 'Automation', col: 0, row: 2, floor: '#e0ecef', accent: '#6cc3cf', action: 'chrome', desks: 2 },
  { id: 'platform', label: 'Platform & Web', col: 1, row: 2, floor: '#f1ecda', accent: '#e5c65a', desks: 2 },
  { id: 'video', label: 'Video Editing', col: 2, row: 2, floor: '#e5e3f4', accent: '#c084fc', action: 'video', desks: 3 },
];

export const UPPER_ROOMS = [
  { id: 'lounge', label: 'Lounge', x: -20, w: 20 },
  { id: 'manager', label: 'Manager', x: 0, w: 16 },
  { id: 'boss', label: 'Ruang Boss', x: 18, w: 16, action: 'chrome' },
];

const COL_X = [-20, 0, 20];
const ROW_Z = [-2.5, 7.5, 17.5];
const ROOM_W = 18.5;
const ROOM_D = 9;

// --- shared geometry & materials --------------------------------------------

const mats = new Map();
function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!mats.has(key)) mats.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...opts }));
  return mats.get(key);
}
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
function box(w, h, d, material, x = 0, y = 0, z = 0, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(boxGeo, material);
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}
const sphereGeo = new THREE.SphereGeometry(1, 18, 14);

function rand(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// --- props --------------------------------------------------------------------

function plant(x, z, r = 0.6) {
  const g = new THREE.Group();
  g.add(box(0.6, 0.5, 0.6, mat('#e7e1d6'), 0, 0.25, 0));
  const leaves = new THREE.Mesh(sphereGeo, mat('#7fcf86'));
  leaves.scale.setScalar(r);
  leaves.position.y = 0.5 + r * 0.9;
  leaves.castShadow = true;
  g.add(leaves);
  g.position.set(x, 0, z);
  return g;
}

function person({ shirt, skin, hair, pants = '#2d2f3a' }) {
  const g = new THREE.Group();
  g.add(box(0.62, 0.72, 0.38, mat(shirt), 0, 0.98, 0));
  g.add(box(0.46, 0.2, 0.62, mat(pants), -0.13, 0.62, -0.22));
  g.add(box(0.46, 0.2, 0.62, mat(pants), 0.13, 0.62, -0.22));
  g.add(box(0.44, 0.44, 0.44, mat(skin), 0, 1.58, 0));
  g.add(box(0.48, 0.16, 0.48, mat(hair), 0, 1.86, 0.01));
  g.add(box(0.48, 0.34, 0.12, mat(hair), 0, 1.66, 0.2));
  const arms = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.4, 1.26, 0);
    pivot.add(box(0.17, 0.55, 0.17, mat(shirt), 0, -0.26, 0));
    pivot.add(box(0.15, 0.12, 0.15, mat(skin), 0, -0.56, 0));
    pivot.rotation.x = 1.05;
    g.add(pivot);
    arms.push(pivot);
  }
  g.userData.arms = arms;
  return g;
}

/** Desk with two monitors, a chair and (optionally) a worker. Faces -z. */
function desk(screenMat, worker) {
  const g = new THREE.Group();
  g.add(box(2.5, 0.08, 1.15, mat('#fbfaf7'), 0, 0.78, 0));
  for (const [lx, lz] of [[-1.15, -0.5], [1.15, -0.5], [-1.15, 0.5], [1.15, 0.5]]) g.add(box(0.06, 0.78, 0.06, mat('#22252c'), lx, 0.39, lz));
  for (const mx of [-0.43, 0.43]) {
    g.add(box(0.8, 0.48, 0.06, mat('#22314f'), mx, 1.22, -0.38));
    const screen = new THREE.Mesh(boxGeo, screenMat);
    screen.scale.set(0.72, 0.4, 0.01);
    screen.position.set(mx, 1.22, -0.345);
    g.add(screen);
    g.add(box(0.06, 0.2, 0.06, mat('#22252c'), mx, 0.92, -0.42));
  }
  g.add(box(0.5, 0.03, 0.18, mat('#d1d5db'), 0, 0.835, 0.12));
  // chair
  g.add(box(0.72, 0.1, 0.7, mat('#3f4350'), 0, 0.5, 0.95));
  g.add(box(0.72, 0.8, 0.12, mat('#3f4350'), 0, 0.98, 1.33));
  g.add(box(0.08, 0.45, 0.08, mat('#22252c'), 0, 0.25, 0.95));
  if (worker) {
    const p = person(worker);
    p.position.set(0, 0, 0.95);
    g.add(p);
    g.userData.person = p;
  }
  return g;
}

function sofa(color, w, d = 1.1) {
  const g = new THREE.Group();
  g.add(box(w, 0.45, d, mat(color), 0, 0.3, 0));
  g.add(box(w, 0.6, 0.28, mat(color), 0, 0.7, -d / 2 + 0.14));
  g.add(box(0.28, 0.4, d, mat(color), -w / 2 + 0.14, 0.62, 0));
  g.add(box(0.28, 0.4, d, mat(color), w / 2 - 0.14, 0.62, 0));
  return g;
}

function makeLabel(text, cls = 'room-label') {
  const el = document.createElement('div');
  el.className = cls;
  el.textContent = text;
  return new CSS2DObject(el);
}

// --- rooms ------------------------------------------------------------------------

/** Floor, walls and glass front for a room centred at (cx, cz). */
function shell(cx, cz, w, d, floorColor, accent, { y = 0, wallH = 1.3, glassFront = true } = {}) {
  const g = new THREE.Group();
  g.position.set(cx, y, cz);
  const floor = box(w, 0.12, d, mat(floorColor), 0, 0.06, 0, { cast: false });
  g.add(floor);
  const wall = mat('#f6f3ec');
  const t = 0.28;
  g.add(box(w, wallH, t, wall, 0, wallH / 2, -d / 2));
  g.add(box(t, wallH, d, wall, -w / 2, wallH / 2, 0));
  g.add(box(t, wallH, d, wall, w / 2, wallH / 2, 0));
  // accent board on the back wall
  if (accent) g.add(box(Math.min(5, w * 0.3), 0.55, 0.06, mat(accent), w * 0.22, wallH - 0.4, -d / 2 + 0.17));
  if (glassFront) {
    const glass = mat('#cfe3f1', { transparent: true, opacity: 0.35, roughness: 0.1 });
    const gap = 3.2;
    const doorX = w * 0.18;
    const leftW = w / 2 + doorX - gap / 2;
    const rightW = w / 2 - doorX - gap / 2;
    g.add(box(leftW, 0.9, 0.08, glass, -w / 2 + leftW / 2, 0.45, d / 2, { cast: false }));
    g.add(box(rightW, 0.9, 0.08, glass, w / 2 - rightW / 2, 0.45, d / 2, { cast: false }));
    g.add(box(leftW, 0.07, 0.12, mat('#23262e'), -w / 2 + leftW / 2, 0.92, d / 2));
    g.add(box(rightW, 0.07, 0.12, mat('#23262e'), w / 2 - rightW / 2, 0.92, d / 2));
  }
  g.userData.floor = floor;
  return g;
}

const DESK_SPOTS = {
  2: [[-4.6, -0.6], [4.6, -0.6]],
  3: [[-5.5, -1.6], [0, -1.6], [5.5, -1.6]],
  4: [[-5.5, -2], [0, -2], [5.5, -2], [2.75, 1.6]],
  5: [[-6, -2], [-0.5, -2], [5, -2], [-6, 1.6], [-0.5, 1.6]],
};

function staffRoom(room, rng, screenMat) {
  const g = shell(COL_X[room.col], ROW_Z[room.row], ROOM_W, ROOM_D, room.floor, room.accent);
  const spots = DESK_SPOTS[room.desks];
  g.userData.people = [];
  spots.forEach(([x, z], i) => {
    const isMaya = room.maya && i === 0;
    const worker = isMaya
      ? { shirt: '#7c3aed', skin: '#c68b5f', hair: '#2b1a12', pants: '#312e81' }
      : { shirt: SHIRTS[Math.floor(rng() * SHIRTS.length)], skin: SKIN[Math.floor(rng() * SKIN.length)], hair: HAIR[Math.floor(rng() * HAIR.length)] };
    const d = desk(screenMat, worker);
    d.position.set(x, 0, z);
    g.add(d);
    g.userData.people.push(d.userData.person);
    if (isMaya) g.userData.maya = d;
  });
  g.add(plant(ROOM_W / 2 - 0.9, -ROOM_D / 2 + 0.9));
  if (room.col === 0) g.add(plant(-ROOM_W / 2 + 0.9, ROOM_D / 2 - 1.1, 0.5));
  return g;
}

function upperRooms(screenMat, rng) {
  const d = 9;
  const cz = -19;
  const groups = {};

  // Lounge
  const lounge = shell(UPPER_ROOMS[0].x, cz, UPPER_ROOMS[0].w, d, '#f2eee6', null, { y: UPPER, glassFront: false });
  const s1 = sofa('#e8743b', 5); s1.position.set(-4, 0, -2.6); lounge.add(s1);
  const s2 = sofa('#e8743b', 3.4); s2.rotation.y = Math.PI / 2; s2.position.set(-7.6, 0, 0.4); lounge.add(s2);
  const s3 = sofa('#e8743b', 3.4); s3.rotation.y = -Math.PI / 2; s3.position.set(3.4, 0, 0.6); lounge.add(s3);
  lounge.add(box(3.6, 0.4, 1.6, mat('#d6a46c'), -2.2, 0.3, 0.6));
  lounge.add(box(0.9, 0.9, 0.9, mat('#1f2a44'), 5.8, 0.55, -3));
  lounge.add(plant(7.8, -3.4));
  groups.lounge = lounge;

  // Manager: dark wood wall, TV, desk
  const mgr = shell(UPPER_ROOMS[1].x, cz, UPPER_ROOMS[1].w, d, '#f4f0e8', null, { y: UPPER, glassFront: false, wallH: 2.6 });
  mgr.add(box(15.4, 2.5, 0.12, mat('#5a3b22'), 0, 1.3, -d / 2 + 0.2));
  for (let i = -7; i <= 7; i += 1.4) mgr.add(box(0.06, 2.5, 0.14, mat('#3d2716'), i, 1.3, -d / 2 + 0.22));
  mgr.add(box(5, 0.9, 0.1, mat('#c9a35a'), 0, 1.75, -d / 2 + 0.3));
  mgr.add(box(4.6, 0.7, 0.05, mat('#2c2c2c'), 0, 1.75, -d / 2 + 0.36));
  const md = desk(screenMat, { shirt: '#1f2937', skin: SKIN[1], hair: HAIR[2] });
  md.position.set(0, 0, -1.4); mgr.add(md);
  const ms = sofa('#e8743b', 1.6); ms.rotation.y = Math.PI / 2; ms.position.set(-6, 0, 1.2); mgr.add(ms);
  mgr.add(plant(-6.5, 3.2)); mgr.add(plant(6.6, -2.4));
  mgr.userData.people = [md.userData.person];
  groups.manager = mgr;

  // Boss room (yours)
  const boss = shell(UPPER_ROOMS[2].x, cz, UPPER_ROOMS[2].w, d, '#f4f0e8', null, { y: UPPER, glassFront: false });
  boss.add(box(2.2, 1.2, 0.1, mat('#6b4a2b'), 0, 1.0, -d / 2 + 0.2));
  boss.add(box(1.8, 0.85, 0.06, mat('#f5c451'), 0, 1.0, -d / 2 + 0.27));
  const bd = desk(screenMat, { shirt: '#111827', skin: SKIN[2], hair: HAIR[0] });
  bd.position.set(0, 0, -1.2); boss.add(bd);
  const bs = sofa('#e8743b', 2.6); bs.rotation.y = -Math.PI / 2; bs.position.set(6, 0, 0.8); boss.add(bs);
  boss.add(plant(-6.6, 3.2)); boss.add(plant(-6.4, -3.2));
  boss.userData.people = [bd.userData.person];
  groups.boss = boss;

  return groups;
}

// --- building -----------------------------------------------------------------------

function building(scene) {
  // Ground and floor slab
  const ground = box(140, 0.2, 120, mat('#e9e7e2'), 0, -0.2, 0, { cast: false });
  scene.add(ground);
  scene.add(box(64, 0.2, 49.4, mat('#ebe5d9'), 0, -0.05, -0.35, { cast: false }));
  // Wooden band along the front edge and the side
  scene.add(box(64, 0.5, 2.2, mat('#c79a6b'), 0, 0.1, 23.2, { cast: false }));
  scene.add(box(64, 0.6, 0.4, mat('#3a2b20'), 0, 0.2, 24.4));
  // Corridors between rooms (slightly darker strips)
  for (const x of [-10, 10]) scene.add(box(1.3, 0.04, 29, mat('#d8c9ac'), x, 0.04, 7.5, { cast: false }));

  // Upper floor block
  const zFront = -14.5;
  scene.add(box(64, UPPER, 10, mat('#f4f1ea'), 0, UPPER / 2, -19.5));
  scene.add(box(64, 0.15, 10, mat('#e9e2d3'), 0, UPPER + 0.02, -19.5, { cast: false }));
  // Railing
  for (let x = -31; x <= 31; x += 2.4) scene.add(box(0.08, 1, 0.08, mat('#23262e'), x, UPPER + 0.5, zFront));
  scene.add(box(62.5, 0.08, 0.1, mat('#23262e'), 0, UPPER + 1, zFront));
  scene.add(box(62.5, 0.9, 0.04, mat('#cfe3f1', { transparent: true, opacity: 0.25, roughness: 0.1 }), 0, UPPER + 0.5, zFront, { cast: false }));

  // Wall decorations below the railing
  const wallZ = zFront + 0.02;
  [['#8b5cf6', '#f9a8d4'], ['#0f172a', '#5eead4'], ['#22c55e', '#bbf7d0']].forEach(([bg, dot], i) => {
    scene.add(box(2, 2, 0.08, mat(bg), -26 + i * 2.8, 1.5, wallZ));
    const c = new THREE.Mesh(new THREE.CircleGeometry(0.5, 20), mat(dot));
    c.position.set(-26 + i * 2.8, 1.7, wallZ + 0.06);
    scene.add(c);
  });
  scene.add(box(1.6, 2.2, 0.08, mat('#f59e0b'), -30.2, 1.4, wallZ));
  const shelf = new THREE.Group();
  shelf.add(box(4, 2.2, 0.5, mat('#c89562'), 0, 1.3, 0));
  const books = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#14b8a6'];
  for (let r = 0; r < 3; r++) for (let i = 0; i < 9; i++) shelf.add(box(0.32, 0.5, 0.3, mat(books[(i + r) % books.length]), -1.6 + i * 0.4, 0.55 + r * 0.68, 0.15));
  shelf.position.set(-7, 0, wallZ + 0.3);
  scene.add(shelf);
  scene.add(box(2, 2.6, 0.1, mat('#d9a066'), 2, 1.3, wallZ));
  // sticky-note board
  const notes = ['#f87171', '#fbbf24', '#34d399', '#60a5fa', '#c084fc', '#f472b6'];
  for (let i = 0; i < 14; i++) {
    const n = new THREE.Mesh(new THREE.CircleGeometry(0.28, 14), mat(notes[i % notes.length]));
    n.position.set(9 + (i % 7) * 0.62, 1.4 + Math.floor(i / 7) * 0.55 + (i % 2) * 0.15, wallZ + 0.05);
    scene.add(n);
  }
  for (let i = 0; i < 6; i++) scene.add(box(0.7, 0.5, 0.05, mat(notes[i]), 25 + (i % 3) * 0.9, 1.4 + Math.floor(i / 3) * 0.7, wallZ));

  // Staircase on the right
  const steps = 10;
  for (let i = 0; i < steps; i++) {
    const h = UPPER - (i + 1) * (UPPER / steps);
    scene.add(box(3, 0.14, 0.75, mat('#d6a46c'), 28.6, h + 0.07, zFront + 0.4 + i * 0.75));
    scene.add(box(3, Math.max(0.05, h), 0.75, mat('#efe7d8'), 28.6, h / 2, zFront + 0.4 + i * 0.75, { cast: false }));
  }
  const rail = box(0.08, 0.08, 8.5, mat('#23262e'), 27.1, UPPER / 2 + 0.95, zFront + 4.1);
  rail.rotation.x = Math.atan2(UPPER, 7.5);
  scene.add(rail);
}

// --- public API ---------------------------------------------------------------------

/**
 * @param {HTMLElement} container
 * @param {{onRoomClick:(room:object)=>void}} opts
 */
export function createOffice3D(container, { onRoomClick }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.append(renderer.domElement);

  const labels = new CSS2DRenderer();
  labels.domElement.className = 'label-layer';
  container.append(labels.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#f1efea');

  const camera = new THREE.PerspectiveCamera(32, 1, 1, 400);
  camera.position.set(0, 54, 50);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, 1);
  controls.enableDamping = true;
  controls.minDistance = 25;
  controls.maxDistance = 120;
  controls.minPolarAngle = 0.35;
  controls.maxPolarAngle = 1.15;
  controls.minAzimuthAngle = -0.7;
  controls.maxAzimuthAngle = 0.7;
  controls.screenSpacePanning = true;

  scene.add(new THREE.HemisphereLight('#ffffff', '#d8cfc0', 1.6));
  const sun = new THREE.DirectionalLight('#fff7ea', 2.2);
  sun.position.set(-25, 50, 30);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 40, bottom: -40, near: 1, far: 140 });
  sun.shadow.bias = -0.0005;
  scene.add(sun);

  building(scene);

  const rng = rand(7);
  const rooms = new Map();
  const clickable = [];

  const addRoom = (def, group, labelY) => {
    const screenMat = group.userData.screenMat;
    const label = makeLabel(def.label);
    if (!def.action) label.element.classList.add('soon');
    label.position.set(0, labelY, ROOM_D / 2 + 0.2);
    group.add(label);
    group.traverse((o) => { o.userData.roomId = def.id; });
    clickable.push(group);
    rooms.set(def.id, { def, group, label, screenMat });
    scene.add(group);
  };

  for (const def of ROOMS) {
    const screenMat = new THREE.MeshStandardMaterial({ color: '#1e3a8a', emissive: '#3b6fd8', emissiveIntensity: 0.35 });
    const g = staffRoom(def, rng, screenMat);
    g.userData.screenMat = screenMat;
    addRoom(def, g, 1.25);
  }

  const upperScreen = new THREE.MeshStandardMaterial({ color: '#1e3a8a', emissive: '#3b6fd8', emissiveIntensity: 0.35 });
  const ups = upperRooms(upperScreen, rng);
  for (const def of UPPER_ROOMS) {
    ups[def.id].userData.screenMat = upperScreen;
    addRoom(def, ups[def.id], 1.6);
  }
  const nameTag = (room, text, cls) => {
    const tag = makeLabel(text, cls);
    const p = rooms.get(room).group.userData.people?.[0] || rooms.get(room).group.userData.maya?.userData.person;
    tag.position.set(0, 2.5, 0);
    p.add(tag);
    return tag;
  };
  nameTag('manager', 'Manager', 'name-tag');
  nameTag('boss', 'You', 'name-tag');

  // Maya's name tag and speech bubble
  const mayaDesk = rooms.get('digital').group.userData.maya;
  const mayaTag = makeLabel('Maya', 'name-tag maya');
  mayaTag.position.set(0, 2.45, 0.95);
  mayaDesk.add(mayaTag);
  const bubble = makeLabel('Hi! Click a room 👋', 'bubble');
  bubble.position.set(0, 4.6, 0.95);
  mayaDesk.add(bubble);

  // --- interaction ---------------------------------------------------------------
  const ray = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let hovered = null;
  let downAt = null;

  function pick(ev) {
    const r = renderer.domElement.getBoundingClientRect();
    pointer.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(pointer, camera);
    const hit = ray.intersectObjects(clickable, true).find((h) => h.object.userData.roomId && h.object.visible);
    return hit ? rooms.get(hit.object.userData.roomId) : null;
  }

  renderer.domElement.addEventListener('pointermove', (ev) => {
    const room = pick(ev);
    if (room === hovered) return;
    hovered?.label.element.classList.remove('hover');
    hovered = room;
    room?.label.element.classList.add('hover');
    renderer.domElement.style.cursor = room ? 'pointer' : 'grab';
  });
  renderer.domElement.addEventListener('pointerdown', (ev) => { downAt = [ev.clientX, ev.clientY]; });
  renderer.domElement.addEventListener('pointerup', (ev) => {
    if (!downAt || Math.hypot(ev.clientX - downAt[0], ev.clientY - downAt[1]) > 6) return; // was a drag
    const room = pick(ev);
    if (room) onRoomClick(room.def);
  });
  // Labels are clickable too.
  for (const { def, label } of rooms.values()) {
    label.element.addEventListener('click', () => onRoomClick(def));
  }

  // --- working state -----------------------------------------------------------------
  let working = new Set();
  function setWorking(ids) {
    working = new Set(ids);
    for (const { def, screenMat } of rooms.values()) {
      screenMat.emissiveIntensity = working.has(def.id) ? 1.1 : 0.35;
      screenMat.emissive.set(working.has(def.id) ? '#60a5fa' : '#3b6fd8');
    }
  }

  function resize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setSize(w, h);
    labels.setSize(w, h);
    camera.aspect = w / h;
    // Keep the whole width of the floor in view on narrow screens.
    const hfov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(16)) * 1.6);
    camera.fov = Math.max(32, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(hfov / 2) / camera.aspect)));
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(container);
  resize();

  const timer = new THREE.Timer();
  renderer.setAnimationLoop((time) => {
    timer.update(time);
    const t = timer.getElapsed();
    for (const { def, group } of rooms.values()) {
      const busy = working.has(def.id);
      (group.userData.people || []).forEach((p, i) => {
        if (!p) return;
        const [l, r] = p.userData.arms;
        if (busy) {
          l.rotation.x = 1.05 + Math.sin(t * 18 + i) * 0.12;
          r.rotation.x = 1.05 + Math.cos(t * 18 + i) * 0.12;
          p.position.y = Math.abs(Math.sin(t * 6 + i)) * 0.04;
        } else {
          l.rotation.x = r.rotation.x = 1.05 + Math.sin(t * 1.5 + i * 1.7) * 0.04;
          p.position.y = 0;
          p.rotation.y = Math.sin(t * 0.4 + i * 2.1) * 0.12;
        }
      });
    }
    controls.update();
    renderer.render(scene, camera);
    labels.render(scene, camera);
  });

  return {
    setWorking,
    setBubble(text) { bubble.element.textContent = text; },
    rooms,
  };
}
