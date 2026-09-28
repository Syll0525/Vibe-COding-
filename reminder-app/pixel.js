'use strict';

// Hand-made pixel art: the five pets, their outfits, and the café street they live on.
// Everything is drawn on a 160×90 canvas that CSS scales up with crisp pixels.
const Pixel = (() => {
  const W = 160;
  const H = 90;
  const OUTLINE = '#5b4038';
  const EYE = '#3b2a26';
  const TRIM = '#7a5548';

  // ---------- characters (16×16) ----------
  // o outline, e eye, b body, l light fur, d dark fur, p cheek, n nose/beak

  const FEET = ['...obboooobbo...', '...oooo..oooo...'];

  const CHARACTERS = [
    {
      id: 'hamster', name: 'Hammy', kind: 'Hamster', mouthY: 9,
      colors: { b: '#e8995a', l: '#fff6e6', p: '#f6a5a0', n: '#a0524a', d: '#c97a45' },
      rows: [
        '................',
        '................',
        '..ooo......ooo..',
        '.obpbo....obpbo.',
        '.obbboooooobbbo.',
        '.obbbbbbbbbbbbo.',
        '.obbbllllllbbbo.',
        '.obbellllllebbo.',
        '.obplllnnlllpbo.',
        '.obbllllllllbbo.',
        '..obllllllllbo..',
        '..obllllllllbo..',
        '..obbllllllbbo..',
        '..obbbbbbbbbbo..',
        ...FEET,
      ],
    },
    {
      id: 'bear', name: 'Mocha', kind: 'Bear', mouthY: 10,
      colors: { b: '#a87758', l: '#e8c9a6', p: '#e79a8e', n: '#4b322b', d: '#7d5641' },
      rows: [
        '................',
        '................',
        '.ooo........ooo.',
        '.odbo......obdo.',
        '.obboooooooobbo.',
        '.obbbbbbbbbbbbo.',
        '.obbbbbbbbbbbbo.',
        '.obbebbbbbbebbo.',
        '.obpbbllllbbpbo.',
        '.obbbllnnllbbbo.',
        '.obbbbllllbbbbo.',
        '..obbbbbbbbbbo..',
        '..obbllllllbbo..',
        '..obbllllllbbo..',
        ...FEET,
      ],
    },
    {
      id: 'bunny', name: 'Bun', kind: 'Bunny', mouthY: 10,
      colors: { b: '#fbf1e1', l: '#ffffff', p: '#f7b1b5', n: '#f08a95', d: '#e6d6bf' },
      rows: [
        '...oo......oo...',
        '..obbo....obbo..',
        '..obpo....opbo..',
        '..obpo....opbo..',
        '..obboooooobbo..',
        '.obbbbbbbbbbbbo.',
        '.obbbbbbbbbbbbo.',
        '.obbebbbbbbebbo.',
        '.obpbbbbbbbbpbo.',
        '.obbbbbnnbbbbbo.',
        '.obbbbbbbbbbbbo.',
        '..obbbbbbbbbbo..',
        '..obbllllllbbo..',
        '..obbllllllbbo..',
        ...FEET,
      ],
    },
    {
      id: 'cat', name: 'Mimi', kind: 'Kitty', mouthY: 10,
      colors: { b: '#bdb5ad', l: '#fbf5ec', p: '#f6a5a0', n: '#e0868a', d: '#8f877f' },
      rows: [
        '................',
        '..o..........o..',
        '..oo........oo..',
        '..opo......opo..',
        '..obboooooobbo..',
        '.obbbbbddbbbbbo.',
        '.obbbbbbbbbbbbo.',
        '.obbebbbbbbebbo.',
        '.obpbbbbbbbbpbo.',
        '.obbbblnnlbbbbo.',
        '.obbbbllllbbbbo.',
        '..obbbbbbbbbbo..',
        '..obbllllllbbo..',
        '..obbllllllbbo..',
        ...FEET,
      ],
    },
    {
      id: 'chick', name: 'Pip', kind: 'Chick', mouthY: null,
      colors: { b: '#ffd66b', l: '#fff1b8', p: '#f7a58a', n: '#f0924a', d: '#e8b84a' },
      rows: [
        '................',
        '.......oo.......',
        '......obbo......',
        '.......oo.......',
        '...oooooooooo...',
        '..obbbbbbbbbbo..',
        '.obbbbbbbbbbbbo.',
        '.obbebbbbbbebbo.',
        '.obpbbbnnbbbpbo.',
        '.obbbbbnnbbbbbo.',
        '.odbbbbbbbbbbdo.',
        '.obdbbllllbbdbo.',
        '..obbllllllbbo..',
        '...obbbbbbbbo...',
        '....oooooooo....',
        '.....nn..nn.....',
      ],
    },
  ];
  const CHAR_BY_ID = Object.fromEntries(CHARACTERS.map((c) => [c.id, c]));

  // ---------- outfits ----------

  const ACCESSORIES = [
    { id: 'bow', name: 'Pink bow', slot: 'head', price: 20, dx: 10, dy: 2,
      colors: { p: '#ff7eb0', r: '#d9487f' }, rows: ['pp.pp', 'pprpp', 'pp.pp'] },
    { id: 'flower', name: 'Daisy clip', slot: 'head', price: 15, dx: 1, dy: 2,
      colors: { w: '#ffffff', y: '#ffc93c', o: OUTLINE }, rows: ['.w.', 'wyw', '.w.'] },
    { id: 'party', name: 'Party hat', slot: 'head', price: 30, dx: 6, dy: 0,
      colors: { r: '#7fa7e8', y: '#ffd24a' }, rows: ['..y..', '.rrr.', '.ryr.', 'rrrrr'] },
    { id: 'beret', name: 'Artist beret', slot: 'head', price: 35, dx: 4, dy: 2,
      colors: { r: '#d4634f', d: '#a8432f' }, rows: ['...rr...', '.rrrrrr.', 'dddddddd'] },
    { id: 'crown', name: 'Gold crown', slot: 'head', price: 80, dx: 4, dy: 1,
      colors: { y: '#ffcf3c', r: '#e8364f' }, rows: ['y..yy..y', 'yy.yr.yy', 'yyyyyyyy'] },
    { id: 'shades', name: 'Cool shades', slot: 'face', price: 35, dx: 2, dy: 7,
      colors: { k: '#2a2230', w: '#8fa3c7' }, rows: ['kkkkkkkkkkkk', '.kkw....kkw.'] },
    { id: 'scarf', name: 'Cosy scarf', slot: 'body', price: 25, dx: 3, dy: 11,
      colors: { r: '#d4634f', y: '#fbeedc' }, rows: ['ryryryryry', '........yr'] },
    { id: 'apron', name: 'Café apron', slot: 'body', price: 40, dx: 5, dy: 11,
      colors: { g: '#9fb74f', w: '#e7f0c3' }, rows: ['gggggg', 'gwwwwg', 'gggggg'] },
  ];
  const ACC_BY_ID = Object.fromEntries(ACCESSORIES.map((a) => [a.id, a]));
  const SLOT_ORDER = ['body', 'face', 'head'];

  // ---------- little sprites for effects ----------

  const SPRITES = {
    heart: { colors: { r: '#ff6f91' }, rows: ['rr.rr', 'rrrrr', '.rrr.', '..r..'] },
    coin: { colors: { c: '#c98a14', y: '#ffd24a' }, rows: ['.cc.', 'cyyc', 'cyyc', '.cc.'] },
    ball: { colors: { r: '#e8364f', w: '#ffffff' }, rows: ['.rr.', 'rwrr', 'rrrr', '.rr.'] },
    zzz: { colors: { z: '#7a6f99' }, rows: ['zzz', '.z.', 'zzz'] },
    onigiri: { colors: { o: OUTLINE, w: '#ffffff', k: '#2f3b2f' }, rows: ['..o..', '.owo.', 'owwwo', 'okkko'] },
    cookie: { colors: { c: '#c98b5a', d: '#6b4430' }, rows: ['.cc.', 'cdcc', 'ccdc', '.cc.'] },
    boba: { colors: { o: OUTLINE, t: '#e8c9a6', k: '#4b322b' }, rows: ['..o.', 'oooo', 'otto', 'okko', 'oooo'] },
    cake: { colors: { r: '#e8364f', w: '#fff6e6', p: '#f7b1b5' }, rows: ['..r..', 'wwwww', 'ppppp', 'wwwww'] },
  };

  // ---------- drawing helpers ----------

  function rect(ctx, color, x, y, w = 1, h = 1) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  }

  function drawSprite(ctx, sprite, x, y, extra = {}) {
    const colors = { o: OUTLINE, e: EYE, ...sprite.colors, ...extra };
    sprite.rows.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) {
        const c = colors[row[i]];
        if (row[i] !== '.' && c) rect(ctx, c, x + i, y + j);
      }
    });
  }

  // look: { species, equipped: {slot: id}, mood: happy|ok|sad|hungry, sleeping, eating }
  function drawPet(ctx, x, y, look) {
    const ch = CHAR_BY_ID[look.species] || CHARACTERS[0];
    const colors = { o: OUTLINE, e: EYE, ...ch.colors };
    ch.rows.forEach((row, j) => {
      for (let i = 0; i < 16; i++) {
        const k = row[i];
        if (k === '.') continue;
        if (k === 'e') {
          if (look.sleeping) {
            rect(ctx, colors.b, x + i, y + j);
            rect(ctx, EYE, x + i - 1, y + j + 1, 3, 1);
          } else {
            rect(ctx, EYE, x + i, y + j);
          }
          continue;
        }
        rect(ctx, colors[k], x + i, y + j);
      }
    });

    const m = ch.mouthY;
    if (m != null && !look.sleeping) {
      const px = (dx, dy, c = OUTLINE) => rect(ctx, c, x + dx, y + m + dy);
      if (look.eating) { px(7, 0, '#c0504a'); px(8, 0, '#c0504a'); px(7, 1, '#c0504a'); px(8, 1, '#c0504a'); }
      else if (look.mood === 'happy') { px(6, 0); px(7, 1); px(8, 1); px(9, 0); }
      else if (look.mood === 'sad' || look.mood === 'hungry') { px(7, 0); px(8, 0); px(6, 1); px(9, 1); }
      else { px(7, 0); px(8, 0); }
    }

    for (const slot of SLOT_ORDER) {
      const acc = ACC_BY_ID[look.equipped?.[slot]];
      if (acc) drawSprite(ctx, acc, x + acc.dx, y + acc.dy);
    }
  }

  // ---------- the café street ----------

  const SKIES = {
    day: { top: '#fcebc9', bottom: '#fdf4e0', cloud: '#f3d19c', cloudHi: '#f9e4ba', glass: '#f5d3c3' },
    sunset: { top: '#f4a88f', bottom: '#fbd6a8', cloud: '#f08f86', cloudHi: '#f7b8a0', glass: '#fbd9b8' },
    night: { top: '#2f2d57', bottom: '#4b4a7c', cloud: '#5a5890', cloudHi: '#6d6ba3', glass: '#ffe08a' },
  };

  const DECOR = [
    { id: 'umbrella', name: 'Café umbrella table', icon: '⛱️', price: 40 },
    { id: 'bench', name: 'Wooden bench', icon: '🪑', price: 25 },
    { id: 'lamps', name: 'Street lamps', icon: '🏮', price: 35 },
    { id: 'tree', name: 'Big leafy tree', icon: '🌳', price: 45 },
    { id: 'bush', name: 'Round bush', icon: '🌿', price: 15 },
    { id: 'sign', name: 'Menu board', icon: '🪧', price: 20 },
    { id: 'pot', name: 'Sunflower pot', icon: '🌻', price: 15 },
    { id: 'roof', name: 'Rooftop garden', icon: '🪴', price: 30 },
    { id: 'bird', name: 'Little bird friend', icon: '🐦', price: 30 },
  ];

  const BACKGROUNDS = [
    { id: 'day', name: 'Sunny day', icon: '☀️', price: 0 },
    { id: 'sunset', name: 'Sunset', icon: '🌇', price: 30 },
    { id: 'night', name: 'Starry night', icon: '🌙', price: 40 },
  ];

  // Stable pseudo-random so sparkles don't jump around between redraws.
  const hash = (a, b) => {
    let h = (a * 374761393 + b * 668265263) | 0;
    h = (h ^ (h >>> 13)) * 1274126177;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };

  function drawSky(ctx, skyId, t) {
    const s = SKIES[skyId] || SKIES.day;
    for (let y = 0; y < 60; y++) {
      rect(ctx, y < 30 ? s.top : s.bottom, 0, y, W, 1);
    }
    if (skyId === 'night') {
      for (let i = 0; i < 40; i++) {
        const sx = Math.floor(hash(i, 1) * W);
        const sy = Math.floor(hash(i, 2) * 40);
        const twinkle = hash(i, Math.floor(t / 8)) > 0.2;
        if (twinkle) rect(ctx, '#fff6d6', sx, sy);
      }
      drawSprite(ctx, { colors: { m: '#fff3c4' }, rows: ['..mm.', '.mm..', 'mm...', 'mm...', '.mm..', '..mm.'] }, 20, 5);
    }
    const clouds = [[10, 8, 26, 0.05], [60, 20, 14, 0.08], [110, 4, 34, 0.03], [150, 26, 18, 0.06]];
    for (const [bx, cy, w, speed] of clouds) {
      const span = W + w;
      const cx = Math.floor(((bx + t * speed) % span + span) % span) - w;
      rect(ctx, s.cloud, cx + 2, cy, w - 4, 1);
      rect(ctx, s.cloud, cx, cy + 1, w, 3);
      rect(ctx, s.cloud, cx + 1, cy + 4, w - 2, 1);
      rect(ctx, s.cloudHi, cx + 3, cy + 1, w - 8, 1);
    }
  }

  function drawBushes(ctx) {
    for (let x = 0; x < W; x++) {
      const top = 47 + Math.round(2 * Math.sin(x / 5) + 1.5 * Math.sin(x / 2.3));
      rect(ctx, '#c5d36f', x, top, 1, 61 - top);
      rect(ctx, '#dfe79a', x, top, 1, 1);
      for (let y = top + 2; y < 60; y += 3) {
        if (hash(x, y) > 0.9) rect(ctx, '#eef2b8', x, y);
      }
    }
    // pale path / river strip behind the hedge
    rect(ctx, '#fbf3e2', 0, 58, W, 7);
    for (let x = 0; x < W; x += 9) rect(ctx, '#eadcbf', x + (x % 2 ? 3 : 0), 60 + (x % 3), 4, 1);
  }

  function drawHedge(ctx, skipFrom, skipTo) {
    for (let x = 0; x < W; x++) {
      if (x >= skipFrom && x <= skipTo) continue;
      const top = 64 + Math.round(Math.sin(x / 2.5));
      rect(ctx, '#b3c65c', x, top, 1, 72 - top);
      rect(ctx, '#d5e28b', x, top, 1, 1);
      if (hash(x, 7) > 0.85) rect(ctx, '#eef2b8', x, top + 2);
    }
  }

  function drawGround(ctx) {
    rect(ctx, '#f6e7c8', 0, 71, W, H - 71);
    rect(ctx, '#e0c9a0', 0, 71, W, 1);
    for (let row = 0, y = 74; y < H; row++, y += 4) {
      for (let x = (row % 2) * 5; x < W; x += 10) {
        rect(ctx, '#e4d1aa', x + Math.floor(hash(x, y) * 3), y, 3 + Math.floor(hash(y, x) * 2), 1);
      }
    }
  }

  function drawShop(ctx, skyId) {
    const glass = (SKIES[skyId] || SKIES.day).glass;
    // rooftop rail
    rect(ctx, '#fffaf0', 95, 13, 52, 1);
    rect(ctx, '#fffaf0', 95, 16, 52, 1);
    for (let x = 95; x <= 146; x += 6) rect(ctx, '#d9c4a8', x, 13, 1, 5);
    // brick wall
    rect(ctx, '#c9604c', 96, 18, 50, 54);
    for (let y = 21; y < 72; y += 4) {
      rect(ctx, '#d9826c', 96, y, 50, 1);
      for (let x = 96 + ((y / 4) % 2 ? 0 : 4); x < 146; x += 8) rect(ctx, '#d9826c', x, y - 3, 1, 3);
    }
    rect(ctx, TRIM, 95, 18, 1, 54);
    rect(ctx, TRIM, 146, 18, 1, 54);
    rect(ctx, '#b4513f', 96, 18, 50, 2);
    // upper window
    rect(ctx, '#6b4a3f', 102, 23, 38, 16);
    rect(ctx, glass, 104, 25, 34, 12);
    for (const s of [109, 121, 131]) {
      for (let i = 0; i < 5; i++) rect(ctx, '#fff8f0', s + i, 34 - 2 * i, 1, 2);
    }
    rect(ctx, '#c98b6b', 108, 35, 8, 1);
    rect(ctx, '#c98b6b', 124, 35, 8, 1);
    // awning
    for (let r = 0; r < 9; r++) {
      const y = 40 + r;
      const left = 94 - Math.floor(r / 2);
      const right = 148 + Math.floor(r / 2);
      for (let x = left; x <= right; x++) {
        const red = Math.floor((x - 88 + Math.floor(r / 3)) / 6) % 2 === 0;
        rect(ctx, r === 0 ? TRIM : red ? '#d4634f' : '#fbeedc', x, y);
      }
    }
    for (let x = 90; x < 153; x += 6) {
      const red = Math.floor((x - 88 + 2) / 6) % 2 === 0;
      const c = red ? '#d4634f' : '#fbeedc';
      rect(ctx, c, x, 49, 6, 1);
      rect(ctx, c, x + 1, 50, 4, 1);
      rect(ctx, c, x + 2, 51, 2, 1);
    }
    // shop window with a planter inside
    rect(ctx, '#6b4a3f', 100, 53, 20, 16);
    rect(ctx, glass, 101, 54, 18, 14);
    for (const s of [103, 111]) {
      for (let i = 0; i < 4; i++) rect(ctx, '#fff8f0', s + i, 60 - 2 * i, 1, 2);
    }
    for (let x = 101; x < 119; x++) {
      const top = 63 + Math.round(Math.sin(x / 1.7));
      rect(ctx, '#a9c255', x, top, 1, 68 - top);
      if (hash(x, 3) > 0.7) rect(ctx, '#eef2b8', x, top + 1);
    }
    // door
    rect(ctx, TRIM, 123, 52, 16, 20);
    rect(ctx, '#e8927c', 124, 53, 14, 19);
    for (const x of [127, 131, 135]) rect(ctx, '#d27a65', x, 55, 1, 15);
    rect(ctx, '#fbeedc', 125, 63);
  }

  const DECOR_DRAW = {
    tree(ctx) {
      const blobs = [[92, 20, 9], [100, 12, 8], [88, 32, 8], [102, 28, 7], [96, 40, 6]];
      for (const [cx, cy, r] of blobs) {
        for (let y = -r; y <= r; y++) {
          const w = Math.round(Math.sqrt(r * r - y * y));
          rect(ctx, '#9fbf4f', cx - w, cy + y, w * 2, 1);
        }
      }
      for (const [cx, cy, r] of blobs) {
        for (let y = -r + 1; y < 0; y++) {
          const w = Math.round(Math.sqrt(r * r - y * y)) - 2;
          if (w > 0) rect(ctx, '#bfd66a', cx - w, cy + y, w, 1);
        }
        rect(ctx, '#eef2b8', cx - 3, cy - r + 3, 1, 1);
        rect(ctx, '#eef2b8', cx + 2, cy - 1, 1, 1);
      }
    },
    roof(ctx) {
      for (const x of [104, 119, 134]) {
        rect(ctx, '#d67b5a', x, 9, 5, 4);
        rect(ctx, '#b35f43', x, 9, 5, 1);
        rect(ctx, '#7fa33f', x + 2, 4, 1, 5);
        rect(ctx, '#7fa33f', x, 6, 1, 3);
        rect(ctx, '#7fa33f', x + 4, 5, 1, 4);
        if (x === 119) { rect(ctx, '#e8364f', x + 1, 3, 3, 2); }
      }
    },
    lamps(ctx, skyId) {
      for (const x of [64, 153]) {
        const glow = skyId === 'night' ? '#ffe07a' : '#fff3d0';
        if (skyId === 'night') {
          ctx.fillStyle = 'rgba(255, 224, 122, 0.12)';
          ctx.fillRect(x - 13, 29, 16, 16);
        }
        rect(ctx, '#6b5a55', x, 28, 2, 43);
        rect(ctx, '#6b5a55', x - 5, 28, 6, 1);
        rect(ctx, '#6b5a55', x - 5, 29, 1, 3);
        rect(ctx, '#6b5a55', x - 8, 32, 7, 8);
        rect(ctx, glow, x - 7, 33, 5, 6);
        rect(ctx, '#6b5a55', x - 1, 70, 4, 2);
      }
    },
    umbrella(ctx) {
      for (let r = 0; r < 6; r++) {
        const w = 6 + r * 3;
        for (let i = 0; i < w; i++) {
          const x = 20 - Math.floor(w / 2) + i;
          rect(ctx, Math.floor((i * 4) / w) % 2 ? '#fbeedc' : '#e89a7a', x, 50 + r);
        }
      }
      rect(ctx, TRIM, 9, 56, 23, 1);
      rect(ctx, '#8a6a5c', 20, 49, 1, 17);
      rect(ctx, '#f4e0b0', 12, 65, 17, 2);
      rect(ctx, TRIM, 12, 67, 17, 1);
      rect(ctx, TRIM, 14, 68, 1, 4);
      rect(ctx, TRIM, 26, 68, 1, 4);
      for (const x of [6, 31]) {
        rect(ctx, '#d4634f', x, 63, 4, 1);
        rect(ctx, '#e8927c', x, 64, 4, 4);
        rect(ctx, TRIM, x, 68, 1, 4);
        rect(ctx, TRIM, x + 3, 68, 1, 4);
      }
    },
    bench(ctx) {
      rect(ctx, '#c98b5a', 38, 61, 18, 2);
      rect(ctx, '#c98b5a', 38, 65, 18, 2);
      rect(ctx, '#a86d42', 38, 67, 18, 1);
      for (const x of [39, 54]) rect(ctx, TRIM, x, 63, 1, 9);
    },
    bush(ctx) {
      const cx = 76;
      const cy = 64;
      for (let y = -7; y <= 7; y++) {
        const w = Math.round(Math.sqrt(64 - y * y) * 1.2);
        rect(ctx, '#c5d36f', cx - w, cy + y, w * 2, 1);
      }
      for (let i = 0; i < 12; i++) {
        rect(ctx, '#eef2b8', cx - 7 + Math.floor(hash(i, 5) * 14), cy - 5 + Math.floor(hash(i, 6) * 10));
      }
      rect(ctx, '#fff6d6', cx - 10, cy - 8);
      rect(ctx, '#fff6d6', cx + 9, cy - 6);
    },
    sign(ctx) {
      rect(ctx, '#6b5a55', 85, 59, 8, 12);
      rect(ctx, '#f3ead8', 86, 60, 6, 8);
      rect(ctx, '#c9604c', 87, 62, 4, 1);
      rect(ctx, '#c9a88a', 87, 64, 4, 1);
      rect(ctx, '#c9a88a', 87, 66, 3, 1);
    },
    pot(ctx) {
      rect(ctx, '#7fa33f', 142, 58, 1, 8);
      rect(ctx, '#7fa33f', 143, 61, 2, 1);
      rect(ctx, '#ffc93c', 140, 55, 5, 4);
      rect(ctx, '#a0524a', 141, 56, 3, 2);
      rect(ctx, '#d67b5a', 139, 66, 7, 5);
      rect(ctx, '#b35f43', 139, 66, 7, 1);
    },
  };

  // Everything that doesn't move, drawn once and reused until the decor changes.
  function buildStreet(decor, skyId) {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d');
    const has = (id) => decor.includes(id);
    drawBushes(ctx);
    if (has('tree')) DECOR_DRAW.tree(ctx);
    drawShop(ctx, skyId);
    if (has('roof')) DECOR_DRAW.roof(ctx);
    drawHedge(ctx, 95, 147);
    drawGround(ctx);
    for (const id of ['lamps', 'umbrella', 'bench', 'bush', 'sign', 'pot']) {
      if (has(id)) DECOR_DRAW[id](ctx, skyId);
    }
    return c;
  }

  const BIRD = { colors: { w: '#f3efe6', k: '#3b2a26', y: '#f0924a' }, rows: ['.oo..', 'okwwy', 'owww.', '.oo..'] };
  const BIRD_FLAP = { colors: BIRD.colors, rows: ['o...o', '.owo.', 'okwwy', '.oo..'] };

  function drawBird(ctx, t, perched) {
    if (perched) {
      drawSprite(ctx, BIRD, 62, 24 - (t % 20 < 2 ? 1 : 0));
      return;
    }
    const x = Math.floor((t * 0.6) % (W + 20)) - 10;
    const y = 18 + Math.round(3 * Math.sin(t / 6));
    drawSprite(ctx, t % 4 < 2 ? BIRD : BIRD_FLAP, x, y);
  }

  return {
    W, H, CHARACTERS, CHAR_BY_ID, ACCESSORIES, ACC_BY_ID, SPRITES, DECOR, BACKGROUNDS,
    drawSprite, drawPet, drawSky, buildStreet, drawBird,
  };
})();
