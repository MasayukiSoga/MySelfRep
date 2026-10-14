"""8方向キャラシート（4x2コマ）を固定サイズの透過スプライトに切り出すテスト用スクリプト。

使い方: python3 tools/slice_sprites.py <入力画像> <出力ディレクトリ> [幅 高さ]（省略時 64 128）
"""
import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

COLS, ROWS = 4, 2
OUT_W, OUT_H = 64, 128
LABEL_TOP = 455    # コマ内でこれより下はラベル領域として捨てる
SHADOW_TOP = 380   # これより下では足元の影も背景として除去する
MARGIN = 6         # コマの枠線を避ける余白

# 入力画像のコマ並び（左上から行優先）
LABELS = ["up_left", "left", "down", "right", "down_right", "up", "down_left", "up_right"]
# 出力シートの並び（下から時計回り）
SHEET_ORDER = ["down", "down_left", "left", "up_left", "up", "up_right", "right", "down_right"]


def remove_background(cell: np.ndarray) -> np.ndarray:
    """枠の外周から塗りつぶして、白背景と足元の影をアルファ0にする。"""
    h, w, _ = cell.shape
    rgb = cell.astype(int)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    white = rgb.min(axis=2) > 235
    # 影: 青みがかった灰色。濃い線画（輪郭）は通さない
    shadow = (rgb.min(axis=2) > 110) & (b - r < 70) & (b >= r)
    shadow[:SHADOW_TOP] = False
    passable = white | shadow

    bg = np.zeros((h, w), bool)
    q = deque()
    for y in range(h):
        for x in (0, w - 1):
            if passable[y, x]:
                bg[y, x] = True
                q.append((y, x))
    for x in range(w):
        for y in (0, h - 1):
            if passable[y, x] and not bg[y, x]:
                bg[y, x] = True
                q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and not bg[ny, nx] and passable[ny, nx]:
                bg[ny, nx] = True
                q.append((ny, nx))

    rgba = np.dstack([cell, np.where(bg, 0, 255).astype(np.uint8)])
    return rgba


def fit(sprite: Image.Image, scale: float) -> Image.Image:
    """共通の縮小率で縮め、横中央・足元下揃えで OUT_W x OUT_H に配置する。"""
    sprite = sprite.crop(sprite.getbbox())
    size = (max(1, round(sprite.width * scale)), max(1, round(sprite.height * scale)))
    small = sprite.resize(size, Image.LANCZOS)
    canvas = Image.new("RGBA", (OUT_W, OUT_H), (0, 0, 0, 0))
    canvas.alpha_composite(small, ((OUT_W - size[0]) // 2, OUT_H - size[1]))
    return canvas


def main(src: str, out_dir: str) -> None:
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    im = np.array(Image.open(src).convert("RGB"))
    ch, cw = im.shape[0] // ROWS, im.shape[1] // COLS

    cutouts = {}
    for i, name in enumerate(LABELS):
        r, c = divmod(i, COLS)
        cell = im[r * ch + MARGIN : r * ch + LABEL_TOP, c * cw + MARGIN : (c + 1) * cw - MARGIN]
        sprite = Image.fromarray(remove_background(cell), "RGBA")
        cutouts[name] = sprite.crop(sprite.getbbox())
        cutouts[name].save(out / f"cutout_{name}.png")

    # 向きによってキャラの大きさが変わらないよう、全コマで一番小さい縮小率に揃える
    scale = min(min(OUT_W / s.width, OUT_H / s.height) for s in cutouts.values())
    frames = {}
    for name, full in cutouts.items():
        frames[name] = fit(full, scale)
        frames[name].save(out / f"{name}.png")
        print(f"{name}: 元 {full.width}x{full.height} -> {frames[name].getbbox()[2] - frames[name].getbbox()[0]}x{OUT_H - frames[name].getbbox()[1]}")
    print(f"共通縮小率 {scale:.3f}")

    sheet = Image.new("RGBA", (OUT_W * len(SHEET_ORDER), OUT_H), (0, 0, 0, 0))
    for i, name in enumerate(SHEET_ORDER):
        sheet.alpha_composite(frames[name], (i * OUT_W, 0))
    sheet.save(out / f"sheet_{OUT_W}x{OUT_H}.png")

    # 確認用: チェッカー背景 + 4倍拡大（ニアレストネイバー）
    checker = Image.new("RGBA", sheet.size, (255, 255, 255, 255))
    px = checker.load()
    for y in range(sheet.height):
        for x in range(sheet.width):
            if (x // 8 + y // 8) % 2:
                px[x, y] = (200, 200, 200, 255)
    checker.alpha_composite(sheet)
    checker.resize((sheet.width * 4, sheet.height * 4), Image.NEAREST).save(out / "preview_x4.png")


if __name__ == "__main__":
    if len(sys.argv) == 5:
        OUT_W, OUT_H = int(sys.argv[3]), int(sys.argv[4])
    main(sys.argv[1], sys.argv[2])
