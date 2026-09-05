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

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display touch and flat-footed AC alongside AC', () => {
    const char = new Character();
    char.abilityScores.dex = 14;
    char.feats.push(
      new Feature({name: 'Chainmail', active: true, adjustments: {ac: {value: 6, type: 'armor'}}}),
      new Feature({name: 'Dodge', active: true, adjustments: {ac: {value: 1, type: 'dodge'}}}),
    );
    TestBed.inject(ApplyCharacterService).initializeCharacter(char);
    fixture.detectChanges();

    const acRow = fixture.nativeElement.querySelector('.defense div');
    expect(acRow.textContent.replace(/\s+/g, ' ').trim()).toBe('AC: 19 Touch: 13 Flat-Footed: 16');

    const [, touch, flatFooted] = acRow.querySelectorAll('stat');

    touch.dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();
    expect(tooltipOf(touch)).toEqual(['17ac', '2dex', '-6armor, shield and natural armor']);

    flatFooted.dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();
    // no dex line, a flat-footed character keeps nothing of a positive dex bonus
    expect(tooltipOf(flatFooted)).toEqual(['17ac', '-1dodge']);
  });
});

const tooltipOf = (stat: Element): string[] =>
  Array.from(stat.querySelectorAll('.tooltip li'), li => li.textContent!.replace(/\s+/g, ' ').trim());
