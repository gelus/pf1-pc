import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ClassLevelFormComponent } from './class-level-form.component';
import { ClassLevel } from '../utils/classlevel.class';
import { Feature } from '../interfaces/character.interface';

describe('ClassLevelFormComponent', () => {
  let component: ClassLevelFormComponent;
  let fixture: ComponentFixture<ClassLevelFormComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ClassLevelFormComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ClassLevelFormComponent);
    component = fixture.componentInstance;
    component.classLevels = [
      new ClassLevel({
        name: 'Barbarian',
        level: 1,
        hitDice: 12,
        rolledHp: 0,
        skillRanks: 4,
        startingWealth: 105,
        classSkills: ['acrobatics', 'climb'],
        features: [new Feature({ name: 'Rage', adjustments: { 'abilityScores.str': 4 } })],
      }),
    ];
    fixture.detectChanges();
  });

  it('should create and render all ClassLevel fields and EditFeatureArrayComponent', () => {
    expect(component).toBeTruthy();
    expect((fixture.nativeElement.querySelector('.class-name-input') as HTMLInputElement).value).toBe('Barbarian');
    expect(fixture.nativeElement.querySelector('.class-level-input')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.class-hitdice-input')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.class-rolledhp-input')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.class-skillranks-input')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.class-wealth-input')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.class-skills-input')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('app-edit-feature-array')).toBeTruthy();
  });

  it('should allow adding and removing class levels and toggling class skills', () => {
    component.addClassLevel();
    fixture.detectChanges();
    expect(component.classLevels.length).toBe(2);
    expect(component.classLevels[1].level).toBe(2);

    component.toggleClassSkill(component.classLevels[0], 'perception', true);
    expect(component.classLevels[0].classSkills).toContain('perception');

    component.toggleClassSkill(component.classLevels[0], 'climb', false);
    expect(component.classLevels[0].classSkills).not.toContain('climb');

    component.removeClassLevel(1);
    expect(component.classLevels.length).toBe(1);
  });

  it('adds a level of a core class from its preset, counting the levels of that class', () => {
    component.addPresetLevel('Rogue');
    component.addPresetLevel('Barbarian');
    const [, rogue, barbarian] = component.classLevels;
    expect(rogue.level).toBe(1);
    expect(rogue.babProgression).toBe('threeQuarters');
    expect(rogue.goodSaves).toEqual(['ref']);
    expect(rogue.skillRanks).toBe(8);
    expect(rogue.classSkills).toContain('disable device');
    // only the first character level gets the starting wealth
    expect(rogue.startingWealth).toBe(0);
    expect(barbarian.level).toBe(2);
    expect(barbarian.proficiencies).toBeUndefined();
  });

  it('edits the save progression and marks favored classes', () => {
    const cl = component.classLevels[0];
    component.setSaveProgression(cl, true);
    expect(cl.goodSaves).toEqual([]);
    component.toggleGoodSave(cl, 'fort', true);
    component.toggleGoodSave(cl, 'will', true);
    component.toggleGoodSave(cl, 'will', false);
    expect(cl.goodSaves).toEqual(['fort']);
    component.setSaveProgression(cl, false);
    expect(cl.goodSaves).toBeUndefined();

    let favored: string[] = [];
    component.favoredClassesChange.subscribe(f => favored = f);
    component.favoredClasses = [];
    component.toggleFavoredClass(cl, true);
    expect(favored).toEqual(['Barbarian']);
    expect(component.isFavoredClass(cl)).toBeTrue();
    component.toggleFavoredClass(cl, false);
    expect(favored).toEqual([]);
  });

  it('only lets every 4th character level pick an ability increase', () => {
    for (let i = 0; i < 4; i++) component.addClassLevel();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.class-ability-increase-select').length).toBe(1);
    expect(component.classLevels[4].level).toBe(5);
  });

  describe('proficiencies', () => {
    const chips = (kind: string): string[] =>
      Array.from(fixture.nativeElement.querySelectorAll(`.proficiency-${kind} .proficiency-chip`) as NodeListOf<HTMLElement>)
        .map(chip => chip.textContent!.replace('×', '').trim());

    it('shows the proficiencies a preset adds on the first level of its class only', () => {
      component.classLevels = [];
      component.addPresetLevel('Fighter');
      component.addPresetLevel('Fighter');
      fixture.detectChanges();
      const cards = fixture.nativeElement.querySelectorAll('.class-level-card') as NodeListOf<HTMLElement>;
      const chipsOf = (card: HTMLElement) =>
        Array.from(card.querySelectorAll('.proficiency-chip')).map(c => c.textContent!.replace('×', '').trim());
      expect(chipsOf(cards[0])).toEqual(['simple', 'martial', 'light', 'medium', 'heavy', 'shield', 'tower shield']);
      expect(chipsOf(cards[1])).toEqual([]);
      expect(cards[1].querySelector('.proficiencies-none')).toBeTruthy();
    });

    it('adds typed proficiencies, several at once, lowercase and once each', () => {
      const emitted = spyOn(component.classLevelsChange, 'emit');
      const cl = component.classLevels[0];
      component.addProficiencies(cl, 'weapons', 'Simple, longsword ,simple');
      component.addProficiencies(cl, 'weapons', ' ');
      expect(cl.proficiencies).toEqual({weapons: ['simple', 'longsword'], armor: []});
      expect(emitted).toHaveBeenCalledTimes(1);
    });

    it('adds what is typed in the input with the add button or enter', () => {
      fixture.detectChanges();
      const row = fixture.nativeElement.querySelector('.proficiency-armor') as HTMLElement;
      const input = row.querySelector('.add-proficiency-input') as HTMLInputElement;
      input.value = 'light';
      (row.querySelector('.add-proficiency-btn') as HTMLButtonElement).click();
      input.value = 'Shield';
      input.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter'}));
      fixture.detectChanges();
      expect(chips('armor')).toEqual(['light', 'shield']);
      expect(input.value).toBe('');
    });

    it('removes a proficiency with its chip, and drops the proficiencies once none is left', () => {
      const cl = component.classLevels[0];
      cl.proficiencies = {weapons: ['simple'], armor: ['light']};
      fixture.detectChanges();
      (fixture.nativeElement.querySelector('.proficiency-armor .remove-proficiency-btn') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(cl.proficiencies).toEqual({weapons: ['simple'], armor: []});
      expect(chips('armor')).toEqual([]);
      component.removeProficiency(cl, 'weapons', 'simple');
      expect(cl.proficiencies).toBeUndefined();
    });
  });
});
