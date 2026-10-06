import { CommandNode } from "../domain/command/CommandNode.js";

// コマンドツリーの階層移動と選択状態を管理する
export class TextMenu {
  private readonly path: CommandNode[] = [];
  selectedIndex = -1;

  constructor(private readonly root: CommandNode[]) {}

  get options(): CommandNode[] {
    const current = this.path[this.path.length - 1];
    return current ? current.children ?? [] : this.root;
  }

  get breadcrumb(): string {
    return ["コマンド", ...this.path.map((n) => n.name)].join(" > ");
  }

  get canGoBack(): boolean {
    return this.path.length > 0;
  }

  get selected(): CommandNode | undefined {
    return this.options[this.selectedIndex];
  }

  // 1回目の選択で説明を表示し、同じ項目をもう一度選ぶと決定する。
  // 決定したのが末端のコマンドならそれを返す
  choose(index: number): CommandNode | undefined {
    const option = this.options[index];
    if (!option) return undefined;

    if (this.selectedIndex !== index) {
      this.selectedIndex = index;
      return undefined;
    }

    if (option.children && option.children.length > 0) {
      this.path.push(option);
      this.selectedIndex = -1;
      return undefined;
    }

    return option;
  }

  back(): void {
    if (this.path.length === 0) return;
    this.path.pop();
    this.selectedIndex = -1;
  }
}
