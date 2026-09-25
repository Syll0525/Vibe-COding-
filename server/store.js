// Tiny persistent key-value store for player progress (coins, home, collections),
// keyed by the random token each phone keeps in localStorage. A JSON file is
// plenty for a party game; swap for SQLite/Redis when hosting many rooms.

import fs from 'node:fs';
import path from 'node:path';

export class Store {
  /** @param {string|null} file  JSON file path, or null for memory only (tests) */
  constructor(file = null) {
    this.file = file;
    this.data = {};
    this.timer = null;
    if (file) {
      try { this.data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { this.data = {}; }
    }
  }

  get(token) { return token ? this.data[token] ?? null : null; }

  set(token, record) {
    if (!token) return;
    this.data[token] = { ...record, updatedAt: Date.now() };
    this.scheduleSave();
  }

  scheduleSave() {
    if (!this.file || this.timer) return;
    this.timer = setTimeout(() => this.flush(), 1000);
    this.timer.unref?.();
  }

  flush() {
    clearTimeout(this.timer);
    this.timer = null;
    if (!this.file) return;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data));
    fs.renameSync(tmp, this.file);
  }
}
