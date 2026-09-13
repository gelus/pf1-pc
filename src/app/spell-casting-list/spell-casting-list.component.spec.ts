import {ComponentFixture, TestBed} from '@angular/core/testing';
import {ApplyCharacterService} from '../apply-character.service';
import {Character} from '../utils/character.class';
import {SpellCastingListComponent} from './spell-casting-list.component';

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
    expect(text(fixture.nativeElement)).toContain('Level 0 (2/2) Shield');
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

const text = (element: Element): string => element.textContent!.replace(/\s+/g, ' ').trim();
