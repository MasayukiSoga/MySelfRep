# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

トリモード・アーケード: a browser game (plain JavaScript + Canvas, no dependencies, no bundler) that runs three genres — side-scrolling shooter (STG), platformer (ACT), and isometric RPG — on one shared simple physics engine. The user communicates in Japanese; UI text and code comments are Japanese.

## Commands

- Run: open `index.html` directly in a browser (classic `<script>` tags, so `file://` works; no server needed).
- Test: `npm test` (Node's built-in runner, `node --test`). Single test: `node --test --test-name-pattern="一方通行" test/physics.test.js`.
- Single-file build: `npm run build` → `dist/index.html`. `node tools/build.js <out> --fragment` writes the body-only version used when publishing as a claude.ai Artifact.

## Architecture

- Every script is an IIFE that attaches to the global namespace `globalThis.Game` (`G`). Load order matters: `src/engine/physics.js` → `src/engine/core.js` → `src/modes/*.js` → `src/main.js`. Tests `require()` the same files in Node, so engine and mode files must not touch the DOM at load or construction time (only `main.js` does).
- `physics.js`: `Body` (rect or circle, center coordinates, px and seconds), `TileMap`, `World`. `World.step` integrates gravity, moves against tiles per axis in half-tile substeps (anti-tunneling), applies `zGravity` to a separate height axis, then detects overlaps via a spatial hash. Collision filtering is by bit layers: `mask` = layers this body wants `onEnter`/`onExit` callbacks for, `blocks` = layers it gets pushed out of. `body.contacts` holds the current overlaps.
- `core.js`: `Input` (keyboard + touch; `pressed()` is edge-triggered per fixed step and cleared by `endStep()`), `Scene` base class (owns a `World`, entities, particles; `stepWorld` order is entity update → physics step → remove dead), fixed-timestep `Loop`, and shared drawing helpers including the hitbox debug overlay (`G.draw.bodies`, uses `scene.project`).
- `src/modes/*.js`: each registers `G.modes.<id> = { create(game) }` returning a Scene subclass. Modes differ only in `World` settings and rendering: STG has no gravity/tiles (overlap events only), ACT has gravity + one-way platforms, RPG has no planar gravity but `zGravity` for jumping and simulates in top-down 2D, converting to isometric only in `project()`.
- Entities are plain objects with `body` or `bodies`, `update(dt)`, `draw(ctx)`; remove them with `scene.kill(e)`. Scenes set `this.restart = true` to ask `main.js` to recreate them.
- `index.html` contains `<!-- fragment:* -->` markers that `tools/build.js` relies on; keep them when editing the page.
