namespace MySelfRep.Domain.Map;

// 拠点の種別
public enum BaseType
{
    Capital,      // 首都
    City,         // 街
    Town,         // 町
    Village,      // 村
    Settlement,   // 集落
    Fort,         // 砦
    FortressCity, // 城塞都市
    Stronghold,   // 要塞
    Dungeon,      // ダンジョン
    Mine,         // 鉱山
    Unclassified, // その他未分類の場所（盗賊のアジト、〜教の秘密の隠れ家 等）
}
