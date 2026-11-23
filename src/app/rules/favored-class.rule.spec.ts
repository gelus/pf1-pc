import { TestBed } from '@angular/core/testing';
import { ComponentFixture } from '@angular/core/testing';

import { ApplyCharacterService } from '../apply-character.service';
import { FavoredClassOption } from '../interfaces/character.interface';
import { Character } from '../utils/character.class';
import { ClassLevel } from '../utils/classlevel.class';
import { addClassLevel, levelUpStatus } from '../ai/level-up';
import { setRace } from '../ai/creation';
import { checkCreatedCharacter } from '../ai/character-check';
import { ClassLevelFormComponent } from '../class-level-form/class-level-form.component';
import { RaceModalComponent } from '../race-modal/race-modal.component';

// the alternate favored class bonuses of a race (a dhampir wizard's +1/4 caster level with necromancy spells)
describe('alternate favored class bonuses', () => {
  let service: ApplyCharacterService;
  const necromancy: FavoredClassOption = {
    id: 'dhampir-wizard', class: 'Wizard', description: 'Add +1/4 to the wizard\'s caster level when casting spells of the necromancy school',
    adjustments: {'spells.wizard.casterLevel[necromancy]': 0.25},
  };
  const toughness: FavoredClassOption = {id: 'tough', class: 'Fighter', description: '+1/2 hp', adjustments: {hp: 0.5}};

  const dhampir = (levels: number, option = necromancy) => {
    const char = new Character();
    char.abilityScores = {str: 10, dex: 14, con: 12, int: 16, wis: 10, cha: 10};
    char.race = {name: 'Dhampir', subtype: 'Humanoid (dhampir)', features: [], favoredClassOptions: [necromancy, toughness]};
    char.favoredClasses = [option.class];
    char.classLevels = Array.from({length: levels}, (_, i) => new ClassLevel({
      name: option.class, level: i + 1, hitDice: 6, rolledHp: i ? 3 : 0, favoredClassBonus: 'other', favoredClassOption: option.id, features: [],
    }));
    service.initializeCharacter(JSON.parse(JSON.stringify(char)));
  };

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ApplyCharacterService);
  });

  it('adds up the picks and rounds the total down, as a situational bonus where the option says when', () => {
    dhampir(3);
    service.applied();
    expect(service.adjustmentsMap['spells.wizard.casterLevel']?.some(e => e.variant === 'necromancy')).toBeFalsy();
    const listed = service.applied().specialQuality.find(f => f.name === 'Favored class bonus (Wizard) x3')!;
    expect(listed.description).toContain('picked 3 times (so far spells.wizard.casterLevel[necromancy] 0.75, rounded down)');
    dhampir(4);
    service.applied();
    const entry = (service.adjustmentsMap['spells.wizard.casterLevel'] || []).find(e => e.variant === 'necromancy')!;
    expect(entry.value).toBe(1);
    expect(entry.origin).toContain('Favored class (Wizard)');
  });

  it('adds what is not situational to the total, and only on favored class levels', () => {
    dhampir(3, toughness);
    const withBonus = service.applied().hp;
    const raw = service.raw();
    raw.favoredClasses = [];
    service.update();
    expect(service.applied().hp).toBe(withBonus - 1);
  });

  it('takes the AI\'s pick from the race page, kept on the race, and refuses other with none', () => {
    const char = new Character();
    char.abilityScores = {str: 10, dex: 14, con: 12, int: 16, wis: 10, cha: 10};
    service.initializeCharacter(JSON.parse(JSON.stringify(char)));
    expect((setRace(service, {name: 'Dhampir', based_on: 'own knowledge', features: JSON.stringify([
      {name: 'Racial Stats', adjustments: {'speed.land': {value: 30, mode: 'set'}, size: {value: 4, mode: 'set'}, languages: 'Common', 'abilityScores.dex': 2}},
    ]), favored_class_options: JSON.stringify([{class: 'Wizard', description: 'Add +1/4 to the wizard\'s caster level when casting spells of the necromancy school', adjustments: {}}])}) as any).problems.join(' '))
      .toContain('its text gives numbers');
    const wizard = (args: object) => addClassLevel(service, {class_name: 'Wizard', school: 'universalist', based_on: 'own knowledge', favored_class_bonus: 'other',
      features: JSON.stringify([{gained_at: 1, name: 'Arcane Bond', description: 'a bonded object', description_only: 'its use is judged at the table'}]), ...args}) as any;
    expect(wizard({}).problems.join(' ')).toContain('give favored_class_option, the alternate bonus the player picked');
    const result = wizard({favored_class_option: JSON.stringify({description: 'Add +1/4 to the wizard\'s caster level when casting spells of the necromancy school', adjustments: {'spells.wizard.casterLevel[necromancy]': '1/4'}})});
    expect(result.done).toContain('Wizard 1');
    const options = service.raw().race.favoredClassOptions!;
    expect(options.length).toBe(1);
    expect(options[0].adjustments).toEqual({'spells.wizard.casterLevel[necromancy]': 0.25});
    expect(service.raw().classLevels[0].favoredClassOption).toBe(options[0].id);
    expect((levelUpStatus(service) as any).favoredClassBonusChoices).toContain(`other: Wizard: ${options[0].description}`);
    expect(checkCreatedCharacter(service).errors.join(' ')).not.toContain('alternate favored class bonus');
  });

  it('picks an option in the class level form, among the race\'s for that class', async () => {
    dhampir(1);
    const fixture: ComponentFixture<ClassLevelFormComponent> = TestBed.createComponent(ClassLevelFormComponent);
    fixture.componentInstance.classLevels = service.raw().classLevels;
    fixture.detectChanges();
    await fixture.whenStable();
    const select = fixture.nativeElement.querySelector('.class-favored-option-select') as HTMLSelectElement;
    expect(Array.from(select.options).map(o => o.textContent!.trim())).toEqual(['Pick the race\'s bonus', necromancy.description]);
  });

  it('edits the options in the race dialog, keeping their ids', async () => {
    dhampir(1);
    const fixture = TestBed.createComponent(RaceModalComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.componentInstance.favoredOptions[1].class = 'Ranger';
    fixture.componentInstance.save();
    expect(service.raw().race.favoredClassOptions!.map(o => [o.id, o.class])).toEqual([['dhampir-wizard', 'Wizard'], ['tough', 'Ranger']]);
  });
});
