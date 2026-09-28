'use strict';

const STORE_KEY = 'dailyReminders.v1';
const SNOOZE_MINUTES = 10;
const CHECK_EVERY_MS = 10 * 1000;
// Reminders missed by more than this while the page was closed are not replayed.
const REPLAY_WINDOW_MS = 12 * 60 * 60 * 1000;

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
    if (data && Array.isArray(data.tasks) && data.notes) return Pet.ensure(data);
  } catch { /* fall through to empty state */ }
  return Pet.ensure({ tasks: window.SEED_EXAMPLES ? exampleTasks() : [], notes: {} });
}

// Sample tasks for the hosted demo, so a first visit shows a reminder within a minute.
function exampleTasks() {
  const at = (mins) => localDateTime(new Date(Date.now() + mins * 60 * 1000));
  const base = { repeat: 'none', done: false, doneAt: null, notified: false };
  let n = 0;
  const uid = () => `example-${Date.now().toString(36)}-${n++}`;
  return [
    { ...base, id: uid(), title: 'Drink a glass of water', due: at(1), repeat: 'daily' },
    { ...base, id: uid(), title: 'Study Japanese for 20 minutes', due: at(90), location: 'City Library' },
    { ...base, id: uid(), title: 'Evening walk', due: at(24 * 60), location: 'Riverside park', repeat: 'weekdays' },
  ];
}

let state = load();

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch { /* storage blocked (private window): keep working in memory */ }
}

Pet.init({ getState: () => state, save, toast });

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const findTask = (id) => state.tasks.find((t) => t.id === id);

function addTask(title, due, repeat, location) {
  state.tasks.push({ id: uid(), title, due, repeat, location, done: false, doneAt: null, notified: new Date(due) <= new Date() });
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
      due: nextOccurrence(task.due, task.repeat),
      done: false, doneAt: null, notified: false,
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
  task.notified = false;
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
  if (!('Notification' in window)) {
    btn.textContent = 'Notifications not supported';
    btn.disabled = true;
  } else if (Notification.permission === 'granted') {
    btn.textContent = '🔔 Notifications on';
    btn.classList.add('on');
  } else if (Notification.permission === 'denied') {
    btn.textContent = 'Notifications blocked';
    btn.title = 'Allow notifications for this site in your browser settings';
  } else {
    btn.textContent = 'Turn on notifications';
  }
}

$('#notify-btn').addEventListener('click', async () => {
  if ('Notification' in window && Notification.permission === 'default') {
    await Notification.requestPermission();
  }
  updateNotifyButton();
  unlockAudio();
});

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

function systemNotify(task) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const body = `It's time! (${fmtTime(new Date(task.due))})` + (task.location ? `\n📍 ${task.location}` : '');
  if (swReg) {
    swReg.showNotification(`⏰ ${task.title}`, {
      body, tag: task.id, requireInteraction: true, icon: 'icon.svg', data: { id: task.id },
      actions: [{ action: 'done', title: '✓ Mark done' }, { action: 'snooze', title: `Snooze ${SNOOZE_MINUTES} min` }],
    });
  } else {
    try {
      const n = new Notification(`⏰ ${task.title}`, { body, tag: task.id, requireInteraction: true, icon: 'icon.svg' });
      n.onclick = () => { window.focus(); n.close(); };
    } catch { /* some mobile browsers only allow service worker notifications */ }
  }
}

function showAlert(task) {
  if (document.getElementById(`alert-${task.id}`)) return;
  const el = document.createElement('div');
  el.className = 'alert';
  el.id = `alert-${task.id}`;
  const msg = document.createElement('span');
  msg.className = 'msg';
  msg.textContent = `⏰ ${task.title}` + (task.location ? ` · 📍 ${task.location}` : '');
  const done = button('✓ Done', 'btn', () => setDone(task.id, true));
  const later = button(`Snooze ${SNOOZE_MINUTES} min`, 'btn', () => snooze(task.id));
  const close = button('✕', 'btn', () => dismissAlert(task.id));
  close.setAttribute('aria-label', 'Dismiss');
  el.append(msg, done, later, close);
  $('#alerts').append(el);
}

function dismissAlert(id) {
  document.getElementById(`alert-${id}`)?.remove();
  updateTitle();
}

function updateTitle() {
  const n = $('#alerts').children.length;
  document.title = n ? `(${n}) ⏰ Daily Reminders` : 'Daily Reminders';
}

function checkReminders() {
  const now = Date.now();
  let changed = false;
  let rang = false;
  for (const task of state.tasks) {
    if (task.done || task.notified) continue;
    const due = new Date(task.due).getTime();
    if (due > now) continue;
    task.notified = true;
    changed = true;
    if (now - due <= REPLAY_WINDOW_MS) {
      showAlert(task);
      systemNotify(task);
      rang = true;
    }
  }
  if (rang) chime();
  if (changed) {
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

// ---------- tabs ----------

// Phones show one panel at a time. Wide screens always show Tasks and pick Pet or Notes beside it.
let sideTab = 'pet';
function showTab(name) {
  if (name !== 'tasks') sideTab = name;
  document.querySelectorAll('.tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.tab === name);
    t.classList.toggle('side-active', t.dataset.tab === sideTab);
  });
  document.querySelectorAll('.panel').forEach((p) => {
    p.classList.toggle('active', p.id === `panel-${name}`);
    p.classList.toggle('side-active', p.id === `panel-${sideTab}`);
  });
}
$('#coin-pill').addEventListener('click', () => {
  showTab('pet');
  $('#panel-pet').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

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
document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => showTab(t.dataset.tab)));

// ---------- add form ----------

function defaultDue() {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
  return localDateTime(d);
}

$('#task-due').value = defaultDue();
$('#task-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const title = $('#task-title').value.trim();
  const due = $('#task-due').value;
  if (!title || !due) return;
  addTask(title, due, $('#task-repeat').value, $('#task-location').value.trim());
  $('#task-title').value = '';
  $('#task-location').value = '';
  $('#task-due').value = defaultDue();
  $('#task-repeat').value = 'none';
  $('#task-title').focus();
});

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
  a.download = `daily-reminders-${todayKey()}.json`;
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
    state = Pet.ensure({ tasks: data.tasks, notes: data.notes || {}, pet: data.pet });
    save();
    render();
    toast('Backup restored');
  } catch {
    toast('That file is not a Daily Reminders backup.');
  }
});

// ---------- boot ----------

function renderLocations() {
  const places = [...new Set(state.tasks.map((t) => t.location).filter(Boolean))].slice(-20);
  $('#past-locations').replaceChildren(...places.map((p) => Object.assign(document.createElement('option'), { value: p })));
}

function render() {
  $('#today-label').textContent = fmtLongDay(new Date());
  renderTasks();
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
render();
checkReminders();
