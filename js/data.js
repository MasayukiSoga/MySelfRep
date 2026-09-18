// Static map data: provinces and the daimyo houses that start in them.

const PROVINCES = [
  { id: 'oshu',     name: '奥州',   x: 460, y: 40,  kokudaka: 70,  terrain: 'mountain', neighbors: ['dewa', 'kanto'] },
  { id: 'dewa',     name: '出羽',   x: 370, y: 70,  kokudaka: 55,  terrain: 'mountain', neighbors: ['oshu', 'echigo'] },
  { id: 'echigo',   name: '越後',   x: 350, y: 150, kokudaka: 75,  terrain: 'river',    neighbors: ['dewa', 'shinano', 'kanto'] },
  { id: 'kanto',    name: '関東',   x: 460, y: 150, kokudaka: 110, terrain: 'plain',    neighbors: ['oshu', 'echigo', 'shinano', 'kai'] },
  { id: 'kai',      name: '甲斐',   x: 420, y: 220, kokudaka: 55,  terrain: 'mountain', neighbors: ['kanto', 'shinano', 'owari', 'mikawa'] },
  { id: 'shinano',  name: '信濃',   x: 350, y: 220, kokudaka: 65,  terrain: 'mountain', neighbors: ['echigo', 'kanto', 'kai', 'mino'] },
  { id: 'mino',     name: '美濃',   x: 290, y: 270, kokudaka: 85,  terrain: 'forest',   neighbors: ['shinano', 'owari', 'omi'] },
  { id: 'owari',    name: '尾張',   x: 340, y: 320, kokudaka: 95,  terrain: 'plain',    neighbors: ['kai', 'mino', 'mikawa'] },
  { id: 'mikawa',   name: '三河',   x: 400, y: 320, kokudaka: 60,  terrain: 'plain',    neighbors: ['owari', 'kai'] },
  { id: 'omi',      name: '近江',   x: 230, y: 300, kokudaka: 80,  terrain: 'river',    neighbors: ['mino', 'yamashiro'] },
  { id: 'yamashiro',name: '山城',   x: 190, y: 350, kokudaka: 105, terrain: 'forest',   neighbors: ['omi', 'settsu'] },
  { id: 'settsu',   name: '摂津',   x: 150, y: 390, kokudaka: 85,  terrain: 'river',    neighbors: ['yamashiro', 'chugoku'] },
  { id: 'chugoku',  name: '中国',   x: 80,  y: 410, kokudaka: 95,  terrain: 'forest',   neighbors: ['settsu', 'shikoku', 'kyushu'] },
  { id: 'shikoku',  name: '四国',   x: 150, y: 460, kokudaka: 55,  terrain: 'mountain', neighbors: ['chugoku'] },
  { id: 'kyushu',   name: '九州',   x: 30,  y: 460, kokudaka: 90,  terrain: 'forest',   neighbors: ['chugoku'] },
];

// Which daimyo house starts in each province, and its display color.
// 'owari' is the player's house (Oda).
const DAIMYO_META = {
  oshu:      { name: '伊達家', color: '#7a4fb5' },
  dewa:      { name: '最上家', color: '#4f9ab5' },
  echigo:    { name: '上杉家', color: '#4f6fb5' },
  kanto:     { name: '北条家', color: '#b58c4f' },
  kai:       { name: '武田家', color: '#b54f4f' },
  shinano:   { name: '村上家', color: '#8cb54f' },
  mino:      { name: '斎藤家', color: '#b5a04f' },
  owari:     { name: '織田家', color: '#2b6fd1', isPlayer: true },
  mikawa:    { name: '今川家', color: '#4fb58c' },
  omi:       { name: '浅井家', color: '#af4fb5' },
  yamashiro: { name: '足利家', color: '#b54f9a' },
  settsu:    { name: '三好家', color: '#5fb54f' },
  chugoku:   { name: '毛利家', color: '#4fb5ae' },
  shikoku:   { name: '長宗我部家', color: '#b57a4f' },
  kyushu:    { name: '島津家', color: '#b54f6f' },
};
