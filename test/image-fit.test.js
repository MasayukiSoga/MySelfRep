'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

require('../src/engine/physics.js');
require('../src/plugins/image-fit.js');
const { World, Body } = globalThis.Game;
const fit = globalThis.Game.plugins.imageFit;

// 単色・透明などの画素を並べて画像を作る
function image(w, h, pixel) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) data.set(pixel(x, y), (y * w + x) * 4);
  }
  return { data, width: w, height: h };
}
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
