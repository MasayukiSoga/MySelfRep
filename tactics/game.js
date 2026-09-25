'use strict';
// SFC 版タクティクスオウガ風の疑似立体（クォータービュー）バトル画面。
// 画像素材は使わず、地形・キャラクター・エフェクトはすべてコードでドット描画する。
(() => {
  // ---------------------------------------------------------------- 定数
  const VW = 256, VH = 224;            // SFC の画面解像度
  const TW = 32, TH = 16;              // タイル上面（ひし形）のサイズ
  const HS = 8;                        // 高さ 1 段あたりのピクセル数
  const BASE = 4;                      // 高さ 0 でも見せる地面の厚み
  const SPR_W = 16, SPR_H = 20;
  const MAGIC_COST = 8;
  // 0:+x(画面右下) 1:+y(左下) 2:-x(左上) 3:-y(右上)
  const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];

  const canvas = document.getElementById('screen');
  const ctx = canvas.getContext('2d');
  const $ = id => document.getElementById(id);
  const $game = $('game'), $wrap = $('wrap');
  const $turn = $('turnWin'), $terrain = $('terrainWin'), $unit = $('unitWin'), $info = $('infoWin');
  const $menu = $('menu'), $banner = $('banner'), $title = $('title');
  const MAPS = window.TACTICS_MAPS;

  // ---------------------------------------------------------------- ユーティリティ
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const key = (x, y) => x + ',' + y;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  function hash(x, y, s = 0) {
    let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const shade = (c, f) => c.map(v => clamp(Math.round(f >= 0 ? v + (255 - v) * f : v * (1 + f)), 0, 255));
  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  function tween(ms, fn) {
    return new Promise(res => {
      const t0 = performance.now();
      const step = now => {
        const t = Math.min(1, (now - t0) / ms);
        fn(t);
        if (t < 1) requestAnimationFrame(step); else res();
      };
      requestAnimationFrame(step);
    });
  }
  // rows: 文字列の配列, pal: 文字 -> [r,g,b(,a)]
  function pixelArt(rows, pal, w, h, mapFn) {
    const c = makeCanvas(w, h), g = c.getContext('2d');
    const img = g.createImageData(w, h), d = img.data;
    rows.forEach((row, r) => {
      for (let x = 0; x < w; x++) {
        let ch = row[x];
        if (!ch || ch === '.') continue;
        let y = r;
        if (mapFn) [ch, y] = mapFn(ch, r);
        const col = pal[ch];
        if (!col || y >= h) continue;
        const i = (y * w + x) * 4;
        d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = col[3] ?? 255;
      }
    });
    g.putImageData(img, 0, 0);
    return c;
  }
  function flip(src) {
    const c = makeCanvas(src.width, src.height), g = c.getContext('2d');
    g.translate(src.width, 0);
    g.scale(-1, 1);
    g.drawImage(src, 0, 0);
    return c;
  }

  // ---------------------------------------------------------------- 地形
  const TERRAIN = {
    grass: {
      name: '草原',
      top: ['#5c9c3c', '#4f8c34', '#6cae48', '#447a2c'],
      left: ['#8a6034', '#7a5430', '#946a3c'], right: ['#6a4626', '#5e3e22', '#744e2c'],
      fringe: ['#4a8a30', '#3a6e26'],
    },
    dirt: {
      name: '荒れ地',
      top: ['#a07848', '#946c40', '#ac8454', '#88603a'],
      left: ['#8a6034', '#7a5430', '#946a3c'], right: ['#6a4626', '#5e3e22', '#744e2c'],
    },
    stone: {
      name: '岩場',
      top: ['#9a9aa2', '#8c8c96', '#a8a8b2', '#7c7c88'],
      left: ['#76767e', '#6c6c74', '#80808a'], right: ['#56565e', '#4e4e56', '#606068'],
    },
    sand: {
      name: '砂地',
      top: ['#d8c088', '#ccb47c', '#e2cc96', '#c0a870'],
      left: ['#b08c58', '#a48050', '#b89660'], right: ['#8a6a40', '#7e603a', '#946f44'],
    },
    water: {
      name: '川',
      top: ['#3868c0', '#3060b0', '#4478cc', '#2c58a4'],
      left: ['#2c4c90', '#284888'], right: ['#203c78', '#1c3670'],
      blocked: true,
    },
    floor: {
      name: '石畳',
      top: ['#a8a49a', '#9e9a90', '#b2aea4', '#948f86'],
      left: ['#8a8680', '#807c76', '#94908a'], right: ['#66625e', '#5e5a56', '#6e6a66'],
      topFx: (c, ux, uy) => near(ux * 2) || near(uy * 2) ? shade(c, -0.22) : c,
      sideFx: (c, px, k) => brickFx(c, px, k),
    },
    brick: {
      name: '城壁',
      top: ['#9a968c', '#8e8a80', '#a6a298', '#848078'],
      left: ['#a08c74', '#94806a', '#aa967e'], right: ['#76664f', '#6c5c48', '#806e58'],
      sideFx: (c, px, k) => brickFx(c, px, k),
    },
    bridge: {
      name: '木橋',
      top: ['#9a6a3a', '#8c5e32', '#a67444', '#7e542c'],
      left: ['#6a4424', '#603c20'], right: ['#4c3018', '#442a14'],
      topFx: (c, ux) => near(ux * 4, 0.07) ? shade(c, -0.35) : c,
    },
    rubble: {
      name: '瓦礫',
      top: ['#8a8680', '#6e6a64', '#a09a90', '#7a6a58'],
      left: ['#7a7670', '#6c6862', '#84807a'], right: ['#58544e', '#4e4a44', '#625e58'],
    },
    gate: {
      name: '城門',
      top: ['#5a3a20', '#4e321c', '#62422a'],
      left: ['#7a5230', '#704a2a', '#845a36'], right: ['#5a3a22', '#52341e', '#62402a'],
      // 縦板に鉄の帯と鋲
      sideFx: (c, px, k) => {
        const band = k % 14;
        if (band === 4 || band === 5) return band === 4 && px % 6 === 2 ? [200, 200, 212] : [58, 58, 68];
        return px % 4 === 0 ? shade(c, -0.3) : c;
      },
      blocked: true,
    },
  };
  const near = (v, e = 0.05) => Math.abs(v - Math.round(v)) < e;
  // 側面の段ごとに半分ずらしたレンガ目地
  function brickFx(c, px, k) {
    const row = Math.floor(k / 4);
    return k % 4 === 0 || (px + (row % 2) * 4) % 8 === 0 ? shade(c, -0.35) : c;
  }
  // マップデータの地形文字。'.' は高さと周囲から自動で決める
  const TERRAIN_CODES = {
    g: 'grass', d: 'dirt', r: 'stone', s: 'sand', w: 'water',
    f: 'floor', W: 'brick', b: 'bridge', x: 'rubble', G: 'floor',
  };
  for (const t of Object.values(TERRAIN)) {
    for (const k of ['top', 'left', 'right', 'fringe']) if (t[k]) t[k] = t[k].map(rgb);
  }
  const pick = (arr, r) => arr[Math.min(arr.length - 1, r < 0.5 ? 0 : r < 0.72 ? 1 : r < 0.9 ? 2 : 3)];

  // ---------------------------------------------------------------- マップ
  // マップ定義は maps.js（window.TACTICS_MAPS）。loadMap で以下を差し替える
  let MAP = null, MW = 0, MH = 0;
  let tiles = [], drawOrder = [], units = [], gates = [];
  let bounds = { x0: 0, x1: 0, y0: 0, y1: 0 };
  const tileAt = (x, y) => (x < 0 || y < 0 || x >= MW || y >= MH) ? null : tiles[y * MW + x];
  // ルール上の高さ（足場）。城門のように見た目だけ高い物は topH で扱う
  const H = (x, y) => tileAt(x, y).h;
  const topH = (x, y) => { const t = tileAt(x, y); return t.drawH ?? t.h; };

  function autoTerrain(t) {
    const nearWater = DIRS.some(([dx, dy]) => tileAt(t.x + dx, t.y + dy)?.tc === 'w');
    if (t.h >= 5) return 'stone';
    if (t.h === 4) return hash(t.x, t.y, 7) < 0.5 ? 'stone' : 'dirt';
    if (nearWater && t.h === 0) return 'sand';
    return hash(t.x, t.y, 3) < 0.18 ? 'dirt' : 'grass';
  }

  function loadMap(def) {
    MAP = def;
    MH = def.height.length;
    MW = def.height[0].length;
    tiles = [];
    for (let y = 0; y < MH; y++) {
      for (let x = 0; x < MW; x++) {
        // 高さは 36 進 1 文字（0-9, a=10 … z=35）
        tiles.push({ x, y, h: parseInt(def.height[y][x], 36), tc: def.terrain?.[y]?.[x] ?? '.' });
      }
    }
    for (const t of tiles) t.type = TERRAIN_CODES[t.tc] ?? autoTerrain(t);
    // 城門は x 方向に width マス並ぶ 1 つの構造物（HP 共有）。見た目は城壁と同じ高さ top まで立ち上がり、
    // 正面（+y 側）に床から door 段ぶんのアーチ付き扉を描く
    gates = (def.gates || []).map(g => {
      const obj = {
        name: '城門', isObject: true, team: 'enemy', x: g.x, y: g.y, tiles: [],
        hp: g.hp, maxHp: g.hp, def: g.def, agi: 0, facing: null, damage: 0,
        offX: 0, offY: 0, alpha: 1, blink: false, dead: false,
      };
      const n = g.width || 1;
      for (let i = 0; i < n; i++) {
        const t = tileAt(g.x + i, g.y);
        t.type = 'gate';
        t.drawH = g.top;
        t.gate = { obj, i, n, door: (t.h + g.door) * HS };
        obj.tiles.push(t);
      }
      return obj;
    });
    for (const t of tiles) t.canvas = buildTile(t);
    drawOrder = [...tiles].sort((a, b) => (a.x + a.y) - (b.x + b.y));
    units = def.units.map(createUnit);

    // カメラの可動域（マップ外の空白を映しすぎない）
    const xs = tiles.map(t => (t.x - t.y) * 16), ys = tiles.map(t => (t.x + t.y) * 8 - topH(t.x, t.y) * HS);
    const span = (lo, hi) => lo <= hi ? [lo, hi] : [(lo + hi) / 2, (lo + hi) / 2];
    const [x0, x1] = span(Math.min(...xs) + 96, Math.max(...xs) - 96);
    const [y0, y1] = span(Math.min(...ys) + 24, Math.max(...ys) - 56);
    bounds = { x0, x1, y0, y1 };
  }

  // 1 マス分の「柱」（上面ひし形 + 左右の側面）をドット単位で描く
  function buildTile(t) {
    const T = TERRAIN[t.gate ? 'brick' : t.type];
    const depth = (t.drawH ?? t.h) * HS + BASE;
    const w = TW, h = TH + depth;
    const c = makeCanvas(w, h), g = c.getContext('2d');
    const img = g.createImageData(w, h), d = img.data;
    const put = (x, y, col) => {
      const i = (y * w + x) * 4;
      d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
    };
    const gx = t.x * 97, gy = t.y * 89;
    // 上面：左上から光が当たる想定で、上側の縁を明るく・下側の縁を暗く
    for (let py = 0; py < TH; py++) {
      for (let px = 0; px < TW; px++) {
        const dx = px < 16 ? 15 - px : px - 16, dy = py < 8 ? 7 - py : py - 8, v = dx + 2 * dy;
        if (v >= 16) continue;
        let col = pick(T.top, hash(gx + px, gy + py, 1));
        if (T.topFx) {
          // ひし形内のタイル座標 (ux, uy) ∈ [0,1]
          const ax = (px + 0.5 - 16) / 16, ay = (py + 0.5) / 8;
          col = T.topFx(col, (ax + ay) / 2, (ay - ax) / 2);
        }
        if (v >= 14) col = py < 8 ? shade(col, px < 16 ? 0.3 : 0.14) : shade(col, -0.22);
        put(px, py, col);
      }
    }
    // 側面：左面は明るめ、右面は暗め。高さ 1 段ごとに地層の線を入れる
    for (let px = 0; px < TW; px++) {
      const dx = px < 16 ? 15 - px : px - 16, bottom = 8 + ((15 - dx) >> 1);
      const pal = px < 16 ? T.left : T.right;
      const fringe = 2 + (hash(gx + px, gy, 3) < 0.5 ? 1 : 0);
      for (let k = 1; k <= depth; k++) {
        const py = bottom + k;
        if (py >= h) break;
        let col = pick(pal, hash(gx + px, gy + k, 2));
        if (t.gate) col = gatePixel(t, px, k, col);
        else if (T.fringe && k <= fringe) col = T.fringe[px < 16 ? 0 : 1];
        else if (T.sideFx) col = T.sideFx(col, px, k);
        else if (k % HS === 0) col = shade(col, -0.2);
        if (k === depth) col = shade(col, -0.45);
        if (px === 15) col = shade(col, 0.12);
        put(px, py, col);
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  // 城門の側面 1 ピクセル。u は門全体での横位置 (0..1)、z は床面からの高さ(px)
  function gatePixel(t, px, k, col) {
    const { obj, i, n, door } = t.gate;
    const z = t.drawH * HS - k, base = t.h * HS;
    if (px >= 16 || z < base) return brickFx(col, px, k);
    const u = (i + (px + 0.5) / 16) / n;
    const archTop = door - 12 * (1 - Math.sqrt(Math.max(0, 1 - (2 * u - 1) ** 2)));
    if (z > archTop + 3) {
      // アーチ上の石積みと中央の要石
      if (Math.abs(u - 0.5) * n * 16 < 3 && z < archTop + 11) return shade([200, 188, 160], (k % 4 === 0) ? -0.2 : 0);
      return brickFx(col, px, k);
    }
    if (z > archTop) return shade([160, 150, 132], (px + k) % 4 === 0 ? -0.35 : 0);
    const gp = i * 16 + px, zz = z - base;
    if (Math.abs(gp + 0.5 - n * 8) < 1) return [30, 20, 14];          // 左右の扉の合わせ目
    let c = pick(TERRAIN.gate.left, hash(gp, k, 5));
    if (zz % 12 === 4 || zz % 12 === 5) c = zz % 12 === 4 && gp % 5 === 2 ? [210, 210, 222] : [60, 60, 72];
    else if (gp % 4 === 0) c = shade(c, -0.3);
    if (hash(gp, k, 9) < obj.damage * 0.3) c = [34, 22, 14];            // 損傷による割れ
    return c;
  }

  function makeDiamond(fill, rim) {
    const c = makeCanvas(TW, TH), g = c.getContext('2d');
    const img = g.createImageData(TW, TH), d = img.data;
    for (let py = 0; py < TH; py++) {
      for (let px = 0; px < TW; px++) {
        const dx = px < 16 ? 15 - px : px - 16, dy = py < 8 ? 7 - py : py - 8, v = dx + 2 * dy;
        if (v >= 16) continue;
        const col = v >= 14 ? rim : fill;
        if (!col) continue;
        const i = (py * TW + px) * 4;
        d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = col[3];
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  }
  const OV_MOVE = makeDiamond([70, 130, 255, 120], [170, 205, 255, 220]);
  const OV_ATK = makeDiamond([255, 60, 50, 160], [255, 170, 160, 220]);
  const OV_CURSOR = makeDiamond([255, 250, 200, 50], [255, 236, 80, 255]);

  const ARROW = pixelArt(
    ['.ooooooo.', 'oyyyyyyyo', '.oyyyyyo.', '..oyyyo..', '...oyo...', '....o....'],
    { o: rgb('#3a2400'), y: rgb('#ffe040') }, 9, 6,
  );

  const BG = (() => {
    const c = makeCanvas(VW, VH), g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, VH);
    grad.addColorStop(0, '#1c2a4c');
    grad.addColorStop(1, '#04060e');
    g.fillStyle = grad;
    g.fillRect(0, 0, VW, VH);
    return c;
  })();

  // ---------------------------------------------------------------- ユニット
  const CLASSES = {
    knight: { name: 'ナイト', sprite: 'fighter', hp: 96, mp: 12, atk: 30, def: 20, agi: 8, move: 4, jump: 2, range: [1, 1], wt: 110, type: 'melee' },
    soldier: { name: 'ソルジャー', sprite: 'fighter', hp: 82, mp: 8, atk: 26, def: 15, agi: 10, move: 4, jump: 2, range: [1, 1], wt: 100, type: 'melee' },
    archer: { name: 'アーチャー', sprite: 'fighter', hp: 66, mp: 10, atk: 23, def: 10, agi: 13, move: 4, jump: 2, range: [2, 4], wt: 95, type: 'bow' },
    wizard: { name: 'ウィザード', sprite: 'caster', hp: 56, mp: 48, atk: 30, def: 8, agi: 9, move: 3, jump: 1, range: [1, 3], wt: 105, type: 'magic' },
  };

  // o:輪郭 h:髪 s:肌 k:目 a:鎧/ローブ b:その暗部 c:サーコート/帽子 w:武器 g:金 l:脚 n:杖
  const SPRITES = {
    fighter: {
      head: [4, 6], feet: 16,
      rows: [
        '................',
        '......oooo......',
        '.....ohhhho...w.',
        '....ohhhhhho..w.',
        '....ohsssshho.w.',
        '....osksskso..w.',
        '.....osssso...w.',
        '....oocccco...w.',
        '...oaacccaao..w.',
        '..oaaabaabaaosgo',
        '..osaabaabaaso..',
        '..osoaaggaao....',
        '..oo.oaaaao.....',
        '.....obbbbo.....',
        '.....oaaaao.....',
        '.....oaooao.....',
        '.....oloolo.....',
        '.....oloolo.....',
        '....oolooloo....',
        '....ooo..ooo....',
      ],
    },
    caster: {
      head: [5, 7], feet: 17,
      rows: [
        '........o.......',
        '.......oco......',
        '......occco.....',
        '.....occccco....',
        '...ooooooooooo..',
        '....ohsssshho.g.',
        '....osksskso..n.',
        '.....osssso...n.',
        '....oaaaaaao..n.',
        '...oaaabbaaaosno',
        '..osaaabbaaaso..',
        '..osoaabbaao..n.',
        '...o.oabbao...n.',
        '....oaabbaao..n.',
        '....oaabbaao..n.',
        '...oaaabbaaao.n.',
        '...oaaabbaaao...',
        '..oaaaabbaaaao..',
        '..oooooooooooo..',
        '................',
      ],
    },
  };

  const TEAM_PAL = {
    player: { fighter: { a: '#4a74d8', b: '#2c4aa8', c: '#f0e8d0' }, caster: { a: '#6a7ae8', b: '#3a48b0', c: '#2c3890' } },
    enemy: { fighter: { a: '#c84a3c', b: '#842a24', c: '#3a2c30' }, caster: { a: '#c05050', b: '#842c2c', c: '#4a1a24' } },
  };

  function paletteFor(u) {
    const p = {
      o: '#140c18', s: '#f0c898', k: '#281828', w: '#dce4ec', g: '#e8c048', l: '#3a3040', n: '#8a5a30',
      h: u.hair, ...TEAM_PAL[u.team][u.C.sprite],
    };
    if (u.cls === 'archer') { p.w = '#a8743c'; p.c = u.team === 'player' ? '#7aac5a' : '#8a7a48'; }
    if (u.cls === 'soldier') p.c = '#9aa2b0';
    if (u.leader) p.c = '#d8b040';
    return Object.fromEntries(Object.entries(p).map(([k, v]) => [k, rgb(v)]));
  }

  // 向き 4 方向 × 待機アニメ 2 フレーム。背面は顔を髪色で塗りつぶして作る
  function buildFrames(u) {
    const def = SPRITES[u.C.sprite], pal = paletteFor(u);
    const make = (back, bob) => pixelArt(def.rows, pal, SPR_W, SPR_H, (ch, r) => {
      if (back && r >= def.head[0] && r <= def.head[1] && (ch === 's' || ch === 'k')) ch = 'h';
      return [ch, bob && r < def.feet ? r + 1 : r];
    });
    const front = [make(false, false), make(false, true)];
    const back = [make(true, false), make(true, true)];
    return [front, front.map(flip), back.map(flip), back];
  }

  function createUnit(r) {
    const C = CLASSES[r.cls], bonus = (r.lv - 4) * 3;
    const u = {
      ...r, C,
      maxHp: C.hp + bonus * 2, maxMp: C.mp, atk: C.atk + bonus, def: C.def + bonus, agi: C.agi,
      rx: r.x, ry: r.y, rh: H(r.x, r.y), gh: H(r.x, r.y),
      offX: 0, offY: 0, alpha: 1, blink: false, dead: false, gone: false, moving: false, sortKey: null,
      wt: Math.round(C.wt * (0.2 + Math.random() * 0.6)), anim: Math.random() * 2,
    };
    u.hp = u.maxHp;
    u.mp = u.maxMp;
    u.frames = buildFrames(u);
    return u;
  }
  const unitAt = (x, y) => units.find(u => !u.dead && u.x === x && u.y === y);
  const gateAt = (x, y) => gates.find(g => !g.dead && g.tiles.some(t => t.x === x && t.y === y));
  const targetAt = (x, y) => unitAt(x, y) || gateAt(x, y);

  // ---------------------------------------------------------------- ルール
  function dirToward(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 0 : 2;
    return dy > 0 ? 1 : 3;
  }

  // 高さ差は ±jump まで。敵ユニットはすり抜けられない
  function computeReach(u) {
    const reach = new Map([[key(u.x, u.y), { x: u.x, y: u.y, c: 0, prev: null }]]);
    const q = [reach.get(key(u.x, u.y))];
    while (q.length) {
      const cur = q.shift();
      if (cur.c >= u.C.move) continue;
      for (const [dx, dy] of DIRS) {
        const nx = cur.x + dx, ny = cur.y + dy, t = tileAt(nx, ny), k = key(nx, ny);
        if (!t || TERRAIN[t.type].blocked || reach.has(k)) continue;
        if (Math.abs(t.h - H(cur.x, cur.y)) > u.C.jump) continue;
        const occ = unitAt(nx, ny);
        if (occ && occ.team !== u.team) continue;
        const node = { x: nx, y: ny, c: cur.c + 1, prev: key(cur.x, cur.y) };
        reach.set(k, node);
        q.push(node);
      }
    }
    return reach;
  }
  const stopTiles = (u, reach) => [...reach.values()].filter(s => { const o = unitAt(s.x, s.y); return !o || o === u; });
  function pathTo(reach, dest) {
    const path = [];
    for (let n = reach.get(key(dest.x, dest.y)); n; n = n.prev && reach.get(n.prev)) path.unshift({ x: n.x, y: n.y });
    return path;
  }

  const canAttack = u => u.C.type !== 'magic' || u.mp >= MAGIC_COST;

  // 弓は高所から撃つと射程が伸び、近接は高さ差 2 まで
  function inRange(u, from, tgt) {
    const d = Math.abs(from.x - tgt.x) + Math.abs(from.y - tgt.y);
    const dh = H(from.x, from.y) - H(tgt.x, tgt.y);
    let [mn, mx] = u.C.range;
    if (u.C.type === 'bow') mx += clamp(Math.floor(dh / 2), 0, 2);
    if (d < mn || d > mx) return false;
    return !(u.C.type === 'melee' && Math.abs(dh) > 2);
  }
  const attackTileSet = (u, from) => new Set(tiles.filter(t => inRange(u, from, t)).map(t => key(t.x, t.y)));

  // 高低差と攻撃方向（正面・側面・背面）で命中とダメージが変わる
  // pos: 攻撃するマス（複数マスの城門ではユニット位置と異なる）
  function forecast(att, tgt, from, pos = tgt) {
    const dh = H(from.x, from.y) - H(pos.x, pos.y);
    const d = dirToward(pos, from);
    // 城門などの構造物には向きがない（常に正面扱い・必中）
    const rel = tgt.facing == null || d === tgt.facing ? 'front' : d === (tgt.facing + 2) % 4 ? 'back' : 'side';
    const magic = att.C.type === 'magic';
    let dmg = magic ? att.atk * 1.3 - tgt.def * 0.4 : att.atk * 1.25 - tgt.def * 0.7;
    dmg *= 1 + clamp(dh * 0.08, -0.3, 0.5);
    if (!magic) dmg *= rel === 'back' ? 1.4 : rel === 'side' ? 1.2 : 1;
    let hit = tgt.isObject ? 99
      : magic ? 92 : 80 + (att.agi - tgt.agi) * 2 + dh * 4 + (rel === 'back' ? 15 : rel === 'side' ? 7 : 0);
    return { dmg: Math.max(1, Math.round(dmg)), hit: clamp(Math.round(hit), 5, 99), rel, magic };
  }
  const REL = { front: '', side: '側面から', back: '背後から!' };

  // ---------------------------------------------------------------- 状態
  const state = {
    phase: 'busy', turn: 0, active: null, moved: false, acted: false,
    cursor: { x: 0, y: 0 }, titleIndex: 0, reach: null, moveTiles: null, atkTiles: null,
    menuItems: [], menuIndex: 0, camUnit: null, hint: '', ox: 0, oy: 0,
  };
  const cam = { x: 0, y: 0 };
  const popups = [], effects = [];

  function setCursor(x, y) {
    state.cursor = { x: clamp(x, 0, MW - 1), y: clamp(y, 0, MH - 1) };
    updateHUD();
  }

  // ---------------------------------------------------------------- 描画
  const worldPos = (x, y, h) => [(x - y) * 16, (x + y) * 8 - h * HS];

  const FONT = {
    0: ['111', '101', '101', '101', '111'], 1: ['010', '110', '010', '010', '111'],
    2: ['111', '001', '111', '100', '111'], 3: ['111', '001', '011', '001', '111'],
    4: ['101', '101', '111', '001', '001'], 5: ['111', '100', '111', '001', '111'],
    6: ['111', '100', '111', '101', '111'], 7: ['111', '001', '010', '010', '010'],
    8: ['111', '101', '111', '101', '111'], 9: ['111', '101', '111', '001', '111'],
    M: ['10001', '11011', '10101', '10001', '10001'], I: ['111', '010', '010', '010', '111'],
    S: ['011', '100', '010', '001', '110'],
  };
  function drawPixelText(s, cx, y, color, sc = 2) {
    const glyphs = [...s].map(ch => FONT[ch]).filter(Boolean);
    const w = glyphs.reduce((a, g) => a + (g[0].length + 1) * sc, -sc);
    for (const pass of [0, 1]) {
      let x = Math.round(cx - w / 2);
      ctx.fillStyle = pass ? color : '#000';
      for (const g of glyphs) {
        g.forEach((row, r) => [...row].forEach((b, c) => {
          if (b !== '1') return;
          if (pass) ctx.fillRect(x + c * sc, y + r * sc, sc, sc);
          else ctx.fillRect(x + c * sc - 1, y + r * sc - 1, sc + 2, sc + 2);
        }));
        x += (g[0].length + 1) * sc;
      }
    }
  }

  function drawTile(t, ox, oy, now, pulse, focus) {
    const [sx, sy] = worldPos(t.x, t.y, t.drawH ?? t.h);
    let x = sx - 16 + ox;
    const y = sy + oy, bottom = y + t.canvas.height;
    if (x > VW || x + TW < 0 || y > VH || bottom < 0) return;
    // 手前にあってユニットやカーソルを大きく隠す柱（城壁など）は半透明にする
    let alpha = 1;
    for (const f of focus) {
      if (t.x + t.y > f.k && Math.abs(sx + ox - f.x) < 22 && y < f.y - 8 && bottom > f.y - 16) { alpha = 0.35; break; }
    }
    const gate = t.gate && !t.gate.obj.dead && t.gate.obj;
    if (gate) {
      x += Math.round(gate.offX);
      if (gate.blink && Math.floor(now / 50) % 2) alpha *= 0.4;
    }
    ctx.globalAlpha = alpha;
    ctx.drawImage(t.canvas, x, y);
    ctx.globalAlpha = 1;
    if (t.type === 'water') {
      const f = Math.floor(now / 280);
      ctx.fillStyle = '#b0d4ff';
      for (let i = 0; i < 3; i++) {
        const px = 6 + Math.floor(hash(t.x * 7 + i, t.y * 13, f) * 19);
        const py = 4 + Math.floor(hash(t.x, t.y * 5 + i, f + 99) * 8);
        ctx.fillRect(x + px, y + py, 2, 1);
      }
    }
    const k = key(t.x, t.y);
    const ov = state.phase === 'move' && state.moveTiles?.has(k) ? OV_MOVE
      : state.phase === 'target' && state.atkTiles?.has(k) ? OV_ATK : null;
    if (ov) {
      ctx.globalAlpha = pulse;
      ctx.drawImage(ov, x, y);
      ctx.globalAlpha = 1;
    }
    if (cursorVisible() && state.cursor.x === t.x && state.cursor.y === t.y) {
      ctx.globalAlpha = 0.65 + 0.35 * Math.sin(now / 90);
      ctx.drawImage(OV_CURSOR, x, y);
      ctx.globalAlpha = 1;
    }
  }

  function drawUnit(u, ox, oy, now) {
    const gx = Math.round((u.rx - u.ry) * 16 + ox);
    const gy = Math.round((u.rx + u.ry) * 8 + 8 + oy);
    const bodyY = gy - Math.round(u.rh * HS), groundY = gy - Math.round(u.gh * HS);
    ctx.globalAlpha = u.alpha * 0.4;
    ctx.fillStyle = '#000';
    ctx.fillRect(gx - 4, groundY - 2, 8, 1);
    ctx.fillRect(gx - 6, groundY - 1, 12, 2);
    ctx.fillRect(gx - 4, groundY + 1, 8, 1);
    ctx.globalAlpha = u.alpha;
    if (!(u.blink && Math.floor(now / 50) % 2)) {
      const fr = Math.floor(now / (u.moving ? 110 : 420) + u.anim) % 2;
      ctx.drawImage(u.frames[u.facing][fr], gx - 8 + Math.round(u.offX), bodyY - 19 + Math.round(u.offY));
    }
    ctx.globalAlpha = 1;
  }

  function toScreen(x, y, h) {
    const [sx, sy] = worldPos(x, y, h);
    return [Math.round(sx + state.ox), Math.round(sy + 8 + state.oy)];
  }

  function drawEffects(now) {
    for (let i = effects.length - 1; i >= 0; i--) {
      const e = effects[i];
      if (e.until && now > e.until) { effects.splice(i, 1); continue; }
      const p = e.until ? (now - e.t0) / (e.until - e.t0) : e.p;
      if (e.kind === 'arrow') {
        const at = q => toScreen(lerp(e.a[0], e.b[0], q), lerp(e.a[1], e.b[1], q),
          lerp(e.a[2], e.b[2], q) + Math.sin(Math.PI * q) * 2.5);
        const [x1, y1] = at(p), [x0, y0] = at(Math.max(0, p - 0.06));
        for (let s = 0; s <= 4; s++) {
          ctx.fillStyle = s === 4 ? '#ffffff' : '#c8a878';
          ctx.fillRect(Math.round(lerp(x0, x1, s / 4)), Math.round(lerp(y0, y1, s / 4)) - 10, 1, 1);
        }
      } else if (e.kind === 'fire') {
        const [cx, cy] = toScreen(...e.at);
        const cols = e.cols || ['#fff8c0', '#ffd040', '#ff8020', '#c02810'];
        if (p < 0.35) {
          ctx.fillStyle = cols[0];
          const r = Math.round(2 + p * 12);
          ctx.fillRect(cx - r, cy - 10 - r, r * 2, r * 2);
        }
        for (let j = 0; j < 18; j++) {
          const ang = j / 18 * Math.PI * 2 + p * 2;
          const r = p * 16 * (0.5 + hash(j, 0, 1) * 0.5);
          ctx.fillStyle = cols[Math.min(3, Math.floor(p * 3 + hash(j, 1, 1) * 1.5))];
          const s = p < 0.7 ? 2 : 1;
          ctx.fillRect(Math.round(cx + Math.cos(ang) * r), Math.round(cy - 10 + Math.sin(ang) * r * 0.7 - p * 8), s, s);
        }
      } else if (e.kind === 'spark') {
        const [cx, cy] = toScreen(...e.at);
        ctx.fillStyle = '#ffffff';
        for (let j = 0; j < 4; j++) {
          const ang = j * Math.PI / 2 + Math.PI / 4, r = 3 + p * 8;
          for (let s = 0; s < 3; s++) {
            ctx.fillRect(Math.round(cx + Math.cos(ang) * (r + s)), Math.round(cy - 10 + Math.sin(ang) * (r + s)), 1, 1);
          }
        }
      }
    }
  }

  function drawPopups(now) {
    for (let i = popups.length - 1; i >= 0; i--) {
      const pp = popups[i], age = now - pp.t0;
      if (age > 1100) { popups.splice(i, 1); continue; }
      const [cx, cy] = toScreen(pp.u.x, pp.u.y, pp.h);
      const rise = age < 220 ? Math.sin(age / 220 * Math.PI) * 8 + age / 220 * 6 : 6;
      drawPixelText(pp.text, cx, Math.round(cy - 30 - rise), pp.color);
    }
  }

  const cursorVisible = () => ['menu', 'look', 'move', 'target'].includes(state.phase);

  function cameraTarget() {
    const f = state.camUnit;
    return f ? worldPos(f.rx, f.ry, f.rh) : worldPos(state.cursor.x, state.cursor.y, topH(state.cursor.x, state.cursor.y));
  }

  function render(now) {
    ctx.drawImage(BG, 0, 0);
    if (!MAP) return;
    const [tx, ty] = cameraTarget();
    cam.x += (clamp(tx, bounds.x0, bounds.x1) - cam.x) * 0.14;
    cam.y += (clamp(ty, bounds.y0, bounds.y1) - cam.y) * 0.14;
    const ox = Math.round(VW / 2 - cam.x), oy = Math.round(VH / 2 - 4 - cam.y);
    state.ox = ox; state.oy = oy;

    // 透過判定の対象：ユニットの足元とカーソル位置（画面座標 + 描画順キー）
    const focus = [];
    for (const u of units) {
      if (u.gone) continue;
      focus.push({ k: (u.sortKey ?? u.x + u.y) + 0.5, x: (u.rx - u.ry) * 16 + ox, y: (u.rx + u.ry) * 8 + 8 - u.rh * HS + oy });
    }
    if (cursorVisible()) {
      const { x, y } = state.cursor, [cx, cy] = toScreen(x, y, topH(x, y));
      focus.push({ k: x + y + 0.5, x: cx, y: cy });
    }

    // 奥（x+y が小さい）から手前へ描く画家のアルゴリズム。ユニットは自分の足元のタイルの直後に描く
    const list = drawOrder.map(t => ({ k: t.x + t.y, t }));
    for (const u of units) if (!u.gone) list.push({ k: (u.sortKey ?? u.x + u.y) + 0.5, u });
    list.sort((a, b) => a.k - b.k);
    const pulse = 0.55 + 0.3 * Math.sin(now / 170);
    for (const e of list) e.t ? drawTile(e.t, ox, oy, now, pulse, focus) : drawUnit(e.u, ox, oy, now);

    drawEffects(now);
    drawPopups(now);

    if (cursorVisible()) {
      const { x, y } = state.cursor;
      const [cx, cy] = toScreen(x, y, topH(x, y));
      const bob = Math.round(Math.abs(Math.sin(now / 160)) * 3);
      ctx.drawImage(ARROW, cx - 4, cy - (unitAt(x, y) ? 32 : 18) - bob);
    }
  }

  function frame(now) {
    render(now);
    requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------- HUD
  function bar(v, max, cls = '') {
    const r = max ? v / max : 0;
    return `<div class="bar ${cls} ${cls ? '' : r < 0.3 ? 'low' : ''}"><i style="width:${Math.round(r * 100)}%"></i></div>`;
  }

  function updateHUD() {
    const { cursor, active } = state;
    const t = tileAt(cursor.x, cursor.y);
    const order = units.filter(u => !u.dead).sort((a, b) => a.wt - b.wt).slice(0, 4);
    $turn.innerHTML = `<div class="ttl">TURN ${state.turn}</div>` +
      order.map(u => `<div class="ord ${u.team}">${u === active ? '▶' : '&nbsp;'}${u.name}</div>`).join('');
    $terrain.innerHTML = `<div class="ttl">${TERRAIN[t.type].name}</div><div>高さ <b>${t.h}</b></div>`;

    const u = targetAt(cursor.x, cursor.y) || active;
    if (u?.isObject) {
      $unit.className = 'win enemy';
      $unit.innerHTML =
        `<div class="row"><span class="nm">${u.name}</span><span class="cl">構造物</span></div>` +
        `<div class="row"><span class="lb">HP</span>${bar(u.hp, u.maxHp)}<span class="num">${u.hp}/${u.maxHp}</span></div>` +
        `<div class="row">防<b>${u.def}</b></div>` +
        `<div class="row"><span class="rel">破壊すると通れる</span></div>`;
    } else if (u) {
      $unit.className = 'win ' + u.team;
      $unit.innerHTML =
        `<div class="row"><span class="nm">${u.name}</span><span class="cl">${u.C.name}</span><span class="lv">Lv${u.lv}</span></div>` +
        `<div class="row"><span class="lb">HP</span>${bar(u.hp, u.maxHp)}<span class="num">${u.hp}/${u.maxHp}</span></div>` +
        `<div class="row"><span class="lb">MP</span>${bar(u.mp, u.maxMp, 'mp')}<span class="num">${u.mp}/${u.maxMp}</span></div>` +
        `<div class="row">WT <b>${u.wt}</b>&nbsp;攻<b>${u.atk}</b>&nbsp;防<b>${u.def}</b>${u.leader ? '&nbsp;<span class="rel">★将</span>' : ''}</div>`;
    }

    let info = `<div class="hint">${state.hint}</div>`;
    if (state.phase === 'target' && active) {
      const tgt = targetAt(cursor.x, cursor.y);
      if (tgt && tgt.team !== active.team && state.atkTiles?.has(key(cursor.x, cursor.y))) {
        const f = forecast(active, tgt, active, cursor);
        info = `<div class="row"><span class="nm ${tgt.team}">${tgt.name}</span>へ${f.magic ? 'ファイア' : '攻撃'}</div>` +
          `<div class="row">命中率 <b>${f.hit}%</b></div>` +
          `<div class="row">ダメージ <b>${f.dmg}</b></div>` +
          `<div class="row"><span class="rel">${f.magic ? `MP ${MAGIC_COST} 消費` : REL[f.rel]}</span></div>`;
      }
    }
    $info.innerHTML = info;
  }

  function renderMenu() {
    $menu.innerHTML = state.menuItems.map((m, i) =>
      `<li data-i="${i}" class="${m.enabled ? '' : 'dis'} ${i === state.menuIndex ? 'sel' : ''}">${m.label}</li>`).join('');
  }
  const hideMenu = () => $menu.classList.add('hidden');

  async function showBanner(html, ms) {
    $banner.innerHTML = `<div class="box">${html}</div>`;
    $banner.classList.remove('hidden');
    await wait(ms);
    if (state.phase !== 'over') $banner.classList.add('hidden');
  }

  // ---------------------------------------------------------------- ターン進行
  // WT（ウェイトターン）が最小のユニットから行動する。行動内容が少ないほど次が早く回ってくる
  async function nextTurn() {
    if (checkEnd()) return;
    const alive = units.filter(u => !u.dead).sort((a, b) => a.wt - b.wt || b.agi - a.agi);
    const u = alive[0], m = u.wt;
    for (const v of alive) v.wt -= m;
    Object.assign(state, { active: u, moved: false, acted: false, phase: 'busy', turn: state.turn + 1, moveTiles: null, atkTiles: null });
    u.mp = Math.min(u.maxMp, u.mp + 2);
    state.hint = u.team === 'player' ? 'コマンドを選択' : `${u.name}の行動`;
    setCursor(u.x, u.y);
    await showBanner(`<span class="${u.team}">${u.name}</span> のターン`, 700);
    if (u.team === 'enemy') {
      await enemyTurn(u);
      if (!checkEnd()) endTurn();
    } else {
      openMenu();
    }
  }

  function endTurn() {
    const u = state.active;
    let wt = u.C.wt;
    if (!state.moved && !state.acted) wt *= 0.5;
    else if (!state.moved || !state.acted) wt *= 0.75;
    u.wt = Math.round(wt);
    state.phase = 'busy';
    hideMenu();
    setTimeout(nextTurn, 250);
  }

  function checkEnd() {
    if (state.phase === 'over') return true;
    const leader = units.find(u => u.leader);
    if (leader.dead || !units.some(u => u.team === 'enemy' && !u.dead)) { gameOver(true); return true; }
    if (!units.some(u => u.team === 'player' && !u.dead)) { gameOver(false); return true; }
    return false;
  }

  function gameOver(win) {
    state.phase = 'over';
    hideMenu();
    $banner.innerHTML = `<div class="box"><div class="big ${win ? '' : 'lose'}">${win ? 'VICTORY' : 'DEFEAT'}</div>` +
      `<div>${win ? '敵リーダーを撃破した！' : '部隊は全滅した…'}</div>` +
      '<div class="small">Z・タップ: もう一度　X: マップ選択</div></div>';
    $banner.classList.remove('hidden');
  }

  function openMenu() {
    const u = state.active;
    state.phase = 'menu';
    state.moveTiles = state.atkTiles = null;
    setCursor(u.x, u.y);
    state.menuItems = [
      { label: '移動', enabled: !state.moved, act: startMove },
      { label: u.C.type === 'magic' ? '魔法' : '攻撃', enabled: !state.acted && canAttack(u), act: startTarget },
      { label: '待機', enabled: true, act: startFacing },
    ];
    state.menuIndex = Math.max(0, state.menuItems.findIndex(m => m.enabled));
    state.hint = 'コマンドを選択';
    renderMenu();
    $menu.classList.remove('hidden');
    updateHUD();
  }

  function startMove() {
    const u = state.active;
    state.reach = computeReach(u);
    state.moveTiles = new Set(stopTiles(u, state.reach).map(s => key(s.x, s.y)));
    state.phase = 'move';
    state.hint = '移動先を選択';
    updateHUD();
  }

  function startTarget() {
    const u = state.active;
    state.atkTiles = attackTileSet(u, u);
    state.phase = 'target';
    state.hint = u.C.type === 'magic' ? '魔法の対象を選択' : '攻撃対象を選択';
    updateHUD();
  }

  function startFacing() {
    const u = state.active;
    state.phase = 'facing';
    state.cursor = { x: u.x, y: u.y };
    state.hint = '向きを決定<br>(矢印キー / タップ)';
    hideMenu();
    updateHUD();
  }

  function afterAction() {
    if (checkEnd()) return;
    if (state.moved && state.acted) startFacing(); else openMenu();
  }

  async function moveAlong(u, path) {
    state.camUnit = u;
    u.moving = true;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i], h0 = H(a.x, a.y), h1 = H(b.x, b.y);
      u.facing = dirToward(a, b);
      u.sortKey = Math.max(a.x + a.y, b.x + b.y);
      await tween(h0 === h1 ? 150 : 240, p => {
        u.rx = lerp(a.x, b.x, p);
        u.ry = lerp(a.y, b.y, p);
        u.gh = lerp(h0, h1, p);
        u.rh = u.gh + (h0 !== h1 ? Math.sin(Math.PI * p) * (0.6 + Math.abs(h1 - h0) * 0.35) : 0);
      });
      u.x = b.x;
      u.y = b.y;
    }
    u.rx = u.x; u.ry = u.y; u.rh = u.gh = H(u.x, u.y);
    u.sortKey = null;
    u.moving = false;
    state.camUnit = null;
    setCursor(u.x, u.y);
  }

  async function doAttack(a, t, pos = t) {
    const fc = forecast(a, t, a, pos);
    const type = a.C.type;
    a.facing = dirToward(a, pos);
    state.hint = `${a.name}の${type === 'magic' ? 'ファイア' : type === 'bow' ? '射撃' : '攻撃'}！`;
    setCursor(pos.x, pos.y);
    if (type === 'magic') a.mp -= MAGIC_COST;
    // 城門は扉の中ほどを狙う
    const at = [pos.x, pos.y, t.isObject ? H(pos.x, pos.y) + 2 : H(pos.x, pos.y)];
    const [ax, ay] = worldPos(a.x, a.y, H(a.x, a.y)), [tx, ty] = worldPos(pos.x, pos.y, at[2]);
    const len = Math.hypot(tx - ax, ty - ay) || 1, nx = (tx - ax) / len, ny = (ty - ay) / len;

    if (type === 'melee') {
      await tween(110, p => { a.offX = nx * 6 * p; a.offY = ny * 6 * p; });
    } else if (type === 'bow') {
      await tween(140, p => { a.offX = -nx * 2 * p; a.offY = -ny * 2 * p; });
      a.offX = a.offY = 0;
      const e = { kind: 'arrow', a: [a.x, a.y, H(a.x, a.y)], b: at, p: 0 };
      effects.push(e);
      await tween(120 + len * 3, p => { e.p = p; });
      effects.splice(effects.indexOf(e), 1);
    } else {
      await tween(260, p => { a.offY = -3 * Math.sin(p * Math.PI); });
      const e = { kind: 'fire', at, p: 0 };
      effects.push(e);
      await tween(520, p => { e.p = p; });
      effects.splice(effects.indexOf(e), 1);
    }

    const now = performance.now();
    if (Math.random() * 100 < fc.hit) {
      const dmg = Math.max(1, Math.round(fc.dmg * (0.9 + Math.random() * 0.2)));
      t.hp = Math.max(0, t.hp - dmg);
      popups.push({ u: pos, h: at[2], text: String(dmg), color: '#ffffff', t0: now });
      if (t.isObject) {
        t.damage = 1 - t.hp / t.maxHp;
        for (const gt of t.tiles) gt.canvas = buildTile(gt);
      }
      if (type === 'melee') effects.push({ kind: 'spark', at, t0: now, until: now + 220 });
      t.blink = true;
    } else {
      popups.push({ u: pos, h: at[2], text: 'MISS', color: '#a8c8ff', t0: now });
      await tween(200, p => { t.offX = nx * 5 * Math.sin(p * Math.PI); });
      t.offX = 0;
    }
    if (type === 'melee') await tween(140, p => { a.offX = nx * 6 * (1 - p); a.offY = ny * 6 * (1 - p); });
    a.offX = a.offY = 0;
    updateHUD();
    await wait(450);
    t.blink = false;
    if (t.hp <= 0 && t.isObject) {
      destroyGate(t);
    } else if (t.hp <= 0) {
      t.dead = true;
      state.hint = `${t.name}は倒れた…`;
      updateHUD();
      await tween(650, p => { t.alpha = 1 - p; });
      t.gone = true;
    }
  }

  // 城門は瓦礫のマスに置き換わり、通行できるようになる
  function destroyGate(g) {
    g.dead = true;
    const now = performance.now();
    for (const t of g.tiles) {
      t.type = 'rubble';
      delete t.drawH;
      delete t.gate;
      t.canvas = buildTile(t);
      effects.push({ kind: 'fire', at: [t.x, t.y, t.h + 1], t0: now, until: now + 700, cols: ['#e8e0d0', '#b0a898', '#8a8078', '#5a544e'] });
    }
    state.hint = '城門を破壊した！';
    updateHUD();
  }

  // ---------------------------------------------------------------- 敵 AI
  function terrainDist(u, targets) {
    const dist = new Map(targets.map(t => [key(t.x, t.y), 0]));
    const q = targets.map(t => ({ x: t.x, y: t.y }));
    while (q.length) {
      const c = q.shift(), d = dist.get(key(c.x, c.y));
      for (const [dx, dy] of DIRS) {
        const nx = c.x + dx, ny = c.y + dy, t = tileAt(nx, ny), k = key(nx, ny);
        if (!t || TERRAIN[t.type].blocked || dist.has(k)) continue;
        if (Math.abs(t.h - H(c.x, c.y)) > u.C.jump) continue;
        dist.set(k, d + 1);
        q.push({ x: nx, y: ny });
      }
    }
    return dist;
  }

  async function enemyTurn(u) {
    await wait(300);
    const reach = computeReach(u);
    const stops = stopTiles(u, reach);
    const foes = units.filter(v => !v.dead && v.team !== u.team);
    let best = null;
    if (canAttack(u)) {
      for (const s of stops) {
        const nearest = Math.min(...foes.map(f => Math.abs(f.x - s.x) + Math.abs(f.y - s.y)));
        for (const f of foes) {
          if (!inRange(u, s, f)) continue;
          const fc = forecast(u, f, s);
          let score = fc.dmg * fc.hit / 100 + (fc.dmg >= f.hp ? 60 : 0) - s.c * 0.3;
          if (u.C.type !== 'melee') score += nearest * 2;
          if (!best || score > best.score) best = { s, f, score };
        }
      }
    }
    if (best) {
      if (best.s.x !== u.x || best.s.y !== u.y) {
        await moveAlong(u, pathTo(reach, best.s));
        state.moved = true;
      }
      await wait(200);
      await doAttack(u, best.f);
      state.acted = true;
    } else if (!u.leader) {
      // 攻撃できなければ地形上の距離で最も近い敵へ寄る（リーダーは陣地を守る）
      const dist = terrainDist(u, foes);
      let dest = null, bestD = dist.get(key(u.x, u.y)) ?? Infinity;
      for (const s of stops) {
        const d = dist.get(key(s.x, s.y)) ?? Infinity;
        if (d < bestD) { bestD = d; dest = s; }
      }
      if (dest) {
        await moveAlong(u, pathTo(reach, dest));
        state.moved = true;
      }
    }
    const alive = foes.filter(f => !f.dead);
    if (alive.length) {
      const near = alive.reduce((a, b) =>
        Math.abs(a.x - u.x) + Math.abs(a.y - u.y) <= Math.abs(b.x - u.x) + Math.abs(b.y - u.y) ? a : b);
      u.facing = dirToward(u, near);
    }
    await wait(250);
  }

  // ---------------------------------------------------------------- 入力
  function confirm() {
    const { phase, cursor: c, active: u } = state;
    const k = key(c.x, c.y);
    if (phase === 'menu') {
      const m = state.menuItems[state.menuIndex];
      if (m?.enabled) { hideMenu(); m.act(); }
    } else if (phase === 'look') {
      if (c.x === u.x && c.y === u.y) openMenu();
    } else if (phase === 'move') {
      if (!state.moveTiles.has(k)) return;
      const path = pathTo(state.reach, c);
      state.phase = 'busy';
      state.moveTiles = null;
      (async () => {
        if (path.length > 1) {
          await moveAlong(u, path);
          state.moved = true;
        }
        afterAction();
      })();
    } else if (phase === 'target') {
      const t = targetAt(c.x, c.y);
      if (!t || t.team === u.team || !state.atkTiles.has(k)) return;
      state.phase = 'busy';
      state.atkTiles = null;
      (async () => {
        await doAttack(u, t, { x: c.x, y: c.y });
        state.acted = true;
        afterAction();
      })();
    } else if (phase === 'facing') {
      endTurn();
    } else if (phase === 'title') {
      startBattle(MAPS[state.titleIndex]);
    } else if (phase === 'over') {
      location.search = '?map=' + encodeURIComponent(MAP.id);
    }
  }

  function cancel() {
    const p = state.phase;
    if (p === 'menu') {
      hideMenu();
      state.phase = 'look';
      state.hint = 'マップ確認中<br>(X で戻る)';
      updateHUD();
    } else if (p === 'look' || p === 'move' || p === 'target') {
      openMenu();
    } else if (p === 'facing' && !(state.moved && state.acted)) {
      openMenu();
    } else if (p === 'over') {
      location.href = location.pathname;
    }
  }

  function onDir(dx, dy) {
    const p = state.phase;
    if (p === 'title') {
      const n = MAPS.length;
      state.titleIndex = (state.titleIndex + (dx || dy) + n) % n;
      renderTitle();
    } else if (p === 'menu') {
      if (!dy) return;
      const n = state.menuItems.length;
      state.menuIndex = (state.menuIndex + dy + n) % n;
      renderMenu();
    } else if (p === 'facing') {
      state.active.facing = DIRS.findIndex(d => d[0] === dx && d[1] === dy);
    } else if (p === 'look' || p === 'move' || p === 'target') {
      setCursor(state.cursor.x + dx, state.cursor.y + dy);
    }
  }

  // 十字キーはマップの斜め軸に対応させる（上 = 画面右上）
  const KEY_DIRS = { ArrowUp: [0, -1], ArrowRight: [1, 0], ArrowDown: [0, 1], ArrowLeft: [-1, 0] };
  addEventListener('keydown', e => {
    if (KEY_DIRS[e.key]) { e.preventDefault(); onDir(...KEY_DIRS[e.key]); }
    else if (['z', 'Z', 'Enter', ' '].includes(e.key)) { e.preventDefault(); confirm(); }
    else if (['x', 'X', 'Escape', 'Backspace'].includes(e.key)) { e.preventDefault(); cancel(); }
  });

  // 画面上の点から、手前に描かれているタイル（またはユニット）を探す
  function pickTile(clientX, clientY) {
    if (!MAP) return null;
    const r = canvas.getBoundingClientRect();
    const lx = (clientX - r.left) * VW / r.width, ly = (clientY - r.top) * VH / r.height;
    const { ox, oy } = state;
    const alive = units.filter(u => !u.dead).sort((a, b) => (b.x + b.y) - (a.x + a.y));
    for (const u of alive) {
      const [gx, gy] = toScreen(u.x, u.y, H(u.x, u.y));
      if (lx >= gx - 6 && lx < gx + 6 && ly >= gy - 18 && ly < gy) return tileAt(u.x, u.y);
    }
    for (let i = drawOrder.length - 1; i >= 0; i--) {
      const t = drawOrder[i], th = t.drawH ?? t.h, [sx, sy] = worldPos(t.x, t.y, th);
      const px = Math.floor(lx - (sx - 16 + ox)), py = Math.floor(ly - (sy + oy));
      if (px < 0 || px >= TW || py < 0 || py >= t.canvas.height) continue;
      const dx = px < 16 ? 15 - px : px - 16;
      if (py < TH) {
        const dy = py < 8 ? 7 - py : py - 8;
        if (dx + 2 * dy < 16) return t;
      } else if (py <= 8 + ((15 - dx) >> 1) + th * HS + BASE) {
        return t;
      }
    }
    return null;
  }

  function pointAt(t) {
    const p = state.phase, same = state.cursor.x === t.x && state.cursor.y === t.y;
    if (p === 'facing') {
      const u = state.active;
      if (t.x !== u.x || t.y !== u.y) u.facing = dirToward(u, t);
      return same;
    }
    if (p === 'look' || p === 'move' || p === 'target') {
      if (!same) setCursor(t.x, t.y);
      return same;
    }
    return false;
  }

  canvas.addEventListener('mousemove', e => {
    const t = pickTile(e.clientX, e.clientY);
    if (t) {
      pointAt(t);
      if (state.phase === 'facing') state.cursor = { x: t.x, y: t.y };
    }
  });
  // マウスはホバーでカーソルが乗るので 1 クリックで決定、タッチは 1 回目で選択・2 回目で決定
  canvas.addEventListener('click', e => {
    if (state.phase === 'over') { confirm(); return; }
    const t = pickTile(e.clientX, e.clientY);
    if (!t) return;
    if (state.phase === 'facing') {
      const same = state.cursor.x === t.x && state.cursor.y === t.y;
      pointAt(t);
      state.cursor = { x: t.x, y: t.y };
      if (same) confirm();
      return;
    }
    if (pointAt(t)) confirm();
  });
  canvas.addEventListener('contextmenu', e => { e.preventDefault(); cancel(); });
  $menu.addEventListener('click', e => {
    const li = e.target.closest('li');
    if (!li) return;
    state.menuIndex = +li.dataset.i;
    renderMenu();
    confirm();
  });
  $menu.addEventListener('mouseover', e => {
    const li = e.target.closest('li');
    if (!li || +li.dataset.i === state.menuIndex) return;
    state.menuIndex = +li.dataset.i;
    renderMenu();
  });
  $('btnOk').addEventListener('click', confirm);
  $('btnCancel').addEventListener('click', cancel);

  // ---------------------------------------------------------------- 画面サイズ
  function fit() {
    const s = Math.min((innerWidth - 16) / VW, (innerHeight - 100) / VH);
    const sc = s >= 2 ? Math.floor(s) : Math.max(0.5, s);
    $game.style.transform = `scale(${sc})`;
    $wrap.style.width = VW * sc + 'px';
    $wrap.style.height = VH * sc + 'px';
  }
  addEventListener('resize', fit);
  fit();

  // ---------------------------------------------------------------- 開始
  function renderTitle() {
    const cur = MAPS[state.titleIndex];
    $title.innerHTML = '<div class="ttl">マップ選択</div><ul>' +
      MAPS.map((m, i) => `<li data-i="${i}" class="${i === state.titleIndex ? 'sel' : ''}">${m.name}` +
        `<span>${m.height[0].length}×${m.height.length}</span></li>`).join('') +
      `</ul><div class="desc">${cur.desc}</div>`;
  }

  function showTitle() {
    state.phase = 'title';
    $game.classList.add('title');
    $title.classList.remove('hidden');
    renderTitle();
  }

  async function startBattle(def) {
    $game.classList.remove('title');
    $title.classList.add('hidden');
    loadMap(def);
    const first = units.find(u => u.team === 'player');
    state.phase = 'busy';
    state.cursor = { x: first.x, y: first.y };
    const [tx, ty] = cameraTarget();
    cam.x = clamp(tx, bounds.x0, bounds.x1);
    cam.y = clamp(ty, bounds.y0, bounds.y1);
    state.hint = '戦闘開始';
    updateHUD();
    await showBanner(`<div class="big">BATTLE START</div><div>${def.name}</div><div>勝利条件：${def.objective}</div>`, 2400);
    nextTurn();
  }

  $title.addEventListener('click', e => {
    const li = e.target.closest('li');
    if (!li) return;
    state.titleIndex = +li.dataset.i;
    confirm();
  });

  requestAnimationFrame(frame);
  const requested = MAPS.find(m => m.id === new URLSearchParams(location.search).get('map'));
  if (requested) startBattle(requested); else showTitle();
})();
