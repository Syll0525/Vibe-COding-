// Socket.IO transport: maps connections to rooms, validates client messages and fans
// room events out to displays (projector) and controllers (phones).

import {
  SNAPSHOT_HZ, MAX_SPRITE_BYTES, MAX_NAME_LENGTH,
} from '../shared/constants.js';
import { normalizeProfile } from './ai/rules.js';

const isSprite = (s) => typeof s === 'string' && s.length <= MAX_SPRITE_BYTES && /^data:image\/(png|webp|jpeg);base64,[A-Za-z0-9+/=]+$/.test(s);
const reply = (ack, data) => { if (typeof ack === 'function') ack(data); };

export function attachNetwork(io, rooms) {
  const wired = new WeakSet();

  function wire(room) {
    if (wired.has(room)) return;
    wired.add(room);
    room.displayCount = 0;
    room.socketsByPlayer = new Map();
    room.on('display', (event, payload) => io.to(`d:${room.code}`).emit(event, payload));
    room.on('all', (event, payload) => io.to(`d:${room.code}`).to(`p:${room.code}`).emit(event, payload));
    room.on('player', (id, event, payload) => {
      const sid = room.socketsByPlayer.get(id);
      if (sid) io.to(sid).emit(event, payload);
    });
  }

  // Broadcast world snapshots to displays and HUD updates to phones
  let hudTick = 0;
  const timer = setInterval(() => {
    hudTick++;
    for (const room of rooms.rooms.values()) {
      wire(room);
      if (room.displayCount > 0) io.to(`d:${room.code}`).volatile.emit('snap', room.snapshot());
      if (hudTick % 4 === 0) {
        for (const [id, sid] of room.socketsByPlayer) {
          const p = room.players.get(id);
          const hud = p && room.hudFor(p);
          if (hud) io.to(sid).emit('hud', hud);
        }
      }
    }
  }, 1000 / SNAPSHOT_HZ);

  io.on('connection', (socket) => {
    let role = null;       // 'display' | 'player'
    let room = null;
    let playerId = null;

    // ---------------------------------------------------------- display (projector)
    const watch = (r) => {
      if (role === 'display' && room) { room.displayCount--; socket.leave(`d:${room.code}`); }
      wire(r);
      role = 'display'; room = r;
      r.displayCount++;
      socket.join(`d:${r.code}`);
      return r.fullState();
    };

    socket.on('display:create', (_, ack) => {
      const r = rooms.create();
      reply(ack, { ok: true, state: watch(r) });
    });

    socket.on('display:watch', ({ code } = {}, ack) => {
      const r = rooms.get(code);
      if (!r) return reply(ack, { ok: false, error: 'Room not found' });
      reply(ack, { ok: true, state: watch(r) });
    });

    socket.on('host:bots', ({ action } = {}) => {
      if (role !== 'display' || !room) return;
      if (action === 'add' && room.canJoin()) room.addBot();
      if (action === 'clear') room.removeBots();
    });

    socket.on('host:event', ({ kind } = {}) => {
      if (role !== 'display' || !room || room.event) return;
      room.startEvent(kind === 'danceoff' ? 'danceoff' : 'rush');
    });

    // ---------------------------------------------------------- player (phone)
    socket.on('player:join', ({ code, name, sprite, profile, token } = {}, ack) => {
      const r = rooms.get(code);
      if (!r) return reply(ack, { ok: false, error: 'Room not found. Check the code on the big screen.' });
      wire(r);
      let p = r.findByToken(typeof token === 'string' ? token : null);
      if (p) {
        r.reconnect(p.id);
      } else {
        if (!r.canJoin()) return reply(ack, { ok: false, error: 'This world is full right now!' });
        const safeName = String(name ?? '').slice(0, MAX_NAME_LENGTH);
        p = r.addPlayer({
          name: safeName, sprite: isSprite(sprite) ? sprite : null,
          profile: profile ? normalizeProfile(profile) : null,
          token: typeof token === 'string' ? token.slice(0, 64) : null,
        });
      }
      role = 'player'; room = r; playerId = p.id;
      r.socketsByPlayer.set(p.id, socket.id);
      socket.join(`p:${r.code}`);
      p.hud = '';
      reply(ack, { ok: true, id: p.id, color: p.color, name: p.name, profile: p.profile,
        chat: r.chatLog.slice(-20), event: r.publicEvent(), wallet: r.wallet(p) });
    });

    const mine = () => (role === 'player' && room && room.players.has(playerId) ? room : null);

    socket.on('input', (msg) => { mine()?.handleInput(playerId, msg); });

    // homes + shop
    socket.on('home:get', (_, ack) => {
      const r = mine();
      reply(ack, r ? { ok: true, ...r.wallet(r.players.get(playerId)) } : { ok: false, error: 'Not in the game' });
    });
    socket.on('shop:buy', ({ item } = {}, ack) => {
      const r = mine();
      reply(ack, r ? r.buy(playerId, String(item ?? '')) : { ok: false, error: 'Not in the game' });
    });
    socket.on('home:save', ({ home } = {}, ack) => {
      const r = mine();
      reply(ack, r ? r.setHome(playerId, home) : { ok: false, error: 'Not in the game' });
    });
    socket.on('home:go', (_, ack) => { reply(ack, { ok: Boolean(mine()?.goHome(playerId)) }); });

    // mini-games
    socket.on('game:join', ({ kind } = {}, ack) => {
      const r = mine();
      reply(ack, r ? r.joinRace(playerId, kind) : { ok: false, error: 'Not in the game' });
    });
    socket.on('quiz:start', (_, ack) => {
      const r = mine();
      reply(ack, r ? r.startQuiz(playerId) : { ok: false, error: 'Not in the game' });
    });
    socket.on('quiz:answer', ({ choice } = {}, ack) => {
      const r = mine();
      reply(ack, r ? r.answerQuiz(playerId, choice) : { ok: false, error: 'Not in the game' });
    });
    socket.on('action', (msg) => { mine()?.handleAction(playerId, msg); });
    socket.on('chat', ({ text } = {}) => { mine()?.handleChat(playerId, text); });

    socket.on('player:leave', () => {
      const r = mine();
      if (!r) return;
      r.socketsByPlayer.delete(playerId);
      r.removePlayer(playerId);
      playerId = null;
    });

    socket.on('disconnect', () => {
      if (role === 'display' && room) room.displayCount = Math.max(0, room.displayCount - 1);
      if (role === 'player' && room && playerId) {
        if (room.socketsByPlayer.get(playerId) === socket.id) {
          room.socketsByPlayer.delete(playerId);
          room.disconnect(playerId);
        }
      }
    });
  });

  return { stop: () => clearInterval(timer) };
}
