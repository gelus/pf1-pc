import { Component, HostListener, Input, OnChanges, computed, input, signal } from '@angular/core';
import {CommonModule} from '@angular/common';
import {getByPath} from '../utils/object.util';
import {AbilityModPipe} from '../ability-mod.pipe';
import { EvaluateValuePipe } from '../evaluate-value.pipe';
import {AdjustmentMapEntry, ApplyCharacterService, VariantSummary} from '../apply-character.service';

@Component({
  selector: 'stat',
  imports: [
    CommonModule,
    AbilityModPipe,
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
  maxAbilityBonus = input<number>(0);
  variantPaths = input<string[]>([]);

  isDexBonusDeniedForStat(stat: string | undefined, char: any): boolean {
    if (!stat || !char?.denyDexBonus) return false;
    if (stat === 'ac' || stat === 'touchAc' || stat === 'flatFootedAc') {
      return Boolean(char.denyDexBonus.ac);
    }
    if (stat === 'cmd') {
      return Boolean(char.denyDexBonus.cmd);
    }
    return false;
  }

  isAbilityBonusDenied(ability: string, char: any): boolean {
    if (ability !== 'dex') return false;
    const stat = this.stat();
    if (!this.isDexBonusDeniedForStat(stat, char)) return false;
    const maxCap = this.maxAbilityBonus() || Infinity;
    const mod = AbilityModPipe.algorithm(char.abilityScores?.[ability] ?? 10, maxCap);
    return mod > 0;
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
    if (!char || !stat || !stat.startsWith('skills.') || !stat.endsWith('.value')) return false;
    const skill = this.character.getSkillFromStatPath(char, stat);
    const baseAbility = (skill?.baseAbility || '').toLowerCase();
    return baseAbility === 'str' || baseAbility === 'dex';
  });

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
    const stat = this.stat();
    const abilityAr = this.abilityArray();
    const maxAbilityBonus = this.maxAbilityBonus();
    let total = 0;

    if (char && stat) {
      const s = getByPath(char, stat) ?? 0;
      const rawVal = s?.value ?? s;
      total = typeof rawVal === 'number' ? rawVal : Number(rawVal) || 0;
    }

    if (abilityAr && char?.abilityScores) {
      for (const ab of abilityAr) {
        if (char?.abilityScores[ab] !== undefined) {
          const mod = AbilityModPipe.algorithm(char.abilityScores[ab], maxAbilityBonus || Infinity);
          if (ab === 'dex' && mod > 0 && this.isDexBonusDeniedForStat(stat, char)) {
            continue;
          }
          total += mod;
        }
      }
    }

    for (const x of this.additional) {
      if (x[0]) total += x[0];
    }

    if (char && stat) {
      if (stat.startsWith('saves.')) {
        total += char.savingThrowBonus || 0;
      } else if (stat.startsWith('skills.') && stat.endsWith('.value')) {
        total += char.skillCheckBonus || 0;
        if (this.isStrOrDexSkillStat()) {
          total += char.armorCheckPenalty || 0;
        }
      }
    }

    return total;
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
