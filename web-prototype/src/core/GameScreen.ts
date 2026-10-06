import { COMMAND_TREE } from "../domain/command/CommandTree.js";
import { CommandNode } from "../domain/command/CommandNode.js";
import { CommandRow, flattenCommands } from "./CommandRows.js";
import { World } from "./World.js";
import { baseTypeLabel, genderLabel, mineResourceLabel, personalityLabel } from "./Labels.js";

// 画面に出すものはすべて文字列。描画側はこれをそのまま表示し、
// 入力は tapRow に渡すだけにする
export interface MenuRow {
  prefix: string;
  name: string;
  isGroup: boolean;
  detailPrefix: string;
  detail: string[];
}

export interface ScreenModel {
  status: string;
  title: string;
  rows: MenuRow[];
  selectedIndex: number;
  description: string;
}

const HINT = "項目を選ぶと説明を表示します。コマンドをもう一度選ぶと、その下に結果を表示します。";

export class GameScreen {
  private readonly rows: CommandRow[] = flattenCommands(COMMAND_TREE);
  private selectedIndex = -1;
  private openIndex = -1;

  constructor(private readonly world: World) {}

  render(): ScreenModel {
    return {
      status: `ターン ${this.world.turn.currentTurn}　政治力 ${this.world.turn.politicalPower}　信望 ${this.world.player.shinbou}`,
      title: "コマンド",
      rows: this.rows.map((r, i) => ({
        prefix: r.prefix,
        name: r.node.name,
        isGroup: r.node.children !== undefined,
        detailPrefix: r.detailPrefix,
        detail: i === this.openIndex ? this.execute(r.node) : [],
      })),
      selectedIndex: this.selectedIndex,
      description: this.rows[this.selectedIndex]?.node.description ?? HINT,
    };
  }

  // 1回目で選択して説明を表示、同じコマンドをもう一度選ぶと結果の表示を切り替える
  tapRow(index: number): void {
    const row = this.rows[index];
    if (!row) return;
    if (this.selectedIndex !== index) {
      this.selectedIndex = index;
      return;
    }
    if (row.node.children) return;
    this.openIndex = this.openIndex === index ? -1 : index;
  }

  private execute(command: CommandNode): string[] {
    switch (command.name) {
      case "世界情勢":
        return this.world.bases.map((b) => {
          const mine = b.mineResource !== undefined ? `（${mineResourceLabel(b.mineResource)}）` : "";
          return `${b.name}　${baseTypeLabel(b.type)}${mine}　座標(${b.position.x}, ${b.position.y})`;
        });
      case "人材調査状況":
        return this.world.characters.flatMap((c) => [
          `${c.name}　${genderLabel(c.gender)}　性格:${personalityLabel(c.personality)}`,
          `統率${c.abilities.leadership}　軍事${c.abilities.military}　政治${c.abilities.politics}　知略${c.abilities.strategy}`,
        ]);
      case "信望":
        return [`世界からの信望: ${this.world.player.shinbou}`];
      case "評価":
        return this.world.characters.map((c) => `${c.name}　評価 ${c.hyouka}`);
      case "歴史":
        return ["記録はまだありません。"];
      default:
        return ["このコマンドは未実装です。"];
    }
  }
}
