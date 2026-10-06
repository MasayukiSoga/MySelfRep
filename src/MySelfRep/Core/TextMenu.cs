using MySelfRep.Domain.Command;

namespace MySelfRep.Core;

// コマンドツリーの階層移動と選択状態を管理する
public class TextMenu
{
    private readonly IReadOnlyList<CommandNode> _root;
    private readonly List<CommandNode> _path = new();

    public TextMenu(IReadOnlyList<CommandNode> root)
    {
        _root = root;
    }

    public int SelectedIndex { get; private set; } = -1;

    public IReadOnlyList<CommandNode> Options =>
        _path.Count > 0 ? _path[^1].Children ?? Array.Empty<CommandNode>() : _root;

    public string Breadcrumb => string.Join(" > ", new[] { "コマンド" }.Concat(_path.Select(n => n.Name)));

    public bool CanGoBack => _path.Count > 0;

    public CommandNode? Selected =>
        SelectedIndex >= 0 && SelectedIndex < Options.Count ? Options[SelectedIndex] : null;

    // 1回目の選択で説明を表示し、同じ項目をもう一度選ぶと決定する。
    // 決定したのが末端のコマンドならそれを返す
    public CommandNode? Choose(int index)
    {
        if (index < 0 || index >= Options.Count) return null;
        var option = Options[index];

        if (SelectedIndex != index)
        {
            SelectedIndex = index;
            return null;
        }

        if (option.Children is { Count: > 0 })
        {
            _path.Add(option);
            SelectedIndex = -1;
            return null;
        }

        return option;
    }

    public void Back()
    {
        if (_path.Count == 0) return;
        _path.RemoveAt(_path.Count - 1);
        SelectedIndex = -1;
    }
}
