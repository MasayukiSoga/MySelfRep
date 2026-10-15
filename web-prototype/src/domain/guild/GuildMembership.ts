import { GuildType } from "./GuildType.js";
import { StarRank } from "../role/StarRank.js";

// ギルド共通の二段階昇格ランク
// 1. ⭐️5でギルド名と同じ称号に昇格（例: 盗賊ギルド→「盗賊」）
// 2. 昇格後さらに⭐️5でそのギルド専門の固有称号を得る（例: 盗賊ギルド→「陽炎」）
export enum GuildRankStage {
  Member,
  GuildTitle,
  UniqueTitle,
}

export interface GuildMembership {
  guild: GuildType;
  stage: GuildRankStage;
  stars: StarRank;
}
