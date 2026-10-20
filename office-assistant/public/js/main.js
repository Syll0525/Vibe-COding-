// Office UI: loads the office picture, opens Maya's workspace when she is clicked,
// and runs Chrome tasks with live progress.

import { initDesign } from './design.js';
import { initVideo } from './video.js';

const $ = (id) => document.getElementById(id);
let svg = null;      // 2D fallback picture
let office3d = null; // 3D office

// Which rooms light up while Maya works on each kind of task.
const BUSY_ROOMS = { chrome: ['digital', 'automation', 'boss'], design: ['sosmed', 'content'], video: ['video'], idle: [] };

export function toast(msg, ms = 2600) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), ms);
}

/** Puts Maya into a mood: what her wall screen shows and what her bubble says. */
export function setMaya(view, bubble, working = false) {
  if (office3d) {
    office3d.setWorking(working ? BUSY_ROOMS[view] || [] : []);
    if (bubble) office3d.setBubble(bubble);
    office3d.working = working;
    return;
  }
  if (!svg) return;
  svg.querySelectorAll('.screen-view').forEach((g) => { g.style.display = g.dataset.view === view ? '' : 'none'; });
  svg.classList.toggle('working', working);
  if (bubble) svg.getElementById('mayaBubbleText').textContent = bubble;
}

function setScreenUrl(text) {
  if (office3d) { office3d.setBubble(text.length > 34 ? text.slice(0, 33) + '…' : text); return; }
  const el = svg?.getElementById('screenUrl');
  if (el) el.textContent = text.length > 44 ? text.slice(0, 43) + '…' : text;
}

function tickClock() {
  if (!svg) return;
  const now = new Date();
  const h = (now.getHours() % 12) * 30 + now.getMinutes() * 0.5;
  const m = now.getMinutes() * 6;
  svg.getElementById('clockHour').setAttribute('transform', `rotate(${h})`);
  svg.getElementById('clockMin').setAttribute('transform', `rotate(${m - 68})`);
}

// --- panel & tabs ----------------------------------------------------------

function openPanel(tab) {
  document.querySelector('.layout').classList.add('with-panel');
  if (tab) selectTab(tab);
  if (window.innerWidth <= 1000) $('panel').scrollIntoView({ behavior: 'smooth' });
}

function selectTab(name) {
  document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  document.querySelectorAll('.tab-body').forEach((s) => { s.hidden = s.dataset.tab !== name; });
  const moods = { chrome: ['idle', 'Where should I go? 🌐'], design: ['design', 'Let\'s design! 🎨'], video: ['video', 'Ready to edit 🎬'] };
  const [view, bubble] = moods[name] || moods.chrome;
  if (!svg?.classList.contains('working') && !office3d?.working) setMaya(view, bubble);
}

// --- Chrome tasks ------------------------------------------------------------

let running = false;
export async function runTask(command) {
  command = String(command || '').trim();
  if (!command) { toast('Type a task for Maya first.'); return; }
  if (running) { toast('Maya is still busy with the last task.'); return; }
  running = true;
  openPanel('chrome');
  $('taskInput').value = command;
  $('runTask').disabled = true;
  $('runTask').textContent = '⏳ Maya is working…';
  $('taskResult').hidden = false;
  $('taskLog').innerHTML = '';
  $('taskSummary').textContent = '';
  setMaya('chrome', 'On it! 💪', true);
  setScreenUrl('opening Chrome…');

  const addLog = (e) => {
    const li = document.createElement('li');
    li.className = e.ok ? 'ok' : 'bad';
    li.textContent = e.step;
    if (e.detail) { const s = document.createElement('small'); s.textContent = e.detail; li.append(s); }
    $('taskLog').append(li);
    setScreenUrl(e.detail || e.step);
  };

  try {
    const res = await fetch('/api/task', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command }) });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Server error ${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let final = null;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        const msg = JSON.parse(line);
        if (msg.type === 'step') addLog(msg);
        else if (msg.type === 'done') final = msg;
      }
    }
    $('taskSummary').textContent = final?.summary || 'Done.';
    setMaya('chrome', final?.ok ? 'All done! ✅' : 'Hmm, check this 👀', false);
  } catch (err) {
    $('taskSummary').textContent = err.message;
    setMaya('idle', 'Something went wrong 😕', false);
  } finally {
    running = false;
    $('runTask').disabled = false;
    $('runTask').textContent = '▶ Run task';
    refreshStatus();
  }
}

async function refreshStatus() {
  try {
    const s = await (await fetch('/api/status')).json();
    $('aiPill').textContent = s.ai ? '🤖 Claude connected' : '⚙️ Offline mode (rules & templates)';
    $('aiPill').className = 'pill' + (s.ai ? ' on' : '');
    $('chromePill').textContent = s.browser.running ? `Chrome: ${s.browser.tabs} tab${s.browser.tabs === 1 ? '' : 's'}` : 'Chrome: closed';
    $('chromePill').className = 'pill' + (s.browser.running ? ' on' : ' muted');
  } catch {
    $('aiPill').textContent = 'Server not running';
  }
}

// --- boot ------------------------------------------------------------------

function onRoomClick(room) {
  if (room.action) openPanel(room.action);
  else toast(`${room.label}: this team is hiring soon. Maya covers marketing for now.`);
}

async function loadOffice() {
  try {
    const { createOffice3D } = await import('./office3d.js');
    $('officeScene').classList.add('is-3d');
    office3d = createOffice3D($('officeScene'), { onRoomClick });
    return;
  } catch (err) {
    console.warn('3D office unavailable, showing the 2D picture:', err);
    $('officeScene').classList.remove('is-3d');
    $('officeScene').innerHTML = '';
  }
  const text = await (await fetch('office.svg')).text();
  $('officeScene').innerHTML = text;
  svg = $('officeScene').querySelector('svg');
  const maya = svg.getElementById('desk-marketing');
  maya.setAttribute('tabindex', '0');
  maya.setAttribute('role', 'button');
  maya.setAttribute('aria-label', 'Open Maya, Marketing');
  maya.addEventListener('click', () => openPanel());
  maya.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPanel(); } });
  svg.querySelectorAll('.desk.hiring').forEach((d) => d.addEventListener('click', () => toast(`The ${d.dataset.role} desk is empty for now. A ${d.dataset.role.toLowerCase()} worker is coming soon!`)));
  tickClock();
  setInterval(tickClock, 30_000);
}

$('closePanel').addEventListener('click', () => document.querySelector('.layout').classList.remove('with-panel'));
document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => selectTab(b.dataset.tab)));
$('taskChips').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) $('taskInput').value = b.dataset.cmd; });
$('runTask').addEventListener('click', () => runTask($('taskInput').value));
$('taskInput').addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) runTask($('taskInput').value); });
$('quickTask').addEventListener('submit', (e) => { e.preventDefault(); runTask($('quickInput').value); $('quickInput').value = ''; });

await loadOffice();
initDesign({ toast, setMaya, runTask, openPanel });
initVideo({ toast, setMaya });
refreshStatus();
setInterval(refreshStatus, 15_000);
