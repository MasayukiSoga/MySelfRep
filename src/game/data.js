/*
 * 3つのモードで共通のゲームデータ
 * - モンスターと魔法の定義
 * - 主人公の成長（レベル・HP・MP・経験値・ゴールド）とダメージ計算
 * どのモードで敵を倒しても同じ Party に経験値が入る
 */
(function (G) {
  'use strict';

  const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

  const MONSTERS = {
    slime: { name: 'スライム', hp: 6, atk: 4, def: 0, exp: 3, gold: 2 },
    bat: { name: 'コウモリ', hp: 5, atk: 5, def: 0, exp: 4, gold: 3 },
    goblin: { name: 'ゴブリン', hp: 12, atk: 7, def: 2, exp: 9, gold: 8 },
    dragon: { name: 'ドラゴン', hp: 90, atk: 12, def: 4, exp: 80, gold: 60 },
  };

  const SPELLS = {
    fire: { name: 'ファイア', mp: 3, power: 8 },
    heal: { name: 'ヒール', mp: 4, power: 14 },
  };

  class Party {
    constructor() {
      this.name = 'ゆうしゃ';
      this.level = 1;
      this.exp = 0;
      this.gold = 0;
      this.bonus = { hp: 0, mp: 0, atk: 0 };
      this.flags = new Set(); // 開けた宝箱など、やり直しても残す記録
      this.recalc();
      this.hp = this.maxHp;
      this.mp = this.maxMp;
      this.regen = 0;
    }
    recalc() {
      const L = this.level;
      this.maxHp = 20 + L * 5 + this.bonus.hp;
      this.maxMp = 8 + L * 2 + this.bonus.mp;
      this.atk = 4 + L * 2 + this.bonus.atk;
      this.def = L;
    }
    // 次のレベルまでに必要な経験値の合計
    get nextExp() { return 10 * this.level * this.level; }
    get dead() { return this.hp <= 0; }

    // 上がったレベルの数を返す。レベルが上がると全回復する
    gainExp(n) {
      this.exp += n;
      let ups = 0;
      while (this.exp >= this.nextExp) {
        this.level++;
        ups++;
      }
      if (ups) {
        this.recalc();
        this.hp = this.maxHp;
        this.mp = this.maxMp;
      }
      return ups;
    }
    // 倒したモンスターの経験値とゴールドを受け取る
    defeat(kind) {
      const m = MONSTERS[kind];
      this.gold += m.gold;
      return this.gainExp(m.exp);
    }

    physicalDamage(kind) {
      return Math.max(1, this.atk - MONSTERS[kind].def + randInt(0, 2));
    }
    spellDamage(kind, spell = SPELLS.fire) {
      return Math.max(1, spell.power + this.level * 2 - Math.floor(MONSTERS[kind].def / 2) + randInt(0, 2));
    }
    // モンスターから受けるダメージ（計算だけ。HP は減らさない）
    damageFrom(kind, scale = 1) {
      return Math.max(1, Math.round(MONSTERS[kind].atk * scale) - this.def + randInt(0, 1));
    }
    takeDamage(kind, scale = 1) {
      const dmg = this.damageFrom(kind, scale);
      this.hp = Math.max(0, this.hp - dmg);
      return dmg;
    }

    canCast(spell) { return this.mp >= spell.mp; }
    cast(spell) {
      if (!this.canCast(spell)) return false;
      this.mp -= spell.mp;
      return true;
    }
    heal(n) {
      const before = this.hp;
      this.hp = Math.min(this.maxHp, this.hp + n);
      return this.hp - before;
    }
    // フィールドで戦うモードでは MP が少しずつ回復する
    regenMp(dt) {
      this.regen += dt;
      while (this.regen >= 3) {
        this.regen -= 3;
        this.mp = Math.min(this.maxMp, this.mp + 1);
      }
    }
    restoreAll() {
      this.hp = this.maxHp;
      this.mp = this.maxMp;
    }
    // ゲームオーバーからの復活。ゴールドは半分になる
    revive() {
      this.restoreAll();
      this.gold = Math.floor(this.gold / 2);
    }
  }

  G.data = { MONSTERS, SPELLS };
  G.Party = Party;
  G.util = Object.assign(G.util || {}, { randInt });
})(globalThis.Game = globalThis.Game || {});
