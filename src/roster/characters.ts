import { mulberry32, pick, randInt, randomSeed } from '../portrait/rng';

export interface Character {
  id: number;
  name: string;
  age: number;
  leadership: number;
  war: number;
  intelligence: number;
  politics: number;
  portraitSeed: number;
}

const SURNAMES = [
  '織田', '武田', '上杉', '北条', '今川', '毛利', '島津', '伊達', '長宗我部', '浅井',
  '朝倉', '斎藤', '松平', '真田', '前田', '柴田', '丹羽', '明智', '佐々', '滝川',
  '本多', '酒井', '榊原', '井伊', '山県', '馬場', '高坂', '内藤', '直江', '柿崎',
  '竹中', '黒田', '蜂須賀', '加藤', '福島', '石田', '大谷', '小早川', '吉川', '宇喜多',
];
const GIVEN_FIRST = ['信', '勝', '景', '義', '長', '秀', '家', '政', '元', '氏', '輝', '昌', '光', '利', '忠', '正', '直', '重', '康', '清', '宗', '綱', '盛', '頼'];
const GIVEN_SECOND = ['長', '家', '勝', '虎', '綱', '信', '久', '秀', '成', '政', '継', '春', '房', '茂', '時', '忠', '行', '高', '則', '景', '元', '豊'];

function stat(rng: () => number): number {
  const base = randInt(rng, 20, 75);
  return rng() < 0.08 ? Math.min(100, base + randInt(rng, 15, 30)) : base;
}

export function generateCharacters(count: number, worldSeed = 1): Character[] {
  const list: Character[] = new Array(count);
  for (let id = 0; id < count; id++) {
    const rng = mulberry32(worldSeed * 1_000_003 + id);
    const first = pick(rng, GIVEN_FIRST);
    let second = pick(rng, GIVEN_SECOND);
    while (second === first) second = pick(rng, GIVEN_SECOND);

    list[id] = {
      id,
      name: `${pick(rng, SURNAMES)}${first}${second}`,
      age: randInt(rng, 15, 70),
      leadership: stat(rng),
      war: stat(rng),
      intelligence: stat(rng),
      politics: stat(rng),
      portraitSeed: randomSeed(rng),
    };
  }
  return list;
}
