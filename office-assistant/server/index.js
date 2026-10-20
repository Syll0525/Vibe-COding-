// Office Assistant server. Serves the office UI and gives the workers their skills:
// Chrome control, social media design copy and video edit plans.
//
// It listens on this computer only (127.0.0.1) because it can drive your browser.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { runTask, aiEnabled } from './agent.js';
import { createDesigns, createVideoPlan, PLATFORMS } from './marketing.js';
import { browserStatus, closeBrowser } from './browser.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 4100;
const HOST = process.env.HOST || '127.0.0.1';

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(here, '..', 'public')));
app.use('/vendor/three', express.static(path.join(here, '..', 'node_modules', 'three')));

app.get('/api/status', (_req, res) => {
  res.json({ ai: aiEnabled(), browser: browserStatus(), platforms: PLATFORMS });
});

// Runs a Chrome task and streams progress back as newline-delimited JSON.
let busy = false;
app.post('/api/task', async (req, res) => {
  const command = String(req.body?.command || '').trim();
  if (!command) return res.status(400).json({ error: 'command is required' });
  if (busy) return res.status(409).json({ error: 'Maya is still working on the last task. Give her a moment.' });
  busy = true;
  res.setHeader('Content-Type', 'application/x-ndjson');
  const send = (obj) => res.write(JSON.stringify(obj) + '\n');
  try {
    const result = await runTask(command, (entry) => send({ type: 'step', ...entry }));
    send({ type: 'done', ...result });
  } catch (err) {
    send({ type: 'done', ok: false, summary: err.message, log: [] });
  } finally {
    busy = false;
    res.end();
  }
});

app.post('/api/marketing/designs', async (req, res) => {
  res.json(await createDesigns(req.body || {}));
});

app.post('/api/marketing/video-plan', async (req, res) => {
  res.json(await createVideoPlan(req.body || {}));
});

const server = app.listen(PORT, HOST, () => {
  console.log(`\n  🏢 Office Assistant is open at http://localhost:${PORT}`);
  console.log(aiEnabled()
    ? '  🤖 Claude is connected: Maya can plan tasks and write copy.'
    : '  ℹ️  No ANTHROPIC_API_KEY: Maya uses built-in rules and templates (still works offline).');
});

async function shutdown() {
  await closeBrowser().catch(() => {});
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
