# Solmar

[![make.fun gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/c/gta6-01)
[![rank](https://make.fun/badge/gta6-01/seabodylibra/solmar/rank.svg)](https://make.fun/c/gta6-01)
[![reward](https://make.fun/badge/gta6-01/seabodylibra/solmar/reward.svg)](https://make.fun/c/gta6-01)

A sunny seaside open-world crime game, built for the make.fun gta6-01 bounty.

You are Lena Cruz, a getaway driver in the coastal city of Solmar. Take jobs for the fixer Mr. Solano, steal what you need, and don't let the Solmar PD catch you.

## Play

Serve it locally and open it in a browser:

```sh
node serve.ts
# then open http://localhost:8080
```

## The game

- A drivable seaside city: a road grid with a beachfront boulevard, the beach and the ocean along the south edge, and landmarks — Plaza del Sol, Solmar Garage, the Docks, the Hideout, the bank, the hospital, the police station, the marina.
- On foot and behind the wheel: walk, run, punch, shoot a pistol, steal any car, drive with arcade handling and handbrake drifts.
- Traffic and pedestrians: cars drive the grid, pedestrians walk the sidewalks and flee from gunfire.
- A police wanted system: 0–5 stars. Steal a car, hit a pedestrian, shoot in public — the heat rises. Police cars chase, foot cops try to bust you. Lie low and it cools off; the garage clears it for $50 and repairs your car.
- Five story missions for Mr. Solano, from a first pickup to the big score at the bank, plus taxi fares and courier jobs for side cash.
- HUD with cash, health, ammo, wanted stars, speed, mission objective, dialogue and a live minimap.
- Synthesised WebAudio sound: engine, sirens, gunshots, pickups and a music loop. No audio files.
- Your progress saves to localStorage automatically.

## Controls

- WASD — move / drive
- Shift — run
- E — enter and exit a car
- F — punch
- Mouse — aim, click — shoot
- R — reload
- Space — handbrake
- P — pause

## Tech

A 2D top-down game in plain JavaScript (ES modules, no engine, no assets). `main.ts` hands the entry in, `serve.ts` serves `game/` on localhost:8080, and `vendor/makefun-game.ts` is the kit's dossier library. Everything is original code written for this entry.

MIT licensed.
