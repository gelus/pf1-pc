import { TestBed } from '@angular/core/testing';

import { ConditionsService } from './conditions.service';
import { ApplyCharacterService } from './apply-character.service';
import { Character } from './utils/character.class';
import { Feature } from './interfaces/character.interface';
import exampleCharacter from './example-character.json';

describe('ConditionsService', () => {
  let service: ConditionsService;
  let applyService: ApplyCharacterService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ConditionsService);
    applyService = TestBed.inject(ApplyCharacterService);
  });

  const getCond = (name: string): Feature => {
    const found = service.list.find(c => c.id === name && c.name === name);
    expect(found).withContext(`Expected condition ${name} to exist`).toBeDefined();
    return JSON.parse(JSON.stringify(found));
  };

  it('should be created and fix Facinated/Sickend typos while adding missing conditions', () => {
    expect(service).toBeTruthy();
    expect(service.list.find(c => c.id === 'Facinated' || c.name === 'Facinated')).toBeUndefined();
    expect(service.list.find(c => c.id === 'Sickend' || c.name === 'Sickend')).toBeUndefined();

    for (const required of [
      'Fascinated',
      'Sickened',
      'Dead',
      'Dying',
      'Stable',
      'Unconscious',
      'Energy Drained',
    ]) {
      expect(getCond(required)).toBeTruthy();
    }
  });

  it('applies Blinded, Dazzled, Deafened, Fascinated, Invisible, Prone, and Disabled accurately on example-character.json', () => {
    const char = Object.assign(new Character(), JSON.parse(JSON.stringify(exampleCharacter))) as Character;
    char.conditions.push(
      getCond('Blinded'),
      getCond('Dazzled'),
      getCond('Deafened'),
      getCond('Fascinated'),
      getCond('Invisible'),
      getCond('Prone'),
      getCond('Disabled')
    );

    applyService.initializeCharacter(char);
    const applied = applyService.applied();

    // Base perception value is unchanged; fly & str/dex skills get -4 from Blinded
    expect(applied.skills['perception'].value).toBe(0);
    expect(applied.skills['fly'].value).toBe(-4);
    expect(applied.skills['swim'].value).toBe(-4);
    expect(applied.denyDexBonus.ac).toBeTrue();
    expect(applied.speed.land).toBe(20); // 40 halved = 20

    // Perception variants: opposed (-4 Blinded + -4 Deafened = -8), sight (auto-fail), sound (auto-fail), reaction (-4)
    const percVariants = applyService.computeVariantsForPaths(
      ['skillCheckBonus', 'skills.perception.value'],
      -1,
      applied
    );
    expect(percVariants.find(v => v.name === 'opposed')!.total).toBe(-9);
    expect(percVariants.find(v => v.name === 'sight')!.total).toBe('auto-fail');
    expect(percVariants.find(v => v.name === 'sound')!.total).toBe('auto-fail');
    expect(percVariants.find(v => v.name === 'reaction')!.total).toBe(-5);

    // Deafened verbal spellFailureChance variant
    const sfcVariants = applyService.computeVariantsForPaths(['spellFailureChance'], 0, applied);
    expect(sfcVariants.find(v => v.name === 'verbal')!.total).toBe(20);

    // Invisible sighted attack variant
    const atkVariants = applyService.computeVariantsForPaths(['attackRollBonus'], 5, applied);
    expect(atkVariants.find(v => v.name === 'sighted')!.total).toBe(7);

    // Prone AC variants
    const acVariants = applyService.computeVariantsForPaths(['ac'], applied.ac as number, applied);
    expect(acVariants.find(v => v.name === 'melee')!.total).toBe((applied.ac as number) - 4);
    expect(acVariants.find(v => v.name === 'ranged')!.total).toBe((applied.ac as number) + 4);
  });

  it('applies Flat-Footed denyDexBonus unless character has Uncanny Dodge', () => {
    const char = Object.assign(new Character(), JSON.parse(JSON.stringify(exampleCharacter))) as Character;
    char.conditions.push(getCond('Flat-Footed'));
    applyService.initializeCharacter(char);

    expect(applyService.applied().denyDexBonus).toEqual({ ac: true, cmd: true });

    char.classLevels[0].features.push(new Feature({ name: 'Uncanny Dodge', active: true, adjustments: {} }));
    applyService.update();
    expect(applyService.applied().denyDexBonus).toEqual({ ac: false, cmd: false });
  });

  it('applies abilityCheckBonus on Shaken, Frightened, Panicked, and Sickened, and suppresses lower severity', () => {
    expect(getCond('Shaken').adjustments['abilityCheckBonus']).toBe(-2);
    expect(getCond('Frightened').adjustments['abilityCheckBonus']).toBe(-2);
    expect(getCond('Panicked').adjustments['abilityCheckBonus']).toBe(-2);
    expect(getCond('Sickened').adjustments['abilityCheckBonus']).toBe(-2);

    const char = new Character();
    char.conditions.push(getCond('Fatigued'), getCond('Exhausted'), getCond('Grappled'), getCond('Pinned'));
    applyService.initializeCharacter(char);
    const applied = applyService.applied();

    // Fatigued (-2) is suppressed by Exhausted (-6); Grappled (-4 dex) is suppressed by Pinned (-4 ac, denyDexBonus.ac)
    expect(applied.abilityScores.str).toBe(4);
    expect(applied.abilityScores.dex).toBe(4);
    expect(applied.ac).toBe(6);
    expect(applied.denyDexBonus.ac).toBeTrue();
  });
});
