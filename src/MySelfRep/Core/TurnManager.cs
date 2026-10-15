namespace MySelfRep.Core;

// ターン制の進行と、1ターンにつき持つ政治力を管理する
public class TurnManager
{
    public int CurrentTurn { get; private set; } = 1;

    // 行動ごとに消費し、利用可能なコマンド数を制限する
    public int PoliticalPower { get; set; }

    public void AdvanceTurn()
    {
        CurrentTurn++;
    }
}
