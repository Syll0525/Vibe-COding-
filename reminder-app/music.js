'use strict';

// Background music: Cozy Toy Groove in light mode, Peep the Pet in dark mode.
// Browsers only allow sound after the person taps something, so playback starts on the first tap.
const Music = (() => {
  const TRACKS = { day: 'music/cozy-toy-groove.mp3', night: 'music/peep-the-pet.mp3' };
  let volume = 0.35;
  const players = {};
  let enabled = false;
  let mode = 'day';
  let unlocked = false;

  function player(key) {
    if (!players[key]) {
      const a = new Audio(TRACKS[key]);
      a.loop = true;
      a.preload = 'none';
      a.volume = 0;
      players[key] = a;
    }
    return players[key];
  }

  function fade(a, to, ms, done) {
    clearInterval(a.fadeTimer);
    const from = a.volume;
    const steps = Math.max(1, Math.round(ms / 50));
    let i = 0;
    a.fadeTimer = setInterval(() => {
      i++;
      a.volume = Math.max(0, Math.min(1, from + (to - from) * (i / steps)));
      if (i >= steps) {
        clearInterval(a.fadeTimer);
        done?.();
      }
    }, 50);
  }

  function sync() {
    const want = enabled && unlocked && !document.hidden ? mode : null;
    for (const [key, a] of Object.entries(players)) {
      if (key !== want && !a.paused) fade(a, 0, 700, () => a.pause());
    }
    if (!want) return;
    const a = player(want);
    if (a.paused) {
      a.volume = 0;
      a.play().then(() => fade(a, volume, 1200)).catch(() => { unlocked = false; });
    } else {
      fade(a, volume, 700);
    }
  }

  function unlock() {
    if (unlocked) return;
    unlocked = true;
    sync();
  }

  document.addEventListener('pointerdown', unlock);
  document.addEventListener('keydown', unlock);
  document.addEventListener('visibilitychange', sync);

  return {
    setEnabled(on) { enabled = on; sync(); },
    setMode(m) { if (m !== mode) { mode = m; sync(); } },
    setVolume(v) { volume = Math.max(0, Math.min(1, v)); sync(); },
    unlock,
    // which track is currently playing ('day', 'night' or null)
    playing: () => Object.keys(players).find((k) => !players[k].paused) || null,
  };
})();
