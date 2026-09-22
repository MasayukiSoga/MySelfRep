namespace MySelfRep.Domain.Map;

// マップ上に配置されるものすべての総称
public class Base
{
    public required string Id { get; init; }
    public required string Name { get; init; }
    public required BaseType Type { get; init; }
    public required Position Position { get; init; }
    public MineResource? MineResource { get; init; }
}
