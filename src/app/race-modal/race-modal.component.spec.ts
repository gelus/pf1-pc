import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RaceModalComponent, racialStatsIndex } from './race-modal.component';
import { ApplyCharacterService } from '../apply-character.service';
import { Character } from '../utils/character.class';
import { Feature } from '../interfaces/character.interface';

describe('RaceModalComponent', () => {
  let fixture: ComponentFixture<RaceModalComponent>;
  let component: RaceModalComponent;
  let service: ApplyCharacterService;
  let closed: number;

  const halfOrc = (): Character => {
    const char = new Character();
    char.race = {
      name: 'Half-Orc', subtype: 'Human, orc', features: [
        new Feature({id: 'racial-stats', name: 'racial-stats', description: '', adjustments: {
          'speed.land': {value: 30, mode: 'set'}, size: {value: 4, mode: 'set'}, languages: 'Common, Orc', 'abilityScores.con': 2,
          'skills.survival.value': 1,
        }}),
        new Feature({id: 'intimidating', name: 'Intimidating', description: '+2 Intimidate', adjustments: {'skills.intimidate.value': 2}}),
        new Feature({id: 'darkvision', name: 'Darkvision', description: '60 ft', adjustments: {senses: 'Darkvision 60ft'}}),
      ],
    };
    return char;
  };

  const create = async (char: Character) => {
    service.initializeCharacter(char);
    fixture = TestBed.createComponent(RaceModalComponent);
    component = fixture.componentInstance;
    closed = 0;
    component.closed.subscribe(() => closed++);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const input = (selector: string): HTMLInputElement => fixture.nativeElement.querySelector(selector);
  const type = (selector: string, value: string) => {
    const el = input(selector);
    el.value = value;
    el.dispatchEvent(new Event('input'));
    el.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({imports: [RaceModalComponent]}).compileComponents();
    service = TestBed.inject(ApplyCharacterService);
  });

  it('shows the race: its name, subtype, racial stats and traits', async () => {
    await create(halfOrc());
    expect(input('.race-name').value).toBe('Half-Orc');
    expect(input('.race-subtype').value).toBe('Human, orc');
    expect(input('.race-ability-con').value).toBe('2');
    expect(input('.race-ability-str').value).toBe('');
    expect(input('.race-speed').value).toBe('30');
    expect((fixture.nativeElement.querySelector('.race-size') as HTMLSelectElement).selectedOptions[0].textContent!.trim()).toBe('Medium');
    expect(input('.race-languages').value).toBe('Common, Orc');
    expect(fixture.nativeElement.querySelector('.race-other-stats').textContent).toContain('skills.survival.value');
    expect(component.traits.map(t => t.name)).toEqual(['Intimidating', 'Darkvision']);
    expect(fixture.nativeElement.querySelectorAll('app-edit-feature-array .feature-array-item').length).toBe(2);
  });

  it('saves the edits as one step that undoes, keeping the stats first and their other adjustments', async () => {
    await create(halfOrc());
    type('.race-name', 'Half-Elf');
    type('.race-subtype', 'Human, elf');
    type('.race-ability-con', '0');
    type('.race-ability-dex', '2');
    type('.race-speed', '35');
    type('.race-languages', 'Common, Elven');
    component.setNumber('size', 3);
    input('.race-quadruped').click();
    component.traits.splice(0, 1);
    fixture.nativeElement.querySelector('.race-save').click();

    const race = service.raw().race;
    expect(race.name).toBe('Half-Elf');
    expect(race.subtype).toBe('Human, elf');
    expect(race.quadruped).toBeTrue();
    expect(race.features.map(f => f.name)).toEqual(['racial-stats', 'Darkvision']);
    expect(race.features[0].adjustments).toEqual({
      'speed.land': {value: 35, mode: 'set'}, size: {value: 3, mode: 'set'}, languages: 'Common, Elven', 'abilityScores.dex': 2,
      'skills.survival.value': 1,
    } as any);
    expect(service.applied().size).toBe(3);
    expect(closed).toBe(1);

    service.undo();
    expect(service.raw().race.name).toBe('Half-Orc');
    expect(service.raw().race.features.length).toBe(3);
  });

  it('changes nothing on cancel or escape', async () => {
    await create(halfOrc());
    type('.race-name', 'Gnome');
    fixture.nativeElement.querySelector('.race-cancel').click();
    document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape'}));
    expect(closed).toBe(2);
    expect(service.raw().race.name).toBe('Half-Orc');
  });

  it('adds racial stats to a race without them, first, and none when nothing is set', async () => {
    const char = new Character();
    char.race = {name: 'Odd', subtype: '', features: [new Feature({id: 'trait', name: 'Trait', adjustments: {}})]};
    await create(char);
    component.save();
    expect(service.raw().race.features.map(f => f.name)).toEqual(['Trait']);

    await create(char);
    component.setNumber('speed.land', 20);
    component.save();
    expect(service.raw().race.features.map(f => f.id)).toEqual(['racial-stats', 'trait']);
    expect(service.raw().race.features[0].adjustments).toEqual({'speed.land': {value: 20, mode: 'set'}} as any);
  });

  it('edits the racial stats as a whole feature on request', async () => {
    await create(halfOrc());
    fixture.nativeElement.querySelector('.race-stats-mode').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.race-stats app-feature-block')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.race-speed')).toBeNull();
  });

  it('finds the racial stats by id, name or what they hold', () => {
    expect(racialStatsIndex([new Feature({id: 'a', name: 'x'}), new Feature({id: 'racial-stats'})])).toBe(1);
    expect(racialStatsIndex([new Feature({id: 'a', name: 'Elf Racial Stats'})])).toBe(0);
    expect(racialStatsIndex([new Feature({id: 'a', name: 'x', adjustments: {}}), new Feature({id: 'b', name: 'y', adjustments: {size: 3}})])).toBe(1);
    expect(racialStatsIndex([new Feature({id: 'a', name: 'x', adjustments: {}})])).toBe(-1);
  });
});
