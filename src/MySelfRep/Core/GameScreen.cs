using MySelfRep.Domain.Command;

namespace MySelfRep.Core;

// 画面に出すものはすべて文字列。描画側はこれをそのまま表示し、
// 入力は TapOption / TapBack に渡すだけにする
public sealed record ScreenModel(
    string Status,
    string Title,
    IReadOnlyList<string> Body,
    IReadOnlyList<string> Options,
    int SelectedIndex,
    string Description,
    bool CanGoBack);

public class GameScreen
{
    private const string Hint = "項目を選ぶと説明を表示します。同じ項目をもう一度選ぶと決定します。";

    private readonly World _world;
    private readonly TextMenu _menu = new(CommandTree.Root);
    private (string Title, IReadOnlyList<string> Body)? _result;

    public GameScreen(World world)
    {
        _world = world;
    }

    public ScreenModel Render()
    {
        var status = $"ターン {_world.Turn.CurrentTurn}　政治力 {_world.Turn.PoliticalPower}　信望 {_world.Player.Shinbou}";

        if (_result is { } result)
        {
            return new ScreenModel(status, result.Title, result.Body, Array.Empty<string>(), -1, "", true);
        }

        return new ScreenModel(
            status,
            _menu.Breadcrumb,
            Array.Empty<string>(),
            _menu.Options.Select(o => o.Children is not null ? $"{o.Name} ▸" : o.Name).ToList(),
            _menu.SelectedIndex,
            _menu.Selected?.Description ?? Hint,
            _menu.CanGoBack);
    }

    public void TapOption(int index)
    {
        if (_result is not null) return;
        var decided = _menu.Choose(index);
        if (decided is not null)
        {
            _result = ($"{_menu.Breadcrumb} > {decided.Name}", Execute(decided));
        }
    }

    public void TapBack()
    {
        if (_result is not null)
        {
            _result = null;
            return;
        }
        _menu.Back();
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
            $"　統率{c.Abilities.Leadership}　軍事{c.Abilities.Military}　政治{c.Abilities.Politics}　知略{c.Abilities.Strategy}",
        }).ToList(),
        "信望" => new[] { $"世界からの信望: {_world.Player.Shinbou}" },
        "評価" => _world.Characters.Select(c => $"{c.Name}　評価 {c.Hyouka}").ToList(),
        "歴史" => new[] { "記録はまだありません。" },
        _ => new[] { command.Description, "", "このコマンドは未実装です。" },
    };
}
