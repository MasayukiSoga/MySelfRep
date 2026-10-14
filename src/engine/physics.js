/*
 * 簡易物理エンジン（3つのモードで共通）
 *
 * - 形は矩形（AABB）と円の2種類
 * - タイルマップとの衝突：x と y を別々に動かして押し戻す。半タイルずつ分割して動かすので速い物体もすり抜けない
 * - 一方通行の床（下からはすり抜け、上からは乗れる）
 * - 物体どうしの重なり検出：空間を格子に分けて近いものだけ調べる
 *   - mask に含まれるレイヤーの相手と重なった瞬間に onEnter、離れた瞬間に onExit を呼ぶ
 *   - いま重なっている相手は body.contacts で参照できる
 *   - blocks に含まれるレイヤーの相手からは押し出される（NPC にめり込まない等）
 * - 高さ z（見下ろし型のジャンプ用）。zGravity は z にだけかかる重力
 *
 * 単位は px と秒。座標は物体の中心。
 */
(function (G) {
  'use strict';

  const EPS = 1e-6;

  const Layer = Object.freeze({
    PLAYER: 1,
    PLAYER_ATTACK: 2,
    ENEMY: 4,
    ENEMY_ATTACK: 8,
    ITEM: 16,
    NPC: 32,
  });

  let nextId = 1;

  class Body {
    constructor(o = {}) {
      this.id = nextId++;
      this.x = o.x ?? 0;
      this.y = o.y ?? 0;
      this.vx = o.vx ?? 0;
      this.vy = o.vy ?? 0;
      if (o.r != null) {
        this.shape = 'circle';
        this.r = o.r;
        this.hw = this.hh = o.r;
      } else {
        this.shape = 'rect';
        this.r = 0;
        this.hw = (o.w ?? 16) / 2;
        this.hh = (o.h ?? 16) / 2;
      }
      this.z = 0;
      this.vz = 0;
      this.zGrounded = true;
      this.gravityScale = o.gravityScale ?? 1;
      this.collideTiles = o.collideTiles ?? true;
      this.layer = o.layer ?? 0;
      this.mask = o.mask ?? 0;
      this.blocks = o.blocks ?? 0;
      this.enabled = o.enabled ?? true;
      this.owner = o.owner ?? null;
      this.onEnter = o.onEnter ?? null;
      this.onExit = o.onExit ?? null;
      this.dropThrough = false;
      this.contacts = new Set();
      this.onGround = false;
      this.onCeiling = false;
      this.wall = 0; // 直前のステップで当たった壁の向き（-1: 左, 1: 右）
      this.removed = false;
    }
    get left() { return this.x - this.hw; }
    get right() { return this.x + this.hw; }
    get top() { return this.y - this.hh; }
    get bottom() { return this.y + this.hh; }
  }

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  function overlaps(a, b) {
    if (a.shape === 'circle' && b.shape === 'circle') {
      const dx = a.x - b.x, dy = a.y - b.y, r = a.r + b.r;
      return dx * dx + dy * dy < r * r;
    }
    if (a.shape === 'rect' && b.shape === 'rect') {
      return Math.abs(a.x - b.x) < a.hw + b.hw && Math.abs(a.y - b.y) < a.hh + b.hh;
    }
    const c = a.shape === 'circle' ? a : b;
    const r = c === a ? b : a;
    const dx = c.x - clamp(c.x, r.left, r.right);
    const dy = c.y - clamp(c.y, r.top, r.bottom);
    return dx * dx + dy * dy < c.r * c.r;
  }

  class TileMap {
    // rows: 文字列の配列。solid: 壁になる文字、oneWay: 一方通行の床になる文字
    // edge: マップの左右と上の外側、bottom: 下の外側の扱い（ACT では穴に落ちるよう '.'）
    constructor(rows, size, o = {}) {
      this.size = size;
      this.data = rows.map((r) => r.split(''));
      this.rows = rows.length;
      this.cols = Math.max(...rows.map((r) => r.length));
      this.width = this.cols * size;
      this.height = this.rows * size;
      this.solid = new Set(o.solid ?? ['#']);
      this.oneWay = new Set(o.oneWay ?? []);
      this.edge = o.edge ?? '#';
      this.bottomEdge = o.bottom ?? this.edge;
    }
    get(tx, ty) {
      if (tx < 0 || tx >= this.cols || ty < 0) return this.edge;
      if (ty >= this.rows) return this.bottomEdge;
      return this.data[ty][tx] ?? '.';
    }
    set(tx, ty, ch) {
      if (ty >= 0 && ty < this.rows && tx >= 0 && tx < this.cols) this.data[ty][tx] = ch;
    }
    isSolid(tx, ty) { return this.solid.has(this.get(tx, ty)); }
    isSolidAt(x, y) { return this.isSolid(Math.floor(x / this.size), Math.floor(y / this.size)); }
    // 乗れる場所か（壁 or 一方通行の床）
    isGroundAt(x, y) {
      const ch = this.get(Math.floor(x / this.size), Math.floor(y / this.size));
      return this.solid.has(ch) || this.oneWay.has(ch);
    }
  }

  class World {
    constructor(o = {}) {
      this.gravity = o.gravity ?? 0;
      this.maxFall = o.maxFall ?? Infinity;
      this.zGravity = o.zGravity ?? 0;
      this.map = o.map ?? null;
      this.cellSize = o.cellSize ?? 64;
      this.bodies = [];
      this.pairs = new Map();
    }

    add(b) {
      b.removed = false;
      this.bodies.push(b);
      return b;
    }

    remove(b) {
      if (b.removed) return;
      b.removed = true;
      for (const o of b.contacts) o.contacts.delete(b);
      b.contacts.clear();
    }

    step(dt) {
      if (this.bodies.some((b) => b.removed)) this.bodies = this.bodies.filter((b) => !b.removed);

      for (const b of this.bodies) {
        if (!b.enabled) continue;
        b.onGround = b.onCeiling = false;
        b.wall = 0;
        if (b.gravityScale) {
          b.vy = Math.min(b.vy + this.gravity * b.gravityScale * dt, this.maxFall);
        }
        const dx = b.vx * dt, dy = b.vy * dt;
        if (this.map && b.collideTiles) {
          this._move(b, 0, dx);
          this._move(b, 1, dy);
        } else {
          b.x += dx;
          b.y += dy;
        }
        if (this.zGravity && b.gravityScale) {
          b.vz -= this.zGravity * b.gravityScale * dt;
          b.z += b.vz * dt;
          if (b.z <= 0) { b.z = 0; b.vz = 0; b.zGrounded = true; } else b.zGrounded = false;
        }
      }

      this._detect();
    }

    // 指定した範囲に重なっている物体を探す（会話相手の検索など）
    query(x, y, hw, hh, layerMask) {
      return this.bodies.filter((b) => b.enabled && !b.removed && (b.layer & layerMask) &&
        Math.abs(b.x - x) < b.hw + hw && Math.abs(b.y - y) < b.hh + hh);
    }

    _move(b, axis, delta) {
      const maxStep = this.map.size / 2;
      while (delta !== 0) {
        const step = clamp(delta, -maxStep, maxStep);
        delta -= step;
        if (this._stepAxis(b, axis, step)) return;
      }
    }

    // 1ステップ分動かし、先頭の辺が入ったタイルだけを調べて押し戻す。当たったら true
    _stepAxis(b, axis, step) {
      const m = this.map, ts = m.size;
      if (axis === 0) {
        b.x += step;
        const ty0 = Math.floor(b.top / ts), ty1 = Math.floor((b.bottom - EPS) / ts);
        const tx = step > 0 ? Math.floor((b.right - EPS) / ts) : Math.floor(b.left / ts);
        for (let ty = ty0; ty <= ty1; ty++) {
          if (!m.isSolid(tx, ty)) continue;
          b.x = step > 0 ? tx * ts - b.hw : (tx + 1) * ts + b.hw;
          b.vx = 0;
          b.wall = step > 0 ? 1 : -1;
          return true;
        }
        return false;
      }
      const prevBottom = b.bottom;
      b.y += step;
      const tx0 = Math.floor(b.left / ts), tx1 = Math.floor((b.right - EPS) / ts);
      if (step > 0) {
        const ty = Math.floor((b.bottom - EPS) / ts);
        const top = ty * ts;
        for (let tx = tx0; tx <= tx1; tx++) {
          const ch = m.get(tx, ty);
          const landsOnOneWay = m.oneWay.has(ch) && !b.dropThrough && prevBottom <= top + EPS;
          if (!m.solid.has(ch) && !landsOnOneWay) continue;
          b.y = top - b.hh;
          b.vy = 0;
          b.onGround = true;
          return true;
        }
      } else {
        const ty = Math.floor(b.top / ts);
        for (let tx = tx0; tx <= tx1; tx++) {
          if (!m.isSolid(tx, ty)) continue;
          b.y = (ty + 1) * ts + b.hh;
          b.vy = 0;
          b.onCeiling = true;
          return true;
        }
      }
      return false;
    }

    _overlapsTiles(b) {
      const ts = this.map.size;
      for (let ty = Math.floor(b.top / ts); ty <= Math.floor((b.bottom - EPS) / ts); ty++) {
        for (let tx = Math.floor(b.left / ts); tx <= Math.floor((b.right - EPS) / ts); tx++) {
          if (this.map.isSolid(tx, ty)) return true;
        }
      }
      return false;
    }

    // a を b から押し出す（share = 1 で全量、0.5 で半分）。押し出した先が壁なら元に戻す
    _separate(a, b, share) {
      const ox = a.hw + b.hw - Math.abs(a.x - b.x);
      const oy = a.hh + b.hh - Math.abs(a.y - b.y);
      if (ox <= 0 || oy <= 0) return;
      const px = a.x, py = a.y;
      if (ox < oy) a.x += (a.x < b.x ? -ox : ox) * share;
      else a.y += (a.y < b.y ? -oy : oy) * share;
      if (this.map && a.collideTiles && this._overlapsTiles(a)) { a.x = px; a.y = py; }
    }

    _detect() {
      const cs = this.cellSize;
      const grid = new Map();
      const tested = new Set();
      const now = new Map();

      for (const b of this.bodies) {
        if (!b.enabled || b.removed || !(b.layer || b.mask || b.blocks)) continue;
        const x0 = Math.floor(b.left / cs), x1 = Math.floor(b.right / cs);
        const y0 = Math.floor(b.top / cs), y1 = Math.floor(b.bottom / cs);
        for (let cy = y0; cy <= y1; cy++) {
          for (let cx = x0; cx <= x1; cx++) {
            const key = (cx + 32768) * 65536 + (cy + 32768);
            let cell = grid.get(key);
            if (!cell) grid.set(key, (cell = []));
            for (const o of cell) this._test(b, o, tested, now);
            cell.push(b);
          }
        }
      }

      const alive = (b) => b.enabled && !b.removed;

      for (const [key, [a, b]] of now) {
        if (this.pairs.has(key)) continue;
        a.contacts.add(b);
        b.contacts.add(a);
        // 先のコールバックで消えた物体には通知しない（1発の弾が2体に当たらないように）
        if ((a.mask & b.layer) && alive(a) && alive(b)) a.onEnter?.(b);
        if ((b.mask & a.layer) && alive(a) && alive(b)) b.onEnter?.(a);
      }
      for (const [key, [a, b]] of this.pairs) {
        if (now.has(key)) continue;
        a.contacts.delete(b);
        b.contacts.delete(a);
        if (a.removed || b.removed) continue;
        if (a.mask & b.layer) a.onExit?.(b);
        if (b.mask & a.layer) b.onExit?.(a);
      }
      this.pairs = now;
    }

    _test(a, b, tested, now) {
      const key = a.id < b.id ? a.id + ':' + b.id : b.id + ':' + a.id;
      if (tested.has(key)) return;
      tested.add(key);
      const notify = (a.mask & b.layer) || (b.mask & a.layer);
      const aBlocked = (a.blocks & b.layer) !== 0;
      const bBlocked = (b.blocks & a.layer) !== 0;
      if (!notify && !aBlocked && !bBlocked) return;
      if (!overlaps(a, b)) return;
      if (notify) now.set(key, a.id < b.id ? [a, b] : [b, a]);
      if (aBlocked && bBlocked) { this._separate(a, b, 0.5); this._separate(b, a, 0.5); }
      else if (aBlocked) this._separate(a, b, 1);
      else if (bBlocked) this._separate(b, a, 1);
    }
  }

  G.Layer = Layer;
  G.Body = Body;
  G.TileMap = TileMap;
  G.World = World;
  G.overlaps = overlaps;
})(globalThis.Game = globalThis.Game || {});
