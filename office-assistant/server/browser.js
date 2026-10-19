// Drives a real, visible Google Chrome window with Playwright. The office workers use
// these actions to open tabs, search, type and click for the user.
//
// Chrome gets its own profile folder (data/chrome-profile) because a running Chrome
// locks your everyday profile. Log in to sites once in that window and it stays logged in.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const PROFILE_DIR = process.env.CHROME_PROFILE_DIR || path.join(here, '..', 'data', 'chrome-profile');

/** Short names people say → the site they mean. */
export const SITES = {
  google: 'https://www.google.com',
  youtube: 'https://www.youtube.com',
  'youtube studio': 'https://studio.youtube.com',
  gmail: 'https://mail.google.com',
  drive: 'https://drive.google.com',
  'google drive': 'https://drive.google.com',
  docs: 'https://docs.google.com',
  sheets: 'https://sheets.google.com',
  calendar: 'https://calendar.google.com',
  canva: 'https://www.canva.com',
  capcut: 'https://www.capcut.com/editor',
  figma: 'https://www.figma.com',
  instagram: 'https://www.instagram.com',
  facebook: 'https://www.facebook.com',
  'meta business suite': 'https://business.facebook.com',
  'business suite': 'https://business.facebook.com',
  tiktok: 'https://www.tiktok.com',
  'tiktok studio': 'https://www.tiktok.com/tiktokstudio',
  linkedin: 'https://www.linkedin.com',
  x: 'https://x.com',
  twitter: 'https://x.com',
  pinterest: 'https://www.pinterest.com',
  threads: 'https://www.threads.net',
  whatsapp: 'https://web.whatsapp.com',
  chatgpt: 'https://chatgpt.com',
  claude: 'https://claude.ai',
  unsplash: 'https://unsplash.com',
  pexels: 'https://www.pexels.com',
  'google trends': 'https://trends.google.com/trending',
  trends: 'https://trends.google.com/trending',
};

/** Search URL builders for sites that have a search page. */
const SEARCH = {
  google: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}`,
  youtube: (q) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`,
  tiktok: (q) => `https://www.tiktok.com/search?q=${encodeURIComponent(q)}`,
  pinterest: (q) => `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(q)}`,
  instagram: (q) => `https://www.instagram.com/explore/tags/${encodeURIComponent(q.replace(/[#\s]+/g, ''))}/`,
  unsplash: (q) => `https://unsplash.com/s/photos/${encodeURIComponent(q.trim().replace(/\s+/g, '-'))}`,
  pexels: (q) => `https://www.pexels.com/search/${encodeURIComponent(q)}/`,
  canva: (q) => `https://www.canva.com/templates/?query=${encodeURIComponent(q)}`,
  linkedin: (q) => `https://www.linkedin.com/search/results/all/?keywords=${encodeURIComponent(q)}`,
  x: (q) => `https://x.com/search?q=${encodeURIComponent(q)}`,
  twitter: (q) => `https://x.com/search?q=${encodeURIComponent(q)}`,
  'google trends': (q) => `https://trends.google.com/trends/explore?q=${encodeURIComponent(q)}`,
  trends: (q) => `https://trends.google.com/trends/explore?q=${encodeURIComponent(q)}`,
  'google images': (q) => `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(q)}`,
  images: (q) => `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(q)}`,
};
export const SEARCHABLE = Object.keys(SEARCH);

/** "youtube" → site URL, "example.com/x" → https URL, anything else → a Google search. */
export function resolveUrl(target) {
  const t = String(target || '').trim().replace(/^["']|["']$/g, '');
  if (!t) return 'about:blank';
  const key = t.toLowerCase().replace(/\.com$/, '').replace(/\s+(tab|website|site|page)$/, '').trim();
  if (SITES[key]) return SITES[key];
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) return t;
  if (/^(localhost|127\.0\.0\.1)(:\d+)?(\/\S*)?$/i.test(t)) return `http://${t}`;
  if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/\S*)?$/i.test(t)) return `https://${t}`;
  return SEARCH.google(t);
}

export function searchUrl(query, site = 'google') {
  const s = String(site || 'google').toLowerCase().trim();
  return (SEARCH[s] || SEARCH.google)(query);
}

let context = null;
let launching = null;
let active = null;

async function ensureContext() {
  if (context) return context;
  if (launching) return launching;
  const opts = {
    headless: process.env.HEADLESS === '1',
    viewport: null,
    args: ['--start-maximized', '--no-default-browser-check'],
  };
  if (process.env.CHROME_PATH) opts.executablePath = process.env.CHROME_PATH;
  else opts.channel = 'chrome';

  launching = chromium.launchPersistentContext(PROFILE_DIR, opts)
    .then((ctx) => {
      context = ctx;
      ctx.on('page', (p) => { active = p; });
      ctx.on('close', () => { context = null; active = null; });
      active = ctx.pages()[0] || null;
      return ctx;
    })
    .catch((err) => {
      throw new Error(
        'Could not start Google Chrome. Install Chrome from https://www.google.com/chrome, ' +
        'or set CHROME_PATH to your Chrome/Chromium program. (' + String(err.message).split('\n')[0] + ')',
      );
    })
    .finally(() => { launching = null; });
  return launching;
}

async function currentPage() {
  const ctx = await ensureContext();
  const pages = ctx.pages();
  if (active && !active.isClosed() && pages.includes(active)) return active;
  active = pages[pages.length - 1] || await ctx.newPage();
  return active;
}

async function describe(page) {
  let title = '';
  try { title = await page.title(); } catch { /* page still loading */ }
  return { title, url: page.url() };
}

export function browserStatus() {
  return { running: Boolean(context), tabs: context ? context.pages().length : 0 };
}

/** Opens a URL (or site name, or search words) in a new tab and switches to it. */
export async function openTab(target) {
  const ctx = await ensureContext();
  const url = resolveUrl(target);
  // Reuse the blank tab Chrome starts with instead of leaving it empty.
  const blank = ctx.pages().find((p) => p.url() === 'about:blank');
  const page = blank || await ctx.newPage();
  active = page;
  await page.bringToFront();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  } catch (err) {
    return { ok: false, url, error: `Opened the tab but the page did not finish loading: ${String(err.message).split('\n')[0]}` };
  }
  return { ok: true, ...(await describe(page)) };
}

export async function search(query, site = 'google') {
  return openTab(searchUrl(query, site));
}

/** Navigates the current tab instead of opening a new one. */
export async function goTo(target) {
  const page = await currentPage();
  await page.bringToFront();
  await page.goto(resolveUrl(target), { waitUntil: 'domcontentloaded', timeout: 30_000 });
  return { ok: true, ...(await describe(page)) };
}

async function findTextbox(page, target) {
  const candidates = [];
  if (target) {
    candidates.push(
      page.getByPlaceholder(target, { exact: false }),
      page.getByLabel(target, { exact: false }),
      page.getByRole('textbox', { name: target, exact: false }),
      page.getByRole('searchbox', { name: target, exact: false }),
      page.getByRole('combobox', { name: target, exact: false }),
    );
    if (/^[#.[\w-]/.test(target)) candidates.push(page.locator(target));
  }
  candidates.push(page.locator(
    'textarea:visible, input:visible:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=submit]):not([type=button]), [contenteditable="true"]:visible',
  ));
  for (const loc of candidates) {
    try {
      const first = loc.first();
      if (await first.count() && await first.isVisible()) return first;
    } catch { /* invalid selector for this candidate, try the next */ }
  }
  return null;
}

/** Types into the named box, the focused box, or the first text box on the page. */
export async function typeText(text, target = '', { pressEnter = false } = {}) {
  const page = await currentPage();
  await page.bringToFront();
  const focusedIsEditable = !target && await page.evaluate(() => {
    const el = document.activeElement;
    return Boolean(el && (el.isContentEditable || /^(INPUT|TEXTAREA)$/.test(el.tagName)));
  }).catch(() => false);
  if (!focusedIsEditable) {
    const box = await findTextbox(page, target);
    if (!box) return { ok: false, error: `Could not find a text box${target ? ` matching "${target}"` : ''} on ${page.url()}` };
    await box.click({ timeout: 5_000 });
  }
  await page.keyboard.type(String(text), { delay: 25 });
  if (pressEnter) await page.keyboard.press('Enter');
  return { ok: true, typed: String(text), ...(await describe(page)) };
}

export async function pressKey(key) {
  const page = await currentPage();
  const k = String(key).trim().replace(/^enter$/i, 'Enter').replace(/^tab$/i, 'Tab').replace(/^esc(ape)?$/i, 'Escape');
  await page.keyboard.press(k);
  return { ok: true, pressed: k };
}

/** Clicks a button or link by its visible text (or a CSS selector). */
export async function click(target) {
  const page = await currentPage();
  await page.bringToFront();
  const candidates = [
    page.getByRole('button', { name: target, exact: false }),
    page.getByRole('link', { name: target, exact: false }),
    page.getByText(target, { exact: false }),
  ];
  if (/^[#.[\w-]/.test(target)) candidates.push(page.locator(target));
  for (const loc of candidates) {
    try {
      const first = loc.first();
      if (await first.count() && await first.isVisible()) {
        await first.click({ timeout: 5_000 });
        await page.waitForLoadState('domcontentloaded', { timeout: 10_000 }).catch(() => {});
        return { ok: true, clicked: target, ...(await describe(page)) };
      }
    } catch { /* try the next way of finding it */ }
  }
  return { ok: false, error: `Could not find anything to click called "${target}"` };
}

/** Returns the visible text and the main controls of the current tab. */
export async function readPage({ maxChars = 5000 } = {}) {
  const page = await currentPage();
  const data = await page.evaluate((max) => {
    const label = (el) => (el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.innerText || el.value || el.name || '').trim().slice(0, 60);
    const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const controls = [...document.querySelectorAll('input, textarea, button, a[href], [role=button], [contenteditable=true]')]
      .filter(visible).slice(0, 60)
      .map((el) => `${el.tagName.toLowerCase()}${el.type ? `[${el.type}]` : ''}: ${label(el)}`)
      .filter((s) => !s.endsWith(': '));
    return { text: (document.body?.innerText || '').replace(/\n{3,}/g, '\n\n').slice(0, max), controls };
  }, maxChars).catch(() => ({ text: '', controls: [] }));
  return { ok: true, ...(await describe(page)), ...data };
}

export async function listTabs() {
  const ctx = await ensureContext();
  const tabs = [];
  for (const [i, p] of ctx.pages().entries()) tabs.push({ index: i, active: p === active, ...(await describe(p)) });
  return { ok: true, tabs };
}

export async function switchTab(index) {
  const ctx = await ensureContext();
  const page = ctx.pages()[index];
  if (!page) return { ok: false, error: `There is no tab number ${index}` };
  active = page;
  await page.bringToFront();
  return { ok: true, ...(await describe(page)) };
}

export async function closeTab(index) {
  const ctx = await ensureContext();
  const pages = ctx.pages();
  const page = index === undefined || index === null ? await currentPage() : pages[index];
  if (!page) return { ok: false, error: `There is no tab number ${index}` };
  const info = await describe(page);
  await page.close();
  active = ctx.pages().at(-1) || null;
  return { ok: true, closed: info };
}

export async function closeBrowser() {
  if (context) await context.close();
}
