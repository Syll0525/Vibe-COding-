import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Room } from '../server/game/Room.js';
import { Store } from '../server/store.js';
import { START_COINS, ITEMS, validateHome, defaultHome } from '../shared/catalog.js';
import { TRACKS, PLOTS, isBlocked } from '../shared/map.js';
import { TILE } from '../shared/constants.js';
import { DISHES } from '../server/game/foodQuiz.js';

const seeded = () => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); };
const run = (room, secs) => { for (let i = 0; i < secs * 30; i++) room.tick(1 / 30); };

test('new players get starting coins and a home plot', () => {
  const room = new Room('T', { rand: seeded() });
  const p = room.addPlayer({ name: 'Ah Kow', token: 't1' });
  assert.equal(p.coins, START_COINS);
  assert.equal(p.plot, 0);
  assert.equal(room.fullState().homes[0].name, 'Ah Kow');
  const bot = room.addBot();
  assert.equal(bot.plot, null, 'bots do not take plots');
});

test('buying items and houses spends coins and fails when broke', () => {
  const room = new Room('T');
  const p = room.addPlayer({ name: 'Shopper' });
  const res = room.buy(p.id, 'sofa');
  assert.equal(res.ok, true);
  assert.equal(p.coins, START_COINS - ITEMS.sofa.price);
  assert.equal(p.owned.sofa, 1);
  assert.equal(room.buy(p.id, 'house:longhouse').ok, false, 'too expensive');
  p.coins = 1000;
  assert.equal(room.buy(p.id, 'house:longhouse').ok, true);
  assert.equal(room.buy(p.id, 'house:longhouse').ok, false, 'cannot buy a house twice');
  assert.equal(room.buy(p.id, 'house:kampung').ok, false, 'free house cannot be bought');
  assert.equal(room.buy(p.id, 'spaceship').ok, false);
});

test('home layouts are validated against ownership and zones', () => {
  const owned = { sofa: 1, flowers: 2 };
  assert.equal(validateHome({ ...defaultHome(), items: [{ id: 'sofa', c: 0, r: 0 }] }, owned).ok, true);
  assert.equal(validateHome({ ...defaultHome(), items: [{ id: 'sofa', c: 0, r: 4 }] }, owned).ok, false, 'sofa in garden');
  assert.equal(validateHome({ ...defaultHome(), items: [{ id: 'flowers', c: 0, r: 1 }] }, owned).ok, false, 'flowers indoors');
  assert.equal(validateHome({ ...defaultHome(), items: [{ id: 'sofa', c: 0, r: 0 }, { id: 'sofa', c: 1, r: 0 }] }, owned).ok, false, 'owns one sofa');
  assert.equal(validateHome({ ...defaultHome(), items: [{ id: 'flowers', c: 0, r: 3 }, { id: 'flowers', c: 0, r: 3 }] }, owned).ok, false, 'same cell');
  assert.equal(validateHome({ ...defaultHome(), style: 'modern' }, owned).ok, false, 'house not owned');
  assert.equal(validateHome({ ...defaultHome(), style: 'modern' }, { 'house:modern': 1 }).ok, true);
});

test('setHome broadcasts to displays; goHome teleports to the plot', () => {
  const room = new Room('T');
  const p = room.addPlayer({ name: 'Decorator' });
  room.buy(p.id, 'tv');
  const events = [];
  room.on('display', (ev, data) => ev === 'home' && events.push(data));
  const res = room.setHome(p.id, { style: 'kampung', wall: '#f8a5c2', roof: '#2e86de', items: [{ id: 'tv', c: 2, r: 1, rot: 1 }] });
  assert.equal(res.ok, true);
  assert.equal(events.at(-1).home.items[0].id, 'tv');
  assert.equal(room.goHome(p.id), true);
  const plot = PLOTS[p.plot];
  assert.ok(p.x > plot.x * TILE && p.x < (plot.x + plot.w) * TILE);
  assert.equal(isBlocked(p.x, p.y), false);
});

test('progress survives a reconnect through the store', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dk-')), 'save.json');
  const store = new Store(file);
  const room = new Room('T', { store });
  const p = room.addPlayer({ name: 'Saver', token: 'tok' });
  room.reward(p, 100);
  room.buy(p.id, 'bed');
  room.setHome(p.id, { ...defaultHome(), items: [{ id: 'bed', c: 0, r: 0 }] });
  room.removePlayer(p.id);
  store.flush();

  const room2 = new Room('U', { store: new Store(file) });
  const again = room2.addPlayer({ name: 'Saver', token: 'tok' });
  assert.equal(again.coins, START_COINS + 100 - ITEMS.bed.price);
  assert.equal(again.home.items[0].id, 'bed');
});

test('kart race: lobby → countdown → racing → prizes', () => {
  const room = new Room('T', { rand: seeded() });
  const a = room.addPlayer({ name: 'Racer A' });
  const b = room.addPlayer({ name: 'Racer B' });
  assert.equal(room.joinRace(a.id, 'kart').ok, true);
  assert.equal(room.joinRace(b.id, 'kart').ok, true);
  assert.equal(room.joinRace(a.id, 'kart').ok, false, 'already in');
  const race = room.races.kart;
  run(room, 16);
  assert.equal(race.state, 'countdown');
  assert.equal(a.vehicle, 'kart');
  assert.ok(a.frozen);
  run(room, 3.2);
  assert.equal(race.state, 'running');
  // teleport A through every checkpoint for both laps
  const before = a.coins;
  for (let lap = 0; lap < TRACKS.kart.laps; lap++) {
    for (const cp of TRACKS.kart.checkpoints) { a.x = cp.x * TILE; a.y = cp.y * TILE; room.tick(1 / 30); }
  }
  assert.equal(race.racers.get(a.id).finished, true);
  assert.equal(a.coins, before + 60 + 10, 'winner prize');
  assert.equal(a.vehicle, null);
  const results = [];
  room.on('all', (ev, d) => ev === 'race' && results.push(d));
  run(room, 101);
  assert.equal(results.at(-1).state, 'done');
  assert.equal(room.races.kart, null);
  assert.equal(b.vehicle, null, 'released at the end');
});

test('sampan race: paddling moves the boat and finishers are put ashore', () => {
  const room = new Room('T', { rand: seeded() });
  const p = room.addPlayer({ name: 'Paddler' });
  room.joinRace(p.id, 'boat');
  run(room, 15.2 + 3.2);
  assert.equal(room.races.boat.state, 'running');
  const x0 = p.x;
  for (let i = 0; i < 30; i++) { room.handleAction(p.id, { type: 'interact' }); run(room, 0.2); }
  assert.ok(p.x > x0 + 300, `paddled from ${x0} to ${p.x}`);
  for (const cp of TRACKS.boat.checkpoints) { p.x = cp.x * TILE; p.y = cp.y * TILE; room.tick(1 / 30); }
  assert.equal(p.vehicle, null);
  assert.equal(isBlocked(p.x, p.y), false, 'standing on land after the race');
});

test('bots join races and drive the kart route', () => {
  const room = new Room('T', { rand: seeded() });
  const p = room.addPlayer({ name: 'Human' });
  for (let i = 0; i < 4; i++) room.addBot();
  room.joinRace(p.id, 'kart');
  const race = room.races.kart;
  assert.ok(race.racers.size > 1, 'some bots joined');
  run(room, 15.2 + 3.2 + 25);
  const bots = [...race.racers.entries()].filter(([id]) => room.players.get(id)?.bot);
  assert.ok(bots.some(([, r]) => r.cp >= 2 || r.lap > 1 || r.finished), 'a bot made progress round the track');
});

test('food quiz: 5 questions, coins for correct answers, perfect bonus', () => {
  const room = new Room('T', { rand: seeded() });
  const p = room.addPlayer({ name: 'Foodie' });
  const start = room.startQuiz(p.id);
  assert.equal(start.ok, true);
  let q = start.question;
  assert.equal(q.choices.length, 4);
  let res;
  const coins0 = p.coins;
  for (let i = 0; i < 5; i++) {
    const dish = DISHES.find((d) => d.clue === q.clue);
    res = room.answerQuiz(p.id, q.choices.indexOf(dish.name));
    assert.equal(res.correct, true);
    q = res.next;
  }
  assert.deepEqual(res.summary, { correct: 5, total: 5, coins: 55 });
  assert.equal(p.coins, coins0 + 55);
  assert.equal(room.startQuiz(p.id).ok, false, 'cooldown');
});

test('coins from cats, friends and snacks', () => {
  const room = new Room('T', { rand: seeded() });
  const a = room.addPlayer({ name: 'A' });
  const b = room.addPlayer({ name: 'B' });
  a.x = 5 * TILE; a.y = 32 * TILE; b.x = a.x + 30; b.y = a.y;
  const c0 = a.coins;
  room.handleAction(a.id, { type: 'interact' });
  assert.equal(a.coins, c0 + 15, 'new friend bonus');
  room.items.clear();
  room.items.set('z', { id: 'z', type: 'laksa', x: a.x, y: a.y });
  room.tick(1 / 30);
  assert.equal(a.coins, c0 + 20);
  assert.match(room.hudFor(a).catHint, /Hot|Warm|Cold|Freezing|here/);
});
