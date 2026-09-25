// AI character designer. Given the scanned drawing and the player's description, asks
// Claude to invent a personality + movement profile (structured JSON). Falls back to
// the keyword rules whenever the API is not configured or anything goes wrong, so the
// game always works offline.

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { GAITS, ABILITIES, IDLES, ABILITY_INFO } from '../../shared/constants.js';
import { ruleProfile, normalizeProfile } from './rules.js';

const MODEL = process.env.CLAUDE_MODEL || 'claude-opus-5';

const ProfileSchema = z.object({
  name: z.string().describe('Short fun character name, max 16 chars. Keep the player-given name if one was provided.'),
  gait: z.enum(GAITS).describe('How the character moves around the map'),
  speed: z.number().describe('Movement speed multiplier, 0.6 (slow) to 1.8 (very fast); 1 is normal'),
  jumpiness: z.number().describe('0..1 how often it hops spontaneously while moving'),
  bounce: z.number().describe('0..1 how springy/bouncy each step looks'),
  sociability: z.number().describe('0..1 how eager it is to wave at and befriend other players'),
  musicLove: z.number().describe('0..1 how much it loves music and dancing'),
  ability: z.enum(ABILITIES).describe('Special ability that best matches the personality'),
  idle: z.enum(IDLES).describe('What it does when the player stops moving'),
  traits: z.array(z.string()).describe('2-4 one-or-two word personality traits'),
  emoji: z.string().describe('One emoji that sums up the character'),
  catchphrase: z.string().describe('A short, kid-friendly catchphrase, can reference Kuching/Sarawak'),
  bio: z.string().describe('One or two sentence fun bio, max 160 chars'),
});

const SYSTEM = `You design characters for "Draw Kuching", a kid-friendly party game. Players draw a character on paper,
scan it, and describe its personality. The character then explores a cartoon version of Kuching, Sarawak (Malaysia)
on a big projector screen with friends.

Turn the drawing and description into a game profile. Rules of thumb:
- gait: robot = stiff 4-direction moves; hop = bouncy jumps; waddle = side-to-side; glide = floating;
  dance = twirls while moving; zoom = leans forward, very fast; walk = normal.
- Match numbers to the description ("moves very fast" → speed 1.6+; "jumps a lot" → jumpiness 0.8+;
  "likes to make friends" → sociability 0.8+; "loves music"/"likes to dance" → musicLove 0.8+).
- Abilities: ${Object.entries(ABILITY_INFO).map(([k, v]) => `${k} (${v.text})`).join('; ')}.
- If the description is empty, infer a personality from how the drawing looks.
- Keep everything positive and suitable for children.`;

let client = null;
export function aiEnabled() { return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN); }
function getClient() {
  if (!client) client = new Anthropic({ timeout: 25_000, maxRetries: 1 });
  return client;
}

/** Parse "data:image/png;base64,...." into an Anthropic image block, or null. */
function imageBlock(dataUrl) {
  const m = typeof dataUrl === 'string' && dataUrl.match(/^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/);
  if (!m) return null;
  return { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } };
}

/**
 * @param {{description?:string, name?:string, sprite?:string}} input
 * @returns {Promise<object>} normalized profile (source: 'ai' | 'rules')
 */
export async function designCharacter({ description = '', name = '', sprite = null } = {}) {
  const desc = String(description).slice(0, 500);
  const cleanName = String(name).slice(0, 16);
  if (!aiEnabled()) return ruleProfile(desc, cleanName);

  const content = [];
  const img = imageBlock(sprite);
  if (img) content.push(img);
  content.push({
    type: 'text',
    text: `Player-given name: ${cleanName || '(none — invent one)'}\nPlayer description: ${desc || '(none — infer from the drawing)'}`,
  });

  try {
    const response = await getClient().messages.parse({
      model: MODEL,
      max_tokens: 2000,
      system: SYSTEM,
      output_config: { effort: 'low', format: zodOutputFormat(ProfileSchema) },
      messages: [{ role: 'user', content }],
    });
    if (response.stop_reason === 'refusal' || !response.parsed_output) {
      return { ...ruleProfile(desc, cleanName), note: 'AI declined; used built-in personality rules.' };
    }
    const profile = normalizeProfile({ ...response.parsed_output, source: 'ai' });
    if (cleanName) profile.name = cleanName;
    return profile;
  } catch (err) {
    console.warn('[ai] character design failed, using rules:', err?.status ?? '', err?.message);
    return { ...ruleProfile(desc, cleanName), note: 'AI unavailable; used built-in personality rules.' };
  }
}
