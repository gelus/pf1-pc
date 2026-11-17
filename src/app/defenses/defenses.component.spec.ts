import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DefensesComponent } from './defenses.component';
import { ApplyCharacterService } from '../apply-character.service';
import { Character } from '../utils/character.class';
import { Feature } from '../interfaces/character.interface';

describe('DefensesComponent', () => {
  let fixture: ComponentFixture<DefensesComponent>;
  let charService: ApplyCharacterService;

  const text = (selector: string) =>
    (fixture.nativeElement.querySelector(selector)?.textContent || '').replace(/\s+/g, ' ').trim();

  beforeEach(async () => {
    await TestBed.configureTestingModule({imports: [DefensesComponent]}).compileComponents();
    charService = TestBed.inject(ApplyCharacterService);
    fixture = TestBed.createComponent(DefensesComponent);
  });

  it('shows the best defenses, and the old free text immunities', () => {
    const char = new Character();
    char.immune = 'disease';
    char.feats.push(
      new Feature({name: 'Golem', adjustments: {
        'damageReduction.-': 10,
        'damageReduction.magic': 5,
        'energyResistance.fire': 10,
        'energyResistance.cold': 5,
        spellResistance: 15,
        immunities: ['Disease', 'poison'],
        concealment: 20,
      }}),
      new Feature({name: 'Lesser', adjustments: {'damageReduction.Magic': 3, 'energyResistance.fire': 5}}),
      new Feature({name: 'Dampened', adjustments: {'damageReduction.-': {value: 8, mode: 'min'}}}),
    );
    charService.initializeCharacter(char);
    fixture.detectChanges();

    expect(text('.damage-reduction')).toBe('DR 8/—, 5/magic');
    expect(text('.energy-resistance')).toBe('Resist fire 10, cold 5');
    expect(text('.spell-resistance')).toBe('SR 15');
    expect(text('.immunities')).toBe('Immune disease, poison');
    expect(text('.concealment')).toBe('Concealment 20%');

    const tooltip = (selector: string) => {
      fixture.nativeElement.querySelector(selector).dispatchEvent(new MouseEvent('mouseenter'));
      fixture.detectChanges();
      const items = Array.from(fixture.nativeElement.querySelectorAll(`${selector} li`) as NodeListOf<HTMLElement>);
      return items.map(li => [li.textContent!.replace(/\s+/g, ' ').trim(), li.classList.contains('overwritten')]);
    };
    expect(tooltip('.damage-reduction')).toEqual([
      ['10/— Golem', false],
      ['≤8/— Dampened', false],
      ['5/magic Golem', false],
      ['3/magic Lesser', true],
    ]);
    expect(tooltip('.energy-resistance')).toEqual([
      ['fire 10 Golem', false],
      ['fire 5 Lesser', true],
      ['cold 5 Golem', false],
    ]);
  });

  it('shows the character\'s own damage reduction, even saved as a list', () => {
    const char = new Character() as any;
    char.damageReduction = [{value: 5, bypass: 'silver'}];
    char.feats.push(new Feature({name: 'Old Feature', adjustments: {damageReduction: {value: 3, bypass: 'Silver'}} as any}));
    charService.initializeCharacter(char);
    fixture.detectChanges();
    expect(text('.damage-reduction')).toBe('DR 5/silver');
    fixture.nativeElement.querySelector('.damage-reduction').dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();
    const items = Array.from(fixture.nativeElement.querySelectorAll('.damage-reduction li') as NodeListOf<HTMLElement>);
    expect(items.map(li => [li.textContent!.replace(/\s+/g, ' ').trim(), li.classList.contains('overwritten')])).toEqual([
      ['5/silver base', false],
      ['3/silver Old Feature', true],
    ]);
  });

  it('crosses out the character\'s own value when a feature gives more', () => {
    const char = new Character();
    char.spellResistance = 11;
    char.feats.push(new Feature({name: 'Spell Resistance', adjustments: {spellResistance: 15}}));
    charService.initializeCharacter(char);
    fixture.detectChanges();
    expect(text('.spell-resistance')).toBe('SR 15');
    fixture.nativeElement.querySelector('.spell-resistance').dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();
    const overwritten = Array.from(fixture.nativeElement.querySelectorAll('.spell-resistance li.overwritten') as NodeListOf<HTMLElement>);
    expect(overwritten.map(li => li.textContent!.replace(/\s+/g, ' ').trim())).toEqual(['11 base']);
  });

  it('shows nothing the character does not have', () => {
    charService.initializeCharacter(new Character());
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent.trim()).toBe('');
  });
});
