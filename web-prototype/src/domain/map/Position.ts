// 拠点の最低単位の位置。世界マップ・地区マップなど各階層の表示はここから算出する
export interface Position {
  readonly x: number;
  readonly y: number;
}

export function position(x: number, y: number): Position {
  return { x, y };
}
