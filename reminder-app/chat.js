'use strict';

// Ask Remi: a small chat that answers questions about your days, tasks, notes and buddy.
// Inside the Claude viewer it asks Claude, giving it tools to look things up in this
// browser's data. Anywhere else (or if Claude isn't allowed) a built-in helper answers
// the common questions on its own.
// Uses app.js globals: state, $, el, todayKey, dayKey, parseDay, shiftDay, fmtTime,
// fmtDay, fmtLongDay, doneOn, byDue, noteStreak, progress, showTab, openAdd.
const Chat = (() => {
  const MAX_TURNS = 12;
  let sample = null;
  let aiOff = false;
  let busy = null; // AbortController of the running request
  const turns = []; // {role, content} for Claude

  // ---------- data helpers ----------

  const dueOn = (key) => state.tasks.filter((t) => t.due.slice(0, 10) === key).sort(byDue);
  const doneOnDay = (key) => state.tasks.filter((t) => doneOn(t, key)).sort((a, b) => a.doneAt.localeCompare(b.doneAt));
  const taskLine = (t) => `${t.title}${t.location ? ` @ ${t.location}` : ''}`;
  const daysBetween = (from, to) => {
    const out = [];
    for (let k = from; k <= to && out.length < 400; k = shiftDay(k, 1)) out.push(k);
    return out;
  };
  const niceDay = (key) => {
    if (key === todayKey()) return 'today';
    if (key === shiftDay(todayKey(), -1)) return 'yesterday';
    if (key === shiftDay(todayKey(), 1)) return 'tomorrow';
    return fmtDay(parseDay(key));
  };

  function dayRecord(key) {
    return {
      date: key,
      weekday: parseDay(key).toLocaleDateString('en', { weekday: 'long' }),
      planned: dueOn(key).map((t) => ({ title: t.title, time: fmtTime(new Date(t.due)), location: t.location || null, done: t.done })),
      finished: doneOnDay(key).map((t) => ({ title: t.title, at: fmtTime(new Date(t.doneAt)), location: t.location || null, coins: t.coins || 0 })),
      note: state.notes[key] || null,
      mood: state.pet.moods[key] ? state.pet.moods[key].label : null,
      buddyDiary: Pet.diary(key).slice(0, 30),
    };
  }

  function search(query, from = '0000', to = '9999') {
    const words = String(query).toLowerCase().split(/\s+/).filter((w) => w.length > 1);
    if (!words.length) return [];
    const hit = (text) => words.some((w) => text.toLowerCase().includes(w));
    const results = [];
    for (const t of state.tasks) {
      const key = (t.done && t.doneAt ? dayKey(new Date(t.doneAt)) : t.due.slice(0, 10));
      if (key < from || key > to) continue;
      if (hit(`${t.title} ${t.location || ''}`)) {
        results.push({ date: key, type: t.done ? 'finished task' : 'planned task', text: taskLine(t), time: fmtTime(new Date(t.done ? t.doneAt : t.due)) });
      }
    }
    for (const [key, note] of Object.entries(state.notes)) {
      if (key < from || key > to || !hit(note)) continue;
      results.push({ date: key, type: 'note', text: note.length > 300 ? `${note.slice(0, 300)}…` : note });
    }
    return results.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30);
  }

  // ---------- Claude ----------

  const TOOLS = [
    {
      name: 'get_day',
      description: 'Everything for one date: tasks planned, tasks finished (with time, place, coins), the "what I learned" note, the mood the user reported, and the buddy pet\'s diary. Input date as YYYY-MM-DD.',
      inputSchema: { type: 'object', properties: { date: { type: 'string', description: 'YYYY-MM-DD' } }, required: ['date'] },
      execute: ({ date }) => dayRecord(String(date).slice(0, 10)),
    },
    {
      name: 'get_range',
      description: 'A short summary per day between two dates (inclusive, at most 62 days): finished task titles, planned count, and the first 120 characters of the note. Use for weeks or months.',
      inputSchema: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' } }, required: ['from', 'to'] },
      execute: ({ from, to }) => daysBetween(String(from).slice(0, 10), String(to).slice(0, 10)).slice(-62).map((k) => ({
        date: k,
        finished: doneOnDay(k).map(taskLine),
        planned: dueOn(k).length,
        note: state.notes[k] ? state.notes[k].slice(0, 120) : null,
      })).filter((d) => d.finished.length || d.planned || d.note),
    },
    {
      name: 'search',
      description: 'Find tasks (by title or place) and notes containing any of the words, newest first, optionally limited to a date range. Use for "when did I last…" or "what did I learn about…".',
      inputSchema: { type: 'object', properties: { query: { type: 'string' }, from: { type: 'string' }, to: { type: 'string' } }, required: ['query'] },
      execute: ({ query, from, to }) => search(query, from ? String(from) : undefined, to ? String(to) : undefined),
    },
    {
      name: 'get_buddy',
      description: 'The buddy pet: name, kind, job, growth stage, age in days, days of life left, health, fullness, happiness, level, coins, snacks, rewards per task, and past buddies.',
      execute: () => Pet.info(),
    },
  ];

  function rules() {
    const now = new Date();
    const g = progress();
    const b = Pet.info();
    return [
      'You are Remi, the friendly helper inside "Remi", a cosy reminder app with a pixel pet.',
      `The user${state.profile.userName ? ` is called ${state.profile.userName}` : ''}. Their buddy pet is ${b.name}, a ${b.stage.toLowerCase()} ${b.kind} who works as a ${b.job}.`,
      `Right now it is ${fmtLongDay(now)}, ${fmtTime(now)} (today is ${todayKey()}).`,
      `Today: ${g.doneToday} tasks finished, ${g.leftToday} still to do, ${g.overdue} overdue from earlier. Note streak: ${g.streak} days. Coins: ${b.coins}.`,
      'Use the tools to look things up before answering anything about past or future days, tasks, notes, places, moods or the buddy. Never make up events: if nothing is found, say so kindly.',
      'Answer warmly and briefly (1 to 5 short sentences, or a short list), like a supportive friend. A few emojis are fine. Reply in the language the user writes in. Plain text only, no markdown headings or tables.',
    ].join('\n');
  }

  async function askClaude(text, bubble) {
    turns.push({ role: 'user', content: text });
    while (turns.length > MAX_TURNS) turns.shift();
    if (turns[0].role !== 'user') turns.shift();
    busy = new AbortController();
    setBusy(true);
    try {
      const { text: answer } = await sample([{ role: 'user', content: rules() }, ...turns], {
        tools: TOOLS,
        modelTier: 'quick',
        signal: busy.signal,
        onText: ({ text: so }) => { bubble.textContent = so; scrollDown(); },
      });
      bubble.textContent = answer;
      turns.push({ role: 'assistant', content: answer });
    } catch (e) {
      turns.pop();
      if (e.code === 'cancelled') {
        bubble.textContent = e.text || 'Okay, stopped.';
      } else if (['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed', 'tools_unavailable'].includes(e.code)) {
        aiOff = true;
        updateMode();
        bubble.textContent = offline(text);
      } else if (e.code === 'rate_limited') {
        bubble.textContent = (e.text ? `${e.text}\n\n` : '') + "I need a little rest. Try asking again in a minute 🙏";
      } else if (e.code === 'refused') {
        bubble.textContent = "Hmm, I can't help with that one. Ask me about your tasks, notes or your buddy! 💗";
      } else {
        bubble.textContent = (e.text ? `${e.text}\n\n` : '') + offline(text);
      }
    } finally {
      busy = null;
      setBusy(false);
      scrollDown();
    }
  }

  // ---------- offline helper ----------

  const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const STOP = new Set(('when did i last go to the a an my was time at visit visited do have been me remi what where how many much '
    + 'is are it on in of for about with you your this that did does done doing go went going get got and or any '
    + 'task tasks note notes learn learned learnt day days week month today yesterday tomorrow ago').split(' '));

  // Understands today / yesterday / tomorrow / this or last week or month / last N days /
  // weekday names / "28 sep" / "sep 28" / 2026-09-28. Returns {from, to, label} or null.
  function parseWhen(q) {
    const today = todayKey();
    const d = new Date();
    if (/\byesterday\b/.test(q)) { const k = shiftDay(today, -1); return { from: k, to: k, label: 'yesterday' }; }
    if (/\btomorrow\b/.test(q)) { const k = shiftDay(today, 1); return { from: k, to: k, label: 'tomorrow' }; }
    if (/\btoday\b|\btonight\b/.test(q)) return { from: today, to: today, label: 'today' };
    let m = q.match(/\b(?:last|past)\s+(\d+)\s+days?\b/);
    if (m) return { from: shiftDay(today, -Number(m[1]) + 1), to: today, label: `in the last ${m[1]} days` };
    const monday = shiftDay(today, -((d.getDay() + 6) % 7));
    if (/\blast week\b/.test(q)) return { from: shiftDay(monday, -7), to: shiftDay(monday, -1), label: 'last week' };
    if (/\bthis week\b/.test(q)) return { from: monday, to: shiftDay(monday, 6), label: 'this week' };
    if (/\bnext week\b/.test(q)) return { from: shiftDay(monday, 7), to: shiftDay(monday, 13), label: 'next week' };
    const first = dayKey(new Date(d.getFullYear(), d.getMonth(), 1));
    if (/\blast month\b/.test(q)) {
      return { from: dayKey(new Date(d.getFullYear(), d.getMonth() - 1, 1)), to: shiftDay(first, -1), label: 'last month' };
    }
    if (/\bthis month\b/.test(q)) return { from: first, to: dayKey(new Date(d.getFullYear(), d.getMonth() + 1, 0)), label: 'this month' };
    m = q.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
    if (m) { const k = `${m[1]}-${m[2]}-${m[3]}`; return { from: k, to: k, label: niceDay(k) }; }
    m = q.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTHS.join('|')})[a-z]*\\b`)) || q.match(new RegExp(`\\b(${MONTHS.join('|')})[a-z]*\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`));
    if (m) {
      const [day, mon] = /\d/.test(m[1]) ? [m[1], m[2]] : [m[2], m[1]];
      let k = dayKey(new Date(d.getFullYear(), MONTHS.indexOf(mon.slice(0, 3)), Number(day)));
      if (k > shiftDay(today, 180)) k = dayKey(new Date(d.getFullYear() - 1, MONTHS.indexOf(mon.slice(0, 3)), Number(day)));
      return { from: k, to: k, label: niceDay(k) };
    }
    for (let i = 0; i < 7; i++) {
      if (!new RegExp(`\\b${WEEKDAYS[i]}\\b`).test(q)) continue;
      const ahead = /\b(next|coming|this)\b/.test(q) && !/\blast\b/.test(q);
      const skipToday = /\b(last|next)\b/.test(q);
      let k = today;
      for (let step = skipToday ? 1 : 0; step < 8; step++) {
        const candidate = shiftDay(today, ahead ? step : -step);
        if (parseDay(candidate).getDay() === i) { k = candidate; break; }
      }
      return { from: k, to: k, label: `on ${niceDay(k)}` };
    }
    return null;
  }

  const list = (items) => items.map((x) => `• ${x}`).join('\n');

  function offline(raw) {
    const q = raw.toLowerCase().replace(/[’']/g, "'");
    const when = parseWhen(q);
    const today = todayKey();
    const b = Pet.info();
    const name = state.profile.userName;

    if (/^(hi|hey|hello|yo|hai|halo|good (morning|afternoon|evening))\b/.test(q)) {
      return `Hi${name ? ` ${name}` : ''}! 👋 I'm Remi. Ask me what you did on a day, what you learned, what's coming up, or how ${b.name} is doing.`;
    }
    if (/\bhelp\b|what can you/.test(q)) {
      return `I can look back at your days for you 💗 Try:\n${list(['What did I do yesterday?', 'What did I learn this week?', "What's on tomorrow?", 'When did I last go to the library?', `How is ${b.name}?`, 'How many coins do I get for a task?'])}`;
    }
    if (/\b(coins?|rewards?|earn|earns|earned|money)\b/.test(q)) {
      return `You have 🪙 ${b.coins} coins. Each task done on time earns ${b.rewards.task} coins, ${b.rewards.late} if it's more than an hour late, and writing today's note earns ${b.rewards.note}. You can change the coins per task in ⚙️ Settings → Rewards.`;
    }
    if (/\bstreak\b/.test(q)) {
      const s = noteStreak();
      return s ? `You've written a note ${s} day${s === 1 ? '' : 's'} in a row! 📖 Keep it going!` : 'No note streak yet. Write what you learned today to start one! 📖';
    }
    if (new RegExp(`\\b(${b.name.toLowerCase()}|buddy|pet|grow|old|age|die|dies|death|live|life|lifespan|health|sick|hungry|happy)\\b`).test(q)) {
      const lines = [`${b.name} is a ${b.stage.toLowerCase()} ${b.kind.toLowerCase()} (${b.ageDays} day${b.ageDays === 1 ? '' : 's'} old) working as a ${b.job.toLowerCase()}.`];
      lines.push(`❤️ Health ${b.health}% · 🍙 Full ${b.fullness}% · 💗 Happy ${b.happiness}%${b.sick ? ' · 🤒 feeling sick, some 💊 medicine would help' : ''}.`);
      if (/grow|old|age|die|dies|death|live|life|lifespan/.test(q)) {
        lines.push(`Buddies grow from baby → child (3 days) → teen (2 weeks) → adult (6 weeks) → elder (4 months) and live about ${Math.round(b.lifespanDays / 30)} months. ${b.name} has about ${b.daysLeft} days left together. Sick days use up life 3× faster, so keep them fed and happy!`);
      }
      return lines.join('\n');
    }
    if (/\bmood|feel|felt\b/.test(q)) {
      const range = when || { from: shiftDay(today, -6), to: today, label: 'this past week' };
      const moods = daysBetween(range.from, range.to).filter((k) => state.pet.moods[k]).map((k) => `${niceDay(k)}: ${state.pet.moods[k].icon} ${state.pet.moods[k].label}`);
      return moods.length ? `Here's how you felt ${range.label}:\n${list(moods)}` : `You didn't tell me how you felt ${range.label}. Tell me next time I say hi! 💗`;
    }
    if (/\blast time\b|when did i|when was|last (go|went|visit)/.test(q)) {
      const words = q.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
      if (words.length) {
        const found = search(words.join(' ')).filter((r) => r.type === 'finished task');
        if (found.length) return `The last time was ${niceDay(found[0].date)}${found[0].date !== today ? ` (${fmtLongDay(parseDay(found[0].date))})` : ''}: ${found[0].text}, at ${found[0].time}. ✨`;
        const planned = search(words.join(' ')).filter((r) => r.type === 'planned task');
        if (planned.length) return `I couldn't find a finished one, but "${planned[0].text}" is planned for ${niceDay(planned[0].date)}.`;
        return `I couldn't find anything about "${words.join(' ')}" in your tasks yet. 🤔`;
      }
    }
    if (/\blearn|learnt|note|notes|study|studied\b/.test(q)) {
      const range = when || { from: shiftDay(today, -6), to: today, label: 'this past week' };
      const notes = daysBetween(range.from, range.to).filter((k) => state.notes[k]?.trim()).reverse()
        .map((k) => `${niceDay(k)}: ${state.notes[k].trim().replace(/\s+/g, ' ').slice(0, 160)}`);
      return notes.length ? `Here's what you learned ${range.label} 📖\n${list(notes)}` : `I don't see any notes ${range.label}. The 📖 Notes page is waiting for you!`;
    }
    const future = when && when.from > today;
    if (future || /\b(upcoming|coming up|plan|planned|schedule|next|what's on|whats on|to do|todo|left)\b/.test(q)) {
      const range = when || { from: today, to: shiftDay(today, 6), label: 'in the next 7 days' };
      const open = daysBetween(range.from, range.to).flatMap((k) => dueOn(k).filter((t) => !t.done)
        .map((t) => `${range.from === range.to ? '' : `${niceDay(k)}, `}${fmtTime(new Date(t.due))}: ${taskLine(t)}`));
      return open.length ? `Here's what's planned ${range.label} 🗓️\n${list(open)}` : `Nothing planned ${range.label}. A free day! 🌷`;
    }
    if (when || /\b(did|done|finish|finished|complete|completed|accomplish|happen|happened)\b/.test(q)) {
      const range = when || { from: today, to: today, label: 'today' };
      const days = daysBetween(range.from, range.to);
      const done = days.flatMap((k) => doneOnDay(k).map((t) => `${days.length > 1 ? `${niceDay(k)}: ` : ''}${taskLine(t)} (${fmtTime(new Date(t.doneAt))})`));
      const notes = days.filter((k) => state.notes[k]?.trim());
      let answer = done.length
        ? `You finished ${done.length} task${done.length === 1 ? '' : 's'} ${range.label} 🎉\n${list(done.slice(0, 15))}`
        : `I don't see any finished tasks ${range.label}.`;
      if (notes.length === 1) answer += `\n📖 You also wrote: "${state.notes[notes[0]].trim().slice(0, 140)}"`;
      else if (notes.length > 1) answer += `\n📖 And you wrote ${notes.length} notes.`;
      return answer;
    }
    const words = q.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
    if (words.length) {
      const found = search(words.join(' '));
      if (found.length) return `Here's what I found about "${words.join(' ')}":\n${list(found.slice(0, 6).map((r) => `${niceDay(r.date)} (${r.type}): ${r.text.slice(0, 120)}`))}`;
    }
    return `Hmm, I'm not sure about that one 🤔 Try "What did I do yesterday?", "What did I learn this week?" or "When did I last go to the gym?"`;
  }

  // ---------- UI ----------

  function scrollDown() {
    const log = $('#chat-log');
    log.scrollTop = log.scrollHeight;
  }

  function bubble(who, text) {
    const b = el('div', { className: `msg ${who}` }, text);
    $('#chat-log').append(b);
    scrollDown();
    return b;
  }

  function setBusy(on) {
    $('#chat-send').textContent = on ? 'Stop' : 'Send';
    $('#chat-send').classList.toggle('stop', on);
    $('#chat-input').disabled = on;
  }

  function updateMode() {
    $('#chat-mode').textContent = sample && !aiOff ? 'Powered by Claude ✨ · reads this app only' : 'Your days, tasks and notes';
  }

  function suggestions() {
    const last = [...state.tasks].filter((t) => t.done && t.location).sort((a, b) => b.doneAt.localeCompare(a.doneAt))[0];
    const ideas = ['What did I do yesterday?', 'What did I learn this week?', "What's on tomorrow?",
      last ? `When did I last go to ${last.location}?` : 'When did I last exercise?',
      `How is ${Pet.name()} growing?`, 'How many coins do I get?'];
    $('#chat-suggest').replaceChildren(...ideas.map((idea) => el('button', {
      type: 'button', className: 'chip-btn', onclick: () => send(idea),
    }, idea)));
  }

  function drawAvatars() {
    document.querySelectorAll('#chat-fab canvas, .chat-avatar').forEach((c) => {
      const ctx = c.getContext('2d');
      ctx.clearRect(0, 0, c.width, c.height);
      Pixel.drawPet(ctx, 2, 3, { species: state.pet.species, role: state.pet.role, stage: Pet.stage(), mood: 'happy', equipped: state.pet.equipped });
    });
  }

  function send(text) {
    const q = text.trim();
    if (!q || busy) return;
    $('#chat-input').value = '';
    $('#chat-suggest').hidden = true;
    bubble('me', q);
    const reply = bubble('remi', 'Remi is thinking…');
    reply.classList.add('thinking');
    if (sample && !aiOff) {
      askClaude(q, reply).finally(() => reply.classList.remove('thinking'));
    } else {
      setTimeout(() => {
        reply.textContent = offline(q);
        reply.classList.remove('thinking');
        scrollDown();
      }, 350);
    }
  }

  function open() {
    $('#chat').hidden = false;
    $('#chat-fab').setAttribute('aria-expanded', 'true');
    drawAvatars();
    if (!$('#chat-log').children.length) {
      const who = state.profile.userName ? ` ${state.profile.userName}` : '';
      bubble('remi', `Hi${who}! 💗 I'm Remi. Ask me anything about your days: what you did, what you learned, what's coming up, or how ${Pet.name()} is doing.`);
      suggestions();
    }
    $('#chat-input').focus();
  }

  function close() {
    $('#chat').hidden = true;
    $('#chat-fab').setAttribute('aria-expanded', 'false');
    busy?.abort();
  }

  $('#chat-fab').addEventListener('click', () => ($('#chat').hidden ? open() : close()));
  $('#chat-close').addEventListener('click', close);
  $('#chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (busy) busy.abort();
    else send($('#chat-input').value);
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#chat').hidden) close(); });

  drawAvatars();
  setInterval(drawAvatars, 60 * 1000);
  // Claude is only reachable inside the Claude viewer; everywhere else the helper answers.
  window.claude?.use?.('sample').then((s) => { sample = s; updateMode(); }).catch(() => {});

  return { open, close, offline };
})();
