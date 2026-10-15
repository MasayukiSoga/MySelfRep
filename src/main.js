/*
 * 起動とスタイル切り替え
 * フィールドはひとつだけ。ボタンや 1・2・3 キーで、その場の戦い方（RPG・ACT・STG）を切り替える
 */
(function (G) {
  'use strict';

  const ORDER = ['rpg', 'act', 'stg'];
  const SCALE = 2;

  function boot(saved) {
    const canvas = document.getElementById('screen');
    const ctx = canvas.getContext('2d');
    canvas.width = G.W * SCALE;
    canvas.height = G.H * SCALE;

    const input = new G.Input();
    input.attachKeyboard(window);
    // 主人公の成長はスタイルを切り替えても共通
    const game = { input, party: new G.Party(), skins: new Map() };
    let scene = new G.FieldScene(game, ORDER.includes(saved?.style) ? saved.style : 'rpg');
    let debug = false;
    let started = false;

    const tabs = [...document.querySelectorAll('.modes [data-mode]')];
    const debugButton = document.getElementById('toggle-debug');

    function refresh() {
      const id = scene.style.id;
      document.documentElement.dataset.mode = id;
      for (const t of tabs) t.setAttribute('aria-selected', String(t.dataset.mode === id));
      for (const el of document.querySelectorAll('[data-for]')) el.hidden = el.dataset.for !== id;
    }

    // バトル中・会話中は切り替えられない（そのときはボタンの表示も変わらない）
    function select(id) {
      scene.setStyle(id);
      input.releaseAll();
      refresh();
    }

    function restart() {
      if (game.party.dead) game.party.revive();
      scene = new G.FieldScene(game, scene.style.id);
      refresh();
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
    setupSkins(game);

    window.claude?.hot?.snapshot?.(() => ({ style: scene.style.id }));

    refresh();

    const loop = new G.Loop(
      (dt) => {
        if (!started) return;
        scene.update(dt);
        input.endStep();
      },
      () => {
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

  // 画像で見た目を変える（物理エンジンの imageFit プラグイン）
  function setupSkins(game) {
    const $ = (id) => document.getElementById(id);
    const target = $('skin-target'), mode = $('skin-mode'), status = $('skin-status');
    if (!target) return;
    const name = () => target.selectedOptions[0].textContent;

    const apply = (image) => {
      const t0 = performance.now();
      const skin = G.plugins.imageFit.fromImage(image, { mode: mode.value });
      game.skins.set(target.value, skin);
      const { width, height } = skin.source, cut = skin.trimmed;
      const ms = Math.round(performance.now() - t0);
      status.textContent = `${name()}の見た目を ${width}×${height} の画像にしました。`
        + `余白を切り取った ${cut.w}×${cut.h} を、表示する大きさに合わせて縮小します（下ごしらえ ${ms} ms）。`;
    };

    $('skin-file').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { apply(img); URL.revokeObjectURL(url); };
      img.onerror = () => {
        status.textContent = `「${file.name}」は画像として読み込めませんでした。PNG・JPEG・GIF・WebP などを選んでください。`;
        URL.revokeObjectURL(url);
      };
      img.src = url;
      e.target.value = '';
    });
    $('skin-sample').addEventListener('click', () => apply(sampleImage()));
    $('skin-reset').addEventListener('click', () => {
      game.skins.delete(target.value);
      status.textContent = `${name()}を元の絵に戻しました。`;
    });
  }

  // 縮小の具合を見るための大きな画像（1200×1000）。まわりは透明で、細い線と半透明のふちがある
  function sampleImage() {
    const c = Object.assign(document.createElement('canvas'), { width: 1200, height: 1000 });
    const g = c.getContext('2d');
    const cx = 600, cy = 560;
    const glow = g.createRadialGradient(cx, cy, 200, cx, cy, 380);
    glow.addColorStop(0, 'rgba(255,214,90,0.7)');
    glow.addColorStop(1, 'rgba(255,214,90,0)');
    g.fillStyle = glow;
    g.fillRect(0, 0, 1200, 1000);
    const body = g.createRadialGradient(cx - 90, cy - 120, 40, cx, cy, 300);
    body.addColorStop(0, '#ffe7a8');
    body.addColorStop(1, '#e0703a');
    g.fillStyle = body;
    g.beginPath();
    g.ellipse(cx, cy, 300, 260, 0, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 14;
    g.strokeStyle = '#4a2410';
    g.stroke();
    for (const ex of [-110, 110]) {
      g.fillStyle = '#2a1408';
      g.beginPath();
      g.ellipse(cx + ex, cy - 40, 38, 52, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(cx + ex - 12, cy - 60, 14, 0, Math.PI * 2);
      g.fill();
    }
    g.lineWidth = 3;
    g.strokeStyle = '#4a2410';
    for (const s of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        g.beginPath();
        g.moveTo(cx + s * 150, cy + 40 + i * 22);
        g.lineTo(cx + s * 280, cy + 20 + i * 34);
        g.stroke();
      }
    }
    g.lineWidth = 12;
    g.beginPath();
    g.arc(cx, cy + 40, 90, 0.2 * Math.PI, 0.8 * Math.PI);
    g.stroke();
    return c;
  }

  // 画面上の十字キーと A・B・C ボタン（スマホ用）
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
