'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

require('../src/engine/physics.js');
const { Body, World, TileMap, Layer, overlaps } = globalThis.Game;

const DT = 1 / 60;
const run = (world, seconds) => { for (let t = 0; t < seconds; t += DT) world.step(DT); };

test('矩形と円の重なり判定', () => {
  const rect = new Body({ x: 0, y: 0, w: 20, h: 20 });
  assert.ok(overlaps(rect, new Body({ x: 14, y: 0, r: 5 })));
  assert.ok(!overlaps(rect, new Body({ x: 16, y: 0, r: 5 })));
  // 角の近くは矩形どうしなら重なるが、円なら重ならない
  assert.ok(!overlaps(rect, new Body({ x: 14, y: 14, r: 5 })));
  assert.ok(overlaps(new Body({ x: 0, y: 0, r: 5 }), new Body({ x: 9, y: 0, r: 5 })));
  assert.ok(!overlaps(new Body({ x: 0, y: 0, r: 5 }), new Body({ x: 10, y: 0, r: 5 })));
});

test('重力で落ちて地面の上に止まる', () => {
  const map = new TileMap(['....', '....', '....', '####'], 16);
  const world = new World({ gravity: 1400, map });
  const b = world.add(new Body({ x: 24, y: 8, w: 10, h: 14 }));
  run(world, 1);
  assert.equal(b.bottom, 48);
  assert.equal(b.vy, 0);
  assert.ok(b.onGround);
});

test('一方通行の床は上からは乗れて、下からはすり抜ける', () => {
  const map = new TileMap(['....', '.--.', '....', '....', '####'], 16, { oneWay: ['-'] });
  const world = new World({ gravity: 1400, map });
  const above = world.add(new Body({ x: 24, y: 4, w: 8, h: 8 }));
  const below = world.add(new Body({ x: 24, y: 56, w: 8, h: 8, vy: -600 }));
  run(world, 0.2);
  assert.equal(above.bottom, 16);
  assert.ok(below.top < 16, '下から床を突き抜けて上に出る');
});

test('速い物体も薄い壁をすり抜けない', () => {
  const map = new TileMap(['........', '....#...', '........'], 16, { edge: '.' });
  const world = new World({ map });
  const b = world.add(new Body({ x: 8, y: 24, w: 6, h: 6, vx: 6000 }));
  world.step(DT);
  assert.equal(b.right, 64);
  assert.equal(b.wall, 1);
});

test('onEnter は重なった瞬間に1回だけ、onExit は離れたときに呼ばれる', () => {
  const world = new World();
  const log = [];
  const hero = world.add(new Body({
    x: 0, y: 0, r: 4, layer: Layer.PLAYER, mask: Layer.ITEM,
    onEnter: (o) => log.push('enter:' + o.id), onExit: (o) => log.push('exit:' + o.id),
  }));
  const coin = world.add(new Body({ x: 20, y: 0, r: 4, layer: Layer.ITEM }));
  const rock = world.add(new Body({ x: 20, y: 0, r: 4, layer: Layer.ENEMY }));
  hero.vx = 60 * 14; // 1ステップで 14px 進む
  world.step(DT);
  hero.vx = 0;
  run(world, 0.2);
  assert.deepEqual(log, ['enter:' + coin.id]);
  assert.ok(hero.contacts.has(coin));
  assert.ok(!hero.contacts.has(rock), 'mask に含まれないレイヤーは無視する');
  hero.x = -50;
  world.step(DT);
  assert.deepEqual(log, ['enter:' + coin.id, 'exit:' + coin.id]);
  assert.equal(hero.contacts.size, 0);
});

test('コールバックで無効にした物体は、同じステップで他の相手に通知しない', () => {
  const world = new World();
  let hits = 0;
  const shot = world.add(new Body({
    x: 0, y: 0, w: 10, h: 10, layer: Layer.PLAYER_ATTACK, mask: Layer.ENEMY,
    onEnter: () => { hits++; shot.enabled = false; },
  }));
  world.add(new Body({ x: 2, y: 0, r: 4, layer: Layer.ENEMY }));
  world.add(new Body({ x: -2, y: 0, r: 4, layer: Layer.ENEMY }));
  world.step(DT);
  assert.equal(hits, 1);
});

test('blocks に指定したレイヤーからは押し出される', () => {
  const world = new World();
  const hero = world.add(new Body({ x: 0, y: 0, w: 10, h: 10, layer: Layer.PLAYER, blocks: Layer.NPC }));
  world.add(new Body({ x: 8, y: 0, w: 10, h: 10, layer: Layer.NPC }));
  world.step(DT);
  assert.equal(hero.x, -2);
});

test('高さ z にだけ重力がかかる（見下ろし型のジャンプ）', () => {
  const world = new World({ zGravity: 800 });
  const b = world.add(new Body({ x: 0, y: 0, r: 8 }));
  b.vz = 230;
  world.step(DT);
  assert.ok(b.z > 0 && !b.zGrounded);
  assert.equal(b.y, 0);
  run(world, 1);
  assert.equal(b.z, 0);
  assert.ok(b.zGrounded);
});

test('removed された物体は次のステップで取り除かれる', () => {
  const world = new World();
  const a = world.add(new Body({ x: 0, y: 0, r: 4, layer: Layer.PLAYER, mask: Layer.ENEMY }));
  const b = world.add(new Body({ x: 4, y: 0, r: 4, layer: Layer.ENEMY }));
  world.step(DT);
  assert.ok(a.contacts.has(b));
  world.remove(b);
  assert.ok(!a.contacts.has(b));
  world.step(DT);
  assert.equal(world.bodies.length, 1);
});
