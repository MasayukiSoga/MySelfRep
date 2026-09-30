# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development commands

- `npm install` — install dependencies
- `npm run dev` — start the Vite dev server (http://localhost:5173) with hot reload
- `npm run build` — typecheck (`tsc -b`) then produce a production build in `dist/`
- `npm run preview` — serve the production build locally

There is no lint or test setup yet.

## Architecture

Phaser 3 + TypeScript turn-based strategy prototype (Sangokushi / Nobunaga's Ambition style), bundled with Vite. Everything is drawn with Phaser primitives (circles, lines, text) — there are no image/audio assets.

- `src/types.ts` — shared types: `Province`, `Faction` (`player` | `enemy` | `neutral`), `CommandType`.
- `src/data/provinces.ts` — initial map data (province stats, position, neighbors).
- `src/game/GameState.ts` — all game rules and mutation logic, framework-agnostic: `develop`/`recruit`/`invade` commands (one per province per turn), a simple enemy AI run during `endTurn`, resource income/upkeep, and win/lose checks. This is the layer to extend when adding new commands or mechanics.
- `src/scenes/MainScene.ts` — the single Phaser scene. Renders the province map and a side panel (info + command buttons + event log) from `GameState`, and forwards clicks back into `GameState` methods. Province circle colors are updated in place each `refresh()` since ownership changes at runtime.
- `src/main.ts` — Phaser game bootstrap (960x640 canvas mounted into `#app`).

A second page, `roster.html` (entry `src/roster.ts`, scene `src/scenes/RosterScene.ts`), is a demo of procedural portraits for a large cast (30,000 characters). Vite builds both pages via `build.rollupOptions.input` in `vite.config.ts`.

- `src/portrait/rng.ts` — seeded PRNG (mulberry32); everything generated from a seed is deterministic.
- `src/portrait/portrait.ts` — anime-style procedural portraits. `traitsFor(seed, age, archetype)` picks parts; `drawPortrait` composites them with Canvas 2D in a 100x100 coordinate space scaled to any size (no image assets). The four archetypes (`rugged`/`cool` male, `cute`/`beauty` female) drive face shape, eye spec (`EYES`), brows, hair styles, clothing and background. Draw order matters: back hair → body → face → eyes/mouth → front hair (drawn twice: once offset and clipped to the face as its cast shadow) → headgear → brows (drawn last so they show through bangs).
- `src/portrait/PortraitCache.ts` — generates a portrait into a Phaser canvas texture on first use and keeps at most `maxSize` textures, evicting least-recently-used ones with `textures.remove`. Only request textures for what is on screen; the cap must stay larger than one screen's worth or visible textures get evicted.
- `src/roster/characters.ts` — deterministic character data (name, gender, age, stats, archetype, portrait seed) generated per id; archetype is derived from gender, age and the war/intelligence balance.

To add a new command: add the mutation method to `GameState`, then wire a button for it in `MainScene.drawCommandButtons()`.
