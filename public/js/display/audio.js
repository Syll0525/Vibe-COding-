// Tiny WebAudio synth for the big screen: sound effects + a gamelan-ish party loop.
// Browsers only allow audio after a user gesture, so call unlock() from a click.

let ctx = null;
let master = null;
let musicTimer = null;
let musicOn = false;
let muted = false;

export function unlock() {
  if (ctx) { ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.35;
  master.connect(ctx.destination);
}

export function setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.35; }
export function isMuted() { return muted; }

function tone(freq, dur = 0.15, type = 'triangle', vol = 0.5, when = 0) {
  if (!ctx) return;
  const t0 = ctx.currentTime + when;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(master);
  o.start(t0); o.stop(t0 + dur + 0.02);
}

function noise(dur = 0.2, vol = 0.3, freq = 1200) {
  if (!ctx) return;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq;
  const g = ctx.createGain(); g.gain.value = vol;
  src.connect(f); f.connect(g); g.connect(master);
  src.start();
}

export const sfx = {
  collect() { tone(880, 0.08); tone(1320, 0.12, 'triangle', 0.4, 0.06); },
  cat() { tone(700, 0.18, 'sine', 0.4); tone(950, 0.25, 'sine', 0.35, 0.12); },
  highfive() { noise(0.12, 0.6, 2500); },
  friend() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, 'triangle', 0.35, i * 0.08)); },
  splash() { noise(0.45, 0.5, 700); },
  jump() { tone(400, 0.12, 'square', 0.15); tone(700, 0.1, 'square', 0.1, 0.05); },
  landmark() { [392, 523, 659].forEach((f, i) => tone(f, 0.3, 'sine', 0.3, i * 0.12)); },
  fanfare() { [523, 523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'square', 0.18, i * 0.13)); },
  chat() { tone(1200, 0.05, 'sine', 0.2); },
  whoosh() { noise(0.3, 0.3, 3000); },
};

// Pentatonic loop loosely inspired by sape (Sarawak lute) riffs
const RIFF = [392, 440, 523, 587, 523, 440, 392, 330, 392, 440, 587, 659, 587, 523, 440, 392];
export function setMusic(on) {
  if (on === musicOn || !ctx) return;
  musicOn = on;
  clearInterval(musicTimer);
  if (!on) return;
  let step = 0;
  musicTimer = setInterval(() => {
    tone(RIFF[step % RIFF.length], 0.22, 'triangle', 0.22);
    if (step % 4 === 0) tone(98, 0.25, 'sine', 0.5);        // kick-ish bass
    if (step % 4 === 2) noise(0.06, 0.18, 6000);             // hat
    step++;
  }, 190);
}
