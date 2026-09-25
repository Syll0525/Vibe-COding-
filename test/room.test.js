import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../server/game/Room.js';
import { ruleProfile } from '../server/ai/rules.js';
import { TILE } from '../shared/constants.js';
import { riverTop, buildInteractables, HIDDEN_CATS, tileCenter } from '../shared/map.js';

const seeded = () => { let s = 1; return () => ((s = (s * 16807) % 2147483647) / 2147483647); };
const run = (room, secs) => { for (let i = 0; i < secs * 30; i++) room.tick(1 / 30); };

test('players move with input and are stopped by the river', () => {
  const room = new Room('TEST', { rand: seeded() });
  const p = room.addPlayer({ name: 'Walker', profile: ruleProfile('') });
  p.profile.jumpiness = 0;
  p.x = 10 * TILE; p.y = 22 * TILE;
  room.handleInput(p.id, { mx: 0, my: -1 });  // walk north into the river
  run(room, 3);
  const riverBottom = (riverTop(10) + 5) * TILE;
  assert.ok(p.y >= riverBottom, `stayed on land (y=${p.y}, river bottom=${riverBottom})`);
  assert.ok(p.y < 22 * TILE, 'moved at least a bit');
});

test('robots only move in four directions', () => {
  const room = new Room('TEST', { rand: seeded() });
  const p = room.addPlayer({ name: 'Robo', profile: ruleProfile('walks like a robot') });
  p.x = 22 * TILE; p.y = 30.5 * TILE;
  room.handleInput(p.id, { mx: 0.8, my: 0.5 });
  run(room, 0.5);
  assert.ok(Math.abs(p.y - 30.5 * TILE) < 0.001, 'no vertical drift');
  assert.ok(p.x > 23 * TILE);
});

test('fast characters are faster', () => {
  const room = new Room('TEST', { rand: seeded() });
  const slow = room.addPlayer({ name: 'Slow', profile: { ...ruleProfile('slow and lazy'), jumpiness: 0 } });
  const fast = room.addPlayer({ name: 'Fast', profile: { ...ruleProfile('moves very fast'), jumpiness: 0 } });
  for (const p of [slow, fast]) { p.x = 2 * TILE; p.y = (p === slow ? 38.5 : 38.5) * TILE; }
  fast.y = 26.5 * TILE; slow.y = 27.5 * TILE;
  room.handleInput(slow.id, { mx: 1, my: 0 });
  room.handleInput(fast.id, { mx: 1, my: 0 });
  run(room, 1);
  assert.ok(fast.x - 2 * TILE > (slow.x - 2 * TILE) * 1.5, `fast ${fast.x} vs slow ${slow.x}`);
});

test('collecting food scores points', () => {
  const room = new Room('TEST', { rand: seeded() });
  const p = room.addPlayer({ name: 'Foodie' });
  room.items.clear();
  room.items.set('x', { id: 'x', type: 'laksa', x: p.x, y: p.y });
  room.tick(1 / 30);
  assert.equal(room.items.has('x'), false);
  assert.equal(p.score, 20);
});

test('high-five makes friends, and sampan ferries across the river', () => {
  const room = new Room('TEST', { rand: seeded() });
  const a = room.addPlayer({ name: 'A' });
  const b = room.addPlayer({ name: 'B' });
  a.x = 5 * TILE; a.y = 32 * TILE; b.x = a.x + 30; b.y = a.y;
  const fx = [];
  room.on('display', (ev, data) => fx.push(data?.type));
  room.handleAction(a.id, { type: 'interact' });
  assert.ok(a.friends.has(b.id) && b.friends.has(a.id));
  assert.ok(fx.includes('friend'));

  const jetty = buildInteractables().find((i) => i.id === 'jetty-w-s');
  const north = buildInteractables().find((i) => i.id === 'jetty-w-n');
  a.x = jetty.x; a.y = jetty.y; b.x = 50 * TILE;
  room.handleAction(a.id, { type: 'interact' });
  assert.ok(a.ride, 'riding');
  run(room, 3);
  assert.equal(a.ride, null);
  assert.ok(Math.abs(a.y - north.y) < 1, 'arrived at the north jetty');
});

test('finding a hidden cat', () => {
  const room = new Room('TEST', { rand: seeded() });
  const p = room.addPlayer({ name: 'Cat fan' });
  const c = tileCenter(HIDDEN_CATS[0].tx, HIDDEN_CATS[0].ty);
  p.x = c.x; p.y = c.y;
  assert.match(room.interactionFor(p).label, /cat/i);
  room.handleAction(p.id, { type: 'interact' });
  assert.equal(p.cats.size, 1);
  assert.equal(p.score, 50);
});

test('chat is sanitised and rate limited', () => {
  const room = new Room('TEST');
  const p = room.addPlayer({ name: 'Chatty' });
  const msgs = [];
  room.on('all', (ev, m) => ev === 'chat' && msgs.push(m));
  assert.equal(room.handleChat(p.id, '  hello\n\u0000world  '), true);
  assert.equal(room.handleChat(p.id, 'spam'), false);
  assert.equal(msgs[0].text, 'hello world');
});

test('mini-game round runs and crowns a winner', () => {
  const room = new Room('TEST', { rand: seeded() });
  const p = room.addPlayer({ name: 'Racer' });
  const events = [];
  room.on('all', (ev, e) => ev === 'event' && events.push(e));
  room.startEvent('rush', 2);
  room.items.set('y', { id: 'y', type: 'kolomee', x: p.x, y: p.y });
  run(room, 2.2);
  assert.deepEqual(events.map((e) => e.state), ['start', 'end']);
  assert.equal(events[1].ranking[0].id, p.id);
});

test('bots wander without getting stuck', () => {
  const room = new Room('TEST', { rand: seeded() });
  const bot = room.addBot();
  const start = { x: bot.x, y: bot.y };
  run(room, 6);
  assert.ok(Math.hypot(bot.x - start.x, bot.y - start.y) > 40);
  assert.ok(room.snapshot().players.length === 1);
});
