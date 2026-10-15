/*
 * STG：空のフィールドで、現れたモンスターと魔法で戦う
 * 物理の設定：重力なし、タイルなし。押し戻しは使わず「重なったら通知」だけを使う
 */
(function (G) {
  'use strict';

  const { Body, Layer, Scene, W, H } = G;
  const { clamp, rand, pick } = G.util;
  const { SPELLS } = G.data;

  class Flyer {
    constructor(scene) {
      this.scene = scene;
      this.inv = 2;
      this.cool = 0;
      // 見た目より小さい当たり判定（シューティングの定番）
      this.body = new Body({
        x: 70, y: H / 2, r: 3, collideTiles: false, owner: this,
        layer: Layer.PLAYER, mask: Layer.ENEMY | Layer.ENEMY_ATTACK,
      });
    }
    update(dt) {
      const b = this.body, s = this.scene, input = s.input;
      const a = input.axis();
      const len = Math.hypot(a.x, a.y) || 1;
      b.vx = (a.x / len) * 170;
      b.vy = (a.y / len) * 170;
      b.x = clamp(b.x, 12, W - 12);
      b.y = clamp(b.y, 52, H - 8);
      this.inv -= dt;
      this.cool -= dt;
      s.party.regenMp(dt);

      if (input.down('a') && this.cool <= 0) {
        this.cool = 0.11;
        s.add(new Missile(s, b.x + 8, b.y - 3));
        s.add(new Missile(s, b.x + 8, b.y + 3));
      }
      if (input.pressed('c') || input.pressed('b')) {
        if (s.party.cast(SPELLS.fire)) s.add(new Fire(s, b.x + 12, b.y));
        else s.popup(b.x, b.y - 20, 'MPがたりない', '#8fd3ff');
      }
      // モンスターの体とは「重なっている間ずっと」危険なので contacts で調べる
      for (const o of b.contacts) if (o.layer & Layer.ENEMY) this.hurt(o.owner.kind, 1);
    }
    hurt(kind, scale) {
      const s = this.scene, b = this.body;
      if (this.inv > 0 || this.dead) return false;
      const dmg = s.party.takeDamage(kind, scale);
      s.popup(b.x, b.y - 14, String(dmg), '#ff8fa0');
      this.inv = 1.4;
      s.shake = 0.25;
      if (s.party.dead) {
        s.particles.burst(b.x, b.y, { count: 30, speed: 160, color: '#7ff', life: 0.7 });
        s.kill(this);
        s.state = 'over';
      }
      return true;
    }
    draw(ctx) {
      const b = this.body, s = this.scene;
      if (this.inv > 0 && Math.floor(this.inv * 15) % 2) return;
      // 足元の魔法陣に乗って飛んでいる
      ctx.strokeStyle = 'rgba(143,211,255,0.7)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(b.x, b.y + 10, 11, 3, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(143,211,255,0.25)';
      ctx.fill();
      G.sprites.hero(ctx, b.x, b.y + 9, { step: Math.floor(s.time * 4) % 2 });
      ctx.fillStyle = '#fff';
      ctx.fillRect(b.x - 1, b.y - 1, 2, 2);
    }
  }

  // 何度でも撃てる弱い魔法の弾
  class Missile {
    constructor(scene, x, y) {
      this.scene = scene;
      this.body = new Body({
        x, y, w: 10, h: 4, vx: 520, gravityScale: 0, collideTiles: false, owner: this,
        layer: Layer.PLAYER_ATTACK, mask: Layer.ENEMY,
        onEnter: (o) => {
          const kind = o.owner.kind;
          o.owner.damage(Math.ceil(scene.party.physicalDamage(kind) / 2));
          scene.kill(this);
        },
      });
    }
    update() { if (this.body.x > W + 20) this.scene.kill(this); }
    draw(ctx) { G.sprites.missile(ctx, this.body.x, this.body.y); }
  }

  // MP を使う強い魔法。敵を貫通する（同じ敵には1回だけ当たる）
  class Fire {
    constructor(scene, x, y) {
      this.scene = scene;
      this.hitList = new Set();
      this.body = new Body({
        x, y, r: 10, vx: 300, gravityScale: 0, collideTiles: false, owner: this,
        layer: Layer.PLAYER_ATTACK, mask: Layer.ENEMY,
        onEnter: (o) => {
          if (this.hitList.has(o)) return;
          this.hitList.add(o);
          o.owner.damage(scene.party.spellDamage(o.owner.kind));
          scene.particles.burst(o.x, o.y, { count: 10, speed: 120, color: '#ffb347', life: 0.35 });
        },
      });
    }
    update() { if (this.body.x > W + 30) this.scene.kill(this); }
    draw(ctx) { G.sprites.fireball(ctx, this.body.x, this.body.y, this.scene.time, 8); }
  }

  class Shot {
    constructor(scene, kind, x, y, angle, speed, style) {
      this.scene = scene;
      this.style = style;
      this.body = new Body({
        x, y, r: 3, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        gravityScale: 0, collideTiles: false, owner: this,
        layer: Layer.ENEMY_ATTACK, mask: Layer.PLAYER,
        // 当たった瞬間のイベントで、主人公にダメージを与えて弾を消す
        onEnter: (o) => { if (o.owner.hurt(kind, 0.8)) scene.kill(this); },
      });
    }
    update() {
      const b = this.body;
      if (b.x < -10 || b.x > W + 10 || b.y < -10 || b.y > H + 10) this.scene.kill(this);
    }
    draw(ctx) {
      const b = this.body;
      if (this.style === 'rock') G.sprites.rock(ctx, b.x, b.y);
      else G.sprites.fireball(ctx, b.x, b.y, this.scene.time, 4);
    }
  }

  const RADIUS = { slime: 8, bat: 8, goblin: 10, dragon: 24 };

  class Foe {
    constructor(scene, kind, x, y) {
      this.scene = scene;
      this.kind = kind;
      this.hp = G.data.MONSTERS[kind].hp;
      this.t = 0;
      this.baseY = y;
      this.flash = 0;
      this.fire = rand(0.8, 1.6);
      this.body = new Body({
        x, y, r: RADIUS[kind], gravityScale: 0, collideTiles: false, owner: this, layer: Layer.ENEMY,
      });
    }
    shoot(speed, style, spread = 0, count = 1) {
      const b = this.body, hero = this.scene.hero;
      if (hero.dead) return;
      const base = Math.atan2(hero.body.y - b.y, hero.body.x - b.x);
      for (let i = 0; i < count; i++) {
        const a = base + (i - (count - 1) / 2) * spread;
        this.scene.add(new Shot(this.scene, this.kind, b.x, b.y, a, speed, style));
      }
    }
    update(dt) {
      const b = this.body;
      this.t += dt;
      this.flash -= dt;
      switch (this.kind) {
        case 'bat':
          b.vx = -120;
          b.y = this.baseY + Math.sin(this.t * 4) * 36;
          break;
        case 'slime':
          b.vx = -80;
          b.y = this.baseY - Math.abs(Math.sin(this.t * 3)) * 40;
          break;
        case 'goblin':
          b.vx = this.t < 1 ? -90 : this.t > 7 ? -70 : 0;
          this.fire -= dt;
          if (this.fire <= 0 && this.t < 7) { this.fire = 1.3; this.shoot(130, 'rock'); }
          break;
        case 'dragon':
          b.vx = b.x > W - 90 ? -60 : 0;
          b.y = H / 2 + 20 + Math.sin(this.t * 0.8) * 80;
          this.fire -= dt;
          if (this.fire <= 0) { this.fire = 1.5; this.shoot(110, 'fire', 0.22, 5); }
          break;
      }
      if (b.x < -40) this.scene.kill(this);
    }
    damage(n) {
      const s = this.scene, b = this.body;
      this.hp -= n;
      this.flash = 0.06;
      s.popup(b.x, b.y - b.r, String(n));
      if (this.hp > 0) return;
      s.reward(this.kind, b.x, b.y - b.r - 12);
      s.particles.burst(b.x, b.y, { count: this.kind === 'dragon' ? 60 : 16, speed: 150, color: '#e9e6ff' });
      if (this.kind === 'dragon') { s.shake = 0.5; s.freeze = 0.1; }
      s.kill(this);
    }
    draw(ctx) {
      const b = this.body;
      const foot = { slime: 7, bat: 10, goblin: 11, dragon: 22 }[this.kind];
      G.sprites.monster(ctx, this.kind, b.x, b.y + foot, { t: this.t, flash: this.flash > 0, facing: -1 });
    }
  }

  class StgScene extends Scene {
    constructor(game) {
      super(game, { gravity: 0 });
      this.shake = 0;
      this.pending = [];
      this.nextWave = 1;
      this.nextBoss = 50;
      this.clouds = Array.from({ length: 9 }, () => ({ x: rand(0, W), y: rand(60, H), w: rand(30, 80), s: pick([0.4, 0.7, 1]) }));
      this.hero = this.add(new Flyer(this));
    }
    get stage() { return 1 + Math.floor(this.time / 30); }

    spawnWave() {
      const lv = this.stage;
      const at = (delay, kind, y) => this.pending.push({ delay, kind, y });
      const pattern = pick(['bats', 'bats', 'slimes', 'goblins']);
      if (pattern === 'bats') {
        const y = rand(90, H - 50);
        for (let i = 0; i < 4 + lv; i++) at(i * 0.25, 'bat', y);
      } else if (pattern === 'slimes') {
        for (let i = 0; i < 3 + lv; i++) at(i * 0.4, 'slime', rand(120, H - 20));
      } else {
        at(0, 'goblin', H * 0.38);
        at(0.4, 'goblin', H * 0.78);
      }
    }

    update(dt) {
      this.shake = Math.max(0, this.shake - dt);
      if (this.state === 'over') {
        this.stepWorld(dt);
        if (this.input.pressed('a')) { this.party.revive(); this.restart = true; }
        return;
      }
      this.nextWave -= dt;
      if (this.nextWave <= 0) {
        this.spawnWave();
        this.nextWave = Math.max(1.6, 3.2 - this.stage * 0.25);
      }
      if (this.time >= this.nextBoss && !this.entities.some((e) => e.kind === 'dragon')) {
        this.pending.push({ delay: 0, kind: 'dragon', y: H / 2 });
        this.nextBoss = this.time + 60;
      }
      for (const p of this.pending) p.delay -= dt;
      for (const p of this.pending.filter((q) => q.delay <= 0)) this.add(new Foe(this, p.kind, W + 30, p.y));
      this.pending = this.pending.filter((p) => p.delay > 0);
      this.stepWorld(dt);
    }

    draw(ctx) {
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#2a3f8f');
      sky.addColorStop(1, '#8fc3e8');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);
      for (const c of this.clouds) {
        const x = (((c.x - this.time * 60 * c.s) % (W + 100)) + W + 100) % (W + 100) - 50;
        ctx.fillStyle = `rgba(255,255,255,${0.25 + c.s * 0.35})`;
        ctx.beginPath();
        ctx.ellipse(x, c.y, c.w * c.s, 10 * c.s + 4, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.save();
      if (this.shake > 0) ctx.translate(rand(-3, 3), rand(-3, 3));
      for (const e of this.entities) e.draw(ctx);
      this.particles.draw(ctx, (x, y) => ({ x, y }));
      G.draw.popups(ctx, this.popups, (x, y, z) => ({ x, y: y - z }));
      ctx.restore();

      const D = G.draw;
      D.status(ctx, this.party);
      D.text(ctx, `${this.party.gold} G`, W - 10, 6, { size: 12, align: 'right', color: '#ffd84d' });
      D.text(ctx, `ステージ ${this.stage}`, W - 10, 22, { size: 12, align: 'right' });
      D.levelUp(ctx, this);
      if (this.state === 'over') D.banner(ctx, 'GAME OVER', 'Z でもう一度（ゴールドが半分になります）', '#ff5d73');
    }
  }

  G.modes.stg = {
    id: 'stg',
    label: 'STG',
    name: '空中戦',
    create: (game) => new StgScene(game),
  };
})(globalThis.Game = globalThis.Game || {});
