import { COMMAND_TREE } from "../domain/command/CommandTree.js";
import { CommandNode } from "../domain/command/CommandNode.js";
import { TextMenu } from "./TextMenu.js";
import { World } from "./World.js";
import { baseTypeLabel, genderLabel, mineResourceLabel, personalityLabel } from "./Labels.js";

// 画面に出すものはすべて文字列。描画側はこれをそのまま表示し、
// 入力は tapOption / tapBack に渡すだけにする
export interface ScreenModel {
  status: string;
  title: string;
  body: string[];
  options: string[];
  selectedIndex: number;
  description: string;
  canGoBack: boolean;
}

const HINT = "項目を選ぶと説明を表示します。同じ項目をもう一度選ぶと決定します。";

export class GameScreen {
  private readonly menu = new TextMenu(COMMAND_TREE);
  private result: { title: string; body: string[] } | undefined;

  constructor(private readonly world: World) {}

  render(): ScreenModel {
    const status = `ターン ${this.world.turn.currentTurn}　政治力 ${this.world.turn.politicalPower}　信望 ${this.world.player.shinbou}`;

    if (this.result) {
      return {
        status,
        title: this.result.title,
        body: this.result.body,
        options: [],
        selectedIndex: -1,
        description: "",
        canGoBack: true,
      };
    }

    return {
      status,
      title: this.menu.breadcrumb,
      body: [],
      options: this.menu.options.map((o) => (o.children ? `${o.name} ▸` : o.name)),
      selectedIndex: this.menu.selectedIndex,
      description: this.menu.selected?.description ?? HINT,
      canGoBack: this.menu.canGoBack,
    };
  }

  tapOption(index: number): void {
    if (this.result) return;
    const decided = this.menu.choose(index);
    if (decided) {
      this.result = { title: `${this.menu.breadcrumb} > ${decided.name}`, body: this.execute(decided) };
    }
  }

  tapBack(): void {
    if (this.result) {
      this.result = undefined;
      return;
    }
    this.menu.back();
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
          `　統率${c.abilities.leadership}　軍事${c.abilities.military}　政治${c.abilities.politics}　知略${c.abilities.strategy}`,
        ]);
      case "信望":
        return [`世界からの信望: ${this.world.player.shinbou}`];
      case "評価":
        return this.world.characters.map((c) => `${c.name}　評価 ${c.hyouka}`);
      case "歴史":
        return ["記録はまだありません。"];
      default:
        return [command.description, "", "このコマンドは未実装です。"];
    }
  }
}
