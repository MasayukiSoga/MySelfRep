using MySelfRep.Domain.Character;
using MySelfRep.Domain.Map;

namespace MySelfRep.Core;

// 動作確認用のサンプルデータ（数値は仮）
public static class SampleWorld
{
    public static World Create() => new()
    {
        Turn = new TurnManager { PoliticalPower = 10 },
        Player = new PlayerState { Shinbou = 55 },
        Bases = new List<Base>
        {
            new() { Id = "base-001", Name = "王都アルテシア", Type = BaseType.Capital, Position = new Position(120, 340) },
            new() { Id = "base-002", Name = "黒鉄鉱山", Type = BaseType.Mine, Position = new Position(80, 410), MineResource = MineResource.Silver },
            new() { Id = "base-003", Name = "霧谷の砦", Type = BaseType.Fort, Position = new Position(210, 290) },
            new() { Id = "base-004", Name = "灰の集落", Type = BaseType.Settlement, Position = new Position(150, 460) },
        },
        Characters = new List<Domain.Character.Character>
        {
            new()
            {
                Id = "char-001",
                Name = "ラウル",
                Abilities = new Abilities { Leadership = 72, Military = 65, Politics = 40, Strategy = 58 },
                Personality = Personality.Logical,
                Gender = Gender.Male,
                Hyouka = 50,
            },
            new()
            {
                Id = "char-002",
                Name = "セナ",
                Abilities = new Abilities { Leadership = 35, Military = 28, Politics = 81, Strategy = 77 },
                Personality = Personality.Realist,
                Gender = Gender.Female,
                Hyouka = 62,
            },
        },
    };
}
