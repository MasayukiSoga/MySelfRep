'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

require('../src/engine/physics.js');
require('../src/plugins/image-fit.js');
const { World, Body } = globalThis.Game;
const fit = globalThis.Game.plugins.imageFit;
// 標準の縮小プラグインで試す（ドット化は後ろのテストで読み込む）
fit.select('smooth');

// 単色・透明などの画素を並べて画像を作る
function image(w, h, pixel) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) data.set(pixel(x, y), (y * w + x) * 4);
  }
  return { data, width: w, height: h };
}
const Game = globalThis.Game;
const at = (px, w, x, y) => Array.from(px.slice((y * w + x) * 4, (y * w + x) * 4 + 4));

test('プラグイン：use() で組み込まれ、追加・削除・ステップの前後に呼ばれる', () => {
  const log = [];
  const plugin = {
    install: (w, o) => log.push(`install:${o.tag}`),
    onAdd: () => log.push('add'),
    onRemove: () => log.push('remove'),
    beforeStep: () => log.push('before'),
    afterStep: () => log.push('after'),
  };
  const world = new World();
  world.use(plugin, { tag: 'x' }).use(plugin);
  const b = world.add(new Body({ r: 4 }));
  world.step(1 / 60);
  world.remove(b);
  assert.deepEqual(log, ['install:x', 'add', 'before', 'after', 'remove']);
});

test('imageFit：use() すると world.skins ができ、渡した登録先を共有できる', () => {
  const shared = new Map();
  const a = new World().use(fit, { skins: shared });
  const b = new World().use(fit, { skins: shared });
  assert.equal(a.skins, shared);
  assert.equal(b.skins, shared);
  assert.ok(new World().use(fit).skins instanceof Map);
});

test('縮小は面積平均：2×2 の白黒の市松模様は灰色1画素になる', () => {
  const src = image(2, 2, (x, y) => ((x + y) % 2 ? [0, 0, 0, 255] : [255, 255, 255, 255]));
  const out = fit.resample(src.data, 2, 2, 1, 1);
  assert.deepEqual(at(out, 1, 0, 0), [128, 128, 128, 255]);
});

test('縮小で細い線が消えない：1px の線は薄くなっても残る', () => {
  // 100×100 の白地に、縦 1px の黒い線
  const src = image(100, 100, (x) => (x === 37 ? [0, 0, 0, 255] : [255, 255, 255, 255]));
  const out = fit.resample(src.data, 100, 100, 10, 10);
  const col = at(out, 10, 3, 5)[0];
  assert.ok(col < 255 && col > 200, `線のある列は少し暗くなる（${col}）`);
  assert.equal(at(out, 10, 6, 5)[0], 255);
});

test('半透明のふちが黒ずまない（不透明度を掛けてから平均する）', () => {
  // 左半分は不透明な赤、右半分は完全に透明（色の値は黒）
  const src = image(2, 1, (x) => (x === 0 ? [255, 0, 0, 255] : [0, 0, 0, 0]));
  const [r, g, b, a] = at(fit.resample(src.data, 2, 1, 1, 1), 1, 0, 0);
  assert.deepEqual([r, g, b], [255, 0, 0], '色は赤のまま');
  assert.ok(Math.abs(a - 128) <= 1, '不透明度は半分');
});

test('割り切れない縮小（3→2）でも明るさが保たれる', () => {
  const src = image(3, 1, (x) => [[0, 0, 0, 255], [255, 255, 255, 255], [0, 0, 0, 255]][x]);
  const out = fit.resample(src.data, 3, 1, 2, 1);
  // 真ん中の白は半分ずつ両側に入る
  assert.equal(at(out, 2, 0, 0)[0], at(out, 2, 1, 0)[0]);
  assert.ok(Math.abs(at(out, 2, 0, 0)[0] - 85) <= 1);
});

test('ドット絵モードは色を混ぜない', () => {
  const src = image(4, 4, (x) => (x < 2 ? [255, 0, 0, 255] : [0, 0, 255, 255]));
  const out = fit.resample(src.data, 4, 4, 2, 2, 'pixel');
  assert.deepEqual(at(out, 2, 0, 0), [255, 0, 0, 255]);
  assert.deepEqual(at(out, 2, 1, 1), [0, 0, 255, 255]);
});

test('透明な余白を切り取り、縦横比を保って収める', () => {
  // 300×200 の真ん中に 100×50 の不透明な四角
  const src = image(300, 200, (x, y) => (x >= 100 && x < 200 && y >= 75 && y < 125 ? [9, 9, 9, 255] : [0, 0, 0, 0]));
  const skin = new fit.Skin(src);
  assert.deepEqual(skin.trimmed, { x: 100, y: 75, w: 100, h: 50 });
  assert.equal(skin.aspect, 2);
  const px = skin.pixels(40, 40);
  assert.deepEqual([px.w, px.h], [40, 20]);
  assert.equal(skin.pixels(40, 40), px, '同じ大きさは覚えておいた結果を使う');
});

test('とても大きな画像は最初に 512px 以下まで縮めておく', () => {
  const src = image(1600, 1200, () => [200, 100, 50, 255]);
  const skin = new fit.Skin(src);
  assert.deepEqual([skin.base.w, skin.base.h], [512, 384]);
  assert.deepEqual(at(skin.pixels(32, 32).data, 32, 5, 5), [200, 100, 50, 255]);
});

test('当たり判定を画像の見えている部分に合わせる', () => {
  const src = image(80, 40, () => [0, 0, 0, 255]);
  const skin = new fit.Skin(src);
  const rect = fit.attach(new Body({ w: 10, h: 10 }), skin, { maxW: 30, maxH: 30, hitbox: true });
  assert.equal(rect.skin, skin);
  assert.deepEqual([rect.hw * 2, rect.hh * 2], [30, 15]);
  const circle = fit.attach(new Body({ r: 3 }), skin, { maxW: 30, maxH: 30, hitbox: true });
  assert.equal(circle.r, 7.5);
});

test('描画は今の拡大率に合わせた実ピクセルの大きさで縮小する', () => {
  const src = image(400, 400, () => [10, 20, 30, 255]);
  const skin = new fit.Skin(src);
  const made = [];
  const orig = fit.createCanvas;
  fit.createCanvas = (w, h) => {
    made.push([w, h]);
    return { width: w, height: h, getContext: () => ({ createImageData: () => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {} }) };
  };
  const drawn = [];
  const ctx = { globalAlpha: 1, getTransform: () => ({ a: 6, b: 0 }), drawImage: (...args) => drawn.push(args.slice(1)) };
  skin.draw(ctx, 20, 10, { lift: 2 });
  fit.createCanvas = orig;
  assert.deepEqual(made, [[60, 60]], '20×10 の枠 × 拡大率 6 → 60×60 に縮小');
  assert.deepEqual(drawn[0], [-5, -12, 10, 10], '座標系では 10×10、足元から 2 浮かせる');
});

test('縮小プラグインを切り替えると、同じ画像も新しい方法で縮小し直す（本体はそのまま）', () => {
  const src = image(8, 8, (x) => (x < 4 ? [255, 0, 0, 255] : [0, 0, 255, 255]));
  const skin = new fit.Skin(src);
  fit.select('smooth');
  const smooth = skin.pixels(3, 3);
  fit.select('pixel');
  const pixel = skin.pixels(3, 3);
  assert.notEqual(smooth, pixel);
  assert.deepEqual(at(pixel.data, 3, 1, 1), [0, 0, 255, 255], 'くっきりは色を混ぜない');
  assert.notDeepEqual(at(smooth.data, 3, 1, 1), [0, 0, 255, 255], 'なめらかは境目の色が混ざる');
  assert.equal(fit.select('ないもの'), false);
  fit.select('smooth');
});

test('縮小プラグインを登録すると選べるようになる', () => {
  const calls = [];
  fit.register('test-flat', { label: '単色', shrink: (src, sw, sh, dw, dh, tools) => { calls.push(typeof tools.resample); return new Uint8ClampedArray(dw * dh * 4).fill(77); } });
  const skin = new fit.Skin(image(4, 4, () => [1, 2, 3, 255]), { shrinker: 'test-flat' });
  assert.deepEqual(at(skin.pixels(2, 2).data, 2, 0, 0), [77, 77, 77, 77]);
  assert.deepEqual(calls, ['function'], '縮小プラグインには道具（resample など）が渡される');
  assert.equal(fit.active, 'smooth', '登録しただけでは切り替わらない');
  delete fit.shrinkers['test-flat'];
});

test('ドット化：読み込むと標準になり、透明度は2段階、色は16色以内、色を混ぜない', () => {
  require('../src/plugins/shrink-dot.js');
  assert.equal(fit.active, 'dot');
  // なめらかなグラデーションの円（ふちは半透明）
  const src = image(200, 200, (x, y) => {
    const d = Math.hypot(x - 100, y - 100);
    const a = d < 80 ? 255 : d < 90 ? Math.round(255 * (90 - d) / 10) : 0;
    return [Math.round(x * 1.2), Math.round(y * 1.2), 128, a];
  });
  const skin = new fit.Skin(src);
  const { data, w, h } = skin.pixels(24, 24);
  const alphas = new Set(), colors = new Set();
  for (let i = 0; i < data.length; i += 4) {
    alphas.add(data[i + 3]);
    if (data[i + 3]) colors.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
  }
  assert.deepEqual([...alphas].sort((a, b) => a - b), [0, 255]);
  // ふちを暗くした色を含めても、元の16色の2倍まで
  assert.ok(colors.size <= 32, `色数 ${colors.size}`);
  assert.deepEqual([w, h], [24, 24]);
  // 真ん中は不透明、角は透明
  assert.equal(at(data, w, 12, 12)[3], 255);
  assert.equal(at(data, w, 0, 0)[3], 0);
});

test('ドット化：外側のふちは暗く、内側は元の色のまま', () => {
  const src = image(40, 40, (x, y) => (x >= 10 && x < 30 && y >= 10 && y < 30 ? [200, 200, 200, 255] : [0, 0, 0, 0]));
  const out = Game.plugins.shrinkDot.shrink(src.data, 40, 40, 8, 8, { resample: fit.resample });
  const inner = at(out, 8, 4, 4), border = at(out, 8, 2, 4);
  assert.deepEqual(inner, [200, 200, 200, 255]);
  assert.ok(border[3] === 255 && border[0] < 200, `ふち ${border}`);
  assert.equal(at(out, 8, 0, 0)[3], 0);
});

test('ドット化：メディアンカットは指定した数まで色を減らす', () => {
  const colors = [];
  for (let i = 0; i < 1000; i++) colors.push([i % 256, (i * 7) % 256, (i * 13) % 256]);
  assert.equal(Game.plugins.shrinkDot.medianCut(colors, 16).length, 16);
  assert.equal(Game.plugins.shrinkDot.medianCut([[1, 2, 3], [1, 2, 3]], 16).length, 1, '同じ色しかなければ割らない');
});
