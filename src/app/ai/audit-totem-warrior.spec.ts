import { TestBed } from '@angular/core/testing';

import { ApplyCharacterService } from '../apply-character.service';
import { Feature } from '../interfaces/character.interface';
import { Character } from '../utils/character.class';
import { archetypesFrom } from './archetypes';
import { unfinishedStepNote } from './creation-script';
import { isDoingOf, isOwnSituation, toggledWhenActivated } from './mechanics';

// the fixes from the audit of a created human barbarian (Totem Warrior): its gear bought and "ready!" with no name,
// looks or backstory asked, an archetype that replaces nothing refused until the AI made up what it replaced, and a
// rage written as situational bonuses with no toggle
describe('fixes from the audit of a totem warrior barbarian', () => {
  let service: ApplyCharacterService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ApplyCharacterService);
    service.initializeCharacter(JSON.parse(JSON.stringify(new Character())));
  });

  it('takes an archetype whose page says it replaces nothing, said as "none"', () => {
    const none = archetypesFrom('[{"name": "Totem Warrior", "replaces": "none"}]', 'Barbarian');
    expect(none.problems).toEqual([]);
    expect(none.archetypes).toEqual([{name: 'Totem Warrior', replaces: []}]);
    expect(archetypesFrom('[{"name": "Totem Warrior", "replaces": ["none"], "alters": []}]', 'Barbarian').problems).toEqual([]);
    // a list left empty may be one not filled in: it is asked for, "none" among the ways to give it
    const empty = archetypesFrom('[{"name": "Totem Warrior", "replaces": [], "alters": []}]', 'Barbarian');
    expect(empty.problems.join(' ')).toContain('"replaces": "none" when its page says it replaces nothing');
  });

  it('switches a feature on whose every bonus is a variant of its own situation', () => {
    expect(isOwnSituation('Rage', 'raging')).toBeTrue();
    expect(isOwnSituation('Studied Target', 'vs. studied target')).toBeTrue();
    expect(isOwnSituation('Rage', 'vs. dragons')).toBeFalse();
    expect(isDoingOf('Track', 'follow tracks')).toBeFalse();
    expect(isDoingOf('Rage', 'raging')).toBeTrue();
    expect(isDoingOf('Bardic Performance', 'performing')).toBeTrue();
    expect(isOwnSituation('Hardy', 'vs. poison')).toBeFalse();
    const rage = toggledWhenActivated(new Feature({name: 'Rage', description: '+4 Str, +4 Con, +2 morale bonus on Will saves, -2 penalty to AC',
      adjustments: {'abilityScores.str[raging]': 4, 'abilityScores.con[raging]': 4, 'saves.will[raging]': 2, 'ac[raging]': -2}}));
    const entry = (rage.adjustments as any).specialAttack;
    expect(entry.active).toBeFalse();
    expect(entry.adjustments).toEqual({'abilityScores.str': 4, 'abilityScores.con': 4, 'saves.will': 2, 'ac': -2});
    expect(Object.keys(rage.adjustments)).toEqual(['specialAttack']);
    // a bonus only against something stays a variant, the feature is not switched
    const hardy = new Feature({name: 'Hardy', description: '+2 on saves against poison', adjustments: {'saves.fort[vs. poison]': 2}});
    expect(toggledWhenActivated(hardy)).toBe(hardy);
  });

  describe('a creation step left open at the end of a turn', () => {
    beforeEach(() => service.update({creation: {step: 'equipment', decisions: {}}}));

    it('sends the AI back once it made the step\'s changes and went quiet, or said the character is done', () => {
      expect(unfinishedStepNote(service, ['create_items'], 'I bought the kit.')).toContain('is at "Equipment"');
      expect(unfinishedStepNote(service, ['get_character_summary'], 'Your barbarian is ready!')).toContain('Never tell the player it is done');
      expect(unfinishedStepNote(service, ['create_items'], 'Here is the kit. Anything to change?')).toBeUndefined();
      expect(unfinishedStepNote(service, [], 'Which kit would you like?')).toBeUndefined();
      expect(unfinishedStepNote(service, [], 'Here are some kits to pick from.')).toBeUndefined();
    });

    it('says nothing once the creation is over', () => {
      service.update({creation: undefined});
      expect(unfinishedStepNote(service, ['create_items'], 'Your barbarian is ready!')).toBeUndefined();
    });
  });
});
