import { Component, EventEmitter, Output, Input, booleanAttribute } from '@angular/core';
import {Character} from '../utils/character.class';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {RemainingRanksPipe} from '../characterPipes/remaining-ranks.pipe';
import {MaxLevelPipe} from '../characterPipes/max-level.pipe';
import {ApplyCharacterService} from '../apply-character.service';
import {StatDisplayComponent} from '../stat-display/stat-display.component';
import {Skill} from '../interfaces/character.interface';
import {canUseSkill, isSkillFamily, skillAbilityMap} from '../utils/skilllist.class';

import {skillAdditional} from '../stat-display/stat-total';
@Component({
  selector: 'app-skill-list',
  imports: [StatDisplayComponent, RemainingRanksPipe, MaxLevelPipe, CommonModule, FormsModule],
  templateUrl: './skill-list.component.html',
  styleUrl: './skill-list.component.sass'
})
export class SkillListComponent {
  // the list's own title, for a page without the sheet's tabs (creating a character)
  @Input({transform: booleanAttribute}) titled = false;

  @Output() skillChange = new EventEmitter<Partial<Character>>();

  // the sheet's search: only the skills whose name has it, a family with all its skills when the family's name has it
  @Input() filter = '';

  private matches(name: string): boolean {
    const query = this.filter.trim().toLowerCase();
    return !query || name.toLowerCase().includes(query);
  }

  subSkillShown(family: string, subSkill: string): boolean {
    return this.matches(family) || this.matches(subSkill);
  }

  skillShown(name: string, skill: Skill): boolean {
    if (!this.isFamily(name)) return this.matches(name);
    return this.matches(name) || Object.keys(skill.subSkills || {}).some(sub => this.matches(sub));
  }

  anyShown(): boolean {
    return Object.entries(this.character.applied().skills || {}).some(([name, skill]) => this.skillShown(name, skill as Skill));
  }

  constructor(
    public character: ApplyCharacterService
  ) {}

  isFamily(skillKey: string): boolean {
    return isSkillFamily(skillKey);
  }

  // a trained only skill without a rank can not be used, the sheet still shows what it would be worth
  // name is the skill or, for a skill of a family, the family
  unusable(name: string, skill: Skill): boolean {
    return !canUseSkill(name, skill);
  }

  skillAdditional(skill: Skill): Array<[number, string]> {
    return skillAdditional(skill);
  }

  getSkillRanks(skillKey: string): number {
    return this.character.raw().skills?.[skillKey]?.ranks ?? 0;
  }

  onSkillRanksChange(skillKey: string, ranks: number): void {
    const raw = this.character.raw();
    if (!raw.skills[skillKey]) {
      raw.skills[skillKey] = {
        name: skillKey,
        ranks: 0,
        value: 0,
        classSkill: false,
        baseAbility: skillAbilityMap[skillKey] || 'int',
      };
    }
    raw.skills[skillKey].ranks = Number(ranks) || 0;
    this.skillChange.emit({ skills: raw.skills });
  }

  getSubSkillRanks(familyKey: string, subKey: string): number {
    return this.character.raw().skills?.[familyKey]?.subSkills?.[subKey]?.ranks ?? 0;
  }

  onSubSkillRanksChange(familyKey: string, subKey: string, ranks: number): void {
    const raw = this.character.raw();
    if (!raw.skills[familyKey]) {
      raw.skills[familyKey] = {
        name: familyKey,
        ranks: 0,
        value: 0,
        classSkill: false,
        baseAbility: skillAbilityMap[familyKey] || 'int',
        subSkills: {},
      };
    }
    if (!raw.skills[familyKey].subSkills) {
      raw.skills[familyKey].subSkills = {};
    }
    if (!raw.skills[familyKey].subSkills![subKey]) {
      raw.skills[familyKey].subSkills![subKey] = {
        name: subKey,
        ranks: 0,
        value: 0,
        classSkill: false,
        baseAbility: raw.skills[familyKey].baseAbility,
      };
    }
    raw.skills[familyKey].subSkills![subKey].ranks = Number(ranks) || 0;
    this.skillChange.emit({ skills: raw.skills });
  }

}
