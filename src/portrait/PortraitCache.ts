import Phaser from 'phaser';
import { drawPortrait, traitsFor } from './portrait';

export interface PortraitSubject {
  id: number;
  age: number;
  portraitSeed: number;
}

export class PortraitCache {
  hits = 0;
  generated = 0;
  evicted = 0;

  // Map preserves insertion order, so re-inserting on access gives LRU ordering.
  private lru = new Map<string, true>();

  constructor(
    private textures: Phaser.Textures.TextureManager,
    readonly maxSize: number,
  ) {}

  get size(): number {
    return this.lru.size;
  }

  get(subject: PortraitSubject, size: number): string {
    const key = `portrait-${subject.id}-${size}`;

    if (this.lru.has(key)) {
      this.lru.delete(key);
      this.lru.set(key, true);
      this.hits++;
      return key;
    }

    const texture = this.textures.createCanvas(key, size, size)!;
    drawPortrait(texture.context, size, traitsFor(subject.portraitSeed, subject.age));
    texture.refresh();

    this.lru.set(key, true);
    this.generated++;
    this.evictOverflow();
    return key;
  }

  private evictOverflow(): void {
    while (this.lru.size > this.maxSize) {
      const oldest = this.lru.keys().next().value as string;
      this.lru.delete(oldest);
      this.textures.remove(oldest);
      this.evicted++;
    }
  }
}
