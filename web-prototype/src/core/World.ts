import { Base } from "../domain/map/Base.js";
import { Character } from "../domain/character/Character.js";
import { TurnManager } from "./TurnManager.js";
import { PlayerState } from "./PlayerState.js";

export interface World {
  turn: TurnManager;
  player: PlayerState;
  bases: Base[];
  characters: Character[];
}
