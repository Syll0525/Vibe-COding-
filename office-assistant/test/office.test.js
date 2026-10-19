import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCommand } from '../server/agent.js';
import { resolveUrl, searchUrl } from '../server/browser.js';
import { templateDesigns, templateVideoPlan, LAYOUTS } from '../server/marketing.js';

test('resolveUrl understands site names, domains, URLs and search words', () => {
  assert.equal(resolveUrl('youtube'), 'https://www.youtube.com');
  assert.equal(resolveUrl('Canva'), 'https://www.canva.com');
  assert.equal(resolveUrl('instagram.com'), 'https://www.instagram.com');
  assert.equal(resolveUrl('example.org/page'), 'https://example.org/page');
  assert.equal(resolveUrl('https://a.b/c'), 'https://a.b/c');
  assert.equal(resolveUrl('localhost:3000'), 'http://localhost:3000');
  assert.match(resolveUrl('best coffee in town'), /google\.com\/search\?q=best%20coffee/);
});

test('searchUrl builds site searches and falls back to Google', () => {
  assert.equal(searchUrl('latte art', 'youtube'), 'https://www.youtube.com/results?search_query=latte%20art');
  assert.match(searchUrl('x', 'nowhere'), /google\.com\/search/);
});

test('parseCommand opens several tabs from one sentence', () => {
  const steps = parseCommand('open canva, capcut and instagram tabs');
  assert.deepEqual(steps.map((s) => s.args.target), ['canva', 'capcut', 'instagram']);
  assert.ok(steps.every((s) => s.action === 'open'));
});

test('parseCommand chains open, search, type and press', () => {
  const steps = parseCommand('open youtube then search tiktok for trending sounds, type hello world into search and press enter');
  assert.deepEqual(steps, [
    { action: 'open', args: { target: 'youtube' } },
    { action: 'search', args: { query: 'trending sounds', site: 'tiktok' } },
    { action: 'type', args: { text: 'hello world', target: 'search', pressEnter: false } },
    { action: 'press', args: { key: 'enter' } },
  ]);
});

test('parseCommand handles "search X on Y" and unknown sites', () => {
  assert.deepEqual(parseCommand('search latte art on pinterest'), [{ action: 'search', args: { query: 'latte art', site: 'pinterest' } }]);
  assert.deepEqual(parseCommand('search shoes on myshop'), [{ action: 'search', args: { query: 'shoes myshop', site: 'google' } }]);
  assert.deepEqual(parseCommand('type "50% off" and press enter'), [
    { action: 'type', args: { text: '50% off', target: '', pressEnter: false } },
    { action: 'press', args: { key: 'enter' } },
  ]);
});

test('template designs give three complete concepts', () => {
  const { designs, source } = templateDesigns({ brief: 'Weekend sale 20% off iced lattes', brand: 'Kopi Corner' });
  assert.equal(source, 'templates');
  assert.equal(designs.length, 3);
  for (const d of designs) {
    assert.ok(d.headline && d.subheadline && d.cta && d.caption);
    assert.ok(LAYOUTS.includes(d.layout));
    assert.match(d.palette.bg, /^#[0-9a-f]{6}$/i);
    assert.ok(d.hashtags.every((h) => h.startsWith('#')));
  }
  assert.equal(designs[0].emoji, '🔥');
});

test('template video plan fits overlays inside the clip', () => {
  const plan = templateVideoPlan({ brief: 'new matcha launch', duration: 12 });
  assert.ok(plan.overlays.length >= 3);
  for (const o of plan.overlays) { assert.ok(o.start >= 0 && o.end <= 12 && o.end > o.start); }
});
