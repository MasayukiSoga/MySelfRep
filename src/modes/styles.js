/*
 * 操作スタイル。フィールドは1つで、ボタンで「戦い方」だけを切り替える
 * - rpg：シンボルは出ず、歩くとランダムエンカウントしてバトル画面へ
 * - act：フィールドにシンボルが出て、剣とファイアでその場で戦う
 * - stg：フィールドにシンボルが出て、魔法の弾を連射して戦う。敵も弾を撃ってくる
 *
 * 主人公の動き（移動・ジャンプ・話す）は共通。違うのは攻撃ボタンの意味と敵の出かただけ
 */
(function (G) {
  'use strict';

  const { SPELLS } = G.data;

  G.styles = {
    rpg: {
      id: 'rpg',
      label: 'RPG',
      hint: 'Z:話す  X:ジャンプ  歩くとモンスターに出会う',
      encounters: true,
      symbols: false,
      control() {},
      fireInterval() { return 0; },
    },

    act: {
      id: 'act',
      label: 'ACT',
      hint: 'Z:剣  C:ファイア  X:ジャンプ（敵を飛び越えられる）',
      encounters: false,
      symbols: true,
      control(hero, input) {
        if (input.pressed('a')) hero.swing();
        if (input.pressed('c')) hero.cast(SPELLS.fire, { pierce: false });
      },
      // ゴブリンだけがときどき石を投げる
      fireInterval(kind) { return kind === 'goblin' ? 2.6 : 0; },
    },

    stg: {
      id: 'stg',
      label: 'STG',
      hint: 'Z長押し:魔法の弾（向き固定）  C:ファイア（貫通）  X:ジャンプ',
      encounters: false,
      symbols: true,
      // 撃っている間は向きを固定して、横に動きながら撃てるようにする
      locksFacing(input) { return input.down('a'); },
      control(hero, input) {
        if (input.down('a')) hero.shoot();
        if (input.pressed('c')) hero.cast(SPELLS.fire, { pierce: true });
      },
      fireInterval(kind) { return { bat: 2.4, goblin: 1.7, dragon: 1.3 }[kind] ?? 0; },
    },
  };
})(globalThis.Game = globalThis.Game || {});
