using MySelfRep.Domain.Role;

namespace MySelfRep.Domain.Guild;

// ギルド共通の二段階昇格ランク
// 1. ⭐️5でギルド名と同じ称号に昇格（例: 盗賊ギルド→「盗賊」）
// 2. 昇格後さらに⭐️5でそのギルド専門の固有称号を得る（例: 盗賊ギルド→「陽炎」）
public enum GuildRankStage
{
    Member,
    GuildTitle,
    UniqueTitle,
}

public class GuildMembership
{
    public required GuildType Guild { get; init; }
    public GuildRankStage Stage { get; set; } = GuildRankStage.Member;
    public StarRank Stars { get; set; }
}
