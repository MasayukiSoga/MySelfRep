"""1方向1コマのスプライトから、歩行用の仮シート（8方向 x 3コマ）を作る。

本物の歩きコマができるまでの確認用。足元だけを動かして「左足・直立・右足」を作る。
- 正面・背面: 足元の左半分／右半分を持ち上げる
- 横・斜め: 足元を前後に少しずらして持ち上げる

使い方: python3 tools/make_walk_sheet.py <1コマ画像のディレクトリ> <出力PNG>
シートの並び: 行 = 方向（下から時計回り）、列 = [左足, 直立, 右足]
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ORDER = ["down", "down_left", "left", "up_left", "up", "up_right", "right", "down_right"]
FEET_RATIO = 0.16  # キャラの高さのうち、足元として動かす割合
LIFT = 2


def shift(region: np.ndarray, dx: int, dy: int) -> np.ndarray:
    out = np.zeros_like(region)
    h, w = region.shape[:2]
    ys, yd = (slice(max(0, -dy), h - max(0, dy)), slice(max(0, dy), h - max(0, -dy)))
    xs, xd = (slice(max(0, -dx), w - max(0, dx)), slice(max(0, dx), w - max(0, -dx)))
    out[yd, xd] = region[ys, xs]
    return out


def step(frame: np.ndarray, direction: str, foot: int) -> np.ndarray:
    """foot = -1 で左足、+1 で右足を前に出したコマを作る。"""
    alpha = frame[..., 3]
    rows = np.where(alpha.max(axis=1) > 0)[0]
    top, bottom = rows[0], rows[-1] + 1
    y0 = bottom - max(6, round((bottom - top) * FEET_RATIO))
    out = frame.copy()
    feet = frame[y0:bottom].copy()
    out[y0:bottom] = 0
    h, w = feet.shape[:2]

    if direction in ("down", "up"):
        # 画面上の左右どちらの足を持ち上げるか（背面は左右が逆になる）
        lift_left_half = (foot < 0) == (direction == "down")
        half = np.zeros_like(feet)
        mid = w // 2
        sl = slice(0, mid) if lift_left_half else slice(mid, w)
        half[:, sl] = feet[:, sl]
        rest = feet.copy()
        rest[:, sl] = 0
        moved = shift(half, 0, -LIFT)
        merged = np.where(moved[..., 3:4] > 0, moved, rest)
    else:
        facing = -1 if "left" in direction else 1
        merged = shift(feet, facing * foot * LIFT, -1)

    region = out[y0 - LIFT : bottom]
    pad = np.zeros((LIFT, w, 4), np.uint8)
    lifted = np.concatenate([merged, pad])  # 上方向にはみ出した分を含める
    lifted = np.concatenate([np.zeros((0, w, 4), np.uint8), lifted])
    # 足元の上 LIFT 行と合成（上書きは不透明な画素だけ）
    target = np.concatenate([region[:LIFT], np.zeros((h, w, 4), np.uint8)])
    combined = np.where(lifted[..., 3:4] > 0, lifted, target)
    out[y0 - LIFT : bottom] = combined[: bottom - y0 + LIFT]
    return out


def main(src_dir: str, dst: str) -> None:
    frames = {d: np.array(Image.open(Path(src_dir) / f"{d}.png").convert("RGBA")) for d in ORDER}
    h, w = frames["down"].shape[:2]
    sheet = Image.new("RGBA", (w * 3, h * len(ORDER)), (0, 0, 0, 0))
    for r, d in enumerate(ORDER):
        for c, img in enumerate((step(frames[d], d, -1), frames[d], step(frames[d], d, 1))):
            sheet.paste(Image.fromarray(img, "RGBA"), (c * w, r * h))
    sheet.save(dst)
    print(dst, sheet.size)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
