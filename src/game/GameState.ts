import type { Province } from '../types';
import { createInitialProvinces } from '../data/provinces';

const DEVELOP_COST_GOLD = 20;
const RECRUIT_COST_GOLD = 30;
const RECRUIT_COST_RICE = 20;
const RECRUIT_SOLDIERS = 10;

export interface ActionResult {
  success: boolean;
  message: string;
}

export class GameState {
  turn = 1;
  provinces: Map<string, Province>;

  constructor() {
    this.provinces = new Map(createInitialProvinces().map((p) => [p.id, p]));
  }

  list(): Province[] {
    return [...this.provinces.values()];
  }

  get(id: string): Province | undefined {
    return this.provinces.get(id);
  }

  isGameOver(): boolean {
    return this.list().every((p) => p.owner !== 'enemy');
  }

  isDefeat(): boolean {
    return this.list().every((p) => p.owner !== 'player');
  }

  develop(id: string): ActionResult {
    const p = this.provinces.get(id);
    if (!p || p.owner !== 'player') return { success: false, message: '自国の領地ではありません' };
    if (p.commandUsed) return { success: false, message: 'このターンは既にコマンドを実行済みです' };
    if (p.gold < DEVELOP_COST_GOLD) return { success: false, message: '資金が不足しています' };

    p.gold -= DEVELOP_COST_GOLD;
    p.development += 1;
    p.commandUsed = true;
    return { success: true, message: `${p.name}で内政を行い、発展度が${p.development}になった` };
  }

  recruit(id: string): ActionResult {
    const p = this.provinces.get(id);
    if (!p || p.owner !== 'player') return { success: false, message: '自国の領地ではありません' };
    if (p.commandUsed) return { success: false, message: 'このターンは既にコマンドを実行済みです' };
    if (p.gold < RECRUIT_COST_GOLD || p.rice < RECRUIT_COST_RICE) {
      return { success: false, message: '資金または兵糧が不足しています' };
    }

    p.gold -= RECRUIT_COST_GOLD;
    p.rice -= RECRUIT_COST_RICE;
    p.soldiers += RECRUIT_SOLDIERS;
    p.commandUsed = true;
    return { success: true, message: `${p.name}で徴兵を行い、兵力が${p.soldiers}になった` };
  }

  invade(fromId: string, toId: string): ActionResult {
    const from = this.provinces.get(fromId);
    const to = this.provinces.get(toId);
    if (!from || from.owner === 'neutral') return { success: false, message: '侵攻元が不正です' };
    if (from.commandUsed) return { success: false, message: 'このターンは既にコマンドを実行済みです' };
    if (!to || to.owner === from.owner) return { success: false, message: '侵攻先が不正です' };
    if (!from.neighbors.includes(toId)) return { success: false, message: '隣接していない領地には侵攻できません' };
    if (from.soldiers <= 0) return { success: false, message: '出撃できる兵力がありません' };

    const attackPower = from.soldiers;
    const defensePower = Math.round(to.soldiers * (1 + to.development * 0.05));

    from.commandUsed = true;

    if (attackPower > defensePower) {
      const survivors = Math.max(1, attackPower - defensePower);
      const fromName = from.name;
      const toName = to.name;
      to.owner = from.owner;
      to.soldiers = survivors;
      to.gold = Math.round(to.gold * 0.7);
      to.rice = Math.round(to.rice * 0.7);
      from.soldiers = 0;
      return { success: true, message: `${fromName}軍が${toName}に侵攻し、占領に成功した(残存兵力${survivors})` };
    }

    const losses = Math.round(attackPower * 0.6);
    from.soldiers = Math.max(0, from.soldiers - losses);
    to.soldiers = Math.max(0, to.soldiers - Math.round(defensePower * 0.3));
    return { success: false, message: `${from.name}軍は${to.name}への侵攻に失敗し、兵力を${losses}失った` };
  }

  private runAi(): string[] {
    const messages: string[] = [];

    for (const p of this.list()) {
      if (p.owner !== 'enemy') continue;

      const enemyTargets = p.neighbors
        .map((nid) => this.provinces.get(nid))
        .filter((n): n is Province => !!n && n.owner !== 'enemy');

      const canInvade = enemyTargets.find((t) => p.soldiers > t.soldiers * (1 + t.development * 0.05));

      if (canInvade && p.soldiers > 40) {
        const result = this.invade(p.id, canInvade.id);
        messages.push(`[AI] ${result.message}`);
      } else if (p.gold >= RECRUIT_COST_GOLD && p.rice >= RECRUIT_COST_RICE && Math.random() < 0.5) {
        p.gold -= RECRUIT_COST_GOLD;
        p.rice -= RECRUIT_COST_RICE;
        p.soldiers += RECRUIT_SOLDIERS;
        messages.push(`[AI] ${p.name}が徴兵を行った`);
      } else if (p.gold >= DEVELOP_COST_GOLD) {
        p.gold -= DEVELOP_COST_GOLD;
        p.development += 1;
        messages.push(`[AI] ${p.name}が内政を行った`);
      }
    }

    return messages;
  }

  endTurn(): string[] {
    const aiMessages = this.runAi();

    for (const p of this.list()) {
      p.gold += 10 + p.development * 5;
      p.rice += 15 + p.development * 5;

      const upkeep = Math.round(p.soldiers * 0.1);
      if (p.rice >= upkeep) {
        p.rice -= upkeep;
      } else {
        const shortage = upkeep - p.rice;
        p.rice = 0;
        p.soldiers = Math.max(0, p.soldiers - shortage);
      }

      p.commandUsed = false;
    }

    this.turn += 1;
    return aiMessages;
  }
}
