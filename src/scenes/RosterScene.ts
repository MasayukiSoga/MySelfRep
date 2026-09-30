import Phaser from 'phaser';
import { generateCharacters, type Character } from '../roster/characters';
import { PortraitCache } from '../portrait/PortraitCache';

const CHARACTER_COUNT = 30_000;
const COLS = 6;
const ROWS = 4;
const PER_PAGE = COLS * ROWS;
const CELL_W = 150;
const CELL_H = 130;
const GRID_X = 30;
const GRID_Y = 62;
const THUMB = 80;
const DETAIL = 240;
const CACHE_LIMIT = 120;

export class RosterScene extends Phaser.Scene {
  private characters: Character[] = [];
  private portraits!: PortraitCache;
  private page = 0;
  private generateMs = 0;
  private lastPageMs = 0;

  private pageLayer!: Phaser.GameObjects.Container;
  private detailLayer!: Phaser.GameObjects.Container;
  private pageText!: Phaser.GameObjects.Text;
  private statsText!: Phaser.GameObjects.Text;

  constructor() {
    super('roster');
  }

  private get pageCount(): number {
    return Math.ceil(this.characters.length / PER_PAGE);
  }

  create(): void {
    const t0 = performance.now();
    this.characters = generateCharacters(CHARACTER_COUNT);
    this.generateMs = performance.now() - t0;
    this.portraits = new PortraitCache(this.textures, CACHE_LIMIT);

    this.add.text(30, 16, `武将一覧(全${CHARACTER_COUNT.toLocaleString()}人)`, { fontSize: '20px', color: '#f8fafc' });
    this.pageText = this.add.text(270, 21, '', { fontSize: '14px', color: '#cbd5e1' });
    this.statsText = this.add.text(30, 612, '', { fontSize: '12px', color: '#94a3b8' });

    const nav: [string, number][] = [['«100', -100], ['‹', -1], ['›', 1], ['100»', 100]];
    nav.forEach(([label, delta], i) => this.makeButton(560 + i * 70, 14, 62, 30, label, () => this.goTo(this.page + delta)));
    this.makeButton(845, 14, 90, 30, 'ランダム', () => this.goTo(Math.floor(Math.random() * this.pageCount)));

    this.input.keyboard?.on('keydown-LEFT', () => this.goTo(this.page - 1));
    this.input.keyboard?.on('keydown-RIGHT', () => this.goTo(this.page + 1));

    this.pageLayer = this.add.container();
    this.detailLayer = this.add.container().setDepth(10);
    this.renderPage();
  }

  private goTo(page: number): void {
    const clamped = Phaser.Math.Clamp(page, 0, this.pageCount - 1);
    if (clamped === this.page) return;
    this.page = clamped;
    this.renderPage();
  }

  private renderPage(): void {
    const t0 = performance.now();
    this.pageLayer.removeAll(true);

    const start = this.page * PER_PAGE;
    const visible = this.characters.slice(start, start + PER_PAGE);

    visible.forEach((c, i) => {
      const x = GRID_X + (i % COLS) * CELL_W;
      const y = GRID_Y + Math.floor(i / COLS) * CELL_H;

      const img = this.add.image(x + CELL_W / 2 - 5, y + THUMB / 2, this.portraits.get(c, THUMB));
      img.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.showDetail(c));

      const label = this.add
        .text(x + CELL_W / 2 - 5, y + THUMB + 4, `${c.name}(${c.age})\n統${c.leadership} 武${c.war} 知${c.intelligence} 政${c.politics}`, {
          fontSize: '11px',
          color: '#e2e8f0',
          align: 'center',
        })
        .setOrigin(0.5, 0);

      this.pageLayer.add([img, label]);
    });

    this.lastPageMs = performance.now() - t0;
    this.pageText.setText(`${this.page + 1}/${this.pageCount}頁  No.${start + 1}〜${start + visible.length}`);
    this.updateStats();
  }

  private showDetail(c: Character): void {
    this.detailLayer.removeAll(true);

    const shade = this.add.rectangle(0, 0, 960, 640, 0x000000, 0.75).setOrigin(0, 0).setInteractive();
    shade.on('pointerdown', () => this.detailLayer.removeAll(true));

    const portrait = this.add.image(300, 310, this.portraits.get(c, DETAIL));
    const info = this.add.text(
      450,
      200,
      [
        c.name,
        '',
        `No.${c.id + 1}  年齢 ${c.age}`,
        `統率 ${c.leadership}`,
        `武力 ${c.war}`,
        `知力 ${c.intelligence}`,
        `政治 ${c.politics}`,
        '',
        '(クリックで閉じる)',
      ].join('\n'),
      { fontSize: '20px', color: '#f8fafc', lineSpacing: 8 },
    );

    this.detailLayer.add([shade, portrait, info]);
    this.updateStats();
  }

  private updateStats(): void {
    const c = this.portraits;
    this.statsText.setText(
      `人物データ生成 ${this.generateMs.toFixed(1)}ms | ページ描画 ${this.lastPageMs.toFixed(1)}ms | ` +
        `テクスチャ保持 ${c.size}/${c.maxSize} | 新規生成 ${c.generated} | キャッシュヒット ${c.hits} | 破棄 ${c.evicted}`,
    );
  }

  private makeButton(x: number, y: number, w: number, h: number, label: string, onClick: () => void): void {
    const bg = this.add.rectangle(x, y, w, h, 0x2563eb).setOrigin(0, 0).setInteractive({ useHandCursor: true });
    this.add.text(x + w / 2, y + h / 2, label, { fontSize: '14px', color: '#f8fafc' }).setOrigin(0.5);
    bg.on('pointerover', () => bg.setFillStyle(0x1d4ed8));
    bg.on('pointerout', () => bg.setFillStyle(0x2563eb));
    bg.on('pointerdown', onClick);
  }
}
