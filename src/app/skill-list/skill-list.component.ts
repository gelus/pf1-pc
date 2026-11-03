import { Component, EventEmitter, Output } from '@angular/core';
import {Character} from '../utils/character.class';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {RemainingRanksPipe} from '../characterPipes/remaining-ranks.pipe';
import {MaxLevelPipe} from '../characterPipes/max-level.pipe';
import {ApplyCharacterService} from '../apply-character.service';
import {StatDisplayComponent} from '../stat-display/stat-display.component';
import {Skill} from '../interfaces/character.interface';
import {isSkillFamily, skillAbilityMap} from '../utils/skilllist.class';

@Component({
  selector: 'app-skill-list',
  imports: [StatDisplayComponent, RemainingRanksPipe, MaxLevelPipe, CommonModule, FormsModule],
  templateUrl: './skill-list.component.html',
  styleUrl: './skill-list.component.sass'
})
export class SkillListComponent {

  @Output() skillChange = new EventEmitter<Partial<Character>>();

  constructor(
    public character: ApplyCharacterService
  ) {}

  isFamily(skillKey: string): boolean {
    return isSkillFamily(skillKey);
  }

  skillAdditional(skill: Skill): Array<[number, string]> {
    return [
      [skill.ranks || 0, 'ranks'],
      [skill.classSkill && skill.ranks > 0 ? 3 : 0, 'class skill'],
    ];
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
