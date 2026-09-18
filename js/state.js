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
    generals[def.id] = { ...def, provinceId: def.province, alive: true };
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
function settleDefeatedGenerals(state, defeated, newOwnerId) {
  for (const general of defeated) {
    const roll = Math.random();
    if (roll < 0.3) {
      killGeneral(state, general, '討死した');
    } else if (roll < 0.65 && newOwnerId) {
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
