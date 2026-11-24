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

  // an archetype taken by hand, as the AI's add_class_level takes one (rules/archetypes.ts)
  describe('archetypes', () => {
    const el = (selector: string) => fixture.nativeElement.querySelector(selector) as HTMLElement;
    const level = (n: number, features: string[]) => new ClassLevel({
      name: 'Barbarian', level: n, classSkills: ['climb'], features: features.map(name => new Feature({name, adjustments: {}})),
    });

    beforeEach(() => {
      component.classLevels = [level(1, ['Rage', 'Fast Movement']), level(2, ['Uncanny Dodge']), level(3, ['Trap Sense +1'])];
      fixture.detectChanges();
    });

    it('takes one at a level: its record, its class skills on every level, the features it replaces off them', async () => {
      const emitted = spyOn(component.classLevelsChange, 'emit');
      el('.add-archetype-btn').click();
      fixture.detectChanges();
      const draft = component.archetypeDrafts[0];
      Object.assign(draft, {name: 'Invulnerable Rager', replaces: 'Uncanny Dodge, Trap Sense', skillsAdd: 'Diplomacy'});
      fixture.detectChanges();
      expect(el('.archetype-takes-off').textContent).toContain('Uncanny Dodge (Barbarian 2), Trap Sense +1 (Barbarian 3)');
      expect(el('.archetype-draft-problems')).toBeNull();
      await component.takeArchetype(0);
      fixture.detectChanges();
      const [first, second, third] = component.classLevels;
      expect(first.archetypes).toEqual([{name: 'Invulnerable Rager', replaces: ['Uncanny Dodge', 'Trap Sense'], classSkills: {add: ['diplomacy']}}]);
      expect(second.features.map(f => f.name)).toEqual([]);
      expect(third.features.map(f => f.name)).toEqual([]);
      expect(component.classLevels.every(l => l.classSkills.includes('diplomacy'))).toBeTrue();
      expect(emitted).toHaveBeenCalled();
      expect(el('.archetype-name').textContent).toBe('Invulnerable Rager');
      expect(el('.archetype-changes').textContent).toContain('class skills + diplomacy');
      expect(el('.archetype-draft')).toBeNull();
    });

    it('tells what breaks the rules of archetypes, without refusing it', async () => {
      component.classLevels[0].archetypes = [{name: 'Invulnerable Rager', replaces: ['Uncanny Dodge']}];
      fixture.detectChanges();
      // a feature the archetype replaced, still on a level
      expect(el('.archetype-warnings').textContent).toContain('Uncanny Dodge is replaced by the Invulnerable Rager archetype');
      component.startArchetype(0);
      Object.assign(component.archetypeDrafts[0], {name: 'Savage Barbarian', replaces: 'Uncanny Dodge', alters: 'Fast Movement'});
      fixture.detectChanges();
      const problems = el('.archetype-draft-problems').textContent!;
      expect(problems).toContain('Savage Barbarian and Invulnerable Rager both replace or alter Uncanny Dodge');
      expect(problems).toContain('Savage Barbarian trades Fast Movement, which the character gained at Barbarian 1');
      await component.takeArchetype(0);
      expect(component.classLevels[0].archetypes!.map(a => a.name)).toEqual(['Invulnerable Rager', 'Savage Barbarian']);
    });

    it('changes the class\'s proficiencies at its 1st level, and its spellcasting on every level', async () => {
      component.classLevels = [
        new ClassLevel({name: 'Bard', level: 1, proficiencies: {weapons: ['simple', 'whip'], armor: ['light']},
          spellcasting: {origin: 'bard', ability: 'cha', type: 'spontaneous', arcane: true, table: 'bard'}}),
        new ClassLevel({name: 'Bard', level: 2, spellcasting: {origin: 'bard', ability: 'cha', type: 'spontaneous', arcane: true, table: 'bard'}}),
      ];
      component.startArchetype(0);
      Object.assign(component.archetypeDrafts[0], {name: 'Arrowsong Minstrel', replaces: 'Bardic Knowledge', weaponsAdd: 'longbow',
        weaponsRemove: 'whip', casting: 'changes', perDayChange: -1});
      await component.takeArchetype(0);
      const [first, second] = component.classLevels;
      expect(first.proficiencies!.weapons).toEqual(['simple', 'longbow']);
      expect(first.spellcasting!.perDayChange).toBe(-1);
      expect(second.spellcasting!.perDayChange).toBe(-1);

      component.startArchetype(1);
      Object.assign(component.archetypeDrafts[1], {name: 'Skirmisher', replaces: 'Versatile Performance', casting: 'none'});
      await component.takeArchetype(1);
      expect(component.classLevels.every(l => !l.spellcasting)).toBeTrue();
    });

    it('takes one that replaces nothing, "none" being no feature', async () => {
      component.startArchetype(0);
      Object.assign(component.archetypeDrafts[0], {name: 'Totem Warrior', replaces: 'none', alters: 'None'});
      expect(component.draftProblems(component.classLevels[0], component.archetypeDrafts[0])).toEqual([]);
      await component.takeArchetype(0);
      expect(component.classLevels[0].archetypes).toEqual([{name: 'Totem Warrior', replaces: []}]);
    });

    it('gives one up: its record leaves the level, the levels keep what it changed', () => {
      const cl = component.classLevels[0];
      cl.archetypes = [{name: 'Invulnerable Rager', replaces: ['Uncanny Dodge'], classSkills: {add: ['diplomacy']}}];
      cl.classSkills = ['climb', 'diplomacy'];
      component.removeArchetype(cl, cl.archetypes[0]);
      expect(cl.archetypes).toBeUndefined();
      expect(cl.classSkills).toEqual(['climb', 'diplomacy']);
    });
  });
});
