/*
 * RPG のバトル画面（コマンド選択式のターン制）
 * ダメージ計算と経験値は STG・ACT と同じ Party の関数を使う
 *
 * 進め方：メッセージを順番に表示するキュー（say）に「表示と同時に起きること」を積み、
 * キューが空になったら次の段階（敵のターン、コマンド選択など）に進む
 */
(function (G) {
  'use strict';

  const { W, H } = G;
  const { rand } = G.util;
  const { MONSTERS, SPELLS } = G.data;

  const COMMANDS = ['たたかう', 'まほう', 'にげる'];
  const SPELL_LIST = [SPELLS.fire, SPELLS.flare, SPELLS.heal];
  const MAX_ROW = 10; // 1列に並べる最大数。30体なら 10体×3列
  const FRONT = 3; // 1ターンに攻撃してくるのは前列の先頭から3体まで
  const HEIGHT = { slime: 14, bat: 24, goblin: 22, dragon: 48 }; // 見た目の高さ（拡大前）

  // 同じモンスターが複数いたときの呼び名：A〜Z、そのあとは AA、AB…
  function label(i) {
    let s = '';
    for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
    return s;
  }

  class Battle {
    // foes：モンスターの種類の配列。{ kind, hp } を渡すと、フィールドで削った残りの HP から始まる
    constructor(scene, foes) {
      this.scene = scene;
      this.party = scene.party;
      this.input = scene.input;
      this.t = 0;
      this.shake = 0;
      this.queue = [];
      this.current = null;
      this.text = '';
      this.after = null;
      this.mode = 'busy';
      this.cursor = 0;
      this.spellCursor = 0;
      this.targetCursor = 0;
      this.pending = null;
      this.result = null;
      this.particles = new G.Particles();
      this.popups = [];
      this.projectile = null;
      this.hero = { x: 392, y: 212, lunge: 0, flash: 0, glow: 0 };

      // 同じモンスターが複数いたら A・B・C… を付けて呼び分ける
      const specs = foes.map((f) => (typeof f === 'string' ? { kind: f } : f));
      const total = {}, seen = {};
      for (const { kind } of specs) total[kind] = (total[kind] ?? 0) + 1;
      this.foes = specs.map(({ kind, hp }) => {
        let name = MONSTERS[kind].name;
        if (total[kind] > 1) name += label((seen[kind] = (seen[kind] ?? -1) + 1));
        return {
          kind, name, hp: hp ?? MONSTERS[kind].hp,
          x: 0, y: 0, scale: 3, flash: 0, alpha: 1, dying: false, lunge: 0, t: rand(0, 3),
        };
      });
      this.layout();

      const n = this.foes.length;
      const kinds = Object.keys(total);
      const name = MONSTERS[kinds[0]].name;
      this.say(n === 1 ? `${name}が あらわれた！`
        : kinds.length === 1 ? `${name}が ${n}ひき あらわれた！`
          : `まものの むれが ${n}ひき あらわれた！`, null, 1.2);
      this.run(() => this.toCommand());
    }

    // 数に合わせて並べる。少なければ大きく1列、多ければ小さく最大 10体×3列。先頭が手前の列
    layout() {
      const n = this.foes.length;
      const cols = n <= 3 ? n : n <= 8 ? Math.ceil(n / 2) : Math.min(MAX_ROW, Math.ceil(n / 3));
      const scale = n <= 3 ? 3 : n <= 8 ? 2 : 1.2;
      const gap = n <= 3 ? 92 : 300 / cols;
      const rowGap = n <= 8 ? 36 : 30;
      this.foes.forEach((f, i) => {
        const r = Math.floor(i / cols), c = i % cols;
        const inRow = Math.min(cols, n - r * cols);
        f.x = 170 + (c - (inRow - 1) / 2) * gap + (r % 2 ? gap / 4 : 0);
        f.y = 222 - r * rowGap;
        f.scale = f.kind === 'dragon' ? scale * (2 / 3) : scale;
      });
    }

    top(f) { return f.y - HEIGHT[f.kind] * f.scale; }
    // フィールドの物理ワールドに imageFit プラグインで登録された画像の見た目
    skin(key) { return this.scene.world?.skins?.get(key); }

    get alive() { return this.foes.filter((f) => f.hp > 0); }

    say(text, fn = null, dur = 0.9) { this.queue.push({ text, fn, dur }); }
    run(after) { this.mode = 'busy'; this.after = after; }
    toCommand() { this.mode = 'command'; this.text = ''; }
    finish(result) { this.mode = 'done'; this.result = result; }
    popup(x, y, str, color = '#fff') { this.popups.push({ x, y, z: 0, str, color, life: 0.8 }); }

    update(dt) {
      this.t += dt;
      this.shake = Math.max(0, this.shake - dt);
      this.particles.update(dt);
      for (const p of this.popups) { p.life -= dt; p.z += dt * 30; }
      this.popups = this.popups.filter((p) => p.life > 0);
      for (const f of this.foes) {
        f.t += dt;
        f.flash -= dt;
        f.lunge = Math.max(0, f.lunge - dt);
        if (f.dying) f.alpha = Math.max(0, f.alpha - dt * 2);
      }
      const h = this.hero;
      h.lunge = Math.max(0, h.lunge - dt);
      h.flash -= dt;
      h.glow = Math.max(0, h.glow - dt);
      if (this.projectile) {
        this.projectile.t += dt / 0.35;
        if (this.projectile.t >= 1) this.projectile = null;
      }
      if (this.t < 0.6) return; // 画面切り替えの演出中

      const input = this.input;
      if (this.mode === 'busy') {
        if (!this.current) {
          if (!this.queue.length) {
            const next = this.after;
            this.after = null;
            next?.();
            return;
          }
          this.current = this.queue.shift();
          this.current.t = 0;
          this.text = this.current.text;
          this.current.fn?.();
        }
        this.current.t += dt;
        if (this.current.t >= this.current.dur || (input.pressed('a') && this.current.t > 0.2)) this.current = null;
        return;
      }

      const move = (input.pressed('down') || input.pressed('right') ? 1 : 0) - (input.pressed('up') || input.pressed('left') ? 1 : 0);
      if (this.mode === 'command') {
        this.cursor = (this.cursor + move + COMMANDS.length) % COMMANDS.length;
        if (!input.pressed('a')) return;
        if (this.cursor === 0) this.chooseTarget({ type: 'attack' });
        else if (this.cursor === 1) { this.mode = 'spell'; this.text = ''; }
        else this.escape();
      } else if (this.mode === 'spell') {
        this.spellCursor = (this.spellCursor + move + SPELL_LIST.length) % SPELL_LIST.length;
        if (input.pressed('b')) { this.mode = 'command'; return; }
        if (!input.pressed('a')) return;
        const spell = SPELL_LIST[this.spellCursor];
        if (!this.party.canCast(spell)) { this.text = 'MPが たりない！'; return; }
        if (spell === SPELLS.heal) this.castHeal();
        else if (spell.all) this.castAll(spell);
        else this.chooseTarget({ type: 'fire' });
      } else if (this.mode === 'target') {
        const alive = this.alive;
        this.targetCursor = (this.targetCursor + move + alive.length) % alive.length;
        if (input.pressed('b')) { this.mode = this.pending.type === 'fire' ? 'spell' : 'command'; return; }
        if (input.pressed('a')) this.act(alive[this.targetCursor]);
      }
    }

    chooseTarget(action) {
      this.pending = action;
      if (this.alive.length === 1) { this.act(this.alive[0]); return; }
      this.targetCursor = Math.min(this.targetCursor, this.alive.length - 1);
      this.mode = 'target';
      this.text = '';
    }

    act(foe) {
      const p = this.party, h = this.hero;
      if (this.pending.type === 'attack') {
        this.say(`${p.name}の こうげき！`, () => { h.lunge = 0.35; }, 0.6);
        this.hitFoe(foe, p.physicalDamage(foe.kind), '#fff6a8');
      } else {
        this.say(`${p.name}は ファイアを となえた！`, () => {
          p.cast(SPELLS.fire);
          h.glow = 0.5;
          this.projectile = { x0: h.x - 30, y0: h.y - 36, x1: foe.x, y1: (foe.y + this.top(foe)) / 2, t: 0 };
        }, 0.7);
        this.hitFoe(foe, p.spellDamage(foe.kind), '#ffb347');
      }
      this.run(() => this.afterPlayer());
    }

    hitFoe(foe, dmg, color) {
      this.say(`${foe.name}に ${dmg} の ダメージ！`, () => {
        foe.hp = Math.max(0, foe.hp - dmg);
        foe.flash = 0.3;
        this.popup(foe.x, this.top(foe), String(dmg));
        this.particles.burst(foe.x, (foe.y + this.top(foe)) / 2, { count: 14, speed: 140, color, life: 0.4 });
      }, 0.8);
      if (foe.hp - dmg <= 0) this.say(`${foe.name}を たおした！`, () => { foe.dying = true; }, 0.8);
    }

    // 敵全体への魔法。何十体いてもメッセージは数行にまとめる
    castAll(spell) {
      const p = this.party;
      const hits = this.alive.map((f) => ({ f, dmg: p.spellDamage(f.kind, spell) }));
      const dmgs = hits.map((h) => h.dmg);
      const lo = Math.min(...dmgs), hi = Math.max(...dmgs);
      const killed = hits.filter(({ f, dmg }) => f.hp - dmg <= 0);
      this.say(`${p.name}は ${spell.name}を となえた！`, () => {
        p.cast(spell);
        this.hero.glow = 0.6;
        this.shake = 0.3;
      }, 0.7);
      this.say(`まものたちに ${lo === hi ? lo : `${lo}〜${hi}`} の ダメージ！`, () => {
        for (const { f, dmg } of hits) {
          f.hp = Math.max(0, f.hp - dmg);
          f.flash = 0.3;
          this.popup(f.x, this.top(f), String(dmg));
          this.particles.burst(f.x, (f.y + this.top(f)) / 2, { count: 6, speed: 110, color: '#ff9a4a', life: 0.4 });
        }
      }, 0.9);
      if (killed.length) {
        const text = killed.length === 1 ? `${killed[0].f.name}を たおした！` : `${killed.length}ひきを たおした！`;
        this.say(text, () => { for (const { f } of killed) f.dying = true; }, 0.8);
      }
      this.run(() => this.afterPlayer());
    }

    castHeal() {
      const p = this.party;
      const amount = Math.min(SPELLS.heal.power + p.level * 2, p.maxHp - p.hp);
      this.say(`${p.name}は ヒールを となえた！`, () => { p.cast(SPELLS.heal); this.hero.glow = 0.8; }, 0.7);
      this.say(`HPが ${amount} かいふくした！`, () => {
        p.heal(amount);
        this.popup(this.hero.x, this.hero.y - 60, String(amount), '#7bd389');
        this.particles.burst(this.hero.x, this.hero.y - 30, { count: 16, speed: 60, color: '#7bd389', life: 0.6 });
      }, 0.8);
      this.run(() => this.enemyTurn());
    }

    escape() {
      const chance = this.foes.some((f) => f.kind === 'dragon') ? 0.25 : 0.7;
      this.say(`${this.party.name}は にげだした！`, null, 0.6);
      if (Math.random() < chance) {
        this.say('うまく にげきれた！', null, 0.8);
        this.run(() => this.finish('escape'));
      } else {
        this.say('しかし まわりこまれてしまった！', null, 0.8);
        this.run(() => this.enemyTurn());
      }
    }

    afterPlayer() {
      if (this.alive.length) this.enemyTurn();
      else this.victory();
    }

    enemyTurn() {
      const p = this.party, h = this.hero;
      let hp = p.hp;
      // 群れ全員が攻撃すると一瞬で倒されるので、攻撃してくるのは前列の先頭の数体だけ
      for (const foe of this.alive.slice(0, FRONT)) {
        const dmg = p.damageFrom(foe.kind);
        this.say(`${foe.name}の こうげき！`, () => { foe.lunge = 0.35; }, 0.6);
        this.say(`${p.name}は ${dmg} の ダメージを うけた！`, () => {
          p.hp = Math.max(0, p.hp - dmg);
          h.flash = 0.4;
          this.shake = 0.3;
          this.popup(h.x, h.y - 60, String(dmg), '#ff8fa0');
        }, 0.8);
        hp -= dmg;
        if (hp <= 0) {
          this.say(`${p.name}は たおれてしまった…`, null, 1.4);
          this.run(() => this.finish('lose'));
          return;
        }
      }
      this.run(() => this.toCommand());
    }

    victory() {
      const p = this.party;
      const exp = this.foes.reduce((n, f) => n + MONSTERS[f.kind].exp, 0);
      const gold = this.foes.reduce((n, f) => n + MONSTERS[f.kind].gold, 0);
      let level = p.level;
      while (p.exp + exp >= 10 * level * level) level++;
      this.say('まものたちを やっつけた！', null, 0.9);
      this.say(`けいけんち ${exp} ポイントを かくとく！`, () => p.gainExp(exp), 0.9);
      if (level > p.level) this.say(`レベルが ${level} に あがった！\nHP と MP が ぜんかいふくした！`, () => { this.hero.glow = 1; }, 1.4);
      this.say(`${gold} ゴールドを てにいれた！`, () => { p.gold += gold; }, 0.9);
      this.run(() => this.finish('win'));
    }

    draw(ctx) {
      const D = G.draw, p = this.party, h = this.hero;
      ctx.save();
      ctx.fillStyle = '#0e0c28';
      ctx.fillRect(0, 0, W, H);
      if (this.shake > 0) ctx.translate(rand(-3, 3), rand(-3, 3));
      const sky = ctx.createLinearGradient(0, 0, 0, 170);
      sky.addColorStop(0, '#1b1f4a');
      sky.addColorStop(1, '#4b3a7a');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, 170);
      const ground = ctx.createLinearGradient(0, 150, 0, 240);
      ground.addColorStop(0, '#3e6b45');
      ground.addColorStop(1, '#58a454');
      ctx.fillStyle = ground;
      ctx.fillRect(0, 150, W, 90);

      // 奥の列から描くと、手前の列が上に重なる
      for (const f of [...this.foes].reverse()) {
        if (f.alpha <= 0) continue;
        const scale = f.scale;
        const dx = Math.sin((f.lunge / 0.35) * Math.PI) * 16;
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath();
        ctx.ellipse(f.x, f.y, 9 * scale, 2.4 * scale, 0, 0, Math.PI * 2);
        ctx.fill();
        const fy = f.kind === 'bat' ? f.y - (4 - Math.sin(f.t * 3) * 1.3) * scale : f.y;
        G.sprites.monster(ctx, f.kind, f.x + dx, fy, {
          t: f.t, flash: f.flash > 0 && Math.floor(f.flash * 20) % 2 === 0, scale, alpha: f.alpha, skin: this.skin(f.kind),
        });
      }

      const hx = h.x - Math.sin((h.lunge / 0.35) * Math.PI) * 24;
      if (h.glow > 0) {
        ctx.fillStyle = `rgba(255,239,122,${h.glow * 0.4})`;
        ctx.beginPath();
        ctx.ellipse(hx, h.y - 30, 28, 40, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.ellipse(hx, h.y, 20, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      if (!(h.flash > 0 && Math.floor(h.flash * 20) % 2)) G.sprites.hero(ctx, hx, h.y, { scale: 3, facing: -1, skin: this.skin('hero') });

      if (this.projectile) {
        const q = this.projectile;
        G.sprites.fireball(ctx, q.x0 + (q.x1 - q.x0) * q.t, q.y0 + (q.y1 - q.y0) * q.t, this.t, 9);
      }
      this.particles.draw(ctx, (x, y) => ({ x, y }));
      D.popups(ctx, this.popups, (x, y, z) => ({ x, y: y - z }));
      ctx.restore();

      if (this.mode === 'target') {
        const f = this.alive[this.targetCursor];
        if (f) D.text(ctx, '▼', f.x, this.top(f) - 18 + Math.sin(this.t * 8) * 2, { size: 14, align: 'center', color: '#ffef7a' });
      }

      // 下の枠：メッセージ、またはコマンドとステータス
      const box = (x, y, w, hgt) => {
        ctx.fillStyle = 'rgba(14,12,40,0.94)';
        ctx.fillRect(x, y, w, hgt);
        ctx.strokeStyle = '#e9e6ff';
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 1, y + 1, w - 2, hgt - 2);
      };
      const top = 246, bh = H - top - 6;
      if (this.mode === 'busy' || this.mode === 'done') {
        box(6, top, W - 12, bh);
        this.text.split('\n').forEach((l, i) => D.text(ctx, l, 20, top + 12 + i * 20, { size: 14, shadow: false }));
      } else {
        box(6, top, 128, bh);
        const list = this.mode === 'spell'
          ? SPELL_LIST.map((s) => `${s.name}  ${s.mp}`)
          : COMMANDS;
        const cur = this.mode === 'spell' ? this.spellCursor : this.cursor;
        list.forEach((l, i) => {
          const usable = this.mode !== 'spell' || p.canCast(SPELL_LIST[i]);
          D.text(ctx, l, 32, top + 10 + i * 20, { size: 14, shadow: false, color: usable ? '#fff' : '#77729c' });
        });
        if (this.mode !== 'target') D.text(ctx, '▶', 16, top + 11 + cur * 20, { size: 12, shadow: false, color: '#ffef7a' });

        box(140, top, 186, bh);
        const target = this.alive[this.targetCursor];
        const msg = this.text || (this.mode === 'target' ? `${target?.name ?? ''}を ねらう？` : this.mode === 'spell' ? 'どの まほうを つかう？' : '');
        if (msg) D.text(ctx, msg, 152, top + 10, { size: 13, shadow: false, color: '#ffef7a' });
        // 残っている敵は種類ごとの数で表示する（30体いても枠に収まる）
        const counts = {};
        for (const f of this.alive) counts[f.kind] = (counts[f.kind] ?? 0) + 1;
        Object.entries(counts).forEach(([kind, c], i) => {
          D.text(ctx, `${MONSTERS[kind].name}${c > 1 ? ` ×${c}` : ''}`, 152, top + 28 + i * 13, { size: 11, shadow: false, color: '#c9c4f0' });
        });

        box(332, top, W - 338, bh);
        D.text(ctx, `${p.name}  Lv${p.level}`, 344, top + 10, { size: 13, shadow: false });
        D.text(ctx, `HP ${p.hp}/${p.maxHp}`, 344, top + 30, { size: 13, shadow: false, color: p.hp < p.maxHp / 4 ? '#ff8fa0' : '#fff' });
        D.text(ctx, `MP ${p.mp}/${p.maxMp}`, 344, top + 48, { size: 13, shadow: false, color: '#8fd3ff' });
      }

      // エンカウントした瞬間の点滅
      if (this.t < 0.6) {
        ctx.fillStyle = Math.floor(this.t * 12) % 2 ? '#fff' : '#000';
        ctx.globalAlpha = 1 - this.t / 0.6;
        ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = 1;
      }
    }
  }

  G.Battle = Battle;
})(globalThis.Game = globalThis.Game || {});
