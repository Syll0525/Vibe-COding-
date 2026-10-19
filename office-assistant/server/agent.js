// Turns a plain-English task ("open canva and instagram, then search youtube for reel ideas")
// into Chrome actions. With an Anthropic API key, Claude plans and runs the steps itself and
// can read pages as it goes. Without one, a rule parser handles the common commands so the
// office still works offline.

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod';
import * as browser from './browser.js';

const MODEL = process.env.CLAUDE_MODEL || 'claude-opus-5-5';

export function aiEnabled() { return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN); }

let client = null;
function getClient() {
  if (!client) client = new Anthropic({ timeout: 120_000, maxRetries: 1 });
  return client;
}

// ---------------------------------------------------------------------------
// Rule-based parser (no API key needed)
// ---------------------------------------------------------------------------

const VERBS = 'open|go to|goto|visit|launch|navigate to|search|google|look up|find|type|write|enter|press|hit|click|close|read|list';
const STEP_SPLIT = new RegExp(`\\s*(?:,|;|\\.|\\bthen\\b|\\band\\b)\\s*(?=(?:then\\s+|and\\s+)?(?:${VERBS})\\b)`, 'i');

/** Splits "open x, y and z" into ["x","y","z"]. */
function splitTargets(s) {
  return s.split(/\s*(?:,|&|\+|\band\b)\s*/i).map((t) => t.replace(/^(the|my|a|new)\s+/i, '').replace(/\s+(tabs?|websites?|sites?|pages?)$/i, '').trim()).filter(Boolean);
}

/**
 * @param {string} command
 * @returns {{action:string, args:object}[]}
 */
export function parseCommand(command) {
  const text = String(command || '').trim().replace(/^(please|can you|could you|hey maya,?|maya,?)\s+/i, '');
  if (!text) return [];
  const parts = text.split(STEP_SPLIT).map((s) => s.replace(/^(then|and)\s+/i, '').trim()).filter(Boolean);
  const steps = [];
  for (const part of parts) {
    let m;
    if ((m = part.match(/^(?:search|google|look up|find)\s+(?:for\s+)?(.+?)(?:\s+(?:on|in|at)\s+([\w\s]+?))?$/i))) {
      let [, query, site] = m;
      // "search youtube for x" form
      const lead = query.match(/^([\w\s]+?)\s+for\s+(.+)$/i);
      if (!site && lead && browser.SEARCHABLE.includes(lead[1].toLowerCase())) { site = lead[1]; query = lead[2]; }
      if (site && !browser.SEARCHABLE.includes(site.toLowerCase())) { query = `${query} ${site}`; site = 'google'; }
      steps.push({ action: 'search', args: { query: query.replace(/^["']|["']$/g, ''), site: (site || 'google').toLowerCase() } });
    } else if ((m = part.match(/^(?:type|write|enter)\s+["“]?(.+?)["”]?(?:\s+(?:in|into|on)\s+(?:the\s+)?(.+?))?$/i))) {
      steps.push({ action: 'type', args: { text: m[1], target: (m[2] || '').replace(/\s+(box|field|bar)$/i, '').trim(), pressEnter: false } });
    } else if ((m = part.match(/^(?:press|hit)\s+(?:the\s+)?(.+?)(?:\s+key)?$/i))) {
      steps.push({ action: 'press', args: { key: m[1] } });
    } else if ((m = part.match(/^click\s+(?:on\s+)?(?:the\s+)?["“]?(.+?)["”]?(?:\s+(?:button|link))?$/i))) {
      steps.push({ action: 'click', args: { target: m[1] } });
    } else if (/^close(\s+(the|this|current))?\s+tab$/i.test(part)) {
      steps.push({ action: 'close', args: {} });
    } else if (/^(list|show)\s+(my\s+|the\s+)?tabs$/i.test(part)) {
      steps.push({ action: 'tabs', args: {} });
    } else if (/^read(\s+(the|this))?\s+page$/i.test(part)) {
      steps.push({ action: 'read', args: {} });
    } else if ((m = part.match(/^(?:open|go to|goto|visit|launch|navigate to)\s+(?:up\s+)?(.+)$/i))) {
      for (const t of splitTargets(m[1])) steps.push({ action: 'open', args: { target: t } });
    } else {
      steps.push({ action: 'open', args: { target: part } });
    }
  }
  return steps;
}

async function runStep({ action, args }) {
  switch (action) {
    case 'open': return browser.openTab(args.target);
    case 'search': return browser.search(args.query, args.site);
    case 'type': return browser.typeText(args.text, args.target, { pressEnter: args.pressEnter });
    case 'press': return browser.pressKey(args.key);
    case 'click': return browser.click(args.target);
    case 'close': return browser.closeTab();
    case 'tabs': return browser.listTabs();
    case 'read': return browser.readPage({ maxChars: 600 });
    default: return { ok: false, error: `Unknown action ${action}` };
  }
}

function stepLabel({ action, args }) {
  switch (action) {
    case 'open': return `Open ${args.target}`;
    case 'search': return `Search ${args.site} for "${args.query}"`;
    case 'type': return `Type "${args.text}"${args.target ? ` into ${args.target}` : ''}${args.pressEnter ? ' + Enter' : ''}`;
    case 'press': return `Press ${args.key}`;
    case 'click': return `Click "${args.target}"`;
    case 'close': return 'Close tab';
    case 'tabs': return 'List tabs';
    case 'read': return 'Read page';
    default: return action;
  }
}

async function runRules(command, onLog) {
  const steps = parseCommand(command);
  if (!steps.length) return { ok: false, mode: 'rules', summary: 'Tell me what to do, e.g. "open canva and instagram".', log: [] };
  const log = [];
  for (const step of steps) {
    let result;
    try { result = await runStep(step); } catch (err) { result = { ok: false, error: err.message }; }
    const entry = { step: stepLabel(step), ok: result.ok !== false, detail: result.error || result.title || result.url || '' };
    log.push(entry);
    onLog?.(entry);
    if (/Could not start Google Chrome/.test(result.error || '')) break;
  }
  const done = log.filter((l) => l.ok).length;
  return { ok: done > 0, mode: 'rules', summary: `Done ${done} of ${log.length} step${log.length === 1 ? '' : 's'}.`, log };
}

// ---------------------------------------------------------------------------
// Claude agent (tool runner)
// ---------------------------------------------------------------------------

const SYSTEM = `You are Maya, the marketing assistant in the user's virtual office. You control a real, visible
Google Chrome window on the user's computer through tools. Do what the user asks, step by step:
open tabs, search, type, press keys, click and read pages. The user watches the browser as you work.

- Prefer site names or full URLs with open_tab; use search for anything the user wants to look up.
- After typing into a page, read_page if you need to check what happened.
- Never submit payments, post or publish content publicly, send messages, or change account settings
  unless the user explicitly asked for exactly that. Stop and say what is ready for them to review instead.
- Never type passwords. If a site needs a login, tell the user to log in in the Chrome window.
- Finish with a short, friendly summary (2-4 sentences) of what you did and anything the user should do next.`;

function makeTools(log, onLog) {
  const record = (step, result) => {
    const entry = { step, ok: result.ok !== false, detail: result.error || result.title || result.url || '' };
    log.push(entry);
    onLog?.(entry);
    return JSON.stringify(result);
  };
  const safe = (step, fn) => async (input) => {
    try { return record(step(input), await fn(input)); } catch (err) { return record(step(input), { ok: false, error: err.message }); }
  };
  return [
    betaZodTool({
      name: 'open_tab',
      description: 'Open a new Chrome tab and switch to it. Accepts a full URL, a domain (canva.com), a known site name (youtube, instagram, canva, capcut, tiktok, gmail...) or search words.',
      inputSchema: z.object({ target: z.string().describe('URL, domain, site name or search words') }),
      run: safe((i) => `Open ${i.target}`, (i) => browser.openTab(i.target)),
    }),
    betaZodTool({
      name: 'search',
      description: `Search for something in a new tab. site can be one of: ${browser.SEARCHABLE.join(', ')}.`,
      inputSchema: z.object({ query: z.string(), site: z.string().optional().describe('Defaults to google') }),
      run: safe((i) => `Search ${i.site || 'google'} for "${i.query}"`, (i) => browser.search(i.query, i.site || 'google')),
    }),
    betaZodTool({
      name: 'go_to',
      description: 'Navigate the CURRENT tab to a URL or site, without opening a new tab.',
      inputSchema: z.object({ target: z.string() }),
      run: safe((i) => `Go to ${i.target}`, (i) => browser.goTo(i.target)),
    }),
    betaZodTool({
      name: 'type_text',
      description: 'Type text into a text box on the current tab. target is the box placeholder, label or a CSS selector; leave it empty to use the focused or first text box.',
      inputSchema: z.object({
        text: z.string(),
        target: z.string().optional(),
        press_enter: z.boolean().optional().describe('Press Enter after typing'),
      }),
      run: safe((i) => `Type "${i.text.slice(0, 60)}"${i.target ? ` into ${i.target}` : ''}`, (i) => browser.typeText(i.text, i.target || '', { pressEnter: i.press_enter })),
    }),
    betaZodTool({
      name: 'press_key',
      description: 'Press a keyboard key on the current tab, e.g. Enter, Tab, Escape, ArrowDown, Control+A.',
      inputSchema: z.object({ key: z.string() }),
      run: safe((i) => `Press ${i.key}`, (i) => browser.pressKey(i.key)),
    }),
    betaZodTool({
      name: 'click',
      description: 'Click a button or link on the current tab by its visible text (or a CSS selector).',
      inputSchema: z.object({ target: z.string() }),
      run: safe((i) => `Click "${i.target}"`, (i) => browser.click(i.target)),
    }),
    betaZodTool({
      name: 'read_page',
      description: 'Read the visible text and the main buttons/inputs of the current tab.',
      inputSchema: z.object({}),
      run: safe(() => 'Read page', () => browser.readPage()),
    }),
    betaZodTool({
      name: 'list_tabs',
      description: 'List open tabs with their index, title and URL.',
      inputSchema: z.object({}),
      run: safe(() => 'List tabs', () => browser.listTabs()),
    }),
    betaZodTool({
      name: 'switch_tab',
      description: 'Switch to a tab by its index from list_tabs.',
      inputSchema: z.object({ index: z.number().int() }),
      run: safe((i) => `Switch to tab ${i.index}`, (i) => browser.switchTab(i.index)),
    }),
    betaZodTool({
      name: 'close_tab',
      description: 'Close a tab by index, or the current tab if no index is given.',
      inputSchema: z.object({ index: z.number().int().optional() }),
      run: safe((i) => `Close tab${i.index !== undefined ? ` ${i.index}` : ''}`, (i) => browser.closeTab(i.index)),
    }),
  ];
}

async function runClaude(command, onLog, log) {
  const runner = getClient().beta.messages.toolRunner({
    model: MODEL,
    max_tokens: 16000,
    max_iterations: 25,
    system: SYSTEM,
    output_config: { effort: 'medium' },
    // If a safety classifier declines, the API retries on a suitable fallback model.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    tools: makeTools(log, onLog),
    messages: [{ role: 'user', content: command }],
  });
  const final = await runner.done();
  const summary = final.stop_reason === 'refusal'
    ? 'I can\'t help with that one.'
    : final.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
  return { ok: true, mode: 'ai', summary: summary || 'Done.', log };
}

/**
 * Runs a browser task. Uses Claude when configured, the rule parser otherwise
 * (or when the API call fails, so the user still gets something done).
 * @param {string} command
 * @param {(entry:{step:string, ok:boolean, detail:string})=>void} [onLog]
 */
export async function runTask(command, onLog) {
  const cmd = String(command || '').slice(0, 2000);
  if (!aiEnabled()) return runRules(cmd, onLog);
  const log = [];
  try {
    return await runClaude(cmd, onLog, log);
  } catch (err) {
    console.warn('[agent] Claude unavailable, using rules:', err.message);
    // Don't redo steps Claude already carried out in Chrome.
    if (log.length) return { ok: false, mode: 'ai', summary: `I stopped part-way: ${err.message}`, log };
    const result = await runRules(cmd, onLog);
    return { ...result, summary: `${result.summary} (AI was unavailable, so I followed the simple rules.)` };
  }
}
