import { Component, computed } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { ApplyCharacterService } from '../apply-character.service';
import { getByPath } from '../utils/object.util';
import {
  allImmunities,
  bypassLabel,
  damageReductionList,
  damageReductionSources,
} from '../rules/defenses';

// one line of a tooltip: what a source gives and where it comes from, crossed out when a better one applies instead
export interface DefenseSource {
  value: string;
  origin: string;
  overwritten: boolean;
}

// what an adjustment that does not add does to the value it gives: caps it, floors it or replaces it
const modeLabel = (mode?: string): string => (mode === 'min' ? '≤' : mode === 'max' ? '≥' : mode === 'set' ? '=' : '');

type Section = 'dr' | 'resist' | 'sr' | 'immune' | 'concealment';

// the defenses of the character that are not a bonus to its ac or saves: damage reduction, energy resistance,
// spell resistance, immunities and concealment. hovering one lists where it came from
@Component({
  selector: 'app-defenses',
  imports: [NgTemplateOutlet],
  templateUrl: './defenses.component.html',
  styleUrl: './defenses.component.sass'
})
export class DefensesComponent {
  constructor(public character: ApplyCharacterService) {}

  open: Section | null = null;

  damageReductions = computed(() => {
    const applied = this.character.applied();
    const sources = damageReductionSources(this.character.raw(), applied, this.character.adjustmentsMap);
    return {
      text: damageReductionList(applied.damageReduction).map(dr => `${dr.value}/${bypassLabel(dr.bypass)}`).join(', '),
      sources: sources.map(dr => ({
        value: `${modeLabel(dr.mode)}${dr.value}/${bypassLabel(dr.bypass)}`,
        origin: dr.origin,
        overwritten: dr.overwritten,
      })),
    };
  });

  resistances = computed(() => {
    const energies = Object.entries(this.character.applied().energyResistance || {}).filter(([, value]) => Number(value) > 0);
    return {
      text: energies.map(([energy, value]) => `${energy} ${value}`).join(', '),
      sources: energies.flatMap(([energy]) => this.sourcesOf(`energyResistance.${energy}`, `${energy} `)),
    };
  });

  spellResistance = computed(() => this.sourcesOf('spellResistance'));

  concealment = computed(() => this.sourcesOf('concealment', '', '%'));

  immunities = computed(() => {
    const applied = this.character.applied();
    const raw = this.character.raw();
    const fromFeatures = (path: string) => (this.character.adjustmentsMap[path] || [])
      .filter(e => e.variant === undefined)
      .map(e => ({value: [e.value].flat().join(', '), origin: e.origin, overwritten: false}));
    return {
      text: allImmunities(applied).join(', '),
      sources: [
        ...(raw.immune ? [{value: raw.immune, origin: 'base', overwritten: false}] : []),
        ...(raw.immunities || []).map(value => ({value, origin: 'base', overwritten: false})),
        ...fromFeatures('immune'),
        ...fromFeatures('immunities'),
      ],
    };
  });

  sources(section: Section): DefenseSource[] {
    switch (section) {
      case 'dr': return this.damageReductions().sources;
      case 'resist': return this.resistances().sources;
      case 'sr': return this.spellResistance();
      case 'immune': return this.immunities().sources;
      case 'concealment': return this.concealment();
    }
  }

  // the character's own value and what each feature gives, see keepHighest in rules/defenses
  private sourcesOf(path: string, prefix = '', suffix = ''): DefenseSource[] {
    this.character.applied();
    const entries = (this.character.adjustmentsMap[path] || []).filter(e => e.variant === undefined);
    const base = Number(getByPath(this.character.raw(), path)) || 0;
    const label = (value: any, mode?: string) => `${prefix}${modeLabel(mode)}${value}${suffix}`;
    return [
      ...(base ? [{value: label(base), origin: 'base', overwritten: entries.some(e => !e.mode && !e.overwritten)}] : []),
      ...entries.map(e => ({value: label(e.value, e.mode), origin: e.origin, overwritten: e.overwritten})),
    ];
  }
}
