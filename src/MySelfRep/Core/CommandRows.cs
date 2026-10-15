using MySelfRep.Domain.Command;

namespace MySelfRep.Core;

// コマンドツリーを罫線付き一覧の行に展開する。罫線は1文字=1マス（┃ ┣ ┗ 全角空白）
// DetailPrefix はこの行の下に結果を出すときの罫線
public sealed record CommandRow(CommandNode Node, string Prefix, string DetailPrefix);

public static class CommandRows
{
    public static List<CommandRow> Flatten(IReadOnlyList<CommandNode> nodes, string parentPrefix = "")
    {
        var rows = new List<CommandRow>();
        for (var i = 0; i < nodes.Count; i++)
        {
            var node = nodes[i];
            var isLast = i == nodes.Count - 1;
            var continuation = parentPrefix + (isLast ? "　　" : "┃　");
            rows.Add(new CommandRow(node, parentPrefix + (isLast ? "┗" : "┣"), continuation));
            if (node.Children is not null)
            {
                rows.AddRange(Flatten(node.Children, continuation));
            }
        }
        return rows;
    }
}
