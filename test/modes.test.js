'use strict';

// 各モードを画面なしで数千ステップ動かし、例外が出ないことを確かめる
const test = require('node:test');
const assert = require('node:assert/strict');

require('../src/engine/physics.js');
require('../src/engine/core.js');
require('../src/game/data.js');
require('../src/game/sprites.js');
require('../src/modes/stg.js');
require('../src/modes/act.js');
require('../src/modes/battle.js');
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

const newGame = () => ({ input: new G.Input(), party: new G.Party() });

for (const id of ['stg', 'act', 'rpg']) {
  test(`${id} モードが動き続ける`, () => {
    const rnd = seeded(42);
    const game = newGame();
    const { input } = game;
    let scene = G.modes[id].create(game);
    const ctx = fakeContext();
    const actions = ['left', 'right', 'up', 'down', 'a', 'b', 'c'];
    for (let i = 0; i < 8000; i++) {
      if (i % 20 === 0) {
        for (const a of actions) (rnd() < 0.35 ? input.press(a) : input.release(a));
      }
      scene.update(G.DT);
      if (scene.restart) scene = G.modes[id].create(game);
      input.endStep();
      if (i % 10 === 0) {
        scene.draw(ctx);
        if (!scene.battle) G.draw.bodies(ctx, scene);
      }
      for (const b of scene.world.bodies) {
        assert.ok(Number.isFinite(b.x) && Number.isFinite(b.y), `${id}: 座標が数値でなくなった`);
      }
      assert.ok(game.party.hp >= 0 && game.party.hp <= game.party.maxHp);
    }
  });
}

test('Party：経験値でレベルが上がり、全回復する', () => {
  const p = new G.Party();
  p.hp = 1;
  assert.equal(p.gainExp(9), 0);
  assert.equal(p.gainExp(1), 1);
  assert.equal(p.level, 2);
  assert.equal(p.hp, p.maxHp);
  assert.equal(p.gainExp(200), 3);
  assert.equal(p.level, 5);
});

test('Party：倒したモンスターの経験値とゴールドはどのモードでも同じ', () => {
  const p = new G.Party();
  p.defeat('goblin');
  assert.equal(p.exp, G.data.MONSTERS.goblin.exp);
  assert.equal(p.gold, G.data.MONSTERS.goblin.gold);
});

test('ACT：主人公は地面の上に立って始まる', () => {
  const scene = G.modes.act.create(newGame());
  for (let i = 0; i < 30; i++) scene.update(G.DT);
  assert.ok(scene.hero.body.onGround);
});

test('ACT：剣は一振りで同じ敵に1回だけ当たり、倒すと共通の経験値が入る', () => {
  const game = newGame();
  const { input } = game;
  const scene = G.modes.act.create(game);
  for (let i = 0; i < 30; i++) scene.update(G.DT);
  const hero = scene.hero;
  const enemy = scene.entities.find((e) => e.kind === 'goblin');
  const place = () => {
    enemy.body.vx = 0;
    enemy.body.x = hero.body.x + 14;
    enemy.body.y = hero.body.bottom - enemy.body.hh;
  };
  place();
  enemy.hp = 999;
  hero.facing = 1;
  hero.inv = 99;
  input.press('a');
  for (let i = 0; i < 20; i++) {
    place();
    scene.update(G.DT);
    input.endStep();
  }
  input.release('a');
  const hits = 999 - enemy.hp;
  assert.ok(hits > 0 && hits <= game.party.atk + 2, '1回分のダメージだけ入る');

  enemy.hp = 1;
  input.press('a');
  for (let i = 0; i < 20; i++) {
    if (!enemy.dead) place();
    scene.update(G.DT);
    input.endStep();
  }
  assert.ok(enemy.dead);
  assert.equal(game.party.exp, G.data.MONSTERS.goblin.exp);
});

test('ACT：MP が足りないとファイアは出ない', () => {
  const game = newGame();
  const scene = G.modes.act.create(game);
  game.party.mp = 2;
  game.party.regen = -999;
  game.input.press('c');
  scene.update(G.DT);
  assert.equal(game.party.mp, 2);
  assert.ok(!scene.entities.some((e) => e.constructor.name === 'Fire'));
});

test('RPG：画面の上を押すと、斜めの世界では x と y が両方減る', () => {
  const game = newGame();
  const scene = G.modes.rpg.create(game);
  const b = scene.hero.body;
  const x0 = b.x, y0 = b.y;
  game.input.press('up');
  for (let i = 0; i < 5; i++) scene.update(G.DT);
  assert.ok(b.x < x0 && b.y < y0);
  const s0 = scene.project(x0, y0), s1 = scene.project(b.x, b.y);
  assert.ok(Math.abs(s1.x - s0.x) < 1e-6, '画面上ではまっすぐ上に動く');
});

test('RPG：歩き続けるとエンカウントしてバトル画面になる', () => {
  const game = newGame();
  const scene = G.modes.rpg.create(game);
  scene.nextEncounter = 60;
  game.input.press('right');
  for (let i = 0; i < 120 && !scene.battle; i++) scene.update(G.DT);
  assert.ok(scene.battle);
});

test('RPG：Z を押し続けるとバトルが終わり、勝てば経験値とゴールドが入る', () => {
  const game = newGame();
  const scene = G.modes.rpg.create(game);
  scene.startBattle(['slime']);
  const ctx = fakeContext();
  for (let i = 0; i < 3000 && scene.battle; i++) {
    if (i % 4 === 0) game.input.press('a'); else game.input.release('a');
    scene.update(G.DT);
    scene.draw(ctx);
    game.input.endStep();
  }
  assert.equal(scene.battle, null);
  assert.equal(game.party.exp, G.data.MONSTERS.slime.exp);
  assert.equal(game.party.gold, G.data.MONSTERS.slime.gold);
});

test('RPG：宝箱は一度開けたら、やり直しても空のまま', () => {
  const game = newGame();
  let scene = G.modes.rpg.create(game);
  const lines = scene.chests[0].interact();
  assert.match(lines[0], /てにいれた/);
  scene = G.modes.rpg.create(game);
  assert.deepEqual(scene.chests[0].interact(), ['からっぽだ。']);
  assert.equal(scene.found, 1);
});
