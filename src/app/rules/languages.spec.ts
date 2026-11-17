import { TestBed } from '@angular/core/testing';

import { ApplyCharacterService } from '../apply-character.service';
import { Character } from '../utils/character.class';
import { Feature } from '../interfaces/character.interface';
import { languagesRule, splitLanguages } from './languages';

describe('languages rule', () => {
  let service: ApplyCharacterService;

  // a half-orc: common and orc from its race
  const character = (mutate: (char: Character) => void = () => {}): Character => {
    const char = new Character();
    char.languages = [];
    char.race.features.push(new Feature({name: 'Half-Orc', active: true, adjustments: {languages: 'Common, Orc'}}));
    mutate(char);
    return char;
  };

  const apply = (char: Character): Character => {
    service.ruleModules = [languagesRule];
    service.initializeCharacter(char);
    return service.applied();
  };

  beforeEach(() => {
    service = TestBed.inject(ApplyCharacterService);
  });

  it('splits languages at their commas and drops the duplicates, keeping the first spelling', () => {
    expect(splitLanguages(['common', 'Common, Orc', ' giant ', ''])).toEqual(['common', 'Orc', 'giant']);
    expect(splitLanguages('Elven')).toEqual(['Elven']);
    expect(splitLanguages(undefined)).toEqual([]);
  });

  it('allows the racial languages to a character of int 10 without linguistics', () => {
    const applied = apply(character());
    expect(applied.languages).toEqual(['Common', 'Orc']);
    expect(applied.languagesAllowed).toBe(2);
  });

  it('does not count a racial language the character also listed itself', () => {
    const applied = apply(character(char => char.languages = ['common']));
    expect(applied.languages).toEqual(['common', 'Orc']);
    expect(applied.languagesAllowed).toBe(2);
  });

  it('allows a bonus language per point of int modifier and per rank of linguistics', () => {
    const applied = apply(character(char => {
      char.abilityScores.int = 14;
      char.skills['linguistics'].ranks = 3;
      char.languages = ['Giant', 'Goblin', 'Abyssal', 'Draconic', 'Elven', 'Gnoll'];
    }));
    expect(applied.languages.length).toBe(8);
    expect(applied.languagesAllowed).toBe(2 + 2 + 3);
  });

  it('gives no bonus language for an int penalty, and ability damage takes none away', () => {
    expect(apply(character(char => char.abilityScores.int = 6)).languagesAllowed).toBe(2);
    expect(apply(character(char => {
      char.abilityScores.int = 12;
      char.abilityDamage = {int: 4};
    })).languagesAllowed).toBe(3);
  });

  it('allows the languages any other feature gives', () => {
    const applied = apply(character(char => char.feats.push(
      new Feature({name: 'Tongue of the Sun and Moon', active: true, adjustments: {languages: ['Celestial', 'Infernal']}}),
    )));
    expect(applied.languages).toEqual(['Common', 'Orc', 'Celestial', 'Infernal']);
    expect(applied.languagesAllowed).toBe(4);
  });
});
