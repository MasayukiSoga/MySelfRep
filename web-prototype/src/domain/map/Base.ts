import { Position } from "./Position.js";
import { BaseType } from "./BaseType.js";
import { MineResource } from "./MineResource.js";

// マップ上に配置されるものすべての総称
export interface Base {
  id: string;
  name: string;
  type: BaseType;
  position: Position;
  mineResource?: MineResource;
}
