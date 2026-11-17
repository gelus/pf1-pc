import { TestBed } from '@angular/core/testing';

import { ApplyCharacterService } from '../apply-character.service';
import example from '../example-character.json';
import {
  addCondition, castSpell, heal, removeCondition, rest, setCombatOption, setFeatureActive, takeDamage, undoLast, useCharges,
} from './play-actions';

// the play actions on the example barbarian: each changes what the sheet would, is one named step of the undo
// history, and says what it did or what went wrong
describe('play actions', () => {
  let service: ApplyCharacterService;
  const hp = () => service.applied().currentHp;
  const rage = () => service.applied().specialAttack.find(f => f.name === 'Rage')!;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ApplyCharacterService);
    service.initializeCharacter(JSON.parse(JSON.stringify(example)));
  });

  it('takes damage off the hit points, temporary ones first, and undoes it as one step', () => {
    const full = hp();
    service.update({tempHp: 3});
    const result = takeDamage(service, 5);
    expect(result.done).toBe('took 5 damage (3 off temporary hit points)');
    expect(hp()).toBe(full - 2);
    expect(service.raw().tempHp).toBe(0);
    expect(service.history.undoLabel()).toBe('take 5 damage');
    service.undo();
    expect(hp()).toBe(full);
    expect(service.raw().tempHp).toBe(3);
  });

  it('says what the damage left the character under', () => {
    const result = takeDamage(service, hp()) as any;
    expect(result.after.current).toBe(0);
    expect(result.after.conditions).toContain('Disabled');
  });

  it('takes nonlethal damage apart, and healing heals both', () => {
    const full = hp();
    takeDamage(service, 4);
    takeDamage(service, 3, true);
    expect(service.raw().nonlethalDamage).toBe(3);
    const result = heal(service, 10);
    expect(result.done).toBe('healed 10 (4 hit points were missing)');
    expect(hp()).toBe(full);
    expect(service.raw().nonlethalDamage).toBe(0);
  });

  it('refuses damage or healing that is not a number above 0', () => {
    expect(takeDamage(service, 'lots').error).toBeDefined();
    expect(heal(service, 0).error).toBeDefined();
    expect(service.history.canUndo()).toBeFalse();
  });

  it('puts on and takes off a condition of the rules, with what it does', () => {
    const ac = Number(service.applied().ac);
    expect(addCondition(service, 'blinded').done).toBe('the character is Blinded');
    expect(Number(service.applied().ac)).toBeLessThan(ac);
    expect(addCondition(service, 'Blinded').error).toBe('the character is already Blinded');
    expect(removeCondition(service, 'Blinded').done).toBe('the character is no longer Blinded');
    expect(service.applied().ac).toBe(ac);
    expect(addCondition(service, 'Sleepy').error).toBe('there is no condition "Sleepy"');
  });

  it('can not take off a condition the rules give', () => {
    takeDamage(service, hp());
    expect(removeCondition(service, 'Disabled').error).toContain('comes from the rules');
  });

  it('turns rage off and on and spends its uses', () => {
    const str = service.applied().abilityScores.str;
    expect(setFeatureActive(service, 'rage', false).done).toBe('Rage is off');
    expect(service.applied().abilityScores.str).toBe(str - 4);
    expect(setFeatureActive(service, 'Rage', false).error).toBe('Rage is already off');
    expect(setFeatureActive(service, 'Rage', true).done).toBe('Rage is on');
    expect(useCharges(service, 'Rage').done).toBe('used Rage');
    expect(rage().charges!.current).toBe(3);
    expect(useCharges(service, 'Rage', 9).error).toBe('Rage has 3 of 4 rages per day left');
    expect(service.history.undoLabel()).toBe('use Rage');
    service.undo();
    expect(rage().charges!.current).toBe(4);
  });

  it('turns on a combat option only when the character can use it', () => {
    expect(setCombatOption(service, 'Power Attack', true).error).toContain('can not use Power Attack');
    expect(setCombatOption(service, 'fighting defensively', true).done).toBe('Fighting Defensively is on');
    expect(setCombatOption(service, 'totalDefense', true).done).toBe('Total Defense is on');
    // total defense and fighting defensively do not go together, as on the sheet
    expect(service.raw().combatOptions.fightingDefensively).toBeFalse();
  });

  it('casts a spell: spends its slot, puts it on the character when on self, undoes it all as one step', () => {
    expect(castSpell(service, 'Longstrider').error).toBe('Longstrider was not cast: cha too low for level 1 spells');
    const char = JSON.parse(JSON.stringify(example));
    char.abilityScores.cha = 12;
    service.initializeCharacter(char);
    const speed = service.applied().speed.land ?? 0;
    const result = castSpell(service, 'longstrider', {onSelf: true}) as any;
    expect(result.done).toBe('cast Longstrider');
    expect(result.slotsLeft).toBe('0 of 1 level 1 barbarian slots');
    expect(service.applied().speed.land).toBeGreaterThan(speed);
    expect(castSpell(service, 'Longstrider').error).toContain('was not cast');
    service.undo();
    expect(service.applied().speed.land).toBe(speed);
    expect(service.applied().spells['barbarian'].spells[1].perDay.current).toBe(1);
    expect(castSpell(service, 'Fireball').error).toBe('the character has no spell "Fireball"');
  });

  it('rests for the night, and undo takes the rest back', () => {
    takeDamage(service, 6);
    useCharges(service, 'Rage');
    const tired = hp();
    const rested = rest(service);
    expect(rested.done).toBe('rested for the night');
    expect(rested['whatChanged']).toContain('Rage 3 → 4');
    expect(hp()).toBeGreaterThan(tired);
    expect(rage().charges!.current).toBe(4);
    expect(undoLast(service).done).toBe('undid rest for the night');
    expect(hp()).toBe(tired);
    expect(undoLast(service).done).toBe('undid use Rage');
  });
});
