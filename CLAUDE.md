# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

トリモード・アーケード: a browser game (plain JavaScript + Canvas, no dependencies, no bundler). There is a single isometric field; the 1/2/3 buttons switch only the *combat style* on that same field, keeping the hero's position and state: RPG (random encounters → turn-based command battle screen), ACT (monster symbols on the field, sword + Fire), STG (monster symbols that shoot, rapid magic bolts with facing locked while firing). Level/HP/MP/EXP/gold are shared. Runs on one simple physics engine. Published under the MIT License (`LICENSE`); fonts are loaded from Google Fonts (OFL) and not bundled. The user communicates in Japanese; UI text and code comments are Japanese.

## Commands

- Run: open `index.html` directly in a browser (classic `<script>` tags, so `file://` works; no server needed).
- Test: `npm test` (Node's built-in runner, `node --test`). Single test: `node --test --test-name-pattern="一方通行" test/physics.test.js`.
- Single-file build: `npm run build` → `dist/index.html`. `node tools/build.js <out> --fragment` writes the body-only version used when publishing as a claude.ai Artifact.

## Architecture

- Every script is an IIFE that attaches to the global namespace `globalThis.Game` (`G`). Load order matters: `src/engine/physics.js` → `src/engine/core.js` → `src/game/data.js` → `src/game/sprites.js` → `src/modes/battle.js` → `src/modes/styles.js` → `src/modes/field.js` → `src/main.js`. Tests `require()` the same files in Node, so engine and mode files must not touch the DOM at load or construction time (only `main.js` does).
- `physics.js`: `Body` (rect or circle, center coordinates, px and seconds), `TileMap`, `World`. `World.step` integrates gravity, moves against tiles per axis in half-tile substeps (anti-tunneling), applies `zGravity` to a separate height axis, then detects overlaps via a spatial hash. Collision filtering is by bit layers: `mask` = layers this body wants `onEnter`/`onExit` callbacks for, `blocks` = layers it gets pushed out of. `body.contacts` holds the current overlaps.
- `core.js`: `Input` (keyboard + touch; `pressed()` is edge-triggered per fixed step and cleared by `endStep()`), `Scene` base class (owns a `World`, entities, particles; `stepWorld` order is entity update → physics step → remove dead), fixed-timestep `Loop`, and shared drawing helpers including the hitbox debug overlay (`G.draw.bodies`, uses `scene.project`).
- `src/game/data.js`: shared game content — `MONSTERS`, `SPELLS`, and `Party` (the hero's growth, damage formulas, `defeat(kind)` for EXP/gold). `main.js` creates one `Party` and passes it to every mode as `game.party`, so progress carries across modes. `party.flags` stores state that must survive a scene restart (opened chests).
- `src/game/sprites.js`: shared drawing (`hero`, `monster(kind)`, `fireball`, …), all drawn with the feet at (x, y). Every mode uses these so the same monster looks the same everywhere.
- `src/modes/field.js`: `G.FieldScene`, the one and only scene. Physics has no planar gravity but `zGravity` for jumping; it simulates in top-down 2D and converts to isometric only in `project()`. `setStyle(id)` switches style in place (refused during a battle or dialog); switching to RPG removes symbols and projectiles. Exposes `G.field = { FieldMonster, Bolt, EnemyShot }` for tests.
- `src/modes/styles.js`: `G.styles.{rpg,act,stg}` — per-style rules only: `control(hero, input)` (what Z/C do), `fireInterval(kind)` (enemy shooting), `encounters`, `symbols`, optional `locksFacing(input)`. Movement, jump, talking, and physics settings are shared; add new behavior to the hero (`swing`, `shoot`, `cast`) and call it from a style.
- `src/modes/battle.js` (`G.Battle`): the RPG-style turn-based battle screen; it uses no physics and runs a message queue (`say(text, fn)` then `run(next)`), where `fn` applies the effect when that message appears.
- The engine still supports planar gravity and one-way platforms (covered by `test/physics.test.js`) even though the current field does not use them.
- Real-time styles give rewards through `scene.reward(kind, x, y)` and show damage numbers with `scene.popup(...)`; the HUD is the shared `G.draw.status`.
- Entities are plain objects with `body` or `bodies`, `update(dt)`, `draw(ctx)`; remove them with `scene.kill(e)`. `main.js` recreates the `FieldScene` (keeping the shared `Party`) on R.
- `index.html` contains `<!-- fragment:* -->` markers that `tools/build.js` relies on; keep them when editing the page.
