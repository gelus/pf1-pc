import { TestBed } from '@angular/core/testing';

import { ApplyCharacterService } from '../apply-character.service';
import { skillRankBudget } from '../characterPipes/remaining-ranks.pipe';
import { Feature } from '../interfaces/character.interface';
import { availableFeats } from '../rules/class-progression';
import { xpForLevel } from '../rules/experience';
import { startingWealthOf } from '../rules/starting-wealth';
import { Character } from '../utils/character.class';
import { createItem } from './builders';
import { checkCreationStep } from './character-check';
import { setCharacterDetails } from './creation';
import { CreationConversation, completeCreationStep } from './creation-script';
import { addClassLevel } from './level-up';
import { finishCharacter } from './finished-character.spec-helper';

// a character made above 1st level: its 1st level built as usual, the others at the higher levels step, its gear
// bought with the wealth of its level (Core Rulebook, table 12-4)
describe('creating a character above 1st level', () => {
  let service: ApplyCharacterService;
  const conversation: CreationConversation = {playerTurns: 1};
  const levelsStep = () => completeCreationStep(service, conversation, {step: 'levels', decisions: 'fighter 2 and 3'}, true) as any;
  const fighter = () => addClassLevel(service, {class_name: 'Fighter', rolled_hp: 6, features: '[]'});
  // the ranks of every level spent, a skill at most the character level, and a feat for each one owed
  const spendAll = () => {
    const level = service.raw().classLevels.length;
    let left = skillRankBudget(service.applied()).available - skillRankBudget(service.applied()).spent;
    const skills = {...service.raw().skills};
    for (const name of ['climb', 'intimidate', 'perception', 'swim', 'ride', 'survival', 'handle animal', 'profession']) {
      const skill = skills[name];
      if (!skill || left <= 0) continue;
      const more = Math.min(left, level - (skill.ranks || 0));
      skills[name] = {...skill, ranks: (skill.ranks || 0) + more};
      left -= more;
    }
    const owed = availableFeats(service.applied()) - service.raw().feats.length;
    service.update({skills, feats: [...service.raw().feats, ...Array.from({length: owed}, (_, i) =>
      new Feature({name: `Later Feat ${i + 1}`, adjustments: {'saves.will': 1} as Feature['adjustments']}))]});
  };

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ApplyCharacterService);
    service.initializeCharacter(new Character());
    service.update({creation: {step: 'concept', decisions: {}}});
  });

  it('buys its gear with the wealth of its level', () => {
    finishCharacter(service);
    expect(startingWealthOf(service.raw())).toBe(175);
    expect(setCharacterDetails(service, {starting_level: 5}).done).toContain('made at level 5 (10500 gp of wealth)');
    expect(startingWealthOf(service.raw())).toBe(10500);
    expect(setCharacterDetails(service, {starting_level: 21}).error).toContain('1 to 20');
    // one item for more than half the wealth is told, not refused
    createItem(service, {name: 'Belt of Giant Strength +4', type: 'other', cost_gp: 16000, based_on: 'own knowledge', features: '[]'});
    const check = checkCreationStep(service, 'equipment');
    expect(check.errors.join(' ')).toContain('more than the starting gold');
    expect(check.warnings.join(' ')).toContain('more than half the character\'s wealth (5250 gp)');
  });

  it('adds the levels after the 1st at their own step, and ends with the experience of its level', () => {
    finishCharacter(service);
    service.update({startingLevel: 3, creation: {step: 'levels', decisions: {concept: 'a 3rd-level dwarf fighter'}}});
    expect(levelsStep().error).toContain('levels 2 to 3');
    expect(fighter().done).toContain('Fighter 2');
    expect(fighter().done).toContain('Fighter 3');
    expect(levelsStep().error).toContain('skill ranks');
    spendAll();
    const end = levelsStep();
    // the rest is on the sheet already (the gear, the name), a fighter casts nothing: the creation ends
    expect(end.done).toContain('the character is created');
    expect(service.raw().creation).toBeUndefined();
    expect(service.raw().experience).toBe(xpForLevel(3)!);
  });

  it('is skipped for a character made at 1st level, and set only while creating', () => {
    finishCharacter(service);
    service.update({creation: {step: 'traits', decisions: {}}});
    const next = completeCreationStep(service, conversation, {step: 'traits', decisions: 'none'}, true) as any;
    expect(JSON.stringify(next)).not.toContain('"levels"');
    service.update({creation: undefined});
    expect(setCharacterDetails(service, {starting_level: 4}).error).toContain('levels up');
  });
});
