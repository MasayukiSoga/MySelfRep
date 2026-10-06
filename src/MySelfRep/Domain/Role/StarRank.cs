namespace MySelfRep.Domain.Role;

// 同一組織内に上下関係がある役職・ギルドで共通の⭐️蓄積ランク
public readonly record struct StarRank(int Stars)
{
    public const int Max = 5;
}
