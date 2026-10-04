import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SpellCastingEditorComponent } from './spell-casting-editor.component';

describe('SpellCastingEditorComponent', () => {
  let component: SpellCastingEditorComponent;
  let fixture: ComponentFixture<SpellCastingEditorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SpellCastingEditorComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(SpellCastingEditorComponent);
    component = fixture.componentInstance;
    component.spellCasting = {
      barbarian: {
        name: 'Barbarian',
        ability: 'cha',
        casterLevel: 1,
        concentration: 1,
        spells: [
          {
            perDay: { current: 2, total: 2, label: 'cantrips' },
            spells: [],
          },
        ],
      },
    };
    component.syncFromInput();
    fixture.detectChanges();
  });

  it('should create and allow adding/removing casters, spell levels, and spells', () => {
    expect(component).toBeTruthy();
    expect(component.casterEntries.length).toBe(1);

    // Add spell to level 0
    component.addSpell(component.casterEntries[0].caster.spells[0]);
    fixture.detectChanges();
    expect(component.casterEntries[0].caster.spells[0].spells.length).toBe(1);
    expect(fixture.nativeElement.querySelector('app-spell-form')).toBeTruthy();

    // Add spell level
    component.addSpellLevel(component.casterEntries[0].caster);
    expect(component.casterEntries[0].caster.spells.length).toBe(2);

    // Add caster
    component.addCaster();
    expect(component.casterEntries.length).toBe(2);

    // Remove caster
    component.removeCaster(1);
    expect(component.casterEntries.length).toBe(1);
  });
});
