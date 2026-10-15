namespace MySelfRep.Domain.Command;

// コマンドツリーの1項目。Children を持つものはサブメニュー
public sealed record CommandNode(string Name, string Description, IReadOnlyList<CommandNode>? Children = null);
