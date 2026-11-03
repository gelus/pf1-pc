import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { CharacterSheetComponent } from './character-sheet.component';
import { ApplyCharacterService } from '../apply-character.service';
import { Character } from '../utils/character.class';
import { Feature } from '../interfaces/character.interface';

describe('CharacterSheetComponent', () => {
  let component: CharacterSheetComponent;
  let fixture: ComponentFixture<CharacterSheetComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CharacterSheetComponent],
      providers: [provideRouter([])]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CharacterSheetComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  // the AC stats share a row, in the order of AC - touch - flat-footed
  const showCharacter = (mutate: (char: Character) => void = () => {}): Element => {
    const char = new Character();
    mutate(char);
    TestBed.inject(ApplyCharacterService).initializeCharacter(char);
    fixture.detectChanges();
    return fixture.nativeElement.querySelector('.defense div');
  };

  const feature = (name: string, adjustments: any): Feature => new Feature({name, active: true, adjustments});

  // the tooltip of a stat shows up while it is hovered
  const tooltipOf = (stat: Element): string[] => {
    stat.dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();
    const tooltip = Array.from(stat.querySelectorAll('.tooltip li'), li => text(li));
    stat.dispatchEvent(new MouseEvent('mouseleave'));
    fixture.detectChanges();
    return tooltip;
  };

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display touch and flat-footed AC alongside AC', () => {
    const acRow = showCharacter(char => {
      char.abilityScores.dex = 14;
      char.feats.push(
        feature('Chainmail', {ac: {value: 6, type: 'armor'}}),
        feature('Dodge', {ac: {value: 1, type: 'dodge'}}),
      );
    });

    expect(text(acRow)).toBe('AC: 19 Touch: 13 Flat-Footed: 16');

    const [ac, touch, flatFooted] = acRow.querySelectorAll('stat');

    // every AC lists the base it starts from, the dex modifier it uses and the adjustments that reached it
    expect(tooltipOf(ac)).toEqual(['10base', '2 dex', '6 (armor)Chainmail', '1 (dodge)Dodge']);
    // touch AC ignores the armor bonus
    expect(tooltipOf(touch)).toEqual(['10base', '2 dex', '1 (dodge)Dodge']);
    // a flat-footed character keeps neither its dodge bonus nor its dex bonus
    expect(tooltipOf(flatFooted)).toEqual(['10base', '6 (armor)Chainmail']);
  });

  it('should keep a dex penalty in the flat-footed AC', () => {
    const acRow = showCharacter(char => char.abilityScores.dex = 6);

    expect(text(acRow)).toBe('AC: 8 Touch: 8 Flat-Footed: 8');

    const [, , flatFooted] = acRow.querySelectorAll('stat');
    expect(tooltipOf(flatFooted)).toEqual(['10base', '-2 dex']);
  });

  it('should cap the dex bonus of AC and touch AC by the max dex bonus of worn armor', () => {
    const acRow = showCharacter(char => {
      char.abilityScores.dex = 18;
      char.feats.push(feature('Breastplate', {ac: {value: 6, type: 'armor'}, maxDexBonus: 3}));
    });

    expect(text(acRow)).toBe('AC: 19 Touch: 13 Flat-Footed: 16');

    const [, touch] = acRow.querySelectorAll('stat');
    expect(tooltipOf(touch)).toEqual(['10base', '3 (max 3)dex']);
  });

  it('denies positive dex bonus to AC, Touch AC, and CMD once while keeping dex penalties and showing sources in tooltips', () => {
    const acRow = showCharacter(char => {
      char.abilityScores.dex = 18; // +4 mod
      char.feats.push(feature('Breastplate', { ac: { value: 6, type: 'armor' }, maxDexBonus: 3 }));
      char.conditions.push(
        feature('Blinded', { ac: -2, 'denyDexBonus.ac': true }),
        feature('Stunned', { ac: -2, 'denyDexBonus.ac': true })
      );
    });

    // AC: 10 + 6 (armor) - 2 - 2 = 12 (loses +3 dex bonus once, not twice)
    // Touch: 10 - 2 - 2 = 6
    // Flat-Footed: 10 + 6 - 2 - 2 = 12
    expect(text(acRow)).toBe('AC: 12 Touch: 6 Flat-Footed: 12');

    const [ac, touch] = acRow.querySelectorAll('stat');
    expect(tooltipOf(ac)).toContain('denied dexBlinded');
    expect(tooltipOf(ac)).toContain('denied dexStunned');
    expect(tooltipOf(touch)).toContain('denied dexBlinded');
    expect(tooltipOf(touch)).toContain('denied dexStunned');

    // Dex penalty is still kept when denied dex bonus
    const penaltyRow = showCharacter(char => {
      char.abilityScores.dex = 6; // -2 penalty
      char.conditions.push(feature('Flat-Footed', { 'denyDexBonus.ac': true, 'denyDexBonus.cmd': true }));
    });
    expect(text(penaltyRow)).toBe('AC: 8 Touch: 8 Flat-Footed: 8');
  });

  it('displays Senses perception as a stat with variants, ability check totals, spellFailureChance, and suppressed conditions', () => {
    const char = new Character();
    char.abilityScores.wis = 14; // +2
    char.abilityScores.str = 16; // +3
    char.skills['perception'].ranks = 1;
    char.classLevels.push({
      name: 'Barbarian',
      level: 1,
      hitDice: 12,
      rolledHp: 0,
      classSkills: ['perception'],
      skillRanks: 4,
      startingWealth: 0,
      features: [],
    });
    char.conditions.push(
      feature('Shaken', { attackRollBonus: -2, savingThrowBonus: -2, skillCheckBonus: -2, abilityCheckBonus: -2 }),
      feature('Panicked', {
        savingThrowBonus: -2,
        skillCheckBonus: -2,
        abilityCheckBonus: -2,
        'skills.perception.value[sight]': 'auto-fail',
      }),
      feature('Deafened', { 'spellFailureChance[verbal]': 20 })
    );
    TestBed.inject(ApplyCharacterService).initializeCharacter(char);
    fixture.detectChanges();

    // Senses line uses stat element for perception: 1 rank + 3 classSkill + 2 wis - 2 skillCheckBonus (from Panicked only) = 4
    const bioStats = fixture.nativeElement.querySelectorAll('.bio stat');
    const perceptionStat = bioStats[1] as HTMLElement;
    expect(text(perceptionStat)).toBe('4');
    perceptionStat.dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();
    expect(text(perceptionStat.querySelector('.variant-header')!)).toBe('sight auto-fail');
    perceptionStat.dispatchEvent(new MouseEvent('mouseleave'));

    // Str check total: +3 str - 2 abilityCheckBonus = 1
    const strCheckStat = fixture.nativeElement.querySelectorAll('.statistics div stat')[1] as HTMLElement;
    expect(text(strCheckStat)).toBe('1');

    // Spell Failure Chance stat exists with verbal 20 variant
    const sfcStat = fixture.nativeElement.querySelector('stat[stat="spellFailureChance"]') as HTMLElement;
    expect(sfcStat).toBeTruthy();
    expect(text(sfcStat)).toBe('0');
    sfcStat.dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();
    expect(text(sfcStat.querySelector('.variant-header')!)).toBe('verbal 20');

    // Shaken shows as suppressed in the conditions list while Panicked does not
    const conditionSpans = fixture.nativeElement.querySelectorAll('.conditions app-feature-list > span');
    expect(conditionSpans[0].classList.contains('suppressed')).toBeTrue();
    expect(conditionSpans[1].classList.contains('suppressed')).toBeFalse();
  });
});

const text = (element: Element): string => element.textContent!.replace(/\s+/g, ' ').trim();
