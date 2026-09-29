'use strict';

// Little 8-bit pet sounds, made on the fly with the Web Audio API (no sound files).
// Each species has its own voice pitch: the chick squeaks, the bear is deeper.
const Sfx = (() => {
  const PITCH = { hamster: 1.2, bear: 0.75, bunny: 1.35, cat: 1.1, chick: 1.5 };
  let ctx = null;
  let enabled = true;
  let volume = 0.6;

  function audio() {
    if (!ctx && window.AudioContext) ctx = new AudioContext();
    if (ctx?.state === 'suspended') ctx.resume();
    return ctx;
  }

  // One note: frequency (optionally sliding to `to`), start offset and length in seconds.
  function tone(freq, at, dur, { type = 'square', to = null, gain = 0.2 } = {}) {
    const c = audio();
    const t = c.currentTime + at;
    const osc = c.createOscillator();
    const amp = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(gain * volume, t + 0.01);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(amp).connect(c.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  // A short burst of filtered noise: crunches and munches.
  function crunch(at, dur, cutoff = 1400, gain = 0.35) {
    const c = audio();
    const t = c.currentTime + at;
    const buffer = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = c.createBufferSource();
    const filter = c.createBiquadFilter();
    const amp = c.createGain();
    src.buffer = buffer;
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    amp.gain.value = gain * volume;
    src.connect(filter).connect(amp).connect(c.destination);
    src.start(t);
  }

  const SOUNDS = {
    // happy squeak when patted
    pat: (p) => {
      tone(700 * p, 0, 0.09, { type: 'triangle', to: 1100 * p, gain: 0.25 });
      tone(900 * p, 0.11, 0.12, { type: 'triangle', to: 1400 * p, gain: 0.22 });
    },
    // sleepy yawn when patted at night
    yawn: (p) => tone(520 * p, 0, 0.6, { type: 'sine', to: 240 * p, gain: 0.22 }),
    // nom nom nom, then a gulp
    eat: (p) => {
      for (let i = 0; i < 3; i++) {
        crunch(i * 0.2, 0.08, 1200 + i * 200);
        tone(180 * p, i * 0.2, 0.06, { type: 'triangle', gain: 0.18 });
      }
      tone(420 * p, 0.66, 0.16, { type: 'sine', to: 200 * p, gain: 0.25 });
    },
    // "no thanks": two falling notes
    nope: (p) => {
      tone(520 * p, 0, 0.12, { type: 'square', gain: 0.12 });
      tone(390 * p, 0.14, 0.18, { type: 'square', gain: 0.12 });
    },
    // boing boing for playing catch
    boing: (p) => {
      tone(220 * p, 0, 0.22, { type: 'sine', to: 660 * p, gain: 0.3 });
      tone(260 * p, 0.28, 0.2, { type: 'sine', to: 780 * p, gain: 0.25 });
      tone(1100 * p, 0.52, 0.08, { type: 'triangle', gain: 0.15 });
    },
    // classic coin pickup
    coin: () => {
      tone(988, 0, 0.08, { gain: 0.14 });
      tone(1319, 0.08, 0.28, { gain: 0.14 });
    },
    // task finished: coin, then a happy cheer from the pet
    yay: (p) => {
      SOUNDS.coin(p);
      [523, 659, 784, 1047].forEach((f, i) => tone(f * p * 0.9, 0.3 + i * 0.08, 0.14, { type: 'triangle', gain: 0.18 }));
    },
    // bought something: ka-ching with a sparkle
    buy: () => {
      tone(1568, 0, 0.06, { gain: 0.12 });
      tone(2093, 0.07, 0.2, { gain: 0.12 });
      [2637, 3136, 3520].forEach((f, i) => tone(f, 0.2 + i * 0.05, 0.08, { type: 'sine', gain: 0.08 }));
    },
    // waving hello: "hi-ya!"
    hello: (p) => {
      tone(600 * p, 0, 0.12, { type: 'triangle', to: 900 * p, gain: 0.25 });
      tone(800 * p, 0.16, 0.18, { type: 'triangle', to: 1250 * p, gain: 0.25 });
    },
    // soft "aww" for a tired or stressed answer
    aww: (p) => tone(700 * p, 0, 0.45, { type: 'sine', to: 450 * p, gain: 0.2 }),
  };

  return {
    play(name, species) {
      if (!enabled || !SOUNDS[name] || !window.AudioContext) return;
      // before the first tap the browser would hold the sound and play it late
      if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
      try {
        SOUNDS[name](PITCH[species] || 1);
      } catch { /* sound is a nice-to-have */ }
    },
    setEnabled(on) { enabled = on; },
    setVolume(v) { volume = Math.max(0, Math.min(1, v)); },
    unlock: audio,
  };
})();
