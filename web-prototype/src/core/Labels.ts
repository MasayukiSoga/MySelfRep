import { BaseType } from "../domain/map/BaseType.js";
import { MineResource } from "../domain/map/MineResource.js";
import { Personality } from "../domain/character/Personality.js";
import { Gender } from "../domain/character/Gender.js";

// enum の画面表示用の名称
export function baseTypeLabel(type: BaseType): string {
  switch (type) {
    case BaseType.Capital: return "首都";
    case BaseType.City: return "街";
    case BaseType.Town: return "町";
    case BaseType.Village: return "村";
    case BaseType.Settlement: return "集落";
    case BaseType.Fort: return "砦";
    case BaseType.FortressCity: return "城塞都市";
    case BaseType.Stronghold: return "要塞";
    case BaseType.Dungeon: return "ダンジョン";
    case BaseType.Mine: return "鉱山";
    case BaseType.Unclassified: return "未分類";
  }
}

export function mineResourceLabel(resource: MineResource): string {
  switch (resource) {
    case MineResource.Gold: return "金山";
    case MineResource.Silver: return "銀山";
    case MineResource.Copper: return "銅山";
  }
}

export function personalityLabel(personality: Personality): string {
  switch (personality) {
    case Personality.ShortTempered: return "短気";
    case Personality.Brawny: return "脳筋";
    case Personality.Indecisive: return "優柔不断";
    case Personality.Logical: return "理路整然";
    case Personality.Realist: return "リアリスト";
  }
}

export function genderLabel(gender: Gender): string {
  switch (gender) {
    case Gender.Male: return "男";
    case Gender.Female: return "女";
    case Gender.Other: return "他";
  }
}
