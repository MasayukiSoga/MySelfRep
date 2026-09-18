let state = createInitialState();

function drawBattleUI() {
  if (state.battle) drawBattle(state, state.battle);
}

function toCanvasCoords(canvas, evt) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (evt.clientX - rect.left) * (canvas.width / rect.width),
    y: (evt.clientY - rect.top) * (canvas.height / rect.height),
  };
}

// ---- Strategic map interaction ----

function launchPlayerAttack(fromId, toId) {
  const prov = getProvince(state, fromId);
  const sentTroops = Math.round(prov.troops * 0.7);
  if (sentTroops < 50) {
    addLog(state, `${prov.name}: 出陣するには兵力が不足しています。`);
    state.pendingAttackFrom = null;
    renderAll(state);
    return;
  }
  prov.troops -= sentTroops;
  state.actedProvinces.add(fromId);
  state.pendingAttackFrom = null;
  state.selectedProvinceId = null;
  const marching = marchingGeneralsFrom(state, fromId);
  const led = marching.length ? `${marching[0].name}率いる軍が` : '';
  addLog(state, `${led}${prov.name}から${getProvince(state, toId).name}へ出陣した。`);
  startBattle(fromId, toId, sentTroops, () => renderAll(state), marching);
}

function setupMapEvents() {
  const canvas = getMapCanvas();
  canvas.addEventListener('click', (evt) => {
    if (state.battle) return;
    const { x, y } = toCanvasCoords(canvas, evt);
    const clickedId = hitTestProvince(state, x, y);
    if (!clickedId) return;

    if (state.pendingAttackFrom) {
      const targets = getValidAttackTargets(state);
      if (targets.has(clickedId)) {
        launchPlayerAttack(state.pendingAttackFrom, clickedId);
      } else if (clickedId === state.pendingAttackFrom) {
        state.pendingAttackFrom = null;
        renderAll(state);
      }
      return;
    }

    if (state.pendingTransfer) {
      const pending = state.pendingTransfer;
      if (getValidTransferTargets(state).has(clickedId)
          && transferGeneral(state, pending.generalId, clickedId)) {
        state.actedProvinces.add(pending.fromId);
        state.pendingTransfer = null;
      } else if (clickedId === pending.fromId && !pending.generalId) {
        state.pendingTransfer = null;
      }
      renderAll(state);
      return;
    }

    state.selectedProvinceId = clickedId;
    renderAll(state);
  });
}

function setupCommandButtons() {
  document.getElementById('cmd-develop').addEventListener('click', () => {
    const id = state.selectedProvinceId;
    if (!id || state.actedProvinces.has(id)) return;
    developProvince(state, id);
    state.actedProvinces.add(id);
    renderAll(state);
  });

  document.getElementById('cmd-recruit').addEventListener('click', () => {
    const id = state.selectedProvinceId;
    if (!id || state.actedProvinces.has(id)) return;
    recruitTroops(state, id);
    state.actedProvinces.add(id);
    renderAll(state);
  });

  document.getElementById('cmd-attack').addEventListener('click', () => {
    const id = state.selectedProvinceId;
    if (!id || state.actedProvinces.has(id)) return;
    state.pendingAttackFrom = id;
    renderAll(state);
  });

  document.getElementById('cmd-transfer').addEventListener('click', () => {
    const id = state.selectedProvinceId;
    if (!id || state.actedProvinces.has(id)) return;
    state.pendingTransfer = { fromId: id, generalId: null };
    renderAll(state);
  });

  document.getElementById('cmd-cancel').addEventListener('click', () => {
    state.pendingAttackFrom = null;
    state.pendingTransfer = null;
    state.selectedProvinceId = null;
    renderAll(state);
  });

  // picking which general to send, from the roster in the province panel
  document.getElementById('province-info').addEventListener('click', (evt) => {
    const row = evt.target.closest('li.pickable');
    if (!row || !state.pendingTransfer) return;
    state.pendingTransfer.generalId = row.dataset.general;
    renderAll(state);
  });

  document.getElementById('end-turn-btn').addEventListener('click', endTurn);
}

// ---- Turn / AI phase ----

function endTurn() {
  if (state.battle) return;
  const endBtn = document.getElementById('end-turn-btn');
  endBtn.disabled = true;
  state.selectedProvinceId = null;
  state.pendingAttackFrom = null;
  state.pendingTransfer = null;

  runAIPhase(() => {
    collectIncome(state);
    updateDaimyoAliveStatus(state);
    state.turn += 1;
    state.actedProvinces.clear();
    renderAll(state);
    endBtn.disabled = false;

    const over = checkGameOver(state);
    if (over) {
      state.gameOver = over;
      showGameOverOverlay(over);
    }
  });
}

function runAIPhase(onDone) {
  const aiProvinceIds = Object.values(state.provinces)
    .filter(p => p.ownerId !== state.playerDaimyoId)
    .map(p => p.id);

  let idx = 0;
  function step() {
    if (state.gameOver) return;
    if (idx >= aiProvinceIds.length) { onDone(); return; }
    const provinceId = aiProvinceIds[idx++];
    const prov = state.provinces[provinceId];
    if (!prov || prov.ownerId === state.playerDaimyoId) { step(); return; }

    const action = aiDecideAndAct(state, provinceId);
    if (action) {
      const defenderProv = getProvince(state, action.toId);
      const defenderDaimyo = getDaimyo(state, defenderProv.ownerId);
      if (defenderDaimyo.id === state.playerDaimyoId) {
        startBattle(action.fromId, action.toId, action.sentTroops, () => step(), action.marching);
        return;
      }
      simulateAutoBattle(state, action.fromId, action.toId, action.sentTroops, action.marching);
    }
    step();
  }
  step();
}

// ---- Battle flow ----

function startBattle(fromId, toId, sentTroops, onComplete, marching = []) {
  const battle = createBattle(state, fromId, toId, sentTroops, marching);
  battle.onComplete = onComplete;
  battle.highlightCells = [];
  state.battle = battle;

  const sideLabel = (daimyoId, generals) => {
    const house = getDaimyo(state, daimyoId).name;
    return generals.length ? `${house}（${generals[0].name}）` : house;
  };
  setBattleTitle(`${sideLabel(battle.attackerDaimyoId, battle.marchingGenerals)} 対 ${sideLabel(battle.defenderDaimyoId, battle.defendingGenerals)}`);
  setBattleRoundInfo(`ラウンド ${battle.round} / ${MAX_ROUNDS}`);
  showBattleOverlay();
  renderAll(state);
  drawBattleUI();

  const firstSide = battle[battle.turnSide];
  if (firstSide.controller === 'ai') {
    setBattleStatus('敵軍が行動中…');
    setTimeout(() => runAiBattleStep(), 500);
  } else {
    setBattleStatus('部隊を選択してください。');
  }
}

function runAiBattleStep() {
  const battle = state.battle;
  if (!battle || battle.finished) return;
  aiTakeSideTurn(battle, battle.turnSide);
  drawBattleUI();
  const result = checkBattleEnd(battle);
  if (result) { finishBattle(result); return; }
  doSwitchTurn();
}

function doSwitchTurn() {
  const battle = state.battle;
  switchTurn(battle);
  setBattleRoundInfo(`ラウンド ${battle.round} / ${MAX_ROUNDS}`);
  const newSide = battle[battle.turnSide];
  if (newSide.controller === 'ai') {
    setBattleStatus('敵軍が行動中…');
    drawBattleUI();
    setTimeout(() => runAiBattleStep(), 500);
  } else {
    setBattleStatus('部隊を選択してください。');
    drawBattleUI();
  }
}

function afterBattleAction() {
  const battle = state.battle;
  const result = checkBattleEnd(battle);
  if (result) { finishBattle(result); return; }
  drawBattleUI();
  const side = battle[battle.turnSide];
  if (allActed(side)) doSwitchTurn();
}

function finishBattle(result) {
  const battle = state.battle;
  battle.result = result;
  battle.finished = true;
  resolveBattleOutcome(state, battle);
  updateDaimyoAliveStatus(state);
  hideBattleOverlay();
  const onComplete = battle.onComplete;
  state.battle = null;
  renderAll(state);

  const over = checkGameOver(state);
  if (over) {
    state.gameOver = over;
    showGameOverOverlay(over);
    return;
  }
  if (onComplete) onComplete();
}

function setupBattleEvents() {
  const canvas = getBattleCanvas();

  canvas.addEventListener('click', (evt) => {
    const battle = state.battle;
    if (!battle || battle.finished) return;
    const sideName = battle.turnSide;
    const side = battle[sideName];
    if (side.controller !== 'player') return;

    const { x, y } = toCanvasCoords(canvas, evt);
    const cell = cellFromPixel(x, y);
    if (!cell) return;
    const clicked = findSquadAt(battle, cell.col, cell.row);

    if (!battle.selectedSquadId) {
      if (clicked && clicked.sideName === sideName && !clicked.squad.acted) {
        battle.selectedSquadId = clicked.squad.id;
        battle.highlightCells = reachableCells(battle, clicked.squad);
        drawBattleUI();
        const here = terrainAt(battle, clicked.squad.col, clicked.squad.row);
        const general = clicked.squad.general;
        const who = general ? `${general.name}（統${general.lead} 武${general.valor}）` : '将なき隊';
        setBattleStatus(`${who} 兵${clicked.squad.troops}／${here.name}・${terrainEffectText(here)} — 移動先か隣接する敵部隊をクリック`);
      }
      return;
    }

    const selectedInfo = findSquad(battle, battle.selectedSquadId);
    if (!selectedInfo) {
      battle.selectedSquadId = null;
      battle.highlightCells = [];
      drawBattleUI();
      return;
    }
    const squad = selectedInfo.squad;

    if (clicked && clicked.sideName !== sideName) {
      const res = performAttack(battle, sideName, squad.id, clicked.squad.id);
      battle.selectedSquadId = null;
      battle.highlightCells = [];
      if (res) {
        setBattleStatus(`${res.targetTerrainName}の敵に攻撃！ ${res.dmgToTarget}の損害${res.counter ? `（反撃 ${res.counter}）` : ''}${res.targetDefeated ? ' — 敵部隊を撃破' : ''}`);
      }
      afterBattleAction();
      return;
    }

    if (clicked && clicked.squad.id === squad.id) {
      battle.selectedSquadId = null;
      battle.highlightCells = [];
      drawBattleUI();
      return;
    }

    const moved = moveSquadTo(battle, sideName, squad.id, cell.col, cell.row);
    battle.selectedSquadId = null;
    battle.highlightCells = [];
    if (moved) setBattleStatus(`${terrainAt(battle, cell.col, cell.row).name}へ部隊を移動した。`);
    afterBattleAction();
  });

  document.getElementById('battle-end-turn-btn').addEventListener('click', () => {
    const battle = state.battle;
    if (!battle || battle.finished) return;
    const side = battle[battle.turnSide];
    if (side.controller !== 'player') return;
    for (const sq of side.squads) sq.acted = true;
    battle.selectedSquadId = null;
    battle.highlightCells = [];
    afterBattleAction();
  });

  document.getElementById('battle-retreat-btn').addEventListener('click', () => {
    const battle = state.battle;
    if (!battle || battle.finished) return;
    const controllingSide = battle.attacker.controller === 'player' ? 'attacker' : 'defender';
    const result = controllingSide === 'attacker' ? 'defender' : 'attacker';
    finishBattle(result);
  });
}

function setupGameOverEvents() {
  document.getElementById('game-over-restart-btn').addEventListener('click', () => {
    hideGameOverOverlay();
    state = createInitialState();
    renderAll(state);
  });
}

function init() {
  setupMapEvents();
  setupCommandButtons();
  setupBattleEvents();
  setupGameOverEvents();
  renderBattleLegend();
  addLog(state, '織田家として天下統一を目指しましょう。隣国を攻略し、勢力を広げてください。');
  renderAll(state);
}

init();
