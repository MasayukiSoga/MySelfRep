// Decide and execute one action for an AI-controlled province.
// Returns { type: 'attack', fromId, toId, sentTroops } when the province
// wants to invade a neighbor (caller handles battle creation), otherwise null.
function aiDecideAndAct(state, provinceId) {
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
    const marching = marchingGeneralsFrom(state, prov.id);
    const led = marching.length ? `${marching[0].name}率いる軍が` : '';
    addLog(state, `${daimyo.name}の${led}${prov.name}から${weakEnemyNeighbor.name}へ出陣した。`);
    return { type: 'attack', fromId: prov.id, toId: weakEnemyNeighbor.id, sentTroops, marching };
  }

  // a province left without a governor gets one from a neighbor that can spare it
  if (generalsIn(state, provinceId).length === 0) {
    const spare = prov.neighbors
      .filter(n => getProvince(state, n).ownerId === prov.ownerId)
      .flatMap(n => (generalsIn(state, n).length > 1 ? generalsIn(state, n).slice(1) : []))
      .sort((a, b) => b.politics - a.politics)[0];
    if (spare) {
      transferGeneral(state, spare.id, provinceId);
      return null;
    }
  }

  if (daimyo.gold >= 50) {
    developProvince(state, provinceId);
  } else {
    recruitTroops(state, provinceId);
  }
  return null;
}

// An army is led by its ablest commanders, one per squad on the battle map.
function marchingGeneralsFrom(state, provinceId) {
  return generalsIn(state, provinceId).slice(0, MAX_SQUADS);
}

// Quick, non-interactive resolution for battles where neither side is the
// player (keeps AI-vs-AI turns fast; player battles always use the tactical map).
function simulateAutoBattle(state, attackerProvinceId, defenderProvinceId, sentTroops, marching = []) {
  const attackerProv = getProvince(state, attackerProvinceId);
  const defenderProv = getProvince(state, defenderProvinceId);
  const attackerDaimyo = getDaimyo(state, attackerProv.ownerId);
  const defenderDaimyo = getDaimyo(state, defenderProv.ownerId);

  const defending = generalsIn(state, defenderProvinceId);
  const atkEdge = commanderEdge(marching);
  const defEdge = commanderEdge(defending);

  let atk = sentTroops;
  let def = defenderProv.troops;

  while (atk > 0 && def > 0) {
    def -= Math.round(atk * (0.25 + Math.random() * 0.2) * atkEdge / defEdge);
    if (def <= 0) break;
    atk -= Math.round(def * (0.2 + Math.random() * 0.2) * defEdge / atkEdge);
  }

  const attackerWon = def <= 0 && atk > 0;
  for (const general of marching) {
    if (!general.alive) continue;
    if (!attackerWon && Math.random() < 0.2) killGeneral(state, general, '討死した');
    else general.provinceId = attackerWon ? defenderProvinceId : attackerProvinceId;
  }

  if (attackerWon) {
    settleDefeatedGenerals(state, defending, attackerDaimyo.id);
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

// Stand-in for the tactical map's per-squad 武勇/統率 effects.
function commanderEdge(generals) {
  if (!generals.length) return 1;
  const avg = generals.reduce((sum, g) => sum + (g.valor + g.lead) / 2, 0) / generals.length;
  return 1 + (avg - 75) / 250;
}
