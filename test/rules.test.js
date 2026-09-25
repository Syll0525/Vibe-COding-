import test from 'node:test';
import assert from 'node:assert/strict';
import { ruleProfile, normalizeProfile } from '../server/ai/rules.js';
import { designCharacter } from '../server/ai/personality.js';

test('robot description gives a robot gait', () => {
  assert.equal(ruleProfile('walks like a robot').gait, 'robot');
});

test('first-mentioned movement wins', () => {
  assert.equal(ruleProfile('walks like a robot and likes to dance').gait, 'robot');
  assert.equal(ruleProfile('likes to dance, walks like a robot').gait, 'dance');
});

test('"moves very fast" means high speed and dash', () => {
  const p = ruleProfile('moves very fast');
  assert.ok(p.speed >= 1.5, `speed ${p.speed}`);
  assert.equal(p.ability, 'dash');
  assert.equal(p.gait, 'zoom');
});

test('jumps a lot → jumpy; friends → sociable; music → music lover', () => {
  assert.ok(ruleProfile('jumps a lot').jumpiness >= 0.6);
  assert.ok(ruleProfile('likes to make friends').sociability >= 0.8);
  const m = ruleProfile('they like music');
  assert.ok(m.musicLove >= 0.8);
  assert.equal(m.ability, 'boombox');
});

test('keeps a given name and invents one otherwise', () => {
  assert.equal(ruleProfile('', 'Ah Meng').name, 'Ah Meng');
  assert.ok(ruleProfile('').name.length > 0);
});

test('normalizeProfile clamps and rejects bad values', () => {
  const p = normalizeProfile({ speed: 99, gait: 'teleport', ability: 'laser', jumpiness: -3, traits: [1, 'ok'], name: '' });
  assert.equal(p.speed, 1.8);
  assert.equal(p.gait, 'walk');
  assert.equal(p.ability, 'dash');
  assert.equal(p.jumpiness, 0);
  assert.deepEqual(p.traits, ['ok']);
  assert.equal(p.name, 'Doodle');
});

test('designCharacter works offline without an API key', async () => {
  const saved = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  const p = await designCharacter({ description: 'hops like a frog', name: 'Froggy' });
  assert.equal(p.source, 'rules');
  assert.equal(p.gait, 'hop');
  assert.equal(p.name, 'Froggy');
  if (saved) process.env.ANTHROPIC_API_KEY = saved;
});
