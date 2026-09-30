import { mulberry32, pick, randInt, randomSeed, type Rng } from '../portrait/rng';
import type { Archetype } from '../portrait/portrait';

export interface Character {
  id: number;
  name: string;
  female: boolean;
  age: number;
  leadership: number;
  war: number;
  intelligence: number;
  politics: number;
  archetype: Archetype;
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
const FEMALE_GIVEN = ['市', '濃', '松', '江', '初', '茶々', '千代', '菊', '桜', '楓', '雪', '小夜', '綾', '蘭', '藤', '椿', '葵', '紅', '静', '百合'];

const FEMALE_RATIO = 0.25;

function stat(rng: Rng): number {
  const base = randInt(rng, 20, 75);
  return rng() < 0.08 ? Math.min(100, base + randInt(rng, 15, 30)) : base;
}

function chooseArchetype(rng: Rng, female: boolean, age: number, war: number, intelligence: number): Archetype {
  if (female) {
    const cuteChance = age < 20 ? 0.8 : age < 30 ? 0.4 : 0.1;
    return rng() < cuteChance ? 'cute' : 'beauty';
  }
  if (age < 22) return rng() < 0.8 ? 'cool' : 'rugged';
  const ruggedChance = war > intelligence + 10 ? 0.75 : intelligence > war + 10 ? 0.25 : 0.5;
  return rng() < ruggedChance ? 'rugged' : 'cool';
}

export function generateCharacters(count: number, worldSeed = 1): Character[] {
  const list: Character[] = new Array(count);
  for (let id = 0; id < count; id++) {
    const rng = mulberry32(worldSeed * 1_000_003 + id);
    const female = rng() < FEMALE_RATIO;
    const age = female ? randInt(rng, 14, 45) : randInt(rng, 15, 70);

    let given: string;
    if (female) {
      given = pick(rng, FEMALE_GIVEN) + (age < 25 && rng() < 0.5 ? '姫' : '');
    } else {
      const first = pick(rng, GIVEN_FIRST);
      let second = pick(rng, GIVEN_SECOND);
      while (second === first) second = pick(rng, GIVEN_SECOND);
      given = first + second;
    }

    const leadership = stat(rng);
    const war = stat(rng);
    const intelligence = stat(rng);
    const politics = stat(rng);

    list[id] = {
      id,
      name: `${pick(rng, SURNAMES)}${given}`,
      female,
      age,
      leadership,
      war,
      intelligence,
      politics,
      archetype: chooseArchetype(rng, female, age, war, intelligence),
      portraitSeed: randomSeed(rng),
    };
  }
  return list;
}
