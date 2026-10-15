/*
 * ゲームの土台（3つのモードで共通）
 * - 入力（キーボードと画面上のボタン）
 * - Scene：物理ワールドとエンティティの管理。更新順は「エンティティ → 物理 → 消えたものの片付け」
 * - パーティクル、描画の補助
 * - 固定時間ステップのゲームループ
 */
(function (G) {
  'use strict';

  G.W = 480;
  G.H = 320;
  G.DT = 1 / 60;
  G.FONT = '"DotGothic16", "Hiragino Kaku Gothic ProN", "Noto Sans JP", monospace';

  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const approach = (v, target, delta) => (v < target ? Math.min(v + delta, target) : Math.max(v - delta, target));
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  G.util = { clamp, approach, rand, pick };

  const KEYMAP = {
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    ArrowUp: 'up', KeyW: 'up',
    ArrowDown: 'down', KeyS: 'down',
    KeyZ: 'a', KeyJ: 'a',
    KeyX: 'b', KeyK: 'b', Space: 'b',
    KeyC: 'c', KeyL: 'c',
  };

  class Input {
    constructor() {
      this.held = {};
      this.tapped = {};
    }
    press(action) {
      if (!this.held[action]) this.tapped[action] = true;
      this.held[action] = true;
    }
    release(action) { this.held[action] = false; }
    releaseAll() { this.held = {}; }
    down(action) { return !!this.held[action]; }
    // このステップで押された瞬間か。固定ステップの途中で押されても取りこぼさない
    pressed(action) { return !!this.tapped[action]; }
    endStep() { this.tapped = {}; }
    axis() {
      return {
        x: (this.held.right ? 1 : 0) - (this.held.left ? 1 : 0),
        y: (this.held.down ? 1 : 0) - (this.held.up ? 1 : 0),
      };
    }
    attachKeyboard(target) {
      target.addEventListener('keydown', (e) => {
        const action = KEYMAP[e.code];
        if (!action) return;
        e.preventDefault();
        this.press(action);
      });
      target.addEventListener('keyup', (e) => {
        const action = KEYMAP[e.code];
        if (!action) return;
        e.preventDefault();
        this.release(action);
      });
    }
  }

  class Particles {
    constructor() { this.list = []; }
    burst(x, y, o = {}) {
      const count = o.count ?? 12;
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = rand(0.3, 1) * (o.speed ?? 120);
        this.list.push({
          x, y, z: o.z ?? 0,
          vx: Math.cos(a) * s, vy: Math.sin(a) * s,
          life: o.life ?? 0.5, max: o.life ?? 0.5,
          color: o.color ?? '#fff', size: o.size ?? 2, gravity: o.gravity ?? 0,
        });
      }
    }
    update(dt) {
      for (const p of this.list) {
        p.vy += p.gravity * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
      }
      this.list = this.list.filter((p) => p.life > 0);
    }
    draw(ctx, project) {
      for (const p of this.list) {
        const s = project(p.x, p.y, p.z);
        ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
        ctx.fillStyle = p.color;
        ctx.fillRect(s.x - p.size / 2, s.y - p.size / 2, p.size, p.size);
      }
      ctx.globalAlpha = 1;
    }
  }

  // エンティティは { body?, bodies?, dead, update(dt), draw(ctx) } を持つただのオブジェクト
  class Scene {
    constructor(game, worldOptions) {
      this.game = game;
      this.input = game.input;
      this.party = game.party;
      this.popups = [];
      this.world = new G.World(worldOptions);
      this.entities = [];
      this.particles = new Particles();
      this.time = 0;
      this.freeze = 0; // ヒットストップ（当たった瞬間に少し止める）
      this.state = 'play';
      this.score = 0;
    }
    add(e) {
      e.dead = false;
      this.entities.push(e);
      for (const b of bodiesOf(e)) this.world.add(b);
      return e;
    }
    kill(e) {
      e.dead = true;
      for (const b of bodiesOf(e)) b.enabled = false;
    }
    // ダメージの数字など、少しの間だけ浮かんで消える文字
    popup(x, y, str, color = '#fff', z = 0) {
      this.popups.push({ x, y, z, str, color, life: 0.8 });
    }
    // モンスターを倒したときの共通処理。経験値とゴールドは3モードで共通の Party に入る
    reward(kind, x, y, z = 0) {
      const m = G.data.MONSTERS[kind];
      const ups = this.party.defeat(kind);
      this.popup(x, y, `+${m.exp}EXP`, '#ffef7a', z);
      if (ups) this.levelUp = 1.6;
      return ups;
    }
    updateEffects(dt) {
      this.levelUp = Math.max(0, (this.levelUp ?? 0) - dt);
      this.particles.update(dt);
      for (const p of this.popups) { p.life -= dt; p.z += dt * 30; }
      this.popups = this.popups.filter((p) => p.life > 0);
    }
    stepWorld(dt) {
      this.time += dt;
      this.updateEffects(dt);
      if (this.freeze > 0) { this.freeze -= dt; return; }
      const n = this.entities.length;
      for (let i = 0; i < n; i++) {
        const e = this.entities[i];
        if (!e.dead) e.update(dt);
      }
      this.world.step(dt);
      if (this.entities.some((e) => e.dead)) {
        for (const e of this.entities) if (e.dead) for (const b of bodiesOf(e)) this.world.remove(b);
        this.entities = this.entities.filter((e) => !e.dead);
      }
    }
    // 物理座標 → 画面座標。モードごとに上書きする
    project(x, y) { return { x, y }; }
  }

  function bodiesOf(e) {
    if (e.bodies) return e.bodies;
    return e.body ? [e.body] : [];
  }

  // 当たり判定の表示（H キー）。どのモードでも同じ関数で描ける
  function drawBodies(ctx, scene) {
    const colorOf = (b) => {
      const L = G.Layer;
      if (b.layer & L.PLAYER) return '#4cf';
      if (b.layer & L.PLAYER_ATTACK) return '#ff4';
      if (b.layer & (L.ENEMY | L.ENEMY_ATTACK)) return '#f55';
      if (b.layer & L.ITEM) return '#5f8';
      return '#c8f';
    };
    ctx.lineWidth = 1;
    for (const b of scene.world.bodies) {
      if (!b.enabled || b.removed) continue;
      const pts = [];
      if (b.shape === 'circle') {
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2;
          pts.push(scene.project(b.x + Math.cos(a) * b.r, b.y + Math.sin(a) * b.r, b.z));
        }
      } else {
        pts.push(scene.project(b.left, b.top, b.z), scene.project(b.right, b.top, b.z),
          scene.project(b.right, b.bottom, b.z), scene.project(b.left, b.bottom, b.z));
      }
      ctx.strokeStyle = colorOf(b);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.globalAlpha = 0.25;
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.stroke();
    }
  }

  function text(ctx, str, x, y, o = {}) {
    ctx.font = `${o.size ?? 12}px ${G.FONT}`;
    ctx.textAlign = o.align ?? 'left';
    ctx.textBaseline = o.baseline ?? 'top';
    if (o.shadow !== false) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillText(str, x + 1, y + 1);
    }
    ctx.fillStyle = o.color ?? '#fff';
    ctx.fillText(str, x, y);
  }

  function hearts(ctx, x, y, hp, max) {
    for (let i = 0; i < max; i++) {
      const cx = x + i * 14;
      ctx.fillStyle = i < hp ? '#ff5d73' : 'rgba(255,255,255,0.2)';
      ctx.beginPath();
      ctx.arc(cx + 3, y + 3, 3, 0, Math.PI * 2);
      ctx.arc(cx + 8, y + 3, 3, 0, Math.PI * 2);
      ctx.moveTo(cx, y + 4);
      ctx.lineTo(cx + 5.5, y + 10);
      ctx.lineTo(cx + 11, y + 4);
      ctx.fill();
    }
  }

  function popups(ctx, list, project) {
    for (const p of list) {
      const s = project(p.x, p.y, p.z);
      ctx.globalAlpha = clamp(p.life / 0.3, 0, 1);
      text(ctx, p.str, s.x, s.y, { size: 12, align: 'center', baseline: 'bottom', color: p.color });
    }
    ctx.globalAlpha = 1;
  }

  // 3モード共通のステータス表示
  function status(ctx, party, x = 8, y = 6) {
    const bar = (by, value, max, color) => {
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(x + 64, by + 3, 62, 6);
      ctx.fillStyle = color;
      ctx.fillRect(x + 64, by + 3, Math.round((62 * Math.max(0, value)) / max), 6);
    };
    ctx.fillStyle = 'rgba(14,12,40,0.6)';
    ctx.fillRect(x - 4, y - 2, 196, 38);
    text(ctx, `Lv${party.level}`, x, y + 10, { size: 13, color: '#ffef7a' });
    text(ctx, 'HP', x + 40, y, { size: 11, color: '#ff8fa0' });
    bar(y, party.hp, party.maxHp, '#ff5d73');
    text(ctx, `${party.hp}/${party.maxHp}`, x + 132, y, { size: 11 });
    text(ctx, 'MP', x + 40, y + 16, { size: 11, color: '#8fd3ff' });
    bar(y + 16, party.mp, party.maxMp, '#5ab0f0');
    text(ctx, `${party.mp}/${party.maxMp}`, x + 132, y + 16, { size: 11 });
  }

  function levelUp(ctx, scene) {
    if (!scene.levelUp) return;
    const y = 52 - Math.max(0, scene.levelUp - 1.3) * 60;
    text(ctx, `LEVEL UP!  Lv${scene.party.level}`, G.W / 2, y, { size: 18, align: 'center', color: '#ffef7a' });
  }

  function banner(ctx, title, sub, color) {
    ctx.fillStyle = 'rgba(10,8,30,0.6)';
    ctx.fillRect(0, G.H / 2 - 34, G.W, 68);
    text(ctx, title, G.W / 2, G.H / 2 - 24, { size: 24, align: 'center', color });
    text(ctx, sub, G.W / 2, G.H / 2 + 8, { size: 12, align: 'center' });
  }

  class Loop {
    constructor(step, render) {
      this.step = step;
      this.render = render;
      this.acc = 0;
      this.last = 0;
    }
    start() {
      const tick = (t) => {
        if (this.last) this.acc += Math.min(0.25, (t - this.last) / 1000);
        this.last = t;
        let n = 0;
        while (this.acc >= G.DT && n < 5) {
          this.step(G.DT);
          this.acc -= G.DT;
          n++;
        }
        if (n === 5) this.acc = 0;
        this.render();
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
  }

  G.Input = Input;
  G.Particles = Particles;
  G.Scene = Scene;
  G.Loop = Loop;
  G.draw = { bodies: drawBodies, text, hearts, banner, popups, status, levelUp };
  G.modes = G.modes || {};
})(globalThis.Game = globalThis.Game || {});
