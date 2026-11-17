import { ComponentFixture, TestBed } from '@angular/core/testing';

import { StatDisplayComponent } from './stat-display.component';
import { ApplyCharacterService } from '../apply-character.service';
import { Character } from '../utils/character.class';
import { Feature } from '../interfaces/character.interface';

describe('StatDisplayComponent', () => {
  let component: StatDisplayComponent;
  let fixture: ComponentFixture<StatDisplayComponent>;
  let charService: ApplyCharacterService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StatDisplayComponent]
    })
    .compileComponents();

    charService = TestBed.inject(ApplyCharacterService);
    fixture = TestBed.createComponent(StatDisplayComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('stat', 'hp');
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('displays variants separated by top border only and includes savingThrowBonus variants on saves', () => {
    const char = new Character();
    char.abilityScores.wis = 14; // +2
    char.feats.push(
      new Feature({
        name: 'Heroism',
        active: true,
        adjustments: {
          'saves.will': { value: 1, type: 'morale' },
          'saves.will[fear]': { value: 2, type: 'morale' },
          'savingThrowBonus[sleep]': 2,
        },
      })
    );
    charService.initializeCharacter(char);

    fixture.componentRef.setInput('stat', 'saves.will');
    fixture.componentRef.setInput('ability', 'wis');
    fixture.detectChanges();

    expect(component.displayStat()).toBe(3);

    fixture.nativeElement.dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();

    const variantEls = fixture.nativeElement.querySelectorAll('.tooltip .variant') as NodeListOf<HTMLElement>;
    expect(variantEls.length).toBe(2);

    const style = getComputedStyle(variantEls[0]);
    expect(style.borderTopStyle).toBe('solid');
    expect(style.borderTopWidth).not.toBe('0px');
    expect(style.borderBottomStyle).toBe('none');
    expect(style.borderLeftStyle).toBe('none');
    expect(style.borderRightStyle).toBe('none');

    const headers = Array.from(variantEls, el =>
      el.querySelector('.variant-header')!.textContent!.replace(/\s+/g, ' ').trim()
    );
    expect(headers).toEqual(['sleep 5', 'fear 4']);
  });

  it('displays auto-fail for base stat and propagates auto-fail to all variants', () => {
    const char = new Character();
    char.feats.push(
      new Feature({
        name: 'Total Blindness',
        active: true,
        adjustments: {
          'skills.perception.value': 'auto-fail',
          'skills.perception.value[opposed]': 4,
        },
      })
    );
    charService.initializeCharacter(char);

    fixture.componentRef.setInput('stat', 'skills.perception.value');
    fixture.componentRef.setInput('ability', 'wis');
    fixture.detectChanges();

    expect(component.displayStat()).toBe('auto-fail');

    fixture.nativeElement.dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();

    const tooltipItems = Array.from(
      fixture.nativeElement.querySelectorAll('.tooltip > ul > li'),
      (li: any) => li.textContent.replace(/\s+/g, ' ').trim()
    );
    expect(tooltipItems).toContain('auto-fail Total Blindness');

    const variantHeader = fixture.nativeElement
      .querySelector('.tooltip .variant .variant-header')!
      .textContent!.replace(/\s+/g, ' ')
      .trim();
    expect(variantHeader).toBe('opposed auto-fail');
  });

  it('shows tooltip even when stat has only variant adjustments and no base adjustments', () => {
    const char = new Character();
    char.conditions.push(
      new Feature({
        name: 'Deafened',
        active: true,
        adjustments: { 'spellFailureChance[verbal]': 20 },
      })
    );
    charService.initializeCharacter(char);

    fixture.componentRef.setInput('stat', 'spellFailureChance');
    fixture.detectChanges();

    expect(component.displayStat()).toBe('0');

    fixture.nativeElement.dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();

    const tooltip = fixture.nativeElement.querySelector('.tooltip') as HTMLElement;
    expect(getComputedStyle(tooltip).display).not.toBe('none');
    expect(tooltip.querySelector('.variant-header')!.textContent!.replace(/\s+/g, ' ').trim()).toBe('verbal 20');
  });

  describe('ability damage', () => {
    const tooltipLines = (): string[] =>
      Array.from(fixture.nativeElement.querySelectorAll('.tooltip > ul > li') as NodeListOf<HTMLElement>,
        li => Array.from(li.children, el => el.textContent!.replace(/\s+/g, ' ').trim()).join(' '));

    const show = (char: Character, stat: string, ability: string, maxAbilityBonus?: number) => {
      charService.initializeCharacter(char);
      fixture.componentRef.setInput('stat', stat);
      fixture.componentRef.setInput('ability', ability);
      fixture.componentRef.setInput('maxAbilityBonus', maxAbilityBonus);
      fixture.detectChanges();
      fixture.nativeElement.dispatchEvent(new MouseEvent('mouseenter'));
      fixture.detectChanges();
    };

    it('lowers the modifier and shows the damage as its own line', () => {
      const char = new Character();
      char.abilityScores.str = 16;
      char.abilityDamage = {str: 3};
      show(char, 'abilityCheckBonus', 'str');
      expect(component.displayStat()).toBe(2);
      expect(tooltipLines()).toEqual(['3 str', '-1 Str damage (3)']);
    });

    it('shows no damage line without damage', () => {
      const char = new Character();
      char.abilityScores.str = 16;
      show(char, 'abilityCheckBonus', 'str');
      expect(tooltipLines()).toEqual(['3 str']);
    });

    it('takes the damage penalty off the bonus capped by the max dex bonus', () => {
      const char = new Character();
      char.abilityScores.dex = 18;
      char.abilityDamage = {dex: 2};
      show(char, 'ac', 'dex', 3);
      // 10 +3 (capped) -1
      expect(component.displayStat()).toBe(12);
      expect(tooltipLines()).toEqual(['3 (max 3) dex', '-1 Dex damage (2)']);
    });

    it('denies what is left of a dex bonus, a dex penalty from the damage still applies', () => {
      const bonusLeft = new Character();
      bonusLeft.abilityScores.dex = 16;
      bonusLeft.abilityDamage = {dex: 2};
      bonusLeft.denyDexBonus = {ac: true, cmd: false};
      show(bonusLeft, 'ac', 'dex');
      expect(component.displayStat()).toBe(10);

      const penaltyLeft = new Character();
      penaltyLeft.abilityScores.dex = 12;
      penaltyLeft.abilityDamage = {dex: 4};
      penaltyLeft.denyDexBonus = {ac: true, cmd: false};
      show(penaltyLeft, 'ac', 'dex');
      // 10 +1 -2
      expect(component.displayStat()).toBe(9);
    });
  });
});
