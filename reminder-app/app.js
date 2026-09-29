'use strict';

const STORE_KEY = 'dailyReminders.v1';
const SNOOZE_MINUTES = 10;
const CHECK_EVERY_MS = 10 * 1000;
// Reminders missed by more than this while the page was closed are not replayed.
const REPLAY_WINDOW_MS = 12 * 60 * 60 * 1000;
// Morning/evening messages are skipped if the app was closed for longer than this after their time.
const SUMMARY_WINDOW_MS = 3 * 60 * 60 * 1000;
// Coming back to the app after this long gets a new hello from the pet.
const GREET_AFTER_MS = 10 * 60 * 1000;

// Coins for writing today's note (the coins for a task are set in Settings).
const NOTE_COINS = 5;

// When to be reminded, in minutes before the task.
const ALERT_OPTIONS = [
  { min: 0, label: 'At the time', short: 'on time', soon: 'now' },
  { min: 10, label: '10 min before', short: '10m', soon: 'in 10 minutes' },
  { min: 30, label: '30 min before', short: '30m', soon: 'in 30 minutes' },
  { min: 60, label: '1 hour before', short: '1h', soon: 'in 1 hour' },
  { min: 120, label: '2 hours before', short: '2h', soon: 'in 2 hours' },
  { min: 1440, label: '1 day before', short: '1 day', soon: 'tomorrow' },
];
const ALERT_BY_MIN = Object.fromEntries(ALERT_OPTIONS.map((o) => [o.min, o]));

const DEFAULT_SETTINGS = {
  defaultAlerts: [0],
  coinsPerTask: 10,
  morning: { on: true, time: '08:00' },
  evening: { on: true, time: '21:00' },
  last: { morning: null, evening: null },
};

const $ = (sel) => document.querySelector(sel);

// ---------- dates ----------

const pad = (n) => String(n).padStart(2, '0');
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localDateTime = (d) => `${dayKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const todayKey = () => dayKey(new Date());
const parseDay = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const shiftDay = (key, delta) => {
  const d = parseDay(key);
  d.setDate(d.getDate() + delta);
  return dayKey(d);
};
const fmtTime = (d) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const fmtDay = (d) => d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
const fmtLongDay = (d) => d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

function nextOccurrence(due, repeat) {
  const d = new Date(due);
  const now = new Date();
  do {
    if (repeat === 'weekly') d.setDate(d.getDate() + 7);
    else d.setDate(d.getDate() + 1);
    if (repeat === 'weekdays') {
      while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
    }
  } while (d <= now);
  return localDateTime(d);
}

// ---------- state ----------

function load() {
  try {
    const data = JSON.parse(localStorage.getItem(STORE_KEY));
    if (data && Array.isArray(data.tasks) && data.notes) return upgrade(data);
  } catch { /* fall through to empty state */ }
  return upgrade({ tasks: window.SEED_EXAMPLES ? exampleTasks() : [], notes: {} });
}

// Fill in anything older saved data is missing.
function upgrade(data) {
  Pet.ensure(data);
  const s = data.settings || {};
  data.profile = { setupDone: false, userName: '', theme: 'auto', music: true, musicVolume: 35, sfx: true, sfxVolume: 60, ...data.profile };
  data.settings = {
    ...DEFAULT_SETTINGS, ...s,
    morning: { ...DEFAULT_SETTINGS.morning, ...s.morning },
    evening: { ...DEFAULT_SETTINGS.evening, ...s.evening },
    last: { ...DEFAULT_SETTINGS.last, ...s.last },
  };
  for (const t of data.tasks) {
    if (!Array.isArray(t.alerts)) t.alerts = [0];
    if (!Array.isArray(t.sent)) t.sent = t.notified ? [...t.alerts] : [];
    delete t.notified;
  }
  return data;
}

// Sample tasks for the hosted demo, so a first visit shows a reminder within a minute.
function exampleTasks() {
  const at = (mins) => localDateTime(new Date(Date.now() + mins * 60 * 1000));
  const base = { repeat: 'none', done: false, doneAt: null, alerts: [0], sent: [] };
  let n = 0;
  const uid = () => `example-${Date.now().toString(36)}-${n++}`;
  return [
    { ...base, id: uid(), title: 'Drink a glass of water', due: at(1), repeat: 'daily' },
    { ...base, id: uid(), title: 'Study Japanese for 20 minutes', due: at(90), location: 'City Library', alerts: [0, 30] },
    { ...base, id: uid(), title: 'Evening walk', due: at(24 * 60), location: 'Riverside park', repeat: 'weekdays' },
  ];
}

let state = load();

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch { /* storage blocked (private window): keep working in memory */ }
}

Pet.init({
  getState: () => state, save, toast, getProgress: progress,
  getUserName: () => state.profile.userName,
  getRewards: () => ({ task: state.settings.coinsPerTask, note: NOTE_COINS }),
  onRebirth: () => openOnboarding({ hatch: true }),
});

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const findTask = (id) => state.tasks.find((t) => t.id === id);

function addTask(title, due, repeat, location, alerts) {
  const dueMs = new Date(due).getTime();
  // reminders whose time has already passed are not sent
  const sent = alerts.filter((min) => dueMs - min * 60000 <= Date.now());
  state.tasks.push({ id: uid(), title, due, repeat, location, alerts, sent, done: false, doneAt: null });
  save();
  render();
}

function setDone(id, done) {
  const task = findTask(id);
  if (!task || task.done === done) return;
  task.done = done;
  task.doneAt = done ? new Date().toISOString() : null;
  if (done) {
    const coins = Pet.reward(state, task);
    toast(`✓ ${task.title}  +${coins} 🪙`);
    bumpCoins();
  } else {
    Pet.takeBack(state, task);
  }
  if (done && task.repeat !== 'none' && !task.spawned) {
    task.spawned = true;
    state.tasks.push({
      id: uid(), title: task.title, repeat: task.repeat, location: task.location,
      due: nextOccurrence(task.due, task.repeat), alerts: [...task.alerts], sent: [],
      done: false, doneAt: null,
    });
  }
  dismissAlert(id);
  save();
  render();
}

function snooze(id) {
  const task = findTask(id);
  if (!task) return;
  task.due = localDateTime(new Date(Date.now() + SNOOZE_MINUTES * 60 * 1000));
  if (!task.alerts.includes(0)) task.alerts.push(0);
  task.sent = task.alerts.filter((min) => min !== 0);
  dismissAlert(id);
  save();
  render();
}

function deleteTask(id) {
  state.tasks = state.tasks.filter((t) => t.id !== id);
  dismissAlert(id);
  save();
  render();
}

// ---------- notifications ----------

let swReg = null;
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').then((reg) => { swReg = reg; }).catch(() => {});
  navigator.serviceWorker.addEventListener('message', (e) => handleAction(e.data));
}

function handleAction(msg) {
  if (!msg || !msg.id) return;
  if (msg.action === 'done') setDone(msg.id, true);
  else if (msg.action === 'snooze') snooze(msg.id);
}

function updateNotifyButton() {
  const btn = $('#notify-btn');
  const status = notifyStatus();
  for (const b of [btn, document.getElementById('ob-notify')].filter(Boolean)) {
    b.textContent = status.label;
    b.disabled = status.disabled;
    b.title = status.title || '';
    b.classList.toggle('on', status.on);
  }
}

function notifyStatus() {
  if (!('Notification' in window)) return { label: 'Not available here', disabled: true };
  if (Notification.permission === 'granted') return { label: 'On ✓', disabled: true, on: true };
  if (Notification.permission === 'denied') return { label: 'Blocked', disabled: true, title: 'Allow notifications for this site in your browser settings' };
  return { label: 'Turn on', disabled: false };
}

async function askNotify() {
  if ('Notification' in window && Notification.permission === 'default') {
    try { await Notification.requestPermission(); } catch { /* refused by the page's frame */ }
  }
  updateNotifyButton();
}

$('#notify-btn').addEventListener('click', () => { unlockAudio(); askNotify(); });

let audioCtx = null;
function unlockAudio() {
  if (!audioCtx && window.AudioContext) audioCtx = new AudioContext();
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}
document.addEventListener('click', unlockAudio, { once: true });

function chime() {
  if (!audioCtx) return;
  const t0 = audioCtx.currentTime;
  [660, 880, 990].forEach((freq, i) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.frequency.value = freq;
    osc.connect(gain).connect(audioCtx.destination);
    const t = t0 + i * 0.18;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    osc.start(t);
    osc.stop(t + 0.4);
  });
}

function systemNotify(title, body, { tag, taskId, actions } = {}) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (swReg) {
    swReg.showNotification(title, {
      body, tag, requireInteraction: !!taskId, icon: 'icon.svg', data: { id: taskId },
      actions: actions ? [{ action: 'done', title: '✓ Mark done' }, { action: 'snooze', title: `Snooze ${SNOOZE_MINUTES} min` }] : [],
    });
  } else {
    try {
      const n = new Notification(title, { body, tag, icon: 'icon.svg' });
      n.onclick = () => { window.focus(); n.close(); };
    } catch { /* some mobile browsers only allow service worker notifications */ }
  }
}

// A banner at the top of the page. `taskId` lets ticking the task clear its banners.
function showBanner({ id, text, taskId, buttons, autoClose }) {
  if (document.getElementById(id)) return;
  const el = document.createElement('div');
  el.className = 'alert';
  el.id = id;
  if (taskId) el.dataset.task = taskId;
  const msg = document.createElement('span');
  msg.className = 'msg';
  msg.textContent = text;
  el.append(msg, ...buttons.map((b) => button(b.label, 'btn', () => { b.onClick(); if (b.close) el.remove(); updateTitle(); })));
  const close = button('✕', 'btn', () => { el.remove(); updateTitle(); });
  close.setAttribute('aria-label', 'Dismiss');
  el.append(close);
  $('#alerts').append(el);
  if (autoClose) setTimeout(() => { el.remove(); updateTitle(); }, autoClose);
}

const petSign = () => `— ${Pet.name()} ${Pet.roleOf().icon}`;

function fireTaskAlert(task, min) {
  const time = fmtTime(new Date(task.due));
  const where = task.location ? ` · 📍 ${task.location}` : '';
  if (min === 0) {
    showBanner({
      id: `alert-${task.id}-0`, taskId: task.id, text: `⏰ ${task.title}${where}`,
      buttons: [{ label: '✓ Done', onClick: () => setDone(task.id, true) }, { label: `Snooze ${SNOOZE_MINUTES} min`, onClick: () => snooze(task.id) }],
    });
    systemNotify(`⏰ ${task.title}`, `It's time! (${time})${task.location ? `\n📍 ${task.location}` : ''}\n${petSign()}`,
      { tag: task.id, taskId: task.id, actions: true });
  } else {
    const soon = ALERT_BY_MIN[min]?.soon || `in ${min} minutes`;
    showBanner({
      id: `alert-${task.id}-${min}`, taskId: task.id, text: `🔔 ${soon[0].toUpperCase()}${soon.slice(1)}: ${task.title} at ${time}${where}`,
      buttons: [{ label: '✓ Done', onClick: () => setDone(task.id, true) }],
    });
    systemNotify(`🔔 ${task.title} ${soon}`, `At ${time}${task.location ? ` · 📍 ${task.location}` : ''}\n${petSign()}`, { tag: `${task.id}-${min}` });
  }
}

function tasksOn(key) {
  return state.tasks.filter((t) => !t.done && t.due.slice(0, 10) === key).sort(byDue);
}

function morningSummary() {
  const list = tasksOn(todayKey());
  const text = list.length
    ? `☀️ Good morning! ${list.length} ${list.length === 1 ? 'task' : 'tasks'} today: ${list.map((t) => `${t.title} (${fmtTime(new Date(t.due))})`).join(', ')}`
    : '☀️ Good morning! Nothing planned today. Want to add something?';
  showBanner({ id: `summary-morning-${todayKey()}`, text, buttons: [], autoClose: 2 * 60 * 1000 });
  systemNotify(`☀️ Good morning from ${Pet.name()}!`, `${text.replace('☀️ Good morning! ', '')}\n${petSign()}`, { tag: 'morning' });
}

function eveningCheckin() {
  const g = progress();
  const wrote = !!state.notes[todayKey()]?.trim();
  const text = `🌙 ${g.doneToday} done today${g.leftToday ? `, ${g.leftToday} still open` : ''}. `
    + (wrote ? 'Thanks for writing your note!' : 'What did you learn today? Write it down for +5 🪙');
  showBanner({
    id: `summary-evening-${todayKey()}`, text,
    buttons: wrote ? [] : [{ label: '📖 Write note', close: true, onClick: () => openNoteDay(todayKey()) }],
    autoClose: 2 * 60 * 1000,
  });
  systemNotify(`🌙 Evening check-in from ${Pet.name()}`, `${text.replace('🌙 ', '')}\n${petSign()}`, { tag: 'evening' });
}

function checkSummaries(now) {
  const s = state.settings;
  const today = todayKey();
  let changed = false;
  let fired = false;
  for (const [kind, show] of [['morning', morningSummary], ['evening', eveningCheckin]]) {
    const cfg = s[kind];
    if (!cfg.on || s.last[kind] === today) continue;
    const [h, m] = cfg.time.split(':').map(Number);
    const at = new Date();
    at.setHours(h, m, 0, 0);
    if (now < at.getTime()) continue;
    s.last[kind] = today;
    changed = true;
    if (now - at.getTime() <= SUMMARY_WINDOW_MS) {
      show();
      fired = true;
    }
  }
  return { changed, fired };
}

function dismissAlert(id) {
  document.querySelectorAll(`[data-task="${id}"]`).forEach((el) => el.remove());
  updateTitle();
}

function updateTitle() {
  const n = $('#alerts').children.length;
  document.title = n ? `(${n}) ⏰ Remi` : 'Remi';
}

function checkReminders() {
  const now = Date.now();
  let changed = false;
  let rang = false;
  for (const task of state.tasks) {
    if (task.done) continue;
    const due = new Date(task.due).getTime();
    for (const min of [...task.alerts].sort((a, b) => b - a)) {
      if (task.sent.includes(min)) continue;
      const at = due - min * 60000;
      if (at > now) continue;
      task.sent.push(min);
      changed = true;
      // an early reminder that is only noticed after the task is due is replaced by the on-time one
      if (min > 0 && now >= due) continue;
      if (now - at <= REPLAY_WINDOW_MS) {
        fireTaskAlert(task, min);
        rang = true;
      }
    }
  }
  const summaries = checkSummaries(now);
  if (rang || summaries.fired) chime();
  if (changed || summaries.changed) {
    save();
    render();
  }
  updateTitle();
}

// ---------- rendering ----------

function button(text, className, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = className;
  b.textContent = text;
  b.addEventListener('click', onClick);
  return b;
}

const REPEAT_LABEL = { daily: 'daily', weekdays: 'weekdays', weekly: 'weekly' };

function taskItem(task, { showDay }) {
  const li = document.createElement('li');
  const due = new Date(task.due);
  const overdue = !task.done && due < new Date();
  li.className = 'task' + (task.done ? ' done' : '') + (overdue ? ' overdue' : '');

  const box = document.createElement('input');
  box.type = 'checkbox';
  box.checked = task.done;
  box.setAttribute('aria-label', `Mark "${task.title}" done`);
  box.addEventListener('change', () => setDone(task.id, box.checked));

  const body = document.createElement('div');
  body.className = 'task-body';
  const title = document.createElement('div');
  title.className = 'task-title';
  title.textContent = task.title;
  if (REPEAT_LABEL[task.repeat]) {
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = '↻ ' + REPEAT_LABEL[task.repeat];
    title.append(badge);
  }
  const meta = document.createElement('div');
  meta.className = 'task-meta';
  const when = document.createElement('span');
  when.textContent = task.done
    ? `Done at ${fmtTime(new Date(task.doneAt))}`
    : (showDay ? `${fmtDay(due)}, ` : '') + fmtTime(due);
  meta.append(when);
  if (!task.done) {
    const bell = document.createElement('span');
    bell.textContent = task.alerts.length
      ? `🔔 ${[...task.alerts].sort((a, b) => b - a).map((m) => ALERT_BY_MIN[m]?.short || `${m}m`).join(' + ')}`
      : '🔕 no reminder';
    meta.append(bell);
  }
  if (task.location) {
    const where = document.createElement('a');
    where.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(task.location)}`;
    where.target = '_blank';
    where.rel = 'noopener';
    where.title = 'Open in maps';
    where.textContent = `📍 ${task.location}`;
    meta.append(where);
  }
  if (task.done && task.coins) {
    const coin = document.createElement('span');
    coin.className = 'badge coin';
    coin.textContent = `+${task.coins} 🪙`;
    title.append(coin);
  }
  body.append(title, meta);

  // Tap once to arm, tap again within 3 seconds to delete.
  const del = button('✕', 'btn del', () => {
    if (del.classList.contains('confirm')) {
      deleteTask(task.id);
      return;
    }
    del.classList.add('confirm');
    del.textContent = 'Delete?';
    setTimeout(() => { del.classList.remove('confirm'); del.textContent = '✕'; }, 3000);
  });
  del.setAttribute('aria-label', `Delete "${task.title}"`);

  li.append(box, body, del);
  return li;
}

function renderGroup(container, heading, tasks, opts) {
  if (!tasks.length) return;
  const h = document.createElement('h2');
  h.textContent = `${heading} (${tasks.length})`;
  const ul = document.createElement('ul');
  ul.className = 'task-list';
  tasks.forEach((t) => ul.append(taskItem(t, opts)));
  container.append(h, ul);
}

const byDue = (a, b) => a.due.localeCompare(b.due);
const doneOn = (task, key) => task.done && task.doneAt && dayKey(new Date(task.doneAt)) === key;

function renderTasks() {
  const today = todayKey();
  const now = new Date();
  const open = state.tasks.filter((t) => !t.done).sort(byDue);
  const overdue = open.filter((t) => new Date(t.due) < now && t.due.slice(0, 10) < today);
  const dueToday = open.filter((t) => t.due.slice(0, 10) === today);
  const upcoming = open.filter((t) => t.due.slice(0, 10) > today);
  const doneToday = state.tasks.filter((t) => doneOn(t, today)).sort((a, b) => a.doneAt.localeCompare(b.doneAt));

  const box = $('#task-groups');
  box.replaceChildren();
  renderGroup(box, 'Overdue', overdue, { showDay: true });
  renderGroup(box, 'Today', dueToday, { showDay: false });
  renderGroup(box, 'Upcoming', upcoming, { showDay: true });
  renderGroup(box, 'Done today', doneToday, { showDay: false });
  if (!box.children.length) {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = 'No tasks yet. Add one above and pick a time to be reminded.';
    box.append(p);
  }

  $('#stat-left').textContent = overdue.length + dueToday.length;
  $('#stat-done').textContent = doneToday.length;
  $('#stat-streak').textContent = noteStreak();
}

function noteStreak() {
  let key = todayKey();
  if (!state.notes[key]?.trim()) key = shiftDay(key, -1); // today isn't over yet
  let n = 0;
  while (state.notes[key]?.trim()) {
    n++;
    key = shiftDay(key, -1);
  }
  return n;
}

// How today is going, for the pet's encouragement.
function progress() {
  const today = todayKey();
  const now = new Date();
  const open = state.tasks.filter((t) => !t.done).sort(byDue);
  const left = open.filter((t) => t.due.slice(0, 10) === today);
  const next = left.find((t) => new Date(t.due) >= now) || left[0];
  return {
    doneToday: state.tasks.filter((t) => doneOn(t, today)).length,
    leftToday: left.length,
    overdue: open.filter((t) => t.due.slice(0, 10) < today).length,
    next: next && { title: next.title, time: fmtTime(new Date(next.due)) },
    streak: noteStreak(),
  };
}

// ---------- calendar ----------

let taskView = 'cal';
let calMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let calDay = todayKey();

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((c) => c != null));
  return node;
}

function renderCalendar() {
  const box = $('#calendar');
  $('#task-groups').hidden = taskView !== 'list';
  box.hidden = taskView !== 'cal';
  document.querySelectorAll('.view-btn').forEach((b) => b.classList.toggle('on', b.dataset.taskview === taskView));
  if (taskView !== 'cal') return;

  const today = todayKey();
  const y = calMonth.getFullYear();
  const m = calMonth.getMonth();
  const head = el('div', { className: 'cal-head' },
    el('button', { type: 'button', className: 'btn ghost icon', ariaLabel: 'Previous month', onclick: () => { calMonth = new Date(y, m - 1, 1); renderCalendar(); } }, '‹'),
    el('strong', {}, calMonth.toLocaleDateString([], { month: 'long', year: 'numeric' })),
    el('button', { type: 'button', className: 'btn ghost icon', ariaLabel: 'Next month', onclick: () => { calMonth = new Date(y, m + 1, 1); renderCalendar(); } }, '›'));

  const grid = el('div', { className: 'cal-grid' });
  for (let i = 0; i < 7; i++) { // 1 Jan 2024 was a Monday
    grid.append(el('span', { className: 'cal-dow' }, new Date(2024, 0, 1 + i).toLocaleDateString([], { weekday: 'narrow' })));
  }
  const lead = (new Date(y, m, 1).getDay() + 6) % 7;
  for (let i = 0; i < lead; i++) grid.append(el('span'));
  const days = new Date(y, m + 1, 0).getDate();
  for (let d = 1; d <= days; d++) {
    const key = dayKey(new Date(y, m, d));
    const onDay = state.tasks.filter((t) => t.due.slice(0, 10) === key);
    const dots = el('span', { className: 'cal-dots' }, ...onDay.slice(0, 4).map((t) => el('i', {
      className: t.done ? 'dot done' : key < today ? 'dot late' : 'dot',
    })));
    grid.append(el('button', {
      type: 'button',
      className: 'cal-day' + (key === today ? ' today' : '') + (key === calDay ? ' selected' : '') + (key < today ? ' past' : ''),
      ariaLabel: `${fmtLongDay(new Date(y, m, d))}, ${onDay.length} tasks`,
      onclick: () => {
        calDay = key;
        if (key >= today) $('#task-date').value = key;
        renderCalendar();
      },
    }, el('span', {}, String(d)), dots));
  }

  const list = state.tasks.filter((t) => t.due.slice(0, 10) === calDay).sort(byDue);
  const dayBox = el('div', { className: 'cal-list' }, el('h3', {}, fmtLongDay(parseDay(calDay))));
  if (list.length) dayBox.append(el('ul', { className: 'task-list' }, ...list.map((t) => taskItem(t, { showDay: false }))));
  else dayBox.append(el('p', { className: 'muted small' }, 'Nothing planned for this day.'));
  if (calDay >= today) {
    dayBox.append(el('button', {
      type: 'button', className: 'btn small',
      onclick: () => openAdd(calDay),
    }, '＋ Add a task on this day'));
  }
  box.replaceChildren(head, grid, dayBox);
}

document.querySelectorAll('.view-btn').forEach((b) => b.addEventListener('click', () => {
  taskView = b.dataset.taskview;
  renderCalendar();
}));

// ---------- daily notes ----------

let noteDay = todayKey();
let saveTimer = null;

function renderNotes() {
  $('#note-date').value = noteDay;
  $('#next-day').disabled = noteDay >= todayKey();
  if (document.activeElement !== $('#note-text')) {
    $('#note-text').value = state.notes[noteDay] || '';
  }

  const list = $('#done-that-day');
  list.replaceChildren();
  const done = state.tasks.filter((t) => doneOn(t, noteDay)).sort((a, b) => a.doneAt.localeCompare(b.doneAt));
  if (!done.length) {
    const li = document.createElement('li');
    li.className = 'empty muted';
    li.textContent = 'No tasks ticked off this day.';
    list.append(li);
  }
  done.forEach((t) => {
    const li = document.createElement('li');
    li.textContent = `${t.title}${t.location ? ` @ ${t.location}` : ''} — ${fmtTime(new Date(t.doneAt))}`;
    list.append(li);
  });

  renderHistory();
}

function renderHistory() {
  const q = $('#note-search').value.trim().toLowerCase();
  const list = $('#note-history');
  list.replaceChildren();
  const days = Object.keys(state.notes)
    .filter((k) => state.notes[k].trim() && (!q || state.notes[k].toLowerCase().includes(q)))
    .sort()
    .reverse();
  if (!days.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = q ? 'No notes match your search.' : 'Your notes will show up here.';
    list.append(li);
    return;
  }
  days.forEach((k) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    const date = document.createElement('div');
    date.className = 'h-date';
    date.textContent = fmtLongDay(parseDay(k));
    const preview = document.createElement('div');
    preview.className = 'h-preview';
    preview.textContent = state.notes[k].replace(/\s+/g, ' ');
    b.append(date, preview);
    b.addEventListener('click', () => {
      openNoteDay(k);
      $('#note-text').focus();
    });
    li.append(b);
    list.append(li);
  });
}

function openNoteDay(key) {
  flushNote();
  noteDay = key > todayKey() ? todayKey() : key;
  $('#note-text').value = state.notes[noteDay] || '';
  $('#save-status').innerHTML = '&nbsp;';
  showTab('notes');
  renderNotes();
}

function flushNote() {
  if (!saveTimer) return;
  clearTimeout(saveTimer);
  saveTimer = null;
  storeNote();
}

function storeNote() {
  const text = $('#note-text').value;
  if (text.trim()) state.notes[noteDay] = text;
  else delete state.notes[noteDay];
  if (noteDay === todayKey() && text.trim().length >= 10) {
    const coins = Pet.noteBonus(state, noteDay);
    if (coins) {
      toast(`📖 Today's note written  +${coins} 🪙`);
      bumpCoins();
      Pet.render();
    }
  }
  save();
  $('#save-status').textContent = `Saved ${fmtTime(new Date())}`;
  renderHistory();
  $('#stat-streak').textContent = noteStreak();
}

$('#note-text').addEventListener('input', () => {
  $('#save-status').textContent = 'Saving…';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { saveTimer = null; storeNote(); }, 500);
});
$('#note-text').addEventListener('blur', flushNote);
window.addEventListener('beforeunload', flushNote);

$('#note-date').addEventListener('change', (e) => { if (e.target.value) openNoteDay(e.target.value); });
$('#prev-day').addEventListener('click', () => openNoteDay(shiftDay(noteDay, -1)));
$('#next-day').addEventListener('click', () => openNoteDay(shiftDay(noteDay, 1)));
$('#go-today').addEventListener('click', () => openNoteDay(todayKey()));
$('#note-search').addEventListener('input', renderHistory);

// ---------- navigation ----------

function showTab(name) {
  document.querySelectorAll('.nav-btn').forEach((b) => {
    const on = b.dataset.tab === name;
    b.classList.toggle('active', on);
    if (on) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('active', p.id === `panel-${name}`));
  window.scrollTo({ top: 0 });
}
document.querySelectorAll('.nav-btn').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
$('#coin-pill').addEventListener('click', () => showTab('pet'));

// ---------- sheets (add task, settings) ----------

function openSheet(sheet) {
  sheet.hidden = false;
  document.body.classList.add('sheet-open');
}
function closeSheet(sheet) {
  sheet.hidden = true;
  if (!document.querySelector('.sheet:not([hidden]), .onboarding:not([hidden])')) document.body.classList.remove('sheet-open');
}
document.querySelectorAll('.sheet').forEach((sheet) => sheet.addEventListener('click', (e) => {
  if (e.target === sheet || e.target.closest('[data-close]')) closeSheet(sheet);
}));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') document.querySelectorAll('.sheet:not([hidden])').forEach(closeSheet);
});

function openAdd(date) {
  resetForm();
  if (date) $('#task-date').value = date;
  openSheet($('#add-sheet'));
  $('#task-title').focus();
}
$('#add-btn').addEventListener('click', () => openAdd());
$('#settings-btn').addEventListener('click', () => {
  renderSettings();
  openSheet($('#settings-sheet'));
});

// ---------- look and music ----------

const THEMES = [
  { id: 'light', icon: '☀️', label: 'Light' },
  { id: 'dark', icon: '🌙', label: 'Dark' },
  { id: 'auto', icon: '🕖', label: 'Auto' },
];
// Auto follows the sun: light from 7am, dark from 7pm.
const DAY_STARTS = 7;
const NIGHT_STARTS = 19;
const isDaytime = () => { const h = new Date().getHours(); return h >= DAY_STARTS && h < NIGHT_STARTS; };
const isDark = () => state.profile.theme === 'dark' || (state.profile.theme === 'auto' && !isDaytime());

function applyLook() {
  document.documentElement.dataset.theme = isDark() ? 'dark' : 'light';
  const pr = state.profile;
  Music.setMode(isDark() ? 'night' : 'day');
  Music.setVolume(pr.musicVolume / 100);
  Music.setEnabled(pr.music);
  Sfx.setEnabled(pr.sfx);
  Sfx.setVolume(pr.sfxVolume / 100);
  const btn = $('#music-btn');
  btn.textContent = state.profile.music ? '🔊' : '🔇';
  btn.setAttribute('aria-label', state.profile.music ? 'Mute music' : 'Play music');
  btn.setAttribute('aria-pressed', String(!state.profile.music));
  $('#music-on').checked = state.profile.music;
}
// switch between day and night on time in Auto
setInterval(() => { if (state.profile.theme === 'auto') applyLook(); }, 60 * 1000);

$('#music-btn').addEventListener('click', () => {
  state.profile.music = !state.profile.music;
  save();
  applyLook();
  Music.unlock();
  toast(state.profile.music ? `🎵 Music on: ${isDark() ? 'Peep the Pet' : 'Cozy Toy Groove'}` : '🔇 Music off');
});

function themeCards(container, current, onPick) {
  container.replaceChildren(...THEMES.map((t) => el('button', {
    type: 'button', className: 'theme' + (t.id === current ? ' on' : ''), ariaPressed: String(t.id === current),
    onclick: () => onPick(t.id),
  }, el('span', { className: `mini ${t.id}` }, el('i'), el('i'), el('i')), `${t.icon} ${t.label}`)));
}

// ---------- toasts ----------

function toast(text) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  const box = $('#toasts');
  box.append(el);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => el.remove(), 2800);
}

function bumpCoins() {
  const pill = $('#coin-pill');
  pill.classList.remove('bump');
  void pill.offsetWidth;
  pill.classList.add('bump');
}

// ---------- add form ----------

function defaultDue() {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
  return localDateTime(d);
}

function chips(container, idPrefix, selected, onChange) {
  container.replaceChildren(...ALERT_OPTIONS.map((o) => {
    const input = el('input', { type: 'checkbox', id: `${idPrefix}-${o.min}`, value: String(o.min), checked: selected.includes(o.min) });
    if (onChange) input.addEventListener('change', onChange);
    return el('label', { className: 'chip', htmlFor: input.id }, input, el('span', {}, o.label));
  }));
}
const checkedMins = (container) => [...container.querySelectorAll('input:checked')].map((i) => Number(i.value));

function resetForm() {
  const [date, time] = defaultDue().split('T');
  $('#task-date').value = date;
  $('#task-time').value = time;
  $('#task-date').min = todayKey();
  chips($('#task-alerts'), 'alert', state.settings.defaultAlerts);
}

resetForm();
$('#task-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const title = $('#task-title').value.trim();
  const date = $('#task-date').value;
  const time = $('#task-time').value;
  if (!title || !date || !time) return;
  addTask(title, `${date}T${time}`, $('#task-repeat').value, $('#task-location').value.trim(), checkedMins($('#task-alerts')));
  toast(`Added "${title}" for ${fmtDay(parseDay(date))}, ${fmtTime(new Date(`${date}T${time}`))}`);
  $('#task-title').value = '';
  $('#task-location').value = '';
  $('#task-repeat').value = 'none';
  closeSheet($('#add-sheet'));
});

// ---------- reminder settings ----------

function renderSettings() {
  const s = state.settings;
  chips($('#default-alerts'), 'default-alert', s.defaultAlerts, () => {
    s.defaultAlerts = checkedMins($('#default-alerts'));
    chips($('#task-alerts'), 'alert', s.defaultAlerts);
    save();
  });
  $('#morning-on').checked = s.morning.on;
  $('#morning-time').value = s.morning.time;
  $('#evening-on').checked = s.evening.on;
  $('#evening-time').value = s.evening.time;
  $('#user-name').value = state.profile.userName;
  $('#coins-per-task').value = String(state.settings.coinsPerTask);
  $('#coins-late').textContent = Math.ceil(state.settings.coinsPerTask / 2);
  $('#music-on').checked = state.profile.music;
  $('#music-volume').value = state.profile.musicVolume;
  $('#sfx-on').checked = state.profile.sfx;
  $('#sfx-volume').value = state.profile.sfxVolume;
  themeCards($('#theme-cards'), state.profile.theme, (id) => {
    state.profile.theme = id;
    save();
    applyLook();
    renderSettings();
  });
  updateNotifyButton();
}

$('#coins-per-task').addEventListener('change', (e) => {
  state.settings.coinsPerTask = Number(e.target.value) || 10;
  save();
  renderSettings();
  Pet.render();
  toast(`🪙 Each task now earns ${state.settings.coinsPerTask} coins`);
});
$('#user-name').addEventListener('change', (e) => {
  state.profile.userName = e.target.value.trim();
  save();
  render();
});
$('#music-on').addEventListener('change', (e) => {
  state.profile.music = e.target.checked;
  save();
  applyLook();
  Music.unlock();
});
$('#music-volume').addEventListener('input', (e) => {
  state.profile.musicVolume = Number(e.target.value);
  if (!state.profile.music && state.profile.musicVolume > 0) state.profile.music = true;
  applyLook();
  Music.unlock();
});
$('#sfx-on').addEventListener('change', (e) => {
  state.profile.sfx = e.target.checked;
  save();
  applyLook();
  Sfx.play('pat', state.pet.species);
});
$('#sfx-volume').addEventListener('input', (e) => {
  state.profile.sfxVolume = Number(e.target.value);
  applyLook();
});
// save sliders once the finger lets go, and play a sample so the level can be heard
$('#music-volume').addEventListener('change', save);
$('#sfx-volume').addEventListener('change', () => { save(); Sfx.play('pat', state.pet.species); });
$('#rerun-setup').addEventListener('click', () => {
  closeSheet($('#settings-sheet'));
  openOnboarding();
});

for (const kind of ['morning', 'evening']) {
  $(`#${kind}-on`).addEventListener('change', (e) => { state.settings[kind].on = e.target.checked; save(); });
  $(`#${kind}-time`).addEventListener('change', (e) => {
    if (!e.target.value) return;
    state.settings[kind].time = e.target.value;
    state.settings.last[kind] = null; // a new time today may still fire
    save();
  });
}

$('#test-notify').addEventListener('click', async () => {
  unlockAudio();
  if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission();
  updateNotifyButton();
  showBanner({ id: `test-${Date.now()}`, text: `🔔 This is how ${Pet.name()} will remind you!`, buttons: [], autoClose: 15000 });
  systemNotify(`🔔 Hi from ${Pet.name()}!`, `Reminders are working ${petSign()}`, { tag: 'test' });
  chime();
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    toast('Pop-up notifications are off here, so reminders show as banners in the app.');
  }
});

renderSettings();

// ---------- backup ----------

$('#copy-btn').addEventListener('click', async () => {
  flushNote();
  try {
    await navigator.clipboard.writeText(JSON.stringify(state));
    toast('Backup copied. Paste it somewhere safe.');
  } catch {
    toast("Couldn't copy here. Use Export backup instead.");
  }
});

$('#export-btn').addEventListener('click', () => {
  flushNote();
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `remi-backup-${todayKey()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

$('#import-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.tasks) || typeof data.notes !== 'object') throw new Error('bad file');
    state = upgrade({ tasks: data.tasks, notes: data.notes || {}, pet: data.pet, settings: data.settings, profile: data.profile });
    save();
    applyLook();
    renderSettings();
    render();
    toast('Backup restored');
  } catch {
    toast('That file is not a Remi backup.');
  }
});

// ---------- home ----------

function renderHome() {
  const today = todayKey();
  const now = new Date();
  const name = state.profile.userName;
  const h = now.getHours();
  $('#hello').textContent = `Hi ${name || 'there'}! ${h >= 6 && h < 18 ? '☀️' : '🌙'}`;

  const open = state.tasks.filter((t) => !t.done && t.due.slice(0, 10) <= today).sort(byDue);
  const done = state.tasks.filter((t) => doneOn(t, today)).sort((a, b) => a.doneAt.localeCompare(b.doneAt));
  const total = open.length + done.length;
  $('#today-count').textContent = total ? `${done.length} of ${total} done${done.length === total ? ' 🎉' : ''}` : '';
  $('#today-progress').style.width = total ? `${(done.length / total) * 100}%` : '0%';

  const next = open.find((t) => new Date(t.due) >= now);
  const box = $('#home-tasks');
  if (!total) {
    box.replaceChildren(el('div', { className: 'empty-home' },
      el('p', {}, 'Nothing on your list today.'),
      el('button', { type: 'button', className: 'btn small primary', onclick: () => openAdd() }, '＋ Add a task')));
    return;
  }
  box.replaceChildren(el('ul', { className: 'task-list' },
    ...done.map((t) => taskItem(t, { showDay: false })),
    ...open.map((t) => {
      const li = taskItem(t, { showDay: t.due.slice(0, 10) < today });
      if (t === next) {
        li.classList.add('next');
        li.querySelector('.task-meta span').textContent += ' · next';
      }
      return li;
    })));
}

// ---------- first-time setup ----------

const PET_NAMES = ['Mochi', 'Boba', 'Peanut', 'Tofu', 'Maple', 'Biscuit', 'Latte', 'Pudding', 'Sesame', 'Dumpling', 'Honey', 'Kiwi', 'Waffle', 'Bean', 'Sprout'];
let ob = null;
let obTimer = null;
let obStreet = { key: '', canvas: null };

function petThumb(species, role, size = 16) {
  const c = el('canvas', { className: 'pix', width: size, height: size });
  Pixel.drawPet(c.getContext('2d'), 0, 0, { species, role, mood: 'happy', equipped: {} });
  return c;
}

function drawOnboarding(frame) {
  document.querySelectorAll('#onboarding canvas[data-ob]').forEach((c) => {
    const ctx = c.getContext('2d');
    if (c.dataset.ob === 'wave') {
      ctx.clearRect(0, 0, c.width, c.height);
      Pixel.drawPet(ctx, 2, 3, { species: ob.species, role: ob.role, mood: 'happy', wave: frame, equipped: {} });
      return;
    }
    const key = ob.role || '';
    if (obStreet.key !== key || !obStreet.canvas) obStreet = { key, canvas: Pixel.buildStreet(['umbrella', 'pot'], 'day', ob.role) };
    const stage = document.createElement('canvas');
    stage.width = Pixel.W;
    stage.height = Pixel.H;
    const s = stage.getContext('2d');
    Pixel.drawSky(s, 'day', frame * 2);
    s.drawImage(obStreet.canvas, 0, 0);
    s.fillStyle = 'rgba(91, 64, 56, 0.18)';
    s.fillRect(63, 85, 10, 2);
    Pixel.drawPet(s, 60, 70 - (frame % 2), { species: ob.species, mood: 'happy', wave: frame, equipped: {} });
    ctx.drawImage(stage, 24, Pixel.H - c.height, c.width, c.height, 0, 0, c.width, c.height);
  });
}

function openOnboarding({ hatch = false } = {}) {
  const p = state.pet;
  ob = { step: 1, species: p.species, name: p.name, role: p.role, userName: state.profile.userName, hatch };
  $('#onboarding').hidden = false;
  document.body.classList.add('sheet-open');
  renderOnboarding();
  let frame = 0;
  clearInterval(obTimer);
  obTimer = setInterval(() => drawOnboarding(frame++), 300);
}

function renderOnboarding() {
  const box = $('#onboarding');
  const steps = el('div', { className: 'steps' },
    ...[1, 2, 3].map((i) => el('i', { className: i <= ob.step ? 'on' : '' })),
    el('span', {}, `Step ${ob.step} of 3`));
  const body = el('div', { className: 'ob-body' });
  const go = (step) => { ob.step = step; renderOnboarding(); };
  let actions;

  if (ob.step === 1) {
    body.append(
      el('h2', {}, ob.hatch ? 'A new buddy is hatching! 🥚' : 'Welcome to Remi! 👋'),
      el('p', { className: 'sub' }, ob.hatch
        ? 'Choose who hatches next. Your coins, bag, outfits and street decor are all still here.'
        : 'Remi is your friend who reminds you. Meet your buddy: they live in a little café, cheer you on, and remind you of your tasks.'),
      el('canvas', { className: 'pix ob-scene', width: 112, height: 63 }),
      el('h3', {}, 'Choose your buddy'),
      el('div', { className: 'ob-grid' }, ...Pixel.CHARACTERS.map((ch) => el('button', {
        type: 'button', className: 'pick' + (ob.species === ch.id ? ' on' : ''), ariaPressed: String(ob.species === ch.id),
        onclick: () => {
          const defaultName = !ob.name || Pixel.CHARACTERS.some((c) => c.name === ob.name);
          ob.species = ch.id;
          if (defaultName) ob.name = ch.name;
          renderOnboarding();
        },
      }, petThumb(ch.id, null), el('span', {}, ch.name), el('small', {}, ch.kind)))));
    body.querySelector('.ob-scene').dataset.ob = 'scene';
    actions = [el('button', { type: 'button', className: 'btn primary', onclick: () => go(2) }, 'Next →')];
  } else if (ob.step === 2) {
    const nameInput = el('input', { type: 'text', id: 'ob-name', maxLength: 16, value: ob.name, autocomplete: 'off' });
    nameInput.addEventListener('input', () => { ob.name = nameInput.value; });
    const dice = el('button', {
      type: 'button', className: 'icon-btn', ariaLabel: 'Suggest a name',
      onclick: () => {
        const options = PET_NAMES.filter((n) => n !== ob.name);
        ob.name = options[Math.floor(Math.random() * options.length)];
        nameInput.value = ob.name;
      },
    }, '🎲');
    const wave = el('canvas', { className: 'pix ob-wave', width: 20, height: 20 });
    wave.dataset.ob = 'wave';
    body.append(
      el('h2', {}, 'Give them a name'),
      el('div', { className: 'ob-hero' }, wave),
      el('label', { className: 'field', htmlFor: 'ob-name' }, 'Name'),
      el('div', { className: 'name-row' }, nameInput, dice),
      el('h3', {}, 'Pick a job'),
      el('div', { className: 'ob-grid' }, ...Pixel.ROLES.map((r) => el('button', {
        type: 'button', className: 'pick' + (ob.role === r.id ? ' on' : ''), ariaPressed: String(ob.role === r.id),
        onclick: () => { ob.role = r.id; renderOnboarding(); },
      }, petThumb(ob.species, r.id, 18), el('span', {}, `${r.icon} ${r.name}`)))));
    actions = [
      el('button', { type: 'button', className: 'btn back', ariaLabel: 'Back', onclick: () => go(1) }, '←'),
      el('button', { type: 'button', className: 'btn primary', onclick: () => go(3) }, 'Next →'),
    ];
  } else {
    const s = state.settings;
    const you = el('input', { type: 'text', id: 'ob-you', maxLength: 24, value: ob.userName, placeholder: 'Your name', autocomplete: 'given-name' });
    you.addEventListener('input', () => { ob.userName = you.value; });
    const looks = el('div', { className: 'theme-cards' });
    const pickLook = (id) => { state.profile.theme = id; applyLook(); themeCards(looks, id, pickLook); };
    themeCards(looks, state.profile.theme, pickLook);
    const petName = (ob.name || '').trim() || Pixel.CHAR_BY_ID[ob.species].name;
    const music = el('input', { type: 'checkbox', id: 'ob-music', checked: state.profile.music });
    music.addEventListener('change', () => { state.profile.music = music.checked; applyLook(); Music.unlock(); });
    const sfx = el('input', { type: 'checkbox', id: 'ob-sfx', checked: state.profile.sfx });
    sfx.addEventListener('change', () => { state.profile.sfx = sfx.checked; applyLook(); Sfx.play('pat', ob.species); });
    const timeRow = (kind, label) => {
      const on = el('input', { type: 'checkbox', checked: s[kind].on });
      on.addEventListener('change', () => { s[kind].on = on.checked; });
      const time = el('input', { type: 'time', value: s[kind].time, ariaLabel: `${label} time` });
      time.addEventListener('change', () => { if (time.value) { s[kind].time = time.value; s.last[kind] = null; } });
      return el('div', { className: 'setting-row' }, el('label', { className: 'switch' }, on, ` ${label}`), time);
    };
    const alerts = el('div', { className: 'chips' });
    chips(alerts, 'ob-alert', s.defaultAlerts, () => { s.defaultAlerts = checkedMins(alerts); });
    const notify = el('button', { type: 'button', id: 'ob-notify', className: 'btn small', onclick: askNotify });
    body.append(
      el('h2', {}, 'Make it yours'),
      el('label', { className: 'field', htmlFor: 'ob-you' }, `What should ${petName} call you?`), you,
      el('h3', {}, 'Look'), looks,
      el('div', { className: 'card ob-card' },
        el('div', { className: 'setting-row' }, el('label', { className: 'switch', htmlFor: 'ob-music' }, music, ' 🎵 Background music')),
        el('div', { className: 'setting-row' }, el('label', { className: 'switch', htmlFor: 'ob-sfx' }, sfx, ' 🐾 Pet sounds')),
        el('div', { className: 'setting-row' }, el('span', { className: 'switch' }, '🔔 Pop-up notifications'), notify),
        timeRow('morning', '☀️ Morning plan'),
        timeRow('evening', '🌙 Evening check-in'),
        el('p', { className: 'muted small field-label' }, 'Remind me before tasks'),
        alerts));
    actions = [
      el('button', { type: 'button', className: 'btn back', ariaLabel: 'Back', onclick: () => go(2) }, '←'),
      el('button', { type: 'button', className: 'btn primary', onclick: finishOnboarding }, 'Start my day! 🎉'),
    ];
  }

  // First visit: Skip keeps the defaults. Re-running from settings: Close leaves everything as it was.
  const rerun = state.profile.setupDone && !ob.hatch;
  const skip = el('button', { type: 'button', className: 'ob-skip', onclick: rerun ? closeOnboarding : finishOnboarding },
    rerun ? 'Close' : 'Skip');
  box.replaceChildren(el('div', { className: 'ob-card-wrap' },
    el('div', { className: 'ob-top' }, steps, skip), body, el('div', { className: 'ob-actions' }, ...actions),
    el('p', { className: 'made-by' }, el('b', {}, 'Remi'), ' · by Curiosoul_Media · Made in Kuching, Sarawak')));
  updateNotifyButton();
  drawOnboarding(0);
}

function closeOnboarding() {
  clearInterval(obTimer);
  $('#onboarding').hidden = true;
  closeSheet($('#settings-sheet'));
  applyLook();
}

function finishOnboarding() {
  const p = state.pet;
  p.species = ob.species;
  p.name = (ob.name || '').trim() || Pixel.CHAR_BY_ID[ob.species].name;
  p.role = ob.role;
  state.profile.userName = (ob.userName || '').trim();
  state.profile.setupDone = true;
  save();
  clearInterval(obTimer);
  $('#onboarding').hidden = true;
  closeSheet($('#settings-sheet'));
  resetForm();
  renderSettings();
  applyLook();
  Music.unlock();
  showTab('home');
  render();
  Pet.greet();
}

// ---------- boot ----------

function renderLocations() {
  const places = [...new Set(state.tasks.map((t) => t.location).filter(Boolean))].slice(-20);
  $('#past-locations').replaceChildren(...places.map((p) => Object.assign(document.createElement('option'), { value: p })));
}

function render() {
  $('#today-label').textContent = new Date().toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
  renderHome();
  renderTasks();
  renderCalendar();
  renderNotes();
  renderLocations();
  Pet.render();
}

// Another tab changed the data: pick it up.
window.addEventListener('storage', (e) => {
  if (e.key === STORE_KEY) {
    state = load();
    render();
  }
});

// Roll the views over at midnight and keep overdue highlighting fresh.
let lastDay = todayKey();
setInterval(() => {
  if (todayKey() !== lastDay) {
    if (noteDay === lastDay && !saveTimer) noteDay = todayKey();
    lastDay = todayKey();
  }
  checkReminders();
}, CHECK_EVERY_MS);
setInterval(() => render(), 60 * 1000);

// The service worker opens the app with ?action=...&id=... when no tab was open.
const launch = new URLSearchParams(location.search);
if (launch.get('id')) {
  handleAction({ action: launch.get('action'), id: launch.get('id') });
  history.replaceState(null, '', location.pathname);
}

updateNotifyButton();
applyLook();
render();
checkReminders();

// The cover shows first. Tapping it opens the app (and lets music and sounds start).
// New visitors then set up their buddy; after that the pet says hi on every visit.
function startApp() {
  if (state.profile.setupDone) Pet.greet();
  else openOnboarding();
}

function closeCover() {
  const cover = $('#cover');
  if (!cover || cover.classList.contains('leaving')) return;
  cover.classList.add('leaving');
  Music.unlock();
  setTimeout(() => cover.remove(), 600);
  startApp();
}
$('#cover').addEventListener('click', closeCover);
$('#cover').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    closeCover();
  }
});
$('#cover').focus();
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) hiddenAt = Date.now();
  else if (hiddenAt && Date.now() - hiddenAt > GREET_AFTER_MS && state.profile.setupDone) Pet.greet();
});
