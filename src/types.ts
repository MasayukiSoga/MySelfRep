export type Faction = 'player' | 'enemy' | 'neutral';

export interface Province {
  id: string;
  name: string;
  x: number;
  y: number;
  owner: Faction;
  gold: number;
  rice: number;
  soldiers: number;
  development: number;
  neighbors: string[];
  commandUsed: boolean;
}

export type CommandType = 'develop' | 'recruit' | 'invade';
