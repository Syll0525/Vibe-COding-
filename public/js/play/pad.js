// Virtual joystick + buttons (touch) with keyboard fallback for desktop testing.

export function setupPad({ zone, base, knob, onMove, onButton }) {
  let active = null;         // pointerId
  let origin = null;
  let vec = { mx: 0, my: 0 };
  const R = 60;

  const setKnob = (dx, dy) => { knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`; };

  zone.addEventListener('pointerdown', (e) => {
    if (active !== null) return;
    active = e.pointerId;
    zone.setPointerCapture(e.pointerId);
    // floating joystick: re-centre where the thumb lands
    const zr = zone.getBoundingClientRect();
    base.style.position = 'absolute';
    base.style.left = `${e.clientX - zr.left - base.offsetWidth / 2}px`;
    base.style.top = `${e.clientY - zr.top - base.offsetHeight / 2}px`;
    origin = { x: e.clientX, y: e.clientY };
    move(e);
  });
  zone.addEventListener('pointermove', (e) => { if (e.pointerId === active) move(e); });
  const end = (e) => {
    if (e.pointerId !== active) return;
    active = null;
    vec = { mx: 0, my: 0 };
    setKnob(0, 0);
    base.style.position = ''; base.style.left = ''; base.style.top = '';
    onMove(vec);
  };
  zone.addEventListener('pointerup', end);
  zone.addEventListener('pointercancel', end);

  function move(e) {
    let dx = e.clientX - origin.x, dy = e.clientY - origin.y;
    const d = Math.hypot(dx, dy);
    if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
    setKnob(dx, dy);
    const m = Math.min(1, d / R);
    vec = d < 8 ? { mx: 0, my: 0 } : { mx: (dx / Math.max(d, 1)) * m, my: (dy / Math.max(d, 1)) * m };
    onMove(vec);
  }

  // Keyboard (WASD / arrows, space = jump, E/Enter = A, Q = ability)
  const keys = new Set();
  const keyVec = () => {
    const mx = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
    const my = (keys.has('s') || keys.has('arrowdown') ? 1 : 0) - (keys.has('w') || keys.has('arrowup') ? 1 : 0);
    const d = Math.hypot(mx, my) || 1;
    onMove({ mx: mx / d, my: my / d });
  };
  addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    const k = e.key.toLowerCase();
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) { keys.add(k); keyVec(); e.preventDefault(); }
    if (e.repeat) return;
    if (k === ' ') { onButton('jump'); e.preventDefault(); }
    if (k === 'e' || k === 'enter') onButton('interact');
    if (k === 'q') onButton('ability');
  });
  addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
    if (keys.delete(k)) keyVec();
  });

  return { get vec() { return vec; } };
}
