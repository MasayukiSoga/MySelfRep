# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A browser-based, turn-based strategy game in vanilla JavaScript (no libraries/frameworks, no build step). Style is modeled on Sangokushi / Nobunaga's Ambition: a strategic map with command-based turns (内政/徴兵/出陣), plus a separate tactical grid map for battles.

## Running it

Because the code uses native ES modules (`<script type="module">` and `import`/`export`), it must be served over HTTP — opening `index.html` directly via `file://` will fail with a CORS error. From the repo root:

```
python3 -m http.server 8000
```

Then open `http://localhost:8000/`. There is no build/lint/test tooling; verify changes by exercising the UI in a browser (or headlessly with Playwright, pointed at the local server, not the `file://` path).

## Architecture

- `index.html` / `css/style.css` — page shell and styling (dark strategy-game theme). Three overlays live in the DOM: the main map+panel view, the battle overlay, and the game-over overlay.
- `js/data.js` — static data: the 15 provinces (id, display name, canvas x/y, base kokudaka, neighbor ids) and the daimyo house metadata (name/color) that starts in each province. `owari` is the player's house.
- `js/state.js` — mutable game state factory (`createInitialState`) and pure-ish mutators: `developProvince`, `recruitTroops`, `collectIncome`, `checkGameOver`, `updateDaimyoAliveStatus`. `maxTroops`/`incomeOf` are the core balance formulas, derived from a province's `kokudaka`.
- `js/ai.js` — per-province AI heuristic (`aiDecideAndAct`: recruit if under-garrisoned, otherwise sometimes invade a visibly weaker neighbor, otherwise develop) and `simulateAutoBattle`, a fast non-interactive resolver used when neither side of a fight is the player.
- `js/battle.js` — the tactical battle engine: splits a province's army into squads on a grid (`COLS`×`ROWS`), movement/attack rules, a simple chase-and-attack AI (`aiTakeSideTurn`), turn/round bookkeeping, and `resolveBattleOutcome` which writes the result back into `state` (ownership transfer, surviving troop counts).
- `js/ui.js` — all DOM/canvas rendering (strategic map, side panel, log, battle grid) and hit-testing helpers (`hitTestProvince`, `cellFromPixel`, `findSquadAt` lives in battle.js). Contains no game-rule logic.
- `js/main.js` — entry point and orchestration: wires DOM events, owns the single mutable `state` object, drives the end-of-turn AI phase (`runAIPhase`) and the interactive battle turn loop (`startBattle`/`doSwitchTurn`/`finishBattle`). This is the only place that decides *when* a battle is interactive (player is attacker or defender) versus auto-resolved (AI vs AI).

## Key design points worth knowing before changing behavior

- One command per province per turn, tracked via `state.actedProvinces` (cleared on `endTurn`).
- Battles involving the player always use the tactical grid map in `battle.js`; AI-vs-AI battles are resolved instantly via `ai.js#simulateAutoBattle` to keep end-turn processing fast.
- AI aggression is intentionally throttled (troop-ratio threshold + a random "feeling bold" roll in `aiDecideAndAct`) — earlier, more naive heuristics caused nearly the entire map to go to war on turn 1. If you tune these constants, re-verify pacing over ~20-30 simulated turns, not just the first couple.
