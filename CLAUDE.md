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
- `Domain/Command/`: the 8 top-level command categories (`CommandCategory`: 人事/軍事/商人/内政/調略/外交/情報/設定).
- `Domain/Map/`: `Base` (any placed map entity — capital, city, dungeon, mine, etc.) and `Position`, the single xy-coordinate source that every map tier (world map, region map) is meant to render from.
- `Domain/Character/`: `Character` and its `Abilities` (統率/軍事/政治/知略), `Personality`, `Gender`.
- `Domain/Role/`: `RoleType` (役職) and `StarRank`, the shared ⭐️-accumulation rank used by both ranked roles (近衛/騎士団/魔術師/聖職者/傭兵団) and guilds.
- `Domain/Guild/`: `GuildType` and `GuildMembership`, modeling the two-stage guild promotion (member → guild-name title → unique title, e.g. 盗賊ギルド: 会員→盗賊→陽炎).

This is a skeleton only: types mirror what `SPEC.md`'s 決定事項 section has settled so far (structure and enums, not gameplay numbers/formulas — those are still 未決定事項). Full design spec, and what remains undecided, lives in `SPEC.md`; keep that file limited to 決定事項/未決定事項 only, no history or rationale prose.
