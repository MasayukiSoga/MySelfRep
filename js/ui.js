import { getProvince, getDaimyo, maxTroops } from './state.js';
import { COLS, ROWS } from './battle.js';

const PROVINCE_RADIUS = 26;
const BATTLE_CELL = 60;

export function getMapCanvas() {
  return document.getElementById('map-canvas');
}
export function getBattleCanvas() {
  return document.getElementById('battle-canvas');
}

export function hitTestProvince(state, px, py) {
  for (const prov of Object.values(state.provinces)) {
    const dx = px - prov.x;
    const dy = py - prov.y;
    if (dx * dx + dy * dy <= PROVINCE_RADIUS * PROVINCE_RADIUS) return prov.id;
  }
  return null;
}

export function cellFromPixel(px, py) {
  const col = Math.floor(px / BATTLE_CELL);
  const row = Math.floor(py / BATTLE_CELL);
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return null;
  return { col, row };
}

export function drawMap(state) {
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

export function getValidAttackTargets(state) {
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

export function renderTopBar(state) {
  const player = getDaimyo(state, state.playerDaimyoId);
  document.getElementById('turn-display').textContent = `第${state.turn}ターン`;
  document.getElementById('daimyo-display').textContent = player.name;
  document.getElementById('gold-display').textContent = `資金: ${player.gold}`;
}

export function renderSidePanel(state) {
  const infoDiv = document.getElementById('province-info');
  const sel = state.selectedProvinceId ? getProvince(state, state.selectedProvinceId) : null;

  if (!sel) {
    infoDiv.innerHTML = '<h2>国情報</h2><p>国を選択してください</p>';
  } else {
    const owner = getDaimyo(state, sel.ownerId);
    const cap = maxTroops(sel);
    infoDiv.innerHTML = `
      <h2>国情報</h2>
      <p><span class="stat-label">国名:</span> ${sel.name}</p>
      <p><span class="stat-label">領主:</span> ${owner.name}</p>
      <p><span class="stat-label">石高:</span> ${sel.kokudaka}</p>
      <p><span class="stat-label">兵力:</span> ${sel.troops} / ${cap}</p>
    `;
  }

  const isMine = sel && sel.ownerId === state.playerDaimyoId;
  const alreadyActed = sel && state.actedProvinces.has(sel.id);
  const choosingTarget = !!state.pendingAttackFrom;

  document.getElementById('cmd-develop').disabled = !isMine || alreadyActed || choosingTarget;
  document.getElementById('cmd-recruit').disabled = !isMine || alreadyActed || choosingTarget;
  document.getElementById('cmd-attack').disabled = !isMine || alreadyActed || choosingTarget || sel.troops < 100;
  document.getElementById('cmd-cancel').disabled = !state.selectedProvinceId && !choosingTarget;

  const legend = document.getElementById('map-legend');
  if (choosingTarget) {
    legend.textContent = '出陣先の敵国（赤枠）をクリックしてください。';
  } else {
    legend.textContent = '国をクリックして選択し、コマンドを実行してください。';
  }
}

export function renderLog(state) {
  const list = document.getElementById('log-list');
  list.innerHTML = state.log.slice(0, 60).map(line => `<li>${line}</li>`).join('');
}

export function renderAll(state) {
  renderTopBar(state);
  drawMap(state);
  renderSidePanel(state);
  renderLog(state);
}

// ---- Battle rendering ----

export function showBattleOverlay() {
  document.getElementById('battle-overlay').classList.remove('hidden');
}
export function hideBattleOverlay() {
  document.getElementById('battle-overlay').classList.add('hidden');
}

export function drawBattle(state, battle) {
  const canvas = getBattleCanvas();
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

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

  if (battle.selectedSquadId) {
    const found = [...battle.attacker.squads, ...battle.defender.squads].find(s => s.id === battle.selectedSquadId);
    if (found) {
      highlightCells(ctx, battle.highlightCells || []);
    }
  }
}

function highlightCells(ctx, cells) {
  ctx.fillStyle = 'rgba(255, 224, 138, 0.35)';
  for (const c of cells) {
    ctx.fillRect(c.col * BATTLE_CELL + 2, c.row * BATTLE_CELL + 2, BATTLE_CELL - 4, BATTLE_CELL - 4);
  }
}

function drawSquads(ctx, squads, color, selectedId) {
  for (const sq of squads) {
    if (sq.troops <= 0) continue;
    const cx = sq.col * BATTLE_CELL + BATTLE_CELL / 2;
    const cy = sq.row * BATTLE_CELL + BATTLE_CELL / 2;
    ctx.beginPath();
    ctx.arc(cx, cy, 22, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = sq.id === selectedId ? 4 : 1.5;
    ctx.strokeStyle = sq.id === selectedId ? '#ffe08a' : (sq.acted ? '#555' : '#fff');
    ctx.stroke();

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(String(sq.troops), cx, cy + 4);
  }
}

export function setBattleStatus(text) {
  document.getElementById('battle-status').textContent = text;
}
export function setBattleTitle(text) {
  document.getElementById('battle-title').textContent = text;
}
export function setBattleRoundInfo(text) {
  document.getElementById('battle-turn-info').textContent = text;
}

export function showGameOverOverlay(result) {
  document.getElementById('game-over-title').textContent = result.victory ? '勝利' : '敗北';
  document.getElementById('game-over-text').textContent = result.text;
  document.getElementById('game-over-overlay').classList.remove('hidden');
}
export function hideGameOverOverlay() {
  document.getElementById('game-over-overlay').classList.add('hidden');
}
