namespace MySelfRep.Domain.Character;

// 能力パラメータ
public class Abilities
{
    public int Leadership { get; set; } // 統率: 全体に影響
    public int Military { get; set; }   // 軍事: 戦闘における各コマンドに影響
    public int Politics { get; set; }   // 政治: 政治的な駆け引きに影響
    public int Strategy { get; set; }   // 知略: 主に調略関連に影響
}
