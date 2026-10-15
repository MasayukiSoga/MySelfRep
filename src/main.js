/*
 * 起動とモード切り替え
 * 各モードのシーンは保持しておき、切り替えて戻ると続きから遊べる（R キーでやり直し）
 */
(function (G) {
  'use strict';

  const ORDER = ['stg', 'act', 'rpg'];
  const SCALE = 2;

  function boot(saved) {
    const canvas = document.getElementById('screen');
    const ctx = canvas.getContext('2d');
    canvas.width = G.W * SCALE;
    canvas.height = G.H * SCALE;

    const input = new G.Input();
    input.attachKeyboard(window);
    // 主人公の成長は3モードで共通
    const game = { input, party: new G.Party() };
    const scenes = {};
    let current = ORDER.includes(saved?.mode) ? saved.mode : 'stg';
    let debug = false;
    let started = false;

    const tabs = [...document.querySelectorAll('[data-mode]')];
    const debugButton = document.getElementById('toggle-debug');

    function select(id) {
      // ゲームオーバーのまま別のモードに移ったら、復活させてそのモードを作り直す
      if (game.party.dead) {
        game.party.revive();
        for (const k of Object.keys(scenes)) if (scenes[k].state === 'over') delete scenes[k];
      }
      current = id;
      scenes[id] ??= G.modes[id].create(game);
      input.releaseAll();
      document.documentElement.dataset.mode = id;
      for (const t of tabs) t.setAttribute('aria-selected', String(t.dataset.mode === id));
      for (const el of document.querySelectorAll('[data-for]')) el.hidden = el.dataset.for !== id;
    }

    function restart() {
      scenes[current] = G.modes[current].create(game);
    }

    function setDebug(on) {
      debug = on;
      debugButton.setAttribute('aria-pressed', String(on));
    }

    function start() {
      started = true;
      canvas.focus({ preventScroll: true });
    }

    for (const t of tabs) {
      t.addEventListener('click', () => {
        select(t.dataset.mode);
        start();
      });
    }
    debugButton.addEventListener('click', () => { setDebug(!debug); start(); });
    document.getElementById('restart').addEventListener('click', () => { restart(); start(); });
    canvas.addEventListener('pointerdown', start);

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (e.key >= '1' && e.key <= '3') select(ORDER[Number(e.key) - 1]);
      else if (e.code === 'KeyH') setDebug(!debug);
      else if (e.code === 'KeyR') restart();
      else return;
      start();
    });
    window.addEventListener('keydown', (e) => { if (!started && e.code in { KeyZ: 1, KeyX: 1, Space: 1, Enter: 1 }) start(); });
    window.addEventListener('blur', () => input.releaseAll());

    setupTouch(input, start);

    window.claude?.hot?.snapshot?.(() => ({ mode: current }));

    select(current);

    const loop = new G.Loop(
      (dt) => {
        if (!started) return;
        const scene = scenes[current];
        scene.update(dt);
        if (scene.restart) restart();
        input.endStep();
      },
      () => {
        const scene = scenes[current];
        ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
        ctx.imageSmoothingEnabled = false;
        scene.draw(ctx);
        if (debug && !scene.battle) G.draw.bodies(ctx, scene);
        if (!started) {
          ctx.fillStyle = 'rgba(10,8,30,0.55)';
          ctx.fillRect(0, 0, G.W, G.H);
          G.draw.text(ctx, 'クリック／タップでスタート', G.W / 2, G.H / 2 - 8, { size: 16, align: 'center' });
        }
      },
    );
    loop.start();
  }

  // 画面上の十字キーと A・B ボタン（スマホ用）
  function setupTouch(input, start) {
    const pad = document.getElementById('dpad');
    if (!pad) return;
    const dirs = ['left', 'right', 'up', 'down'];
    const setDirs = (e) => {
      const r = pad.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      const dead = 0.12;
      const want = { left: x < -dead, right: x > dead, up: y < -dead, down: y > dead };
      for (const d of dirs) (want[d] ? input.press(d) : input.release(d));
    };
    const clear = () => dirs.forEach((d) => input.release(d));
    pad.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      pad.setPointerCapture(e.pointerId);
      start();
      setDirs(e);
    });
    pad.addEventListener('pointermove', (e) => { if (pad.hasPointerCapture(e.pointerId)) setDirs(e); });
    pad.addEventListener('pointerup', clear);
    pad.addEventListener('pointercancel', clear);

    for (const btn of document.querySelectorAll('[data-action]')) {
      const action = btn.dataset.action;
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        btn.setPointerCapture(e.pointerId);
        start();
        input.press(action);
      });
      const up = () => input.release(action);
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
    }
  }

  const hot = globalThis.window?.claude?.hot;
  if (hot?.ready) hot.ready(boot);
  else boot(hot?.data ?? {});
})(globalThis.Game = globalThis.Game || {});
