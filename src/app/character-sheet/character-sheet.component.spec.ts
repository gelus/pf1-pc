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
});

const text = (element: Element): string => element.textContent!.replace(/\s+/g, ' ').trim();
