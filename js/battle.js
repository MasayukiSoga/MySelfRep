const COLS = 9;
const ROWS = 7;
const MOVE_RANGE = 2;
const MAX_ROUNDS = 12;

let nextSquadId = 1;

function splitIntoSquads(troops, maxSquads = 4) {
  const per = Math.ceil(troops / maxSquads);
  const squads = [];
  let remaining = troops;
  while (remaining > 0 && squads.length < maxSquads) {
    const t = Math.min(per, remaining);
    squads.push(t);
    remaining -= t;
  }
  return squads;
}

function makeSquads(troopAmount, col, rowSpread) {
  const amounts = splitIntoSquads(troopAmount);
  return amounts.map((troops, i) => ({
    id: nextSquadId++,
    troops,
    col,
    row: rowSpread[i % rowSpread.length],
    acted: false,
  }));
}

function createBattle(state, attackerProvinceId, defenderProvinceId, sentTroops) {
  const attackerProv = getProvince(state, attackerProvinceId);
  const defenderProv = getProvince(state, defenderProvinceId);
  const attackerDaimyo = getDaimyo(state, attackerProv.ownerId);
  const defenderDaimyo = getDaimyo(state, defenderProv.ownerId);

  const attackerRows = [0, 2, 4, 6];
  const defenderRows = [0, 2, 4, 6];

  const battle = {
    attackerProvinceId,
    defenderProvinceId,
    attackerDaimyoId: attackerDaimyo.id,
    defenderDaimyoId: defenderDaimyo.id,
    attacker: {
      controller: attackerDaimyo.isPlayer ? 'player' : 'ai',
      squads: makeSquads(sentTroops, 1, attackerRows),
    },
    defender: {
      controller: defenderDaimyo.isPlayer ? 'player' : 'ai',
      squads: makeSquads(defenderProv.troops, COLS - 2, defenderRows),
    },
    turnSide: 'attacker',
    round: 1,
    selectedSquadId: null,
    finished: false,
    result: null,
    log: [],
  };
  return battle;
}

function sideOf(battle, sideName) {
  return battle[sideName];
}

function otherSide(sideName) {
  return sideName === 'attacker' ? 'defender' : 'attacker';
}

function aliveSquads(side) {
  return side.squads.filter(s => s.troops > 0);
}

function occupiedMap(battle) {
  const map = new Map();
  for (const sideName of ['attacker', 'defender']) {
    for (const sq of aliveSquads(battle[sideName])) {
      map.set(`${sq.col},${sq.row}`, { sideName, squad: sq });
    }
  }
  return map;
}

function inBounds(col, row) {
  return col >= 0 && col < COLS && row >= 0 && row < ROWS;
}

function manhattan(a, b) {
  return Math.abs(a.col - b.col) + Math.abs(a.row - b.row);
}

function findSquadAt(battle, col, row) {
  for (const sideName of ['attacker', 'defender']) {
    const sq = battle[sideName].squads.find(s => s.troops > 0 && s.col === col && s.row === row);
    if (sq) return { sideName, squad: sq };
  }
  return null;
}

function findSquad(battle, squadId) {
  for (const sideName of ['attacker', 'defender']) {
    const sq = battle[sideName].squads.find(s => s.id === squadId);
    if (sq) return { sideName, squad: sq };
  }
  return null;
}

function reachableCells(battle, squad) {
  const occ = occupiedMap(battle);
  const cells = [];
  for (let dc = -MOVE_RANGE; dc <= MOVE_RANGE; dc++) {
    for (let dr = -MOVE_RANGE; dr <= MOVE_RANGE; dr++) {
      const dist = Math.abs(dc) + Math.abs(dr);
      if (dist === 0 || dist > MOVE_RANGE) continue;
      const col = squad.col + dc;
      const row = squad.row + dr;
      if (!inBounds(col, row)) continue;
      if (occ.has(`${col},${row}`)) continue;
      cells.push({ col, row });
    }
  }
  return cells;
}

function attackableTargets(battle, sideName, squad) {
  const enemySide = sideOf(battle, otherSide(sideName));
  return aliveSquads(enemySide).filter(enemy => manhattan(squad, enemy) === 1);
}

function moveSquadTo(battle, sideName, squadId, col, row) {
  const side = sideOf(battle, sideName);
  const squad = side.squads.find(s => s.id === squadId);
  if (!squad || squad.acted) return false;
  const valid = reachableCells(battle, squad).some(c => c.col === col && c.row === row);
  if (!valid) return false;
  squad.col = col;
  squad.row = row;
  squad.acted = true;
  return true;
}

function computeDamage(troops) {
  return Math.round(troops * (0.25 + Math.random() * 0.25));
}

function performAttack(battle, sideName, squadId, targetSquadId) {
  const side = sideOf(battle, sideName);
  const enemySide = sideOf(battle, otherSide(sideName));
  const squad = side.squads.find(s => s.id === squadId);
  const target = enemySide.squads.find(s => s.id === targetSquadId);
  if (!squad || !target || squad.acted) return null;
  if (manhattan(squad, target) !== 1) return null;

  const dmgToTarget = computeDamage(squad.troops);
  target.troops = Math.max(0, target.troops - dmgToTarget);
  let counter = 0;
  if (target.troops > 0) {
    counter = Math.round(computeDamage(target.troops) * 0.5);
    squad.troops = Math.max(0, squad.troops - counter);
  }
  squad.acted = true;

  const result = { dmgToTarget, counter, targetDefeated: target.troops <= 0, attackerDefeated: squad.troops <= 0 };
  battle[otherSide(sideName)].squads = enemySide.squads.filter(s => s.troops > 0);
  battle[sideName].squads = side.squads.filter(s => s.troops > 0);
  return result;
}

function checkBattleEnd(battle) {
  if (aliveSquads(battle.attacker).length === 0) return 'defender';
  if (aliveSquads(battle.defender).length === 0) return 'attacker';
  if (battle.round > MAX_ROUNDS) return 'defender';
  return null;
}

function allActed(side) {
  return aliveSquads(side).every(s => s.acted);
}

function resetActedFlags(side) {
  for (const sq of side.squads) sq.acted = false;
}

// Simple AI: for each of its squads, attack an adjacent enemy if possible,
// otherwise move closer to the nearest enemy squad.
function aiTakeSideTurn(battle, sideName) {
  const side = sideOf(battle, sideName);
  const enemySide = sideOf(battle, otherSide(sideName));
  const events = [];

  for (const squad of [...side.squads]) {
    if (squad.troops <= 0 || squad.acted) continue;
    const enemies = aliveSquads(enemySide);
    if (enemies.length === 0) break;

    const adjacentTarget = enemies.find(e => manhattan(squad, e) === 1);
    if (adjacentTarget) {
      const res = performAttack(battle, sideName, squad.id, adjacentTarget.id);
      if (res) events.push({ type: 'attack', squadId: squad.id, targetId: adjacentTarget.id, res });
      continue;
    }

    let nearest = enemies[0];
    let bestDist = manhattan(squad, nearest);
    for (const e of enemies) {
      const d = manhattan(squad, e);
      if (d < bestDist) { bestDist = d; nearest = e; }
    }

    const options = reachableCells(battle, squad);
    if (options.length > 0) {
      let best = options[0];
      let bestD = manhattan(best, nearest);
      for (const c of options) {
        const d = manhattan(c, nearest);
        if (d < bestD) { bestD = d; best = c; }
      }
      moveSquadTo(battle, sideName, squad.id, best.col, best.row);
      events.push({ type: 'move', squadId: squad.id, to: best });
    } else {
      squad.acted = true;
    }
  }
  return events;
}

function advanceRoundIfNeeded(battle) {
  if (battle.turnSide === 'defender') {
    battle.round += 1;
  }
}

function switchTurn(battle) {
  advanceRoundIfNeeded(battle);
  battle.turnSide = otherSide(battle.turnSide);
  resetActedFlags(sideOf(battle, battle.turnSide));
}

function resolveBattleOutcome(state, battle) {
  const attackerProv = getProvince(state, battle.attackerProvinceId);
  const defenderProv = getProvince(state, battle.defenderProvinceId);
  const attackerDaimyo = getDaimyo(state, battle.attackerDaimyoId);
  const defenderDaimyo = getDaimyo(state, battle.defenderDaimyoId);

  const survivingAttackerTroops = aliveSquads(battle.attacker).reduce((s, sq) => s + sq.troops, 0);
  const survivingDefenderTroops = aliveSquads(battle.defender).reduce((s, sq) => s + sq.troops, 0);

  if (battle.result === 'attacker') {
    defenderProv.ownerId = attackerDaimyo.id;
    defenderProv.troops = Math.max(10, survivingAttackerTroops);
    addLog(state, `【合戦】${attackerDaimyo.name}が${defenderProv.name}を攻略した！`);
  } else {
    attackerProv.troops += survivingAttackerTroops;
    const cap = maxTroops(attackerProv);
    if (attackerProv.troops > cap) attackerProv.troops = cap;
    defenderProv.troops = Math.max(0, survivingDefenderTroops);
    addLog(state, `【合戦】${attackerDaimyo.name}は${defenderProv.name}への侵攻に失敗し撤退した。`);
  }
}
