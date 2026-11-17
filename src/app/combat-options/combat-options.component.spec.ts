import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CombatOptionsComponent } from './combat-options.component';
import { ApplyCharacterService } from '../apply-character.service';
import { Character } from '../utils/character.class';
import { Feature } from '../interfaces/character.interface';

describe('CombatOptionsComponent', () => {
  let fixture: ComponentFixture<CombatOptionsComponent>;
  let service: ApplyCharacterService;

  const show = (mutate: (char: Character) => void = () => {}) => {
    const char = new Character();
    mutate(char);
    service.initializeCharacter(char);
    fixture.detectChanges();
  };
  const labels = (): string[] => Array.from(
    fixture.nativeElement.querySelectorAll('.combat-option') as NodeListOf<Element>,
    label => label.textContent!.trim(),
  );

  beforeEach(async () => {
    await TestBed.configureTestingModule({imports: [CombatOptionsComponent]}).compileComponents();
    service = TestBed.inject(ApplyCharacterService);
    fixture = TestBed.createComponent(CombatOptionsComponent);
  });

  it('offers the options anyone can use', () => {
    show();
    expect(labels()).toEqual(['Fighting Defensively', 'Total Defense']);
  });

  it('offers an option a feature made available', () => {
    show(char => char.feats.push(new Feature({name: 'Power Attack', adjustments: {'availableCombatOptions.powerAttack': true}})));
    expect(labels()).toEqual(['Power Attack', 'Fighting Defensively', 'Total Defense']);
  });

  it('keeps which options are on in the raw character', () => {
    show();
    const checkbox = fixture.nativeElement.querySelector('.combat-option-fightingDefensively input') as HTMLInputElement;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(service.raw().combatOptions.fightingDefensively).toBeTrue();
    expect(service.raw().combatOptions.powerAttack).toBeFalse();
  });

  const toggle = (option: string, on: boolean) => {
    const checkbox = fixture.nativeElement.querySelector(`.combat-option-${option} input`) as HTMLInputElement;
    checkbox.checked = on;
    checkbox.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  };

  it('turns total defense off when fighting defensively is turned on, and the other way around', () => {
    show();
    toggle('totalDefense', true);
    toggle('fightingDefensively', true);
    expect(service.raw().combatOptions.fightingDefensively).toBeTrue();
    expect(service.raw().combatOptions.totalDefense).toBeFalse();
    toggle('totalDefense', true);
    expect(service.raw().combatOptions.fightingDefensively).toBeFalse();
    expect(service.raw().combatOptions.totalDefense).toBeTrue();
  });

  it('shows what a defensive option does while it is on', () => {
    show(char => char.skills['acrobatics'].ranks = 3);
    const summary = () => fixture.nativeElement.querySelector('.combat-option-totalDefense .combat-option-summary');
    expect(summary()).toBeNull();
    toggle('totalDefense', true);
    expect(summary().textContent.trim()).toBe('(+6 dodge AC, no attacks, not even attacks of opportunity)');
  });
});
