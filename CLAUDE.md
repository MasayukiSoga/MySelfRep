# CLAUDE.md

このファイルは、このリポジトリで作業する Claude Code (claude.ai/code) 向けの手引きです。

## 言語

- 会話の返答、リポジトリ内の文章（このファイル、SPEC.md、コード内コメント）、コミットメッセージはすべて日本語で書く
- ゲーム自体は最終的に日本語・英語の両対応を予定しているが、現時点の表示文言は日本語のみ

## 開発コマンド

- 復元: `dotnet restore`
- ビルド: `dotnet build`
- 実行: `dotnet run --project src/MySelfRep/MySelfRep.csproj`

テストはまだない。

## 構成

C# / MonoGame (DesktopGL) のシミュレーションゲーム。プロジェクトは `src/MySelfRep/` の1つのみで、`MySelfRep.sln` から開く（Rider / Visual Studio 両対応）。

- `Program.cs`, `Game1.cs`: MonoGame の起動処理（ウィンドウ、Content のルート、Update/Draw ループ）
- `Content/Content.mgcb`: MonoGame のコンテンツパイプライン（まだ素材なし）
- `Core/`: ゲーム全体にかかわる状態
  - `TurnManager`: ターン進行と、1ターンごとの政治力（使えるコマンド数を制限する資源）
  - `PlayerState`: 信望（世界からプレイヤーへの信頼）。`Character.Hyouka`（プレイヤーから人材への評価）とは仕様上別概念なので分けている
  - `World` / `SampleWorld`: ゲーム状態のまとまりと、仮のサンプルデータ
  - `GameScreen` / `CommandRows` / `Labels`: 文字だけの画面層。コマンドツリー全体を、SPEC.md と同じ ┣/┗/┃ の罫線付きで1本の縦スクロール一覧として表示する（階層を潜っていくメニューではない）。`GameScreen.Render()` はすべて文字列でできた `ScreenModel`（状態行、タイトル、罫線・名前・結果行を持つ各行、選択位置、説明文）を返し、入力は `TapRow(i)` のみ。1回目のタップで選択して説明を表示し、同じコマンドをもう一度タップすると結果行をその下に開閉する（仕様上、選択中コマンドの説明は常に表示する必要がある）。罫線は1文字=1マスなので、描画側は1文字ずつマスに入れて縦線を揃えること。描画側はこの文字列を表示するだけなので、この層が TS 試作と MonoGame の共通の取り決めになる。`Game1` はまだこれを描画していない（日本語グリフ入りの SpriteFont が必要）
- `Domain/Command/`: コマンド大分類8種（`CommandCategory`: 人事/軍事/商人/内政/調略/外交/情報/設定）と、各コマンドの説明文付きコマンドツリー（`CommandNode`, `CommandTree`）
- `Domain/Map/`: `Base`（首都・街・ダンジョン・鉱山など、マップ上に置くものすべて）と `Position`（世界マップ・地区マップなど全階層の表示の元になる xy 座標）
- `Domain/Character/`: `Character` と `Abilities`（統率/軍事/政治/知略）、`Personality`、`Gender`
- `Domain/Role/`: `RoleType`（役職）と `StarRank`（⭐️蓄積ランク。階級のある役職〈近衛/騎士団/魔術師/聖職者/傭兵団〉とギルドで共通）
- `Domain/Guild/`: `GuildType` と `GuildMembership`（ギルドの二段階昇格。会員 → ギルド名の称号 → 固有称号。例: 盗賊ギルドは 会員→盗賊→陽炎）

現時点は骨組みのみ。型は SPEC.md の「決定事項」で決まった範囲（構造と列挙値）だけを反映しており、数値や計算式は「未決定事項」のため入れていない。仕様全体と未決定の点は SPEC.md にある。SPEC.md は「決定事項」「未決定事項」だけを書き、経緯や理由の説明は書かない。

## TypeScript 試作（一時的）

`web-prototype/` は `src/MySelfRep/Domain` と `Core` を TypeScript で1対1に写したもの（`src/domain/`, `src/core/`。`GameScreen`/`CommandRows`/`CommandTree` を含む）。C# の環境がなくてもブラウザ（Android 含む）で試せるようにするためのもの。画面は意図的に文字だけにしている（図形などの表現は MonoGame へ移植できないため）。ブラウザ専用のファイルは `src/main.ts` だけで、`ScreenModel` を文字として表示し、タップを `tapRow` に渡すだけ。ロジックや型を変えたときは TS 側と C# 側の両方を更新すること。

- インストール: `cd web-prototype && npm install`
- ビルド: `npm run build`（`tsc --noEmit` で型検査したあと、esbuild で `src/main.ts` を `dist/app.js` にまとめる）
- 実行: ビルド後に `web-prototype/index.html` を開く。同じ `index.html`（Artifact の公開方式に合わせて `<html>/<head>/<body>` タグなし）を、`dist/app.js` と一緒に claude.ai の非公開ページとして公開しており、スマホから確認できる
- これは使い捨ての足場で、本番の実装ではない。本命は `src/MySelfRep/` の C# プロジェクト
