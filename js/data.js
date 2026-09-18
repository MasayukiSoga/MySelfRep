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

// Generals. A general serves whoever owns the province they are stationed in,
// so conquest changes allegiance without any separate house field.
// lead = 統率 (damage soaked in battle), valor = 武勇 (damage dealt),
// politics = 政治 (development and recruitment).
const GENERALS = [
  { id: 'masamune',  name: '伊達政宗',   province: 'oshu',      lead: 92, valor: 85, politics: 88, lord: true, personality: 'ambitious', affinity: 12 },
  { id: 'kagetsuna', name: '片倉景綱',   province: 'oshu',      lead: 80, valor: 70, politics: 85, personality: 'devoted', affinity: 14 },
  { id: 'yoshiaki',  name: '最上義光',   province: 'dewa',      lead: 85, valor: 78, politics: 82, lord: true, personality: 'cunning', affinity: 18 },
  { id: 'hidetsuna', name: '鮭延秀綱',   province: 'dewa',      lead: 74, valor: 82, politics: 55, personality: 'bold', affinity: 20 },
  { id: 'kenshin',   name: '上杉謙信',   province: 'echigo',    lead: 98, valor: 95, politics: 70, lord: true, personality: 'devoted', affinity: 32 },
  { id: 'kanetsugu', name: '直江兼続',   province: 'echigo',    lead: 82, valor: 70, politics: 92, personality: 'cunning', affinity: 30 },
  { id: 'kakizaki',  name: '柿崎景家',   province: 'echigo',    lead: 80, valor: 92, politics: 45, personality: 'bold', affinity: 34 },
  { id: 'ujiyasu',   name: '北条氏康',   province: 'kanto',     lead: 94, valor: 82, politics: 96, lord: true, personality: 'steady', affinity: 55 },
  { id: 'tsunashige',name: '北条綱成',   province: 'kanto',     lead: 88, valor: 90, politics: 60, personality: 'bold', affinity: 57 },
  { id: 'fuma',      name: '風魔小太郎', province: 'kanto',     lead: 70, valor: 75, politics: 40, personality: 'cunning', affinity: 52 },
  { id: 'shingen',   name: '武田信玄',   province: 'kai',       lead: 96, valor: 85, politics: 94, lord: true, personality: 'cunning', affinity: 45 },
  { id: 'masakage',  name: '山県昌景',   province: 'kai',       lead: 90, valor: 92, politics: 65, personality: 'bold', affinity: 44 },
  { id: 'masanobu',  name: '高坂昌信',   province: 'kai',       lead: 86, valor: 75, politics: 78, personality: 'steady', affinity: 47 },
  { id: 'yoshikiyo', name: '村上義清',   province: 'shinano',   lead: 82, valor: 88, politics: 58, lord: true, personality: 'bold', affinity: 36 },
  { id: 'masayori',  name: '高梨政頼',   province: 'shinano',   lead: 70, valor: 68, politics: 60, personality: 'steady', affinity: 38 },
  { id: 'dosan',     name: '斎藤道三',   province: 'mino',      lead: 84, valor: 72, politics: 93, lord: true, personality: 'ambitious', affinity: 70 },
  { id: 'hanbei',    name: '竹中半兵衛', province: 'mino',      lead: 88, valor: 60, politics: 95, personality: 'cunning', affinity: 73 },
  { id: 'nobunaga',  name: '織田信長',   province: 'owari',     lead: 92, valor: 84, politics: 95, lord: true, personality: 'ambitious', affinity: 82 },
  { id: 'katsuie',   name: '柴田勝家',   province: 'owari',     lead: 88, valor: 94, politics: 55, personality: 'bold', affinity: 79 },
  { id: 'nagahide',  name: '丹羽長秀',   province: 'owari',     lead: 80, valor: 72, politics: 88, personality: 'steady', affinity: 81 },
  { id: 'tokichiro', name: '木下藤吉郎', province: 'owari',     lead: 85, valor: 68, politics: 92, personality: 'ambitious', affinity: 84 },
  { id: 'yoshimoto', name: '今川義元',   province: 'mikawa',    lead: 82, valor: 70, politics: 90, lord: true, personality: 'steady', affinity: 60 },
  { id: 'sessai',    name: '太原雪斎',   province: 'mikawa',    lead: 86, valor: 55, politics: 94, personality: 'cunning', affinity: 58 },
  { id: 'motoyasu',  name: '松平元康',   province: 'mikawa',    lead: 90, valor: 80, politics: 92, personality: 'cunning', affinity: 72 },
  { id: 'nagamasa',  name: '浅井長政',   province: 'omi',       lead: 86, valor: 88, politics: 75, lord: true, personality: 'devoted', affinity: 76 },
  { id: 'kazumasa',  name: '磯野員昌',   province: 'omi',       lead: 78, valor: 85, politics: 50, personality: 'bold', affinity: 74 },
  { id: 'yoshiteru', name: '足利義輝',   province: 'yamashiro', lead: 75, valor: 88, politics: 70, lord: true, personality: 'bold', affinity: 50 },
  { id: 'fujitaka',  name: '細川藤孝',   province: 'yamashiro', lead: 78, valor: 70, politics: 90, personality: 'cunning', affinity: 48 },
  { id: 'nagayoshi', name: '三好長慶',   province: 'settsu',    lead: 88, valor: 78, politics: 88, lord: true, personality: 'cunning', affinity: 65 },
  { id: 'hisahide',  name: '松永久秀',   province: 'settsu',    lead: 80, valor: 65, politics: 90, personality: 'ambitious', affinity: 67 },
  { id: 'motonari',  name: '毛利元就',   province: 'chugoku',   lead: 95, valor: 75, politics: 97, lord: true, personality: 'cunning', affinity: 25 },
  { id: 'motoharu',  name: '吉川元春',   province: 'chugoku',   lead: 90, valor: 92, politics: 70, personality: 'bold', affinity: 23 },
  { id: 'takakage',  name: '小早川隆景', province: 'chugoku',   lead: 89, valor: 78, politics: 93, personality: 'cunning', affinity: 27 },
  { id: 'motochika', name: '長宗我部元親', province: 'shikoku', lead: 90, valor: 85, politics: 85, lord: true, personality: 'ambitious', affinity: 15 },
  { id: 'chikayasu', name: '香宗我部親泰', province: 'shikoku', lead: 76, valor: 74, politics: 72, personality: 'steady', affinity: 17 },
  { id: 'yoshihisa', name: '島津義久',   province: 'kyushu',    lead: 88, valor: 75, politics: 90, lord: true, personality: 'steady', affinity: 5 },
  { id: 'yoshihiro', name: '島津義弘',   province: 'kyushu',    lead: 94, valor: 96, politics: 70, personality: 'bold', affinity: 3 },
  { id: 'iehisa',    name: '島津家久',   province: 'kyushu',    lead: 92, valor: 88, politics: 65, personality: 'bold', affinity: 7 },
];

// Personalities drive every decision a general makes, in the field and at home.
// oddsNeeded  : enemy-to-own troop ratio they are still willing to attack at
// aggression  : appetite for attacking at all once the odds are acceptable
// developBias : preference for 内政 over 徴兵 when staying home
// garrisonFloor: share of max troops they insist on keeping before marching
// loyaltyBias : where their loyalty settles regardless of affinity
// charge      : battlefield eagerness to close, vs. holding good ground
const PERSONALITIES = {
  bold:      { name: '猛将', oddsNeeded: 0.90, aggression: 0.60, developBias: 0.25, garrisonFloor: 0.35, loyaltyBias: 0,   charge: 1.0 },
  cunning:   { name: '智将', oddsNeeded: 0.55, aggression: 0.40, developBias: 0.70, garrisonFloor: 0.50, loyaltyBias: 0,   charge: 0.4 },
  steady:    { name: '堅実', oddsNeeded: 0.45, aggression: 0.22, developBias: 0.55, garrisonFloor: 0.60, loyaltyBias: 8,   charge: 0.2 },
  ambitious: { name: '野心', oddsNeeded: 0.80, aggression: 0.55, developBias: 0.45, garrisonFloor: 0.40, loyaltyBias: -18, charge: 0.7 },
  devoted:   { name: '忠義', oddsNeeded: 0.65, aggression: 0.38, developBias: 0.50, garrisonFloor: 0.50, loyaltyBias: 20,  charge: 0.6 },
};
