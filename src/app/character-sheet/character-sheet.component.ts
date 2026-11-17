import { Component } from '@angular/core';
import {ActivatedRoute, RouterLink} from '@angular/router';
import {abilityModifier} from '../ability-mod.pipe';
import {Character} from '../utils/character.class';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {AddFeatureModalComponent} from '../add-feature-modal/add-feature-modal.component';
import {Feature, Skill, sizes} from '../interfaces/character.interface';
import {InventoryListComponent} from '../inventory-list/inventory-list.component';
import {SkillListComponent} from '../skill-list/skill-list.component';
import {StatDisplayComponent} from '../stat-display/stat-display.component';
import {ApplyCharacterService} from '../apply-character.service';
import { ConditionsService } from '../conditions.service';
import {AttackComponent} from '../attack/attack.component';
import {JsonModalComponent} from '../json-modal/json-modal.component';
import {FeatureListComponent} from '../feature-list/feature-list.component';
import {SpellCastingListComponent} from '../spell-casting-list/spell-casting-list.component';
import {Attack} from '../utils/attack.class';
import {characterLevel} from '../utils/classlevel.class';
import {levelUpAvailable, nextLevelXp} from '../rules/experience';
import {availableFeats, pendingAbilityIncreases} from '../rules/class-progression';
import {DefensesComponent} from '../defenses/defenses.component';
import {CombatOptionsComponent} from '../combat-options/combat-options.component';
import {traitsAllowed, traitsUsed} from '../utils/background.util';
import {ABILITIES, Ability, abilityLabel} from '../rules/ability-damage';
import {currentHpChange} from '../rules/damage-taken';
import {
  LONG_TERM_CARE_DESCRIPTION, REST_DESCRIPTIONS, REST_KINDS, REST_LABELS, RestKind, TEMPORARY_HP_NOTE, restBlockedBy,
} from '../rules/rest';


import {skillAdditional} from '../stat-display/stat-total';
import {AiChatComponent} from '../ai-chat/ai-chat.component';
@Component({
  selector: 'app-character-sheet',
  imports: [
    AiChatComponent,
    CommonModule,
    FormsModule,
    RouterLink,
    AddFeatureModalComponent,
    InventoryListComponent,
    SkillListComponent,
    StatDisplayComponent,
    AttackComponent,
    JsonModalComponent,
    FeatureListComponent,
    SpellCastingListComponent,
    DefensesComponent,
    CombatOptionsComponent,
  ],
  templateUrl: './character-sheet.component.html',
  styleUrl: './character-sheet.component.sass'
})
export class CharacterSheetComponent {

  sizes = sizes;
  characterLevel = characterLevel;
  nextLevelXp = nextLevelXp;
  levelUpAvailable = levelUpAvailable;
  availableFeats = availableFeats;
  pendingAbilityIncreases = pendingAbilityIncreases;
  advancementTracks = ['slow', 'medium', 'fast'];
  traitsAllowed = traitsAllowed;
  traitsUsed = traitsUsed;
  abilities = ABILITIES;
  abilityLabel = abilityLabel;

  restKinds = REST_KINDS;
  restLabels = REST_LABELS;
  // a caregiver tends the character while it rests (long-term care), see rules/rest.ts
  restLongTermCare = false;

  // a dead or dying character can not rest
  restBlocked(char: Character): 'dead' | 'dying' | undefined {
    return restBlockedBy(this.character.raw(), char);
  }

  // what a rest does, or why the character can not rest
  restTitle(kind: RestKind, char: Character): string {
    const blocked = this.restBlocked(char);
    if (blocked) return blocked === 'dead' ? 'A dead character can not rest.' : 'A dying character can not rest, stabilize it first.';
    return [REST_DESCRIPTIONS[kind], this.restLongTermCare ? LONG_TERM_CARE_DESCRIPTION : '', TEMPORARY_HP_NOTE]
      .filter(Boolean).join('\n');
  }

  rest(kind: RestKind): void {
    this.character.rest({kind, longTermCare: this.restLongTermCare});
  }

  // damage is whole points and never negative
  toPoints(value: any): number {
    return Math.max(0, Math.floor(Number(value) || 0));
  }

  // the attacks with the best first attack roll first, attacks keep their order on a tie. only the sheet sorts them,
  // the character keeps its attacks in order: adjustments name an attack by its place (melee.0.toHitBonus)
  byToHit<T extends Attack>(attacks: T[]): T[] {
    const first = (attack: T): number => attack.result?.attackBonuses?.[0] ?? -Infinity;
    return [...attacks].sort((a, b) => first(b) - first(a));
  }

  // what a condition the rules gave does, and why the character is under it
  ruleConditionTooltip(condition: Feature): string {
    const why = [condition.source, condition.reason].filter(Boolean).join(': ');
    return [why ? `${condition.name} (${why})` : condition.name, condition.description?.trim()].filter(Boolean).join('\n\n');
  }

  // the character keeps the damage it took, so entering its current hp stores the damage leaving it with that much
  // (and ends its being stable once it takes more damage or is healed, see currentHpChange)
  setCurrentHp(char: Character, currentHp: any): void {
    if (currentHp === null || currentHp === '') return;
    this.character.update(currentHpChange(this.character.raw(), char, Number(currentHp) || 0));
  }

  setAbilityPoints(raw: Character, field: 'abilityDamage' | 'abilityDrain', ability: Ability, points: any): void {
    this.character.update({[field]: {...raw[field], [ability]: this.toPoints(points)}});
  }

  // a flat-footed character loses its dex bonus to ac, a dex penalty however still applies
  flatFootedAbility(char: Character): string {
    return abilityModifier(char, 'dex') < 0 ? 'dex' : '';
  }

  // the weapon and armor proficiencies of the character, each with what granted it (a class, a feat, ...)
  proficiencies(char: Character): {kind: string, names: {name: string, from: string}[]}[] {
    const sourcesOf = (kind: 'weapons' | 'armor', name: string): string[] => [...new Set(
      (this.character.adjustmentsMap[`proficiencies.${kind}`] || [])
        .filter(entry => (Array.isArray(entry.value) ? entry.value : [entry.value])
          .some((granted: unknown) => String(granted).trim().toLowerCase() === name.toLowerCase()))
        .map(entry => entry.origin)
    )];
    return (['weapons', 'armor'] as const)
      .map(kind => ({
        kind: kind === 'weapons' ? 'Weapons' : 'Armor',
        names: (char.proficiencies?.[kind] || []).map(name => ({name, from: sourcesOf(kind, name).join(', ')})),
      }))
      .filter(({names}) => names.length);
  }

  skillAdditional(skill: Skill): Array<[number, string]> {
    return skillAdditional(skill);
  }

  constructor(
    private route: ActivatedRoute,
    public character: ApplyCharacterService,
    public conditions: ConditionsService,
  ) {
    this.character.initializeCharacter(new Character(this.route.snapshot.params['characterid']), true)
  }

}
