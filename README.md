# 🐱 Draw Kuching

A multiplayer party game. Players draw a character on paper and scan it with a phone. The character then comes to life on a projector, in a cartoon version of Kuching, Sarawak. Each phone becomes that player's controller.

```
 paper drawing ──📷──► phone: cut-out + AI personality ──► big screen: explore Kuching together
```

## Quick start

```bash
npm install
npm start                      # http://localhost:3000
# optional: let Claude design the characters
ANTHROPIC_API_KEY=sk-ant-... npm start
```

1. Open **`/display`** on the computer connected to the projector or TV, then click **Start the city**.
2. Players scan the QR code, or open `http://<computer-ip>:3000/play` and type the 4-letter room code.
3. On the phone: **take a photo of your drawing**, adjust the cut-out, **describe the personality**, then **Enter Kuching!**

The phones and the display computer must be on the same Wi-Fi network. The QR code uses the computer's LAN address automatically.

> **Drawing tips:** use white paper and a dark pen, close the outline, and colour inside it. A photo in good light gives the cleanest cut-out. There's also an on-screen draw pad and a "random doodle" option for testing.

## What's in the MVP

| Feature | Where |
|---|---|
| **Drawing scan and extraction.** Uses local paper-colour estimation, so it handles shadows and warm light. Ink detection picks up dark lines *and* colours. Outline gaps are closed, the background is flood-filled from the photo border so shape interiors are kept, specks and table edges are dropped, colours are normalised and a sticker outline is added. Runs on the phone with a live "line pickup" slider. | `shared/extract.js`, `public/js/play/scan.js` |
| **AI character design.** Claude reads the drawing and the description (e.g. "walks like a robot, loves music, likes to make friends") and returns a structured profile: gait, speed, jumpiness, bounce, sociability, love of music, special ability, idle behaviour, traits, catchphrase and bio. Without an API key, a keyword engine produces the same profile shape, so the game always works offline. | `server/ai/personality.js`, `server/ai/rules.js` |
| **AI-driven movement and behaviour.** The profile changes the actual simulation: robots only move in 4 directions, gliders drift, zoomers are fast, jumpy characters hop on their own, friendly ones wave at people nearby, and music lovers dance by themselves on the stage. The display animates each gait in its own way (waddle, bounce, float, lean, twirl), plus idle animations (nap, spin, look around). | `server/game/Room.js`, `public/js/display/characters.js` |
| **Real-time multiplayer.** The server runs the simulation at 30 Hz and sends snapshots to the displays at 20 Hz, which interpolate between them. Phones get their own HUD updates. If a phone drops off Wi-Fi or its screen locks, the player can rejoin within 45 s and keep the same character (token-based). | `server/net.js`, `server/rooms.js` |
| **Phone as controller.** Floating joystick, **A** (interact), **B** (jump), ★ ability with a cooldown, emotes, haptics, wake-lock, chat with quick phrases. Keyboard also works for desktop testing: WASD, Space, E, Q. | `public/play.html`, `public/js/play/*` |
| **3D projector display (Three.js).** A low-poly, San Andreas-style Kuching with sunlight and shadows, asphalt streets with yellow lines, raised pavements, power poles with sagging wires, traffic lights, taxis and cars that stop for players, sampans on the river, and Mount Santubong on the horizon. Players' drawings stand in the world as paper cut-outs that turn to face the camera. Camera modes (press **C** or 🎥): *Auto*, *Everyone* (group view), *Chase cam* (GTA-style, behind a player) and *City tour*. There's also a minimap, leaderboard, chat, speech bubbles, fact cards, particles and WebAudio sound. | `public/js/display/three/*` |
| **Classic 2D view** for slow projector laptops: `/display?view=2d` (or the 2D button). `/display?quality=low` keeps 3D but turns off shadows. | `public/js/display/renderer2d.js` |
| **Stylized Kuching map.** The Sarawak River with the Darul Hana Bridge and sampan jetties. North bank: DUN (golden roof), Fort Margherita, the Astana and kampung houses. South bank: the Waterfront and its stage, Main Bazaar shophouses, Square Tower, Chinese History Museum, Tua Pek Kong, Old Courthouse, Borneo Cultures Museum, Old State Mosque, Top Spot, Padang Merdeka and the Great Cat of Kuching. | `shared/map.js`, `public/js/display/world.js`, `public/js/display/art.js` |
| **Interactions and mini-games.** Collect kolo mee, kek lapis and laksa. **Cat Hunt**: find 8 hidden cats. **Passport**: visit 11 landmarks. **High-fives** that make friends. Sampan rides. A hawker stall. Dance on the stage for points. Timed rounds (**Kolo Mee Rush** and **Waterfront Dance-Off**) with winners. Abilities: Dash, Super Jump (you can leap over the river), Food Magnet, Boombox party, Friend Aura. | `server/game/Room.js` |
| **Host controls** (bottom-right of the display) | add/remove AI bots, start a round, mute, fullscreen |

## Architecture

```
shared/            ES modules used by BOTH server and browser
  constants.js     tuning, abilities, collectibles
  map.js           deterministic Kuching map (tiles, landmarks, collision, interactables)
  extract.js       drawing → sprite pipeline (pure, unit-tested)
server/
  index.js         Express (static + /api/character + /api/qr + /api/info) + Socket.IO
  net.js           transport: validates messages, fans room events to displays/phones
  rooms.js         RoomManager: room codes, fixed-step clock, GC of idle rooms
  game/Room.js     authoritative simulation (network-agnostic EventEmitter)
  game/Bot.js      NPC doodles that use the same input API as phones
  ai/              Claude character designer + offline rule engine + profile validation
public/
  display.html     projector client; js/display/main.js = networking + HUD,
                   js/display/three/ = 3D renderer (city, buildings, characters, camera),
                   js/display/renderer2d.js = 2D fallback (same interface)
  play.html        phone client (scan → describe → controller)
test/              node:test — extraction, personality rules, simulation, socket end-to-end
```

How the design leaves room to grow:

- **More players and more rooms.** `Room` doesn't touch sockets, so rooms can be sharded across processes, with a Socket.IO Redis adapter plus a shared room registry replacing `RoomManager`. Snapshots are small; delta compression or interest management (send only what's near the camera) can go into `Room.snapshot()`.
- **Better AI animation.** Everything visual about a character goes through `CharacterView.draw()`, driven by the profile. That's where to add part segmentation (e.g. asking Claude for limb bounding boxes, then mesh-deform or skeletal rigs) without changing the network protocol.
- **More detailed Kuching.** All map data is in `shared/map.js`. The 3D models are built from code in `three/buildings.js` and `three/city.js`, so you can swap in real glTF models of Kuching landmarks one at a time. You can replace them with illustrated PNG tiles or a Tiled export without touching gameplay code.

## Configuration

| Env var | Default | |
|---|---|---|
| `PORT` | `3000` | |
| `ANTHROPIC_API_KEY` | — | enables Claude character design (otherwise offline rules) |
| `CLAUDE_MODEL` | `claude-opus-5` | model used for character design |
| `HTTPS_KEY`, `HTTPS_CERT` | — | serve over HTTPS (paths to PEM files) |

The camera button uses the phone's native camera through `<input capture>`, so it works over plain HTTP on a LAN. There's no need for HTTPS unless you later add a live in-page camera preview.

## Development

```bash
npm run dev    # restart on changes
npm test       # 21 tests: extraction, AI rules, simulation, socket end-to-end
```
