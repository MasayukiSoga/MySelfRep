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
- AI は `aiTurn` を敵とオートバトル中の味方で共有（移動済み・行動済みから途中で引き継げる）。味方だけ `threatMap` の被ダメージ見積もりで倒されうるマスを避ける。敵リーダーは攻撃できないときは動かない。
- 早送り: `speed()` が敵の手番中（とオートバトル中）だけ 4 を返し、`wait` / `tween` の時間を割る。演出の待ち時間は必ずこの 2 つを通すこと。
- 魔物クラスは `CLASSES` の `pal` で固有配色を持ち、チーム色を上書きする。
