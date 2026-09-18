// One province, one decision, made by whoever governs it. Personality sets the
// appetite for war, ability sets how well the province is run, and loyalty
// decides whether the governor bothers serving his lord's interests at all.
// Returns an { type: 'attack', ... } order when he marches, otherwise null.
function decideProvinceAction(state, provinceId) {
  const prov = getProvince(state, provinceId);
  const daimyo = getDaimyo(state, prov.ownerId);
  const governor = governorOf(state, provinceId);
  const cap = maxTroops(prov);

  if (!governor) return actWithoutGovernor(state, provinceId);

  const traits = traitsOf(governor);
  const skill = (governor.lead + governor.valor) / 200;
  const sulking = governor.loyalty < 40;

  // a discontented governor does the bare minimum for his lord
  if (sulking && Math.random() < (40 - governor.loyalty) / 60) {
    addLog(state, `${prov.name}の${governor.name}は動かず、様子を見ている。`);
    return null;
  }

  if (prov.troops < cap * traits.garrisonFloor * 0.6 && daimyo.gold >= 30) {
    recruitTroops(state, provinceId);
    return null;
  }

  const spareTroops = prov.troops - cap * traits.garrisonFloor * 0.5;
  const confidence = traits.oddsNeeded * (0.75 + skill * 0.5);
  const target = pickTarget(state, prov, governor, prov.troops * confidence, skill);

  if (target && spareTroops > 200 && Math.random() < traits.aggression) {
    const sentTroops = Math.round(prov.troops * (0.5 + traits.aggression * 0.4));
    prov.troops -= sentTroops;
    const marching = marchingGeneralsFrom(state, prov.id);
    addLog(state, `${daimyo.name}の${governor.name}が${prov.name}から${target.name}へ出陣した。`);
    return { type: 'attack', fromId: prov.id, toId: target.id, sentTroops, marching };
  }

  if (restaffNeighbor(state, prov)) return null;

  const wantsDevelopment = Math.random() < traits.developBias * (0.6 + governor.politics / 200);
  if (wantsDevelopment && daimyo.gold >= 50 && prov.kokudaka < 300) {
    developProvince(state, provinceId);
  } else if (prov.troops < cap * 0.95) {
    recruitTroops(state, provinceId);
  } else if (daimyo.gold >= 50) {
    developProvince(state, provinceId);
  }
  return null;
}

// Only neighbors he believes he can beat are worth considering — and what he
// believes depends on how good he is. A dull commander misreads enemy strength
// badly enough to march into a fight he was never going to win, while an able
// one sees the field almost as it is. Among the targets that pass, a 猛将 takes
// the easiest fight and a 智将 the richest prize.
function pickTarget(state, prov, governor, beatableUpTo, clarity) {
  const scouted = prov.neighbors
    .map(id => getProvince(state, id))
    .filter(n => n.ownerId !== prov.ownerId)
    .map(n => ({ prov: n, seen: n.troops * (1 + (1 - clarity) * (Math.random() * 2 - 1)) }))
    .filter(o => o.seen < beatableUpTo);
  if (!scouted.length) return null;

  if (governor.personality === 'cunning' || governor.personality === 'ambitious') {
    return scouted.sort((a, b) => (b.prov.kokudaka / (b.seen + 300)) - (a.prov.kokudaka / (a.seen + 300)))[0].prov;
  }
  return scouted.sort((a, b) => a.seen - b.seen)[0].prov;
}

// A province with nobody in charge is run by clerks until a neighbor spares a man.
function actWithoutGovernor(state, provinceId) {
  const prov = getProvince(state, provinceId);
  if (restaffNeighbor(state, prov)) return null;
  if (getDaimyo(state, prov.ownerId).gold >= 50) developProvince(state, provinceId);
  else recruitTroops(state, provinceId);
  return null;
}

function restaffNeighbor(state, prov) {
  const emptyNeighbor = prov.neighbors
    .map(id => getProvince(state, id))
    .find(n => n.ownerId === prov.ownerId && generalsIn(state, n.id).length === 0);
  if (!emptyNeighbor || generalsIn(state, prov.id).length < 2) return false;
  const spare = generalsIn(state, prov.id).slice(1).sort((a, b) => b.politics - a.politics)[0];
  return transferGeneral(state, spare.id, emptyNeighbor.id);
}

// An army is led by its ablest commanders, one per squad on the battle map.
// Whenever the province can spare a man, the best administrator among them
// stays behind as castellan rather than leaving the province ungoverned.
function marchingGeneralsFrom(state, provinceId) {
  const garrison = generalsIn(state, provinceId);
  if (garrison.length < 3) return garrison.slice(0, MAX_SQUADS);
  const castellan = garrison.slice(1).sort((a, b) => b.politics - a.politics)[0];
  return garrison.filter(g => g.id !== castellan.id).slice(0, MAX_SQUADS);
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
    shiftHouseMorale(state, defenderDaimyo.id, -8);
    shiftHouseMorale(state, attackerDaimyo.id, 4);
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
