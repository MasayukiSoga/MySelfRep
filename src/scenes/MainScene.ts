import Phaser from 'phaser';
import { GameState } from '../game/GameState';
import type { Province } from '../types';

const OWNER_COLOR: Record<Province['owner'], number> = {
  player: 0x3b82f6,
  enemy: 0xef4444,
  neutral: 0x9ca3af,
};

const PANEL_X = 700;
const LOG_LINES = 5;

export class MainScene extends Phaser.Scene {
  private state = new GameState();
  private selectedId: string | null = null;
  private invadeSourceId: string | null = null;
  private log: string[] = ['ゲーム開始。自国の領地(青)をクリックしてコマンドを選んでください。'];

  private dynamicLayer!: Phaser.GameObjects.Container;
  private provinceCircles = new Map<string, Phaser.GameObjects.Arc>();

  constructor() {
    super('main');
  }

  create(): void {
    this.add.rectangle(0, 0, 960, 640, 0x0f172a).setOrigin(0, 0);
    this.add.rectangle(PANEL_X, 0, 260, 640, 0x1e293b).setOrigin(0, 0);
    this.add.rectangle(0, 480, 700, 160, 0x111827).setOrigin(0, 0);

    this.drawNeighborLines();

    for (const province of this.state.list()) {
      const circle = this.add.circle(province.x, province.y, 26, OWNER_COLOR[province.owner]);
      circle.setStrokeStyle(2, 0xffffff, 0.4);
      circle.setInteractive({ useHandCursor: true });
      circle.on('pointerdown', () => this.onProvinceClicked(province.id));
      this.provinceCircles.set(province.id, circle);
    }

    this.dynamicLayer = this.add.container();
    this.pushLog('');
    this.refresh();
  }

  private drawNeighborLines(): void {
    const drawn = new Set<string>();
    for (const p of this.state.list()) {
      for (const nid of p.neighbors) {
        const key = [p.id, nid].sort().join('-');
        if (drawn.has(key)) continue;
        drawn.add(key);
        const n = this.state.get(nid);
        if (!n) continue;
        this.add.line(0, 0, p.x, p.y, n.x, n.y, 0x475569).setOrigin(0, 0).setLineWidth(2);
      }
    }
  }

  private onProvinceClicked(id: string): void {
    if (this.state.isGameOver() || this.state.isDefeat()) return;

    if (this.invadeSourceId) {
      const result = this.state.invade(this.invadeSourceId, id);
      this.pushLog(result.message);
      this.invadeSourceId = null;
      this.selectedId = this.state.get(id)?.owner === 'player' ? id : this.selectedId;
      this.checkGameEnd();
      this.refresh();
      return;
    }

    this.selectedId = id;
    this.refresh();
  }

  private onCommand(kind: 'develop' | 'recruit' | 'invade' | 'endTurn'): void {
    if (!this.selectedId && kind !== 'endTurn') return;

    if (kind === 'develop') {
      const result = this.state.develop(this.selectedId!);
      this.pushLog(result.message);
    } else if (kind === 'recruit') {
      const result = this.state.recruit(this.selectedId!);
      this.pushLog(result.message);
    } else if (kind === 'invade') {
      this.invadeSourceId = this.selectedId;
      this.pushLog('侵攻先の隣接領地(自国以外)をクリックしてください');
    } else if (kind === 'endTurn') {
      const messages = this.state.endTurn();
      this.pushLog(`--- ターン${this.state.turn}開始 ---`);
      for (const m of messages) this.pushLog(m);
      this.checkGameEnd();
    }

    this.refresh();
  }

  private checkGameEnd(): void {
    if (this.state.isGameOver()) {
      this.pushLog('すべての敵領地を制圧した!勝利!');
    } else if (this.state.isDefeat()) {
      this.pushLog('自国の領地をすべて失った……敗北。');
    }
  }

  private pushLog(message: string): void {
    if (message) this.log.push(message);
    while (this.log.length > LOG_LINES) this.log.shift();
  }

  private refresh(): void {
    this.dynamicLayer.removeAll(true);

    for (const province of this.state.list()) {
      this.provinceCircles.get(province.id)?.setFillStyle(OWNER_COLOR[province.owner]);

      const label = `${province.name}\n兵:${province.soldiers}`;
      const text = this.add.text(province.x, province.y + 36, label, {
        fontSize: '13px',
        color: '#e2e8f0',
        align: 'center',
      });
      text.setOrigin(0.5, 0);
      this.dynamicLayer.add(text);

      if (province.id === this.selectedId) {
        const ring = this.add.circle(province.x, province.y, 32);
        ring.setStrokeStyle(3, 0xfacc15, 1);
        this.dynamicLayer.add(ring);
      }
      if (province.id === this.invadeSourceId) {
        const ring = this.add.circle(province.x, province.y, 32);
        ring.setStrokeStyle(3, 0xf97316, 1);
        this.dynamicLayer.add(ring);
      }
    }

    this.dynamicLayer.add(
      this.add.text(10, 10, `ターン: ${this.state.turn}`, { fontSize: '20px', color: '#f8fafc' }),
    );

    this.dynamicLayer.add(this.makeButton(800, 10, 150, 36, 'ターン終了', () => this.onCommand('endTurn')));

    this.drawInfoPanel();
    this.drawCommandButtons();
    this.drawLog();

    if (this.state.isGameOver() || this.state.isDefeat()) {
      const msg = this.state.isGameOver() ? '勝利!' : '敗北……';
      const overlay = this.add.text(350, 300, msg, { fontSize: '48px', color: '#fde047' });
      this.dynamicLayer.add(overlay);
    }
  }

  private drawInfoPanel(): void {
    const p = this.selectedId ? this.state.get(this.selectedId) : undefined;
    const lines = p
      ? [
          `${p.name}`,
          `勢力: ${p.owner === 'player' ? '自国' : p.owner === 'enemy' ? '敵国' : '中立'}`,
          `資金: ${p.gold}`,
          `兵糧: ${p.rice}`,
          `兵力: ${p.soldiers}`,
          `発展度: ${p.development}`,
          p.owner === 'player' ? (p.commandUsed ? '(このターンは行動済み)' : '(行動可能)') : '',
        ]
      : ['領地を選択してください'];

    this.dynamicLayer.add(
      this.add.text(PANEL_X + 20, 60, lines.join('\n'), {
        fontSize: '15px',
        color: '#f1f5f9',
        lineSpacing: 6,
      }),
    );
  }

  private drawCommandButtons(): void {
    const p = this.selectedId ? this.state.get(this.selectedId) : undefined;
    if (!p || p.owner !== 'player') return;

    const disabled = p.commandUsed;
    const y0 = 260;
    const opts: [string, () => void][] = [
      ['内政 (資金-20 → 発展+1)', () => this.onCommand('develop')],
      ['徴兵 (資金-30,兵糧-20 → 兵+10)', () => this.onCommand('recruit')],
      ['侵攻 (隣接領地を攻める)', () => this.onCommand('invade')],
    ];

    opts.forEach(([label, handler], i) => {
      this.dynamicLayer.add(
        this.makeButton(PANEL_X + 20, y0 + i * 60, 220, 46, label, handler, disabled, 11),
      );
    });
  }

  private drawLog(): void {
    this.dynamicLayer.add(
      this.add.text(10, 490, this.log.join('\n'), {
        fontSize: '13px',
        color: '#cbd5e1',
        lineSpacing: 6,
        wordWrap: { width: 680 },
      }),
    );
  }

  private makeButton(
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    onClick: () => void,
    disabled = false,
    fontSize = 14,
  ): Phaser.GameObjects.Container {
    const bg = this.add.rectangle(0, 0, w, h, disabled ? 0x374151 : 0x2563eb).setOrigin(0, 0);
    const text = this.add
      .text(w / 2, h / 2, label, { fontSize: `${fontSize}px`, color: '#f8fafc', align: 'center' })
      .setOrigin(0.5);
    const container = this.add.container(x, y, [bg, text]);

    if (!disabled) {
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerover', () => bg.setFillStyle(0x1d4ed8));
      bg.on('pointerout', () => bg.setFillStyle(0x2563eb));
      bg.on('pointerdown', onClick);
    }

    return container;
  }
}
