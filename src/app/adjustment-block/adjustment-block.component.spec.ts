import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AdjustmentBlockComponent } from './adjustment-block.component';
import { ApplyCharacterService } from '../apply-character.service';
import { Character } from '../utils/character.class';
import { Attack } from '../utils/attack.class';
import { Item } from '../utils/item.class';

describe('AdjustmentBlockComponent', () => {
  let component: AdjustmentBlockComponent;
  let fixture: ComponentFixture<AdjustmentBlockComponent>;
  let characterService: ApplyCharacterService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdjustmentBlockComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(AdjustmentBlockComponent);
    component = fixture.componentInstance;
    characterService = TestBed.inject(ApplyCharacterService);
    characterService.initializeCharacter(new Character());
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should dynamically populate available fields including nested character fields', () => {
    const fields = component.getAvailableFields();
    expect(fields).toContain('ac');
    expect(fields).toContain('bab');
    expect(fields).toContain('abilityScores.str');
    expect(fields).toContain('abilityScores.dex');
    expect(fields).toContain('saves.fort');
    expect(fields).toContain('saves.will');
    expect(fields).toContain('speed.land');
    expect(fields).toContain('skills.perception');
    expect(fields).toContain('skills.perception.value');
    expect(fields).toContain('melee.*.damageBonus');
    expect(fields).toContain('skills.*.value');
    for (const ab of ['str', 'dex', 'con', 'int', 'wis', 'cha']) {
      expect(fields).toContain(`skills.@${ab}.value`);
    }
    for (const fam of ['knowledge', 'craft', 'perform', 'profession']) {
      expect(fields).toContain(`skills.${fam}.subSkills.*.value`);
    }
    expect(fields).toContain('skills.knowledge.subSkills.arcana.value');
    expect(fields).toContain('skills.knowledge.subSkills.nature.value');
  });

  it('should offer skills.<family>.subSkills.<name>.value for dynamically added specialties', () => {
    characterService.raw().feats.push({
      id: 'pottery-feat',
      name: 'Pottery',
      active: true,
      adjustments: { 'skills.craft.subSkills.pottery.value': 0 },
    } as any);
    characterService.update();

    const fields = component.getAvailableFields();
    expect(fields).toContain('skills.craft.subSkills.pottery.value');
  });

  it('should dynamically include new fields added to the character without manual registration', () => {
    const customChar: any = new Character();
    customChar.futureTopField = 42;
    customChar.futureSection = { nestedBonus: 5, deep: { subStat: 1 } };
    component.characterSource = customChar;

    const fields = component.getAvailableFields();
    expect(fields).toContain('futureTopField');
    expect(fields).toContain('futureSection.nestedBonus');
    expect(fields).toContain('futureSection.deep.subStat');
  });

  it('should filter dropdown options when typing and allow ArrowDown/ArrowUp/Enter selection', () => {
    component.addAdjustment();
    fixture.detectChanges();

    const keyInput = fixture.nativeElement.querySelector('.key-input') as HTMLInputElement;
    const arrowBtn = fixture.nativeElement.querySelector('.dropdown-arrow') as HTMLButtonElement;
    expect(keyInput).toBeTruthy();
    expect(arrowBtn).toBeTruthy();

    // Click dropdown arrow to open
    arrowBtn.click();
    fixture.detectChanges();
    expect(component.openDropdownIndex).toBe(0);

    // Type to filter
    component.onKeyInputChange(0, 'speed.');
    fixture.detectChanges();

    const filtered = component.getFilteredFields('speed.');
    expect(filtered).toEqual(['speed.land', 'speed.swim', 'speed.fly', 'speed.climb', 'speed.burrow']);

    const options = fixture.nativeElement.querySelectorAll('.field-option');
    expect(options.length).toBe(5);

    // Navigate down with ArrowDown to select 'speed.swim' (index 1)
    keyInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    fixture.detectChanges();
    expect(component.highlightedIndex).toBe(1);

    // Navigate down again to 'speed.fly' (index 2) and back up with ArrowUp to 'speed.swim' (index 1)
    keyInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    expect(component.highlightedIndex).toBe(2);
    keyInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    expect(component.highlightedIndex).toBe(1);

    // Press Enter to populate key with 'speed.swim'
    keyInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    fixture.detectChanges();

    expect(component.entries[0].key).toBe('speed.swim');
    expect(component.openDropdownIndex).toBeNull();
    expect(component.adjustments['speed.swim']).toBe(0);
  });

  it('should support adding and deleting multiple adjustments', () => {
    component.adjustments = { bab: 1 };
    component.syncEntriesFromAdjustments();
    fixture.detectChanges();

    expect(component.entries.length).toBe(1);

    component.addAdjustment();
    component.entries[1].key = 'saves.fort';
    component.entries[1].value = 2;
    component.syncToAdjustments();
    fixture.detectChanges();

    expect(component.adjustments).toEqual({ bab: 1, 'saves.fort': 2 });

    component.removeAdjustment(0);
    fixture.detectChanges();

    expect(component.entries.length).toBe(1);
    expect(component.adjustments).toEqual({ 'saves.fort': 2 });
  });

  it('should support number, string/formula, and typed bonus adjustment values', () => {
    component.adjustments = {
      'abilityScores.str': 4,
      ac: '-2-{mod:abilityScores.dex}',
      'saves.will': { type: 'moral', value: 2 },
    };
    component.syncEntriesFromAdjustments();
    fixture.detectChanges();

    expect(component.entries[0].valueType).toBe('number');
    expect(component.entries[1].valueType).toBe('string');
    expect(component.entries[2].valueType).toBe('typed');
    expect(component.entries[2].value).toEqual({ type: 'moral', value: 2 });

    // Change typed bonus value to a numeric string and verify it parses to number
    component.onTypedValueInputChange(component.entries[2], '5');
    expect(component.adjustments['saves.will']).toEqual({ type: 'moral', value: 5 });

    // Change typed bonus value to a formula string and verify it stays string
    component.onTypedValueInputChange(component.entries[2], '{mod:abilityScores.cha}');
    expect(component.adjustments['saves.will']).toEqual({ type: 'moral', value: '{mod:abilityScores.cha}' });
  });

  it('should edit damage reduction by bypass, migrating the old shape, and lists of immunities', () => {
    component.adjustments = {
      damageReduction: {value: 5, bypass: 'magic'},
      immunities: ['poison', 'sleep'],
    } as any;
    component.syncEntriesFromAdjustments();
    fixture.detectChanges();

    expect(component.adjustments).toEqual({'damageReduction.magic': 5, immunities: ['poison', 'sleep']});
    expect(component.entries[0].key).toBe('damageReduction.magic');
    expect(component.entries[0].valueType).toBe('number');
    expect(component.entries[1].valueType).toBe('string');
    expect(component.entries[1].value).toBe('poison, sleep');

    component.entries[0].key = 'damageReduction.cold iron';
    component.entries[0].value = 10;
    component.syncToAdjustments();
    expect(component.adjustments['damageReduction.cold iron']).toBe(10);
    expect(component.adjustments['damageReduction.magic']).toBeUndefined();

    expect(component.getAvailableFields()).toContain('damageReduction.-');
    component.addAdjustment();
    component.selectField(component.entries.length - 1, 'damageReduction.-');
    expect(component.entries[2].valueType).toBe('number');
    component.onValueTypeChange(2, 'typed');
    component.onTypedValueInputChange(component.entries[2], '{bab}');
    expect(component.adjustments['damageReduction.-']).toEqual({type: '', value: '{bab}'});
  });

  it('should support nested Feature adjustments (such as Rage in specialAttack)', () => {
    component.adjustments = {
      specialAttack: {
        name: 'Rage',
        description: 'Barbarian rage',
        active: true,
        charges: { total: 4, current: 4, label: 'rages per day' },
        adjustments: {
          'abilityScores.str': 4,
          'saves.will': { type: 'moral', value: 2 },
        },
      },
    };
    component.syncEntriesFromAdjustments();
    fixture.detectChanges();

    expect(component.entries[0].valueType).toBe('feature');
    const nestedFeatureBlock = fixture.nativeElement.querySelector('app-feature-block');
    expect(nestedFeatureBlock).toBeTruthy();

    component.entries[0].value.name = 'Greater Rage';
    component.syncToAdjustments();
    expect((component.adjustments['specialAttack'] as any).name).toBe('Greater Rage');
  });

  it('edits how an attack is wielded, natural attacks, bows and the ammunition of ranged attacks', async () => {
    const arrows = Object.assign(new Item(), {name: 'Arrows', quantity: 20});
    const char = new Character();
    char.inventory.push(arrows);
    characterService.initializeCharacter(char);
    component.adjustments = {
      melee: [Object.assign(new Attack(), {name: 'Axe'}), Object.assign(new Attack(), {name: 'Bite', type: 'natural'})],
      ranged: Object.assign(new Attack(), {name: 'Composite Longbow', bow: 'composite'}),
    };
    component.syncEntriesFromAdjustments();
    fixture.detectChanges();
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const blocks = el.querySelectorAll('.attack-block');
    expect(blocks[0].querySelector('.attack-hand')).toBeTruthy();
    expect(blocks[0].querySelector('.attack-count')).toBeTruthy();
    expect(blocks[0].querySelector('.attack-bow')).toBeNull();
    expect(blocks[1].querySelector('.attack-composite-rating')).toBeTruthy();
    const ammunition = blocks[1].querySelector('.attack-ammunition') as HTMLSelectElement;
    expect(Array.from(ammunition.options, o => o.textContent!.trim())).toEqual(['none', 'Arrows (20)']);
    ammunition.value = ammunition.options[1].value;
    ammunition.dispatchEvent(new Event('change'));
    expect((component.adjustments['ranged'] as any).ammunitionId).toBe(arrows.id);
  });

  it('should support Attack adjustments for melee and ranged', () => {
    component.adjustments = {
      melee: {
        type: 'iterative',
        name: 'Great Axe',
        damage: '1d12',
        toHitAbility: 'str',
        toHitBonus: 0,
        damageAbility: 'str',
        damageBonus: 0,
        crit: 20,
        critMultiplier: 3,
        range: 0,
        damageType: ['S'],
      },
    };
    component.syncEntriesFromAdjustments();
    fixture.detectChanges();

    expect(component.entries[0].valueType).toBe('attack');
    expect(fixture.nativeElement.querySelector('.attack-block')).toBeTruthy();

    component.toggleDamageType(component.entries[0].value, 'P', true);
    expect((component.adjustments['melee'] as any).damageType).toEqual(['S', 'P']);
  });

  it('should support Spells and SpellLikeAbilities adjustments', () => {
    component.adjustments = {
      spells: {
        barbarian: {
          name: 'Barbarian',
          ability: 'cha',
          casterLevel: 1,
          concentration: 1,
          spells: [
            {
              perDay: { total: 3, current: 3, label: 'cantrips per day' },
              spells: [
                {
                  name: 'Detect Magic',
                  school: 'Divination',
                  castingTime: '1 standard action',
                  components: ['V', 'S'],
                  range: '60 ft.',
                  target: 'Cone-shaped emanation',
                  duration: '1 min./level',
                  savingThrow: 'None',
                  spellResistance: false,
                  description: 'Detects magical auras.',
                },
              ],
            },
          ],
        },
      },
    };
    component.syncEntriesFromAdjustments();
    fixture.detectChanges();

    expect(component.entries[0].valueType).toBe('spellCasting');
    expect(fixture.nativeElement.querySelector('app-spell-casting-editor')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('app-spell-form')).toBeTruthy();
  });
  describe('modes', () => {
    const load = (adjustments: any) => {
      component.adjustments = adjustments;
      component.syncEntriesFromAdjustments();
      fixture.detectChanges();
    };

    it('recognizes a wrapper with a mode as a typed bonus and keeps the mode', () => {
      load({size: {value: 3, mode: 'set'}});
      expect(component.entries[0].valueType).toBe('typed');
      expect(component.modeOf(component.entries[0])).toBe('set');
      component.onValueTypeChange(0, 'typed');
      expect(component.adjustments['size']).toEqual({type: '', value: 3, mode: 'set'});
    });

    it('offers a mode select for typed bonuses, adding by default', () => {
      load({ac: {value: 2, type: 'dodge'}});
      const select: HTMLSelectElement = fixture.nativeElement.querySelector('.typed-mode-select');
      expect(select).toBeTruthy();
      expect(Array.from(select.options).map(o => o.value)).toEqual(['add', 'set', 'min', 'max', 'raise', 'lower']);
      expect(component.modeOf(component.entries[0])).toBe('add');
    });

    it('stores a chosen mode and drops it again when switching back to add', () => {
      load({'speed.land': {value: 30, type: ''}});
      component.onModeChange(component.entries[0], 'set');
      expect(component.adjustments['speed.land']).toEqual({value: 30, type: '', mode: 'set'});
      component.onModeChange(component.entries[0], 'add');
      expect(component.adjustments['speed.land']).toEqual({value: 30, type: ''});
    });

    it('starts a new max dex bonus adjustment as a cap', () => {
      component.addAdjustment();
      component.selectField(component.entries.length - 1, 'maxDexBonus');
      expect(component.adjustments['maxDexBonus']).toEqual({type: '', value: 0, mode: 'min'});
    });

    it('offers maxDexBonus as a field, though nothing caps it by default', () => {
      expect(component.getAvailableFields()).toContain('maxDexBonus');
    });
  });

  describe('collapsing', () => {
    it('collapses the whole group to a line with how many adjustments it has', () => {
      component.adjustments = { 'speed.land': 10, ac: 2 };
      component.syncEntriesFromAdjustments();
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      const toggle = el.querySelector('.adjustments-toggle') as HTMLButtonElement;
      expect(toggle.type).toBe('button');
      expect(toggle.getAttribute('aria-expanded')).toBe('true');
      const entries = () => Array.from(el.querySelectorAll('.adjustment-entry')) as HTMLElement[];
      expect(entries().every(e => !e.hidden)).toBeTrue();

      toggle.click();
      fixture.detectChanges();
      expect(toggle.getAttribute('aria-expanded')).toBe('false');
      expect(entries().every(e => e.hidden)).toBeTrue();
      expect(el.querySelector('.adjustments-summary')!.textContent).toContain('2 adjustments: speed.land, ac');
      expect(component.adjustments).toEqual({ 'speed.land': 10, ac: 2 });

      // adding an adjustment opens the group to show it
      (el.querySelector('.add-adjustment-btn') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(component.collapsed).toBeFalse();
      expect(entries().length).toBe(3);
    });

    it('keeps a single nested adjustment open, and collapses it to a summary', () => {
      component.adjustments = {
        specialAttack: { name: 'Rage', description: '', adjustments: { 'abilityScores.str': 4, 'saves.will': 2 } },
        ac: -2,
      };
      component.syncEntriesFromAdjustments();
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      // only the nested entry has a toggle
      const toggles = el.querySelectorAll('.entry-toggle');
      expect(toggles.length).toBe(1);
      const toggle = toggles[0] as HTMLButtonElement;
      expect(toggle.getAttribute('aria-expanded')).toBe('true');
      expect(toggle.getAttribute('aria-label')).toBe('Details of specialAttack');
      const nested = el.querySelector('.nested-block') as HTMLElement;
      expect(nested.hidden).toBeFalse();
      // the nested feature is collapsed by its adjustment, it has no toggle of its own
      expect(nested.querySelector('.feature-collapse-toggle')).toBeNull();

      toggle.click();
      fixture.detectChanges();
      expect(toggle.getAttribute('aria-expanded')).toBe('false');
      expect(nested.hidden).toBeTrue();
      expect(el.querySelector('.entry-summary')!.textContent).toContain('specialAttack: Rage · 2 adjustments');
    });

    it('starts several nested adjustments collapsed, with the path and count of each', () => {
      component.adjustments = {
        melee: [Object.assign(new Attack(), { name: 'Axe' }), Object.assign(new Attack(), { name: 'Bite', type: 'natural' })],
        ranged: Object.assign(new Attack(), { name: 'Longbow' }),
        spells: { default: { casterLevel: 1, spells: [] } } as any,
      };
      component.syncEntriesFromAdjustments();
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      const nested = Array.from(el.querySelectorAll('.nested-block')) as HTMLElement[];
      expect(nested.map(n => n.hidden)).toEqual([true, true, true]);
      const summaries = Array.from(el.querySelectorAll('.entry-summary'), s => s.textContent!.trim());
      expect(summaries).toEqual(['melee: 2 attacks (Axe, Bite)', 'ranged: 1 attack (Longbow)', 'spells: 1 caster']);

      (el.querySelectorAll('.entry-toggle')[1] as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(nested.map(n => n.hidden)).toEqual([true, false, true]);
    });
  });
});

import exampleCharData from '../example-character.json';
import { ClassLevelFormComponent } from '../class-level-form/class-level-form.component';
import { ItemModalComponent } from '../item-modal/item-modal.component';

describe('Example Character Integration with Form Components', () => {
  it('should load and edit example-character.json classLevels (including Rage feature and Totem Magic spells) in ClassLevelFormComponent', async () => {
    await TestBed.configureTestingModule({
      imports: [ClassLevelFormComponent, ItemModalComponent],
    }).compileComponents();

    const clFixture = TestBed.createComponent(ClassLevelFormComponent);
    const clComp = clFixture.componentInstance;
    clComp.classLevels = JSON.parse(JSON.stringify(exampleCharData.classLevels));
    clFixture.detectChanges();

    expect(clComp.classLevels.length).toBe(1);
    expect(clComp.classLevels[0].name).toBe('Barbarian');
    expect(clComp.classLevels[0].features.length).toBe(3);

    // Verify nested Feature (Rage) and nested Spells (Totem Magic) are rendered via form components
    expect(clFixture.nativeElement.querySelectorAll('app-feature-block').length).toBeGreaterThanOrEqual(3);
    expect(clFixture.nativeElement.querySelector('app-spell-casting-editor')).toBeTruthy();
    expect(clFixture.nativeElement.querySelectorAll('app-spell-form').length).toBe(2);
    expect(clFixture.nativeElement.querySelector('textarea:not(.description-textarea)')).toBeNull();

    // Verify example-character.json inventory items in ItemModalComponent
    const itemFixture = TestBed.createComponent(ItemModalComponent);
    const itemComp = itemFixture.componentInstance;

    const armorItem = JSON.parse(JSON.stringify(exampleCharData.inventory[0]));
    itemComp.openModal(armorItem);
    itemFixture.detectChanges();
    expect(itemComp.itemKind).toBe('Armor');
    expect(itemFixture.nativeElement.querySelector('.armor-speed30-input')).toBeTruthy();

    const weaponItem = JSON.parse(JSON.stringify(exampleCharData.inventory[1]));
    itemComp.openModal(weaponItem);
    itemFixture.detectChanges();
    expect(itemComp.itemKind).toBe('Weapon');
    expect(itemFixture.nativeElement.querySelector('.item-category-input')).toBeTruthy();
    expect(itemFixture.nativeElement.querySelector('.attack-block')).toBeTruthy();
  });

});
