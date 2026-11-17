# Solstice City

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/ca7-cok/solstice-city/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/ca7-cok/solstice-city/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

Solstice City is an original open-world crime game that runs offline in a desktop browser.
You are **Mara Voss**, a courier with a fast car and faster debts, new to the sun-soaked
coast of Solstice City. The marina sparkles, the palms sway — and every street belongs to
somebody. Take jobs, steal cars, dodge the Solstice PD, and make enough to buy your way out.

## What is in the game

- **A city to explore** — a procedurally built coastal grid city: downtown towers, Old
  Town, the Marina, Sunset Docks, Palm Row, a plaza fountain, parks, a beach with palms,
  umbrellas and a pier, and the sea. All of it walkable.
- **Driving** — steal any parked or traffic car with **E** and drive it with arcade
  handling (acceleration, braking, steering, handbrake drift) and a chase camera.
- **Traffic & pedestrians** — AI cars cruise the road grid and stop for the car ahead;
  pedestrians stroll the sidewalks, panic and flee when a car bears down on them.
- **Wanted system & police** — crime (running people over, jacking cars, shooting)
  raises your star level. Solstice PD cruisers with flashing light bars chase you down
  and foot officers move in when you are on foot. Break line of sight and lay low and
  the heat cools off, one star at a time.
- **Three story missions** — *First Light* (meet Rosa, deliver a package), *Hot Wheels*
  (steal a yellow Sunrunner from the Marina and deliver it), and *Dockside Deal* (clear
  the Vipers off the Sunset Docks in a shootout), each with dialogue, a beacon marker,
  objectives on the HUD and a cash payout.
- **Combat** — a pistol with crosshair, ammo and reload (**R**), a punch (**F**),
  health, and enemies who shoot back.
- **HUD + minimap** — health, money, wanted stars, clock, mission objective, speed,
  ammo, and a live circular minimap (roads, traffic, police, mission marker).
- **Start menu & saves** — title screen, pause, and localStorage saves (**P**) that
  keep your money, mission progress and position.
- **Sound & polish** — everything is synthesised with WebAudio (engine hum, gunshots,
  sirens, a warm chord-loop soundtrack); particles for crashes, muzzle flashes and
  cash; speed-sensitive field of view; warm afternoon light.

## Run it

```sh
node serve.ts
```

then open http://localhost:8080 in a desktop browser. No build step, no network
requests: every file the game loads lives under `game/`, and three.js is vendored
under `game/vendor/`.

## Controls

| Key | Action |
| --- | --- |
| W A S D / arrows | Move / drive |
| Mouse drag | Look around (wheel zooms) |
| Shift | Sprint |
| Space | Jump on foot / handbrake in a car |
| E | Enter or exit a car · start a mission at the ◆ marker |
| Click | Shoot |
| R | Reload |
| F | Punch |
| M | Mission list |
| P | Save game |
| Esc | Pause |

## Tech

Plain ES modules + three.js (vendored, minified) on a static page. The entry program
`main.ts` copies `game/` and `screenshots/` to `/output` and writes `dossier.json`
with the kit's `vendor/makefun-game.ts`, as the starter does.

## Originality

Every name, character, place, vehicle, story beat, piece of art and sound in this
game is original. It is not affiliated with, and contains nothing from, any commercial
game.

---
<sub>Entered on [make.fun](https://make.fun/?ref=3sgxakja&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
