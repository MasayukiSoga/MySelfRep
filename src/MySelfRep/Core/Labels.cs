using MySelfRep.Domain.Character;
using MySelfRep.Domain.Map;

namespace MySelfRep.Core;

// enum の画面表示用の名称
public static class Labels
{
    public static string Of(BaseType type) => type switch
    {
        BaseType.Capital => "首都",
        BaseType.City => "街",
        BaseType.Town => "町",
        BaseType.Village => "村",
        BaseType.Settlement => "集落",
        BaseType.Fort => "砦",
        BaseType.FortressCity => "城塞都市",
        BaseType.Stronghold => "要塞",
        BaseType.Dungeon => "ダンジョン",
        BaseType.Mine => "鉱山",
        BaseType.Unclassified => "未分類",
        _ => type.ToString(),
    };

    public static string Of(MineResource resource) => resource switch
    {
        MineResource.Gold => "金山",
        MineResource.Silver => "銀山",
        MineResource.Copper => "銅山",
        _ => resource.ToString(),
    };

    public static string Of(Personality personality) => personality switch
    {
        Personality.ShortTempered => "短気",
        Personality.Brawny => "脳筋",
        Personality.Indecisive => "優柔不断",
        Personality.Logical => "理路整然",
        Personality.Realist => "リアリスト",
        _ => personality.ToString(),
    };

    public static string Of(Gender gender) => gender switch
    {
        Gender.Male => "男",
        Gender.Female => "女",
        Gender.Other => "他",
        _ => gender.ToString(),
    };
}
