// コマンドツリーの1項目。children を持つものはサブメニュー
export interface CommandNode {
  name: string;
  description: string;
  children?: CommandNode[];
}
