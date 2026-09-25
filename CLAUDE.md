# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

`tactics/` — SFC「タクティクスオウガ」風の疑似立体（クォータービュー）SRPG バトル画面。依存ライブラリ・ビルド工程なしの素の HTML/CSS/JavaScript。

## Commands

- 実行: `tactics/index.html` をブラウザで直接開く（または `python3 -m http.server -d tactics` で配信）。
- ビルド・lint・テストは未整備。動作確認は Playwright（グローバルインストール済み）でページを開き、`pageerror` が出ないこと・スクリーンショットを目視確認する。

## Architecture (tactics/game.js)

- 内部解像度は SFC と同じ 256x224。canvas は `image-rendering: pixelated`、HUD は DOM で `#game` ごと CSS transform で拡大する。
- 画像素材は無し。地形タイルは `buildTile` が 1 マス分の「柱」（上面ひし形 + 左右側面）を ImageData でドット生成して起動時にキャッシュ。キャラは `SPRITES` の文字列ドット絵をチーム別パレットで着色し、4 方向×2 フレームを生成（背面は顔を髪色で塗る、左向きは反転）。
- 座標変換: `worldPos(x, y, h) = [(x - y) * 16, (x + y) * 8 - h * 8]`。描画は x+y 昇順の画家のアルゴリズムで、ユニットは足元タイルの直後（キー +0.5）に描くので手前の高い地形に正しく隠れる。
- ターン制は WT（ウェイトターン）方式: WT 最小のユニットが行動し、行動量に応じて WT が戻る。`state.phase`（menu/look/move/target/facing/busy/over）で入力の意味が切り替わる。
- 戦闘計算 `forecast`: 高低差・攻撃方向（正面/側面/背面）で命中とダメージが変化。弓は高所で射程延長、近接は高さ差 2 まで。
