/*
 * 3つのモードで共通の見た目
 * どの関数も (x, y) を足元として描く。scale で拡大、facing = -1 で左右反転
 */
(function (G) {
  'use strict';

  function begin(ctx, x, y, o) {
    const s = o.scale ?? 1;
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    ctx.scale(s * (o.facing ?? 1), s);
    ctx.globalAlpha = o.alpha ?? 1;
  }

  // 画像の見た目（imageFit プラグインの Skin）を使うときの枠。拡大前の幅・高さと、足元から浮かせる量
  // 画像はこの枠に縦横比を保って収まるよう縮小される
  const BOX = { hero: [14, 22, 0], slime: [20, 14, 0], bat: [28, 20, 4], goblin: [18, 22, 0], dragon: [56, 50, 0] };

  // o.skin があれば画像で描いて true を返す
  function skinned(ctx, key, x, y, o) {
    if (!o.skin) return false;
    const [w, h, lift] = BOX[key];
    begin(ctx, x, y, o);
    o.skin.draw(ctx, w, h, { lift, flash: o.flash });
    ctx.restore();
    return true;
  }

  function hero(ctx, x, y, o = {}) {
    if (skinned(ctx, 'hero', x, y, o)) return;
    const step = o.step ?? 0;
    begin(ctx, x, y, o);
    ctx.fillStyle = '#5a3d2b';
    ctx.fillRect(-4, -3, 3, 3 - step);
    ctx.fillRect(1, -3, 3, 2 + step);
    ctx.fillStyle = '#b8323a';
    ctx.fillRect(-7, -12, 3, 9);
    ctx.fillStyle = '#3b6fd8';
    ctx.fillRect(-5, -12, 10, 9);
    ctx.fillStyle = '#5a3d2b';
    ctx.fillRect(-5, -6, 10, 1);
    ctx.fillStyle = '#ffd6a5';
    ctx.fillRect(-4, -18, 8, 6);
    ctx.fillStyle = '#e0b040';
    ctx.fillRect(-5, -20, 10, 3);
    ctx.fillRect(-5, -17, 2, 3);
    ctx.fillStyle = '#222';
    ctx.fillRect(1, -16, 2, 2);
    ctx.restore();
  }

  function monster(ctx, kind, x, y, o = {}) {
    if (skinned(ctx, kind, x, y, o)) return;
    const t = o.t ?? 0;
    const col = (c) => (o.flash ? '#fff' : c);
    begin(ctx, x, y, o);
    if (kind === 'slime') {
      const sq = 1 + Math.sin(t * 8) * 0.08;
      ctx.fillStyle = col('#9be56b');
      ctx.beginPath();
      ctx.ellipse(0, -6 * sq, 9 / sq, 7 * sq, 0, Math.PI, 0);
      ctx.lineTo(9 / sq, 0);
      ctx.lineTo(-9 / sq, 0);
      ctx.fill();
      ctx.fillStyle = col('#c8f5a8');
      ctx.fillRect(-5, -10 * sq, 3, 2);
      ctx.fillStyle = '#1b3a12';
      ctx.fillRect(-4, -7, 2, 3);
      ctx.fillRect(2, -7, 2, 3);
    } else if (kind === 'bat') {
      const flap = Math.sin(t * 18) * 5;
      ctx.fillStyle = col('#7d5bd6');
      ctx.beginPath();
      ctx.moveTo(-3, -10);
      ctx.lineTo(-13, -14 - flap);
      ctx.lineTo(-10, -7);
      ctx.lineTo(-6, -8);
      ctx.moveTo(3, -10);
      ctx.lineTo(13, -14 - flap);
      ctx.lineTo(10, -7);
      ctx.lineTo(6, -8);
      ctx.fill();
      ctx.fillStyle = col('#b48cff');
      ctx.beginPath();
      ctx.arc(0, -10, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(-4, -16, 2, 3);
      ctx.fillRect(2, -16, 2, 3);
      ctx.fillStyle = '#ff5d73';
      ctx.fillRect(-3, -11, 2, 2);
      ctx.fillRect(1, -11, 2, 2);
    } else if (kind === 'goblin') {
      const step = Math.floor(t * 6) % 2;
      ctx.fillStyle = col('#3f6b2a');
      ctx.fillRect(-4, -4, 3, 4 - step);
      ctx.fillRect(1, -4, 3, 3 + step);
      ctx.fillStyle = col('#8a5a2b');
      ctx.fillRect(-5, -13, 10, 9);
      ctx.fillStyle = col('#6fbf4a');
      ctx.fillRect(-5, -21, 10, 8);
      ctx.beginPath();
      ctx.moveTo(-5, -19);
      ctx.lineTo(-9, -21);
      ctx.lineTo(-5, -16);
      ctx.moveTo(5, -19);
      ctx.lineTo(9, -21);
      ctx.lineTo(5, -16);
      ctx.fill();
      ctx.fillStyle = '#ffef7a';
      ctx.fillRect(1, -18, 2, 2);
      ctx.fillStyle = col('#a67c52');
      ctx.fillRect(5, -16, 3, 10);
      ctx.fillRect(4, -19, 5, 4);
    } else if (kind === 'dragon') {
      const flap = Math.sin(t * 5) * 4;
      ctx.fillStyle = col('#a8323e');
      ctx.beginPath();
      ctx.moveTo(-6, -26);
      ctx.lineTo(-26, -44 - flap);
      ctx.lineTo(-20, -22);
      ctx.moveTo(6, -26);
      ctx.lineTo(18, -46 - flap);
      ctx.lineTo(16, -22);
      ctx.fill();
      ctx.fillStyle = col('#d9414f');
      ctx.beginPath();
      ctx.ellipse(0, -16, 16, 13, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(-12, -6, 6, 6);
      ctx.fillRect(6, -6, 6, 6);
      ctx.beginPath();
      ctx.moveTo(-14, -14);
      ctx.lineTo(-28, -8);
      ctx.lineTo(-14, -8);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(12, -32, 10, 8, -0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = col('#f2c36b');
      ctx.beginPath();
      ctx.ellipse(2, -14, 8, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffef7a';
      ctx.fillRect(14, -35, 3, 3);
      ctx.fillStyle = col('#e9e6ff');
      ctx.fillRect(7, -41, 2, 5);
      ctx.fillRect(13, -42, 2, 5);
    }
    ctx.restore();
  }

  function fireball(ctx, x, y, t, r = 6) {
    ctx.fillStyle = 'rgba(255,120,40,0.45)';
    ctx.beginPath();
    ctx.arc(x, y, r * (1.5 + Math.sin(t * 30) * 0.15), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffb347';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff6a8';
    ctx.beginPath();
    ctx.arc(x, y, r * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }

  function missile(ctx, x, y) {
    ctx.fillStyle = 'rgba(120,220,255,0.4)';
    ctx.fillRect(x - 9, y - 2, 12, 4);
    ctx.fillStyle = '#bff3ff';
    ctx.beginPath();
    ctx.arc(x + 2, y, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  function rock(ctx, x, y) {
    ctx.fillStyle = '#9a8f86';
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c9bfb6';
    ctx.fillRect(x - 2, y - 2, 2, 2);
  }

  G.sprites = { BOX, hero, monster, fireball, missile, rock };
})(globalThis.Game = globalThis.Game || {});
