namespace MySelfRep.Domain.Role;

// 役職。就いている役職によって利用可能なコマンドが変化する想定
public enum RoleType
{
    Monarch,    // 君主
    Chancellor, // 宰相
    Noble,      // 貴族
    Gatekeeper, // 門番
    Guard,      // 衛兵
    RoyalGuard, // 近衛
    Knight,     // 騎士団
    Mage,       // 魔術師
    Clergy,     // 聖職者
    Mercenary,  // 傭兵団
    Unemployed, // 無職
    Thief,      // 盗賊
}
