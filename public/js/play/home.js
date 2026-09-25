// Phone: home editor (place/move furniture on your plot) + the shop.
// The server validates everything; the phone just keeps a local copy of the wallet.

import {
  ITEMS, HOUSE_STYLES, WALL_COLORS, ROOF_COLORS, HOME_COLS, HOME_ROWS, HOUSE_ROWS, canPlace,
} from '/shared/catalog.js';

const $ = (id) => document.getElementById(id);

export function setupHome({ socket, toast, buzz }) {
  const wallet = { coins: 0, owned: {}, home: { style: 'kampung', wall: WALL_COLORS[0], roof: ROOF_COLORS[0], items: [] }, plot: null };
  let selected = null;       // { from: 'tray', id } | { from: 'grid', index }
  let shopCat = 'in';
  let saveTimer = null;

  // ---------------------------------------------------------------- wallet sync
  function setWallet(w) {
    if (!w) return;
    if (typeof w.coins === 'number') wallet.coins = w.coins;
    if (w.owned) wallet.owned = w.owned;
    if (w.home) wallet.home = w.home;
    if (w.plot !== undefined) wallet.plot = w.plot;
    render();
  }

  function placedCount(id) { return wallet.home.items.filter((i) => i.id === id).length; }
  function available(id) { return (wallet.owned[id] || 0) - placedCount(id); }

  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      socket.emit('home:save', { home: wallet.home }, (res) => {
        if (!res?.ok) { toast(res?.error || 'Could not save'); refresh(); }
      });
    }, 250);
  }

  function refresh() { socket.emit('home:get', {}, (res) => res?.ok && setWallet(res)); }

  // ---------------------------------------------------------------- grid editor
  const grid = $('home-grid');
  const ctx = grid.getContext('2d');

  function drawGrid() {
    const cw = grid.width / HOME_COLS, ch = grid.height / HOME_ROWS;
    const h = wallet.home;
    ctx.clearRect(0, 0, grid.width, grid.height);
    for (let r = 0; r < HOME_ROWS; r++) {
      for (let c = 0; c < HOME_COLS; c++) {
        const inside = r < HOUSE_ROWS;
        ctx.fillStyle = inside ? ((r + c) % 2 ? '#e7c89c' : '#dcb986') : ((r + c) % 2 ? '#8fd16a' : '#83c75f');
        ctx.fillRect(c * cw, r * ch, cw, ch);
      }
    }
    // walls around the house part, door at the front
    ctx.strokeStyle = h.wall; ctx.lineWidth = 12;
    ctx.strokeRect(6, 6, grid.width - 12, HOUSE_ROWS * ch - 6);
    ctx.fillStyle = '#8d5a3b';
    ctx.fillRect(grid.width / 2 - cw * 0.45, HOUSE_ROWS * ch - 10, cw * 0.9, 12);
    ctx.fillStyle = h.roof; ctx.font = 'bold 22px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(`${HOUSE_STYLES[h.style].icon} ${HOUSE_STYLES[h.style].name}`, 18, 16);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillText('🌿 Garden', 14, HOUSE_ROWS * ch + 8);
    // grid lines
    ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 2;
    for (let c = 1; c < HOME_COLS; c++) { ctx.beginPath(); ctx.moveTo(c * cw, 0); ctx.lineTo(c * cw, grid.height); ctx.stroke(); }
    for (let r = 1; r < HOME_ROWS; r++) { ctx.beginPath(); ctx.moveTo(0, r * ch); ctx.lineTo(grid.width, r * ch); ctx.stroke(); }
    // valid targets for the selected item
    const selId = selected?.from === 'tray' ? selected.id : selected?.from === 'grid' ? h.items[selected.index]?.id : null;
    if (selId) {
      for (let r = 0; r < HOME_ROWS; r++) for (let c = 0; c < HOME_COLS; c++) {
        if (!canPlace(selId, r) || h.items.some((i) => i.c === c && i.r === r)) continue;
        ctx.fillStyle = 'rgba(255,224,102,0.45)';
        ctx.fillRect(c * cw + 4, r * ch + 4, cw - 8, ch - 8);
      }
    }
    // items
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    h.items.forEach((it, i) => {
      ctx.save();
      ctx.translate((it.c + 0.5) * cw, (it.r + 0.5) * ch);
      ctx.rotate((it.rot || 0) * Math.PI / 2);
      ctx.font = `${Math.round(ch * 0.62)}px serif`;
      ctx.fillStyle = '#000';
      ctx.fillText(ITEMS[it.id].icon, 0, 4);
      ctx.restore();
      if (selected?.from === 'grid' && selected.index === i) {
        ctx.strokeStyle = '#ffb400'; ctx.lineWidth = 6;
        ctx.strokeRect(it.c * cw + 3, it.r * ch + 3, cw - 6, ch - 6);
      }
    });
  }

  grid.addEventListener('click', (e) => {
    const rect = grid.getBoundingClientRect();
    const c = Math.floor(((e.clientX - rect.left) / rect.width) * HOME_COLS);
    const r = Math.floor(((e.clientY - rect.top) / rect.height) * HOME_ROWS);
    const items = wallet.home.items;
    const hit = items.findIndex((i) => i.c === c && i.r === r);
    if (selected?.from === 'tray') {
      if (hit >= 0) { selected = { from: 'grid', index: hit }; return render(); }
      if (!canPlace(selected.id, r)) return toast(ITEMS[selected.id].zone === 'in' ? 'That goes inside the house 🏠' : 'That goes in the garden 🌿');
      items.push({ id: selected.id, c, r, rot: 0 });
      buzz(15);
      if (available(selected.id) <= 0) selected = null;
      save();
    } else if (selected?.from === 'grid') {
      const it = items[selected.index];
      if (hit === selected.index) { selected = null; return render(); }
      if (hit >= 0) { selected = { from: 'grid', index: hit }; return render(); }
      if (!canPlace(it.id, r)) return toast(ITEMS[it.id].zone === 'in' ? 'That goes inside the house 🏠' : 'That goes in the garden 🌿');
      it.c = c; it.r = r; selected = null;
      buzz(15);
      save();
    } else if (hit >= 0) {
      selected = { from: 'grid', index: hit };
    }
    render();
  });

  $('btn-home-rotate').onclick = () => {
    if (selected?.from !== 'grid') return toast('Tap a placed item first');
    const it = wallet.home.items[selected.index];
    it.rot = ((it.rot || 0) + 1) % 4;
    save(); render();
  };
  $('btn-home-remove').onclick = () => {
    if (selected?.from !== 'grid') return toast('Tap a placed item first');
    wallet.home.items.splice(selected.index, 1);
    selected = null;
    save(); render();
  };
  $('btn-go-home').onclick = () => socket.emit('home:go', {}, (res) => toast(res?.ok ? '🏠 Welcome home!' : 'Can\'t go home right now'));

  function renderTray() {
    const tray = $('home-tray');
    tray.replaceChildren();
    const ids = Object.keys(ITEMS).filter((id) => (wallet.owned[id] || 0) > 0);
    if (!ids.length) {
      tray.append(Object.assign(document.createElement('p'), { className: 'empty-note', textContent: 'No items yet — earn coins in 🏁 Games and buy things in the 🛒 Shop!' }));
      return;
    }
    for (const id of ids) {
      const b = document.createElement('button');
      b.textContent = ITEMS[id].icon;
      b.title = ITEMS[id].name;
      const left = available(id);
      b.append(Object.assign(document.createElement('small'), { textContent: left }));
      b.disabled = left <= 0;
      if (selected?.from === 'tray' && selected.id === id) b.classList.add('on');
      b.onclick = () => { selected = { from: 'tray', id }; render(); };
      tray.append(b);
    }
  }

  function renderStyles() {
    const box = $('home-styles');
    box.replaceChildren();
    for (const [id, st] of Object.entries(HOUSE_STYLES)) {
      const b = document.createElement('button');
      const owned = st.price === 0 || wallet.owned[`house:${id}`];
      b.textContent = `${st.icon} ${st.name}${owned ? '' : ` 🔒${st.price}`}`;
      b.disabled = !owned;
      if (wallet.home.style === id) b.classList.add('on');
      b.onclick = () => { wallet.home.style = id; save(); render(); };
      box.append(b);
    }
    for (const [boxId, colors, key] of [['home-walls', WALL_COLORS, 'wall'], ['home-roofs', ROOF_COLORS, 'roof']]) {
      const row = $(boxId);
      row.replaceChildren();
      for (const c of colors) {
        const b = document.createElement('button');
        b.style.background = c;
        b.setAttribute('aria-label', c);
        if (wallet.home[key] === c) b.classList.add('on');
        b.onclick = () => { wallet.home[key] = c; save(); render(); };
        row.append(b);
      }
    }
  }

  // ---------------------------------------------------------------- shop
  const SHOP_CATS = [['in', '🛋️ Indoor'], ['out', '🌿 Garden'], ['house', '🏡 Houses']];
  function renderShop() {
    $('shop-coins').textContent = wallet.coins;
    const tabs = $('shop-tabs');
    tabs.replaceChildren(...SHOP_CATS.map(([id, label]) => {
      const b = document.createElement('button');
      b.textContent = label;
      if (id === shopCat) b.classList.add('on');
      b.onclick = () => { shopCat = id; renderShop(); };
      return b;
    }));
    const list = $('shop-list');
    list.replaceChildren();
    const entries = shopCat === 'house'
      ? Object.entries(HOUSE_STYLES).filter(([, s]) => s.price > 0).map(([id, s]) => [`house:${id}`, { ...s, zone: 'house' }])
      : Object.entries(ITEMS).filter(([, it]) => it.zone === shopCat || (it.zone === 'any' && shopCat === 'out'));
    for (const [id, it] of entries) {
      const card = document.createElement('div');
      card.className = 'shop-item';
      const owned = wallet.owned[id] || 0;
      const isHouse = id.startsWith('house:');
      card.append(
        Object.assign(document.createElement('div'), { className: 'icon', textContent: it.icon }),
        Object.assign(document.createElement('div'), { className: 'name', textContent: it.name }),
        Object.assign(document.createElement('div'), { className: 'owned', textContent: isHouse ? (owned ? 'Owned ✓' : ' ') : `You have ${owned}` }),
      );
      const btn = Object.assign(document.createElement('button'), { className: 'btn', textContent: `🪙 ${it.price}` });
      btn.disabled = wallet.coins < it.price || (isHouse && owned > 0);
      btn.onclick = () => {
        btn.disabled = true;
        socket.emit('shop:buy', { item: id }, (res) => {
          if (!res?.ok) { toast(res?.error || 'Could not buy'); renderShop(); return; }
          buzz(40);
          setWallet(res);
          toast(isHouse ? `🎉 New house! Pick it in 🏠 Home` : `🛍️ Bought ${it.name}! Place it in 🏠 Home`);
        });
      };
      card.append(btn);
      list.append(card);
    }
  }

  function render() {
    $('home-plot').textContent = wallet.plot !== null ? `· Taman Lukis plot ${wallet.plot + 1}` : '';
    const sel = selected?.from === 'tray' ? ITEMS[selected.id] : selected?.from === 'grid' ? ITEMS[wallet.home.items[selected.index]?.id] : null;
    $('home-selected').textContent = sel ? `${sel.icon} ${sel.name}` : 'Nothing selected';
    drawGrid();
    renderTray();
    renderStyles();
    renderShop();
  }

  render();
  return { setWallet, refresh, setCoins(c) { if (c !== wallet.coins) { wallet.coins = c; renderShop(); } }, wallet };
}
