using MySelfRep.Domain.Map;

namespace MySelfRep.Core;

public class World
{
    public required TurnManager Turn { get; init; }
    public required PlayerState Player { get; init; }
    public required List<Base> Bases { get; init; }
    public required List<Domain.Character.Character> Characters { get; init; }
}
