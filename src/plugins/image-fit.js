/*
 * 物理エンジンのプラグイン：大きな画像を、いい感じに縮小して物体に合わせる（imageFit）
 *
 *   world.use(G.plugins.imageFit)            … world.skins（見た目の登録先）ができる
 *   const skin = G.plugins.imageFit.fromImage(img)   … 画像から Skin を作る
 *   world.skins.set('slime', skin)           … 名前で登録して描画側から使う
 *   G.plugins.imageFit.attach(body, skin, { maxW, maxH, hitbox: true })
 *                                            … 物体に付け、当たり判定を画像の見えている部分に合わせる
 *
 * 「いい感じ」の中身
 * - まわりの透明な余白を自動で切り取る
 * - 面積平均（ボックスフィルタ）で縮小する。単純に間引かないので、細い線が途切れず、ギザギザにならない
 * - 色は不透明度を掛けてから平均する（premultiplied alpha）。半透明のふちが黒ずまない
 * - 実際に画面に出る大きさ（拡大率も含めた実ピクセル数）で縮小し、大きさごとに覚えておく
 * - とても大きい画像は、最初に一度だけ 512px 以下まで縮めておき、以降はそこから縮小する
 *
 * 縮小のしかた自体も差し替えられる（縮小プラグイン）
 *   G.plugins.imageFit.register('名前', { label, shrink(src, sw, sh, dw, dh, tools) })  … 追加
 *   G.plugins.imageFit.select('名前')   … 切り替え。登録済みのすべての画像がすぐ新しい方法で描き直される
 * ゲーム本体は「この大きさに縮めて」と頼むだけなので、あとから画質のよい縮小プラグインを足しても本体は変えなくてよい
 * 標準で入っているもの：smooth（なめらか：面積平均）、pixel（くっきり：最近傍）
 *
 * 縮小の計算（resample など）は DOM を使わない純粋な関数なので、Node のテストでも動く
 */
(function (G) {
  'use strict';

  // 不透明度がこれ以下の画素は「透明な余白」とみなす
  const ALPHA_THRESHOLD = 8;
  const BASE_MAX = 512;
  const CACHE_MAX = 16;

  // 不透明な部分を囲む長方形。全部透明なら null
  function alphaBounds(data, w, h, threshold = ALPHA_THRESHOLD) {
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (data[(y * w + x) * 4 + 3] <= threshold) continue;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
    return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }

  function crop(data, w, box) {
    const out = new Uint8ClampedArray(box.w * box.h * 4);
    for (let y = 0; y < box.h; y++) {
      const from = ((box.y + y) * w + box.x) * 4;
      out.set(data.subarray(from, from + box.w * 4), y * box.w * 4);
    }
    return out;
  }

  // 縦横比を保ったまま maxW × maxH に収まる大きさ
  function fitSize(sw, sh, maxW, maxH) {
    const scale = Math.min(maxW / sw, maxH / sh);
    return { w: Math.max(1, Math.round(sw * scale)), h: Math.max(1, Math.round(sh * scale)) };
  }

  // 出力の1画素が、入力のどの画素をどれだけの割合で含むか（端は小数の割合になる）
  function boxWeights(sn, dn) {
    const r = sn / dn;
    const out = [];
    for (let i = 0; i < dn; i++) {
      const a = i * r, b = a + r;
      const list = [];
      for (let j = Math.floor(a); j < Math.min(sn, Math.ceil(b - 1e-9)); j++) {
        const w = Math.min(b, j + 1) - Math.max(a, j);
        if (w > 1e-9) list.push(j, w / r);
      }
      out.push(list);
    }
    return out;
  }

  // RGBA の画素を dw × dh に縮小する
  function resample(src, sw, sh, dw, dh, mode = 'smooth') {
    const out = new Uint8ClampedArray(dw * dh * 4);
    if (mode === 'pixel') {
      // ドット絵：各ブロックの中心の画素をそのまま使う
      for (let y = 0; y < dh; y++) {
        const sy = Math.min(sh - 1, Math.floor(((y + 0.5) * sh) / dh));
        for (let x = 0; x < dw; x++) {
          const sx = Math.min(sw - 1, Math.floor(((x + 0.5) * sw) / dw));
          const s = (sy * sw + sx) * 4, d = (y * dw + x) * 4;
          out[d] = src[s]; out[d + 1] = src[s + 1]; out[d + 2] = src[s + 2]; out[d + 3] = src[s + 3];
        }
      }
      return out;
    }

    // 横 → 縦の順に面積平均する。色は不透明度を掛けた値（premultiplied）で平均する
    const wx = boxWeights(sw, dw), wy = boxWeights(sh, dh);
    const tmp = new Float32Array(dw * sh * 4);
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < dw; x++) {
        const list = wx[x];
        let r = 0, g = 0, b = 0, a = 0;
        for (let k = 0; k < list.length; k += 2) {
          const s = (y * sw + list[k]) * 4, w = list[k + 1];
          const al = (src[s + 3] / 255) * w;
          r += src[s] * al; g += src[s + 1] * al; b += src[s + 2] * al; a += al;
        }
        const d = (y * dw + x) * 4;
        tmp[d] = r; tmp[d + 1] = g; tmp[d + 2] = b; tmp[d + 3] = a;
      }
    }
    for (let y = 0; y < dh; y++) {
      const list = wy[y];
      for (let x = 0; x < dw; x++) {
        let r = 0, g = 0, b = 0, a = 0;
        for (let k = 0; k < list.length; k += 2) {
          const s = (list[k] * dw + x) * 4, w = list[k + 1];
          r += tmp[s] * w; g += tmp[s + 1] * w; b += tmp[s + 2] * w; a += tmp[s + 3] * w;
        }
        const d = (y * dw + x) * 4;
        if (a > 0) {
          out[d] = r / a; out[d + 1] = g / a; out[d + 2] = b / a; out[d + 3] = a * 255;
        }
      }
    }
    return out;
  }

  // 画面に出せる canvas を作る。テストでは差し替えられる
  function createCanvas(w, h) {
    if (typeof document !== 'undefined') return Object.assign(document.createElement('canvas'), { width: w, height: h });
    return new OffscreenCanvas(w, h);
  }

  // 縮小プラグインの登録先。shrink は RGBA の画素を dw × dh に縮めて返す
  const shrinkers = {
    smooth: { label: 'なめらか（面積平均）', shrink: (src, sw, sh, dw, dh) => resample(src, sw, sh, dw, dh, 'smooth') },
    pixel: { label: 'くっきり（最近傍）', shrink: (src, sw, sh, dw, dh) => resample(src, sw, sh, dw, dh, 'pixel') },
  };
  // 縮小プラグインが使える道具
  const tools = { resample, alphaBounds, fitSize };

  // 縮小済みの見た目。元の画像は一度だけ読み、表示する大きさごとに縮小結果を覚えておく
  // shrinker を指定しなければ、そのとき選ばれている縮小プラグイン（imageFit.active）を使う
  class Skin {
    constructor({ data, width, height }, { shrinker = null, trim = true } = {}) {
      this.shrinker = shrinker;
      this.source = { width, height };
      this.trimmed = (trim && alphaBounds(data, width, height)) || { x: 0, y: 0, w: width, h: height };
      let px = crop(data, width, this.trimmed), w = this.trimmed.w, h = this.trimmed.h;
      // 下ごしらえはどの縮小プラグインでも共通（512px 以下まで面積平均で縮める）
      if (Math.max(w, h) > BASE_MAX) {
        const f = fitSize(w, h, BASE_MAX, BASE_MAX);
        px = resample(px, w, h, f.w, f.h);
        w = f.w;
        h = f.h;
      }
      this.base = { data: px, w, h };
      this.cache = new Map();
    }

    get aspect() { return this.base.w / this.base.h; }

    // maxW × maxH（実ピクセル）に収まるよう縮小した画素。縮小プラグインと大きさごとに覚えておく
    pixels(maxW, maxH) {
      const { w, h } = fitSize(this.base.w, this.base.h, maxW, maxH);
      const name = this.shrinker ?? imageFit.active;
      const plugin = shrinkers[name] ?? shrinkers.smooth;
      const key = `${name}:${w}x${h}`;
      let hit = this.cache.get(key);
      if (!hit) {
        hit = { w, h, data: plugin.shrink(this.base.data, this.base.w, this.base.h, w, h, tools), canvas: null };
        this.cache.set(key, hit);
        if (this.cache.size > CACHE_MAX) this.cache.delete(this.cache.keys().next().value);
      }
      return hit;
    }

    canvas(maxW, maxH) {
      const hit = this.pixels(maxW, maxH);
      if (!hit.canvas) {
        const c = imageFit.createCanvas(hit.w, hit.h);
        const cx = c.getContext('2d');
        const img = cx.createImageData(hit.w, hit.h);
        img.data.set(hit.data);
        cx.putImageData(img, 0, 0);
        hit.canvas = c;
      }
      return hit.canvas;
    }

    // 今の座標系で、足元 (0, -lift) を下端の中心にして boxW × boxH に収めて描く
    // 拡大・縮小されている座標系でも、画面の実ピクセルに合わせた大きさで縮小する
    draw(ctx, boxW, boxH, { lift = 0, flash = false } = {}) {
      const m = ctx.getTransform?.();
      const k = (m && Math.hypot(m.a, m.b)) || 1;
      const c = this.canvas(Math.max(1, Math.round(boxW * k)), Math.max(1, Math.round(boxH * k)));
      const w = c.width / k, h = c.height / k;
      if (flash) ctx.globalAlpha *= 0.45;
      ctx.drawImage(c, -w / 2, -lift - h, w, h);
    }
  }

  // 物体を、画像の見えている部分の形に合わせる（縦横比を保って maxW × maxH に収める）
  function fitHitbox(body, skin, maxW, maxH) {
    const { w, h } = fitSize(skin.base.w, skin.base.h, maxW, maxH);
    if (body.shape === 'circle') body.r = body.hw = body.hh = Math.min(w, h) / 2;
    else {
      body.hw = w / 2;
      body.hh = h / 2;
    }
    return { w, h };
  }

  const imageFit = {
    name: 'imageFit',
    // skins を渡すと、シーンを作り直しても同じ登録を使い続けられる
    install(world, { skins } = {}) {
      world.skins = skins ?? new Map();
    },
    onRemove(body) {
      body.skin = null;
    },
    // 物体に見た目を付ける。hitbox: true で当たり判定も画像に合わせる
    attach(body, skin, { maxW, maxH, hitbox = false } = {}) {
      body.skin = skin;
      if (hitbox) fitHitbox(body, skin, maxW, maxH);
      return body;
    },
    // ブラウザの画像（img / canvas）から Skin を作る
    fromImage(image, options) {
      const w = image.naturalWidth || image.width, h = image.naturalHeight || image.height;
      const c = imageFit.createCanvas(w, h);
      const cx = c.getContext('2d');
      cx.drawImage(image, 0, 0);
      return new Skin(cx.getImageData(0, 0, w, h), options);
    },
    // 今使っている縮小プラグインの名前
    active: 'smooth',
    shrinkers,
    // 縮小プラグインを追加する。select: true ならすぐにそれを使う
    register(name, plugin, { select = false } = {}) {
      shrinkers[name] = plugin;
      if (select) imageFit.active = name;
      return imageFit;
    },
    select(name) {
      if (!shrinkers[name]) return false;
      imageFit.active = name;
      return true;
    },
    Skin,
    createCanvas,
    alphaBounds,
    fitSize,
    resample,
    fitHitbox,
  };

  G.plugins = Object.assign(G.plugins || {}, { imageFit });
})(globalThis.Game = globalThis.Game || {});
