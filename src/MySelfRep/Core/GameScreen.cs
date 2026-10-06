using MySelfRep.Domain.Command;

namespace MySelfRep.Core;

// 画面に出すものはすべて文字列。描画側はこれをそのまま表示し、
// 入力は TapRow に渡すだけにする
public sealed record MenuRow(string Prefix, string Name, bool IsGroup, string DetailPrefix, IReadOnlyList<string> Detail);

public sealed record ScreenModel(string Status, string Title, IReadOnlyList<MenuRow> Rows, int SelectedIndex, string Description);

public class GameScreen
{
    private const string Hint = "項目を選ぶと説明を表示します。コマンドをもう一度選ぶと、その下に結果を表示します。";

    private readonly World _world;
    private readonly List<CommandRow> _rows = CommandRows.Flatten(CommandTree.Root);
    private int _selectedIndex = -1;
    private int _openIndex = -1;

    public GameScreen(World world)
    {
        _world = world;
    }

    public ScreenModel Render() => new(
        $"ターン {_world.Turn.CurrentTurn}　政治力 {_world.Turn.PoliticalPower}　信望 {_world.Player.Shinbou}",
        "コマンド",
        _rows.Select((r, i) => new MenuRow(
            r.Prefix,
            r.Node.Name,
            r.Node.Children is not null,
            r.DetailPrefix,
            i == _openIndex ? Execute(r.Node) : Array.Empty<string>())).ToList(),
        _selectedIndex,
        _selectedIndex >= 0 && _selectedIndex < _rows.Count ? _rows[_selectedIndex].Node.Description : Hint);

    // 1回目で選択して説明を表示、同じコマンドをもう一度選ぶと結果の表示を切り替える
    public void TapRow(int index)
    {
        if (index < 0 || index >= _rows.Count) return;
        if (_selectedIndex != index)
        {
            _selectedIndex = index;
            return;
        }
        if (_rows[index].Node.Children is not null) return;
        _openIndex = _openIndex == index ? -1 : index;
    }

    private IReadOnlyList<string> Execute(CommandNode command) => command.Name switch
    {
        "世界情勢" => _world.Bases.Select(b =>
        {
            var mine = b.MineResource is { } r ? $"（{Labels.Of(r)}）" : "";
            return $"{b.Name}　{Labels.Of(b.Type)}{mine}　座標({b.Position.X}, {b.Position.Y})";
        }).ToList(),
        "人材調査状況" => _world.Characters.SelectMany(c => new[]
        {
            $"{c.Name}　{Labels.Of(c.Gender)}　性格:{Labels.Of(c.Personality)}",
            $"統率{c.Abilities.Leadership}　軍事{c.Abilities.Military}　政治{c.Abilities.Politics}　知略{c.Abilities.Strategy}",
        }).ToList(),
        "信望" => new[] { $"世界からの信望: {_world.Player.Shinbou}" },
        "評価" => _world.Characters.Select(c => $"{c.Name}　評価 {c.Hyouka}").ToList(),
        "歴史" => new[] { "記録はまだありません。" },
        _ => new[] { "このコマンドは未実装です。" },
    };
}
