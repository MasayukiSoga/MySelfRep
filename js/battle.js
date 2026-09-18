const COLS = 9;
const ROWS = 7;
const MOVE_POINTS = 3;
const MAX_SQUADS = 4;
// rugged terrain slows fights down (forest/hill cut damage), so allow room
// for those battles to reach a decision instead of timing out as a draw
const MAX_ROUNDS = 16;

// defense is a multiplier on damage RECEIVED on this tile (lower = safer),
// attack a multiplier on damage DEALT from it.
const TERRAIN = {
  plain:    { name: '平地', moveCost: 1,        defense: 1.0,  attack: 1.0,  color: '#3d5230' },
  forest:   { name: '森',   moveCost: 2,        defense: 0.7,  attack: 1.0,  color: '#25401f' },
  hill:     { name: '丘',   moveCost: 2,        defense: 0.85, attack: 1.15, color: '#6d5b34' },
  river:    { name: '川',   moveCost: 3,        defense: 1.25, attack: 0.85, color: '#2b4a66' },
  mountain: { name: '山',   moveCost: Infinity, defense: 1.0,  attack: 1.0,  color: '#55514a' },
};

// Tile mix per province terrain type; battles are fought on the defender's land.
const TERRAIN_PROFILES = {
  plain:    { plain: 62, forest: 20, hill: 10, river: 6,  mountain: 2 },
  forest:   { plain: 38, forest: 38, hill: 12, river: 5,  mountain: 7 },
  mountain: { plain: 28, forest: 22, hill: 24, river: 4,  mountain: 22 },
  river:    { plain: 44, forest: 16, hill: 8,  river: 28, mountain: 4 },
};

let nextSquadId = 1;

function pickWeighted(weights) {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  let roll = Math.random() * total;
  for (const [key, weight] of Object.entries(weights)) {
    roll -= weight;
    if (roll <= 0) return key;
  }
  return Object.keys(weights)[0];
}

function isDeploymentColumn(col) {
  return col <= 1 || col >= COLS - 2;
}

// Both armies must be able to reach each other, or the battle can never be fought.
function sidesAreConnected(grid) {
  const start = { col: 1, row: 0 };
  const seen = new Set();
  const queue = [];
  for (let row = 0; row < ROWS; row++) {
    if (TERRAIN[grid[row][start.col]].moveCost !== Infinity) {
      queue.push({ col: start.col, row });
      seen.add(`${start.col},${row}`);
    }
  }
  while (queue.length) {
    const cur = queue.shift();
    if (cur.col === COLS - 2) return true;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const col = cur.col + dc;
      const row = cur.row + dr;
      const key = `${col},${row}`;
      if (!inBounds(col, row) || seen.has(key)) continue;
      if (TERRAIN[grid[row][col]].moveCost === Infinity) continue;
      seen.add(key);
      queue.push({ col, row });
    }
  }
  return false;
}

function generateTerrain(profileName) {
  const weights = TERRAIN_PROFILES[profileName] || TERRAIN_PROFILES.plain;
  const campWeights = { plain: 80, forest: 20 };
  for (let attempt = 0; attempt < 20; attempt++) {
    const grid = [];
    for (let row = 0; row < ROWS; row++) {
      const line = [];
      for (let col = 0; col < COLS; col++) {
        line.push(pickWeighted(isDeploymentColumn(col) ? campWeights : weights));
      }
      grid.push(line);
    }
    if (sidesAreConnected(grid)) return grid;
  }
  return Array.from({ length: ROWS }, () => Array(COLS).fill('plain'));
}

function terrainAt(battle, col, row) {
  return TERRAIN[battle.terrain[row][col]];
}

function terrainEffectText(terrain) {
  const parts = [];
  if (terrain.moveCost === Infinity) return '進入不可';
  if (terrain.defense < 1) parts.push(`被害-${Math.round((1 - terrain.defense) * 100)}%`);
  if (terrain.defense > 1) parts.push(`被害+${Math.round((terrain.defense - 1) * 100)}%`);
  if (terrain.attack > 1) parts.push(`攻撃+${Math.round((terrain.attack - 1) * 100)}%`);
  if (terrain.attack < 1) parts.push(`攻撃-${Math.round((1 - terrain.attack) * 100)}%`);
  parts.push(`移動${terrain.moveCost}`);
  return parts.join('・');
}

function splitIntoSquads(troops, maxSquads = MAX_SQUADS) {
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

function makeSquads(troopAmount, col, rowSpread, generals = []) {
  const amounts = splitIntoSquads(troopAmount);
  return amounts.map((troops, i) => ({
    id: nextSquadId++,
    troops,
    col,
    row: rowSpread[i % rowSpread.length],
    acted: false,
    general: generals[i] || null,
  }));
}

// 武勇 drives the damage a squad deals, 統率 the damage it absorbs.
function valorFactor(squad) {
  return squad.general ? 1 + squad.general.valor / 250 : 1;
}

function leadFactor(squad) {
  return squad.general ? 1 - squad.general.lead / 400 : 1;
}

function createBattle(state, attackerProvinceId, defenderProvinceId, sentTroops, marchingGenerals = []) {
  const attackerProv = getProvince(state, attackerProvinceId);
  const defenderProv = getProvince(state, defenderProvinceId);
  const attackerDaimyo = getDaimyo(state, attackerProv.ownerId);
  const defenderDaimyo = getDaimyo(state, defenderProv.ownerId);

  const attackerRows = [0, 2, 4, 6];
  const defenderRows = [0, 2, 4, 6];
  const defendingGenerals = generalsIn(state, defenderProvinceId);

  const battle = {
    attackerProvinceId,
    defenderProvinceId,
    terrain: generateTerrain(defenderProv.terrain),
    attackerDaimyoId: attackerDaimyo.id,
    defenderDaimyoId: defenderDaimyo.id,
    marchingGenerals,
    defendingGenerals,
    attacker: {
      controller: attackerDaimyo.isPlayer ? 'player' : 'ai',
      squads: makeSquads(sentTroops, 1, attackerRows, marchingGenerals),
    },
    defender: {
      controller: defenderDaimyo.isPlayer ? 'player' : 'ai',
      squads: makeSquads(defenderProv.troops, COLS - 2, defenderRows, defendingGenerals),
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

// Cheapest-path search: terrain sets the cost of entering a tile, and other
// squads block the way rather than being stepped over.
function reachableCells(battle, squad) {
  const occ = occupiedMap(battle);
  const startKey = `${squad.col},${squad.row}`;
  const cheapest = new Map([[startKey, 0]]);
  const queue = [{ col: squad.col, row: squad.row, spent: 0 }];

  while (queue.length) {
    const cur = queue.shift();
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const col = cur.col + dc;
      const row = cur.row + dr;
      if (!inBounds(col, row)) continue;
      const key = `${col},${row}`;
      if (occ.has(key)) continue;
      const spent = cur.spent + terrainAt(battle, col, row).moveCost;
      if (spent > MOVE_POINTS) continue;
      if (cheapest.has(key) && cheapest.get(key) <= spent) continue;
      cheapest.set(key, spent);
      queue.push({ col, row, spent });
    }
  }

  const cells = [];
  for (const [key, spent] of cheapest) {
    if (key === startKey) continue;
    const [col, row] = key.split(',').map(Number);
    cells.push({ col, row, cost: spent });
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

  const squadTerrain = terrainAt(battle, squad.col, squad.row);
  const targetTerrain = terrainAt(battle, target.col, target.row);

  const dmgToTarget = Math.round(computeDamage(squad.troops)
    * valorFactor(squad) * leadFactor(target) * squadTerrain.attack * targetTerrain.defense);
  target.troops = Math.max(0, target.troops - dmgToTarget);
  let counter = 0;
  if (target.troops > 0) {
    counter = Math.round(computeDamage(target.troops) * 0.5
      * valorFactor(target) * leadFactor(squad) * targetTerrain.attack * squadTerrain.defense);
    squad.troops = Math.max(0, squad.troops - counter);
  }
  squad.acted = true;

  const result = {
    dmgToTarget,
    counter,
    targetTerrainName: targetTerrain.name,
    targetDefeated: target.troops <= 0,
    attackerDefeated: squad.troops <= 0,
  };
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

    // hit whoever is standing in the most exposed terrain, weakest first
    const adjacentTarget = enemies
      .filter(e => manhattan(squad, e) === 1)
      .sort((a, b) => (terrainAt(battle, b.col, b.row).defense - terrainAt(battle, a.col, a.row).defense)
        || (a.troops - b.troops))[0];
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
      // close the distance, but take the better cover among equally close tiles
      const scoreOf = c => manhattan(c, nearest) + (terrainAt(battle, c.col, c.row).defense - 1) * 1.5;
      let best = options[0];
      let bestScore = scoreOf(best);
      for (const c of options) {
        const score = scoreOf(c);
        if (score < bestScore) { bestScore = score; best = c; }
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

// A general whose squad was wiped out may fall; the rest follow the army,
// and a beaten garrison is killed, recruited, or driven off.
function settleGenerals(state, battle) {
  const attackerWon = battle.result === 'attacker';
  const stillLeading = new Set(aliveSquads(battle.attacker).map(sq => sq.general && sq.general.id));

  for (const general of battle.marchingGenerals) {
    if (!general.alive) continue;
    if (!stillLeading.has(general.id) && Math.random() < 0.3) {
      killGeneral(state, general, '討死した');
      continue;
    }
    general.provinceId = attackerWon ? battle.defenderProvinceId : battle.attackerProvinceId;
  }

  const survivingDefenders = new Set(aliveSquads(battle.defender).map(sq => sq.general && sq.general.id));
  const beatenDefenders = battle.defendingGenerals.filter(g => g.alive && !survivingDefenders.has(g.id));

  if (attackerWon) {
    settleDefeatedGenerals(state, beatenDefenders, battle.attackerDaimyoId);
  } else {
    for (const general of beatenDefenders) {
      if (Math.random() < 0.3) killGeneral(state, general, '討死した');
    }
  }
}

function resolveBattleOutcome(state, battle) {
  const attackerProv = getProvince(state, battle.attackerProvinceId);
  const defenderProv = getProvince(state, battle.defenderProvinceId);
  const attackerDaimyo = getDaimyo(state, battle.attackerDaimyoId);
  const defenderDaimyo = getDaimyo(state, battle.defenderDaimyoId);

  const survivingAttackerTroops = aliveSquads(battle.attacker).reduce((s, sq) => s + sq.troops, 0);
  const survivingDefenderTroops = aliveSquads(battle.defender).reduce((s, sq) => s + sq.troops, 0);

  settleGenerals(state, battle);

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
