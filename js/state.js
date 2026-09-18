const KOKUDAKA_CAP = 300;
const STARTING_GOLD = 600;

function createInitialState() {
  const provinces = {};
  const daimyos = {};

  for (const def of PROVINCES) {
    provinces[def.id] = {
      id: def.id,
      name: def.name,
      x: def.x,
      y: def.y,
      neighbors: def.neighbors.slice(),
      terrain: def.terrain,
      ownerId: def.id, // each province starts under its own house
      delegated: false, // run by its governor instead of the player
      kokudaka: def.kokudaka,
      troops: 0,
    };
  }

  for (const [id, meta] of Object.entries(DAIMYO_META)) {
    daimyos[id] = {
      id,
      name: meta.name,
      color: meta.color,
      isPlayer: !!meta.isPlayer,
      gold: STARTING_GOLD,
      alive: true,
    };
  }

  // seed troop levels at half of capacity
  for (const prov of Object.values(provinces)) {
    prov.troops = Math.round(maxTroops(prov) * 0.5);
  }

  const generals = {};
  for (const def of GENERALS) {
    generals[def.id] = { ...def, provinceId: def.province, alive: true, loyalty: def.lord ? 100 : 70 };
  }

  return {
    turn: 1,
    provinces,
    daimyos,
    generals,
    playerDaimyoId: 'owari',
    actedProvinces: new Set(),
    selectedProvinceId: null,
    pendingAttackFrom: null, // when choosing a target province to attack
    pendingTransfer: null,   // { fromId, generalId } while re-stationing a general
    log: [],
    battle: null, // active battle state, or null
    gameOver: null, // { victory: bool, text } or null
  };
}

// Affinity sits on a 0-99 circle: the closer two values, the better the two
// get along. 1 = kindred spirits, 0 = cannot stand each other.
function affinityScore(a, b) {
  const gap = Math.abs(a - b);
  return 1 - Math.min(gap, 100 - gap) / 50;
}

function traitsOf(general) {
  return PERSONALITIES[general.personality];
}

function lordOf(state, daimyoId) {
  return Object.values(state.generals).find(g => g.alive && g.lord
    && g.provinceId && state.provinces[g.provinceId].ownerId === daimyoId) || null;
}

// A general settles at the loyalty their lord's character earns them.
function loyaltyTarget(state, general) {
  const prov = state.provinces[general.provinceId];
  if (!prov) return general.loyalty;
  if (general.lord && prov.ownerId === general.id) return 100;
  const lord = lordOf(state, prov.ownerId);
  const rapport = lord ? affinityScore(general.affinity, lord.affinity) : 0.35;
  return clamp(20 + rapport * 60 + traitsOf(general).loyaltyBias, 3, 100);
}

function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

function adjustLoyalty(state, general, delta) {
  general.loyalty = clamp(general.loyalty + delta, 0, 100);
}

function generalsIn(state, provinceId) {
  return Object.values(state.generals)
    .filter(g => g.alive && g.provinceId === provinceId)
    .sort((a, b) => b.lead - a.lead);
}

// the ablest administrator present runs 内政 and 徴兵; an ungoverned province
// manages on its own at a penalty
function bestAdministrator(state, provinceId) {
  return generalsIn(state, provinceId).sort((a, b) => b.politics - a.politics)[0] || null;
}

function administrationFactor(general) {
  return general ? 0.7 + general.politics / 125 : 0.6;
}

// Whoever is in charge here: the lord if present, otherwise the ablest commander.
// Their personality and skill decide how the province is run.
function governorOf(state, provinceId) {
  const garrison = generalsIn(state, provinceId);
  return garrison.find(g => g.lord) || garrison[0] || null;
}

const REBELLION_NERVE = { ambitious: 2, cunning: 1, bold: 1, steady: 0.7, devoted: 0.3 };

// Loyalty drifts toward what the lord's character earns, then the disaffected
// may bolt — and a lone discontented governor can take the province with him.
function advanceLoyalty(state) {
  for (const general of Object.values(state.generals)) {
    if (!general.alive || !general.provinceId) continue;
    const target = loyaltyTarget(state, general);
    adjustLoyalty(state, general, clamp(target - general.loyalty, -3, 3));
  }
  for (const general of Object.values(state.generals)) {
    if (!general.alive || !general.provinceId || general.lord) continue;
    if (general.loyalty >= 25) continue;
    const nerve = REBELLION_NERVE[general.personality];
    if (Math.random() > (25 - general.loyalty) / 100 * nerve) continue;
    defect(state, general);
  }
}

// Men stay with a winner and drift from a house that is losing ground. The
// devoted hold on longest, the ambitious are first to look elsewhere.
const MORALE_SENSITIVITY = { ambitious: 1.6, cunning: 1.1, bold: 1.0, steady: 0.8, devoted: 0.4 };

function shiftHouseMorale(state, daimyoId, delta) {
  for (const general of Object.values(state.generals)) {
    if (!general.alive || !general.provinceId) continue;
    if (state.provinces[general.provinceId].ownerId !== daimyoId || general.lord) continue;
    adjustLoyalty(state, general, delta * MORALE_SENSITIVITY[general.personality]);
  }
}

function defect(state, general) {
  const prov = state.provinces[general.provinceId];
  const rivals = prov.neighbors
    .map(id => state.provinces[id])
    .filter(n => n.ownerId !== prov.ownerId);

  if (!rivals.length) {
    killGeneral(state, general, '出奔した');
    return;
  }

  const welcoming = rivals.sort((a, b) => {
    const lordA = lordOf(state, a.ownerId);
    const lordB = lordOf(state, b.ownerId);
    return affinityScore(general.affinity, lordB ? lordB.affinity : 50)
         - affinityScore(general.affinity, lordA ? lordA.affinity : 50);
  })[0];

  const isLoneGovernor = generalsIn(state, prov.id).length === 1;
  if (isLoneGovernor && general.loyalty < 12) {
    const betrayed = getDaimyo(state, prov.ownerId).name;
    prov.ownerId = welcoming.ownerId;
    adjustLoyalty(state, general, 45);
    addLog(state, `【謀反】${general.name}が${betrayed}に叛き、${prov.name}ごと${getDaimyo(state, welcoming.ownerId).name}へ寝返った！`);
    return;
  }

  general.provinceId = welcoming.id;
  adjustLoyalty(state, general, 40);
  addLog(state, `【離反】${general.name}が${getDaimyo(state, welcoming.ownerId).name}へ出奔した。`);
}

// Gold buys goodwill, and a general who likes their lord is cheaper to please.
function rewardGenerals(state, provinceId) {
  const prov = getProvince(state, provinceId);
  const daimyo = getDaimyo(state, prov.ownerId);
  const garrison = generalsIn(state, provinceId);
  const cost = 120;
  if (!garrison.length) return false;
  if (daimyo.gold < cost) {
    addLog(state, `${prov.name}: 資金不足で褒賞を与えられません。`);
    return false;
  }
  daimyo.gold -= cost;
  const lord = lordOf(state, prov.ownerId);
  for (const general of garrison) {
    const rapport = lord ? affinityScore(general.affinity, lord.affinity) : 0.4;
    adjustLoyalty(state, general, Math.round(8 + rapport * 10));
  }
  addLog(state, `${prov.name}の武将に褒賞を与えた。（忠誠上昇）`);
  return true;
}

// Generals march out with their army, so provinces need a way to be re-staffed.
function transferGeneral(state, generalId, toProvinceId) {
  const general = state.generals[generalId];
  const from = getProvince(state, general.provinceId);
  const to = getProvince(state, toProvinceId);
  if (!general.alive || from.ownerId !== to.ownerId || !from.neighbors.includes(toProvinceId)) return false;
  general.provinceId = toProvinceId;
  addLog(state, `${general.name}が${from.name}から${to.name}へ移った。`);
  return true;
}

function killGeneral(state, general, reason) {
  general.alive = false;
  general.provinceId = null;
  addLog(state, `${general.name}が${reason}。`);
}

// Losers of a battle may fall, change sides, or leave the game entirely.
// Whether a captive bends the knee depends on how little he owed his old lord
// and how well he takes to the new one.
function settleDefeatedGenerals(state, defeated, newOwnerId) {
  const victor = newOwnerId ? lordOf(state, newOwnerId) : null;
  for (const general of defeated) {
    if (Math.random() < 0.25 - general.lead / 600) {
      killGeneral(state, general, '討死した');
      continue;
    }
    const rapport = victor ? affinityScore(general.affinity, victor.affinity) : 0.3;
    const willingness = clamp(0.25 + rapport * 0.5 + (70 - general.loyalty) / 150, 0.1, 0.92);
    if (newOwnerId && Math.random() < willingness) {
      general.loyalty = clamp(30 + rapport * 40, 15, 80);
      addLog(state, `${general.name}が${getDaimyo(state, newOwnerId).name}に降った。`);
    } else {
      general.alive = false;
      general.provinceId = null;
      addLog(state, `${general.name}が退去した。`);
    }
  }
}

function maxTroops(province) {
  return Math.round(province.kokudaka * 55);
}

function incomeOf(province) {
  return Math.round(province.kokudaka * 2.5);
}

function getProvince(state, id) {
  return state.provinces[id];
}

function getDaimyo(state, id) {
  return state.daimyos[id];
}

function isEnemyProvince(state, myOwnerId, otherProvinceId) {
  return state.provinces[otherProvinceId].ownerId !== myOwnerId;
}

function addLog(state, text) {
  state.log.unshift(text);
  if (state.log.length > 200) state.log.length = 200;
}

function developProvince(state, provinceId) {
  const prov = getProvince(state, provinceId);
  const daimyo = getDaimyo(state, prov.ownerId);
  const cost = 50;
  if (daimyo.gold < cost) {
    addLog(state, `${prov.name}: 資金不足で内政できません。`);
    return false;
  }
  if (prov.kokudaka >= KOKUDAKA_CAP) {
    addLog(state, `${prov.name}: これ以上開発できません（上限）。`);
    return false;
  }
  daimyo.gold -= cost;
  const administrator = bestAdministrator(state, provinceId);
  const gain = Math.max(1, Math.round((5 + Math.random() * 8) * administrationFactor(administrator)));
  prov.kokudaka = Math.min(KOKUDAKA_CAP, prov.kokudaka + gain);
  const by = administrator ? `${administrator.name}が` : '代官が';
  addLog(state, `${prov.name}で${by}内政を実施。石高+${gain}（${prov.kokudaka}）`);
  return true;
}

function recruitTroops(state, provinceId) {
  const prov = getProvince(state, provinceId);
  const daimyo = getDaimyo(state, prov.ownerId);
  const cap = maxTroops(prov);
  const room = cap - prov.troops;
  if (room <= 0) {
    addLog(state, `${prov.name}: 兵力は既に上限です。`);
    return false;
  }
  const administrator = bestAdministrator(state, provinceId);
  const affordable = Math.floor(daimyo.gold / 3);
  const ceiling = Math.max(20, Math.round(cap * 0.25 * administrationFactor(administrator)));
  const batch = Math.min(room, affordable, ceiling);
  if (batch <= 0) {
    addLog(state, `${prov.name}: 資金不足で徴兵できません。`);
    return false;
  }
  daimyo.gold -= batch * 3;
  prov.troops += batch;
  const by = administrator ? `${administrator.name}が` : '代官が';
  addLog(state, `${prov.name}で${by}徴兵。兵+${batch}（${prov.troops}/${cap}）`);
  return true;
}

function collectIncome(state) {
  for (const prov of Object.values(state.provinces)) {
    const daimyo = getDaimyo(state, prov.ownerId);
    daimyo.gold += incomeOf(prov);
  }
}

function checkGameOver(state) {
  const provinceList = Object.values(state.provinces);
  const playerOwnsAll = provinceList.every(p => p.ownerId === state.playerDaimyoId);
  if (playerOwnsAll) {
    return { victory: true, text: '天下統一を達成しました！' };
  }
  const playerOwnsAny = provinceList.some(p => p.ownerId === state.playerDaimyoId);
  if (!playerOwnsAny) {
    return { victory: false, text: '本拠地をすべて失い、家は滅亡しました…' };
  }
  return null;
}

function updateDaimyoAliveStatus(state) {
  for (const daimyo of Object.values(state.daimyos)) {
    daimyo.alive = Object.values(state.provinces).some(p => p.ownerId === daimyo.id);
  }
}
