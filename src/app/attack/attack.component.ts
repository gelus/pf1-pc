import { Component, Input, computed } from '@angular/core';
import {Attack, AttackPart} from '../utils/attack.class';
import {ApplyCharacterService} from '../apply-character.service';
import {StatDisplayComponent} from '../stat-display/stat-display.component';

// a line of a tooltip: the value (or a text), and where it comes from
type TooltipLine = [number | string, string];

const partLine = (part: AttackPart): TooltipLine => {
  const value = part.overwritten ? `${part.value} (does not stack)` : part.value;
  return [value, part.type ? `${part.origin} (${part.type})` : part.origin];
};

export const signed = (value: number): string => `${value >= 0 ? '+' : ''}${value}`;

// an attack of the applied character, with what the attacks rule worked out for it (see AttackResult): every attack
// roll of a full attack, the damage roll, the critical, range and ammunition, each number with its origins
@Component({
  selector: 'app-attack',
  imports: [
    StatDisplayComponent,
  ],
  templateUrl: './attack.component.html',
  styleUrl: './attack.component.sass'
})
export class AttackComponent {
  @Input() attack!: Attack;
  constructor (
    public character: ApplyCharacterService
  ) {}

  readonly signed = signed;

  isMelee = computed(() => this.character.applied().melee.includes(this.attack));
  isRanged = computed(() => this.character.applied().ranged.includes(this.attack));

  toHitVariantPaths = computed(() => {
    if (this.isMelee()) {
      return ['attackRollBonus', 'meleeAttackRollBonus', 'melee.*.toHitBonus'];
    }
    if (this.isRanged()) {
      return ['attackRollBonus', 'rangedAttackRollBonus', 'ranged.*.toHitBonus'];
    }
    return ['attackRollBonus'];
  });

  damageVariantPaths = computed(() => {
    if (this.isMelee()) {
      return ['melee.*.damageBonus'];
    }
    if (this.isRanged()) {
      return ['ranged.*.damageBonus'];
    }
    return [];
  });

  // the bonuses to the attack roll from the character as a whole, by what they apply to (all, melee or ranged)
  attackRollBonuses = computed(() => {
    const char = this.character.applied();
    const bonuses: Array<[number, string]> = [];
    if (this.attack?.toHitBonus) bonuses.push([this.attack.toHitBonus, 'bonus']);
    if (char.attackRollBonus) bonuses.push([char.attackRollBonus, 'all attacks']);
    if (this.isMelee() && char.meleeAttackRollBonus) {
      bonuses.push([char.meleeAttackRollBonus, 'melee attacks']);
    } else if (this.isRanged() && char.rangedAttackRollBonus) {
      bonuses.push([char.rangedAttackRollBonus, 'ranged attacks']);
    }
    return bonuses;
  });

  // those bonuses by the adjustments giving them
  attackRollTooltips = computed(() => {
    this.character.applied();
    const tooltips: Array<[number|string, string]> = [];
    if (this.attack?.toHitBonus) tooltips.push([this.attack.toHitBonus, 'bonus']);
    const paths = ['attackRollBonus'];
    if (this.isMelee()) paths.push('meleeAttackRollBonus');
    else if (this.isRanged()) paths.push('rangedAttackRollBonus');
    for (const path of paths) {
      for (const adj of this.character.adjustmentsMap[path] || []) {
        if (adj.variant === undefined && adj.value !== 'auto-fail') tooltips.push([adj.value, adj.origin]);
      }
    }
    return tooltips;
  });

  // the parts that count make up the number shown, the tooltip shows them all
  private counted = (parts: AttackPart[] = []): Array<[number, string]> =>
    parts.filter(p => !p.overwritten).map(p => [p.value, p.origin]);

  toHitAdditional = computed(() => {
    this.character.applied();
    return this.counted(this.attack?.result?.toHit.parts);
  });

  toHitTooltips = computed((): TooltipLine[] => {
    this.character.applied();
    return (this.attack?.result?.toHit.parts || []).map(partLine);
  });

  // the attack rolls after the first, "+6/+1"
  laterAttackBonuses = computed(() => {
    this.character.applied();
    return (this.attack?.result?.attackBonuses || []).slice(1);
  });

  damageAdditional = computed(() => {
    this.character.applied();
    return this.counted(this.attack?.result?.damage.parts);
  });

  damageTooltips = computed((): TooltipLine[] => {
    this.character.applied();
    const damage = this.attack?.result?.damage;
    if (!damage) return [];
    const lines = damage.parts.map(partLine);
    if (damage.dice !== damage.baseDice) lines.unshift([`${damage.baseDice} → ${damage.dice}`, 'size']);
    return lines;
  });

  dice = computed(() => {
    this.character.applied();
    return this.attack?.result?.damage.dice ?? this.attack?.damage ?? '';
  });

  // shoots a piece of the ammunition: one less of the item in the raw character
  fire(): void {
    const id = this.attack?.result?.ammunition?.itemId;
    if (!id) return;
    const raw = this.character.raw();
    const inventory = (raw.inventory || []).map(item => item.id === id
      ? Object.assign(Object.create(Object.getPrototypeOf(item)), item, {quantity: Math.max(0, (Number(item.quantity) || 0) - 1)})
      : item);
    this.character.update({inventory});
  }
}
