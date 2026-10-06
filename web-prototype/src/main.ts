import { BaseType } from "./domain/map/BaseType.js";
import { MineResource } from "./domain/map/MineResource.js";
import { Base } from "./domain/map/Base.js";
import { position } from "./domain/map/Position.js";
import { Personality } from "./domain/character/Personality.js";
import { Gender } from "./domain/character/Gender.js";
import { Character } from "./domain/character/Character.js";
import { GuildType } from "./domain/guild/GuildType.js";
import { GuildMembership, GuildRankStage } from "./domain/guild/GuildMembership.js";
import { TurnManager } from "./core/TurnManager.js";
import { PlayerState } from "./core/PlayerState.js";

// このファイルは画面確認用の簡易出力のみ。見た目の作り込みはせず、
// 上記ドメイン部分（C#へそのまま移植する対象）の動作確認に使う。

const capital: Base = {
  id: "base-001",
  name: "王都アルテシア",
  type: BaseType.Capital,
  position: position(120, 340),
};

const mine: Base = {
  id: "base-002",
  name: "黒鉄鉱山",
  type: BaseType.Mine,
  position: position(80, 410),
  mineResource: MineResource.Silver,
};

const character: Character = {
  id: "char-001",
  name: "サンプル武将",
  abilities: { leadership: 72, military: 65, politics: 40, strategy: 58 },
  personality: Personality.Logical,
  gender: Gender.Other,
  hyouka: 50,
};

const thiefGuildMembership: GuildMembership = {
  guild: GuildType.Thieves,
  stage: GuildRankStage.GuildTitle,
  stars: { stars: 2 },
};

const turn = new TurnManager();
turn.politicalPower = 10;
turn.advanceTurn();

const player = new PlayerState();
player.shinbou = 55;

const lines = [
  `拠点: ${capital.name} (${BaseType[capital.type]}) @ (${capital.position.x}, ${capital.position.y})`,
  `拠点: ${mine.name} (${BaseType[mine.type]} / ${MineResource[mine.mineResource!]})`,
  `人材: ${character.name} 統率${character.abilities.leadership} 性格:${Personality[character.personality]}`,
  `盗賊ギルド会員: 段階=${GuildRankStage[thiefGuildMembership.stage]} ⭐${thiefGuildMembership.stars.stars}`,
  `ターン: ${turn.currentTurn} 政治力: ${turn.politicalPower}`,
  `信望: ${player.shinbou}`,
];

const output = lines.join("\n");
console.log(output);

if (typeof document !== "undefined") {
  const out = document.getElementById("output");
  if (out) {
    out.textContent = output;
  }
}
