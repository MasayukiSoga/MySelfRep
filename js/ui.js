const PROVINCE_RADIUS = 26;
const BATTLE_CELL = 60;

function getMapCanvas() {
  return document.getElementById('map-canvas');
}
function getBattleCanvas() {
  return document.getElementById('battle-canvas');
}

function hitTestProvince(state, px, py) {
  for (const prov of Object.values(state.provinces)) {
    const dx = px - prov.x;
    const dy = py - prov.y;
    if (dx * dx + dy * dy <= PROVINCE_RADIUS * PROVINCE_RADIUS) return prov.id;
  }
  return null;
}

function cellFromPixel(px, py) {
  const col = Math.floor(px / BATTLE_CELL);
  const row = Math.floor(py / BATTLE_CELL);
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return null;
  return { col, row };
}

function drawMap(state) {
  const canvas = getMapCanvas();
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = '#345036';
  ctx.lineWidth = 2;
  const drawn = new Set();
  for (const prov of Object.values(state.provinces)) {
    for (const nId of prov.neighbors) {
      const key = [prov.id, nId].sort().join('-');
      if (drawn.has(key)) continue;
      drawn.add(key);
      const n = getProvince(state, nId);
      ctx.beginPath();
      ctx.moveTo(prov.x, prov.y);
      ctx.lineTo(n.x, n.y);
      ctx.stroke();
    }
  }

  const attackTargets = getValidAttackTargets(state);
  const transferTargets = getValidTransferTargets(state);

  for (const prov of Object.values(state.provinces)) {
    const owner = getDaimyo(state, prov.ownerId);
    ctx.beginPath();
    ctx.arc(prov.x, prov.y, PROVINCE_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = owner.color;
    ctx.fill();

    if (prov.id === state.selectedProvinceId) {
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#ffe08a';
      ctx.stroke();
    } else if (attackTargets.has(prov.id)) {
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#e05050';
      ctx.stroke();
    } else if (transferTargets.has(prov.id)) {
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#7ad17a';
      ctx.stroke();
    } else {
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#0f1a10';
      ctx.stroke();
    }

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(prov.name, prov.x, prov.y + 4);

    ctx.fillStyle = '#d8d8d8';
    ctx.font = '10px sans-serif';
    ctx.fillText(String(prov.troops), prov.x, prov.y + PROVINCE_RADIUS + 12);
  }
}

function getValidAttackTargets(state) {
  const set = new Set();
  if (state.pendingAttackFrom) {
    const prov = getProvince(state, state.pendingAttackFrom);
    for (const nId of prov.neighbors) {
      const n = getProvince(state, nId);
      if (n.ownerId !== prov.ownerId) set.add(nId);
    }
  }
  return set;
}

function getValidTransferTargets(state) {
  const set = new Set();
  const pending = state.pendingTransfer;
  if (pending && pending.generalId) {
    const prov = getProvince(state, pending.fromId);
    for (const nId of prov.neighbors) {
      if (getProvince(state, nId).ownerId === prov.ownerId) set.add(nId);
    }
  }
  return set;
}

function renderTopBar(state) {
  const player = getDaimyo(state, state.playerDaimyoId);
  document.getElementById('turn-display').textContent = `第${state.turn}ターン`;
  document.getElementById('daimyo-display').textContent = player.name;
  document.getElementById('gold-display').textContent = `資金: ${player.gold}`;
}

function renderSidePanel(state) {
  const infoDiv = document.getElementById('province-info');
  const sel = state.selectedProvinceId ? getProvince(state, state.selectedProvinceId) : null;

  if (!sel) {
    infoDiv.innerHTML = '<h2>国情報</h2><p>国を選択してください</p>';
  } else {
    const owner = getDaimyo(state, sel.ownerId);
    const cap = maxTroops(sel);
    const garrison = generalsIn(state, sel.id);
    const picking = state.pendingTransfer && state.pendingTransfer.fromId === sel.id;
    const roster = garrison.length
      ? garrison.map(g => `
          <li${picking ? ` class="pickable" data-general="${g.id}"` : ''}>
            <span class="general-name">${g.lord ? '【当主】' : ''}${g.name}</span>
            <span class="general-stats">統${g.lead} 武${g.valor} 政${g.politics}</span>
          </li>`).join('')
      : '<li class="general-none">武将がいません</li>';

    infoDiv.innerHTML = `
      <h2>国情報</h2>
      <p><span class="stat-label">国名:</span> ${sel.name}</p>
      <p><span class="stat-label">領主:</span> ${owner.name}</p>
      <p><span class="stat-label">石高:</span> ${sel.kokudaka}</p>
      <p><span class="stat-label">兵力:</span> ${sel.troops} / ${cap}</p>
      <p><span class="stat-label">地形:</span> ${TERRAIN[sel.terrain].name}</p>
      <ul class="general-list">${roster}</ul>
    `;
  }

  const isMine = sel && sel.ownerId === state.playerDaimyoId;
  const alreadyActed = sel && state.actedProvinces.has(sel.id);
  const choosingTarget = !!state.pendingAttackFrom;
  const transferring = !!state.pendingTransfer;
  const busy = choosingTarget || transferring;
  const hasFriendlyNeighbor = isMine && sel.neighbors.some(n => getProvince(state, n).ownerId === sel.ownerId);

  document.getElementById('cmd-develop').disabled = !isMine || alreadyActed || busy;
  document.getElementById('cmd-recruit').disabled = !isMine || alreadyActed || busy;
  document.getElementById('cmd-attack').disabled = !isMine || alreadyActed || busy || sel.troops < 100;
  document.getElementById('cmd-transfer').disabled = !isMine || alreadyActed || busy
    || !hasFriendlyNeighbor || generalsIn(state, sel.id).length === 0;
  document.getElementById('cmd-cancel').disabled = !state.selectedProvinceId && !busy;

  const legend = document.getElementById('map-legend');
  if (choosingTarget) {
    legend.textContent = '出陣先の敵国（赤枠）をクリックしてください。';
  } else if (transferring && !state.pendingTransfer.generalId) {
    legend.textContent = '移動させる武将を右の一覧から選んでください。';
  } else if (transferring) {
    legend.textContent = '武将を送る自国（緑枠）をクリックしてください。';
  } else {
    legend.textContent = '国をクリックして選択し、コマンドを実行してください。';
  }
}

function renderLog(state) {
  const list = document.getElementById('log-list');
  list.innerHTML = state.log.slice(0, 60).map(line => `<li>${line}</li>`).join('');
}

function renderAll(state) {
  renderTopBar(state);
  drawMap(state);
  renderSidePanel(state);
  renderLog(state);
}

// ---- Battle rendering ----

function showBattleOverlay() {
  document.getElementById('battle-overlay').classList.remove('hidden');
}
function hideBattleOverlay() {
  document.getElementById('battle-overlay').classList.add('hidden');
}

function drawBattle(state, battle) {
  const canvas = getBattleCanvas();
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  drawTerrain(ctx, battle);

  if (battle.selectedSquadId) {
    highlightCells(ctx, battle.highlightCells || []);
  }

  ctx.strokeStyle = '#44583a';
  ctx.lineWidth = 1;
  for (let c = 0; c <= COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BATTLE_CELL, 0);
    ctx.lineTo(c * BATTLE_CELL, ROWS * BATTLE_CELL);
    ctx.stroke();
  }
  for (let r = 0; r <= ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BATTLE_CELL);
    ctx.lineTo(COLS * BATTLE_CELL, r * BATTLE_CELL);
    ctx.stroke();
  }

  const attackerDaimyo = getDaimyo(state, battle.attackerDaimyoId);
  const defenderDaimyo = getDaimyo(state, battle.defenderDaimyoId);

  drawSquads(ctx, battle.attacker.squads, attackerDaimyo.color, battle.selectedSquadId);
  drawSquads(ctx, battle.defender.squads, defenderDaimyo.color, battle.selectedSquadId);
}

function drawTerrain(ctx, battle) {
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const key = battle.terrain[row][col];
      const terrain = TERRAIN[key];
      const x = col * BATTLE_CELL;
      const y = row * BATTLE_CELL;
      ctx.fillStyle = terrain.color;
      ctx.fillRect(x, y, BATTLE_CELL, BATTLE_CELL);
      drawTerrainMark(ctx, key, x, y);
    }
  }
}

function drawTerrainMark(ctx, key, x, y) {
  const cx = x + BATTLE_CELL / 2;
  const cy = y + BATTLE_CELL / 2;

  if (key === 'forest') {
    ctx.fillStyle = '#4a7a3a';
    for (const [ox, oy] of [[-12, 6], [6, 10], [-2, -8]]) {
      ctx.beginPath();
      ctx.moveTo(cx + ox, cy + oy - 9);
      ctx.lineTo(cx + ox - 7, cy + oy + 5);
      ctx.lineTo(cx + ox + 7, cy + oy + 5);
      ctx.closePath();
      ctx.fill();
    }
  } else if (key === 'mountain') {
    ctx.fillStyle = '#7b776e';
    ctx.beginPath();
    ctx.moveTo(cx, cy - 16);
    ctx.lineTo(cx - 19, cy + 15);
    ctx.lineTo(cx + 19, cy + 15);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#cfcbc2';
    ctx.beginPath();
    ctx.moveTo(cx, cy - 16);
    ctx.lineTo(cx - 7, cy - 4);
    ctx.lineTo(cx + 7, cy - 4);
    ctx.closePath();
    ctx.fill();
  } else if (key === 'hill') {
    ctx.strokeStyle = '#8f7947';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy + 10, 17, Math.PI, 0);
    ctx.stroke();
  } else if (key === 'river') {
    ctx.strokeStyle = '#4c7fa8';
    ctx.lineWidth = 3;
    for (const oy of [-8, 4]) {
      ctx.beginPath();
      ctx.moveTo(cx - 20, cy + oy);
      ctx.quadraticCurveTo(cx - 10, cy + oy - 6, cx, cy + oy);
      ctx.quadraticCurveTo(cx + 10, cy + oy + 6, cx + 20, cy + oy);
      ctx.stroke();
    }
  }
}

function renderBattleLegend() {
  const legend = document.getElementById('battle-legend');
  legend.innerHTML = Object.values(TERRAIN).map(t => `
    <span class="terrain-chip">
      <i style="background:${t.color}"></i>${t.name}<small>${terrainEffectText(t)}</small>
    </span>
  `).join('');
}

function highlightCells(ctx, cells) {
  ctx.fillStyle = 'rgba(255, 224, 138, 0.3)';
  ctx.strokeStyle = 'rgba(255, 224, 138, 0.8)';
  ctx.lineWidth = 2;
  for (const c of cells) {
    const x = c.col * BATTLE_CELL + 2;
    const y = c.row * BATTLE_CELL + 2;
    ctx.fillRect(x, y, BATTLE_CELL - 4, BATTLE_CELL - 4);
    ctx.strokeRect(x, y, BATTLE_CELL - 4, BATTLE_CELL - 4);
  }
}

function drawSquadName(ctx, squad, x, y) {
  if (!squad.general) return;
  const label = squad.general.name;
  ctx.font = '9px sans-serif';
  ctx.textAlign = 'center';
  const width = ctx.measureText(label).width + 6;
  ctx.fillStyle = 'rgba(12, 16, 12, 0.75)';
  ctx.fillRect(x - width / 2, y - 9, width, 12);
  ctx.fillStyle = '#ffe9b0';
  ctx.fillText(label, x, y);
}

function drawSquads(ctx, squads, color, selectedId) {
  for (const sq of squads) {
    if (sq.troops <= 0) continue;
    const cx = sq.col * BATTLE_CELL + BATTLE_CELL / 2;
    const cy = sq.row * BATTLE_CELL + BATTLE_CELL / 2 + 5;
    ctx.beginPath();
    ctx.arc(cx, cy, 19, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = sq.id === selectedId ? 4 : 1.5;
    ctx.strokeStyle = sq.id === selectedId ? '#ffe08a' : (sq.acted ? '#555' : '#fff');
    ctx.stroke();

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(String(sq.troops), cx, cy + 4);
    drawSquadName(ctx, sq, cx, sq.row * BATTLE_CELL + 12);
  }
}

function setBattleStatus(text) {
  document.getElementById('battle-status').textContent = text;
}
function setBattleTitle(text) {
  document.getElementById('battle-title').textContent = text;
}
function setBattleRoundInfo(text) {
  document.getElementById('battle-turn-info').textContent = text;
}

function showGameOverOverlay(result) {
  document.getElementById('game-over-title').textContent = result.victory ? '勝利' : '敗北';
  document.getElementById('game-over-text').textContent = result.text;
  document.getElementById('game-over-overlay').classList.remove('hidden');
}
function hideGameOverOverlay() {
  document.getElementById('game-over-overlay').classList.add('hidden');
}
