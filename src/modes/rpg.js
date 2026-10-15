/*
 * RPG：斜め見下ろし（クォータービュー）のフィールド。歩くとランダムエンカウントしてバトル画面へ
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
    '#....N....~~~~.....#',
    '#..........~~......#',
    '#..##..............#',
    '#..#C....T.....T...#',
    '#........T.........#',
    '#.............##...#',
    '#T...........#C#...#',
    '#..................#',
    '#..T..........I....#',
    '#.......##.........#',
    '#.......#C.........#',
    '#..................#',
    '#...........T......#',
    '#....~~~...........#',
    '#....~~~.......T...#',
    '#T...............C.#',
    '####################',
  ];

  const GUIDE_LINES = [
    'このあたりを あるいていると まものが あらわれるよ。\nかてば けいけんちと ゴールドが もらえる。',
    'STG や ACT の せかいで まものを たおしても\nおなじ けいけんちが たまるんだ。',
    'レベルが あがれば どの せかいでも つよくなれるよ。\nみなみの やどやで やすむと かいふくできるよ。',
  ];

  // 宝箱の中身。開けたかどうかは Party に記録するので、やり直しても復活しない
  const REWARDS = [
    { name: 'ちからのたね', apply: (p) => { p.bonus.atk += 2; p.recalc(); } },
    { name: '50 ゴールド', apply: (p) => { p.gold += 50; } },
    { name: 'まりょくのたね', apply: (p) => { p.bonus.mp += 4; p.recalc(); p.mp += 4; } },
    { name: 'いのちのきのみ', apply: (p) => { p.bonus.hp += 8; p.recalc(); p.hp += 8; } },
  ];

  class Adventurer {
    constructor(scene, x, y) {
      this.scene = scene;
      this.fx = 1;
      this.fy = 0;
      this.body = new Body({ x, y, r: 8, owner: this, layer: Layer.PLAYER, blocks: Layer.NPC });
    }

    update() {
      const b = this.body, input = this.scene.input;
      // 画面上の上下左右を、斜めの世界の向きに変換する
      const a = input.axis();
      let dx = a.x + a.y, dy = -a.x + a.y;
      const len = Math.hypot(dx, dy);
      if (len) {
        dx /= len;
        dy /= len;
        this.fx = dx;
        this.fy = dy;
      }
      b.vx = dx * 110;
      b.vy = dy * 110;
      if (input.pressed('b') && b.zGrounded) b.vz = 230;
      if (input.pressed('a')) {
        const target = this.scene.world.query(b.x + this.fx * 16, b.y + this.fy * 16, 14, 14, Layer.NPC)[0];
        if (target) this.scene.openDialog(target.owner.interact());
      }
    }

    draw(ctx) {
      const s = this.scene, b = this.body;
      shadow(ctx, s.project(b.x, b.y, 0));
      const p = s.project(b.x, b.y, b.z);
      const facing = Math.sign(this.fx - this.fy) || 1;
      const step = Math.hypot(b.vx, b.vy) > 10 && b.zGrounded ? Math.floor(s.time * 10) % 2 : 0;
      G.sprites.hero(ctx, p.x, p.y, { facing, step });
    }
  }

  class Villager {
    constructor(scene, x, y, color, talk) {
      this.scene = scene;
      this.color = color;
      this.talk = talk;
      this.body = new Body({ x, y, w: 18, h: 18, gravityScale: 0, owner: this, layer: Layer.NPC });
    }
    update() {}
    interact() { return this.talk(this.scene.party); }
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
    constructor(scene, x, y, id, reward) {
      this.scene = scene;
      this.id = id;
      this.reward = reward;
      this.body = new Body({ x, y, w: 22, h: 22, gravityScale: 0, owner: this, layer: Layer.NPC });
    }
    get opened() { return this.scene.party.flags.has(this.id); }
    update() {}
    interact() {
      const s = this.scene, p = s.party;
      if (this.opened) return ['からっぽだ。'];
      p.flags.add(this.id);
      this.reward.apply(p);
      s.particles.burst(this.body.x, this.body.y, { count: 20, speed: 80, color: '#ffd84d', z: 10 });
      const lines = [`たからばこを あけた！\n「${this.reward.name}」を てにいれた。`];
      if (s.found === s.chests.length) lines.push('すべての たからばこを みつけた！\nおめでとう！');
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

  // 出てくるモンスターの組み合わせ。ゴブリンはレベル2から、ドラゴンはレベル3からまれに出る
  function encounterGroup(level) {
    if (level >= 3 && Math.random() < 0.06) return ['dragon'];
    const n = 1 + Math.floor(Math.random() * Math.min(3, level + 1));
    const pool = level >= 2 ? ['slime', 'slime', 'bat', 'goblin'] : ['slime', 'slime', 'bat'];
    return Array.from({ length: n }, () => pick(pool));
  }

  class RpgScene extends Scene {
    constructor(game) {
      const rows = MAP.map((r) => r.replace(/[PNIC]/g, '.'));
      const map = new TileMap(rows, T, { solid: ['#', 'T', '~'] });
      super(game, { gravity: 0, zGravity: 800, map, cellSize: 64 });
      this.camX = 0;
      this.camY = 0;
      this.dialog = null;
      this.battle = null;
      this.chests = [];
      this.walk = 0;
      this.nextEncounter = rand(300, 560);
      MAP.forEach((row, ty) => {
        [...row].forEach((ch, tx) => {
          const x = tx * T + T / 2, y = ty * T + T / 2;
          if (ch === 'P') {
            this.start = { x, y };
            this.hero = this.add(new Adventurer(this, x, y));
          }
          if (ch === 'N') this.add(new Villager(this, x, y, '#c0392b', () => GUIDE_LINES));
          if (ch === 'I') {
            this.add(new Villager(this, x, y, '#3b6fd8', (p) => {
              p.restoreAll();
              return ['やどやへ ようこそ。\nゆっくり やすんでいきなさい。', 'HP と MP が ぜんかいふくした！'];
            }));
          }
          if (ch === 'C') this.chests.push(this.add(new Chest(this, x, y, `chest:${tx},${ty}`, REWARDS[this.chests.length])));
        });
      });
      this.last = { x: this.hero.body.x, y: this.hero.body.y };
      this.snapCamera();
    }

    get found() { return this.chests.filter((c) => c.opened).length; }

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

    startBattle(kinds) {
      const b = this.hero.body;
      b.vx = b.vy = 0;
      this.battle = new G.Battle(this, kinds);
      this.walk = 0;
      this.nextEncounter = rand(300, 560);
    }

    update(dt) {
      if (this.battle) {
        this.battle.update(dt);
        if (this.battle.mode === 'done') {
          if (this.battle.result === 'lose') this.state = 'over';
          this.battle = null;
        }
        return;
      }
      if (this.state === 'over') {
        this.time += dt;
        if (this.input.pressed('a')) {
          // 復活して最初の場所へ戻る
          this.party.revive();
          Object.assign(this.hero.body, { x: this.start.x, y: this.start.y, vx: 0, vy: 0 });
          this.last = { ...this.start };
          this.snapCamera();
          this.state = 'play';
        }
        return;
      }
      if (this.dialog) {
        this.time += dt;
        if (this.input.pressed('a') || this.input.pressed('b')) {
          this.dialog.i++;
          if (this.dialog.i >= this.dialog.lines.length) this.dialog = null;
        }
        return;
      }
      this.stepWorld(dt);
      this.snapCamera(Math.min(1, dt * 8));

      // 歩いた距離がたまるとエンカウント
      const b = this.hero.body;
      this.walk += Math.hypot(b.x - this.last.x, b.y - this.last.y);
      this.last = { x: b.x, y: b.y };
      if (this.walk >= this.nextEncounter && b.zGrounded) this.startBattle(encounterGroup(this.party.level));
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
      if (this.battle) {
        this.battle.draw(ctx);
        return;
      }
      const map = this.world.map;
      ctx.fillStyle = '#1f2a44';
      ctx.fillRect(0, 0, W, H);

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

      const D = G.draw;
      D.status(ctx, this.party);
      D.text(ctx, `${this.party.gold} G`, W - 10, 6, { size: 12, align: 'right', color: '#ffd84d' });
      D.text(ctx, `たからばこ ${this.found}/${this.chests.length}`, W - 10, 22, { size: 12, align: 'right', color: '#ffd84d' });
      D.levelUp(ctx, this);

      if (this.dialog) {
        const lines = this.dialog.lines[this.dialog.i].split('\n');
        const h = 18 + lines.length * 17;
        ctx.fillStyle = 'rgba(14,12,40,0.94)';
        ctx.fillRect(12, H - h - 12, W - 24, h);
        ctx.strokeStyle = '#e9e6ff';
        ctx.lineWidth = 2;
        ctx.strokeRect(12, H - h - 12, W - 24, h);
        lines.forEach((l, i) => D.text(ctx, l, 24, H - h + i * 17, { size: 13, shadow: false }));
        if (Math.floor(this.time * 3) % 2) D.text(ctx, '▼', W - 32, H - 30, { size: 10, shadow: false });
      }
      if (this.state === 'over') D.banner(ctx, 'GAME OVER', 'Z で さいしょの ばしょから（ゴールドが半分になります）', '#ff5d73');
    }
  }

  G.modes.rpg = {
    id: 'rpg',
    label: 'RPG',
    name: 'フィールドとバトル',
    create: (game) => new RpgScene(game),
  };
})(globalThis.Game = globalThis.Game || {});
