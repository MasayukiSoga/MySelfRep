import { PROVINCES, DAIMYO_META } from './data.js';

const KOKUDAKA_CAP = 300;
const STARTING_GOLD = 600;

export function createInitialState() {
  const provinces = {};
  const daimyos = {};

  for (const def of PROVINCES) {
    provinces[def.id] = {
      id: def.id,
      name: def.name,
      x: def.x,
      y: def.y,
      neighbors: def.neighbors.slice(),
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

  return {
    turn: 1,
    provinces,
    daimyos,
    playerDaimyoId: 'owari',
    actedProvinces: new Set(),
    selectedProvinceId: null,
    pendingAttackFrom: null, // when choosing a target province to attack
    log: [],
    battle: null, // active battle state, or null
    gameOver: null, // { victory: bool, text } or null
  };
}

export function maxTroops(province) {
  return Math.round(province.kokudaka * 55);
}

export function incomeOf(province) {
  return Math.round(province.kokudaka * 2.5);
}

export function getProvince(state, id) {
  return state.provinces[id];
}

export function getDaimyo(state, id) {
  return state.daimyos[id];
}

export function isEnemyProvince(state, myOwnerId, otherProvinceId) {
  return state.provinces[otherProvinceId].ownerId !== myOwnerId;
}

export function addLog(state, text) {
  state.log.unshift(text);
  if (state.log.length > 200) state.log.length = 200;
}

export function developProvince(state, provinceId) {
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
  const gain = 5 + Math.floor(Math.random() * 8);
  prov.kokudaka = Math.min(KOKUDAKA_CAP, prov.kokudaka + gain);
  addLog(state, `${prov.name}で内政を実施。石高+${gain}（${prov.kokudaka}）`);
  return true;
}

export function recruitTroops(state, provinceId) {
  const prov = getProvince(state, provinceId);
  const daimyo = getDaimyo(state, prov.ownerId);
  const cap = maxTroops(prov);
  const room = cap - prov.troops;
  if (room <= 0) {
    addLog(state, `${prov.name}: 兵力は既に上限です。`);
    return false;
  }
  const affordable = Math.floor(daimyo.gold / 3);
  const batch = Math.min(room, affordable, Math.max(20, Math.round(cap * 0.25)));
  if (batch <= 0) {
    addLog(state, `${prov.name}: 資金不足で徴兵できません。`);
    return false;
  }
  daimyo.gold -= batch * 3;
  prov.troops += batch;
  addLog(state, `${prov.name}で徴兵。兵+${batch}（${prov.troops}/${cap}）`);
  return true;
}

export function collectIncome(state) {
  for (const prov of Object.values(state.provinces)) {
    const daimyo = getDaimyo(state, prov.ownerId);
    daimyo.gold += incomeOf(prov);
  }
}

export function checkGameOver(state) {
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

export function updateDaimyoAliveStatus(state) {
  for (const daimyo of Object.values(state.daimyos)) {
    daimyo.alive = Object.values(state.provinces).some(p => p.ownerId === daimyo.id);
  }
}
