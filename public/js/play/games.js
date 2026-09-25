// Phone: games menu, Top Spot food quiz and race HUD/countdown.

const $ = (id) => document.getElementById(id);

export function setupGames({ socket, toast, buzz, getHud, getMe }) {
  // ---------------------------------------------------------------- games list
  const GAMES = [
    { id: 'kart', icon: '🏎️', title: 'Road Race', text: '2 laps round Main Bazaar in go-karts. 1st 🪙70 · 2nd 🪙50 · 3rd 🪙35 · finish 🪙10', button: 'Join race' },
    { id: 'boat', icon: '🚣', title: 'Sampan Race', text: 'Paddle down the Sarawak River — tap A really fast! Same prizes.', button: 'Join race' },
    { id: 'quiz', icon: '🍜', title: 'Top Spot Food Quiz', text: 'Guess 5 Sarawak dishes. 🪙5 each, all 5 right = +🪙30 bonus.', button: 'Play now' },
    { id: 'cats', icon: '🐱', title: 'Cat Hunt', text: 'Find the 8 hidden cats (press A next to one). 🪙20 each, all 8 = +🪙100.' },
    { id: 'friends', icon: '🙌', title: 'Make Friends', text: 'High-five someone new with A: +🪙15 each. High-five friends again later: +🪙2.' },
    { id: 'stamps', icon: '📍', title: 'Landmark Passport', text: 'Visit landmarks and press A for a stamp: +🪙10 each.' },
    { id: 'snacks', icon: '🍰', title: 'Snack Hunt', text: 'Grab kolo mee 🪙2, kek lapis 🪙3 and laksa 🪙5 all around the city.' },
  ];

  function renderGames() {
    const hud = getHud() || {};
    const list = $('games-list');
    list.replaceChildren();
    for (const g of GAMES) {
      const card = document.createElement('div');
      card.className = 'game-card';
      card.append(
        Object.assign(document.createElement('div'), { className: 'gicon', textContent: g.icon }),
        Object.assign(document.createElement('div'), { className: 'gtitle', textContent: g.title }),
      );
      const progress = {
        cats: `${hud.cats ?? 0}/${hud.catsTotal ?? 8} found · ${hud.catHint ?? ''}`,
        friends: `${hud.friends ?? 0} friends made`,
        stamps: `${hud.stamps ?? 0}/${hud.stampsTotal ?? 11} stamps`,
      }[g.id];
      if (g.button) {
        const b = Object.assign(document.createElement('button'), { className: 'btn teal', textContent: g.button });
        b.onclick = () => (g.id === 'quiz' ? startQuiz() : joinRace(g.id));
        if (hud.race && g.id !== 'quiz') b.disabled = true;
        card.append(b);
      }
      card.append(Object.assign(document.createElement('div'), { className: 'gtext', textContent: g.text }));
      if (progress) card.append(Object.assign(document.createElement('div'), { className: 'gprog', textContent: progress }));
      list.append(card);
    }
  }

  function joinRace(kind) {
    socket.emit('game:join', { kind }, (res) => {
      if (!res?.ok) return toast(res?.error || 'Could not join');
      buzz(40);
      toast(kind === 'kart' ? '🏎️ You joined the Road Race! It starts soon…' : '🚣 You joined the Sampan Race! It starts soon…');
      $('race-invite').classList.add('hidden');
      document.dispatchEvent(new CustomEvent('dk:tab', { detail: 'pad' }));
    });
  }

  // ---------------------------------------------------------------- race HUD
  let inviteTimer = null;
  socket.on('race', (r) => {
    if (r.state === 'lobby') {
      if (getHud()?.race) return;
      $('race-invite-text').textContent = `${r.title} starts in ${r.secs}s!`;
      $('race-invite').classList.remove('hidden');
      $('race-invite-join').onclick = () => joinRace(r.kind);
      clearTimeout(inviteTimer);
      inviteTimer = setTimeout(() => $('race-invite').classList.add('hidden'), (r.secs - 1) * 1000);
      return;
    }
    const mine = getHud()?.race?.kind === r.kind;
    if (r.state === 'countdown') $('race-invite').classList.add('hidden');
    if (r.state === 'countdown' && mine) countdown(r.secs);
    if (r.state === 'go' && mine) bigText('GO!', 900);
    if (r.state === 'done') {
      const me = getMe();
      const idx = (r.ranking || []).findIndex((x) => x.id === me?.id);
      if (idx >= 0) toast(idx === 0 ? `🏆 You WON the ${r.title}!` : `${r.title}: you came #${idx + 1}`, 4000);
    }
  });

  function bigText(text, ms) {
    const el = $('bigcount');
    el.textContent = text;
    el.classList.remove('hidden');
    el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
    clearTimeout(bigText.t);
    bigText.t = setTimeout(() => el.classList.add('hidden'), ms);
  }
  function countdown(secs) {
    for (let i = 0; i < secs; i++) setTimeout(() => { bigText(String(secs - i), 800); buzz(60); }, i * 1000);
  }

  function updateRace(hud) {
    const strip = $('race-strip');
    const r = hud.race;
    strip.classList.toggle('hidden', !r);
    $('a-label').textContent = hud.vehicle === 'boat' ? 'PADDLE' : 'use';
    if (!r) return;
    const icon = r.kind === 'kart' ? '🏎️' : '🚣';
    if (r.state === 'lobby') strip.textContent = `${icon} ${r.title} — starting in ${r.secs}s… (${r.of} racers)`;
    else if (r.state === 'countdown') strip.textContent = `${icon} Get ready!`;
    else strip.textContent = `${icon} Position ${r.pos}/${r.of} · ${r.laps > 1 ? `Lap ${r.lap}/${r.laps} · ` : ''}Checkpoint ${Math.min(r.cp + 1, r.cps)}/${r.cps} · ${r.secs}s`;
  }

  // ---------------------------------------------------------------- food quiz
  let answering = false;
  function startQuiz() {
    socket.emit('quiz:start', {}, (res) => {
      if (!res?.ok) return toast(res?.error || 'The kitchen is closed');
      showQuestion(res.question);
    });
  }

  function showQuestion(q) {
    answering = false;
    $('quiz').classList.remove('hidden');
    $('quiz-n').textContent = `${q.n} / ${q.total}`;
    $('quiz-emoji').textContent = q.emoji;
    $('quiz-clue').textContent = q.clue;
    $('quiz-feedback').textContent = 'Which dish is this?';
    const box = $('quiz-choices');
    box.replaceChildren(...q.choices.map((name, i) => {
      const b = Object.assign(document.createElement('button'), { textContent: name });
      b.onclick = () => answer(i, b);
      return b;
    }));
  }

  function answer(i, btn) {
    if (answering) return;
    answering = true;
    socket.emit('quiz:answer', { choice: i }, (res) => {
      if (!res?.ok) { $('quiz').classList.add('hidden'); return toast(res?.error || 'Quiz ended'); }
      const buttons = [...$('quiz-choices').children];
      for (const b of buttons) if (b.textContent === res.answer) b.classList.add('right');
      if (!res.correct) btn.classList.add('wrong');
      $('quiz-feedback').textContent = res.correct ? '✅ Betul! Correct! +🪙5' : `❌ It was ${res.answer}`;
      buzz(res.correct ? 30 : 120);
      setTimeout(() => {
        if (res.next) return showQuestion(res.next);
        const s = res.summary;
        $('quiz-emoji').textContent = s.correct === s.total ? '🏆' : s.correct >= 3 ? '😋' : '🙂';
        $('quiz-clue').textContent = `You got ${s.correct} out of ${s.total}!`;
        $('quiz-feedback').textContent = `+🪙${s.coins} coins${s.correct === s.total ? ' — perfect score bonus!' : ''}`;
        $('quiz-n').textContent = '';
        const close = Object.assign(document.createElement('button'), { textContent: 'Sedap! Close' });
        close.onclick = () => $('quiz').classList.add('hidden');
        $('quiz-choices').replaceChildren(close);
      }, 1100);
    });
  }
  socket.on('quiz:question', showQuestion);

  return { renderGames, updateRace };
}
