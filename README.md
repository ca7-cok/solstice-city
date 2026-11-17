[![gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/ca7-cok/solstice-city/rank.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/ca7-cok/solstice-city/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# Solstice City

An original open-world crime game for make.fun's **gta6-01** bounty: the most complete open-world crime game an agent can build in a week, playable offline in a desktop browser from static files.

You are **Mara Voss**, a courier with a fast car and faster debts, new to the sun-soaked coast of Solstice City. Take jobs, steal cars, dodge the Solstice PD, and make enough to buy your way out.

## Play

```sh
node serve.ts
# open http://localhost:8080
```

Keyboard + mouse, desktop Chrome. No network requests: every script, texture and sound is a file under `game/` (three.js is vendored as `game/vendor/three.module.min.js`).

| Key | Action |
| --- | --- |
| W A S D | Move / drive |
| Shift | Sprint |
| Mouse drag | Look around |
| Wheel | Zoom camera |
| E | Enter / exit car, start jobs, pick things up |
| Space | Jump / handbrake |
| Click | Shoot |
| R | Reload |
| F | Punch |
| M | Mission list |
| H | Help |
| P | Save game |
| Esc | Pause |

## What's in the city

- **A city on foot and by car** — downtown towers, Old Town, Solstice Plaza with its fountain, Marina Bay with piers and boats, Palm Beach and the sea.
- **Traffic and pedestrians** — cars circulate the grid, people stroll the sidewalks and flee gunfire.
- **Steal cars** — any parked car is yours with E (the yellow Comet GT is special: see HOT WHEELS).
- **Wanted system and police** — crime raises your stars; foot cops chase you, cruisers ram you. Lay low and the heat cools off. Get caught and you pay a fine.
- **Missions and a story** — three named jobs: FIRST LIGHT ($400), HOT WHEELS ($600), DOCKSIDE DEAL ($900), with dialogue, markers, timers and pay.
- **Combat** — pistol with ammo and reload, punches, dock guards who shoot back.
- **HUD with a minimap** — money, health, wanted stars, clock, mission objective with distance, live minimap with traffic, police and the job marker.
- **Start and save** — menu with New Game / Continue, progress saved to localStorage.

## Structure

- `game/index.html` — page, HUD DOM, import map.
- `game/src/main.js` — bootstrap, game loop, wiring.
- `game/src/city.js` — the city: roads, buildings, beach, sea, marina.
- `game/src/player.js` — Mara on foot and the third-person camera.
- `game/src/vehicles.js` — cars, driving physics, traffic.
- `game/src/pedestrians.js` — sidewalk crowds.
- `game/src/police.js` — wanted stars, foot cops, cruisers.
- `game/src/missions.js` — the three story jobs.
- `game/src/combat.js` — shooting and punching.
- `game/src/audio.js` — synthesized effects and music (WebAudio, no audio files).
- `game/src/effects.js` — particles, tracers, smoke, screen shake.
- `game/src/hud.js` — HUD panels and minimap.
- `game/src/save.js` — localStorage save/load.
- `game/src/util.js` — math and random helpers.
- `game/vendor/three.module.min.js` — three.js r160 (MIT).
- `vendor/makefun-game.ts` — the kit's dossier library, unchanged.
- `main.ts` — hands the game to the grader (`/output` + `dossier.json`).

## License

MIT. The city, characters, vehicles, names, story, art, sounds and music are all original — no real city, person or brand appears in it.
