import { Abilities } from "./Abilities.js";
import { Personality } from "./Personality.js";
import { Gender } from "./Gender.js";

export interface Character {
  id: string;
  name: string;
  abilities: Abilities;
  personality: Personality;
  gender: Gender;

  // プレイヤーからこの人物へ向ける評価（信望とは別概念）
  hyouka: number;
}
