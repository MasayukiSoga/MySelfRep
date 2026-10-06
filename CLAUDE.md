# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- Restore: `dotnet restore`
- Build: `dotnet build`
- Run: `dotnet run --project src/MySelfRep/MySelfRep.csproj`

No test suite yet.

## Architecture

C# / MonoGame (DesktopGL) simulation game. Single project at `src/MySelfRep/`, opened via `MySelfRep.sln` (Rider/Visual Studio interoperable).

- `Program.cs`, `Game1.cs`: MonoGame entry point and bootstrap (window, content root, update/draw loop).
- `Content/Content.mgcb`: MonoGame content pipeline project (currently empty, no assets yet).
- `Core/`: cross-cutting game state.
  - `TurnManager`: turn progression and the per-turn 政治力 (political power) resource that limits how many commands can be used.
  - `PlayerState`: 信望 (world-to-player trust), kept separate from `Character.Hyouka` (player-to-character evaluation) since the design treats them as distinct.
  - `World` / `SampleWorld`: the aggregate game state and placeholder sample data.
  - `GameScreen` / `CommandRows` / `Labels`: the text-only screen layer. The whole command tree is shown at once as one vertically scrolling list with ┣/┗/┃ tree prefixes (same style as SPEC.md), not as drill-down menus. `GameScreen.Render()` returns a `ScreenModel` made entirely of strings (status line, title, rows with prefix/name/inline result lines, selected index, description); input goes through `TapRow(i)` only. Tapping a row once selects it and shows its description; tapping the same command again toggles its result lines inline under it (the spec requires the selected command's description to always be visible). Each prefix character is one grid cell, so renderers should draw prefixes cell by cell to keep the tree lines aligned. The platform renderer only draws these strings, so this layer is the shared contract between the TS prototype and MonoGame. `Game1` does not draw it yet (needs a SpriteFont with Japanese glyphs).
- `Domain/Command/`: the 8 top-level command categories (`CommandCategory`: 人事/軍事/商人/内政/調略/外交/情報/設定) and the full command tree with per-command descriptions (`CommandNode`, `CommandTree`).
- `Domain/Map/`: `Base` (any placed map entity — capital, city, dungeon, mine, etc.) and `Position`, the single xy-coordinate source that every map tier (world map, region map) is meant to render from.
- `Domain/Character/`: `Character` and its `Abilities` (統率/軍事/政治/知略), `Personality`, `Gender`.
- `Domain/Role/`: `RoleType` (役職) and `StarRank`, the shared ⭐️-accumulation rank used by both ranked roles (近衛/騎士団/魔術師/聖職者/傭兵団) and guilds.
- `Domain/Guild/`: `GuildType` and `GuildMembership`, modeling the two-stage guild promotion (member → guild-name title → unique title, e.g. 盗賊ギルド: 会員→盗賊→陽炎).

This is a skeleton only: types mirror what `SPEC.md`'s 決定事項 section has settled so far (structure and enums, not gameplay numbers/formulas — those are still 未決定事項). Full design spec, and what remains undecided, lives in `SPEC.md`; keep that file limited to 決定事項/未決定事項 only, no history or rationale prose.

## TypeScript Prototype (temporary)

`web-prototype/` mirrors `src/MySelfRep/Domain` and `Core` 1:1 in TypeScript (`src/domain/`, `src/core/`, including `GameScreen`/`CommandRows`/`CommandTree`), so the game can be tried in a browser, including on Android, without a C# toolchain. Screens are text only by design: no graphics, since anything graphical would not port to MonoGame. `src/main.ts` is the only browser-specific file and just prints a `ScreenModel` as text and wires taps to `tapRow`. When logic or a type changes, update both the TS and C# sides.

- Install: `cd web-prototype && npm install`
- Build: `npm run build` (type-checks with `tsc --noEmit`, then bundles `src/main.ts` into `dist/app.js` with esbuild)
- Run: open `web-prototype/index.html` after building. The same `index.html` (no `<html>/<head>/<body>` tags, as the Artifact publisher requires) is published as a private claude.ai artifact with `dist/app.js` alongside it for viewing on a phone.
- This is throwaway scaffolding, not the shipped implementation — the C# project under `src/MySelfRep/` is the real target.
