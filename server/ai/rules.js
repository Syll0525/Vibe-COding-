// Offline personality engine: turns a free-text description into a character profile
// using keyword rules. Used when no ANTHROPIC_API_KEY is configured, or as a fallback
// when the AI call fails. Also home to normalizeProfile(), the single place where any
// profile (AI or rules) is validated and clamped before it reaches the game.

import { GAITS, ABILITIES, IDLES, MAX_NAME_LENGTH } from '../../shared/constants.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo));

// Each rule: regex over the lowercased description → tweaks to apply.
const RULES = [
  { re: /robot|mechanical|beep|stiff|machine|android/, gait: 'robot', trait: 'Robotic', emoji: '🤖' },
  { re: /hop|bounc|jump|spring|kangaroo|frog|bunny|rabbit/, gait: 'hop', jump: 0.45, trait: 'Bouncy', emoji: '🐸' },
  { re: /waddl|penguin|duck|clumsy|wobbl/, gait: 'waddle', trait: 'Wobbly', emoji: '🐧' },
  { re: /float|glide|fly|ghost|cloud|flying|wings|fairy|drift/, gait: 'glide', trait: 'Floaty', emoji: '👻' },
  { re: /danc|groov|boogie|twirl|ballet/, gait: 'dance', music: 0.4, idle: 'dance', trait: 'Dancer', emoji: '💃' },
  { re: /fast|speed|quick|rush|zoom|rocket|race|sprint|cheetah|flash/, gait: 'zoom', speed: 0.55, ability: 'dash', trait: 'Speedy', emoji: '⚡' },
  { re: /slow|lazy|sleepy|chill|relax|snail|turtle|sloth/, speed: -0.35, idle: 'nap', trait: 'Chill', emoji: '😴' },
  { re: /music|sing|song|guitar|drum|dj|beat|rock/, music: 0.55, ability: 'boombox', trait: 'Music lover', emoji: '🎵' },
  { re: /friend|social|kind|hug|love|friendly|people|chat|talk|share/, social: 0.5, ability: 'charm', idle: 'wave', trait: 'Friendly', emoji: '🤗' },
  { re: /shy|quiet|alone|introvert/, social: -0.35, idle: 'look', trait: 'Shy', emoji: '🙈' },
  { re: /hungry|food|eat|snack|kolo|laksa|cake|mee/, ability: 'magnet', trait: 'Foodie', emoji: '🍜' },
  { re: /strong|super|hero|power|brave|jump high|high jump/, ability: 'superjump', trait: 'Heroic', emoji: '🦸' },
  { re: /spin|dizzy|tornado|twist/, idle: 'spin', trait: 'Spinny', emoji: '🌀' },
  { re: /curious|explor|advent|travel|wander/, speed: 0.15, idle: 'look', trait: 'Explorer', emoji: '🧭' },
  { re: /cat|kitty|meow|kucing/, jump: 0.2, trait: 'Cat-like', emoji: '🐱' },
  { re: /happy|cheer|smile|fun|silly|funny|joke/, jump: 0.15, social: 0.15, trait: 'Cheerful', emoji: '😄' },
];

const NAME_PARTS = {
  a: ['Captain', 'Little', 'Sir', 'Lady', 'Mighty', 'Tiny', 'Super', 'Professor', 'DJ', 'Auntie', 'Uncle'],
  b: ['Kolo', 'Laksa', 'Kucing', 'Pepper', 'Sago', 'Midin', 'Belacan', 'Rambutan', 'Hornbill', 'Durian', 'Kek'],
};

function pick(arr, seed) { return arr[Math.abs(seed) % arr.length]; }
function hashStr(s) { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return h; }

export function ruleProfile(description = '', name = '', salt = 0) {
  const text = String(description).toLowerCase();
  const seed = hashStr(text + name) ^ salt;
  const p = {
    name: name || `${pick(NAME_PARTS.a, seed)} ${pick(NAME_PARTS.b, seed >> 3)}`,
    gait: 'walk', speed: 1, jumpiness: 0.15, bounce: 0.4, sociability: 0.45, musicLove: 0.3,
    ability: null, idle: null, traits: [], emoji: null,
  };
  let gaitScore = 0;
  for (const r of RULES) {
    const m = text.match(r.re);
    if (!m) continue;
    // Earlier mentions win the gait (so "walks like a robot and loves to dance" is a robot)
    if (r.gait && (gaitScore === 0 || m.index < gaitScore - 1)) { p.gait = r.gait; gaitScore = m.index + 1; }
    if (r.speed) p.speed += r.speed;
    if (r.jump) { p.jumpiness += r.jump; p.bounce += r.jump; }
    if (r.music) p.musicLove += r.music;
    if (r.social) p.sociability += r.social;
    if (r.ability && !p.ability) p.ability = r.ability;
    if (r.idle && !p.idle) p.idle = r.idle;
    if (r.trait && !p.traits.includes(r.trait)) p.traits.push(r.trait);
    if (r.emoji && !p.emoji) p.emoji = r.emoji;
  }
  if (/very|super|really|so /.test(text) && p.speed > 1) p.speed += 0.2;
  if (/a lot|lots|always|all the time/.test(text) && p.jumpiness > 0.3) p.jumpiness += 0.25;
  if (!p.ability) p.ability = pick(ABILITIES, seed >> 5);
  if (!p.idle) p.idle = p.musicLove > 0.6 ? 'dance' : pick(IDLES, seed >> 7);
  if (!p.traits.length) p.traits.push('Mysterious');

  const top = p.traits[0];
  p.catchphrase = {
    Robotic: 'BEEP BOOP. Kuching mode activated.',
    Bouncy: 'Boing boing! Try to catch me!',
    Dancer: 'Every street is a dance floor!',
    Speedy: 'Too fast for the kolo mee to cool down!',
    'Music lover': 'Turn it up, Kuching!',
    Friendly: 'Hi hi! Want to be friends?',
    Foodie: 'Where is the laksa?!',
    Floaty: 'Wheee, I am floating over the river…',
    Chill: 'No rush… the river is not going anywhere.',
    Explorer: 'What is around the next corner?',
  }[top] || 'Hello Kuching!';
  p.bio = `A ${p.traits.map((t) => t.toLowerCase()).join(', ')} doodle exploring Kuching.`;
  p.source = 'rules';
  return normalizeProfile(p);
}

/** Validate and clamp any profile (from Claude or from the rules). */
export function normalizeProfile(raw = {}) {
  const str = (v, max, dflt) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : dflt);
  return {
    name: str(raw.name, MAX_NAME_LENGTH, 'Doodle'),
    gait: GAITS.includes(raw.gait) ? raw.gait : 'walk',
    speed: clamp(raw.speed, 0.6, 1.8),
    jumpiness: clamp(raw.jumpiness, 0, 1),
    bounce: clamp(raw.bounce, 0, 1),
    sociability: clamp(raw.sociability, 0, 1),
    musicLove: clamp(raw.musicLove, 0, 1),
    ability: ABILITIES.includes(raw.ability) ? raw.ability : 'dash',
    idle: IDLES.includes(raw.idle) ? raw.idle : 'look',
    traits: Array.isArray(raw.traits) ? raw.traits.filter((t) => typeof t === 'string').slice(0, 4).map((t) => t.slice(0, 20)) : [],
    emoji: str(raw.emoji, 8, '✨'),
    catchphrase: str(raw.catchphrase, 80, 'Hello Kuching!'),
    bio: str(raw.bio, 160, 'A doodle exploring Kuching.'),
    source: raw.source === 'ai' ? 'ai' : 'rules',
  };
}
