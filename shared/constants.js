// Values shared by the server simulation, the projector display and the phone controller.
// Plain ES module so it can be imported by Node and served straight to the browser.

export const TILE = 40;              // world units per map tile
export const SIM_HZ = 30;            // server simulation rate
export const SNAPSHOT_HZ = 20;       // world snapshots sent to displays
export const INPUT_HZ = 15;          // joystick updates sent by phones

export const BASE_SPEED = 190;       // world units / second at speed = 1
export const PLAYER_RADIUS = 14;     // collision radius (feet)
export const INTERACT_RADIUS = 70;   // how close you must be to use something
export const JUMP_TIME = 0.55;       // seconds airborne for a normal jump
export const SUPERJUMP_TIME = 1.1;

export const MAX_PLAYERS_PER_ROOM = 16;
export const MAX_CHAT_LENGTH = 140;
export const MAX_NAME_LENGTH = 16;
export const MAX_SPRITE_BYTES = 350_000; // data-URL length cap for scanned drawings
export const RECONNECT_GRACE_MS = 45_000;

export const GAITS = ['walk', 'robot', 'hop', 'waddle', 'glide', 'dance', 'zoom'];
export const ABILITIES = ['dash', 'superjump', 'magnet', 'boombox', 'charm'];
export const IDLES = ['dance', 'wave', 'hop', 'spin', 'nap', 'look'];
export const EMOTES = ['wave', 'dance', 'heart', 'laugh'];

export const ABILITY_INFO = {
  dash:      { label: 'Turbo Dash',  icon: '💨', cooldown: 5,  text: 'Zoom forward at crazy speed.' },
  superjump: { label: 'Super Jump',  icon: '🦘', cooldown: 6,  text: 'Leap high — even over the river!' },
  magnet:    { label: 'Food Magnet', icon: '🧲', cooldown: 10, text: 'Pull nearby snacks toward you.' },
  boombox:   { label: 'Boombox',     icon: '📻', cooldown: 12, text: 'Start a dance party around you.' },
  charm:     { label: 'Friend Aura', icon: '💖', cooldown: 8,  text: 'Send hearts and make friends nearby.' },
};

export const EMOTE_ICONS = { wave: '👋', dance: '💃', heart: '❤️', laugh: '😂' };

export const COLLECTIBLES = {
  kolomee: { label: 'Kolo Mee',   icon: '🍜', points: 10, coins: 2 },
  keklapis:{ label: 'Kek Lapis',  icon: '🍰', points: 15, coins: 3 },
  laksa:   { label: 'Sarawak Laksa', icon: '🥣', points: 20, coins: 5 },
};

export const PLAYER_COLORS = [
  '#ff5a5f', '#1fb5ad', '#ffb400', '#7b61ff', '#2ec4b6', '#ff7ab6',
  '#3a86ff', '#8ac926', '#ff924c', '#6a4c93', '#00b4d8', '#e76f51',
  '#52b788', '#f15bb5', '#4361ee', '#fb8500',
];
