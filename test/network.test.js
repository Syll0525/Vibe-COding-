import test from 'node:test';
import assert from 'node:assert/strict';
import { io as connect } from 'socket.io-client';
import { createServer } from '../server/index.js';

const once = (sock, ev) => new Promise((r) => sock.once(ev, r));
const call = (sock, ev, data) => new Promise((r) => sock.emit(ev, data, r));

test('display creates a room, phones join, move and chat in real time', async (t) => {
  const { server, close } = createServer({ dataFile: null });
  await new Promise((r) => server.listen(0, r));
  const url = `http://localhost:${server.address().port}`;
  t.after(close);

  const display = connect(url, { transports: ['websocket'] });
  const created = await call(display, 'display:create', {});
  assert.equal(created.ok, true);
  const code = created.state.code;
  assert.match(code, /^[A-Z]{4}$/);

  const phone = connect(url, { transports: ['websocket'] });
  const joinedEvt = once(display, 'player:joined');
  const res = await call(phone, 'player:join', { code, name: 'Tester', profile: { gait: 'zoom', speed: 1.5 }, token: 'tok-1' });
  assert.equal(res.ok, true);
  assert.equal(res.profile.gait, 'zoom');
  assert.equal((await joinedEvt).name, 'Tester');

  const stranger = connect(url, { transports: ['websocket'] });
  const bad = await call(stranger, 'player:join', { code: 'ZZZZ' });
  assert.equal(bad.ok, false);
  stranger.disconnect();

  // move right and watch the snapshot change
  const first = await once(display, 'snap');
  const x0 = first.players.find((p) => p.id === res.id).x;
  phone.emit('input', { mx: 1, my: 0 });
  await new Promise((r) => setTimeout(r, 600));
  const later = await once(display, 'snap');
  const x1 = later.players.find((p) => p.id === res.id).x;
  assert.ok(x1 > x0 + 50, `moved from ${x0} to ${x1}`);

  // chat reaches the display and the phone
  const got = Promise.all([once(display, 'chat'), once(phone, 'chat')]);
  phone.emit('chat', { text: 'Selamat datang!' });
  const [d, p] = await got;
  assert.equal(d.text, 'Selamat datang!');
  assert.equal(p.name, 'Tester');

  // HUD arrives on the phone
  const hud = await once(phone, 'hud');
  assert.equal(typeof hud.score, 'number');

  // reconnecting with the same token keeps the same character
  phone.disconnect();
  const phone2 = connect(url, { transports: ['websocket'] });
  const again = await call(phone2, 'player:join', { code, token: 'tok-1' });
  assert.equal(again.id, res.id);

  for (const s of [display, phone2]) s.disconnect();
});
