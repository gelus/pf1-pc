import { Component, HostListener, Input, OnChanges, computed, input, signal } from '@angular/core';
import {CommonModule} from '@angular/common';
import {AbilityModAlgorithm, abilityDamagePenalty, abilityDamagePoints, abilityModifier} from '../ability-mod.pipe';
import { EvaluateValuePipe } from '../evaluate-value.pipe';
import {AdjustmentMapEntry, ApplyCharacterService, VariantSummary} from '../apply-character.service';
import {isDexBonusDenied, isStrOrDexSkillStat, statTotal} from './stat-total';

@Component({
  selector: 'stat',
  imports: [
    CommonModule,
    EvaluateValuePipe,
  ],
  templateUrl: './stat-display.component.html',
  styleUrl: './stat-display.component.sass'
})
export class StatDisplayComponent implements OnChanges {

  constructor(public character: ApplyCharacterService) {}

  @Input() additional: Array<[number, string]> = [];
  @Input() additionalTooltips: Array<[number|string, string]> = [];

  private inputVersion = signal(0);

  ngOnChanges(): void {
    this.inputVersion.update(v => v + 1);
  }

  hovered = false;
  @HostListener('mouseenter') mouseIn() { this.hovered = true; }
  @HostListener('mouseleave') mouseOut() { this.hovered = false; }

  stat = input<string>();
  ability = input<string>();
  abilityArray = computed(() => {
    const ability = this.ability();
    return ability ? ability.split(', ').filter(Boolean) : [];
  });
  // caps the ability bonus (the max dex bonus of armor), undefined when nothing caps it
  maxAbilityBonus = input<number | undefined>(undefined);
  variantPaths = input<string[]>([]);

  isDexBonusDeniedForStat(stat: string | undefined, char: any): boolean {
    return isDexBonusDenied(stat, char);
  }

  // the modifier of the ability the stat takes: its capped bonus with the penalty of its damage, see abilityModifier
  abilityModifierFor(ability: string, char: any): number {
    return abilityModifier(char, ability, this.maxAbilityBonus() ?? Infinity);
  }

  // what the score alone gives, capped, the first line of the ability in the tooltip
  abilityBonusFor(ability: string, char: any): number {
    return AbilityModAlgorithm(char.abilityScores?.[ability] ?? 10, this.maxAbilityBonus() ?? Infinity);
  }

  // the penalty from the damage the ability took, its own line in the tooltip so it shows why the modifier is lower
  abilityDamageLine(ability: string, char: any): {penalty: number, label: string} | undefined {
    const penalty = abilityDamagePenalty(char, ability);
    if (!penalty) return undefined;
    const label = ability[0].toUpperCase() + ability.slice(1);
    return {penalty, label: `${label} damage (${abilityDamagePoints(char, ability)})`};
  }

  // a denied dex bonus is lost, a dex penalty however still applies. the damage lowers the modifier, so what is
  // denied is the modifier left once the damage is taken off
  isAbilityBonusDenied(ability: string, char: any): boolean {
    if (ability !== 'dex') return false;
    const stat = this.stat();
    if (!this.isDexBonusDeniedForStat(stat, char)) return false;
    return this.abilityModifierFor(ability, char) > 0;
  }

  denyDexEntries = computed((): AdjustmentMapEntry[] => {
    this.inputVersion();
    this.character.applied();
    const stat = this.stat();
    if (stat === 'ac' || stat === 'touchAc') {
      return (this.character.adjustmentsMap['denyDexBonus.ac'] || []).filter(
        e => !e.variant && Boolean(e.value)
      );
    }
    if (stat === 'cmd') {
      return (this.character.adjustmentsMap['denyDexBonus.cmd'] || []).filter(
        e => !e.variant && Boolean(e.value)
      );
    }
    return [];
  });

  isStrOrDexSkillStat = computed((): boolean => {
    const char = this.character.applied();
    const stat = this.stat();
    return !!char && !!stat && isStrOrDexSkillStat(char, stat);
  });

  // how an adjustment combines with the stat, adjustments that add have no prefix
  modePrefix(entry: AdjustmentMapEntry): string {
    switch (entry.mode) {
      case 'set': return '=';
      case 'min': return '≤';
      case 'max': return '≥';
      default: return '';
    }
  }

  baseAdjustmentsFor(path: string | undefined): AdjustmentMapEntry[] {
    if (!path) return [];
    return (this.character.adjustmentsMap[path] || []).filter(e => e.variant === undefined);
  }

  extraBaseAutoFailEntries = computed((): AdjustmentMapEntry[] => {
    this.inputVersion();
    this.character.applied();
    const stat = this.stat();
    const extras: AdjustmentMapEntry[] = [];
    for (const p of this.variantPaths()) {
      if (p === stat) continue;
      for (const e of this.character.adjustmentsMap[p] || []) {
        if (e.variant === undefined && e.value === 'auto-fail') {
          extras.push(e);
        }
      }
    }
    return extras;
  });

  private allStatPaths = computed((): string[] => {
    const char = this.character.applied();
    const stat = this.stat();
    const inherited = stat && char ? this.character.getInheritedBonusPaths(stat, char) : [];
    const acp = this.isStrOrDexSkillStat() ? ['armorCheckPenalty'] : [];
    return Array.from(
      new Set([
        ...inherited,
        ...acp,
        ...(stat ? [stat] : []),
        ...this.variantPaths(),
      ])
    );
  });

  private numericStat = computed((): number => {
    this.inputVersion();
    const char = this.character.applied();
    if (!char) return 0;
    return statTotal(char, {
      stat: this.stat(),
      abilities: this.abilityArray(),
      additional: this.additional,
      maxAbilityBonus: this.maxAbilityBonus(),
    });
  });

  isAutoFail = computed((): boolean => {
    this.inputVersion();
    this.character.applied();
    return this.character.hasBaseAutoFail(this.allStatPaths());
  });

  displayStat = computed((): number | string => {
    if (this.isAutoFail()) return 'auto-fail';
    const total = this.numericStat();
    return total || '0';
  });

  variants = computed((): VariantSummary[] => {
    this.inputVersion();
    const char = this.character.applied();
    if (!char) return [];
    const baseTotal: number | 'auto-fail' = this.isAutoFail() ? 'auto-fail' : this.numericStat();
    return this.character.computeVariantsForPaths(this.allStatPaths(), baseTotal, char);
  });
}
