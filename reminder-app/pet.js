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

  let getState;
  let persist;
  let toast;
  const pet = () => getState().pet;

  function fresh() {
    return {
      species: 'hamster', name: 'Hammy', coins: 20, hunger: 80, happy: 80, updatedAt: Date.now(),
      tasksDone: 0, food: { onigiri: 2, cookie: 1 }, owned: [], equipped: {},
      decor: [], hiddenDecor: [], bg: 'day', lastNoteBonus: null, lastPlay: 0, lastPat: 0,
    };
  }

  function ensure(state) {
    const p = Object.assign(fresh(), state.pet || {});
    p.food ||= {};
    p.equipped ||= {};
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
    celebrate();
    say(onTime ? `Yay, right on time! +${coins} coins 🪙` : `Better late than never! +${coins} coins 🪙`);
    return coins;
  }

  function takeBack(state, task) {
    if (!task.coins) return;
    const p = state.pet;
    p.coins = Math.max(0, p.coins - task.coins);
    p.tasksDone = Math.max(0, p.tasksDone - 1);
    task.coins = 0;
  }

  function noteBonus(state, day) {
    const p = state.pet;
    if (p.lastNoteBonus === day) return 0;
    p.lastNoteBonus = day;
    p.coins += COINS_NOTE;
    celebrate();
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
    const el = $('#pet-speech');
    if (!el) return;
    const p = pet();
    let text;
    if (speech && Date.now() < speechUntil) text = speech;
    else if (isNight()) text = `${p.name} is sleeping… 💤`;
    else {
      const lines = {
        hungry: ["I'm hungry! Feed me please 🍙", 'My tummy is rumbling… 🥺'],
        sad: ["I'm lonely… let's finish a task together? 🥺", 'Can you pat me? 💗'],
        happy: ["Let's get things done! ✨", "You're doing great! 💕", 'What a lovely day ☀️', 'I love our little café 🏠'],
        ok: ["What's next on the list? 📝", 'Tick a task to earn coins 🪙'],
      }[mood(p)];
      text = lines[Math.floor(Date.now() / 60000) % lines.length];
    }
    el.textContent = text;
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
      say("I'm so full! Maybe later 😋");
      return;
    }
    const f = FOOD_BY_ID[id];
    p.food[id] -= 1;
    p.hunger = clamp(p.hunger + f.hunger);
    p.happy = clamp(p.happy + f.happy);
    addEffect('eat', 2400, { food: id });
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
    }
    addEffect('hearts', 2000);
    say(isNight() ? 'Mmm… *yawn* 💤' : 'Hehe, that tickles! 💗');
    commit();
  }

  function play() {
    const p = pet();
    decay(p);
    const now = Date.now();
    if (p.hunger < 10) {
      say('Too hungry to play… a snack first? 🍪');
      return;
    }
    const wait = PLAY_COOLDOWN_MS - (now - p.lastPlay);
    if (wait > 0) {
      say(`Phew, I'm tired! Let's play again in ${Math.ceil(wait / 60000)} min 😴`);
      return;
    }
    p.lastPlay = now;
    p.happy = clamp(p.happy + 15);
    p.hunger = clamp(p.hunger - 5);
    addEffect('ball', 3200);
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
    commit();
  }

  function commit() {
    persist();
    render();
  }

  // ---------- scene animation ----------

  const canvas = () => $('#scene');
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
    const c = canvas();
    if (!c || !c.offsetParent) return; // hidden tab: skip drawing
    const ctx = c.getContext('2d');
    const p = pet();
    const now = Date.now();
    effects = effects.filter((e) => e.until > now);
    const busy = effects.some((e) => e.kind === 'eat' || e.kind === 'ball');
    const sleeping = isNight() && !effects.length;
    const visibleDecor = p.decor.filter((d) => !p.hiddenDecor.includes(d));

    const key = visibleDecor.join(',') + '|' + p.bg;
    if (key !== streetKey) {
      street = Pixel.buildStreet(visibleDecor, p.bg);
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
      species: p.species, equipped: p.equipped, mood: mood(p), sleeping,
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
    }, petCanvas({ species: ch.id, equipped: p.equipped }), el('span', {}, ch.kind)))));

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
    $('#pet-level').textContent = `Lv ${level(p)} ${Pixel.CHAR_BY_ID[p.species].kind} · ${p.tasksDone} ${p.tasksDone === 1 ? 'task' : 'tasks'} done`;
    $('#bar-hunger').style.width = `${p.hunger}%`;
    $('#bar-happy').style.width = `${p.happy}%`;
    $('#bar-hunger').parentElement.setAttribute('aria-valuenow', Math.round(p.hunger));
    $('#bar-happy').parentElement.setAttribute('aria-valuenow', Math.round(p.happy));
    renderSpeech();
    renderView();
  }

  function init(opts) {
    ({ getState, save: persist, toast } = opts);
    document.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => {
      ({ feed: () => feed(), pat, play })[b.dataset.act]();
    }));
    document.querySelectorAll('.subtab').forEach((b) => b.addEventListener('click', () => showView(b.dataset.view)));
    $('#scene').addEventListener('click', pat);
    setInterval(frame, 120);
    setInterval(() => { decay(pet()); persist(); render(); }, 60 * 1000);
    render();
  }

  return { ensure, reward, takeBack, noteBonus, init, render };
})();
