/*
 * 縮小プラグイン「ドット化」（imageFit に差し込んで使う）
 *
 * 大きな画像を、いきなり小さくするのではなく、いったん荒いドット絵に加工してから縮小する
 *   1. 仕上がりの DOT 倍（2倍）の細かさで、面積平均してドットにする
 *   2. 透明度を「透明」か「不透明」の2つにする（ふちがぼやけない）
 *   3. 色をメディアンカットで最大 COLORS 色に減らす（ドット絵らしい色数）
 *   4. 2×2 のドットごとに、いちばん多い色を選んで1画素にする（色を混ぜないのでぼけない）
 *      半分以上が不透明なら不透明にするので、細い部分も消えにくい
 *   5. 外側のふちを少し暗くして、小さくても形がわかるようにする
 *
 * このファイルを読み込むと「ドット化」が選べるようになり、標準の縮小方法になる。
 * ゲーム本体には手を入れていない。読み込まなければ今までどおり「なめらか」で縮小する
 */
(function (G) {
  'use strict';

  const DOT = 2;
  const COLORS = 16;
  const ALPHA_CUT = 128;
  const OUTLINE = 0.62; // ふちの明るさ（1 で暗くしない）

  // メディアンカット：色の幅がいちばん広い箱を、中央で2つに割ることをくり返す
  function medianCut(colors, n) {
    if (!colors.length) return [];
    let boxes = [colors];
    while (boxes.length < n) {
      let best = -1, bestRange = 0, bestCh = 0;
      boxes.forEach((box, i) => {
        if (box.length < 2) return;
        for (let ch = 0; ch < 3; ch++) {
          let lo = 255, hi = 0;
          for (const c of box) {
            if (c[ch] < lo) lo = c[ch];
            if (c[ch] > hi) hi = c[ch];
          }
          if (hi - lo > bestRange) { bestRange = hi - lo; best = i; bestCh = ch; }
        }
      });
      if (best < 0) break; // これ以上割れない（色が少ない）
      const box = boxes[best].sort((a, b) => a[bestCh] - b[bestCh]);
      const mid = box.length >> 1;
      boxes.splice(best, 1, box.slice(0, mid), box.slice(mid));
    }
    return boxes.map((box) => {
      const sum = [0, 0, 0];
      for (const c of box) { sum[0] += c[0]; sum[1] += c[1]; sum[2] += c[2]; }
      return sum.map((v) => Math.round(v / box.length));
    });
  }

  function nearest(palette, r, g, b) {
    let best = 0, bestD = Infinity;
    for (let i = 0; i < palette.length; i++) {
      const p = palette[i];
      const d = (p[0] - r) ** 2 + (p[1] - g) ** 2 + (p[2] - b) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  function shrink(src, sw, sh, dw, dh, { resample }) {
    const gw = dw * DOT, gh = dh * DOT;

    // 1. 荒いドットにする
    const dots = resample(src, sw, sh, gw, gh);

    // 2. 透明か不透明か
    const colors = [];
    for (let i = 0; i < dots.length; i += 4) {
      if (dots[i + 3] < ALPHA_CUT) { dots[i + 3] = 0; continue; }
      dots[i + 3] = 255;
      colors.push([dots[i], dots[i + 1], dots[i + 2]]);
    }

    // 3. 色を減らす
    const palette = medianCut(colors, COLORS);
    const index = new Int16Array(gw * gh).fill(-1);
    for (let i = 0; i < gw * gh; i++) {
      if (dots[i * 4 + 3]) index[i] = nearest(palette, dots[i * 4], dots[i * 4 + 1], dots[i * 4 + 2]);
    }

    // 4. 2×2 ごとにいちばん多い色
    const out = new Uint8ClampedArray(dw * dh * 4);
    const count = new Int16Array(palette.length);
    for (let y = 0; y < dh; y++) {
      for (let x = 0; x < dw; x++) {
        count.fill(0);
        let clear = 0, best = -1;
        for (let j = 0; j < DOT; j++) {
          for (let i = 0; i < DOT; i++) {
            const c = index[(y * DOT + j) * gw + x * DOT + i];
            if (c < 0) { clear++; continue; }
            count[c]++;
            if (best < 0 || count[c] > count[best]) best = c;
          }
        }
        if (clear * 2 > DOT * DOT || best < 0) continue;
        const d = (y * dw + x) * 4, p = palette[best];
        out[d] = p[0]; out[d + 1] = p[1]; out[d + 2] = p[2]; out[d + 3] = 255;
      }
    }

    // 5. 外側のふち（上下左右のどこかが透明）を少し暗くする
    const solid = (x, y) => x >= 0 && y >= 0 && x < dw && y < dh && out[(y * dw + x) * 4 + 3] > 0;
    const edge = [];
    for (let y = 0; y < dh; y++) {
      for (let x = 0; x < dw; x++) {
        if (solid(x, y) && !(solid(x - 1, y) && solid(x + 1, y) && solid(x, y - 1) && solid(x, y + 1))) edge.push((y * dw + x) * 4);
      }
    }
    for (const d of edge) { out[d] *= OUTLINE; out[d + 1] *= OUTLINE; out[d + 2] *= OUTLINE; }
    return out;
  }

  G.plugins.imageFit.register('dot', { label: 'ドット化（荒いドットにしてから縮小）', shrink }, { select: true });
  G.plugins.shrinkDot = { shrink, medianCut, DOT, COLORS };
})(globalThis.Game = globalThis.Game || {});
