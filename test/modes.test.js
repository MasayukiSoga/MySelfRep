'use strict';

// 各モードを画面なしで数千ステップ動かし、例外が出ないことを確かめる
const test = require('node:test');
const assert = require('node:assert/strict');

require('../src/engine/physics.js');
require('../src/engine/core.js');
require('../src/modes/stg.js');
require('../src/modes/act.js');
require('../src/modes/rpg.js');
const G = globalThis.Game;

// 何を呼んでも何もしない Canvas の代わり
function fakeContext() {
  const noop = () => {};
  const gradient = { addColorStop: noop };
  return new Proxy({}, {
    get: (_, key) => (key === 'createLinearGradient' ? () => gradient : noop),
    set: () => true,
  });
}

function seeded(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

for (const id of ['stg', 'act', 'rpg']) {
  test(`${id} モードが動き続ける`, () => {
    const rnd = seeded(42);
    const input = new G.Input();
    const game = { input };
    let scene = G.modes[id].create(game);
    const ctx = fakeContext();
    const actions = ['left', 'right', 'up', 'down', 'a', 'b'];
    let restarts = 0;
    for (let i = 0; i < 6000; i++) {
      if (i % 20 === 0) {
        for (const a of actions) (rnd() < 0.35 ? input.press(a) : input.release(a));
      }
      scene.update(G.DT);
      if (scene.restart) { scene = G.modes[id].create(game); restarts++; }
      input.endStep();
      if (i % 10 === 0) {
        scene.draw(ctx);
        G.draw.bodies(ctx, scene);
      }
      for (const b of scene.world.bodies) {
        assert.ok(Number.isFinite(b.x) && Number.isFinite(b.y), `${id}: 座標が数値でなくなった`);
      }
    }
    assert.ok(restarts >= 0);
  });
}

test('ACT：主人公は地面の上に立って始まる', () => {
  const scene = G.modes.act.create({ input: new G.Input() });
  for (let i = 0; i < 30; i++) scene.update(G.DT);
  assert.ok(scene.hero.body.onGround);
  assert.equal(scene.hero.hp, 3);
});

test('ACT：剣は一振りで同じ敵に1回だけ当たる', () => {
  const input = new G.Input();
  const scene = G.modes.act.create({ input });
  for (let i = 0; i < 30; i++) scene.update(G.DT);
  const hero = scene.hero;
  // 敵を主人公の目の前に置く
  const enemy = scene.entities.find((e) => e.constructor.name === 'Walker');
  enemy.body.x = hero.body.x + 14;
  enemy.body.y = hero.body.y + 1;
  enemy.hp = 99;
  hero.facing = 1;
  hero.inv = 99;
  input.press('a');
  for (let i = 0; i < 20; i++) {
    enemy.body.vx = 0;
    enemy.body.x = hero.body.x + 14;
    scene.update(G.DT);
    input.endStep();
  }
  input.release('a');
  assert.equal(enemy.hp, 98);
});

test('RPG：画面の上を押すと、斜めの世界では x と y が両方減る', () => {
  const input = new G.Input();
  const scene = G.modes.rpg.create({ input });
  const b = scene.hero.body;
  const x0 = b.x, y0 = b.y;
  input.press('up');
  for (let i = 0; i < 5; i++) scene.update(G.DT);
  assert.ok(b.x < x0 && b.y < y0);
  const s0 = scene.project(x0, y0), s1 = scene.project(b.x, b.y);
  assert.ok(Math.abs(s1.x - s0.x) < 1e-6, '画面上ではまっすぐ上に動く');
});
