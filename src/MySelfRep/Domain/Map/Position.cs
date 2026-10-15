namespace MySelfRep.Domain.Map;

// 拠点の最低単位の位置。世界マップ・地区マップなど各階層の表示はここから算出する
public readonly record struct Position(float X, float Y);
