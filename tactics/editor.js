'use strict';
// マップエディタ。編集結果は maps.js と同じ形式で扱い、
// ・ブラウザに自動保存（ゲームのマップ選択に「（エディタ）」として出る）
// ・右側の iframe（index.html?preview=1）へ送って実際のゲーム画面でプレビュー
// ・maps.js に貼り付けられるコードとして書き出し
(() => {
  const $ = id => document.getElementById(id);
  const STORE = 'tactics.editorMap';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // 地形コード（game.js の TERRAIN_CODES と対応）。色は上面のおおよその色
  const TERRAINS = [
    { code: '.', name: '自動', color: null },
    { code: 'g', name: '草原', color: '#5c9c3c' },
    { code: 'd', name: '荒れ地', color: '#a07848' },
    { code: 'r', name: '岩場', color: '#9a9aa2' },
    { code: 's', name: '砂地', color: '#d8c088' },
    { code: 'w', name: '川・堀', color: '#3868c0' },
    { code: 'f', name: '石畳', color: '#a8a49a' },
    { code: 'W', name: '城壁・石壁', color: '#a08c74' },
    { code: 'R', name: '絨毯', color: '#a83034' },
    { code: 'b', name: '木橋', color: '#9a6a3a' },
    { code: 'x', name: '瓦礫', color: '#7a7670' },
  ];
  const TCOL = Object.fromEntries(TERRAINS.map(t => [t.code, t.color]));
  const TNAME = Object.fromEntries(TERRAINS.map(t => [t.code, t.name]));
  const CLASSES = [
    ['knight', 'ナイト', '騎'], ['soldier', 'ソルジャー', '兵'], ['archer', 'アーチャー', '弓'], ['wizard', 'ウィザード', '魔'],
    ['goblin', 'ゴブリン', 'ゴ'], ['wolf', 'ウルフ', '狼'], ['orc', 'オーク', 'オ'], ['golem', 'ゴーレム', '巨'],
  ];
  const CLS = Object.fromEntries(CLASSES.map(([id, name, mark]) => [id, { name, mark }]));
  const MONSTER = new Set(['goblin', 'wolf', 'orc', 'golem']);
  // 大型ユニットの占有マス数（game.js の CLASSES の size と対応）。x, y は占有範囲の奥の角
  const SIZE = { golem: 4 };
  const sizeOf = u => SIZE[u.cls] || 1;
  const covers = (u, x, y) => x >= u.x && y >= u.y && x < u.x + sizeOf(u) && y < u.y + sizeOf(u);
  // game.js の AI_PROFILES と対応
  const AIS = [
    ['', '自動（陣営・役割から決定）'], ['aggressive', '突撃'], ['cautious', '慎重'], ['guard', '守備（攻撃できる時だけ動く）'],
    ['hold', '固守（動かない）'], ['sniper', '狙撃'], ['hunter', '弱者狙い'], ['berserk', '激昂'], ['objective', '拠点突破'],
    ['escort', '護衛（将のそば）'], ['goto', '移動（エリアへ・攻撃しない）'], ['flee', '逃走'],
  ];
  const AI_IDS = new Set(AIS.map(a => a[0]).filter(Boolean));
  const HAIRS = ['#c89040', '#503828', '#e8d070', '#b05a30', '#303848', '#8a5a3a', '#a0a0a8', '#6a4020', '#d0a060', '#404040'];

  // ------------------------------------------------------------ モデル
  // M = { id, name, desc, objective: { type, text, rounds, goal: [[x,y]] }, W, H,
  //       hgt: 数値[y][x], ter: 地形文字[y][x], gates, units, waves: [{ round, text, units }] }
  let M;

  function fromDef(def) {
    const o = typeof def.objective === 'string' ? { type: 'leader', text: def.objective } : (def.objective || {});
    const H = def.height.length, W = def.height[0].length;
    return {
      id: def.id || 'custom', name: def.name || '', desc: def.desc || '',
      objective: { type: o.type || 'annihilate', text: o.text || '', rounds: o.rounds || 6, goal: (o.goal || []).map(p => [p[0], p[1]]) },
      W, H,
      hgt: def.height.map(r => [...r].map(c => parseInt(c, 36) || 0)),
      ter: Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => def.terrain?.[y]?.[x] ?? '.')),
      gates: (def.gates || []).map(g => ({ width: 1, top: 8, door: 5, hp: 100, def: 12, ...g })),
      units: (def.units || []).map(u => ({ ...u })),
      waves: (def.reinforcements || []).map(w => ({ round: w.round, text: w.text || '', units: (w.units || []).map(u => ({ ...u })) })),
      areas: JSON.parse(JSON.stringify(def.areas || {})),
      events: JSON.parse(JSON.stringify(def.events || [])),
    };
  }

  function blank(W, H) {
    return fromDef({
      id: 'custom', name: '新しいマップ', objective: { type: 'annihilate' },
      height: Array.from({ length: H }, () => '1'.repeat(W)), units: [],
    });
  }

  const cleanUnit = u => {
    const c = u.id ? { id: u.id } : {};
    Object.assign(c, { name: u.name, cls: u.cls, team: u.team, x: u.x, y: u.y, lv: u.lv, hair: u.hair, facing: u.facing });
    if (u.leader) c.leader = true;
    if (u.ai) c.ai = u.ai;
    return c;
  };

  function defaultText() {
    const o = M.objective;
    if (o.type === 'leader') {
      const l = M.units.find(u => u.leader);
      return l ? `敵将 ${l.name}の撃破` : '敵将の撃破';
    }
    if (o.type === 'survive') return `${o.rounds} ラウンド耐える`;
    if (o.type === 'defend') return `${o.rounds} ラウンド拠点を守る`;
    return '敵の全滅';
  }

  // maps.js と同じ形式へ
  function toDef() {
    const o = M.objective, objective = { type: o.type, text: o.text || defaultText() };
    if (o.type === 'survive' || o.type === 'defend') objective.rounds = o.rounds;
    if (o.type === 'defend') objective.goal = o.goal.map(p => [p[0], p[1]]);
    const d = {
      id: M.id || 'custom', name: M.name || '無題のマップ', desc: M.desc, objective,
      height: M.hgt.map(r => r.map(h => h.toString(36)).join('')),
      terrain: M.ter.map(r => r.join('')),
    };
    if (M.gates.length) d.gates = M.gates.map(g => ({ x: g.x, y: g.y, width: g.width, top: g.top, door: g.door, hp: g.hp, def: g.def }));
    d.units = M.units.map(cleanUnit);
    if (M.waves.length) d.reinforcements = M.waves.map(w => ({ round: w.round, text: w.text, units: w.units.map(cleanUnit) }));
    const areas = Object.entries(M.areas).filter(([, cells]) => cells.length);
    if (areas.length) d.areas = Object.fromEntries(areas);
    if (M.events.length) d.events = M.events;
    return d;
  }

  function lit(v) {
    if (typeof v === 'string') return `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
    if (Array.isArray(v)) return '[' + v.map(lit).join(', ') + ']';
    if (v && typeof v === 'object') return '{ ' + Object.entries(v).map(([k, x]) => `${litKey(k)}: ${lit(x)}`).join(', ') + ' }';
    return String(v);
  }

  const litKey = k => /^[\p{L}_$][\p{L}\p{N}_$]*$/u.test(k) ? k : lit(k);

  function toCode(d) {
    const L = ['{', `  id: ${lit(d.id)},`, `  name: ${lit(d.name)},`, `  desc: ${lit(d.desc)},`, `  objective: ${lit(d.objective)},`];
    L.push('  height: [', ...d.height.map(r => `    ${lit(r)},`), '  ],');
    L.push('  terrain: [', ...d.terrain.map(r => `    ${lit(r)},`), '  ],');
    if (d.gates) L.push('  gates: [', ...d.gates.map(g => `    ${lit(g)},`), '  ],');
    L.push('  units: [', ...d.units.map(u => `    ${lit(u)},`), '  ],');
    if (d.reinforcements) {
      L.push('  reinforcements: [');
      for (const w of d.reinforcements) {
        L.push('    {', `      round: ${w.round}, text: ${lit(w.text)},`, '      units: [', ...w.units.map(u => `        ${lit(u)},`), '      ],', '    },');
      }
      L.push('  ],');
    }
    if (d.areas) L.push('  areas: {', ...Object.entries(d.areas).map(([k, v]) => `    ${litKey(k)}: ${lit(v)},`), '  },');
    if (d.events) L.push('  events: [', ...d.events.map(e => `    ${lit(e)},`), '  ],');
    L.push('},');
    return L.join('\n');
  }

  // ------------------------------------------------------------ 変更・履歴・保存
  const undo = [], redo = [];
  let lastSnap = '', saveTimer = 0;
  const snap = () => JSON.stringify(M);

  // 変更を反映（描画・チェック・保存・プレビュー送信）
  function changed(syncForm = false) {
    lastSnap = snap();
    if (syncForm) fillForm();
    draw();
    checkMap();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(STORE, JSON.stringify(toDef())); } catch {}
      postPreview();
    }, 120);
  }

  // 1 回の編集操作として履歴に積む
  function edit(fn, syncForm = false) {
    const before = lastSnap;
    fn();
    if (snap() !== before) {
      undo.push(before);
      if (undo.length > 200) undo.shift();
      redo.length = 0;
    }
    changed(syncForm);
  }

  function restore(from, to) {
    if (!from.length) return;
    to.push(lastSnap);
    M = JSON.parse(from.pop());
    changed(true);
  }

  // ------------------------------------------------------------ フォーム
  const fields = {
    mId: v => { M.id = v.trim(); }, mName: v => { M.name = v; }, mDesc: v => { M.desc = v; },
    oText: v => { M.objective.text = v; }, oRounds: v => { M.objective.rounds = clamp(+v || 1, 1, 30); },
    oType: v => { M.objective.type = v; },
  };
  for (const [id, set] of Object.entries(fields)) {
    $(id).addEventListener('change', e => edit(() => set(e.target.value), id === 'oType'));
  }

  function fillForm() {
    $('mId').value = M.id;
    $('mName').value = M.name;
    $('mDesc').value = M.desc;
    $('mW').value = M.W;
    $('mH').value = M.H;
    $('oType').value = M.objective.type;
    $('oText').value = M.objective.text;
    $('oText').placeholder = defaultText();
    $('oRounds').value = M.objective.rounds;
    $('oRoundsLabel').style.display = ['survive', 'defend'].includes(M.objective.type) ? '' : 'none';
    fillGroups();
    fillAreas();
    if (document.activeElement !== $('events')) {
      $('events').value = M.events.length ? '[\n' + M.events.map(e => '  ' + lit(e)).join(',\n') + '\n]' : '[]';
    }
  }

  $('btnResize').addEventListener('click', () => {
    const W = clamp(+$('mW').value || M.W, 4, 40), H = clamp(+$('mH').value || M.H, 4, 40);
    edit(() => {
      M.hgt = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => M.hgt[y]?.[x] ?? 0));
      M.ter = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => M.ter[y]?.[x] ?? '.'));
      M.W = W; M.H = H;
      const inside = p => p.x >= 0 && p.y >= 0 && p.x + (SIZE[p.cls] || 1) <= W && p.y + (SIZE[p.cls] || 1) <= H;
      M.units = M.units.filter(inside);
      for (const w of M.waves) w.units = w.units.filter(inside);
      M.gates = M.gates.filter(g => inside(g) && g.x + g.width <= W);
      M.objective.goal = M.objective.goal.filter(([x, y]) => x < W && y < H);
      for (const k of Object.keys(M.areas)) M.areas[k] = M.areas[k].filter(([x, y]) => x < W && y < H);
    }, true);
  });

  // テンプレート
  const TEMPLATES = window.TACTICS_MAPS || [];
  $('template').innerHTML = '<option value="-1">新規（空のマップ）</option>' +
    TEMPLATES.map((m, i) => `<option value="${i}">${m.name}</option>`).join('');
  $('btnLoadTpl').addEventListener('click', () => {
    const i = +$('template').value;
    if (!confirm('現在の編集内容を置き換えます（元に戻すで復帰できます）。よろしいですか？')) return;
    edit(() => {
      M = i < 0 ? blank(clamp(+$('mW').value || 14, 4, 40), clamp(+$('mH').value || 14, 4, 40))
        : fromDef(JSON.parse(JSON.stringify(TEMPLATES[i])));
    }, true);
  });

  // ------------------------------------------------------------ ツール
  let tool = 'height', terrainCode = 'g';

  function setTool(t) {
    tool = t;
    for (const b of document.querySelectorAll('#toolTabs button')) b.classList.toggle('on', b.dataset.tool === t);
    for (const p of document.querySelectorAll('.panel')) p.classList.toggle('on', p.dataset.panel === t);
    draw();
  }
  $('toolTabs').addEventListener('click', e => { if (e.target.dataset.tool) setTool(e.target.dataset.tool); });

  $('swatches').innerHTML = TERRAINS.map(t =>
    `<button type="button" data-code="${t.code}"><i style="background:${t.color || 'repeating-linear-gradient(45deg,#5c9c3c 0 3px,#a07848 3px 6px)'}"></i>${t.name}</button>`).join('');
  $('swatches').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    terrainCode = b.dataset.code;
    for (const x of $('swatches').children) x.classList.toggle('on', x === b);
  });
  $('swatches').querySelector('[data-code="g"]').classList.add('on');

  $('uCls').innerHTML = CLASSES.map(([id, name]) => `<option value="${id}">${name}${SIZE[id] ? `（${SIZE[id]}×${SIZE[id]} マス）` : ''}</option>`).join('');
  $('uAi').innerHTML = AIS.map(([id, name]) => `<option value="${id}">${name}</option>`).join('');

  // エリア
  let areaName = '';
  function fillAreas() {
    const names = Object.keys(M.areas);
    if (!names.includes(areaName)) areaName = names[0] || '';
    $('aSel').innerHTML = names.length
      ? names.map(n => `<option value="${n}">${n}（${M.areas[n].length}マス）</option>`).join('')
      : '<option value="">（エリアなし）</option>';
    $('aSel').value = areaName;
  }
  $('aSel').addEventListener('change', e => { areaName = e.target.value; draw(); });
  $('btnAddArea').addEventListener('click', () => {
    const n = $('aName').value.trim();
    if (!n) return;
    edit(() => { if (!M.areas[n]) M.areas[n] = []; areaName = n; }, true);
    $('aName').value = '';
  });
  $('btnDelArea').addEventListener('click', () => edit(() => { delete M.areas[areaName]; areaName = ''; }, true));

  // 配置先：-1 = 初期配置、0.. = 増援
  let group = -1;
  function fillGroups() {
    if (group >= M.waves.length) group = -1;
    $('uGroup').innerHTML = '<option value="-1">初期配置</option>' +
      M.waves.map((w, i) => `<option value="${i}">増援 ラウンド${w.round}（${w.units.length}体）</option>`).join('');
    $('uGroup').value = group;
    const w = M.waves[group];
    $('wTextLabel').style.display = $('btnDelWave').style.display = w ? '' : 'none';
    if (w) { $('wText').value = w.text; $('wRound').value = w.round; }
  }
  $('uGroup').addEventListener('change', e => { group = +e.target.value; fillGroups(); draw(); });
  $('btnAddWave').addEventListener('click', () => edit(() => {
    M.waves.push({ round: clamp(+$('wRound').value || 3, 2, 30), text: '敵の増援が現れた！', units: [] });
    M.waves.sort((a, b) => a.round - b.round);
    group = M.waves.findIndex(w => !w.units.length);
  }, true));
  $('btnDelWave').addEventListener('click', () => edit(() => { M.waves.splice(group, 1); group = -1; }, true));
  $('wText').addEventListener('change', e => edit(() => { if (M.waves[group]) M.waves[group].text = e.target.value; }));
  $('wRound').addEventListener('change', e => edit(() => {
    if (M.waves[group]) M.waves[group].round = clamp(+e.target.value || 2, 2, 30);
  }, true));
  $('uTeam').addEventListener('change', e => {
    // 陣営に合わせてクラスの初期値を変える
    if (e.target.value === 'player' && MONSTER.has($('uCls').value)) $('uCls').value = 'knight';
  });

  const unitList = () => group < 0 ? M.units : M.waves[group].units;
  const brushCells = (x, y, n) => {
    const r = n >> 1, out = [];
    for (let yy = y - r; yy <= y + r; yy++) for (let xx = x - r; xx <= x + r; xx++) {
      if (xx >= 0 && yy >= 0 && xx < M.W && yy < M.H) out.push([xx, yy]);
    }
    return out;
  };

  let stroke = new Set();
  function apply(x, y, right, pickOnly = false) {
    if (x < 0 || y < 0 || x >= M.W || y >= M.H) return;
    if (tool === 'height') {
      if (right) { $('hValue').value = M.hgt[y][x]; return; }
      const mode = document.querySelector('[name=hMode]:checked').value;
      for (const [cx, cy] of brushCells(x, y, +$('brush').value)) {
        const k = cx + ',' + cy;
        if (stroke.has(k)) continue;
        stroke.add(k);
        const h = M.hgt[cy][cx];
        M.hgt[cy][cx] = clamp(mode === 'set' ? +$('hValue').value || 0 : h + (mode === 'up' ? 1 : -1), 0, 35);
      }
    } else if (tool === 'terrain') {
      for (const [cx, cy] of brushCells(x, y, +$('brushT').value)) M.ter[cy][cx] = right ? '.' : terrainCode;
    } else if (tool === 'unit') {
      const list = unitList(), i = list.findIndex(u => covers(u, x, y));
      if (pickOnly) {
        // Shift+クリック：既存ユニットの設定をフォームへ読み取る（変更して置き直す用）
        const u = list[i];
        if (u) {
          $('uTeam').value = u.team; $('uCls').value = u.cls; $('uName').value = u.name; $('uLv').value = u.lv;
          $('uFacing').value = u.facing; $('uLeader').checked = !!u.leader; $('uAi').value = u.ai || ''; $('uId').value = u.id || '';
        }
        return;
      }
      const removed = i >= 0 ? list.splice(i, 1)[0] : null;
      if (right) return;
      const refuse = msg => { if (removed) list.splice(i, 0, removed); setStatus(msg); };
      const cls = $('uCls').value, team = $('uTeam').value, n = SIZE[cls] || 1;
      if (x + n > M.W || y + n > M.H) { refuse(`${CLS[cls].name}は ${n}×${n} マス必要です（クリックしたマスが奥の角）`); return; }
      // 1 マス 1 ユニット：別の配置先（初期配置／各増援）のユニットと重なる場所には置けない
      const cells = [...Array(n * n)].map((_, q) => [x + q % n, y + Math.floor(q / n)]);
      const groups = [['初期配置', M.units], ...M.waves.map(w => [`増援 R${w.round}`, w.units])].filter(([, l]) => l !== list);
      for (const [label, l] of groups) {
        const o = l.find(v => cells.some(([cx, cy]) => covers(v, cx, cy)));
        if (o) { refuse(`このマスには ${label} の ${o.name} がいます（1 マスに置けるのは 1 ユニットだけ）`); return; }
      }
      // 大型ユニットは占有範囲に重なるユニットを取り除く
      for (let k = list.length - 1; k >= 0; k--) {
        const o = list[k];
        if ([...Array(n * n)].some((_, q) => covers(o, x + q % n, y + Math.floor(q / n)))) list.splice(k, 1);
      }
      const leader = $('uLeader').checked && team === 'enemy';
      if (leader) for (const u of [...M.units, ...M.waves.flatMap(w => w.units)]) delete u.leader;
      const u = {
        name: $('uName').value.trim() || CLS[cls].name, cls, team, x, y,
        lv: clamp(+$('uLv').value || 4, 1, 50), hair: HAIRS[Math.floor(Math.random() * HAIRS.length)],
        facing: +$('uFacing').value,
      };
      if (leader) u.leader = true;
      if ($('uAi').value) u.ai = $('uAi').value;
      if ($('uId').value.trim()) u.id = $('uId').value.trim();
      list.push(u);
    } else if (tool === 'gate') {
      const hit = M.gates.findIndex(g => g.y === y && x >= g.x && x < g.x + g.width);
      if (right) { if (hit >= 0) M.gates.splice(hit, 1); return; }
      const w = clamp(+$('gW').value || 1, 1, 8);
      if (x + w > M.W) { setStatus('城門がマップの右端（+x）をはみ出します'); return; }
      M.gates = M.gates.filter(g => g.y !== y || g.x + g.width <= x || g.x >= x + w);
      M.gates.push({
        x, y, width: w, top: clamp(+$('gTop').value || 8, 1, 35), door: clamp(+$('gDoor').value || 5, 1, 30),
        hp: clamp(+$('gHp').value || 100, 1, 999), def: clamp(+$('gDef').value || 0, 0, 99),
      });
    } else if (tool === 'area') {
      if (!areaName) { setStatus('先にエリア名を入力して「追加」してください'); return; }
      const cells = M.areas[areaName], i = cells.findIndex(([ax, ay]) => ax === x && ay === y);
      if (right && i >= 0) cells.splice(i, 1);
      if (!right && i < 0) cells.push([x, y]);
    } else if (tool === 'goal') {
      const g = M.objective.goal, i = g.findIndex(([gx, gy]) => gx === x && gy === y);
      if (right && i >= 0) g.splice(i, 1);
      if (!right && i < 0) g.push([x, y]);
    }
  }

  // ------------------------------------------------------------ 見下ろしグリッド（ゲームと同じ向きのひし形）
  const cv = $('grid'), g2 = cv.getContext('2d');
  // マスの大きさは表示領域の幅に合わせて決める（CW: ひし形の幅、CH: 高さ）
  let CW = 36, CH = 18;
  const PAD = 12;
  let hover = null;
  const origin = () => [PAD + M.H * CW / 2, PAD];
  const cellTop = (x, y) => { const [ox, oy] = origin(); return [ox + (x - y) * CW / 2, oy + (x + y) * CH / 2]; };

  function autoColor(x, y) {
    const h = M.hgt[y][x];
    const nearWater = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => M.ter[y + dy]?.[x + dx] === 'w');
    if (h >= 5) return '#9a9aa2';
    if (h === 4) return '#9c8a70';
    if (nearWater && h === 0) return '#d8c088';
    return '#5c9c3c';
  }

  function tint(hex, f) {
    const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
    return `rgb(${c.map(v => Math.round(f >= 0 ? v + (255 - v) * f : v * (1 + f))).join(',')})`;
  }

  function diamond(x, y, inset = 0) {
    const [tx, ty] = cellTop(x, y), hw = CW / 2 - inset * 2, hh = CH / 2 - inset;
    g2.beginPath();
    g2.moveTo(tx, ty + inset);
    g2.lineTo(tx + hw, ty + CH / 2);
    g2.lineTo(tx, ty + CH - inset);
    g2.lineTo(tx - hw, ty + CH / 2);
    g2.closePath();
    return hh;
  }

  function drawUnit(u, solid, label) {
    const n = sizeOf(u);
    // 大型ユニットは占有範囲を大きなひし形で示し、印はその中央に置く
    const [tx, ty] = cellTop(u.x + (n - 1) / 2, u.y + (n - 1) / 2), cx = tx, cy = ty + CH / 2;
    const col = MONSTER.has(u.cls) ? '#4e8a36' : u.team === 'player' ? '#3c64d0' : '#c43c34';
    g2.globalAlpha = solid ? 1 : 0.4;
    if (n > 1) {
      const [ax, ay] = cellTop(u.x, u.y), [bx, by] = cellTop(u.x + n, u.y), [cx2, cy2] = cellTop(u.x + n, u.y + n), [dx, dy] = cellTop(u.x, u.y + n);
      g2.beginPath();
      g2.moveTo(ax, ay); g2.lineTo(bx, by); g2.lineTo(cx2, cy2); g2.lineTo(dx, dy); g2.closePath();
      g2.fillStyle = 'rgba(80,110,60,.35)';
      g2.fill();
      g2.strokeStyle = col;
      g2.lineWidth = 2;
      g2.stroke();
    }
    const r = CH * 0.4 * (n > 1 ? 2 : 1);
    g2.beginPath();
    g2.arc(cx, cy, r, 0, Math.PI * 2);
    if (label) {
      g2.setLineDash([2, 2]);
      g2.strokeStyle = col;
      g2.lineWidth = 2;
      g2.stroke();
      g2.setLineDash([]);
    } else {
      g2.fillStyle = col;
      g2.fill();
      g2.strokeStyle = u.leader ? '#ffd040' : '#000';
      g2.lineWidth = u.leader ? 2 : 1;
      g2.stroke();
    }
    g2.fillStyle = label ? col : '#fff';
    g2.font = `${Math.round(r * 1.3)}px sans-serif`;
    g2.textAlign = 'center';
    g2.textBaseline = 'middle';
    g2.fillText(CLS[u.cls]?.mark || '?', cx, cy + 0.5);
    if (label) { g2.font = `${Math.round(r)}px sans-serif`; g2.fillText(label, cx, cy - r - 5); }
    g2.globalAlpha = 1;
  }

  function draw() {
    const avail = $('gridWrap').clientWidth - 18;
    CW = clamp(Math.floor((avail - PAD * 2) / ((M.W + M.H) / 2) / 2 * +$('zoom').value) * 2, 24, 128);
    CH = CW / 2;
    const w = (M.W + M.H) * CW / 2 + PAD * 2, h = (M.W + M.H) * CH / 2 + PAD * 2, dpr = window.devicePixelRatio || 1;
    cv.width = w * dpr;
    cv.height = h * dpr;
    cv.style.width = w + 'px';
    cv.style.height = h + 'px';
    g2.setTransform(dpr, 0, 0, dpr, 0, 0);
    g2.clearRect(0, 0, w, h);
    const fs = Math.max(9, Math.round(CW * 0.28));
    for (let y = 0; y < M.H; y++) {
      for (let x = 0; x < M.W; x++) {
        const h = M.hgt[y][x], code = M.ter[y][x];
        const base = TCOL[code] || autoColor(x, y);
        diamond(x, y);
        g2.fillStyle = tint(base, Math.min(0.5, h * 0.045) - 0.1);
        g2.fill();
        g2.strokeStyle = 'rgba(0,0,0,.45)';
        g2.lineWidth = 1;
        g2.stroke();
        const [tx, ty] = cellTop(x, y);
        g2.fillStyle = h >= 7 ? '#000' : 'rgba(255,255,255,.9)';
        g2.font = `${fs}px sans-serif`;
        g2.textAlign = 'center';
        g2.textBaseline = 'middle';
        if (code === '.') g2.fillStyle = h >= 7 ? '#333' : 'rgba(255,255,255,.65)';
        g2.fillText(h.toString(36), tx, ty + CH / 2 + 0.5);
      }
    }
    // エリア（選択中は濃く）
    for (const [name, cells] of Object.entries(M.areas)) {
      const on = tool === 'area' && name === areaName;
      for (const [x, y] of cells) {
        diamond(x, y, 3);
        g2.setLineDash([3, 2]);
        g2.strokeStyle = on ? '#40e8ff' : 'rgba(64,232,255,.5)';
        g2.lineWidth = 2;
        g2.stroke();
        g2.setLineDash([]);
      }
    }
    // 防衛マス
    for (const [x, y] of M.objective.goal) {
      diamond(x, y, 2);
      g2.strokeStyle = '#60f090';
      g2.lineWidth = 2;
      g2.stroke();
    }
    // 城門
    for (const gt of M.gates) {
      for (let i = 0; i < gt.width; i++) {
        diamond(gt.x + i, gt.y, 1);
        g2.fillStyle = 'rgba(90,58,32,.85)';
        g2.fill();
        g2.strokeStyle = '#ffcf70';
        g2.lineWidth = 1.5;
        g2.stroke();
        const [tx, ty] = cellTop(gt.x + i, gt.y);
        g2.fillStyle = '#ffe9b0';
        g2.font = `${fs}px sans-serif`;
        g2.fillText(i === 0 ? '門' : '', tx, ty + CH / 2);
      }
    }
    // ユニット（選択中の配置先は濃く、それ以外は薄く。増援は点線）
    for (const u of M.units) drawUnit(u, group < 0 || tool !== 'unit', null);
    M.waves.forEach((w, i) => { for (const u of w.units) drawUnit(u, group === i || tool !== 'unit', 'R' + w.round); });
    if (hover) {
      diamond(hover[0], hover[1]);
      g2.strokeStyle = '#ffe070';
      g2.lineWidth = 2;
      g2.stroke();
    }
  }

  function cellAt(e) {
    const r = cv.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    const [ox, oy] = origin();
    const a = (px - ox) / (CW / 2), b = (py - oy) / (CH / 2);
    const x = Math.floor((a + b) / 2), y = Math.floor((b - a) / 2);
    return x >= 0 && y >= 0 && x < M.W && y < M.H ? [x, y] : null;
  }

  function setStatus(msg) { $('status').textContent = msg; }
  function describe([x, y]) {
    const code = M.ter[y][x];
    const units = [...M.units.filter(u => covers(u, x, y)).map(u => `${u.name}`),
      ...M.waves.flatMap(w => w.units.filter(u => covers(u, x, y)).map(u => `${u.name}(R${w.round})`))];
    const areas = Object.entries(M.areas).filter(([, c]) => c.some(([ax, ay]) => ax === x && ay === y)).map(([n]) => n);
    return `(${x}, ${y})　高さ ${M.hgt[y][x]}　地形 ${TNAME[code] || code}${units.length ? '　' + units.join(', ') : ''}${areas.length ? '　エリア: ' + areas.join(', ') : ''}`;
  }

  let painting = false, strokeBase = '';
  const dragTools = new Set(['height', 'terrain', 'goal', 'area']);
  function beginStroke() { strokeBase = lastSnap; stroke = new Set(); }
  function endStroke() {
    if (lastSnap !== strokeBase) { undo.push(strokeBase); redo.length = 0; }
    painting = false;
  }

  cv.addEventListener('pointerdown', e => {
    const c = cellAt(e);
    if (!c) return;
    e.preventDefault();
    cv.setPointerCapture(e.pointerId);
    beginStroke();
    painting = { right: e.button === 2 };
    apply(c[0], c[1], painting.right, e.shiftKey);
    changed(tool === 'unit' || tool === 'gate');
  });
  cv.addEventListener('pointermove', e => {
    const c = cellAt(e);
    if (String(c) !== String(hover)) {
      hover = c;
      if (c) setStatus(describe(c));
      if (painting && c && dragTools.has(tool)) { apply(c[0], c[1], painting.right); changed(); } else draw();
    }
  });
  cv.addEventListener('pointerup', () => { if (painting) endStroke(); });
  cv.addEventListener('pointerleave', () => { hover = null; draw(); });
  cv.addEventListener('contextmenu', e => e.preventDefault());

  // ------------------------------------------------------------ チェック
  function checkMap() {
    const msgs = [];
    const all = [...M.units, ...M.waves.flatMap(w => w.units)];
    const players = M.units.filter(u => u.team === 'player');
    if (!players.length) msgs.push('味方ユニット（初期配置）がいません');
    if (!all.some(u => u.team === 'enemy')) msgs.push('敵ユニットがいません');
    if (M.objective.type === 'leader' && !M.units.some(u => u.leader)) msgs.push('勝利条件「敵将撃破」ですが、初期配置に敵将がいません');
    if (M.objective.type === 'defend' && !M.objective.goal.length) msgs.push('勝利条件「拠点防衛」ですが、防衛マスがありません');
    const gateCell = (x, y) => M.gates.some(g => g.y === y && x >= g.x && x < g.x + g.width);
    const cellsOf = u => [...Array(sizeOf(u) ** 2)].map((_, q) => [u.x + q % sizeOf(u), u.y + Math.floor(q / sizeOf(u))]);
    const occ = new Map(), dup = new Set();
    for (const u of all) for (const [x, y] of cellsOf(u)) {
      const k = x + ',' + y;
      if (occ.has(k)) dup.add(`${occ.get(k)}と${u.name}(${x},${y})`);
      else occ.set(k, u.name);
    }
    if (dup.size) msgs.push(`同じマスに複数のユニットがいます: ${[...dup].join(', ')}`);
    const bad = all.filter(u => cellsOf(u).some(([x, y]) => M.ter[y]?.[x] === 'w' || gateCell(x, y)));
    const rough = all.filter(u => sizeOf(u) > 1).filter(u => {
      const hs = cellsOf(u).map(([x, y]) => M.hgt[y]?.[x] ?? 0);
      return Math.max(...hs) - Math.min(...hs) > 3;
    });
    if (rough.length) msgs.push(`大型ユニットの足場の起伏が 3 段を超えています（動けません）: ${rough.map(u => u.name).join(', ')}`);
    if (bad.length) msgs.push(`水上・城門の上にいるユニット: ${bad.map(u => `${u.name}(${u.x},${u.y})`).join(', ')}`);
    for (const g of M.gates) {
      if (g.top <= M.hgt[g.y][g.x] + g.door) msgs.push(`城門(${g.x},${g.y}) の門楼の高さが扉より低くなっています`);
    }
    // イベントの参照先（ユニット・エリア・思考ルーチン）の確認
    const known = new Set(all.flatMap(u => [u.id, u.name]).filter(Boolean));
    for (const ev of M.events) for (const a of ev.do || []) if (a.type === 'reinforce') for (const u of a.units || []) { known.add(u.id); known.add(u.name); }
    const refs = new Set(), areaRefs = new Set(), aiRefs = new Set();
    const walkCond = c => { if (!c) return; if (c.unit) refs.add(c.unit); if (typeof c.area === 'string') areaRefs.add(c.area); (c.of || []).forEach(walkCond); };
    M.events.forEach((ev, i) => {
      if (!ev.when || !Array.isArray(ev.do)) msgs.push(`イベント${i + 1}: when と do が必要です`);
      walkCond(ev.when);
      for (const a of ev.do || []) {
        if (a.target) refs.add(a.target);
        [].concat(a.except || []).forEach(x => refs.add(x));
        if (typeof a.area === 'string') areaRefs.add(a.area);
        if (a.ai) aiRefs.add(a.ai);
      }
    });
    const missing = [...refs].filter(r => r[0] !== '@' && !known.has(r));
    if (missing.length) msgs.push(`イベントが参照するユニットが見つかりません: ${missing.join(', ')}`);
    const noArea = [...areaRefs].filter(a => !M.areas[a]?.length);
    if (noArea.length) msgs.push(`イベントが参照するエリアがありません: ${noArea.join(', ')}`);
    const badAi = [...aiRefs, ...all.map(u => u.ai).filter(Boolean)].filter(a => !AI_IDS.has(a));
    if (badAi.length) msgs.push(`不明な思考ルーチン: ${[...new Set(badAi)].join(', ')}`);
    $('warnings').innerHTML = msgs.length
      ? msgs.map(m => `<li class="ng">⚠ ${m}</li>`).join('')
      : '<li class="ok">✓ 問題なし。テストプレイできます</li>';
  }

  // ------------------------------------------------------------ プレビュー（ゲーム本体を埋め込み）
  const frame = $('preview');
  let previewReady = false;
  function postPreview() {
    if (previewReady) frame.contentWindow.postMessage({ type: 'tactics-map', map: toDef() }, '*');
  }
  addEventListener('message', e => {
    if (e.source !== frame.contentWindow) return;
    if (e.data?.type === 'tactics-preview-ready') {
      previewReady = true;
      postPreview();
    } else if (e.data?.type === 'tactics-pick') {
      beginStroke();
      apply(e.data.x, e.data.y, false);
      changed(true);
      endStroke();
      setStatus(describe([e.data.x, e.data.y]));
    }
  });

  // ------------------------------------------------------------ イベント欄
  // JSON か maps.js と同じ JS オブジェクト表記を受け付ける（自分のブラウザ内でのみ評価する）
  function parseLoose(text) {
    text = text.trim().replace(/[,;]\s*$/, '');
    try { return JSON.parse(text); } catch {}
    return new Function(`return (${text});`)();
  }
  $('events').addEventListener('change', () => {
    let evs;
    try {
      evs = parseLoose($('events').value || '[]');
      if (!Array.isArray(evs)) throw new Error('配列 [ … ] で書いてください');
    } catch (err) {
      $('eventsErr').textContent = '読み取れません: ' + err.message;
      return;
    }
    $('eventsErr').textContent = '';
    edit(() => { M.events = evs; });
  });

  // 例の挿入。敵将（なければ最初の敵）を対象にする
  const EXAMPLES = {
    flee: (ref, area) => [
      { when: { type: 'enemyNear', unit: ref, value: 4 }, do: [
        { type: 'message', text: `${ref}「退却だ！」` }, { type: 'setAi', target: ref, ai: 'goto', area }] },
      { when: { type: 'reach', unit: ref, area }, do: [
        { type: 'escape', target: ref, text: `${ref}は逃げ去った…` }, { type: 'lose', text: '敵将に逃げられた…' }] },
    ],
    rage: ref => [
      { when: { type: 'defeated', unit: ref }, do: [
        { type: 'message', text: `「${ref}の仇だ！」 敵兵が激昂した！` },
        { type: 'setAi', target: '@enemy', ai: 'berserk' },
        { type: 'buff', target: '@enemy', atk: 8, agi: 3, move: 1, label: '激昂' }] },
    ],
    wave: () => [
      { when: { type: 'round', value: 3 }, do: [
        { type: 'reinforce', text: '敵の援軍が現れた！', units: [
          { name: 'ソルジャー', cls: 'soldier', team: 'enemy', x: 0, y: 0, lv: 4, hair: '#404040', facing: 1, ai: 'aggressive' }] }] },
    ],
  };
  document.querySelectorAll('[data-example]').forEach(b => b.addEventListener('click', () => {
    const lead = M.units.find(u => u.leader) || M.units.find(u => u.team === 'enemy');
    const ref = lead ? lead.id || lead.name : '敵将の名前';
    let area = Object.keys(M.areas)[0];
    edit(() => {
      if (b.dataset.example === 'flee' && !area) { area = 'exit'; M.areas.exit = []; }
      M.events.push(...EXAMPLES[b.dataset.example](ref, area));
    }, true);
    if (b.dataset.example === 'flee' && !M.areas[area].length) setStatus(`エリア「${area}」を作りました。「エリア」ツールで逃げ先のマスを塗ってください`);
  }));

  // ------------------------------------------------------------ 書き出し・テストプレイ・履歴
  $('btnPlay').addEventListener('click', () => {
    try { localStorage.setItem(STORE, JSON.stringify(toDef())); } catch {}
    window.open('index.html?map=custom', '_blank');
  });
  $('btnExport').addEventListener('click', () => {
    $('exportText').value = toCode(toDef());
    $('exportDlg').showModal();
  });
  $('btnCloseDlg').addEventListener('click', () => $('exportDlg').close());
  $('btnCopy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('exportText').value); $('btnCopy').textContent = 'コピーしました'; } catch {
      $('exportText').select();
      document.execCommand('copy');
    }
    setTimeout(() => { $('btnCopy').textContent = 'コピー'; }, 1500);
  });
  // JSON か、書き出したのと同じ JS オブジェクト表記を読み込む（自分のブラウザ内でのみ評価する）
  $('btnImport').addEventListener('click', () => {
    const text = $('exportText').value.trim().replace(/[,;]\s*$/, '');
    let obj;
    try { obj = JSON.parse(text); } catch {
      try { obj = new Function(`return (${text});`)(); } catch (err) { alert('読み込めませんでした: ' + err.message); return; }
    }
    if (Array.isArray(obj)) obj = obj[0];
    if (!obj || !Array.isArray(obj.height) || !obj.height.length) { alert('height を持つマップ定義ではありません'); return; }
    edit(() => { M = fromDef(obj); }, true);
    $('exportDlg').close();
  });

  $('btnUndo').addEventListener('click', () => restore(undo, redo));
  $('btnRedo').addEventListener('click', () => restore(redo, undo));
  addEventListener('keydown', e => {
    const typing = /INPUT|TEXTAREA|SELECT/.test(e.target.tagName);
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) {
      e.preventDefault();
      if (e.shiftKey) restore(redo, undo); else restore(undo, redo);
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y' && !typing) {
      e.preventDefault();
      restore(redo, undo);
    } else if (!typing && /^[0-9]$/.test(e.key)) {
      $('hValue').value = e.key;
      document.querySelector('[name=hMode][value=set]').checked = true;
      setTool('height');
    }
  });

  // ------------------------------------------------------------ 開始
  try {
    const saved = JSON.parse(localStorage.getItem(STORE));
    if (saved) M = fromDef(saved);
  } catch {}
  if (!M) M = TEMPLATES[0] ? fromDef(JSON.parse(JSON.stringify(TEMPLATES[0]))) : blank(14, 14);
  setTool('height');
  changed(true);
  addEventListener('resize', () => draw());
  $('zoom').addEventListener('input', () => draw());
})();
