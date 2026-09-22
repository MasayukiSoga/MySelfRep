namespace MySelfRep.Domain.Character;

public class Character
{
    public required string Id { get; init; }
    public required string Name { get; init; }
    public required Abilities Abilities { get; init; }
    public Personality Personality { get; set; }
    public Gender Gender { get; set; }

    // プレイヤーからこの人物へ向ける評価（信望とは別概念）
    public int Hyouka { get; set; }
}
