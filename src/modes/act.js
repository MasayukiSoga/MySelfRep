/*
 * ACT：横スクロールのフィールドで、現れたモンスターと剣と魔法で戦う
 * 物理の設定：下向きの重力あり、タイルとの押し戻しあり、一方通行の床あり
 */
(function (G) {
  'use strict';

  const { Body, Layer, Scene, TileMap, W, H } = G;
  const { clamp, approach, rand } = G.util;
  const { SPELLS } = G.data;

  const TS = 16;

  // マップを文字で組み立てる。'#' 地面、'=' ブロック、'-' 一方通行の床
  function buildLevel() {
    const cols = 112, rows = 20;
    const g = Array.from({ length: rows }, () => Array(cols).fill('.'));
    const fill = (x0, y0, x1, y1, ch) => {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) g[y][x] = ch;
    };
    const things = [];
    const put = (type, x, y) => things.push({ type, x, y });

    fill(0, 18, 22, 19, '#');
    fill(26, 18, 47, 19, '#');
    fill(51, 18, 75, 19, '#');
    fill(79, 18, 111, 19, '#');

    fill(12, 16, 14, 17, '=');
    fill(17, 14, 20, 14, '-');
    fill(30, 15, 31, 17, '=');
    fill(35, 13, 39, 13, '-');
    fill(41, 10, 44, 10, '-');
    fill(48, 12, 50, 12, '=');
    fill(55, 14, 59, 14, '-');
    fill(62, 11, 66, 11, '-');
    fill(70, 15, 71, 17, '=');
    fill(85, 14, 89, 14, '-');
    fill(94, 16, 95, 17, '=');
    fill(96, 14, 97, 17, '=');
    fill(98, 12, 99, 17, '=');

    put('player', 3, 17);
    [[18, 13], [19, 13], [36, 12], [37, 12], [38, 12], [42, 9], [43, 9], [49, 11],
      [24, 15], [56, 13], [57, 13], [58, 13], [63, 10], [64, 10], [65, 10], [77, 15],
      [86, 13], [87, 13], [88, 13], [99, 11]].forEach(([x, y]) => put('coin', x, y));
    [[19, 17], [35, 17], [58, 17], [84, 17]].forEach(([x, y]) => put('slime', x, y));
    [[40, 11], [64, 8], [92, 10]].forEach(([x, y]) => put('bat', x, y));
    [[66, 17], [90, 17], [104, 17]].forEach(([x, y]) => put('goblin', x, y));
    [[44, 17], [45, 17], [73, 17]].forEach(([x, y]) => put('spike', x, y));
    put('goal', 108, 17);

    return { rows: g.map((r) => r.join('')), things };
  }

  class Hero {
    constructor(scene, x, y) {
      this.scene = scene;
      this.facing = 1;
      this.inv = 0;
      this.stun = 0;
      this.coyote = 0;
      this.buffer = 0;
      this.drop = 0;
      this.attackT = -1;
      this.castT = 0;
      this.hitList = new Set();
      this.safe = { x, y };
      this.body = new Body({
        x, y, w: 10, h: 16, owner: this,
        layer: Layer.PLAYER, mask: Layer.ENEMY | Layer.ENEMY_ATTACK | Layer.ITEM,
        onEnter: (o) => this.touch(o),
      });
      // 剣の攻撃判定。振っている途中の数フレームだけ有効にする
      this.sword = new Body({
        w: 22, h: 18, gravityScale: 0, collideTiles: false, enabled: false, owner: this,
        layer: Layer.PLAYER_ATTACK, mask: Layer.ENEMY,
        onEnter: (o) => this.slash(o),
      });
      this.bodies = [this.body, this.sword];
    }

    touch(o) {
      const b = this.body, s = this.scene;
      if (o.layer & Layer.ITEM) { o.owner.collect(this); return; }
      // 落ちながら敵の上から当たったら踏みつけ
      if ((o.layer & Layer.ENEMY) && b.vy > 0 && b.bottom - o.top < 8) {
        o.owner.damage(s.party.physicalDamage(o.owner.kind), 0);
        b.vy = s.input.down('b') ? -380 : -260;
      }
    }

    slash(o) {
      // 1回の振りで同じ敵に2回当てない
      if (this.hitList.has(o)) return;
      this.hitList.add(o);
      o.owner.damage(this.scene.party.physicalDamage(o.owner.kind), this.facing);
      this.scene.freeze = 0.05;
      this.scene.particles.burst(o.x, o.y, { count: 8, speed: 140, color: '#fff6a8', life: 0.25 });
    }

    hurt(dmg, fromX) {
      const s = this.scene, b = this.body, party = s.party;
      if (this.inv > 0 || this.dead) return false;
      party.hp = Math.max(0, party.hp - dmg);
      s.popup(b.x, b.top, String(dmg), '#ff8fa0');
      this.inv = 1.2;
      this.stun = 0.25;
      b.vx = b.x < fromX ? -160 : 160;
      b.vy = -220;
      s.shake = 0.2;
      if (party.dead) {
        s.particles.burst(b.x, b.y, { count: 30, speed: 160, color: '#ffb347', life: 0.8 });
        s.kill(this);
        s.state = 'over';
      }
      return true;
    }

    update(dt) {
      const b = this.body, s = this.scene, input = s.input, map = s.world.map;
      this.inv -= dt;
      this.stun -= dt;
      this.drop -= dt;
      this.castT -= dt;
      s.party.regenMp(dt);

      const ax = input.axis().x;
      if (this.stun <= 0) {
        b.vx = approach(b.vx, ax * 140, (b.onGround ? 1000 : 650) * dt);
        if (ax && this.attackT < 0) this.facing = ax;
      }

      // コヨーテタイム（足場から落ちた直後もジャンプできる）と先行入力
      this.coyote = b.onGround ? 0.08 : this.coyote - dt;
      this.buffer = input.pressed('b') ? 0.12 : this.buffer - dt;
      const onOneWay = b.onGround && !map.isSolidAt(b.x, b.bottom + 1);
      if (this.buffer > 0 && input.down('down') && onOneWay) {
        this.drop = 0.2;
        this.buffer = 0;
      } else if (this.buffer > 0 && this.coyote > 0) {
        b.vy = -420;
        this.buffer = this.coyote = 0;
        s.particles.burst(b.x, b.bottom, { count: 5, speed: 40, color: '#e9e6ff', life: 0.3 });
      }
      // ボタンを早く離すと低いジャンプになる
      if (!input.down('b') && b.vy < -160) b.vy = -160;
      b.dropThrough = this.drop > 0;

      if (input.pressed('a') && this.attackT < 0) {
        this.attackT = 0;
        this.hitList.clear();
      }
      if (this.attackT >= 0) {
        this.attackT += dt;
        this.sword.enabled = this.attackT > 0.04 && this.attackT < 0.16;
        this.sword.x = b.x + this.facing * 15;
        this.sword.y = b.y - 2;
        if (this.attackT > 0.26) this.attackT = -1;
      }

      if (input.pressed('c') && this.castT <= 0) {
        if (s.party.cast(SPELLS.fire)) {
          this.castT = 0.3;
          s.add(new Fire(s, b.x + this.facing * 10, b.y - 2, this.facing));
        } else s.popup(b.x, b.top - 4, 'MPがたりない', '#8fd3ff');
      }

      // 敵やトゲに重なっている間はダメージを受ける
      for (const o of b.contacts) {
        if (o.layer & (Layer.ENEMY | Layer.ENEMY_ATTACK)) this.hurt(o.owner.damageTo(s.party), o.x);
      }

      if (b.onGround && this.inv <= 0 && map.isGroundAt(b.left, b.bottom + 1) && map.isGroundAt(b.right, b.bottom + 1)) {
        this.safe = { x: b.x, y: b.y };
      }
      if (b.top > map.height + 40) {
        this.inv = 0;
        this.hurt(Math.ceil(s.party.maxHp * 0.15), b.x);
        if (!this.dead) {
          b.x = this.safe.x;
          b.y = this.safe.y;
          b.vx = b.vy = 0;
        }
      }
    }

    draw(ctx) {
      const b = this.body, f = this.facing, s = this.scene;
      if (this.inv > 0 && Math.floor(this.inv * 15) % 2) return;
      const step = b.onGround && Math.abs(b.vx) > 10 ? Math.floor(s.time * 12) % 2 : 0;
      G.sprites.hero(ctx, b.x, b.bottom, { facing: f, step });
      if (this.castT > 0.15) {
        ctx.fillStyle = 'rgba(255,180,70,0.5)';
        ctx.beginPath();
        ctx.arc(b.x + f * 8, b.y - 3, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      if (this.attackT >= 0 && this.attackT < 0.2) {
        const p = clamp(this.attackT / 0.16, 0, 1);
        const a = -Math.PI / 2 + p * Math.PI * 0.9;
        ctx.save();
        ctx.translate(Math.round(b.x) + f * 3, Math.round(b.y) - 2);
        ctx.scale(f, 1);
        ctx.strokeStyle = '#e8f1ff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * 16, Math.sin(a) * 16);
        ctx.stroke();
        if (this.sword.enabled) {
          ctx.strokeStyle = 'rgba(255,246,168,0.6)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(0, 0, 17, -Math.PI / 2, Math.PI * 0.4);
          ctx.stroke();
        }
        ctx.restore();
      }
    }
  }

  class Fire {
    constructor(scene, x, y, dir) {
      this.scene = scene;
      this.body = new Body({
        x, y, r: 6, vx: dir * 280, gravityScale: 0, owner: this,
        layer: Layer.PLAYER_ATTACK, mask: Layer.ENEMY,
        onEnter: (o) => {
          o.owner.damage(scene.party.spellDamage(o.owner.kind), dir);
          this.explode();
        },
      });
    }
    explode() {
      this.scene.particles.burst(this.body.x, this.body.y, { count: 12, speed: 120, color: '#ffb347', life: 0.35 });
      this.scene.kill(this);
    }
    update() {
      const b = this.body, s = this.scene;
      // 壁に当たったら消える（タイルとの衝突は物理エンジンが教えてくれる）
      if (b.wall) this.explode();
      if (b.x < s.camX - 20 || b.x > s.camX + W + 20) s.kill(this);
    }
    draw(ctx) { G.sprites.fireball(ctx, this.body.x, this.body.y, this.scene.time, 5); }
  }

  class Rock {
    constructor(scene, x, y, vx) {
      this.scene = scene;
      this.body = new Body({
        x, y, r: 4, vx, vy: -260, owner: this,
        layer: Layer.ENEMY_ATTACK, mask: Layer.PLAYER,
        onEnter: (o) => { if (o.owner.hurt(this.damageTo(scene.party), this.body.x)) scene.kill(this); },
      });
    }
    damageTo(party) { return party.damageFrom('goblin', 0.8); }
    update() {
      const b = this.body;
      if (b.onGround || b.wall || b.top > this.scene.world.map.height) this.scene.kill(this);
    }
    draw(ctx) { G.sprites.rock(ctx, this.body.x, this.body.y); }
  }

  // モンスター。種類ごとに動き方だけが違い、強さは共通データから読む
  class Monster {
    constructor(scene, kind, x, y) {
      this.scene = scene;
      this.kind = kind;
      this.hp = G.data.MONSTERS[kind].hp;
      this.dir = -1;
      this.kb = 0;
      this.flash = 0;
      this.t = rand(0, 3);
      this.home = { x, y };
      this.throwT = rand(1, 2);
      const flying = kind === 'bat';
      const size = { slime: [14, 10], bat: [14, 12], goblin: [12, 18] }[kind];
      this.body = new Body({
        x, y: flying ? y : y + TS / 2 - size[1] / 2, w: size[0], h: size[1], owner: this, layer: Layer.ENEMY,
        gravityScale: flying ? 0 : 1, collideTiles: !flying,
      });
    }
    damageTo(party) { return party.damageFrom(this.kind); }
    update(dt) {
      const b = this.body, s = this.scene, map = s.world.map, hero = s.hero.body;
      this.t += dt;
      this.flash -= dt;
      this.kb -= dt;
      const dx = hero.x - b.x, dy = hero.y - b.y;
      if (this.kind === 'bat') {
        // 主人公が近づくと、ゆっくり追いかけてくる
        const near = Math.abs(dx) < 150 && Math.abs(dy) < 120 && !s.hero.dead;
        const tx = near ? hero.x : this.home.x + Math.sin(this.t) * 30;
        const ty = (near ? hero.y - 6 : this.home.y) + Math.sin(this.t * 4) * 10;
        if (this.kb <= 0) {
          b.vx = clamp((tx - b.x) * 2, -60, 60);
          b.vy = clamp((ty - b.y) * 2, -60, 60);
        }
        this.dir = dx < 0 ? -1 : 1;
      } else {
        if (b.wall === this.dir) this.dir = -this.dir;
        if (b.onGround && !map.isGroundAt(b.x + this.dir * (b.hw + 2), b.bottom + 2)) this.dir = -this.dir;
        const speed = this.kind === 'goblin' ? 25 : 38;
        if (this.kb <= 0) b.vx = this.dir * speed;
        if (this.kind === 'goblin' && Math.abs(dx) < 170 && Math.abs(dy) < 80 && !s.hero.dead) {
          this.throwT -= dt;
          if (this.throwT <= 0) {
            this.throwT = 2.2;
            this.dir = dx < 0 ? -1 : 1;
            s.add(new Rock(s, b.x, b.top, clamp(dx * 1.1, -150, 150)));
          }
        }
      }
      if (b.top > map.height) s.kill(this);
    }
    damage(n, from) {
      const s = this.scene, b = this.body;
      this.hp -= n;
      this.flash = 0.1;
      s.popup(b.x, b.top, String(n));
      b.vx = from * 140;
      if (this.kind !== 'bat') b.vy = -140;
      this.kb = 0.3;
      if (this.hp > 0) return;
      s.reward(this.kind, b.x, b.top - 12);
      s.particles.burst(b.x, b.y, { count: 14, speed: 120, color: '#e9e6ff', gravity: 300 });
      s.kill(this);
    }
    draw(ctx) {
      const b = this.body;
      G.sprites.monster(ctx, this.kind, b.x, this.kind === 'bat' ? b.y + 10 : b.bottom, {
        t: this.t, flash: this.flash > 0, facing: this.dir,
      });
    }
  }

  class Coin {
    constructor(scene, x, y) {
      this.scene = scene;
      this.body = new Body({ x, y, r: 5, gravityScale: 0, collideTiles: false, owner: this, layer: Layer.ITEM });
    }
    update() {}
    collect() {
      this.scene.party.gold += 1;
      this.scene.particles.burst(this.body.x, this.body.y, { count: 6, speed: 60, color: '#ffd84d', life: 0.3 });
      this.scene.kill(this);
    }
    draw(ctx) {
      const b = this.body;
      const w = Math.abs(Math.cos(this.scene.time * 4 + b.x)) * 4 + 1;
      ctx.fillStyle = '#ffd84d';
      ctx.fillRect(Math.round(b.x - w / 2), Math.round(b.y - 5), Math.round(w), 10);
    }
  }

  class Spike {
    constructor(scene, x, y) {
      this.scene = scene;
      this.body = new Body({ x, y: y + 4, w: 14, h: 8, gravityScale: 0, collideTiles: false, owner: this, layer: Layer.ENEMY_ATTACK });
    }
    damageTo() { return 4; }
    update() {}
    draw(ctx) {
      const b = this.body;
      ctx.fillStyle = '#d9dcef';
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(b.left + i * 5 - 1, b.bottom);
        ctx.lineTo(b.left + i * 5 + 2.5, b.top);
        ctx.lineTo(b.left + i * 5 + 6, b.bottom);
        ctx.fill();
      }
    }
  }

  class Goal {
    constructor(scene, x, y) {
      this.scene = scene;
      this.body = new Body({ x, y: y - 16, w: 8, h: 48, gravityScale: 0, collideTiles: false, owner: this, layer: Layer.ITEM });
    }
    update() {}
    collect() {
      const s = this.scene;
      if (s.state !== 'play') return;
      s.state = 'clear';
      s.party.gold += 20;
      s.particles.burst(this.body.x, this.body.top, { count: 40, speed: 180, color: '#7bd389', life: 1, gravity: 200 });
    }
    draw(ctx) {
      const b = this.body;
      ctx.fillStyle = '#d9dcef';
      ctx.fillRect(b.x - 1, b.top, 2, b.hh * 2);
      const wave = Math.sin(this.scene.time * 6) * 2;
      ctx.fillStyle = '#7bd389';
      ctx.beginPath();
      ctx.moveTo(b.x + 1, b.top);
      ctx.lineTo(b.x + 18, b.top + 6 + wave);
      ctx.lineTo(b.x + 1, b.top + 12);
      ctx.fill();
    }
  }

  class ActScene extends Scene {
    constructor(game) {
      const level = buildLevel();
      const map = new TileMap(level.rows, TS, { solid: ['#', '='], oneWay: ['-'], edge: '#', bottom: '.' });
      super(game, { gravity: 1400, maxFall: 520, map });
      this.shake = 0;
      this.camX = 0;
      const at = (t) => [t.x * TS + TS / 2, t.y * TS + TS / 2];
      for (const t of level.things) {
        const [x, y] = at(t);
        if (t.type === 'player') this.hero = this.add(new Hero(this, x, y));
        if (t.type === 'coin') this.add(new Coin(this, x, y));
        if (t.type in G.data.MONSTERS) this.add(new Monster(this, t.type, x, y));
        if (t.type === 'spike') this.add(new Spike(this, x, y));
        if (t.type === 'goal') this.add(new Goal(this, x, y));
      }
    }

    project(x, y, z = 0) { return { x: x - this.camX, y: y - z }; }

    update(dt) {
      this.shake = Math.max(0, this.shake - dt);
      if (this.state !== 'play' && this.input.pressed('a')) {
        if (this.state === 'over') this.party.revive();
        this.restart = true;
      }
      if (this.state === 'clear') {
        this.time += dt;
        this.updateEffects(dt);
        return;
      }
      this.stepWorld(dt);
      const map = this.world.map;
      const target = clamp(this.hero.body.x - W * 0.4, 0, map.width - W);
      this.camX += (target - this.camX) * Math.min(1, dt * 10);
    }

    draw(ctx) {
      const map = this.world.map, cam = Math.round(this.camX);
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#2b2a6b');
      sky.addColorStop(1, '#f2a541');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#4b3a7a';
      for (let i = -1; i < 6; i++) {
        const x = i * 120 - ((cam * 0.3) % 120);
        ctx.beginPath();
        ctx.moveTo(x, H);
        ctx.lineTo(x + 60, H - 140 - (i & 1) * 30);
        ctx.lineTo(x + 120, H);
        ctx.fill();
      }

      ctx.save();
      ctx.translate(-cam + (this.shake > 0 ? rand(-2, 2) : 0), 0);
      const tx0 = Math.floor(cam / TS), tx1 = tx0 + Math.ceil(W / TS) + 1;
      for (let ty = 0; ty < map.rows; ty++) {
        for (let tx = tx0; tx <= tx1; tx++) {
          const ch = map.get(tx, ty), x = tx * TS, y = ty * TS;
          if (ch === '#') {
            ctx.fillStyle = '#6b3f2a';
            ctx.fillRect(x, y, TS, TS);
            if (!map.isSolid(tx, ty - 1)) {
              ctx.fillStyle = '#5fbf6a';
              ctx.fillRect(x, y, TS, 4);
            }
          } else if (ch === '=') {
            ctx.fillStyle = '#c96b3c';
            ctx.fillRect(x, y, TS, TS);
            ctx.fillStyle = '#8a4325';
            ctx.fillRect(x, y + 7, TS, 1);
            ctx.fillRect(x + (ty & 1 ? 4 : 11), y, 1, 7);
            ctx.fillRect(x + (ty & 1 ? 11 : 4), y + 8, 1, 8);
          } else if (ch === '-') {
            ctx.fillStyle = '#e9e6ff';
            ctx.fillRect(x, y, TS, 3);
            ctx.fillStyle = 'rgba(233,230,255,0.35)';
            ctx.fillRect(x + 2, y + 3, 2, 5);
            ctx.fillRect(x + 12, y + 3, 2, 5);
          }
        }
      }
      for (const e of this.entities) e.draw(ctx);
      this.particles.draw(ctx, (x, y) => ({ x, y }));
      G.draw.popups(ctx, this.popups, (x, y, z) => ({ x, y: y - z }));
      ctx.restore();

      const D = G.draw;
      D.status(ctx, this.party);
      D.text(ctx, `${this.party.gold} G`, W - 10, 6, { size: 12, align: 'right', color: '#ffd84d' });
      D.levelUp(ctx, this);
      if (this.state === 'over') D.banner(ctx, 'GAME OVER', 'Z でもう一度（ゴールドが半分になります）', '#ff5d73');
      if (this.state === 'clear') D.banner(ctx, 'STAGE CLEAR', 'Z でもう一度遊ぶ（レベルはそのまま）', '#7bd389');
    }
  }

  G.modes.act = {
    id: 'act',
    label: 'ACT',
    name: 'フィールドアクション',
    create: (game) => new ActScene(game),
  };
})(globalThis.Game = globalThis.Game || {});
