// Maya's creative brain. Turns a short brief into social media design concepts and
// video edit plans. Claude writes the copy when an API key is set; otherwise a
// template engine produces the same shapes so the studio always works.

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { aiEnabled } from './agent.js';

const MODEL = process.env.CLAUDE_MODEL || 'claude-opus-5-5';

export const LAYOUTS = ['bold', 'split', 'minimal', 'gradient', 'frame'];
export const PLATFORMS = ['instagram-post', 'instagram-story', 'facebook', 'linkedin', 'x', 'youtube-thumbnail', 'tiktok-cover'];
export const POSITIONS = ['top', 'center', 'bottom'];

const hex = z.string().describe('Hex colour like #1a2b3c');

const DesignSchema = z.object({
  headline: z.string().describe('Punchy headline for the graphic, max 6 words'),
  subheadline: z.string().describe('Supporting line, max 12 words'),
  cta: z.string().describe('Call to action button text, max 4 words'),
  caption: z.string().describe('Post caption, 1-3 short sentences, platform appropriate, can include 1-2 emoji'),
  hashtags: z.array(z.string()).describe('5-8 relevant hashtags, each starting with #'),
  layout: z.enum(LAYOUTS),
  emoji: z.string().describe('One emoji used as a decorative accent'),
  palette: z.object({ bg: hex, bg2: hex, accent: hex, text: hex }).describe('Text must contrast strongly with bg'),
});
const DesignSetSchema = z.object({ designs: z.array(DesignSchema).describe('Exactly 3 different concepts') });

const VideoPlanSchema = z.object({
  title: z.string().describe('Hook text shown in the first seconds, max 7 words'),
  overlays: z.array(z.object({
    text: z.string().describe('On-screen text, max 8 words'),
    start: z.number().describe('Seconds from the start of the trimmed clip'),
    end: z.number(),
    position: z.enum(POSITIONS),
  })).describe('3-6 timed text overlays covering the clip'),
  caption: z.string().describe('Post caption, 1-3 sentences'),
  hashtags: z.array(z.string()).describe('5-8 hashtags starting with #'),
  musicMood: z.string().describe('Suggested music mood, e.g. "upbeat lo-fi"'),
  tips: z.array(z.string()).describe('2-4 short editing tips for this video'),
});

let client = null;
function getClient() {
  if (!client) client = new Anthropic({ timeout: 60_000, maxRetries: 1 });
  return client;
}

async function ask(schema, system, text) {
  const response = await getClient().messages.parse({
    model: MODEL,
    max_tokens: 4000,
    system,
    output_config: { effort: 'low', format: zodOutputFormat(schema) },
    messages: [{ role: 'user', content: text }],
  });
  if (response.stop_reason === 'refusal' || !response.parsed_output) throw new Error(`No usable output (${response.stop_reason})`);
  return response.parsed_output;
}

// ---------------------------------------------------------------------------
// Template engine (offline)
// ---------------------------------------------------------------------------

const PALETTES = [
  { bg: '#1e1b4b', bg2: '#7c3aed', accent: '#facc15', text: '#ffffff' },
  { bg: '#fff7ed', bg2: '#fed7aa', accent: '#ea580c', text: '#1c1917' },
  { bg: '#042f2e', bg2: '#0d9488', accent: '#5eead4', text: '#f0fdfa' },
  { bg: '#fdf2f8', bg2: '#f9a8d4', accent: '#db2777', text: '#3b0764' },
  { bg: '#0f172a', bg2: '#2563eb', accent: '#38bdf8', text: '#f8fafc' },
  { bg: '#fefce8', bg2: '#bef264', accent: '#15803d', text: '#14532d' },
];

const THEMES = [
  { words: /sale|discount|promo|offer|deal|% ?off|black friday/i, emoji: '🔥', heads: ['Big Sale Is Here', 'Deals You Can\'t Miss', 'Limited Time Only'], cta: 'Shop Now' },
  { words: /launch|new|introduc|coming soon|release/i, emoji: '🚀', heads: ['Something New Is Here', 'Meet Our Latest', 'Just Launched'], cta: 'Discover More' },
  { words: /food|cafe|coffee|restaurant|menu|bakery|drink|kopi|laksa|mee/i, emoji: '☕', heads: ['Taste The Difference', 'Fresh From Our Kitchen', 'Your New Favourite'], cta: 'Order Today' },
  { words: /event|workshop|webinar|class|join|meetup|festival/i, emoji: '🎉', heads: ['You\'re Invited', 'Save The Date', 'Join Us Live'], cta: 'Register Now' },
  { words: /hiring|job|career|recruit|vacanc/i, emoji: '💼', heads: ['We\'re Hiring', 'Join Our Team', 'Your Next Career Move'], cta: 'Apply Now' },
  { words: /beauty|skin|salon|fashion|cloth|style|wear/i, emoji: '✨', heads: ['Glow Up Season', 'Style That Speaks', 'Feel Your Best'], cta: 'Shop The Look' },
  { words: /fitness|gym|health|yoga|workout/i, emoji: '💪', heads: ['Stronger Every Day', 'Your Fitness Journey', 'Move Better'], cta: 'Start Today' },
];
const DEFAULT_THEME = { emoji: '⭐', heads: ['Made For You', 'Discover Something Great', 'Here\'s What\'s New'], cta: 'Learn More' };

function titleCase(s) { return s.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase()); }

function keywords(brief) {
  const stop = new Set('a an the and or for to of in on at with our my your we is are be this that it from by new post about make create design video off all only get now'.split(' '));
  return [...new Set(String(brief).toLowerCase().match(/[a-z0-9]+/g) || [])].filter((w) => w.length > 2 && !stop.has(w));
}

function tagsFor(brief, platform) {
  const base = keywords(brief).slice(0, 4).map((w) => `#${w}`);
  const extra = {
    'instagram-post': ['#instagood', '#smallbusiness'], 'instagram-story': ['#instastory', '#smallbusiness'],
    facebook: ['#community', '#smallbusiness'], linkedin: ['#business', '#growth'], x: ['#trending'],
    'youtube-thumbnail': ['#youtube'], 'tiktok-cover': ['#fyp', '#tiktokmademebuyit'],
  }[platform] || ['#marketing'];
  return [...new Set([...base, ...extra, '#marketing'])].slice(0, 8);
}

export function templateDesigns({ brief = '', brand = '', platform = 'instagram-post' } = {}) {
  const theme = THEMES.find((t) => t.words.test(brief)) || DEFAULT_THEME;
  const kw = keywords(brief);
  const subject = kw.length ? titleCase(kw.slice(0, 3).join(' ')) : (brand || 'Our Brand');
  const name = brand || subject;
  const seed = [...String(brief)].reduce((a, c) => a + c.charCodeAt(0), 0);
  return {
    source: 'templates',
    designs: [0, 1, 2].map((i) => ({
      headline: theme.heads[i % theme.heads.length],
      subheadline: i === 0 ? `${subject} by ${name}` : i === 1 ? `Everything you love about ${subject.toLowerCase()}` : `Don't miss out. Visit ${name} today.`,
      cta: theme.cta,
      caption: `${theme.emoji} ${theme.heads[i % theme.heads.length]}! ${brief ? brief.replace(/\s+/g, ' ').trim().replace(/[.!]?$/, '.') : ''} Tap the link to find out more.`.replace(/\s+/g, ' '),
      hashtags: tagsFor(brief, platform),
      layout: LAYOUTS[(seed + i) % LAYOUTS.length],
      emoji: theme.emoji,
      palette: PALETTES[(seed + i * 2) % PALETTES.length],
    })),
  };
}

export function templateVideoPlan({ brief = '', duration = 15 } = {}) {
  const d = Math.max(3, Number(duration) || 15);
  const theme = THEMES.find((t) => t.words.test(brief)) || DEFAULT_THEME;
  const subject = titleCase(keywords(brief).slice(0, 3).join(' ')) || 'Our Story';
  const beats = [
    { text: `${theme.emoji} ${theme.heads[0]}`, position: 'center' },
    { text: subject, position: 'bottom' },
    { text: 'Here\'s why you\'ll love it', position: 'bottom' },
    { text: `${theme.cta} 👉`, position: 'center' },
  ];
  const slice = d / beats.length;
  return {
    source: 'templates',
    title: theme.heads[0],
    overlays: beats.map((b, i) => ({ ...b, start: +(i * slice).toFixed(1), end: +((i + 1) * slice).toFixed(1) })),
    caption: `${theme.emoji} ${theme.heads[0]}! ${brief}`.trim(),
    hashtags: tagsFor(brief, 'tiktok-cover'),
    musicMood: /calm|relax|spa|yoga/i.test(brief) ? 'soft acoustic' : 'upbeat pop',
    tips: ['Put the hook in the first 2 seconds.', 'Keep each text overlay on screen for at least 2 seconds.', 'Export vertical 9:16 for Reels, TikTok and Shorts.'],
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const DESIGN_SYSTEM = `You are Maya, a senior social media designer. Write three distinct design concepts for one
social graphic. Copy must be short enough to read on a phone in two seconds. Pick palettes with strong text contrast
and match the brand mood. Vary the layouts across the three concepts.`;

const VIDEO_SYSTEM = `You are Maya, a short-form video editor. Plan timed on-screen text overlays for a clip:
a strong hook in the first 2 seconds, overlays that never overlap in time, every overlay at least 1.5 seconds,
all inside the clip length. Keep text short and readable on a phone.`;

export async function createDesigns({ brief = '', brand = '', platform = 'instagram-post', tone = '' } = {}) {
  const input = { brief: String(brief).slice(0, 800), brand: String(brand).slice(0, 60), platform: PLATFORMS.includes(platform) ? platform : 'instagram-post', tone: String(tone).slice(0, 60) };
  if (!aiEnabled()) return templateDesigns(input);
  try {
    const out = await ask(DesignSetSchema, DESIGN_SYSTEM,
      `Platform: ${input.platform}\nBrand: ${input.brand || '(not given)'}\nTone: ${input.tone || '(your choice)'}\nBrief: ${input.brief || '(none, make a friendly general brand post)'}`);
    return { source: 'ai', designs: out.designs.slice(0, 3) };
  } catch (err) {
    console.warn('[marketing] design AI failed, using templates:', err.message);
    return templateDesigns(input);
  }
}

export async function createVideoPlan({ brief = '', duration = 15, platform = 'tiktok' } = {}) {
  const input = { brief: String(brief).slice(0, 800), duration: Math.min(600, Math.max(1, Number(duration) || 15)), platform: String(platform).slice(0, 30) };
  if (!aiEnabled()) return templateVideoPlan(input);
  try {
    const plan = await ask(VideoPlanSchema, VIDEO_SYSTEM,
      `Platform: ${input.platform}\nClip length after trimming: ${input.duration.toFixed(1)} seconds\nBrief: ${input.brief || '(none, make an engaging generic promo)'}`);
    plan.overlays = plan.overlays
      .map((o) => ({ ...o, start: Math.max(0, Math.min(o.start, input.duration)), end: Math.max(0, Math.min(o.end, input.duration)) }))
      .filter((o) => o.end > o.start);
    return { source: 'ai', ...plan };
  } catch (err) {
    console.warn('[marketing] video AI failed, using templates:', err.message);
    return templateVideoPlan(input);
  }
}
