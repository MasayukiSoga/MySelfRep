# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

`tactics/` — SFC「タクティクスオウガ」風の疑似立体（クォータービュー）SRPG バトル画面。依存ライブラリ・ビルド工程なしの素の HTML/CSS/JavaScript。

## Commands

- 実行: `tactics/index.html` をブラウザで直接開く（または `python3 -m http.server -d tactics` で配信）。
- ビルド・lint・テストは未整備。動作確認は Playwright（グローバルインストール済み）でページを開き、`pageerror` が出ないこと・スクリーンショットを目視確認する。

## Architecture

- `tactics/maps.js`: マップ定義（`window.TACTICS_MAPS`）。高さは 36 進 1 文字/マス（10 段以上は a=10…）、地形は文字コード、壊せる城門 `gates`、ユニット配置、勝利条件 `objective`、増援 `reinforcements` もここ（書式はファイル先頭のコメント）。新マップはこの配列に追加するだけでマップ選択に出る。`?map=<id>` で直接開始。
- `tactics/game.js`: エンジン本体。`loadMap` がマップ定義から `tiles` / `units` / `gates` / カメラ可動域を作り直す。
- `tactics/editor.html` / `editor.js` / `editor.css`: マップエディタ。内部モデルは数値配列（`fromDef` / `toDef` で maps.js 形式と相互変換）。編集結果は localStorage `tactics.editorMap` に自動保存され、ゲームのマップ選択に id `custom`（`?map=custom`）として出る。右側のプレビューは `index.html?preview=1` を iframe で埋め込み、`postMessage`（`tactics-map` を送る / `tactics-pick`・`tactics-preview-ready` を受ける）でやり取りする。ゲーム側のプレビューモードは `state.phase === 'preview'`。

- 内部解像度は SFC と同じ 256x224。canvas は `image-rendering: pixelated`、HUD は DOM で `#game` ごと CSS transform で拡大する。
- 画像素材は無し。地形タイルは `buildTile` が 1 マス分の「柱」（上面ひし形 + 左右側面）を ImageData でドット生成して起動時にキャッシュ。キャラは `SPRITES` の文字列ドット絵をチーム別パレットで着色し、4 方向×2 フレームを生成（背面は顔を髪色で塗る、左向きは反転）。
- 座標変換: `worldPos(x, y, h) = [(x - y) * 16, (x + y) * 8 - h * 8]`。描画は x+y 昇順の画家のアルゴリズムで、ユニットは足元タイルの直後（キー +0.5）に描くので手前の高い地形に正しく隠れる。ユニットやカーソルを大きく隠す手前の柱（城壁など）は `drawTile` で半透明にする。
- 高さは 2 種類: `H()` はルール上の足場の高さ、`topH()` は見た目の上端（城門のように `tile.drawH` を持つマス）。城門は x 方向に複数マス並ぶ 1 つのオブジェクト（`isObject`、HP 共有、各マスは `tile.gate` で参照）。正面の扉・アーチは `gatePixel` が門全体の横位置から描く。攻撃は狙ったマス `pos` を基準に計算し、HP 0 で全マスが瓦礫になって通行可能になる。
- ターン制は WT（ウェイトターン）方式: WT 最小のユニットが行動し、行動量に応じて WT が戻る。WT の経過 100 で 1 ラウンド（`round()`）。増援と survive/defend の勝利判定はラウンド基準で、`nextTurn` の冒頭で処理する。勝敗判定は `checkEnd` に集約。`state.phase`（title/menu/look/move/target/facing/busy/over）で入力の意味が切り替わる。
- 戦闘計算 `forecast`: 高低差・攻撃方向（正面/側面/背面）で命中とダメージが変化。弓は高所で射程延長、近接は高さ差 2 まで。
- AI は `aiTurn` を敵とオートバトル中の味方で共有（移動済み・行動済みから途中で引き継げる）。挙動はユニットごとの思考ルーチン `u.ai`（`AI_PROFILES` の定義表：攻撃するか・移動目標・危険回避・射手の距離・弱者狙いなどの重み）で決まる。`aiOf` が未指定時の既定（味方 cautious / 敵将 guard / 防衛戦の敵 objective / 他 aggressive）を返す。新しい性格は `AI_PROFILES` に 1 行足すのが基本で、移動目標の種類を増やすときだけ `chooseMove` を触る。
- イベント: マップの `events`（`{ when, do }`）を `runEvents` が移動後・攻撃後・ターン開始時に評価し、条件成立で 1 回だけ `doAction` を実行（思考の切り替え `setAi`、能力変化 `buff`、台詞、増援、離脱 `escape`、勝敗決定）。対象指定は `selectUnits`（id / name / `@enemy` 等）。条件の種類は `evalCond` に追加する。離脱したユニットは `dead && escaped` で、撃破扱いにはならない。
- 早送り: `speed()` が敵の手番中（とオートバトル中）だけ 4 を返し、`wait` / `tween` の時間を割る。演出の待ち時間は必ずこの 2 つを通すこと。
- 魔物クラスは `CLASSES` の `pal` で固有配色を持ち、チーム色を上書きする。
- 大型ユニット（`CLASSES` の `size` > 1、例: golem 4×4）: `(x, y)` は占有範囲の奥の角。占有判定は `covers` / `unitAt`、距離は `gap`（体の端から）、足場の高さは `footH`（占有マスの最大）、移動は `computeReachBig`（`bigSpot` で全マスの通行・起伏 3 段以内を確認）。見た目は `GOLEM_MODEL` の直方体を `buildVoxel` でタイルと同じ投影に描いたもの（部位は `part(横位置, 前後位置, 一辺, 高さ)` で置く。2 段でおよそマスの一辺の長さなので、人型に見せるには背丈を横幅より十分高くする）。描画は `bigStrips` で 16px 幅の縦の短冊に分け、各短冊をその列で最も手前の占有マスの直後に描くことで前後関係を保つ。後ろにカーソルがあると半透明（`updateGhost`）。
- 1 マス 1 ユニット: 止まれるのは空いたマスだけ。移動中は味方のマスを通過できる（相手は不可）。大型ユニットも同じで、味方と重なる位置は `pass` 付きの通過点として `stopTiles` から除く。`loadMap` は重なった初期配置を近くの空きマスへずらし、`moveAlong` の後に重なりを検出すると console.error を出す。
- 飛行ユニット（`CLASSES` の `fly` = 高度の段、`climb` = 1 歩で越えられる段差）: 移動の可否は `stepOk`（飛行は水も越え、`topH` 基準で climb 段まで。地上は通行不可地形と jump）。相手の地上ユニットの上も飛び越えられるが、止まれるのは空いたマスだけ（城門の上も不可）。高さの比較は `effH`（足場＋高度）と `targetH`（攻撃マスの高さ＋そこにいる飛行ユニットの高度）。地上の近接は高低差 reachH（既定 2）までしか届かず、飛行ユニットの近接は急降下（`flyOff`）なので高低差を問わない。弓は飛行ユニットに命中 +15・ダメージ ×1.3。描画は影を地面に残し本体を `bodyAlt`（高度＋揺れ）ぶん持ち上げ、カーソル中・行動中は足元へ点線を引く。騎乗兵（pegasusKnight / griffonRider）は乗騎のドット絵に `RIDER` を重ねたもの。スプライトの幅は定義ごとに可変（`w`）、下端が足元（`canvas.foot`）、`flap` で 2 コマ目に翼 v を下げる。
- ZOC: 相手ユニットに隣接するマス（大型ユニットは体の周囲）に入るとその手番の移動が止まる（開始マスからは抜け出せる）。`zocSet` が止まるマスを作り、`computeReach` / `computeReachBig` はそのノードに `zoc` を付けて先へ展開しない。高度 3 以上の飛行ユニットは ZOC を持たず受けない（`zocUnit`）。マップの `rules: { zoc: false }` で無効。移動範囲では止まるマスを橙で、相手にカーソルを合わせるとその ZOC（`state.zocShow`）を表示。
- 膠着対策: 3 ラウンド（`state.lastAttack` から WT 300）誰も攻撃しないと、オートの味方は危険回避を切って攻める。20 ラウンド攻撃がなければ時間切れで敗北。
- 開発用: `?debug` を付けると `window.__tactics`（state / units / tiles / computeReach / aiOf）から内部状態を覗ける。
- 天井: `rules.ceiling` / `rules.ceilingAreas`。`altAt` が「天井 − 足場 − 1」と fly の小さい方を返し、minFly 未満なら 0（飛べない）。飛べない飛行ユニットは `grounded`、移動は `moveOf`（groundMove）と `stepOk` の地上ルール（groundJump）。飛行中は天井が低くて飛べないマスには入れない。イベント `ceiling` で変更可。
- 地形の被害: 溶岩（`TERRAIN.lava.hazard`）の上で移動を終えるか手番を迎えると `applyHazard`（地上 80% / 飛行 30% / fireRes 無傷）。AI は倒れるマスを除き、被害のあるマスを嫌う。
- 奈落（void：誰も入れない・描かない）と雲海（cloud：飛行のみ）。`knockback` を持つクラスの攻撃が当たると、攻撃の向きへ `knockPath` で 1 マスずつ押し（壁・段差・相手・城門に当たればそこで止まる。`knockback2` はもう 1 マス押す確率で、シールドナイトは 45%）、奈落・マップ外（`rules.edgeFall`）へ出ると転落（`dead && fell`、撃破扱い）。地上ユニットは雲海へ押されても転落。AI は突き落とせる攻撃を撃破と同等に評価。`rules.floating` で陸地の下に岩の底を描く。背景は `bg`（night / cave / sky）。
- ミニマップ（M）は `drawMinimap`。描画は画面内のマスだけを並べ替え、`threatMap` は射程の届く範囲だけを調べるので 64×64 まで実用的。
