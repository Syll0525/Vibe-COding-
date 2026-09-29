'use strict';

// The virtual pet: finishing tasks earns coins, coins buy food, outfits and decor.
const Pet = (() => {
  const COINS_ON_TIME = 10;
  const COINS_LATE = 5;
  const COINS_NOTE = 5;
  const ON_TIME_GRACE_MS = 60 * 60 * 1000;
  const PLAY_COOLDOWN_MS = 30 * 60 * 1000;
  const PAT_COOLDOWN_MS = 10 * 60 * 1000;

  const FOOD = [
    { id: 'cookie', name: 'Cookie', icon: '🍪', price: 3, hunger: 10, happy: 8 },
    { id: 'onigiri', name: 'Rice ball', icon: '🍙', price: 5, hunger: 30, happy: 2 },
    { id: 'boba', name: 'Boba tea', icon: '🧋', price: 8, hunger: 20, happy: 15 },
    { id: 'cake', name: 'Strawberry cake', icon: '🍰', price: 15, hunger: 40, happy: 25 },
  ];
  const FOOD_BY_ID = Object.fromEntries(FOOD.map((f) => [f.id, f]));

  const $ = (sel) => document.querySelector(sel);
  const clamp = (n) => Math.max(0, Math.min(100, n));
  const isNight = () => { const h = new Date().getHours(); return h >= 22 || h < 7; };
  const pad = (n) => String(n).padStart(2, '0');
  const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fmtTime = (d) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const hashStr = (str) => {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
    return (h >>> 0) / 4294967296;
  };

  let getState;
  let persist;
  let toast;
  let getProgress = () => ({ doneToday: 0, leftToday: 0, overdue: 0, next: null, streak: 0 });
  let getUserName = () => '';
  const pet = () => getState().pet;
  // Sfx is a script-level const (not on window), loaded before this file
  const sound = (name) => { if (typeof Sfx !== 'undefined') Sfx.play(name, pet().species); };

  function fresh() {
    return {
      species: 'hamster', name: 'Hammy', coins: 20, hunger: 80, happy: 80, updatedAt: Date.now(),
      tasksDone: 0, food: { onigiri: 2, cookie: 1 }, owned: [], equipped: {},
      decor: [], hiddenDecor: [], bg: 'day', lastNoteBonus: null, lastPlay: 0, lastPat: 0,
      role: 'barista', log: {}, moods: {}, lastGreet: 0,
    };
  }

  function ensure(state) {
    const p = Object.assign(fresh(), state.pet || {});
    p.food ||= {};
    p.equipped ||= {};
    p.log ||= {};
    p.moods ||= {};
    // keep two months of diary
    const oldest = dayKey(new Date(Date.now() - 60 * 24 * 60 * 60 * 1000));
    for (const k of Object.keys(p.log)) if (k < oldest) delete p.log[k];
    state.pet = p;
    return state;
  }

  // Hunger and happiness drift down slowly: empty after about a day.
  function decay(p, now = Date.now()) {
    const mins = (now - p.updatedAt) / 60000;
    if (mins <= 0) return;
    p.hunger = clamp(p.hunger - mins / 15);
    p.happy = clamp(p.happy - mins / 20);
    p.updatedAt = now;
  }

  function mood(p) {
    if (p.hunger < 25) return 'hungry';
    if (p.happy < 25) return 'sad';
    if (p.happy >= 60 && p.hunger >= 40) return 'happy';
    return 'ok';
  }

  const level = (p) => 1 + Math.floor(p.tasksDone / 5);
  const roleOf = (p) => Pixel.ROLE_BY_ID[p.role] || Pixel.ROLES[0];

  // Everything that happens goes into the pet's diary, which it reads back when you ask.
  function logEvent(p, icon, text, extra = {}) {
    const day = dayKey();
    const list = (p.log[day] ||= []);
    list.push({ t: Date.now(), icon, text, ...extra });
    if (list.length > 200) list.shift();
  }

  // ---------- coins (called from app.js) ----------

  function reward(state, task) {
    const p = state.pet;
    decay(p);
    const onTime = Date.now() <= new Date(task.due).getTime() + ON_TIME_GRACE_MS;
    const coins = onTime ? COINS_ON_TIME : COINS_LATE;
    task.coins = coins;
    p.coins += coins;
    p.tasksDone += 1;
    p.happy = clamp(p.happy + 10);
    logEvent(p, '✅', `You finished "${task.title}"${task.location ? ` at ${task.location}` : ''}${onTime ? '' : ' (a bit late)'}`, { taskId: task.id, coins });
    celebrate();
    sound('yay');
    say(onTime ? `Yay, right on time! +${coins} coins 🪙` : `Better late than never! +${coins} coins 🪙`);
    return coins;
  }

  function takeBack(state, task) {
    if (!task.coins) return;
    const p = state.pet;
    p.coins = Math.max(0, p.coins - task.coins);
    p.tasksDone = Math.max(0, p.tasksDone - 1);
    task.coins = 0;
    for (const k of Object.keys(p.log)) p.log[k] = p.log[k].filter((e) => e.taskId !== task.id);
  }

  function noteBonus(state, day) {
    const p = state.pet;
    if (p.lastNoteBonus === day) return 0;
    p.lastNoteBonus = day;
    p.coins += COINS_NOTE;
    logEvent(p, '📖', 'You wrote down what you learned today', { coins: COINS_NOTE });
    celebrate();
    sound('coin');
    return COINS_NOTE;
  }

  // ---------- speech ----------

  let speech = null;
  let speechUntil = 0;
  function say(text, ms = 4000) {
    speech = text;
    speechUntil = Date.now() + ms;
    renderSpeech();
  }

  function renderSpeech() {
    const els = document.querySelectorAll('.pet-speech');
    if (!els.length) return;
    const p = pet();
    let text;
    if (speech && Date.now() < speechUntil) text = speech;
    else if (isNight()) text = `${p.name} is sleeping… 💤`;
    else {
      const lines = {
        hungry: ["I'm hungry! Feed me please 🍙", 'My tummy is rumbling… 🥺'],
        sad: ["I'm lonely… let's finish a task together? 🥺", 'Can you pat me? 💗'],
        happy: ["Let's get things done! ✨", "You're doing great! 💕", 'What a lovely day ☀️', `Busy day at the ${roleOf(p).place}! ${roleOf(p).icon}`],
        ok: ["What's next on the list? 📝", 'Tick a task to earn coins 🪙'],
      }[mood(p)];
      text = lines[Math.floor(Date.now() / 60000) % lines.length];
    }
    els.forEach((e) => { e.textContent = text; });
  }

  // ---------- actions ----------

  function feed(foodId) {
    const p = pet();
    decay(p);
    const id = foodId || FOOD.map((f) => f.id).find((fid) => p.food[fid] > 0);
    if (!id || !p.food[id]) {
      say('No snacks in my bag… buy some in the Shop 🛒');
      showView('shop');
      return;
    }
    if (p.hunger >= 97) {
      sound('nope');
      say("I'm so full! Maybe later 😋");
      return;
    }
    const f = FOOD_BY_ID[id];
    p.food[id] -= 1;
    p.hunger = clamp(p.hunger + f.hunger);
    p.happy = clamp(p.happy + f.happy);
    addEffect('eat', 2400, { food: id });
    sound('eat');
    logEvent(p, f.icon, `You fed me a ${f.name.toLowerCase()}`);
    say(`Yum, ${f.name.toLowerCase()}! ${f.icon}`);
    commit();
  }

  function pat() {
    const p = pet();
    decay(p);
    const now = Date.now();
    if (now - p.lastPat > PAT_COOLDOWN_MS) {
      p.happy = clamp(p.happy + 3);
      p.lastPat = now;
      logEvent(p, '💗', 'You gave me head pats');
    }
    addEffect('hearts', 2000);
    sound(isNight() ? 'yawn' : 'pat');
    say(isNight() ? 'Mmm… *yawn* 💤' : 'Hehe, that tickles! 💗');
    commit();
  }

  function play() {
    const p = pet();
    decay(p);
    const now = Date.now();
    if (p.hunger < 10) {
      sound('nope');
      say('Too hungry to play… a snack first? 🍪');
      return;
    }
    const wait = PLAY_COOLDOWN_MS - (now - p.lastPlay);
    if (wait > 0) {
      sound('nope');
      say(`Phew, I'm tired! Let's play again in ${Math.ceil(wait / 60000)} min 😴`);
      return;
    }
    p.lastPlay = now;
    p.happy = clamp(p.happy + 15);
    p.hunger = clamp(p.hunger - 5);
    addEffect('ball', 3200);
    sound('boing');
    logEvent(p, '⚽', 'We played catch together');
    say('Wheee! Catch! ⚽');
    commit();
  }

  function buy(kind, id) {
    const p = pet();
    const item = kind === 'food' ? FOOD_BY_ID[id]
      : kind === 'acc' ? Pixel.ACC_BY_ID[id]
      : kind === 'decor' ? Pixel.DECOR.find((d) => d.id === id)
      : Pixel.BACKGROUNDS.find((b) => b.id === id);
    if (!item || p.coins < item.price) return;
    p.coins -= item.price;
    if (kind === 'food') {
      p.food[id] = (p.food[id] || 0) + 1;
      toast(`Bought ${item.icon} ${item.name}`);
    } else if (kind === 'acc') {
      p.owned.push(id);
      p.equipped[item.slot] = id;
      toast(`${p.name} is wearing the ${item.name.toLowerCase()}!`);
    } else if (kind === 'decor') {
      p.decor.push(id);
      toast(`${item.icon} ${item.name} added to the street!`);
    } else {
      p.owned.push(`bg:${id}`);
      p.bg = id;
      toast(`${item.icon} ${item.name} unlocked!`);
    }
    addEffect('hearts', 1500);
    sound('buy');
    logEvent(p, '🎁', `You bought ${kind === 'food' ? 'me a' : 'the'} ${item.name.toLowerCase()}`);
    commit();
  }

  function commit() {
    persist();
    render();
  }

  // ---------- scene animation ----------

  const stage = document.createElement('canvas');
  stage.width = Pixel.W;
  stage.height = Pixel.H;
  let street = null;
  let streetKey = '';
  let t = 0;
  let petX = 60;
  let targetX = 60;
  let effects = [];

  function addEffect(kind, ms, data = {}) {
    effects.push({ kind, until: Date.now() + ms, start: t, ...data });
  }

  function celebrate() {
    addEffect('hearts', 2500);
    addEffect('coin', 2000);
  }

  function frame() {
    const targets = [...document.querySelectorAll('.scene-canvas')].filter((c) => c.offsetParent);
    if (!targets.length) return; // nothing on screen: skip drawing
    const ctx = stage.getContext('2d');
    const p = pet();
    const now = Date.now();
    effects = effects.filter((e) => e.until > now);
    const busy = effects.some((e) => e.kind === 'eat' || e.kind === 'ball' || e.kind === 'wave');
    const waving = effects.some((e) => e.kind === 'wave');
    const sleeping = isNight() && !effects.length;
    const visibleDecor = p.decor.filter((d) => !p.hiddenDecor.includes(d));

    const key = visibleDecor.join(',') + '|' + p.bg + '|' + p.role;
    if (key !== streetKey) {
      street = Pixel.buildStreet(visibleDecor, p.bg, p.role);
      streetKey = key;
    }

    t++;
    // wander along the street
    if (!sleeping && !busy) {
      if (Math.abs(targetX - petX) < 1 && Math.random() < 0.02) targetX = 6 + Math.floor(Math.random() * 132);
      if (t % 2 === 0 && targetX !== petX) petX += Math.sign(targetX - petX);
    }
    const walking = targetX !== petX && !sleeping && !busy;
    const playing = effects.some((e) => e.kind === 'ball');
    const hop = (playing || effects.some((e) => e.kind === 'hearts')) && Math.floor(t / 3) % 2 ? -2 : 0;
    const bob = walking && Math.floor(t / 3) % 2 ? -1 : 0;
    const x = Math.round(petX);
    const y = 70 + hop + bob;

    Pixel.drawSky(ctx, p.bg, t);
    ctx.drawImage(street, 0, 0);
    if (visibleDecor.includes('bird')) Pixel.drawBird(ctx, t, visibleDecor.includes('lamps'));

    // soft shadow
    ctx.fillStyle = 'rgba(91, 64, 56, 0.18)';
    ctx.fillRect(x + 3, 85, 10, 2);

    Pixel.drawPet(ctx, x, y, {
      species: p.species, equipped: p.equipped, role: p.role, mood: waving ? 'happy' : mood(p), sleeping,
      wave: waving ? Math.floor(t / 3) : null,
      eating: effects.some((e) => e.kind === 'eat') && Math.floor(t / 3) % 2 === 0,
    });

    for (const e of effects) {
      const age = t - e.start;
      if (e.kind === 'hearts') {
        Pixel.drawSprite(ctx, Pixel.SPRITES.heart, x - 6, y + 2 - (age % 12));
        Pixel.drawSprite(ctx, Pixel.SPRITES.heart, x + 17, y + 6 - ((age + 6) % 12));
      } else if (e.kind === 'coin') {
        Pixel.drawSprite(ctx, Pixel.SPRITES.coin, x + 6, y - 6 - Math.min(age, 10));
      } else if (e.kind === 'eat') {
        const sprite = Pixel.SPRITES[e.food] || Pixel.SPRITES.cookie;
        if (age < 12) Pixel.drawSprite(ctx, sprite, x + 17, y + 9);
      } else if (e.kind === 'ball') {
        const bx = x - 14 + ((age * 2) % 44);
        const by = y + 11 - Math.abs(Math.round(8 * Math.sin(age / 3)));
        Pixel.drawSprite(ctx, Pixel.SPRITES.ball, bx, by);
      }
    }

    if (sleeping) {
      Pixel.drawSprite(ctx, Pixel.SPRITES.zzz, x + 14, y - 2 - (Math.floor(t / 5) % 4));
    } else if (mood(p) === 'hungry' && Math.floor(t / 6) % 2) {
      ctx.fillStyle = '#d4634f';
      ctx.fillRect(x + 15, y + 1, 1, 3);
      ctx.fillRect(x + 15, y + 5, 1, 1);
    }

    // Full street for the Pet tab; zoomed canvases follow the pet like a camera.
    for (const c of targets) {
      const out = c.getContext('2d');
      if (c.classList.contains('zoom')) {
        camX += (Math.max(0, Math.min(Pixel.W - c.width, x + 8 - c.width / 2)) - camX) * 0.15;
        out.drawImage(stage, Math.round(camX), Pixel.H - c.height, c.width, c.height, 0, 0, c.width, c.height);
      } else {
        out.drawImage(stage, 0, 0);
      }
    }
  }
  let camX = 20;

  // ---------- greeting ----------

  const MOODS = [
    { id: 'great', icon: '😄', label: 'Great', reply: 'Yay! Your happy mood makes me happy too! 💕' },
    { id: 'okay', icon: '🙂', label: 'Okay', reply: "An okay day is still a good day. I'm right here with you ☕" },
    { id: 'tired', icon: '😴', label: 'Tired', reply: 'Take a little break and drink some water. Small steps still count 💧' },
    { id: 'stressed', icon: '😣', label: 'Stressed', reply: "Deep breath with me… in… and out. Let's do just one small thing. You can do it 🫶" },
  ];

  function hello() {
    const h = new Date().getHours();
    if (h >= 5 && h < 12) return 'Good morning';
    if (h >= 12 && h < 17) return 'Good afternoon';
    if (h >= 17 && h < 22) return 'Good evening';
    return "You're up late";
  }

  // Encouragement built from how the day is actually going.
  function encourage(g = getProgress()) {
    const parts = [];
    if (g.doneToday && !g.leftToday) parts.push(`I saw you finished ${g.doneToday === 1 ? 'your task' : `all ${g.doneToday} tasks`} today. Good job! 🎉`);
    else if (g.doneToday) parts.push(`You've done ${g.doneToday} already, only ${g.leftToday} to go. You've got this! 💪`);
    else if (g.leftToday && g.next) parts.push(`You have ${plural(g.leftToday, 'task')} today. Next up: "${g.next.title}" at ${g.next.time}. Let's do it together! ✨`);
    else if (g.leftToday) parts.push(`You have ${plural(g.leftToday, 'task')} today. Let's do it together! ✨`);
    else parts.push('Your list is clear. Want to plan something nice for today? 🌷');
    if (g.overdue) parts.push(`Don't forget the ${plural(g.overdue, 'task')} from before 🫶`);
    if (g.streak >= 2) parts.push(`${g.streak}-day note streak, amazing! 📖`);
    return parts.join(' ');
  }

  let greetTimer = null;
  function closeGreeting() {
    clearInterval(greetTimer);
    greetTimer = null;
    $('#greeting')?.replaceChildren();
  }

  // Wave hello and ask about the day. Called by app.js when you open or come back to the app.
  function greet() {
    const p = pet();
    const box = $('#greeting');
    if (!box) return;
    const today = dayKey();
    p.lastGreet = Date.now();
    persist();
    addEffect('wave', 3500);
    sound('hello');

    const mini = el('canvas', { class: 'pix wave-pet', width: 20, height: 17 });
    let f = 0;
    const draw = () => {
      const ctx = mini.getContext('2d');
      ctx.clearRect(0, 0, 20, 17);
      Pixel.drawPet(ctx, 1, 1, { species: p.species, equipped: p.equipped, role: p.role, mood: 'happy', wave: f++ });
    };
    draw();
    clearInterval(greetTimer);
    greetTimer = setInterval(draw, 350);

    const body = el('div', { class: 'greet-body' },
      el('strong', { class: 'greet-title' }, `Hi${getUserName() ? ` ${getUserName()}` : ''}! 👋 ${hello()}!`),
      el('p', {}, encourage()));
    const answered = p.moods[today];
    if (answered) {
      body.append(el('p', { class: 'muted small' }, `You said you felt ${answered.icon} ${answered.label.toLowerCase()} today. I'm cheering for you!`));
    } else {
      body.append(el('p', { class: 'greet-q' }, "How's your day going?"));
      body.append(el('div', { class: 'moods' }, ...MOODS.map((m) => el('button', {
        type: 'button', class: 'mood',
        onclick: () => {
          p.moods[today] = { icon: m.icon, label: m.label };
          logEvent(p, m.icon, `You said hi and felt ${m.label.toLowerCase()}`);
          p.happy = clamp(p.happy + 5);
          persist();
          body.querySelector('.greet-q')?.remove();
          body.querySelector('.moods')?.replaceWith(el('p', { class: 'greet-reply' }, m.reply));
          addEffect('hearts', 2000);
          sound(m.id === 'tired' || m.id === 'stressed' ? 'aww' : 'pat');
          setTimeout(closeGreeting, 9000);
        },
      }, el('span', { class: 'mood-icon' }, m.icon), m.label))));
    }
    const close = el('button', { type: 'button', class: 'greet-close', 'aria-label': 'Close', onclick: closeGreeting }, '✕');
    box.replaceChildren(el('div', { class: 'greeting' }, mini, body, close));
  }

  const lastGreet = () => pet().lastGreet || 0;

  // ---------- daily report ----------

  let reportDay = null;

  function workFor(p, day) {
    const role = roleOf(p);
    const isToday = day === dayKey();
    const hour = new Date().getHours();
    const [y, m, d] = day.split('-').map(Number);
    return role.work
      .filter(([h]) => !isToday || h <= hour)
      .map(([h, text, icon], i) => {
        const r = hashStr(`${day}:${role.id}:${i}`);
        return {
          t: new Date(y, m - 1, d, h, Math.floor(r * 50)).getTime(),
          icon, work: true,
          text: `I ${text.charAt(0).toLowerCase()}${text.slice(1).replace('{n}', 4 + Math.floor(r * 20))}`,
        };
      });
  }

  function renderReport() {
    const box = $('#pet-report');
    if (!box) return;
    if (!reportDay) {
      box.hidden = true;
      return;
    }
    const p = pet();
    const role = roleOf(p);
    const isToday = reportDay === dayKey();
    const events = [...(p.log[reportDay] || []), ...workFor(p, reportDay)].sort((a, b) => a.t - b.t);
    const coins = events.reduce((sum, e) => sum + (e.coins || 0), 0);
    const tasks = events.filter((e) => e.taskId).length;

    const items = events.map((e) => el('li', { class: e.work ? 'work' : '' },
      el('span', { class: 'r-time' }, fmtTime(new Date(e.t))),
      el('span', { class: 'r-icon' }, e.icon),
      el('span', {}, e.text)));

    const summary = isToday
      ? `So far today you finished ${plural(tasks, 'task')} and earned ${coins} 🪙. ${encourage()}`
      : `That day you finished ${plural(tasks, 'task')} and earned ${coins} 🪙. ${tasks ? 'I was so proud of you! 💕' : 'Rest days matter too 🌙'}`;

    box.hidden = false;
    box.replaceChildren(
      el('div', { class: 'report-head' },
        el('h3', {}, `${p.name}'s diary · ${role.icon} ${role.name}`),
        el('div', { class: 'report-days' },
          el('button', { type: 'button', class: 'btn small' + (isToday ? ' on' : ''), onclick: () => openReport(dayKey()) }, 'Today'),
          el('button', { type: 'button', class: 'btn small' + (isToday ? '' : ' on'), onclick: () => openReport(dayKey(new Date(Date.now() - 864e5))) }, 'Yesterday'),
          el('button', { type: 'button', class: 'btn small', 'aria-label': 'Close diary', onclick: () => { reportDay = null; renderReport(); } }, '✕'))),
      items.length ? el('ul', { class: 'report-list' }, ...items)
        : el('p', { class: 'muted' }, isToday ? "It's early! Nothing much has happened yet." : 'I have no diary for that day.'),
      el('p', { class: 'report-summary' }, summary));
  }

  function openReport(day = dayKey()) {
    reportDay = day;
    renderReport();
    const p = pet();
    say(day === dayKey() ? `Here's what I did today at the ${roleOf(p).place}! 📋` : "Here's my diary from yesterday 📋");
    $('#pet-report')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // ---------- panel UI ----------

  let view = 'shop';

  function showView(name) {
    view = name;
    document.querySelectorAll('.subtab').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
    renderView();
  }

  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'onclick') node.addEventListener('click', v);
      else if (k === 'class') node.className = v;
      else if (k in node) node[k] = v;
      else node.setAttribute(k, v);
    }
    node.append(...children.filter((c) => c != null));
    return node;
  }

  function petCanvas(look, size = 16) {
    const c = el('canvas', { class: 'pix', width: size, height: size });
    Pixel.drawPet(c.getContext('2d'), 0, 0, { mood: 'happy', ...look });
    return c;
  }

  function itemCard({ preview, name, detail, price, owned, label, onclick, active }) {
    const p = pet();
    const btn = owned
      ? el('button', { class: 'btn small' + (active ? ' on' : ''), type: 'button', onclick, disabled: !onclick }, label)
      : el('button', { class: 'btn small primary', type: 'button', disabled: p.coins < price, onclick }, `🪙 ${price}`);
    return el('li', { class: 'item' + (active ? ' active' : '') },
      el('div', { class: 'item-preview' }, preview),
      el('div', { class: 'item-body' }, el('div', { class: 'item-name' }, name), detail ? el('div', { class: 'item-detail' }, detail) : null),
      btn);
  }

  function section(title, items, emptyText) {
    const frag = document.createDocumentFragment();
    frag.append(el('h3', {}, title));
    if (!items.length && emptyText) frag.append(el('p', { class: 'muted small' }, emptyText));
    else frag.append(el('ul', { class: 'items' }, ...items));
    return frag;
  }

  function renderShop(box) {
    const p = pet();
    box.append(el('p', { class: 'muted small tip' },
      `Earn 🪙 ${COINS_ON_TIME} for each task done on time, 🪙 ${COINS_LATE} if it's late, and 🪙 ${COINS_NOTE} for writing today's note.`));
    box.append(section('Snacks', FOOD.map((f) => itemCard({
      preview: el('span', { class: 'emoji' }, f.icon), name: f.name,
      detail: `+${f.hunger} full · +${f.happy} happy${p.food[f.id] ? ` · have ${p.food[f.id]}` : ''}`,
      price: f.price, onclick: () => buy('food', f.id),
    }))));
    box.append(section('Outfits', Pixel.ACCESSORIES.map((a) => {
      const owned = p.owned.includes(a.id);
      return itemCard({
        preview: petCanvas({ species: p.species, equipped: { [a.slot]: a.id } }), name: a.name,
        price: a.price, owned, label: owned ? 'Owned' : '',
        onclick: owned ? null : () => buy('acc', a.id),
      });
    })));
    box.append(section('Street decor', Pixel.DECOR.map((d) => {
      const owned = p.decor.includes(d.id);
      return itemCard({
        preview: el('span', { class: 'emoji' }, d.icon), name: d.name,
        price: d.price, owned, label: 'Owned', onclick: owned ? null : () => buy('decor', d.id),
      });
    })));
    box.append(section('Sky', Pixel.BACKGROUNDS.filter((b) => b.price).map((b) => {
      const owned = p.owned.includes(`bg:${b.id}`);
      return itemCard({
        preview: el('span', { class: 'emoji' }, b.icon), name: b.name,
        price: b.price, owned, label: 'Owned', onclick: owned ? null : () => buy('bg', b.id),
      });
    })));
  }

  function renderBag(box) {
    const p = pet();
    const snacks = FOOD.filter((f) => p.food[f.id] > 0).map((f) => itemCard({
      preview: el('span', { class: 'emoji' }, f.icon), name: `${f.name} × ${p.food[f.id]}`,
      detail: `+${f.hunger} full · +${f.happy} happy`, owned: true, label: 'Feed', onclick: () => feed(f.id),
    }));
    box.append(section('Snacks', snacks, 'Your bag is empty. Buy snacks in the Shop.'));
  }

  function renderStyle(box) {
    const p = pet();

    const nameInput = el('input', { type: 'text', maxLength: 16, value: p.name, 'aria-label': 'Pet name' });
    nameInput.addEventListener('change', () => {
      p.name = nameInput.value.trim() || Pixel.CHAR_BY_ID[p.species].name;
      commit();
    });
    box.append(el('h3', {}, 'Name'), nameInput);

    box.append(el('h3', {}, 'Choose your buddy'));
    box.append(el('div', { class: 'chars' }, ...Pixel.CHARACTERS.map((ch) => el('button', {
      type: 'button', class: 'char' + (p.species === ch.id ? ' active' : ''),
      onclick: () => {
        const wasDefault = Pixel.CHARACTERS.some((c) => c.name === p.name);
        p.species = ch.id;
        if (wasDefault) p.name = ch.name;
        commit();
      },
    }, petCanvas({ species: ch.id, equipped: p.equipped, role: p.role }), el('span', {}, ch.kind)))));

    box.append(el('h3', {}, 'Job'));
    box.append(el('div', { class: 'chars' }, ...Pixel.ROLES.map((r) => el('button', {
      type: 'button', class: 'char' + (p.role === r.id ? ' active' : ''),
      onclick: () => {
        p.role = r.id;
        logEvent(p, r.icon, `I started working as a ${r.name.toLowerCase()}`);
        say(`I'm a ${r.name.toLowerCase()} now! ${r.icon}`);
        commit();
      },
    }, petCanvas({ species: p.species, role: r.id }), el('span', {}, `${r.icon} ${r.name}`)))));

    const worn = Pixel.ACCESSORIES.filter((a) => p.owned.includes(a.id)).map((a) => {
      const on = p.equipped[a.slot] === a.id;
      return itemCard({
        preview: petCanvas({ species: p.species, equipped: { [a.slot]: a.id } }), name: a.name,
        owned: true, active: on, label: on ? 'Take off' : 'Wear',
        onclick: () => {
          if (on) delete p.equipped[a.slot];
          else p.equipped[a.slot] = a.id;
          commit();
        },
      });
    });
    box.append(section('Wardrobe', worn, 'Buy outfits in the Shop to dress up your buddy.'));

    const decor = Pixel.DECOR.filter((d) => p.decor.includes(d.id)).map((d) => {
      const shown = !p.hiddenDecor.includes(d.id);
      return itemCard({
        preview: el('span', { class: 'emoji' }, d.icon), name: d.name, owned: true, active: shown,
        label: shown ? 'Hide' : 'Show',
        onclick: () => {
          p.hiddenDecor = shown ? [...p.hiddenDecor, d.id] : p.hiddenDecor.filter((x) => x !== d.id);
          commit();
        },
      });
    });
    box.append(section('Street decor', decor, 'Decor you buy shows up on the street.'));

    const skies = Pixel.BACKGROUNDS.filter((b) => !b.price || p.owned.includes(`bg:${b.id}`)).map((b) => itemCard({
      preview: el('span', { class: 'emoji' }, b.icon), name: b.name, owned: true, active: p.bg === b.id,
      label: p.bg === b.id ? 'Using' : 'Use', onclick: () => { p.bg = b.id; commit(); },
    }));
    box.append(section('Sky', skies));
  }

  function renderView() {
    const box = $('#pet-view');
    if (!box) return;
    if (box.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;
    box.replaceChildren();
    ({ shop: renderShop, bag: renderBag, style: renderStyle })[view](box);
  }

  function render() {
    const p = pet();
    decay(p);
    $('#coin-count').textContent = p.coins;
    $('#pet-name').textContent = p.name;
    $('#pet-level').textContent = `Lv ${level(p)} ${roleOf(p).icon} ${roleOf(p).name} · ${plural(p.tasksDone, 'task')} done`;
    for (const [cls, value] of [['.bar-hunger', p.hunger], ['.bar-happy', p.happy]]) {
      document.querySelectorAll(cls).forEach((b) => {
        b.style.width = `${value}%`;
        b.parentElement.setAttribute('aria-valuenow', Math.round(value));
      });
    }
    renderSpeech();
    renderView();
    renderReport();
  }

  function init(opts) {
    ({ getState, save: persist, toast } = opts);
    if (opts.getProgress) getProgress = opts.getProgress;
    if (opts.getUserName) getUserName = opts.getUserName;
    document.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => {
      ({ feed: () => feed(), pat, play, ask: () => openReport() })[b.dataset.act]();
    }));
    document.querySelectorAll('.subtab').forEach((b) => b.addEventListener('click', () => showView(b.dataset.view)));
    document.querySelectorAll('.scene-canvas').forEach((c) => c.addEventListener('click', pat));
    setInterval(frame, 120);
    setInterval(() => { decay(pet()); persist(); render(); }, 60 * 1000);
    render();
  }

  return { ensure, reward, takeBack, noteBonus, init, render, greet, lastGreet, encourage, roleOf: () => roleOf(pet()), name: () => pet().name };
})();
