'use strict';

// フィールドを画面なしで動かし、3つのスタイルで例外が出ないことと、主なルールを確かめる
const test = require('node:test');
const assert = require('node:assert/strict');

require('../src/engine/physics.js');
require('../src/engine/core.js');
require('../src/plugins/image-fit.js');
require('../src/game/data.js');
require('../src/game/sprites.js');
require('../src/modes/battle.js');
require('../src/modes/styles.js');
require('../src/modes/field.js');
const G = globalThis.Game;
const { FieldMonster, Bolt, EnemyShot } = G.field;

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

function steps(scene, n) {
  for (let i = 0; i < n; i++) {
    scene.update(G.DT);
    scene.input.endStep();
  }
}

for (const id of ['rpg', 'act', 'stg']) {
  test(`${id} スタイルで動き続ける（途中でスタイルも切り替える）`, () => {
    const rnd = seeded(id.charCodeAt(0));
    const game = newGame();
    const { input } = game;
    const scene = new G.FieldScene(game, id);
    const ctx = fakeContext();
    const actions = ['left', 'right', 'up', 'down', 'a', 'b', 'c'];
    for (let i = 0; i < 8000; i++) {
      if (i % 20 === 0) {
        for (const a of actions) (rnd() < 0.35 ? input.press(a) : input.release(a));
      }
      if (i % 1500 === 1499) scene.setStyle(['rpg', 'act', 'stg'][Math.floor(rnd() * 3)]);
      scene.update(G.DT);
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

test('スタイルを切り替えても、フィールドと主人公の位置はそのまま', () => {
  const game = newGame();
  const scene = new G.FieldScene(game, 'rpg');
  game.input.press('right');
  steps(scene, 20);
  game.input.release('right');
  const { x, y } = scene.hero.body;
  const hero = scene.hero;
  assert.ok(scene.setStyle('act'));
  assert.equal(scene.hero, hero);
  assert.equal(scene.hero.body.x, x);
  assert.equal(scene.hero.body.y, y);
  assert.equal(scene.style.id, 'act');
});

test('どのスタイルでもシンボルが出て、切り替えても同じモンスターがそのまま残る', () => {
  const game = newGame();
  const scene = new G.FieldScene(game, 'act');
  steps(scene, 200);
  const before = scene.monsters;
  assert.ok(before.length > 0);
  before[0].hp = 1;
  for (const id of ['rpg', 'stg', 'rpg', 'act']) {
    assert.ok(scene.setStyle(id));
    steps(scene, 1);
    for (const m of before) assert.ok(scene.monsters.includes(m), `${id} に切り替えても残る`);
  }
  assert.equal(before[0].hp, 1, 'HP もそのまま');
});

test('RPG スタイルではシンボルは透明で、追いかけてこない', () => {
  const game = newGame();
  const scene = new G.FieldScene(game, 'rpg');
  const b = scene.hero.body;
  const m = scene.add(new FieldMonster(scene, 'slime', b.x + 100, b.y));
  let drawn = 0;
  const orig = G.sprites.monster;
  G.sprites.monster = () => { drawn++; };
  scene.draw(fakeContext());
  G.sprites.monster = orig;
  assert.equal(drawn, 0);
  m.wander = { x: 0, y: 0, t: 99 };
  steps(scene, 30);
  assert.equal(m.body.vx, 0, '近くにいても追いかけない');
});

// 主人公の位置にシンボルを重ねる
function touch(scene, kind) {
  const b = scene.hero.body;
  const m = scene.add(new FieldMonster(scene, kind, b.x, b.y));
  m.wander = { x: 0, y: 0, t: 99 };
  return m;
}

test('RPG スタイル：ぶつかるとダメージではなく、そのモンスター（残り HP のまま）とバトル', () => {
  const game = newGame();
  const scene = new G.FieldScene(game, 'rpg');
  const m = touch(scene, 'goblin');
  m.hp = 3;
  steps(scene, 2);
  assert.ok(scene.battle);
  assert.equal(scene.battle.foes.length, 1);
  assert.equal(scene.battle.foes[0].kind, 'goblin');
  assert.equal(scene.battle.foes[0].hp, 3);
  assert.equal(game.party.hp, game.party.maxHp);
});

test('ACT スタイル：ぶつかるとバトルではなくダメージ', () => {
  const game = newGame();
  const scene = new G.FieldScene(game, 'act');
  scene.hero.inv = 0;
  touch(scene, 'slime');
  steps(scene, 2);
  assert.equal(scene.battle, null);
  assert.ok(game.party.hp < game.party.maxHp);
});

// バトルを最後まで進める（Z を押し続ける。逃げるときは「にげる」を選ぶ）
function finishBattle(scene, choose = 0) {
  const { input } = scene;
  for (let i = 0; i < 4000 && scene.battle; i++) {
    const bt = scene.battle;
    if (bt.mode === 'command' && bt.cursor !== choose) {
      if (i % 4 === 0) input.press('down'); else input.release('down');
    } else if (i % 4 === 0) input.press('a');
    else input.release('a');
    scene.update(G.DT);
    input.endStep();
  }
  input.releaseAll();
}

test('バトルに勝つとシンボルが消え、経験値は1回分だけ入る', () => {
  const game = newGame();
  const scene = new G.FieldScene(game, 'rpg');
  const m = touch(scene, 'slime');
  steps(scene, 2);
  finishBattle(scene);
  steps(scene, 1);
  assert.equal(scene.battle, null);
  assert.ok(!scene.monsters.includes(m));
  assert.equal(game.party.exp, G.data.MONSTERS.slime.exp);
});

test('バトルから逃げると、シンボルは残り HP のまま残り、すぐには再戦にならない', () => {
  const game = newGame();
  const scene = new G.FieldScene(game, 'rpg');
  const m = touch(scene, 'dragon');
  steps(scene, 2);
  const origRandom = Math.random;
  Math.random = () => 0; // 逃げるのを必ず成功させる
  scene.battle.foes[0].hp = 50;
  finishBattle(scene, 2);
  Math.random = origRandom;
  assert.equal(scene.battle, null);
  assert.ok(scene.monsters.includes(m));
  assert.equal(m.hp, 50);
  steps(scene, 30);
  assert.equal(scene.battle, null, '逃げた直後は重なっていてもバトルにならない');
});

test('バトル中はスタイルを切り替えられない', () => {
  const game = newGame();
  const scene = new G.FieldScene(game, 'rpg');
  scene.startBattle(['slime']);
  assert.equal(scene.setStyle('act'), false);
  assert.equal(scene.style.id, 'rpg');
});

test('スタイルを切り替えると飛んでいる弾は消える', () => {
  const game = newGame();
  const scene = new G.FieldScene(game, 'stg');
  game.input.press('a');
  steps(scene, 20);
  game.input.release('a');
  assert.ok(scene.entities.some((e) => e instanceof Bolt));
  scene.setStyle('act');
  steps(scene, 1);
  assert.ok(!scene.entities.some((e) => e instanceof Bolt || e instanceof EnemyShot));
});

// 主人公の目の前にモンスターを置く
function monsterInFront(scene, kind) {
  const b = scene.hero.body;
  const m = scene.add(new FieldMonster(scene, kind, b.x + 20, b.y + 20));
  scene.hero.fx = scene.hero.fy = Math.SQRT1_2;
  scene.hero.inv = 99;
  return m;
}

test('ACT：剣は一振りで同じ敵に1回だけ当たり、倒すと共通の経験値が入る', () => {
  const game = newGame();
  const scene = new G.FieldScene(game, 'act');
  const m = monsterInFront(scene, 'goblin');
  const hold = () => { m.body.x = scene.hero.body.x + 20; m.body.y = scene.hero.body.y + 20; m.body.vx = m.body.vy = 0; };
  m.hp = 999;
  game.input.press('a');
  for (let i = 0; i < 20; i++) { hold(); steps(scene, 1); }
  game.input.release('a');
  const dealt = 999 - m.hp;
  assert.ok(dealt > 0 && dealt <= game.party.atk + 2, '1回分のダメージだけ入る');

  m.hp = 1;
  steps(scene, 20);
  game.input.press('a');
  for (let i = 0; i < 20 && !m.dead; i++) { hold(); steps(scene, 1); }
  assert.ok(m.dead);
  assert.equal(game.party.exp, G.data.MONSTERS.goblin.exp);
});

test('STG：Z を押し続けると魔法の弾を連射し、その間は向きが変わらない', () => {
  const game = newGame();
  const scene = new G.FieldScene(game, 'stg');
  const { fx, fy } = scene.hero;
  game.input.press('a');
  game.input.press('left');
  steps(scene, 30);
  assert.ok(scene.entities.filter((e) => e instanceof Bolt).length >= 4);
  assert.equal(scene.hero.fx, fx);
  assert.equal(scene.hero.fy, fy);
});

test('MP が足りないとファイアは出ない', () => {
  const game = newGame();
  const scene = new G.FieldScene(game, 'act');
  game.party.mp = 2;
  game.party.regen = -999;
  game.input.press('c');
  steps(scene, 1);
  assert.equal(game.party.mp, 2);
  assert.ok(!scene.entities.some((e) => e instanceof Bolt));
});

test('ジャンプ中は敵の弾が当たらない', () => {
  const game = newGame();
  const scene = new G.FieldScene(game, 'stg');
  const b = scene.hero.body;
  b.z = 30;
  b.vz = 0;
  b.zGrounded = false;
  scene.add(new EnemyShot(scene, 'goblin', b.x, b.y, 0, 0));
  scene.world.zGravity = 0;
  steps(scene, 2);
  assert.equal(game.party.hp, game.party.maxHp);
});

test('画面の上を押すと、斜めの世界では x と y が両方減る', () => {
  const game = newGame();
  const scene = new G.FieldScene(game, 'rpg');
  const b = scene.hero.body;
  const x0 = b.x, y0 = b.y;
  game.input.press('up');
  for (let i = 0; i < 5; i++) scene.update(G.DT);
  assert.ok(b.x < x0 && b.y < y0);
  const s0 = scene.project(x0, y0), s1 = scene.project(b.x, b.y);
  assert.ok(Math.abs(s1.x - s0.x) < 1e-6, '画面上ではまっすぐ上に動く');
});

test('バトル：Z を押し続けると終わり、勝てば経験値とゴールドが入る', () => {
  const game = newGame();
  const scene = new G.FieldScene(game, 'rpg');
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

test('宝箱は一度開けたら、やり直しても空のまま', () => {
  const game = newGame();
  let scene = new G.FieldScene(game);
  assert.match(scene.chests[0].interact()[0], /てにいれた/);
  scene = new G.FieldScene(game);
  assert.deepEqual(scene.chests[0].interact(), ['からっぽだ。']);
  assert.equal(scene.found, 1);
});

const group = (kind, n) => Array.from({ length: n }, () => ({ kind }));

test('群れ：30体のバトルでも全員が画面内に並び、名前が重ならない', () => {
  const game = newGame();
  const scene = new G.FieldScene(game, 'rpg');
  scene.startBattle(group('slime', 30));
  const { foes } = scene.battle;
  assert.equal(foes.length, 30);
  for (const f of foes) {
    assert.ok(f.x > 0 && f.x < 340, `x=${f.x}`);
    assert.ok(scene.battle.top(f) > 0 && f.y < 246, `y=${f.y}`);
  }
  assert.equal(new Set(foes.map((f) => f.name)).size, 30);
  assert.equal(foes[29].name, 'スライムAD');
  scene.draw(fakeContext());
});

test('群れ：敵のターンに攻撃してくるのは前列の3体まで', () => {
  const game = newGame();
  const scene = new G.FieldScene(game, 'rpg');
  game.party.hp = game.party.maxHp = 9999;
  scene.startBattle(group('slime', 30));
  scene.battle.enemyTurn();
  const attacks = scene.battle.queue.filter((q) => q.text.endsWith('の こうげき！'));
  assert.equal(attacks.length, 3);
});

test('群れ：フレアは敵全体に当たる', () => {
  const game = newGame();
  const scene = new G.FieldScene(game, 'rpg');
  game.party.level = 5;
  game.party.recalc();
  game.party.mp = game.party.maxMp;
  scene.startBattle(group('slime', 20));
  scene.battle.castAll(G.data.SPELLS.flare);
  for (let i = 0; i < 200 && scene.battle.queue.length; i++) scene.battle.update(1);
  assert.equal(scene.battle.alive.length, 0);
  assert.equal(game.party.mp, game.party.maxMp - G.data.SPELLS.flare.mp);
});

test('群れ：フィールドで先頭を倒すと次の1体が出てきて、全員倒すとシンボルが消える', () => {
  const game = newGame();
  const scene = new G.FieldScene(game, 'act');
  const b = scene.hero.body;
  const m = scene.add(new FieldMonster(scene, 'slime', b.x + 200, b.y, [{ kind: 'bat' }, { kind: 'goblin' }]));
  assert.equal(m.size, 3);
  m.damage(999, 1, 0);
  assert.equal(m.size, 2);
  assert.equal(m.kind, 'bat');
  assert.equal(m.body.gravityScale, 0, 'コウモリになったら飛ぶ');
  m.damage(999, 1, 0);
  m.damage(999, 1, 0);
  assert.ok(m.dead);
  const { MONSTERS } = G.data;
  assert.equal(game.party.exp, MONSTERS.slime.exp + MONSTERS.bat.exp + MONSTERS.goblin.exp);
});

test('群れ：RPG でぶつかると群れ全体とバトルになり、逃げると生き残りがシンボルに戻る', () => {
  const game = newGame();
  const scene = new G.FieldScene(game, 'rpg');
  const m = touch(scene, 'slime');
  m.followers = group('slime', 9).map((f) => ({ ...f, hp: 6 }));
  steps(scene, 2);
  assert.equal(scene.battle.foes.length, 10);
  // 先頭の2体を倒してから逃げる
  scene.battle.foes[0].hp = 0;
  scene.battle.foes[1].hp = 0;
  scene.battle.foes[2].hp = 2;
  const origRandom = Math.random;
  Math.random = () => 0;
  finishBattle(scene, 2);
  Math.random = origRandom;
  assert.equal(m.size, 8);
  assert.equal(m.hp, 2, '生き残りの先頭が新しい先頭になる');
  assert.equal(game.party.exp, G.data.MONSTERS.slime.exp * 2, '倒した2体分の経験値は入る');
});

test('群れの数は最大30体', () => {
  const game = newGame();
  game.party.level = 20;
  const scene = new G.FieldScene(game, 'act');
  let max = 0;
  for (let i = 0; i < 400; i++) {
    scene.spawnMonster();
    for (const m of scene.monsters) max = Math.max(max, m.size);
    for (const m of scene.monsters) scene.kill(m);
    steps(scene, 1);
  }
  assert.ok(max <= 30);
  assert.ok(max >= 20, `大きな群れも出る（最大 ${max}）`);
});
