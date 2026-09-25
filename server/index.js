// Draw Kuching server: serves the display + controller web apps, the AI character
// endpoint, and the real-time game over Socket.IO.

import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import QRCode from 'qrcode';
import { RoomManager } from './rooms.js';
import { Store } from './store.js';
import { attachNetwork } from './net.js';
import { designCharacter, aiEnabled } from './ai/personality.js';
import { MAX_SPRITE_BYTES } from '../shared/constants.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 3000;

export function createServer({ dataFile = process.env.DATA_FILE ?? path.join(root, 'data', 'save.json') } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: `${Math.ceil(MAX_SPRITE_BYTES / 1000) + 50}kb` }));
  app.use(express.static(path.join(root, 'public'), { extensions: ['html'] }));
  app.use('/shared', express.static(path.join(root, 'shared')));
  // Three.js served locally so the projector works without internet
  app.use('/vendor/three', express.static(path.join(root, 'node_modules', 'three', 'build')));

  // LAN addresses so the projector can show a QR code phones can actually reach
  app.get('/api/info', (_req, res) => {
    const ips = Object.values(os.networkInterfaces()).flat()
      .filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
    res.json({ ips, port: PORT, ai: aiEnabled(), https: Boolean(useHttps) });
  });

  app.get('/api/qr', async (req, res) => {
    const text = String(req.query.text || '').slice(0, 300);
    if (!text) return res.status(400).end();
    const svg = await QRCode.toString(text, { type: 'svg', margin: 1, color: { dark: '#1b1b2f', light: '#ffffff' } });
    res.type('image/svg+xml').send(svg);
  });

  // Tiny per-IP rate limit for the AI endpoint (it can cost money)
  const hits = new Map();
  app.post('/api/character', async (req, res) => {
    const ip = req.ip || 'x';
    const now = Date.now();
    const recent = (hits.get(ip) || []).filter((t) => now - t < 60_000);
    if (recent.length >= 12) return res.status(429).json({ error: 'Too many requests, wait a moment.' });
    recent.push(now); hits.set(ip, recent);

    const { description = '', name = '', sprite = null } = req.body || {};
    const profile = await designCharacter({
      description: String(description), name: String(name),
      sprite: typeof sprite === 'string' && sprite.length <= MAX_SPRITE_BYTES ? sprite : null,
    });
    res.json({ profile });
  });

  const useHttps = process.env.HTTPS_KEY && process.env.HTTPS_CERT;
  const server = useHttps
    ? https.createServer({ key: fs.readFileSync(process.env.HTTPS_KEY), cert: fs.readFileSync(process.env.HTTPS_CERT) }, app)
    : http.createServer(app);
  const io = new Server(server, { maxHttpBufferSize: MAX_SPRITE_BYTES + 20_000, cors: { origin: false } });
  const store = new Store(dataFile);
  const rooms = new RoomManager({ store });
  rooms.start();
  const net = attachNetwork(io, rooms);
  const close = () => new Promise((resolve) => { net.stop(); rooms.stop(); store.flush(); io.close(() => resolve()); });
  return { app, server, io, rooms, store, close };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { server } = createServer();
  server.listen(PORT, () => {
    const proto = process.env.HTTPS_KEY ? 'https' : 'http';
    const ips = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal);
    console.log(`\n  🐱 Draw Kuching is running!\n`);
    console.log(`  Big screen / projector:  ${proto}://localhost:${PORT}/display`);
    for (const i of ips) console.log(`  Phones on your Wi-Fi:    ${proto}://${i.address}:${PORT}/play`);
    console.log(`  AI character design:     ${aiEnabled() ? 'Claude (ANTHROPIC_API_KEY found)' : 'offline rules (set ANTHROPIC_API_KEY to enable Claude)'}\n`);
  });
}
