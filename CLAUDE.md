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

To add a new command: add the mutation method to `GameState`, then wire a button for it in `MainScene.drawCommandButtons()`.
