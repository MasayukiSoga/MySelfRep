import {
  getProvince, getDaimyo, addLog, maxTroops,
  developProvince, recruitTroops,
} from './state.js';

// Decide and execute one action for an AI-controlled province.
// Returns { type: 'attack', fromId, toId, sentTroops } when the province
// wants to invade a neighbor (caller handles battle creation), otherwise null.
export function aiDecideAndAct(state, provinceId) {
  const prov = getProvince(state, provinceId);
  const daimyo = getDaimyo(state, prov.ownerId);
  const cap = maxTroops(prov);

  if (prov.troops < cap * 0.3 && daimyo.gold >= 30) {
    recruitTroops(state, provinceId);
    return null;
  }

  const weakEnemyNeighbor = prov.neighbors
    .map(id => getProvince(state, id))
    .filter(n => n.ownerId !== prov.ownerId)
    .sort((a, b) => a.troops - b.troops)[0];

  const hasSizeableForce = prov.troops > 250;
  const feelingBold = Math.random() < 0.4;

  if (weakEnemyNeighbor && hasSizeableForce && feelingBold && weakEnemyNeighbor.troops < prov.troops * 0.65) {
    const sentTroops = Math.round(prov.troops * 0.7);
    prov.troops -= sentTroops;
    addLog(state, `${daimyo.name}が${prov.name}から${weakEnemyNeighbor.name}へ出陣した。`);
    return { type: 'attack', fromId: prov.id, toId: weakEnemyNeighbor.id, sentTroops };
  }

  if (daimyo.gold >= 50) {
    developProvince(state, provinceId);
  } else {
    recruitTroops(state, provinceId);
  }
  return null;
}

// Quick, non-interactive resolution for battles where neither side is the
// player (keeps AI-vs-AI turns fast; player battles always use the tactical map).
export function simulateAutoBattle(state, attackerProvinceId, defenderProvinceId, sentTroops) {
  const attackerProv = getProvince(state, attackerProvinceId);
  const defenderProv = getProvince(state, defenderProvinceId);
  const attackerDaimyo = getDaimyo(state, attackerProv.ownerId);
  const defenderDaimyo = getDaimyo(state, defenderProv.ownerId);

  let atk = sentTroops;
  let def = defenderProv.troops;

  while (atk > 0 && def > 0) {
    def -= Math.round(atk * (0.25 + Math.random() * 0.2));
    if (def <= 0) break;
    atk -= Math.round(def * (0.2 + Math.random() * 0.2));
  }

  if (def <= 0 && atk > 0) {
    defenderProv.ownerId = attackerDaimyo.id;
    defenderProv.troops = Math.max(10, atk);
    addLog(state, `【合戦】${attackerDaimyo.name}が${defenderProv.name}を攻略した！`);
  } else {
    attackerProv.troops += Math.max(0, atk);
    const cap = maxTroops(attackerProv);
    if (attackerProv.troops > cap) attackerProv.troops = cap;
    defenderProv.troops = Math.max(0, def);
    addLog(state, `【合戦】${attackerDaimyo.name}は${defenderProv.name}への侵攻に失敗し撤退した。`);
  }
}
