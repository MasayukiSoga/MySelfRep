/*
 * 共通のフィールド（斜め見下ろし／クォータービュー）
 * RPG・ACT・STG のどのスタイルでも、このひとつのフィールドを歩く。切り替えても位置や状態はそのまま
 *
 * 物理の設定：平面の重力なし、タイルとの押し戻しあり、高さ z にだけ重力（ジャンプ用）
 * 物理は「真上から見た2D」で計算し、描画するときだけ斜めに変換する
 */
(function (G) {
  'use strict';

  const { Body, Layer, Scene, TileMap, W, H } = G;
  const { rand, pick } = G.util;
  const { MONSTERS } = G.data;

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
    'ここは ひとつの フィールド。\nボタンで たたかいかたを きりかえられるよ。',
    'まものは いつも フィールドに いるよ。\nRPG だと すがたが みえなくなって、ぶつかると バトルがめんへ。\nACT なら けんで、STG なら まほうの たまで たたかうんだ。',
    'どの たたかいかたでも けいけんちは おなじように たまるよ。\nみなみの やどやで やすむと かいふくできるよ。',
  ];

  // 宝箱の中身。開けたかどうかは Party に記録するので、やり直しても復活しない
  const REWARDS = [
    { name: 'ちからのたね', apply: (p) => { p.bonus.atk += 2; p.recalc(); } },
    { name: '50 ゴールド', apply: (p) => { p.gold += 50; } },
    { name: 'まりょくのたね', apply: (p) => { p.bonus.mp += 4; p.recalc(); p.mp += 4; } },
    { name: 'いのちのきのみ', apply: (p) => { p.bonus.hp += 8; p.recalc(); p.hp += 8; } },
  ];

  function shadow(ctx, p, r = 9) {
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, r, r * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // 消える条件が「壁に当たる」弾。上下左右どちらの壁でも物理エンジンが教えてくれる
  const hitWall = (b) => b.wall !== 0 || b.onGround || b.onCeiling;

  class Adventurer {
    constructor(scene, x, y) {
      this.scene = scene;
      this.fx = Math.SQRT1_2;
      this.fy = Math.SQRT1_2;
      this.inv = 0;
      this.stun = 0;
      this.cool = 0;
      this.castT = 0;
      this.attackT = -1;
      this.hitList = new Set();
      this.body = new Body({
        x, y, r: 8, owner: this,
        layer: Layer.PLAYER, mask: Layer.ENEMY | Layer.ENEMY_ATTACK, blocks: Layer.NPC,
      });
      // 剣の攻撃判定。振っている途中の数フレームだけ有効にする
      this.sword = new Body({
        r: 14, gravityScale: 0, collideTiles: false, enabled: false, owner: this,
        layer: Layer.PLAYER_ATTACK, mask: Layer.ENEMY,
        onEnter: (o) => {
          if (this.hitList.has(o)) return;
          this.hitList.add(o);
          o.owner.damage(scene.party.physicalDamage(o.owner.kind), this.fx, this.fy);
          scene.freeze = 0.05;
        },
      });
      this.bodies = [this.body, this.sword];
    }

    swing() {
      if (this.attackT >= 0) return;
      this.attackT = 0;
      this.hitList.clear();
    }

    shoot() {
      if (this.cool > 0) return;
      this.cool = 0.12;
      const b = this.body, s = this.scene;
      // 少し左右にずらして2発
      const sx = -this.fy * 5, sy = this.fx * 5;
      for (const k of [-1, 1]) {
        s.add(new Bolt(s, b.x + this.fx * 10 + sx * k, b.y + this.fy * 10 + sy * k, this.fx, this.fy, 'missile'));
      }
    }

    cast(spell, { pierce }) {
      const s = this.scene, b = this.body;
      if (this.castT > 0) return;
      if (!s.party.cast(spell)) {
        s.popup(b.x, b.y, 'MPがたりない', '#8fd3ff', 30);
        return;
      }
      this.castT = 0.3;
      s.add(new Bolt(s, b.x + this.fx * 12, b.y + this.fy * 12, this.fx, this.fy, pierce ? 'fire-pierce' : 'fire'));
    }

    hurt(dmg, from) {
      const s = this.scene, b = this.body, party = s.party;
      if (this.inv > 0 || this.dead || s.state !== 'play') return false;
      party.hp = Math.max(0, party.hp - dmg);
      s.popup(b.x, b.y, String(dmg), '#ff8fa0', 30);
      this.inv = 1.2;
      this.stun = 0.2;
      const d = Math.hypot(b.x - from.x, b.y - from.y) || 1;
      b.vx = ((b.x - from.x) / d) * 200;
      b.vy = ((b.y - from.y) / d) * 200;
      s.shake = 0.2;
      if (party.dead) s.gameOver();
      return true;
    }

    update(dt) {
      const b = this.body, s = this.scene, input = s.input, style = s.style;
      this.inv -= dt;
      this.stun -= dt;
      this.cool -= dt;
      this.castT -= dt;
      if (!style.touchBattle) s.party.regenMp(dt);

      // 画面上の上下左右を、斜めの世界の向きに変換する
      const a = input.axis();
      let dx = a.x + a.y, dy = -a.x + a.y;
      const len = Math.hypot(dx, dy);
      if (this.stun <= 0) {
        if (len) {
          dx /= len;
          dy /= len;
          if (this.attackT < 0 && !style.locksFacing?.(input)) { this.fx = dx; this.fy = dy; }
        }
        const speed = this.attackT >= 0 ? 50 : 110;
        b.vx = dx * speed;
        b.vy = dy * speed;
      }
      if (input.pressed('b') && b.zGrounded) b.vz = 230;

      // 人や宝箱の前なら、どのスタイルでも Z で話す・開ける
      const target = input.pressed('a') && s.world.query(b.x + this.fx * 16, b.y + this.fy * 16, 14, 14, Layer.NPC)[0];
      if (target) s.openDialog(target.owner.interact());
      else style.control(this, input, dt);

      if (this.attackT >= 0) {
        this.attackT += dt;
        this.sword.enabled = this.attackT > 0.04 && this.attackT < 0.18;
        this.sword.x = b.x + this.fx * 16;
        this.sword.y = b.y + this.fy * 16;
        if (this.attackT > 0.28) this.attackT = -1;
      }

      // 平面で重なっていても、ジャンプで高く飛んでいれば当たらない
      // RPG スタイルではダメージのかわりにバトル画面へ
      for (const o of b.contacts) {
        if (!(o.layer & Layer.ENEMY) || b.z >= 10) continue;
        if (style.touchBattle) s.encounter(o.owner);
        else this.hurt(o.owner.damageTo(s.party), o);
      }
    }

    draw(ctx) {
      const s = this.scene, b = this.body;
      const g = s.project(b.x, b.y, 0), p = s.project(b.x, b.y, b.z);
      if (s.style.id === 'stg') {
        // STG スタイルでは足元に魔法陣
        ctx.strokeStyle = 'rgba(143,211,255,0.8)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(g.x, g.y, 13, 6, 0, 0, Math.PI * 2);
        ctx.stroke();
        const aim = s.project(b.x + this.fx * 26, b.y + this.fy * 26, 0);
        ctx.fillStyle = 'rgba(143,211,255,0.8)';
        ctx.fillRect(aim.x - 2, aim.y - 2, 4, 4);
      } else shadow(ctx, g);
      if (this.inv > 0 && Math.floor(this.inv * 15) % 2) return;
      const facing = Math.sign(this.fx - this.fy) || 1;
      const step = Math.hypot(b.vx, b.vy) > 10 && b.zGrounded ? Math.floor(s.time * 10) % 2 : 0;
      G.sprites.hero(ctx, p.x, p.y, { facing, step, skin: s.world.skins.get('hero') });
      if (this.castT > 0.15) {
        ctx.fillStyle = 'rgba(255,180,70,0.5)';
        ctx.beginPath();
        ctx.arc(p.x + facing * 8, p.y - 10, 6, 0, Math.PI * 2);
        ctx.fill();
      }
      if (this.attackT >= 0 && this.attackT < 0.22) {
        const sw = s.project(b.x + this.fx * 20, b.y + this.fy * 20, b.z + 8);
        ctx.strokeStyle = this.sword.enabled ? '#fff6a8' : '#e8f1ff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - 9);
        ctx.lineTo(sw.x, sw.y);
        ctx.stroke();
        if (this.sword.enabled) {
          const c = s.project(b.x + this.fx * 16, b.y + this.fy * 16, b.z + 6);
          ctx.strokeStyle = 'rgba(255,246,168,0.5)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.ellipse(c.x, c.y, 12, 6, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }
  }

  // 主人公の魔法（STG の弾、ファイア）
  class Bolt {
    constructor(scene, x, y, fx, fy, type) {
      this.scene = scene;
      this.type = type;
      this.life = type === 'missile' ? 0.7 : 1.2;
      this.hitList = new Set();
      const speed = type === 'missile' ? 330 : 240;
      this.body = new Body({
        x, y, r: type === 'missile' ? 4 : 7, vx: fx * speed, vy: fy * speed, gravityScale: 0, owner: this,
        layer: Layer.PLAYER_ATTACK, mask: Layer.ENEMY,
        onEnter: (o) => this.hit(o),
      });
      this.body.z = 10;
    }
    hit(o) {
      const s = this.scene, kind = o.owner.kind, b = this.body;
      if (this.hitList.has(o)) return;
      this.hitList.add(o);
      const dmg = this.type === 'missile'
        ? Math.ceil(s.party.physicalDamage(kind) / 2)
        : s.party.spellDamage(kind);
      const d = Math.hypot(b.vx, b.vy) || 1;
      o.owner.damage(dmg, b.vx / d, b.vy / d);
      if (this.type === 'fire-pierce') {
        s.particles.burst(o.x, o.y, { count: 8, speed: 100, color: '#ffb347', life: 0.3, z: 10 });
      } else this.explode();
    }
    explode() {
      const color = this.type === 'missile' ? '#bff3ff' : '#ffb347';
      this.scene.particles.burst(this.body.x, this.body.y, { count: this.type === 'missile' ? 4 : 12, speed: 90, color, life: 0.3, z: 10 });
      this.scene.kill(this);
    }
    update(dt) {
      this.life -= dt;
      if (hitWall(this.body)) this.explode();
      else if (this.life <= 0) this.scene.kill(this);
    }
    draw(ctx) {
      const b = this.body, p = this.scene.project(b.x, b.y, b.z);
      shadow(ctx, this.scene.project(b.x, b.y, 0), 4);
      if (this.type === 'missile') {
        ctx.fillStyle = '#bff3ff';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
      } else G.sprites.fireball(ctx, p.x, p.y, this.scene.time, 6);
    }
  }

  // モンスターの弾（石、針、火の玉）
  class EnemyShot {
    constructor(scene, kind, x, y, angle, speed) {
      this.scene = scene;
      this.kind = kind;
      this.life = 3;
      this.body = new Body({
        x, y, r: 4, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, gravityScale: 0, owner: this,
        layer: Layer.ENEMY_ATTACK, mask: Layer.PLAYER,
        // ジャンプ中なら弾を飛び越えられる
        onEnter: (o) => {
          const hero = o.owner;
          if (hero.body.z < 12 && hero.hurt(scene.party.damageFrom(kind, 0.8), this.body)) scene.kill(this);
        },
      });
      this.body.z = 8;
    }
    update(dt) {
      this.life -= dt;
      if (hitWall(this.body) || this.life <= 0) this.scene.kill(this);
    }
    draw(ctx) {
      const b = this.body, s = this.scene, p = s.project(b.x, b.y, b.z);
      shadow(ctx, s.project(b.x, b.y, 0), 4);
      if (this.kind === 'goblin') G.sprites.rock(ctx, p.x, p.y);
      else if (this.kind === 'dragon') G.sprites.fireball(ctx, p.x, p.y, s.time, 4);
      else {
        ctx.fillStyle = '#ff5d73';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  const RADIUS = { slime: 9, bat: 8, goblin: 9, dragon: 18 };
  const SPEED = { slime: 40, bat: 55, goblin: 35, dragon: 28 };

  // フィールドに出てくるモンスターのシンボル。1つのシンボルが最大30体の群れを表す
  // 先頭（kind・hp）がフィールドで見えている1体で、残りは followers に並んで待っている
  class FieldMonster {
    constructor(scene, kind, x, y, followers = []) {
      this.scene = scene;
      this.kind = kind;
      this.hp = MONSTERS[kind].hp;
      this.followers = followers.map((f) => ({ kind: f.kind, hp: f.hp ?? MONSTERS[f.kind].hp }));
      this.t = rand(0, 3);
      this.flash = 0;
      this.kb = 0;
      this.hop = rand(0, 0.6);
      this.fire = rand(1, 2);
      this.wander = { x: 0, y: 0, t: 0 };
      this.body = new Body({ x, y, r: RADIUS[kind], owner: this, layer: Layer.ENEMY });
      this.become(kind);
    }
    get size() { return 1 + this.followers.length; }
    // バトル画面に渡す群れ全体
    members() { return [{ kind: this.kind, hp: this.hp }, ...this.followers.map((f) => ({ ...f }))]; }
    // バトルで残った群れに入れ替える（先頭が倒されていたら次が先頭になる）
    setMembers(list) {
      const [lead, ...rest] = list;
      this.become(lead.kind);
      this.hp = lead.hp;
      this.followers = rest;
    }
    // 先頭のモンスターの種類に合わせて、体の大きさと飛ぶかどうかを変える
    become(kind) {
      const b = this.body;
      this.kind = kind;
      b.r = b.hw = b.hh = RADIUS[kind];
      b.gravityScale = kind === 'bat' ? 0 : 1;
      b.z = kind === 'bat' ? 14 : 0;
      b.vz = 0;
    }
    damageTo(party) { return party.damageFrom(this.kind); }
    update(dt) {
      const b = this.body, s = this.scene, hero = s.hero.body;
      this.t += dt;
      this.flash -= dt;
      this.kb -= dt;
      this.hop -= dt;
      if (this.kind === 'bat') b.z = 14 + Math.sin(this.t * 4) * 4;
      if (this.kb > 0) return;

      const dx = hero.x - b.x, dy = hero.y - b.y, d = Math.hypot(dx, dy) || 1;
      const speed = SPEED[this.kind];
      // 透明なとき（RPG スタイル）は追いかけず、うろうろするだけ
      if (d < 170 && !s.hero.dead && !s.style.hidden) {
        b.vx = (dx / d) * speed;
        b.vy = (dy / d) * speed;
      } else {
        this.wander.t -= dt;
        if (this.wander.t <= 0) {
          const a = rand(0, Math.PI * 2);
          this.wander = { x: Math.cos(a) * speed * 0.5, y: Math.sin(a) * speed * 0.5, t: rand(1, 2.5) };
        }
        b.vx = this.wander.x;
        b.vy = this.wander.y;
      }
      if (this.kind === 'slime' && b.zGrounded && this.hop <= 0) {
        b.vz = 90;
        this.hop = 0.7;
      }

      // 弾を撃つかどうかはスタイルが決める（STG は弾が多い）
      const interval = s.style.fireInterval(this.kind);
      if (interval && d < 230 && !s.hero.dead) {
        this.fire -= dt;
        if (this.fire <= 0) {
          this.fire = interval * rand(0.8, 1.2);
          const base = Math.atan2(dy, dx);
          const count = this.kind === 'dragon' ? 5 : 1;
          for (let i = 0; i < count; i++) {
            s.add(new EnemyShot(s, this.kind, b.x, b.y, base + (i - (count - 1) / 2) * 0.25, this.kind === 'goblin' ? 120 : 100));
          }
        }
      }
    }
    damage(n, fx, fy) {
      const s = this.scene, b = this.body;
      this.hp -= n;
      this.flash = 0.1;
      s.popup(b.x, b.y, String(n), '#fff', 30 + b.z);
      if (this.kind !== 'dragon') {
        this.kb = 0.25;
        b.vx = fx * 180;
        b.vy = fy * 180;
      }
      if (this.hp > 0) return;
      s.reward(this.kind, b.x, b.y, 44 + b.z);
      s.particles.burst(b.x, b.y, { count: this.kind === 'dragon' ? 50 : 14, speed: 90, color: '#e9e6ff', z: 8 + b.z });
      // 群れの残りがいれば、次の1体が前に出てくる
      const next = this.followers.shift();
      if (!next) { s.kill(this); return; }
      this.become(next.kind);
      this.hp = next.hp;
      this.kb = 0.4;
    }
    draw(ctx) {
      const s = this.scene, b = this.body;
      if (s.style.hidden) return;
      shadow(ctx, s.project(b.x, b.y, 0), b.r);
      const p = s.project(b.x, b.y, b.z);
      const hero = s.hero.body;
      const facing = Math.sign((hero.x - b.x) - (hero.y - b.y)) || 1;
      G.sprites.monster(ctx, this.kind, p.x, p.y, {
        t: this.t, flash: this.flash > 0, facing, scale: this.kind === 'dragon' ? 0.8 : 1, skin: s.world.skins.get(this.kind),
      });
      // 群れの数
      if (this.size > 1) G.draw.text(ctx, `×${this.size}`, p.x, p.y - (this.kind === 'dragon' ? 44 : 30), { size: 11, align: 'center', color: '#ffef7a' });
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

  // 出てくるモンスターの種類。ゴブリンはレベル2から、ドラゴンはレベル3からまれに出る
  function monsterPool(level) {
    return level >= 2 ? ['slime', 'slime', 'bat', 'goblin'] : ['slime', 'slime', 'bat'];
  }

  const MAX_GROUP = 30;
  // 群れの数。小さい群れほど出やすく、上限はレベルとともに増えて最大30体（レベル5から）
  function groupSize(level) {
    const max = Math.min(MAX_GROUP, 5 + level * 5);
    return 1 + Math.floor(Math.random() ** 2 * max);
  }
  // 群れの仲間。7割は先頭と同じ種類
  function followersFor(kind, level) {
    if (kind === 'dragon') return [];
    return Array.from({ length: groupSize(level) - 1 }, () => ({ kind: Math.random() < 0.7 ? kind : pick(monsterPool(level)) }));
  }

  class FieldScene extends Scene {
    constructor(game, styleId = 'rpg') {
      const rows = MAP.map((r) => r.replace(/[PNIC]/g, '.'));
      const map = new TileMap(rows, T, { solid: ['#', 'T', '~'] });
      super(game, { gravity: 0, zGravity: 800, map, cellSize: 64 });
      // 画像の見た目は imageFit プラグインで管理する。登録はゲーム全体で共有し、やり直しても残す
      this.world.use(G.plugins.imageFit, { skins: game.skins ??= new Map() });
      this.style = G.styles[styleId];
      this.shake = 0;
      this.camX = 0;
      this.camY = 0;
      this.dialog = null;
      this.battle = null;
      this.chests = [];
      this.symbol = null; // バトル中の相手のシンボル
      this.encounterWait = 0; // 逃げた直後にすぐ同じ相手とバトルにならないための待ち時間
      this.spawnT = 0.5;
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
      this.snapCamera();
    }

    get found() { return this.chests.filter((c) => c.opened).length; }
    get monsters() { return this.entities.filter((e) => e instanceof FieldMonster); }

    project(x, y, z = 0) {
      return { x: (x - y) * IX - this.camX, y: (x + y) * IY - z - this.camY };
    }

    snapCamera(rate = 1) {
      const b = this.hero.body;
      const tx = (b.x - b.y) * IX - W / 2, ty = (b.x + b.y) * IY - H / 2 + 10;
      this.camX += (tx - this.camX) * rate;
      this.camY += (ty - this.camY) * rate;
    }

    // 戦い方を切り替える。フィールドと主人公の位置はそのまま。バトル中と会話中は切り替えない
    setStyle(id) {
      if (this.battle || this.dialog || !G.styles[id]) return false;
      if (this.style.id === id) return true;
      this.style = G.styles[id];
      const b = this.hero.body;
      this.hero.attackT = -1;
      this.hero.sword.enabled = false;
      // 飛んでいる弾だけ消す。モンスターは位置も HP もそのまま残る
      for (const e of this.entities) {
        if (e instanceof Bolt || e instanceof EnemyShot) this.kill(e);
      }
      this.popup(b.x, b.y, `${this.style.label} スタイル`, '#ffef7a', 40);
      this.particles.burst(b.x, b.y, { count: 16, speed: 70, color: '#ffef7a', life: 0.5, z: 10 });
      return true;
    }

    openDialog(lines) { this.dialog = { lines, i: 0 }; }

    // シンボルにぶつかったら、その群れ全体（残り HP もそのまま）とバトル
    encounter(monster) {
      if (this.battle || this.encounterWait > 0 || monster.dead) return;
      this.symbol = monster;
      this.startBattle(monster.members());
    }

    startBattle(foes) {
      const b = this.hero.body;
      b.vx = b.vy = 0;
      this.battle = new G.Battle(this, foes);
    }

    endBattle() {
      const { result, foes } = this.battle;
      const symbol = this.symbol;
      this.battle = null;
      this.symbol = null;
      if (result === 'lose') { this.gameOver(); return; }
      if (!symbol) return;
      // 勝ったらシンボルは消える（経験値はバトル画面で受け取り済み）
      if (result === 'win') { this.kill(symbol); return; }
      // 逃げたら、倒した分の経験値をもらい、生き残った群れが残り HP のままフィールドに残る
      const b = this.hero.body;
      for (const f of foes) if (f.hp <= 0) this.reward(f.kind, b.x, b.y, 40);
      const alive = foes.filter((f) => f.hp > 0).map(({ kind, hp }) => ({ kind, hp }));
      if (alive.length) symbol.setMembers(alive);
      else this.kill(symbol);
      this.encounterWait = 2;
    }

    gameOver() {
      this.state = 'over';
      const b = this.hero.body;
      this.particles.burst(b.x, b.y, { count: 30, speed: 140, color: '#ffb347', life: 0.8, z: 10 });
    }

    // 主人公から離れた、歩ける場所にシンボルを出す
    spawnMonster() {
      const map = this.world.map, hero = this.hero.body;
      for (let i = 0; i < 20; i++) {
        const tx = 1 + Math.floor(Math.random() * (map.cols - 2));
        const ty = 1 + Math.floor(Math.random() * (map.rows - 2));
        if (map.get(tx, ty) !== '.' || MAP[ty][tx] !== '.') continue;
        const x = tx * T + T / 2, y = ty * T + T / 2;
        const d = Math.hypot(x - hero.x, y - hero.y);
        if (d < 180 || d > 420) continue;
        const level = this.party.level;
        const kind = level >= 3 && Math.random() < 0.05 && !this.monsters.some((m) => m.kind === 'dragon')
          ? 'dragon' : pick(monsterPool(level));
        this.add(new FieldMonster(this, kind, x, y, followersFor(kind, level)));
        return;
      }
    }

    update(dt) {
      this.shake = Math.max(0, this.shake - dt);
      if (this.battle) {
        this.battle.update(dt);
        if (this.battle.mode === 'done') this.endBattle();
        return;
      }
      if (this.state === 'over') {
        this.time += dt;
        this.updateEffects(dt);
        if (this.input.pressed('a')) this.respawn();
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

      this.encounterWait -= dt;
      this.spawnT -= dt;
      if (this.spawnT <= 0) {
        this.spawnT = 1.5;
        if (this.monsters.length < 4 + Math.min(4, this.party.level)) this.spawnMonster();
      }
      this.stepWorld(dt);
      this.snapCamera(Math.min(1, dt * 8));
    }

    // 復活して最初の場所へ戻る。まわりのモンスターと弾は消す
    respawn() {
      this.party.revive();
      for (const e of this.entities) {
        if (e instanceof FieldMonster || e instanceof Bolt || e instanceof EnemyShot) this.kill(e);
      }
      const b = this.hero.body;
      Object.assign(b, { x: this.start.x, y: this.start.y, vx: 0, vy: 0, z: 0, vz: 0 });
      this.hero.inv = 1.5;
      this.encounterWait = 1.5;
      this.snapCamera();
      this.state = 'play';
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
      G.draw.popups(ctx, this.popups, (x, y, z) => this.project(x, y, z));
      ctx.restore();

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
      } else {
        // 今のスタイルと、その操作
        const color = { rpg: '#7bd389', act: '#f2a541', stg: '#5ad1e8' }[this.style.id];
        ctx.fillStyle = 'rgba(14,12,40,0.6)';
        ctx.fillRect(4, H - 22, W - 8, 18);
        D.text(ctx, this.style.label, 10, H - 20, { size: 12, color });
        D.text(ctx, this.style.hint, 44, H - 20, { size: 11, color: '#d6d2f5' });
      }
      if (this.state === 'over') D.banner(ctx, 'GAME OVER', 'Z で さいしょの ばしょから（ゴールドが半分になります）', '#ff5d73');
    }
  }

  G.FieldScene = FieldScene;
  G.field = { FieldMonster, Bolt, EnemyShot };
})(globalThis.Game = globalThis.Game || {});
