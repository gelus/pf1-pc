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
});
