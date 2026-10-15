// ターン制の進行と、1ターンにつき持つ政治力を管理する
export class TurnManager {
  currentTurn = 1;

  // 行動ごとに消費し、利用可能なコマンド数を制限する
  politicalPower = 0;

  advanceTurn(): void {
    this.currentTurn++;
  }
}
