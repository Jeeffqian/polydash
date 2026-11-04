# PolyDash 🏎️

A low-poly, time-trial drift racing game that runs in your browser. Built with Three.js — no build step required.

![gameplay](preview.png)

![genre](https://img.shields.io/badge/genre-racing-ff5a3c) ![tech](https://img.shields.io/badge/tech-three.js-blue) ![license](https://img.shields.io/badge/license-MIT-green)

## Features

- **6 official tracks** across 6 themed environments — meadow, desert, snow, sunset city, neon nights and volcano rim, each with its own palette, lighting and decorations.
- **Drift physics** — hold SPACE to slide through corners; drifting charges a boost meter that rewards you with extra speed when you exit the drift.
- **Ghost replay** — your best lap is recorded turn-by-turn; race against your own translucent ghost on every track.
- **Checkpoint splits & medals** — 3 checkpoint splits per lap, plus gold / silver / bronze target times for every track.
- **Online leaderboard** — global top-10 per track, backed by a managed cloud database. Submit your time after each lap.
- **Track editor** — build your own layouts on a grid, test drive them instantly, and share them with friends via an export code.
- **Local best times** — saved in your browser, shown per track.

## Controls

| Key | Action |
|---|---|
| `W` / `↑` | Throttle |
| `S` / `↓` | Brake / reverse |
| `A` `D` / `←` `→` | Steer |
| `Space` | Drift (charges boost) |
| `R` | Restart |
| `G` | Toggle ghost |
| `Esc` | Back to menu |

## Run locally

Any static file server works. For example:

```bash
npx serve .        # or: python -m http.server 8080
```

Then open the printed URL in your browser. (Opening `index.html` directly via `file://` also works in most browsers.)

## Tests

Headless logic + physics tests (no browser needed):

```bash
npm install
npm test
```

The physics suite drives a full lap on every official track with a simple AI and asserts: lap completion, no NaN states, wall containment and drift-grip behavior.

## Tech notes

- **Rendering**: Three.js (ES module via CDN import map), PCF soft shadows, per-theme fog & lighting.
- **Physics**: custom arcade model — forward/lateral velocity decomposition, grip-based lateral decay, drift charge → boost, gravity + terrain-following with crest launches, wall projection with speed penalty.
- **Tracks**: closed Catmull-Rom splines sampled into road/curb ribbons, instanced barriers, procedurally scattered theme decorations.
- **Backend**: WorkBuddy Cloud database (`leaderboard` table: `track_id`, `player_name`, `time_ms`) with public read / validated insert policies.
- **Ghost data**: stored in `localStorage` at ~30 Hz, interpolated on playback.

## Project layout

```
index.html          entry page (import map + UI markup)
css/style.css       UI styling
js/config.js        cloud service public config
js/main.js          menus, track select, finish flow
js/game.js          game loop, camera, states, HUD
js/car.js           car physics + model
js/tracks.js        track definitions + 3D track builder
js/timing.js        checkpoints, lap timing
js/ghost.js         ghost recorder/replayer
js/leaderboard.js   cloud leaderboard client
js/editor.js        track editor
test/               headless logic & physics tests
```

## License

MIT
