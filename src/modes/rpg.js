/*
 * RPG：斜め見下ろし（クォータービュー）
 * 物理の設定：平面の重力なし、タイルとの押し戻しあり、高さ z にだけ重力（ジャンプ用）
 * 物理は「真上から見た2D」で計算し、描画するときだけ斜めに変換する
 */
(function (G) {
  'use strict';

  const { Body, Layer, Scene, TileMap, W, H } = G;
  const { rand, pick } = G.util;

  const T = 32;
  const IX = 0.75; // 物理座標 1px あたりの画面上の横幅
  const IY = 0.375; // 同じく縦幅（横の半分にすると 2:1 のひし形になる）

  const MAP = [
    '####################',
    '#..T......~~~....T.#',
    '#.P.......~~~~.....#',
    '#....N....~~~~..S..#',
    '#..........~~......#',
    '#..##..............#',
    '#..#C....T.....T...#',
    '#........T.........#',
    '#.....S.......##...#',
    '#T...........#C#...#',
    '#........S.........#',
    '#..T..........N....#',
    '#.......##.........#',
    '#.......#C......S..#',
    '#..S...............#',
    '#...........T......#',
    '#....~~~...........#',
    '#....~~~.......T...#',
    '#T........S......C.#',
    '####################',
  ];

  const NPC_LINES = [
    ['ようこそ！\nここは STG や ACT と おなじ ぶつりエンジンで うごいているよ。',
      'ちがうのは せってい だけ。\nここでは へいめんの じゅうりょくが ゼロなんだ。',
      'そのかわり 「たかさ」にだけ じゅうりょくが かかるよ。\nX キーで ジャンプしてみて。'],
    ['スライムには ちかづくと ダメージを うけるよ。',
      'でも ジャンプちゅうなら とびこえられる！\nあたりはんていは へいめんだけど、たかさを みて\nダメージを きめているんだ。',
      'H キーで あたりはんていを みられるよ。'],
  ];

  const REWARDS = ['ひかるいし', 'ふるいちず', 'ゴールド 500', 'ハートのかけら'];

  class Adventurer {
    constructor(scene, x, y) {
      this.scene = scene;
      this.hp = 4;
      this.maxHp = 4;
      this.inv = 0;
      this.stun = 0;
      this.fx = 1;
      this.fy = 0;
      this.attackT = -1;
      this.hitList = new Set();
      this.body = new Body({
        x, y, r: 8, owner: this,
        layer: Layer.PLAYER, mask: Layer.ENEMY | Layer.ITEM, blocks: Layer.NPC,
        onEnter: (o) => { if (o.layer & Layer.ITEM) o.owner.collect(this); },
      });
      this.sword = new Body({
        r: 13, gravityScale: 0, collideTiles: false, enabled: false, owner: this,
        layer: Layer.PLAYER_ATTACK, mask: Layer.ENEMY,
        onEnter: (o) => {
          if (this.hitList.has(o)) return;
          this.hitList.add(o);
          o.owner.damage(1, this.fx, this.fy);
          scene.freeze = 0.05;
        },
      });
      this.bodies = [this.body, this.sword];
    }

    update(dt) {
      const b = this.body, input = this.scene.input;
      this.inv -= dt;
      this.stun -= dt;

      // 画面上の上下左右を、斜めの世界の向きに変換する
      const a = input.axis();
      let dx = a.x + a.y, dy = -a.x + a.y;
      const len = Math.hypot(dx, dy);
      if (this.stun <= 0) {
        if (len) {
          dx /= len;
          dy /= len;
          if (this.attackT < 0) { this.fx = dx; this.fy = dy; }
        }
        const speed = this.attackT >= 0 ? 50 : 110;
        b.vx = dx * speed;
        b.vy = dy * speed;
      }

      if (input.pressed('b') && b.zGrounded) b.vz = 230;

      if (input.pressed('a') && this.attackT < 0) {
        const target = this.scene.world.query(b.x + this.fx * 16, b.y + this.fy * 16, 14, 14, Layer.NPC)[0];
        if (target) this.scene.openDialog(target.owner.interact());
        else { this.attackT = 0; this.hitList.clear(); }
      }
      if (this.attackT >= 0) {
        this.attackT += dt;
        this.sword.enabled = this.attackT > 0.04 && this.attackT < 0.18;
        this.sword.x = b.x + this.fx * 16;
        this.sword.y = b.y + this.fy * 16;
        if (this.attackT > 0.28) this.attackT = -1;
      }

      // 平面で重なっていても、ジャンプで高く飛んでいればダメージを受けない
      for (const o of b.contacts) {
        if ((o.layer & Layer.ENEMY) && b.z < 10) this.hurt(o);
      }
    }

    hurt(o) {
      if (this.inv > 0 || this.dead) return;
      const b = this.body;
      const d = Math.hypot(b.x - o.x, b.y - o.y) || 1;
      this.hp--;
      this.inv = 1.2;
      this.stun = 0.2;
      b.vx = ((b.x - o.x) / d) * 200;
      b.vy = ((b.y - o.y) / d) * 200;
      this.scene.shake = 0.2;
      if (this.hp <= 0) {
        this.scene.particles.burst(b.x, b.y, { count: 30, speed: 140, color: '#ffb347', life: 0.8 });
        this.scene.kill(this);
        this.scene.state = 'over';
      }
    }

    draw(ctx) {
      const s = this.scene, b = this.body;
      const g = s.project(b.x, b.y, 0), p = s.project(b.x, b.y, b.z);
      shadow(ctx, g);
      if (this.inv > 0 && Math.floor(this.inv * 15) % 2) return;
      const side = Math.sign((this.fx - this.fy) * IX) || 1;
      const back = this.fx + this.fy < -0.2;
      const step = Math.hypot(b.vx, b.vy) > 10 && b.zGrounded ? Math.floor(s.time * 10) % 2 : 0;
      const x = Math.round(p.x), y = Math.round(p.y);
      ctx.fillStyle = '#5a3d2b';
      ctx.fillRect(x - 4, y - 3, 3, 3 - step);
      ctx.fillRect(x + 1, y - 3, 3, 2 + step);
      ctx.fillStyle = '#2f8f6b';
      ctx.fillRect(x - 5, y - 12, 10, 9);
      ctx.fillStyle = '#ffd6a5';
      ctx.fillRect(x - 4, y - 19, 8, 7);
      ctx.fillStyle = '#7a4a2a';
      ctx.fillRect(x - 5, y - 21, 10, back ? 8 : 3);
      if (!back) {
        ctx.fillStyle = '#222';
        ctx.fillRect(x + side * 2 - 1, y - 16, 2, 2);
      }
      if (this.attackT >= 0 && this.attackT < 0.22) {
        const sw = s.project(b.x + this.fx * 18, b.y + this.fy * 18, b.z + 8);
        ctx.strokeStyle = this.sword.enabled ? '#fff6a8' : '#e8f1ff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x, y - 9);
        ctx.lineTo(sw.x, sw.y);
        ctx.stroke();
      }
    }
  }

  class Slime {
    constructor(scene, x, y) {
      this.scene = scene;
      this.hp = 3;
      this.flash = 0;
      this.kb = 0;
      this.hop = rand(0, 0.6);
      this.wander = { x: 0, y: 0, t: 0 };
      this.body = new Body({ x, y, r: 9, owner: this, layer: Layer.ENEMY });
    }
    update(dt) {
      const b = this.body, hero = this.scene.hero.body;
      this.flash -= dt;
      this.kb -= dt;
      this.hop -= dt;
      if (this.kb > 0) return;
      const dx = hero.x - b.x, dy = hero.y - b.y, d = Math.hypot(dx, dy);
      if (d < 150 && !this.scene.hero.dead) {
        b.vx = (dx / d) * 45;
        b.vy = (dy / d) * 45;
      } else {
        this.wander.t -= dt;
        if (this.wander.t <= 0) {
          const a = rand(0, Math.PI * 2);
          this.wander = { x: Math.cos(a) * 25, y: Math.sin(a) * 25, t: rand(1, 2.5) };
          if (Math.random() < 0.3) this.wander.x = this.wander.y = 0;
        }
        b.vx = this.wander.x;
        b.vy = this.wander.y;
      }
      if (b.zGrounded && this.hop <= 0 && (b.vx || b.vy)) {
        b.vz = 90;
        this.hop = 0.7;
      }
    }
    damage(n, fx, fy) {
      const b = this.body;
      this.hp -= n;
      this.flash = 0.1;
      this.kb = 0.25;
      b.vx = fx * 180;
      b.vy = fy * 180;
      if (this.hp > 0) return;
      this.scene.score += 100;
      this.scene.particles.burst(b.x, b.y, { count: 14, speed: 90, color: '#9be56b', z: 6 });
      if (Math.random() < 0.35) this.scene.add(new Heart(this.scene, b.x, b.y));
      this.scene.kill(this);
    }
    draw(ctx) {
      const s = this.scene, b = this.body;
      const g = s.project(b.x, b.y, 0), p = s.project(b.x, b.y, b.z);
      shadow(ctx, g);
      const squish = b.zGrounded ? 1 + Math.sin(s.time * 8) * 0.08 : 0.9;
      ctx.fillStyle = this.flash > 0 ? '#fff' : '#9be56b';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y - 6 * squish, 10 / squish, 7 * squish, 0, Math.PI, 0);
      ctx.lineTo(p.x + 10 / squish, p.y);
      ctx.lineTo(p.x - 10 / squish, p.y);
      ctx.fill();
      ctx.fillStyle = '#1b3a12';
      ctx.fillRect(p.x - 4, p.y - 7, 2, 3);
      ctx.fillRect(p.x + 2, p.y - 7, 2, 3);
    }
  }

  class Heart {
    constructor(scene, x, y) {
      this.scene = scene;
      this.body = new Body({ x, y, r: 6, gravityScale: 0, collideTiles: false, owner: this, layer: Layer.ITEM });
    }
    update() {}
    collect(hero) {
      hero.hp = Math.min(hero.maxHp, hero.hp + 1);
      this.scene.kill(this);
    }
    draw(ctx) {
      const p = this.scene.project(this.body.x, this.body.y, 6 + Math.sin(this.scene.time * 4) * 2);
      G.draw.hearts(ctx, p.x - 5, p.y - 10, 1, 1);
    }
  }

  class Villager {
    constructor(scene, x, y, lines, color) {
      this.scene = scene;
      this.lines = lines;
      this.color = color;
      this.body = new Body({ x, y, w: 18, h: 18, gravityScale: 0, owner: this, layer: Layer.NPC });
    }
    update() {}
    interact() { return this.lines; }
    draw(ctx) {
      const s = this.scene, b = this.body;
      const p = s.project(b.x, b.y, Math.abs(Math.sin(s.time * 2)) * 2);
      shadow(ctx, s.project(b.x, b.y, 0));
      const x = Math.round(p.x), y = Math.round(p.y);
      ctx.fillStyle = this.color;
      ctx.fillRect(x - 6, y - 13, 12, 13);
      ctx.fillStyle = '#ffd6a5';
      ctx.fillRect(x - 4, y - 20, 8, 7);
      ctx.fillStyle = '#e9e6ff';
      ctx.fillRect(x - 5, y - 22, 10, 3);
      ctx.fillStyle = '#222';
      ctx.fillRect(x - 3, y - 17, 2, 2);
      ctx.fillRect(x + 1, y - 17, 2, 2);
    }
  }

  class Chest {
    constructor(scene, x, y, reward) {
      this.scene = scene;
      this.reward = reward;
      this.opened = false;
      this.body = new Body({ x, y, w: 22, h: 22, gravityScale: 0, owner: this, layer: Layer.NPC });
    }
    update() {}
    interact() {
      if (this.opened) return ['からっぽだ。'];
      const s = this.scene;
      this.opened = true;
      s.score += 500;
      s.found++;
      if (this.reward === 'ハートのかけら') {
        s.hero.maxHp++;
        s.hero.hp = s.hero.maxHp;
      }
      s.particles.burst(this.body.x, this.body.y, { count: 20, speed: 80, color: '#ffd84d', z: 10 });
      const lines = [`たからばこを あけた！\n「${this.reward}」を てにいれた。`];
      if (s.found === s.chests) lines.push('すべての たからばこを みつけた！\nおめでとう！');
      return lines;
    }
    draw(ctx) {
      const s = this.scene, b = this.body;
      // 箱は斜めの直方体として描く
      const h = 12;
      const c = (x, y, z) => s.project(x, y, z);
      const quad = (pts, color) => {
        ctx.fillStyle = color;
        ctx.beginPath();
        pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.fill();
      };
      const L = b.left, R = b.right, Tp = b.top, B = b.bottom;
      quad([c(L, B, 0), c(R, B, 0), c(R, B, h), c(L, B, h)], '#8a4f22');
      quad([c(R, Tp, 0), c(R, B, 0), c(R, B, h), c(R, Tp, h)], '#6e3d18');
      quad([c(L, Tp, h), c(R, Tp, h), c(R, B, h), c(L, B, h)], this.opened ? '#3a2410' : '#b8692f');
      if (!this.opened) {
        const m = c(b.x + 4, B, h * 0.6);
        ctx.fillStyle = '#ffd84d';
        ctx.fillRect(m.x - 2, m.y - 2, 4, 4);
      }
    }
  }

  function shadow(ctx, p) {
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, 9, 4, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  class RpgScene extends Scene {
    constructor(game) {
      const rows = MAP.map((r) => r.replace(/[PNSC]/g, '.'));
      const map = new TileMap(rows, T, { solid: ['#', 'T', '~'] });
      super(game, { gravity: 0, zGravity: 800, map, cellSize: 64 });
      this.shake = 0;
      this.camX = 0;
      this.camY = 0;
      this.dialog = null;
      this.found = 0;
      this.chests = 0;
      let npc = 0;
      MAP.forEach((row, ty) => {
        [...row].forEach((ch, tx) => {
          const x = tx * T + T / 2, y = ty * T + T / 2;
          if (ch === 'P') this.hero = this.add(new Adventurer(this, x, y));
          if (ch === 'S') this.add(new Slime(this, x, y));
          if (ch === 'N') this.add(new Villager(this, x, y, NPC_LINES[npc], ['#c0392b', '#3b6fd8'][npc++]));
          if (ch === 'C') this.add(new Chest(this, x, y, REWARDS[this.chests++]));
        });
      });
      this.snapCamera();
    }

    project(x, y, z = 0) {
      return { x: (x - y) * IX - this.camX, y: (x + y) * IY - z - this.camY };
    }

    snapCamera(rate = 1) {
      const b = this.hero.body;
      const tx = (b.x - b.y) * IX - W / 2, ty = (b.x + b.y) * IY - H / 2 + 10;
      this.camX += (tx - this.camX) * rate;
      this.camY += (ty - this.camY) * rate;
    }

    openDialog(lines) { this.dialog = { lines, i: 0 }; }

    update(dt) {
      this.shake = Math.max(0, this.shake - dt);
      if (this.dialog) {
        this.time += dt;
        if (this.input.pressed('a') || this.input.pressed('b')) {
          this.dialog.i++;
          if (this.dialog.i >= this.dialog.lines.length) this.dialog = null;
        }
        return;
      }
      if (this.state === 'over' && this.input.pressed('a')) this.restart = true;
      this.stepWorld(dt);
      this.snapCamera(Math.min(1, dt * 8));
    }

    drawGround(ctx, tx, ty, ch) {
      const p = [this.project(tx * T, ty * T), this.project((tx + 1) * T, ty * T),
        this.project((tx + 1) * T, (ty + 1) * T), this.project(tx * T, (ty + 1) * T)];
      if (ch === '~') ctx.fillStyle = (tx + ty + Math.floor(this.time * 2)) % 3 ? '#3d7fd9' : '#5596e6';
      else ctx.fillStyle = (tx + ty) % 2 ? '#5fae5a' : '#58a454';
      ctx.beginPath();
      p.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
      ctx.closePath();
      ctx.fill();
    }

    drawBlock(ctx, tx, ty) {
      const h = 14, x0 = tx * T, y0 = ty * T, x1 = x0 + T, y1 = y0 + T;
      const c = (x, y, z) => this.project(x, y, z);
      const quad = (pts, color) => {
        ctx.fillStyle = color;
        ctx.beginPath();
        pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
        ctx.fill();
      };
      quad([c(x0, y1, 0), c(x1, y1, 0), c(x1, y1, h), c(x0, y1, h)], '#6b6487');
      quad([c(x1, y0, 0), c(x1, y1, 0), c(x1, y1, h), c(x1, y0, h)], '#544e6f');
      quad([c(x0, y0, h), c(x1, y0, h), c(x1, y1, h), c(x0, y1, h)], '#8d86a8');
    }

    drawTree(ctx, tx, ty) {
      const p = this.project(tx * T + T / 2, ty * T + T / 2);
      shadow(ctx, p);
      ctx.fillStyle = '#6b3f2a';
      ctx.fillRect(p.x - 3, p.y - 14, 6, 14);
      ctx.fillStyle = '#2e7d4f';
      ctx.beginPath();
      ctx.arc(p.x, p.y - 26, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#3f9a5f';
      ctx.beginPath();
      ctx.arc(p.x - 4, p.y - 31, 8, 0, Math.PI * 2);
      ctx.fill();
    }

    draw(ctx) {
      const map = this.world.map;
      ctx.fillStyle = '#1f2a44';
      ctx.fillRect(0, 0, W, H);
      ctx.save();
      if (this.shake > 0) ctx.translate(rand(-2, 2), rand(-2, 2));

      const visible = (tx, ty) => {
        const p = this.project(tx * T + T / 2, ty * T + T / 2);
        return p.x > -60 && p.x < W + 60 && p.y > -60 && p.y < H + 80;
      };
      const objects = [];
      for (let ty = 0; ty < map.rows; ty++) {
        for (let tx = 0; tx < map.cols; tx++) {
          if (!visible(tx, ty)) continue;
          const ch = map.get(tx, ty);
          this.drawGround(ctx, tx, ty, ch);
          const depth = (tx + ty + 1) * T;
          if (ch === '#') objects.push({ depth, draw: () => this.drawBlock(ctx, tx, ty) });
          if (ch === 'T') objects.push({ depth, draw: () => this.drawTree(ctx, tx, ty) });
        }
      }
      // 奥（x + y が小さい）から順に描くと、手前のものが上に重なる
      for (const e of this.entities) objects.push({ depth: e.body.x + e.body.y, draw: () => e.draw(ctx) });
      objects.sort((a, b) => a.depth - b.depth);
      for (const o of objects) o.draw();
      this.particles.draw(ctx, (x, y, z) => this.project(x, y, z));
      ctx.restore();

      const D = G.draw;
      D.hearts(ctx, 10, 9, Math.max(0, this.hero.hp), this.hero.maxHp);
      D.text(ctx, `たからばこ ${this.found}/${this.chests}`, W - 10, 8, { size: 12, align: 'right', color: '#ffd84d' });
      D.text(ctx, `SCORE ${this.score}`, W - 10, 24, { size: 12, align: 'right' });

      if (this.dialog) {
        const lines = this.dialog.lines[this.dialog.i].split('\n');
        const h = 18 + lines.length * 17;
        ctx.fillStyle = 'rgba(14,12,40,0.92)';
        ctx.fillRect(12, H - h - 12, W - 24, h);
        ctx.strokeStyle = '#e9e6ff';
        ctx.lineWidth = 2;
        ctx.strokeRect(12, H - h - 12, W - 24, h);
        lines.forEach((l, i) => D.text(ctx, l, 24, H - h + i * 17, { size: 13, shadow: false }));
        if (Math.floor(this.time * 3) % 2) D.text(ctx, '▼', W - 32, H - 30, { size: 10, shadow: false });
      }
      if (this.state === 'over') D.banner(ctx, 'GAME OVER', 'Z でもう一度', '#ff5d73');
    }
  }

  G.modes.rpg = {
    id: 'rpg',
    label: 'RPG',
    name: '斜め見下ろしRPG',
    create: (game) => new RpgScene(game),
  };
})(globalThis.Game = globalThis.Game || {});
