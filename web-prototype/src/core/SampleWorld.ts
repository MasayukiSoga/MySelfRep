import { BaseType } from "../domain/map/BaseType.js";
import { MineResource } from "../domain/map/MineResource.js";
import { position } from "../domain/map/Position.js";
import { Personality } from "../domain/character/Personality.js";
import { Gender } from "../domain/character/Gender.js";
import { TurnManager } from "./TurnManager.js";
import { PlayerState } from "./PlayerState.js";
import { World } from "./World.js";

// 動作確認用のサンプルデータ（数値は仮）
export function createSampleWorld(): World {
  const turn = new TurnManager();
  turn.politicalPower = 10;

  const player = new PlayerState();
  player.shinbou = 55;

  return {
    turn,
    player,
    bases: [
      { id: "base-001", name: "王都アルテシア", type: BaseType.Capital, position: position(120, 340) },
      { id: "base-002", name: "黒鉄鉱山", type: BaseType.Mine, position: position(80, 410), mineResource: MineResource.Silver },
      { id: "base-003", name: "霧谷の砦", type: BaseType.Fort, position: position(210, 290) },
      { id: "base-004", name: "灰の集落", type: BaseType.Settlement, position: position(150, 460) },
    ],
    characters: [
      {
        id: "char-001",
        name: "ラウル",
        abilities: { leadership: 72, military: 65, politics: 40, strategy: 58 },
        personality: Personality.Logical,
        gender: Gender.Male,
        hyouka: 50,
      },
      {
        id: "char-002",
        name: "セナ",
        abilities: { leadership: 35, military: 28, politics: 81, strategy: 77 },
        personality: Personality.Realist,
        gender: Gender.Female,
        hyouka: 62,
      },
    ],
  };
}
