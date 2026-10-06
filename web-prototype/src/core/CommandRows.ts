import { CommandNode } from "../domain/command/CommandNode.js";

// コマンドツリーを罫線付き一覧の行に展開する。罫線は1文字=1マス（┃ ┣ ┗ 全角空白）
export interface CommandRow {
  node: CommandNode;
  prefix: string;
  // この行の下に結果を出すときの罫線
  detailPrefix: string;
}

export function flattenCommands(nodes: CommandNode[], parentPrefix = ""): CommandRow[] {
  const rows: CommandRow[] = [];
  nodes.forEach((node, i) => {
    const isLast = i === nodes.length - 1;
    const continuation = parentPrefix + (isLast ? "　　" : "┃　");
    rows.push({ node, prefix: parentPrefix + (isLast ? "┗" : "┣"), detailPrefix: continuation });
    if (node.children) {
      rows.push(...flattenCommands(node.children, continuation));
    }
  });
  return rows;
}
