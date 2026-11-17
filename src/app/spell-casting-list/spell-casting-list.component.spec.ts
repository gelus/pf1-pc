import {ComponentFixture, TestBed} from '@angular/core/testing';
import {ApplyCharacterService} from '../apply-character.service';
import {Character} from '../utils/character.class';
import {SpellCastingListComponent} from './spell-casting-list.component';
import {Spell} from '../interfaces/character.interface';
import {CLASS_PRESETS, classLevelFromPreset} from '../rules/class-presets';
import {PERCENTILE_ROLL} from '../rules/spellcasting';

describe('SpellCastingListComponent', () => {
  let fixture: ComponentFixture<SpellCastingListComponent>;
  let service: ApplyCharacterService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({imports: [SpellCastingListComponent]}).compileComponents();
    fixture = TestBed.createComponent(SpellCastingListComponent);
    service = TestBed.inject(ApplyCharacterService);
    fixture.componentInstance.type = 'spells';
    fixture.componentInstance.label = 'Spells';

    const char = new Character();
    char.abilityScores.int = 16;
    char.spells = {
      wizard: {
        name: 'Wizard', ability: 'int', casterLevel: 2, concentration: 2,
        spells: [{
          perDay: {current: 2, total: 2},
          spells: [{
            name: 'Shield', school: 'Abjuration', castingTime: '1 standard action', components: ['V', 'S'],
            range: 'Personal', target: 'You', duration: '1 minute/level', savingThrow: 'None',
            spellResistance: false, description: 'An invisible shield of force appears.', adjustments: {ac: 4},
          }],
        }],
      },
    };
    service.initializeCharacter(char);
    fixture.detectChanges();
  });

  it('shows caster stats, spell levels, charges and spell names', () => {
    expect(text(fixture.nativeElement)).toMatch(/Wizard spells \(CL:\s*2\s*, concentration:\s*5\s*\)/);
    expect(text(fixture.nativeElement)).toContain('Level 0 DC 13 (2/2) Shield');
  });

  it('consumes and resets charges from the level links', () => {
    (fixture.nativeElement.querySelector('.charges-current') as HTMLElement).click();
    fixture.detectChanges();
    expect(service.raw().spells.wizard.spells[0].perDay.current).toBe(1);

    (fixture.nativeElement.querySelector('.charges-total') as HTMLElement).click();
    fixture.detectChanges();
    expect(service.raw().spells.wizard.spells[0].perDay.current).toBe(2);
  });

  it('opens metadata and casts an adjusting spell on self', () => {
    (fixture.nativeElement.querySelector('.spell-name') as HTMLElement).click();
    fixture.detectChanges();

    const modal = fixture.nativeElement.querySelector('app-spell-modal');
    expect(modal.classList).toContain('open');
    expect(text(modal)).toContain('School Abjuration');
    expect(text(modal)).toContain('Casting Time 1 standard action');
    expect(text(modal)).not.toContain('"ac"');

    const castOnSelf = Array.from(modal.querySelectorAll('button'))
      .find((button: any) => text(button) === 'Cast on Self') as HTMLElement;
    castOnSelf.click();
    fixture.detectChanges();

    expect(service.raw().spells.wizard.spells[0].perDay.current).toBe(1);
    expect(service.raw().conditions[0].name).toBe('Shield');
    expect(service.applied().ac).toBe(14);
  });
});

describe('SpellCastingListComponent with class casters', () => {
  let fixture: ComponentFixture<SpellCastingListComponent>;
  let service: ApplyCharacterService;
  let roll: number;

  const spell = (name: string, extra: Partial<Spell> = {}): Spell => ({
    name, school: 'evocation', castingTime: '1 standard action', components: ['V', 'S'], range: 'close',
    target: 'one creature', duration: 'instantaneous', savingThrow: 'Reflex half', spellResistance: true,
    description: name, ...extra,
  });

  const setUp = (char: Character) => {
    service.initializeCharacter(char);
    fixture.detectChanges();
  };

  beforeEach(async () => {
    roll = 10;
    await TestBed.configureTestingModule({
      imports: [SpellCastingListComponent],
      providers: [{provide: PERCENTILE_ROLL, useValue: () => roll}],
    }).compileComponents();
    fixture = TestBed.createComponent(SpellCastingListComponent);
    service = TestBed.inject(ApplyCharacterService);
    fixture.componentInstance.type = 'spells';
    fixture.componentInstance.label = 'Spells';
  });

  it('shows a cleric: DCs, slots with bonus spells, the domain slot, and casts its prepared spells', () => {
    const char = new Character();
    char.abilityScores.wis = 14;
    char.classLevels = [classLevelFromPreset(CLASS_PRESETS.find(p => p.name === 'Cleric')!, 1, true)];
    char.spells = {cleric: {name: '', ability: '', casterLevel: 0, concentration: 0, domains: ['Fire'], spells: [
      {perDay: {total: 0, current: 0}, spells: [spell('Guidance', {savingThrow: 'none'})]},
      {perDay: {total: 0, current: 0}, spells: [spell('Bless', {school: 'enchantment', savingThrow: 'none'}), spell('Burning Hands', {domain: 'Fire'})]},
    ]}};
    setUp(char);
    service.prepareSpell('cleric', 1, 'Bless');
    service.prepareSpell('cleric', 1, 'Burning Hands', 'extra');
    fixture.detectChanges();

    const content = text(fixture.nativeElement);
    expect(content).toContain('Cleric spells [prepared, divine]');
    expect(content).toContain('Level 0 DC 12 at will, prepares 3');
    expect(content).toContain('Level 1 DC 13 (2/2) + domain 1/1');
    expect(content).toContain('Burning Hands (DC 13)');
    expect(fixture.nativeElement.querySelector('.slots').title).toBe('1 base + 1 bonus');

    const prepared = fixture.nativeElement.querySelectorAll('.open-prepared') as NodeListOf<HTMLElement>;
    expect(Array.from(prepared).map(text)).toEqual(['Bless', 'Burning HandsD']);
    // a prepared spell opens like any other spell, nothing is cast yet
    prepared[1].click();
    fixture.detectChanges();
    const modal = fixture.nativeElement.querySelector('app-spell-modal') as HTMLElement;
    expect(modal.classList).toContain('open');
    expect(text(modal.querySelector('.opened-prepared')!)).toBe('This prepared spell is ready (domain slot)');
    expect(service.applied().spells['cleric'].spells[1].extraSlot!.current).toBe(1);
    // casting from there casts that prepared instance, the one in the domain slot
    (modal.querySelector('button.cast') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(modal.classList).not.toContain('open');
    expect(service.applied().spells['cleric'].spells[1].extraSlot!.current).toBe(0);
    expect(service.applied().spells['cleric'].spells[1].perDay.current).toBe(2);
    expect(fixture.nativeElement.querySelectorAll('.prepared-spell.cast').length).toBe(1);
    expect(text(fixture.nativeElement.querySelector('.last-cast'))).toBe('Burning Hands: cast');

    // opened again, the cast instance can not be cast twice
    (fixture.nativeElement.querySelectorAll('.open-prepared')[1] as HTMLElement).click();
    fixture.detectChanges();
    expect(text(modal.querySelector('.opened-prepared')!)).toBe('This prepared spell has been cast (domain slot)');
    expect((modal.querySelector('button.cast') as HTMLButtonElement).disabled).toBeTrue();

    (fixture.nativeElement.querySelector('.rest') as HTMLElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.prepared-spell.cast').length).toBe(0);
  });

  it('shows the arcane spell failure roll of a sorcerer in armor, and the spells known', () => {
    const char = new Character();
    char.abilityScores.cha = 12;
    char.arcaneSpellFailureChance = 15;
    char.classLevels = [classLevelFromPreset(CLASS_PRESETS.find(p => p.name === 'Sorcerer')!, 1, true)];
    char.spells = {sorcerer: {name: '', ability: '', casterLevel: 0, concentration: 0, spells: [
      undefined as any, {perDay: {total: 0, current: 0}, spells: [spell('Magic Missile', {savingThrow: 'none'})]},
    ]}};
    setUp(char);
    const content = text(fixture.nativeElement);
    expect(content).toContain('ASF: 15%');
    expect(content).toContain('max spell level 2 (Cha 12)');
    expect(content).toContain('Level 1 DC 12 (4/4) known 1/2 Magic Missile 15%');

    service.cast('spells', 'sorcerer', 1, service.applied().spells['sorcerer'].spells[1].spells[0]);
    fixture.detectChanges();
    expect(text(fixture.nativeElement.querySelector('.last-cast')))
      .toBe('Magic Missile: failed, its slot is spent (d% 10 against 15%)');
    expect(service.applied().spells['sorcerer'].spells[1].perDay.current).toBe(3);
  });
});

const text = (element: Element): string => element.textContent!.replace(/\s+/g, ' ').trim();
