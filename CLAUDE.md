# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A browser-based, turn-based strategy game in vanilla JavaScript (no libraries/frameworks, no build step). Style is modeled on Sangokushi / Nobunaga's Ambition: a strategic map with command-based turns (内政/徴兵/出陣/武将移動/褒賞/委任), named generals with stats, personality, loyalty and affinity, plus a separate tactical grid map for battles.

## Running it

Just open `index.html` in a browser — double-clicking the file (`file://`) works. The scripts are deliberately plain classic scripts rather than ES modules, because `file://` blocks module loading with a CORS error; keep it that way unless you are willing to require a server. Serving over HTTP (`python3 -m http.server 8000`) also works.

Since the files share one global scope, `index.html` must load them in dependency order (data → state → battle → ai → ui → main), and new top-level names must not collide across files.

There is no build/lint/test tooling; verify changes by exercising the UI in a browser (or headlessly with Playwright).

## Architecture

- `index.html` / `css/style.css` — page shell and styling (dark strategy-game theme). Three overlays live in the DOM: the main map+panel view, the battle overlay, and the game-over overlay.
- `js/data.js` — static data: the 15 provinces (id, display name, canvas x/y, base kokudaka, terrain profile, neighbor ids), the daimyo house metadata (name/color) that starts in each province, and the `GENERALS` roster. `owari` is the player's house.
- `js/state.js` — mutable game state factory (`createInitialState`) and pure-ish mutators: `developProvince`, `recruitTroops`, `collectIncome`, `checkGameOver`, `updateDaimyoAliveStatus`. `maxTroops`/`incomeOf` are the core balance formulas, derived from a province's `kokudaka`.
- `js/ai.js` — `decideProvinceAction`, the single decision routine used by *every* province the player does not personally command (rival houses and the player's own delegated provinces alike), plus `simulateAutoBattle`, a fast non-interactive resolver.
- `js/battle.js` — the tactical battle engine: splits a province's army into squads on a grid (`COLS`×`ROWS`), terrain (`TERRAIN`/`TERRAIN_PROFILES`), movement/attack rules, a simple chase-and-attack AI (`aiTakeSideTurn`), turn/round bookkeeping, and `resolveBattleOutcome` which writes the result back into `state` (ownership transfer, surviving troop counts).
- `js/ui.js` — all DOM/canvas rendering (strategic map, side panel, log, battle grid) and hit-testing helpers (`hitTestProvince`, `cellFromPixel`, `findSquadAt` lives in battle.js). Contains no game-rule logic.
- `js/main.js` — entry point and orchestration: wires DOM events, owns the single mutable `state` object, drives the end-of-turn AI phase (`runAIPhase`) and the interactive battle turn loop (`startBattle`/`doSwitchTurn`/`finishBattle`). This is the only place that decides *when* a battle is interactive (player is attacker or defender) versus auto-resolved (AI vs AI).

## Key design points worth knowing before changing behavior

- One command per province per turn, tracked via `state.actedProvinces` (cleared on `endTurn`).
- A general has no house field: they serve whoever owns the province they are stationed in, so conquest and defection are just a `provinceId`/ownership change. 政治 scales 内政 and 徴兵 (`administrationFactor`), 武勇/統率 scale damage dealt/absorbed per squad (`valorFactor`/`leadFactor`), and `simulateAutoBattle` approximates the same with `commanderEdge` so AI-vs-AI fights respect generals too.
- There is no global AI. Each province is run by its `governorOf`, and the three axes do different jobs, deliberately: **personality** (`PERSONALITIES` in data.js) sets appetite — when to attack, what to target, whether to hold ground in battle (`charge`); **ability** sets judgment, not just output — `pickTarget` distorts each neighbor's apparent strength by `(1 - skill)`, so a dull commander marches into fights he cannot win while an able one reads the field almost correctly; **loyalty** decides whether the governor serves at all (a disaffected one shirks his turn). Ability was originally only a multiplier on outcomes, and a cautious mediocrity then outperformed a brilliant strategist — if you touch these, re-check that an able governor still beats a mediocre one.
- Loyalty settles at what the lord's character earns (`loyaltyTarget`: affinity to the lord + personality bias), moves ±3 a turn, and takes a house-wide hit whenever the house loses a province (`shiftHouseMorale`). That feedback loop is what makes defection happen at all: without it every general who joined was compatible by construction, and 離反/謀反 were dead code. 褒賞 (`rewardGenerals`) is the player's lever against it.
- Delegated provinces (`prov.delegated`) run through the same `decideProvinceAction` as enemies, and their battles always auto-resolve — handing a province to a governor means not being asked to fight its battles, whether it attacks or is attacked.
- Armies take their best commanders with them (`marchingGeneralsFrom`, capped at `MAX_SQUADS`), leaving the ablest administrator behind as castellan whenever the province has three or more. Without that, and without 武将移動 and `restaffNeighbor`, conquered land ends up permanently leaderless and develops at the no-governor penalty.
- Battles involving the player always use the tactical grid map in `battle.js`; AI-vs-AI battles are resolved instantly via `ai.js#simulateAutoBattle` to keep end-turn processing fast.
- Battle terrain is generated per battle from the *defending* province's `terrain` profile, so each province has a characteristic battlefield. Generation guarantees both deployment zones (outer two columns) are passable and that the two sides can reach each other (`sidesAreConnected`) — mountains are impassable, so an unvalidated map could otherwise be unwinnable. Movement is a cost-based search (`reachableCells`) where other squads block the path.
- Terrain constants interact with `MAX_ROUNDS`: forest/hill cut damage, so rugged provinces take noticeably longer to decide. Evenly matched mountain battles intentionally favor the defender by timeout; lopsided ones still resolve (verified ~59/60 attacker wins at a 2000 vs 1200 ratio). Re-check both if you tune terrain modifiers.
- Campaign pacing now comes out of the personality table rather than one global aggression constant. Earlier, more naive heuristics sent nearly the whole map to war on turn 1, and an over-correction produced 30 turns of total peace; if you tune `aggression`/`oddsNeeded`/`garrisonFloor`, re-verify over ~20-40 simulated turns that wars still start and still resolve.
