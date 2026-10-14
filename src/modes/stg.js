/*
 * STG：横スクロールシューティング
 * 物理の設定：重力なし、タイルなし。押し戻しは使わず「重なったら通知」だけを使う
 */
(function (G) {
  'use strict';

  const { Body, Layer, Scene, W, H } = G;
  const { clamp, rand, pick } = G.util;

  class Ship {
    constructor(scene) {
      this.scene = scene;
      this.lives = 3;
      this.invincible = 2;
      this.cool = 0;
      // 見た目より小さい当たり判定（シューティングの定番）
      this.body = new Body({
        x: 70, y: H / 2, r: 3, collideTiles: false, owner: this,
        layer: Layer.PLAYER, mask: Layer.ENEMY | Layer.ENEMY_ATTACK,
      });
    }
    update(dt) {
      const b = this.body, input = this.scene.input;
      const a = input.axis();
      const len = Math.hypot(a.x, a.y) || 1;
      b.vx = (a.x / len) * 170;
      b.vy = (a.y / len) * 170;
      b.x = clamp(b.x, 12, W - 12);
      b.y = clamp(b.y, 16, H - 12);
      this.invincible -= dt;
      this.cool -= dt;
      if (input.down('a') && this.cool <= 0) {
        this.cool = 0.09;
        this.scene.add(new Shot(this.scene, b.x + 10, b.y - 3));
        this.scene.add(new Shot(this.scene, b.x + 10, b.y + 3));
      }
      // 敵の機体とは「重なっている間ずっと」危険なので contacts で調べる
      for (const o of b.contacts) if (o.layer & Layer.ENEMY) this.damage();
    }
    damage() {
      if (this.invincible > 0 || this.dead) return false;
      const b = this.body;
      this.lives--;
      this.invincible = 2;
      this.scene.particles.burst(b.x, b.y, { count: 30, speed: 160, color: '#7ff', life: 0.7 });
      this.scene.shake = 0.3;
      if (this.lives <= 0) {
        this.scene.kill(this);
        this.scene.state = 'over';
      }
      return true;
    }
    draw(ctx) {
      const b = this.body;
      if (this.invincible > 0 && Math.floor(this.invincible * 15) % 2) return;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.fillStyle = '#ffb347';
      ctx.fillRect(-14, -2, 5, 4 + Math.sin(this.scene.time * 40) * 1.5);
      ctx.fillStyle = '#d7f3ff';
      ctx.beginPath();
      ctx.moveTo(14, 0);
      ctx.lineTo(-8, -8);
      ctx.lineTo(-4, 0);
      ctx.lineTo(-8, 8);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#3aa7c9';
      ctx.fillRect(-2, -2, 8, 4);
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  class Shot {
    constructor(scene, x, y) {
      this.scene = scene;
      this.body = new Body({
        x, y, w: 12, h: 3, vx: 560, gravityScale: 0, collideTiles: false, owner: this,
        layer: Layer.PLAYER_ATTACK, mask: Layer.ENEMY,
        onEnter: (o) => {
          o.owner.damage(1);
          scene.kill(this);
        },
      });
    }
    update() { if (this.body.x > W + 20) this.scene.kill(this); }
    draw(ctx) {
      const b = this.body;
      ctx.fillStyle = '#fff6a8';
      ctx.fillRect(b.left, b.top, b.hw * 2, b.hh * 2);
    }
  }

  class Bullet {
    constructor(scene, x, y, angle, speed) {
      this.scene = scene;
      this.body = new Body({
        x, y, r: 3, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        gravityScale: 0, collideTiles: false, owner: this,
        layer: Layer.ENEMY_ATTACK, mask: Layer.PLAYER,
        // 当たった瞬間のイベントで、自機にダメージを与えて弾を消す
        onEnter: (o) => { if (o.owner.damage()) scene.kill(this); },
      });
    }
    update() {
      const b = this.body;
      if (b.x < -10 || b.x > W + 10 || b.y < -10 || b.y > H + 10) this.scene.kill(this);
    }
    draw(ctx) {
      const b = this.body;
      ctx.fillStyle = '#ff5d73';
      ctx.beginPath();
      ctx.arc(b.x, b.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(b.x, b.y, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const KINDS = {
    wave: { hp: 1, r: 8, score: 100, color: '#9b8cff' },
    dart: { hp: 1, r: 7, score: 150, color: '#ff8fb1' },
    turret: { hp: 6, r: 11, score: 400, color: '#7bd389' },
    core: { hp: 60, r: 22, score: 5000, color: '#ffb347' },
  };

  class Enemy {
    constructor(scene, kind, x, y) {
      this.scene = scene;
      this.kind = kind;
      this.def = KINDS[kind];
      this.hp = this.def.hp;
      this.t = 0;
      this.baseY = y;
      this.flash = 0;
      this.fire = rand(0.6, 1.4);
      this.body = new Body({
        x, y, r: this.def.r, gravityScale: 0, collideTiles: false, owner: this, layer: Layer.ENEMY,
      });
    }
    aimAt(speed, spread = 0, count = 1) {
      const b = this.body, s = this.scene.ship.body;
      if (this.scene.ship.dead) return;
      const base = Math.atan2(s.y - b.y, s.x - b.x);
      for (let i = 0; i < count; i++) {
        const a = base + (i - (count - 1) / 2) * spread;
        this.scene.add(new Bullet(this.scene, b.x, b.y, a, speed));
      }
    }
    update(dt) {
      const b = this.body, lv = this.scene.level;
      this.t += dt;
      this.flash -= dt;
      switch (this.kind) {
        case 'wave':
          b.vx = -110;
          b.vy = 0;
          b.y = this.baseY + Math.sin(this.t * 3) * 40;
          break;
        case 'dart':
          b.vx = this.t < 0.6 ? -260 : -80 - this.t * 120;
          if (this.t > 0.6 && this.fire > 0) { this.fire = 0; this.aimAt(130 + lv * 10); }
          break;
        case 'turret':
          b.vx = this.t < 1 ? -90 : this.t > 7 ? -60 : 0;
          this.fire -= dt;
          if (this.fire <= 0 && this.t < 7) { this.fire = Math.max(0.6, 1.3 - lv * 0.1); this.aimAt(120 + lv * 10); }
          break;
        case 'core':
          b.vx = b.x > W - 90 ? -60 : 0;
          b.y = H / 2 + Math.sin(this.t * 0.8) * 90;
          this.fire -= dt;
          if (this.fire <= 0) { this.fire = 1.4; this.aimAt(110, 0.22, 5 + Math.min(lv, 4)); }
          break;
      }
      if (b.x < -40) this.scene.kill(this);
    }
    damage(n) {
      this.hp -= n;
      this.flash = 0.06;
      if (this.hp > 0) return;
      const b = this.body;
      this.scene.score += this.def.score;
      this.scene.particles.burst(b.x, b.y, { count: this.kind === 'core' ? 60 : 16, speed: 150, color: this.def.color });
      if (this.kind === 'core') { this.scene.shake = 0.5; this.scene.freeze = 0.08; }
      this.scene.kill(this);
    }
    draw(ctx) {
      const b = this.body, r = this.def.r;
      ctx.fillStyle = this.flash > 0 ? '#fff' : this.def.color;
      ctx.save();
      ctx.translate(b.x, b.y);
      if (this.kind === 'core') {
        ctx.rotate(this.t);
        ctx.fillRect(-r, -r * 0.4, r * 2, r * 0.8);
        ctx.fillRect(-r * 0.4, -r, r * 0.8, r * 2);
        ctx.rotate(-this.t);
        ctx.fillStyle = this.flash > 0 ? '#fff' : '#ff5d73';
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.45, 0, Math.PI * 2);
        ctx.fill();
      } else if (this.kind === 'turret') {
        ctx.fillRect(-r, -r * 0.7, r * 2, r * 1.4);
        ctx.fillStyle = '#1d3b2a';
        ctx.fillRect(-r - 6, -2, 8, 4);
      } else {
        ctx.beginPath();
        ctx.moveTo(-r, 0);
        ctx.lineTo(r * 0.6, -r);
        ctx.lineTo(r, 0);
        ctx.lineTo(r * 0.6, r);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
  }

  class StgScene extends Scene {
    constructor(game) {
      super(game, { gravity: 0 });
      this.shake = 0;
      this.pending = [];
      this.nextWave = 1;
      this.nextCore = 40;
      this.stars = Array.from({ length: 70 }, () => ({ x: rand(0, W), y: rand(0, H), s: pick([0.3, 0.6, 1]) }));
      this.ship = this.add(new Ship(this));
    }
    get level() { return 1 + Math.floor(this.time / 30); }

    spawnWave() {
      const lv = this.level;
      const at = (delay, kind, y) => this.pending.push({ delay, kind, y });
      const pattern = pick(['line', 'line', 'darts', 'turrets']);
      if (pattern === 'line') {
        const y = rand(60, H - 60);
        for (let i = 0; i < 5 + lv; i++) at(i * 0.22, 'wave', y);
      } else if (pattern === 'darts') {
        for (let i = 0; i < 4 + lv; i++) at(i * 0.3, 'dart', rand(30, H - 30));
      } else {
        at(0, 'turret', H * 0.28);
        at(0.4, 'turret', H * 0.72);
      }
    }

    update(dt) {
      if (this.state === 'over') {
        this.stepWorld(dt);
        if (this.input.pressed('a')) this.restart = true;
        return;
      }
      this.shake = Math.max(0, this.shake - dt);
      this.nextWave -= dt;
      if (this.nextWave <= 0) {
        this.spawnWave();
        this.nextWave = Math.max(1.4, 3 - this.level * 0.25);
      }
      if (this.time >= this.nextCore && !this.entities.some((e) => e.kind === 'core')) {
        this.pending.push({ delay: 0, kind: 'core', y: H / 2 });
        this.nextCore = this.time + 45;
      }
      for (const p of this.pending) p.delay -= dt;
      for (const p of this.pending.filter((q) => q.delay <= 0)) this.add(new Enemy(this, p.kind, W + 30, p.y));
      this.pending = this.pending.filter((p) => p.delay > 0);
      this.stepWorld(dt);
    }

    draw(ctx) {
      ctx.fillStyle = '#0b0a24';
      ctx.fillRect(0, 0, W, H);
      for (const s of this.stars) {
        const x = (((s.x - this.time * 90 * s.s) % W) + W) % W;
        ctx.fillStyle = s.s === 1 ? '#fff' : s.s > 0.5 ? '#9fb2ff' : '#4d4f8a';
        ctx.fillRect(x, s.y, s.s === 1 ? 2 : 1, 1);
      }
      ctx.save();
      if (this.shake > 0) ctx.translate(rand(-3, 3), rand(-3, 3));
      for (const e of this.entities) e.draw(ctx);
      this.particles.draw(ctx, (x, y) => ({ x, y }));
      ctx.restore();

      const D = G.draw;
      D.text(ctx, `SCORE ${String(this.score).padStart(7, '0')}`, 10, 8, { size: 12 });
      D.text(ctx, `LV ${this.level}`, W / 2, 8, { size: 12, align: 'center', color: '#9fb2ff' });
      for (let i = 0; i < Math.max(0, this.ship.lives); i++) {
        ctx.fillStyle = '#d7f3ff';
        ctx.beginPath();
        ctx.moveTo(W - 14 - i * 16, 14);
        ctx.lineTo(W - 24 - i * 16, 9);
        ctx.lineTo(W - 24 - i * 16, 19);
        ctx.fill();
      }
      if (this.state === 'over') D.banner(ctx, 'GAME OVER', `スコア ${this.score}　Z でもう一度`, '#ff5d73');
    }
  }

  G.modes.stg = {
    id: 'stg',
    label: 'STG',
    name: '横シューティング',
    create: (game) => new StgScene(game),
  };
})(globalThis.Game = globalThis.Game || {});
