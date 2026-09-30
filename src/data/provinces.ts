import type { Province } from '../types';

export function createInitialProvinces(): Province[] {
  const base: Omit<Province, 'commandUsed'>[] = [
    { id: 'owari', name: '尾張', x: 400, y: 320, owner: 'player', gold: 100, rice: 100, soldiers: 50, development: 3, neighbors: ['mikawa', 'mino', 'ise'] },
    { id: 'mikawa', name: '三河', x: 520, y: 340, owner: 'neutral', gold: 60, rice: 80, soldiers: 30, development: 2, neighbors: ['owari', 'suruga'] },
    { id: 'mino', name: '美濃', x: 370, y: 200, owner: 'enemy', gold: 90, rice: 70, soldiers: 45, development: 3, neighbors: ['owari', 'oumi', 'echizen'] },
    { id: 'ise', name: '伊勢', x: 430, y: 440, owner: 'neutral', gold: 50, rice: 90, soldiers: 25, development: 2, neighbors: ['owari'] },
    { id: 'oumi', name: '近江', x: 260, y: 230, owner: 'enemy', gold: 70, rice: 60, soldiers: 35, development: 2, neighbors: ['mino'] },
    { id: 'kai', name: '甲斐', x: 680, y: 260, owner: 'neutral', gold: 55, rice: 65, soldiers: 28, development: 2, neighbors: ['suruga'] },
    { id: 'suruga', name: '駿河', x: 610, y: 330, owner: 'enemy', gold: 65, rice: 55, soldiers: 32, development: 2, neighbors: ['mikawa', 'kai'] },
    { id: 'echizen', name: '越前', x: 250, y: 130, owner: 'neutral', gold: 45, rice: 60, soldiers: 20, development: 1, neighbors: ['mino'] },
  ];

  return base.map((p) => ({ ...p, commandUsed: false }));
}
