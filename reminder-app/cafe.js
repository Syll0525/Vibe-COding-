'use strict';

// Inside the shop: a cosy pixel interior where customers come in, sit down and order.
// Tap an order bubble, tap the ingredients in the right order, and serve it to earn
// your buddy coin tips. Every job has its own shop and menu.
// Uses app.js / pet.js globals: state, save, toast, bumpCoins, $, el, todayKey, Pet, Pixel, Sfx.
const Cafe = (() => {
  const W = 128;
  const H = 160;
  const SHIFT_SECONDS = 75;
  const PATIENCE_SECONDS = 28;
  const DAILY_CAP = 40; // café coins per day, so tasks stay the main way to earn

  // ---------- menus ----------

  const SHOPS = {
    barista: {
      place: 'café', wall: '#c9604c', wallDark: '#bb5543', floorA: '#e8a07c', floorB: '#d98d69',
      pantry: { beans: ['🫘', 'Coffee beans'], milk: ['🥛', 'Milk'], foam: ['☁️', 'Foam'], choco: ['🍫', 'Chocolate'], ice: ['🧊', 'Ice'] },
      menu: [
        { id: 'espresso', icon: '☕', name: 'Espresso', steps: ['beans'] },
        { id: 'latte', icon: '🥛', name: 'Latte', steps: ['beans', 'milk'] },
        { id: 'cappuccino', icon: '☁️', name: 'Cappuccino', steps: ['beans', 'milk', 'foam'] },
        { id: 'mocha', icon: '🍫', name: 'Mocha', steps: ['beans', 'choco', 'milk'] },
        { id: 'iced', icon: '🧊', name: 'Iced coffee', steps: ['beans', 'ice', 'milk'] },
      ],
    },
    baker: {
      place: 'bakery', wall: '#efc684', wallDark: '#e3b76f', floorA: '#e6c9a0', floorB: '#d8b98e',
      pantry: { flour: ['🌾', 'Flour'], butter: ['🧈', 'Butter'], egg: ['🥚', 'Egg'], berry: ['🍓', 'Strawberry'], choco: ['🍫', 'Chocolate'], oven: ['🔥', 'Bake'] },
      menu: [
        { id: 'bread', icon: '🍞', name: 'Bread', steps: ['flour', 'oven'] },
        { id: 'croissant', icon: '🥐', name: 'Croissant', steps: ['flour', 'butter', 'oven'] },
        { id: 'cookie', icon: '🍪', name: 'Cookie', steps: ['flour', 'choco', 'oven'] },
        { id: 'pancake', icon: '🥞', name: 'Pancakes', steps: ['flour', 'egg', 'butter'] },
        { id: 'cake', icon: '🍰', name: 'Strawberry cake', steps: ['flour', 'egg', 'oven', 'berry'] },
      ],
    },
    bartender: {
      place: 'juice bar', wall: '#41617a', wallDark: '#385468', floorA: '#c99c7b', floorB: '#ba8d6d',
      pantry: { lemon: ['🍋', 'Lemon'], berry: ['🍓', 'Strawberry'], mango: ['🥭', 'Mango'], honey: ['🍯', 'Honey'], ice: ['🧊', 'Ice'], shake: ['🥤', 'Shake'] },
      menu: [
        { id: 'honeytea', icon: '🍯', name: 'Honey lemon', steps: ['honey', 'lemon'] },
        { id: 'lemonade', icon: '🍋', name: 'Lemonade', steps: ['lemon', 'honey', 'ice'] },
        { id: 'fizz', icon: '🍓', name: 'Strawberry fizz', steps: ['berry', 'ice', 'shake'] },
        { id: 'smoothie', icon: '🥭', name: 'Mango smoothie', steps: ['mango', 'ice', 'shake'] },
        { id: 'punch', icon: '🍹', name: 'Sunset punch', steps: ['mango', 'berry', 'lemon', 'shake'] },
      ],
    },
    florist: {
      place: 'flower shop', wall: '#9fcfae', wallDark: '#8fc39f', floorA: '#efd6bc', floorB: '#e2c7ab',
      pantry: { rose: ['🌹', 'Rose'], sun: ['🌻', 'Sunflower'], tulip: ['🌷', 'Tulip'], leaf: ['🌿', 'Leaves'], ribbon: ['🎀', 'Ribbon'] },
      menu: [
        { id: 'sunny', icon: '🌻', name: 'Sunny bunch', steps: ['sun', 'leaf'] },
        { id: 'roses', icon: '🌹', name: 'Rose bouquet', steps: ['rose', 'leaf', 'ribbon'] },
        { id: 'crown', icon: '👑', name: 'Flower crown', steps: ['leaf', 'tulip', 'rose'] },
        { id: 'tulips', icon: '🌷', name: 'Tulip trio', steps: ['tulip', 'tulip', 'tulip', 'ribbon'] },
        { id: 'posy', icon: '💐', name: 'Mixed posy', steps: ['rose', 'tulip', 'sun', 'ribbon'] },
      ],
    },
    librarian: {
      place: 'book café', wall: '#8d5e3f', wallDark: '#7f5336', floorA: '#d9b48c', floorB: '#caa57e',
      pantry: { red: ['📕', 'Story book'], blue: ['📘', 'Science book'], green: ['📗', 'Nature book'], mark: ['🔖', 'Bookmark'], bag: ['🛍️', 'Tote bag'] },
      menu: [
        { id: 'story', icon: '🧚', name: 'Fairy tale', steps: ['red', 'mark'] },
        { id: 'science', icon: '🔭', name: 'Star guide', steps: ['blue', 'mark'] },
        { id: 'nature', icon: '🌳', name: 'Forest guide', steps: ['green', 'mark'] },
        { id: 'gift', icon: '🎁', name: 'Gift book', steps: ['green', 'mark', 'bag'] },
        { id: 'pack', icon: '📚', name: 'Study pack', steps: ['red', 'blue', 'green', 'bag'] },
      ],
    },
  };

  // Customer fur colours, so the visitors look different from your buddy.
  const FURS = [
    { b: '#f3c9a0', l: '#fff6e6' }, { b: '#9aa6b2', l: '#eef1f4' }, { b: '#5b4a44', l: '#c9b3a6' },
    { b: '#f2a7b8', l: '#fff0f3' }, { b: '#c7d98a', l: '#f4f9e2' }, { b: '#a7c7e7', l: '#eef6ff' },
    { b: '#e3c06b', l: '#fff5d6' }, { b: '#d98c5f', l: '#fff0e2' }, { b: '#ffffff', l: '#f6f1ea' },
  ];
  const HATS = [null, null, null, { head: 'bow' }, { head: 'flower' }, { body: 'scarf' }, { face: 'shades' }, { head: 'party' }];

  // each customer sits on the left of their table
  const SEATS = [
    { x: 10, y: 70, table: [42, 84] },
    { x: 68, y: 66, table: [100, 80] },
    { x: 10, y: 112, table: [42, 126] },
    { x: 68, y: 108, table: [100, 122] },
  ];
  const DOOR = { x: 104, y: 30 };

  // ---------- state ----------

  let open = false;
  let shift = null; // { endsAt, nextAt, customers, served, missed, earned }
  let selected = null; // customer being served
  let made = []; // ingredients tapped so far
  let tick = 0;
  let loop = null;
  let roomKey = '';
  let roomCanvas = null;
  let frontCanvas = null;
  let petBusyUntil = 0;
  let nextId = 1;

  const shop = () => SHOPS[state.pet.role] || SHOPS.barista;
  const now = () => Date.now();
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  const isNightLook = () => document.documentElement.dataset.theme === 'dark';
  const sound = (name) => { if (typeof Sfx !== 'undefined') Sfx.play(name, state.pet.species); };

  function cafeToday() {
    const p = state.pet;
    if (!p.cafe || p.cafe.day !== todayKey()) p.cafe = { day: todayKey(), coins: 0 };
    return p.cafe;
  }

  // ---------- drawing ----------

  function rect(ctx, color, x, y, w = 1, h = 1) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  }

  function shelfItems(ctx, role) {
    const x0 = 66;
    const y = 16;
    rect(ctx, '#7a5548', x0, y + 6, 32, 2);
    const items = {
      barista: () => [0, 8, 16, 24].forEach((d) => { rect(ctx, '#ffffff', x0 + d + 1, y + 2, 5, 4); rect(ctx, '#8a5a3b', x0 + d + 1, y + 2, 5, 1); }),
      baker: () => [0, 10, 20].forEach((d) => { rect(ctx, '#e0a052', x0 + d + 1, y + 3, 8, 3); rect(ctx, '#f3c27a', x0 + d + 2, y + 3, 6, 1); }),
      bartender: () => ['#7fb86a', '#e8927c', '#ffd24a', '#c98bd6', '#7fa7e8'].forEach((c, i) => { rect(ctx, c, x0 + 1 + i * 6, y, 3, 6); rect(ctx, c, x0 + 2 + i * 6, y - 2, 1, 2); }),
      florist: () => ['#ff8fb5', '#ffd24a', '#e8364f', '#c98bd6'].forEach((c, i) => { rect(ctx, '#d67b5a', x0 + 1 + i * 8, y + 3, 5, 3); rect(ctx, '#7fa33f', x0 + 3 + i * 8, y, 1, 3); rect(ctx, c, x0 + 2 + i * 8, y - 2, 3, 2); }),
      librarian: () => ['#d4634f', '#6c8fd6', '#7fb86a', '#f3c24a', '#c98bd6', '#e8927c', '#6c8fd6', '#d4634f', '#7fb86a'].forEach((c, i) => rect(ctx, c, x0 + 1 + i * 3 + (i > 4 ? 2 : 0), y - 1 + (i % 3 === 1 ? 1 : 0), 2, 7 - (i % 3 === 1 ? 1 : 0))),
    };
    (items[role] || items.barista)();
  }

  function counterTop(ctx, role) {
    // what sits on the counter for each job
    const s = {
      barista: () => { rect(ctx, '#9aa1a8', 50, 38, 12, 9); rect(ctx, '#5b4038', 52, 40, 8, 3); rect(ctx, '#ffffff', 54, 44, 4, 3); },
      baker: () => { rect(ctx, '#5b4038', 48, 36, 16, 11); rect(ctx, '#ff8a3d', 50, 42, 12, 3); rect(ctx, '#ffd24a', 52, 43, 8, 1); },
      bartender: () => { rect(ctx, '#c9ced6', 52, 38, 5, 9); rect(ctx, '#eef1f5', 53, 39, 3, 2); rect(ctx, '#ffd24a', 58, 42, 4, 5); },
      florist: () => { rect(ctx, '#7fa7e8', 52, 41, 6, 6); rect(ctx, '#7fa33f', 54, 36, 2, 5); rect(ctx, '#ff8fb5', 52, 34, 6, 3); },
      librarian: () => { rect(ctx, '#d4634f', 50, 42, 10, 2); rect(ctx, '#6c8fd6', 51, 40, 9, 2); rect(ctx, '#7fb86a', 50, 38, 10, 2); },
    };
    (s[role] || s.barista)();
  }

  function buildRoom(role, night) {
    const sh = SHOPS[role] || SHOPS.barista;
    const bg = document.createElement('canvas');
    bg.width = W;
    bg.height = H;
    const ctx = bg.getContext('2d');
    // wall with soft stripes
    rect(ctx, sh.wall, 0, 0, W, 46);
    for (let x = 3; x < W; x += 8) rect(ctx, sh.wallDark, x, 0, 2, 46);
    // window
    rect(ctx, '#e0a64a', 4, 5, 42, 30);
    rect(ctx, night ? '#2f2d57' : '#bfe0ff', 6, 7, 38, 26);
    if (night) {
      [[9, 10], [20, 14], [33, 9], [38, 20], [14, 24], [27, 27]].forEach(([x, y]) => rect(ctx, '#fff6d6', x, y));
      rect(ctx, '#fff3c4', 34, 11, 3, 3);
    } else {
      rect(ctx, '#ffffff', 10, 12, 10, 3); rect(ctx, '#ffffff', 12, 11, 6, 1);
      rect(ctx, '#ffffff', 28, 20, 9, 3); rect(ctx, '#ffffff', 30, 19, 5, 1);
    }
    rect(ctx, '#e0a64a', 24, 7, 2, 26);
    rect(ctx, '#e0a64a', 6, 19, 38, 2);
    rect(ctx, '#fbeedc', 4, 34, 42, 2); // sill
    // little pictures on the wall
    rect(ctx, '#e0a64a', 52, 8, 9, 8); rect(ctx, '#7fa7e8', 53, 9, 7, 6);
    rect(ctx, '#e0a64a', 52, 20, 7, 6); rect(ctx, '#ffd24a', 53, 21, 5, 4);
    shelfItems(ctx, role);
    // arched door
    rect(ctx, '#5b4038', 101, 9, 22, 37);
    rect(ctx, '#8cc084', 103, 13, 18, 33);
    rect(ctx, '#8cc084', 105, 11, 14, 2);
    rect(ctx, '#a6d39d', 106, 16, 2, 26);
    rect(ctx, '#ffd24a', 117, 30, 2, 2);
    // skirting
    rect(ctx, '#5b4038', 0, 46, W, 2);
    // diamond tiled floor
    rect(ctx, sh.floorA, 0, 48, W, H - 48);
    for (let y = 48; y < H; y++) {
      for (let k = -200; k < W + 200; k += 14) {
        const a = k + (y - 48);
        const b = k - (y - 48);
        if (a >= 0 && a < W) rect(ctx, sh.floorB, a, y);
        if (b >= 0 && b < W) rect(ctx, sh.floorB, b, y);
      }
    }
    // rug under the tables
    // tables (white tops with a warm apron and wooden legs)
    for (const s of SEATS) {
      const [tx, ty] = s.table;
      rect(ctx, 'rgba(91,64,56,0.18)', tx - 9, ty + 9, 22, 2);
      rect(ctx, '#7a5548', tx - 7, ty + 4, 2, 6); rect(ctx, '#7a5548', tx + 9, ty + 4, 2, 6);
      rect(ctx, '#5b4038', tx - 10, ty - 1, 24, 7);
      rect(ctx, '#fffaf0', tx - 9, ty, 22, 3);
      rect(ctx, '#f3c27a', tx - 9, ty + 3, 22, 2);
      rect(ctx, '#e8364f', tx - 8, ty + 1, 2, 1); rect(ctx, '#7fa33f', tx - 6, ty + 1, 1, 1);
    }
    // plant in the corner
    rect(ctx, '#d67b5a', 116, 146, 9, 9); rect(ctx, '#b35f43', 116, 146, 9, 2);
    [[120, 134, 1, 12], [116, 137, 4, 2], [122, 135, 4, 2], [115, 140, 3, 2], [123, 139, 4, 2]].forEach(([x, y, w, h]) => rect(ctx, '#7fa33f', x, y, w, h));

    // the counter front is drawn over the pet, so it is its own layer
    const front = document.createElement('canvas');
    front.width = W;
    front.height = H;
    const f = front.getContext('2d');
    rect(f, '#5b4038', 2, 46, 66, 18);
    rect(f, '#fbeedc', 3, 47, 64, 3);
    rect(f, '#a86d42', 3, 50, 64, 13);
    for (let x = 8; x < 66; x += 12) rect(f, '#8f5a35', x, 52, 8, 9);
    counterTop(f, role);
    return { bg, front };
  }

  function draw() {
    const c = $('#cafe-canvas');
    if (!c) return;
    const ctx = c.getContext('2d');
    const role = state.pet.role;
    const night = isNightLook();
    const key = `${role}|${night}`;
    if (key !== roomKey) {
      ({ bg: roomCanvas, front: frontCanvas } = buildRoom(role, night));
      roomKey = key;
    }
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(roomCanvas, 0, 0);

    // your buddy behind the counter
    const busy = now() < petBusyUntil;
    const py = 30 + (busy && tick % 2 ? -2 : 0);
    Pixel.drawPet(ctx, 24, py, {
      species: state.pet.species, role, equipped: state.pet.equipped, stage: Pet.stage(),
      mood: 'happy', eating: false, wave: !shift && Math.floor(tick / 3) % 6 === 0 ? tick : null,
    });
    ctx.drawImage(frontCanvas, 0, 0);

    // customers, back to front
    const list = shift ? [...shift.customers].sort((a, b) => a.y - b.y) : [];
    for (const cu of list) {
      const bob = cu.state === 'enter' || cu.state === 'leave' ? (Math.floor(tick / 2) % 2 ? -1 : 0) : 0;
      ctx.globalAlpha = cu.fade ?? 1;
      Pixel.drawPet(ctx, Math.round(cu.x), Math.round(cu.y) + bob, {
        species: cu.species, colors: cu.fur, equipped: cu.hat || {}, stage: 'adult',
        mood: cu.state === 'eat' || cu.happy ? 'happy' : cu.state === 'wait' && cu.patience < 0.3 ? 'sad' : 'ok',
        eating: cu.state === 'eat' && tick % 4 < 2,
      });
      ctx.globalAlpha = 1;
      if (cu.state === 'eat') {
        Pixel.drawSprite(ctx, Pixel.SPRITES.heart, Math.round(cu.x) + 14, Math.round(cu.y) - 2 - (tick % 8));
      }
      if (cu.coinUntil && now() < cu.coinUntil) {
        Pixel.drawSprite(ctx, Pixel.SPRITES.coin, Math.round(cu.x) + 6, Math.round(cu.y) - 8 - (tick % 6));
      }
    }
    renderBubbles();
  }

  // ---------- customers ----------

  function freeSeat() {
    const taken = new Set(shift.customers.filter((c) => c.state !== 'leave').map((c) => c.seat));
    const free = SEATS.map((_, i) => i).filter((i) => !taken.has(i));
    return free.length ? pick(free) : null;
  }

  function spawn() {
    const seat = freeSeat();
    if (seat == null) return;
    const others = Pixel.CHARACTERS.map((c) => c.id);
    shift.customers.push({
      id: nextId++, seat, state: 'enter', x: DOOR.x, y: DOOR.y,
      species: pick(others), fur: pick(FURS), hat: pick(HATS),
      order: pick(shop().menu), patience: 1, happy: false,
    });
    sound('coin');
  }

  function moveToward(cu, tx, ty, speed = 1.6) {
    const dx = tx - cu.x;
    const dy = ty - cu.y;
    const d = Math.hypot(dx, dy);
    if (d <= speed) { cu.x = tx; cu.y = ty; return true; }
    cu.x += (dx / d) * speed;
    cu.y += (dy / d) * speed;
    return false;
  }

  function step() {
    tick++;
    if (shift) {
      const t = now();
      if (t >= shift.endsAt && shift.customers.every((c) => c.state === 'leave' || c.state === 'eat')) {
        // let anyone still eating finish, then end
        if (!shift.customers.length || shift.customers.every((c) => c.state === 'leave' && c.fade <= 0.05)) {
          endShift();
          draw();
          return;
        }
      }
      if (t < shift.endsAt && t >= shift.nextAt) {
        spawn();
        shift.nextAt = t + 4500 + Math.random() * 3500;
      }
      for (const cu of shift.customers) {
        if (cu.state === 'enter') {
          const s = SEATS[cu.seat];
          if (moveToward(cu, s.x, s.y)) { cu.state = 'wait'; cu.waitStart = t; }
        } else if (cu.state === 'wait') {
          cu.patience = Math.max(0, 1 - (t - cu.waitStart) / (PATIENCE_SECONDS * 1000));
          if (cu.patience <= 0 || t >= shift.endsAt + 4000) {
            cu.state = 'leave';
            cu.angry = true;
            shift.missed++;
            if (selected === cu) clearOrder();
            sound('aww');
            renderPanel();
          }
        } else if (cu.state === 'eat') {
          if (t >= cu.eatUntil) cu.state = 'leave';
        } else if (cu.state === 'leave') {
          if (moveToward(cu, DOOR.x, DOOR.y, 1.8)) cu.fade = Math.max(0, (cu.fade ?? 1) - 0.25);
        }
      }
      shift.customers = shift.customers.filter((c) => !(c.state === 'leave' && c.fade === 0));
      renderTimer();
    }
    draw();
  }

  // ---------- bubbles over the canvas ----------

  function renderBubbles() {
    const box = $('#cafe-bubbles');
    if (!box) return;
    const waiting = shift ? shift.customers.filter((c) => c.state === 'wait' || (c.state === 'leave' && c.angry && (c.fade ?? 1) > 0.5)) : [];
    const seen = new Set();
    for (const cu of waiting) {
      seen.add(String(cu.id));
      let b = box.querySelector(`[data-cid="${cu.id}"]`);
      if (!b) {
        b = el('button', { type: 'button', className: 'cafe-bubble', ariaLabel: `Order: ${cu.order.name}` },
          el('span', { className: 'cb-icon' }, cu.order.icon), el('i', { className: 'cb-bar' }, el('b')));
        b.dataset.cid = cu.id;
        b.addEventListener('click', () => takeOrder(cu));
        box.append(b);
      }
      b.style.left = `${((cu.x + 8) / W) * 100}%`;
      b.style.top = `${((cu.y - 1) / H) * 100}%`;
      b.classList.toggle('selected', selected === cu);
      b.classList.toggle('angry', !!cu.angry);
      b.querySelector('.cb-icon').textContent = cu.angry ? '💢' : cu.order.icon;
      const bar = b.querySelector('.cb-bar b');
      bar.style.width = `${Math.round(cu.patience * 100)}%`;
      bar.style.background = cu.patience > 0.5 ? '#7fcf8a' : cu.patience > 0.25 ? '#ffd24a' : '#e8364f';
    }
    box.querySelectorAll('.cafe-bubble').forEach((b) => { if (!seen.has(b.dataset.cid)) b.remove(); });
  }

  // ---------- making an order ----------

  function takeOrder(cu) {
    if (!shift || cu.state !== 'wait') return;
    selected = cu;
    made = [];
    sound('pat');
    renderPanel();
  }

  function clearOrder() {
    selected = null;
    made = [];
  }

  function addIngredient(key) {
    if (!selected) {
      toast('Tap a customer’s bubble first 👆');
      return;
    }
    made.push(key);
    petBusyUntil = now() + 500;
    sound('pat');
    renderPanel();
  }

  function serve() {
    const cu = selected;
    if (!cu || cu.state !== 'wait') return;
    const right = made.length === cu.order.steps.length && made.every((k, i) => k === cu.order.steps[i]);
    if (!right) {
      cu.waitStart -= PATIENCE_SECONDS * 1000 * 0.2; // a wrong order costs some patience
      made = [];
      sound('nope');
      say(`Oops, that's not quite the ${cu.order.name.toLowerCase()}! Let's try again 😅`);
      renderPanel();
      return;
    }
    const bonus = cu.patience > 0.6 ? 2 : cu.patience > 0.3 ? 1 : 0;
    const today = cafeToday();
    const coins = Math.max(0, Math.min(2 + bonus, DAILY_CAP - today.coins));
    today.coins += coins;
    state.pet.coins += coins;
    shift.earned += coins;
    shift.served++;
    cu.state = 'eat';
    cu.happy = true;
    cu.eatUntil = now() + 3000;
    cu.coinUntil = now() + 1500;
    clearOrder();
    sound('yay');
    if (coins) bumpCoins();
    say(coins ? `${pick(['Yummy!', 'Thank you!', 'Perfect!', 'So good!'])} +${coins} 🪙` : 'Thank you! 💗 (café tips are full for today)');
    save();
    renderPanel();
  }

  let lastSay = '';
  function say(text) {
    lastSay = text;
    const s = $('#cafe-say');
    if (s) s.textContent = `${state.pet.name}: ${text}`;
  }

  // ---------- shift ----------

  function startShift() {
    if (Pet.info().sick) {
      toast(`${state.pet.name} is too sick to work today 🤒 Some 💊 medicine first?`);
      return;
    }
    shift = { endsAt: now() + SHIFT_SECONDS * 1000, nextAt: now() + 800, customers: [], served: 0, missed: 0, earned: 0 };
    clearOrder();
    say(`We're open! Tap an order bubble to start ${shop().menu[0].icon}`);
    sound('hello');
    renderPanel();
  }

  function endShift() {
    const s = shift;
    shift = null;
    clearOrder();
    const p = state.pet;
    p.happy = Math.min(100, p.happy + Math.min(15, s.served * 2));
    p.hunger = Math.max(0, p.hunger - 5);
    if (s.served) {
      Pet.log('🏪', `We served ${s.served} customer${s.served === 1 ? '' : 's'} at the ${shop().place} together!`, { coins: s.earned });
    }
    save();
    Pet.render();
    sound(s.served ? 'buy' : 'aww');
    renderPanel(s);
  }

  function renderTimer() {
    const t = $('#cafe-timer');
    if (!t) return;
    if (!shift) { t.textContent = ''; return; }
    const left = Math.max(0, Math.ceil((shift.endsAt - now()) / 1000));
    t.textContent = left ? `⏱ ${left}s` : '⏱ closing…';
    $('#cafe-earned').textContent = `🪙 +${shift.earned}`;
  }

  // ---------- panel under the room ----------

  function renderPanel(summary) {
    const box = $('#cafe-panel');
    if (!box) return;
    const sh = shop();
    const today = cafeToday();
    box.replaceChildren();
    $('#cafe-title').textContent = `${state.pet.name}'s ${sh.place}`;
    renderTimer();

    if (summary) {
      const stars = summary.served >= 8 ? '⭐⭐⭐' : summary.served >= 5 ? '⭐⭐' : summary.served >= 1 ? '⭐' : '';
      box.append(el('div', { className: 'cafe-summary' },
        el('h3', {}, summary.served ? `Shift over! ${stars}` : 'Shift over'),
        el('p', {}, `Served ${summary.served} · Missed ${summary.missed} · Earned 🪙 ${summary.earned}`),
        el('p', { className: 'muted small' }, summary.served ? `${state.pet.name} had so much fun working with you! 💗` : 'The customers left hungry… try tapping their bubbles next time!'),
        el('div', { className: 'cafe-actions' },
          el('button', { type: 'button', className: 'btn', onclick: close }, 'Back home'),
          el('button', { type: 'button', className: 'btn primary', onclick: startShift }, 'Work again'))));
      return;
    }

    if (!shift) {
      box.append(
        el('p', { className: 'cafe-say', id: 'cafe-say' }, `${state.pet.name}: ${lastSay || `Welcome to my ${sh.place}! Want to help me serve today? ${Pixel.ROLE_BY_ID[state.pet.role]?.icon || ''}`}`),
        el('ul', { className: 'cafe-rules' },
          el('li', {}, 'Customers come in and show what they want in a bubble.'),
          el('li', {}, 'Tap a bubble, tap the ingredients in order, then Serve.'),
          el('li', {}, `Each order earns 🪙 2, or up to 4 if you're quick. Today: ${today.coins}/${DAILY_CAP} café coins.`)),
        el('h3', {}, 'Menu'),
        el('div', { className: 'cafe-menu' }, ...sh.menu.map((m) => el('div', { className: 'menu-row' },
          el('span', { className: 'menu-icon' }, m.icon), el('b', {}, m.name),
          el('span', { className: 'menu-steps' }, m.steps.map((k) => sh.pantry[k][0]).join(' → '))))),
        el('button', { type: 'button', className: 'btn primary wide', onclick: startShift }, `🔔 Open the ${sh.place} (${SHIFT_SECONDS}s shift)`));
      return;
    }

    box.append(el('p', { className: 'cafe-say', id: 'cafe-say' }, `${state.pet.name}: ${lastSay}`));
    if (selected) {
      const o = selected.order;
      const chips = o.steps.map((k, i) => {
        const doneOk = made[i] === k;
        const wrong = made[i] && made[i] !== k;
        return el('span', { className: 'step' + (doneOk ? ' ok' : '') + (wrong ? ' wrong' : '') }, sh.pantry[k][0]);
      });
      box.append(el('div', { className: 'cafe-order' },
        el('span', { className: 'order-icon' }, o.icon),
        el('div', {}, el('b', {}, o.name), el('div', { className: 'steps' }, ...chips.flatMap((c, i) => (i ? [el('span', { className: 'arrow' }, '→'), c] : [c]))))));
    } else {
      box.append(el('p', { className: 'muted cafe-hint' }, 'Tap a customer’s bubble to take their order 👆'));
    }
    box.append(el('div', { className: 'pantry' }, ...Object.entries(sh.pantry).map(([k, [icon, name]]) => el('button', {
      type: 'button', className: 'ingredient', ariaLabel: name, onclick: () => addIngredient(k), disabled: !selected,
    }, el('span', {}, icon), el('small', {}, name)))));
    const ready = selected && made.length >= selected.order.steps.length;
    box.append(el('div', { className: 'cafe-actions' },
      el('button', { type: 'button', className: 'btn', disabled: !made.length, onclick: () => { made = []; renderPanel(); } }, '↺ Start over'),
      el('button', { type: 'button', className: 'btn primary', disabled: !ready, onclick: serve }, `Serve ${selected ? selected.order.icon : ''}`)));
  }

  // ---------- open / close ----------

  function openCafe() {
    if (open) return;
    open = true;
    $('#cafe').hidden = false;
    document.body.classList.add('sheet-open');
    lastSay = '';
    renderPanel();
    draw();
    clearInterval(loop);
    loop = setInterval(step, 100);
  }

  function close() {
    open = false;
    if (shift) endShift();
    clearInterval(loop);
    $('#cafe').hidden = true;
    if (!document.querySelector('.sheet:not([hidden]), .onboarding:not([hidden])')) document.body.classList.remove('sheet-open');
  }

  $('#cafe-back').addEventListener('click', close);
  $('#cafe-canvas').addEventListener('click', (e) => {
    // tapping a waiting customer also takes their order
    if (!shift) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    const y = ((e.clientY - r.top) / r.height) * H;
    const hit = shift.customers.find((c) => c.state === 'wait' && x >= c.x && x <= c.x + 16 && y >= c.y && y <= c.y + 16);
    if (hit) takeOrder(hit);
  });
  document.querySelectorAll('[data-open-cafe]').forEach((b) => b.addEventListener('click', openCafe));

  return { open: openCafe, close, SHOPS, DAILY_CAP };
})();
