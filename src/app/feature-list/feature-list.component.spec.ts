import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FeatureListComponent } from './feature-list.component';
import { ApplyCharacterService } from '../apply-character.service';
import { Character } from '../utils/character.class';
import { ClassLevel } from '../utils/classlevel.class';
import { Feature } from '../interfaces/character.interface';
import { RULE_MODULES } from '../rules';

describe('FeatureListComponent', () => {
  let component: FeatureListComponent;
  let fixture: ComponentFixture<FeatureListComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FeatureListComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(FeatureListComponent);
    component = fixture.componentInstance;
    component.path = 'classLevels';
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('rule conditions', () => {
    let service: ApplyCharacterService;
    const show = (char: Character) => {
      service.initializeCharacter(char);
      component.path = 'conditions';
      fixture.detectChanges();
    };
    const ruleEntries = (): HTMLElement[] => Array.from(fixture.nativeElement.querySelectorAll('.rule-condition'));
    const text = (element: Element): string => element.textContent!.replace(/\s+/g, ' ').trim();
    // a fighter with 11 hp
    const fighter = (changes: Partial<Character> = {}): Character => {
      const char = new Character();
      char.abilityScores.con = 12;
      char.classLevels = [new ClassLevel({name: 'Fighter', level: 1, hitDice: 10})];
      return Object.assign(char, changes);
    };

    beforeEach(() => {
      service = TestBed.inject(ApplyCharacterService);
      service.ruleModules = RULE_MODULES;
    });

    it('lists them after the conditions of the character, with where they come from and no X', () => {
      const char = fighter({damageTaken: 11});
      char.conditions.push(new Feature({name: 'Shaken', adjustments: {}}));
      show(char);
      const [disabled] = ruleEntries();
      expect(ruleEntries().length).toBe(1);
      expect(text(disabled)).toBe('[ Disabled (from hit points: 0 hp) ]');
      expect(disabled.querySelector('a')).toBeNull();
      expect(disabled.querySelector('input')).toBeNull();
      expect(text(fixture.nativeElement).indexOf('Shaken')).toBeLessThan(text(fixture.nativeElement).indexOf('Disabled'));
    });

    it('shows a suppressed one the way a suppressed condition of the character is shown', () => {
      const char = fighter({nonlethalDamage: 11});
      char.conditions.push(new Feature({name: 'Staggered', adjustments: {}}));
      show(char);
      expect(ruleEntries()[0].classList).toContain('suppressed');
      const name = ruleEntries()[0].querySelector('.name') as HTMLElement;
      name.dispatchEvent(new Event('mouseenter'));
      expect(document.querySelector('.pf-tip .tip-note')?.textContent).toContain('suppressed');
      name.dispatchEvent(new Event('mouseleave'));
    });

    it('opens one read only, with its template and the note', () => {
      show(fighter({damageTaken: 13}));
      (ruleEntries()[0].querySelector('.name') as HTMLElement).click();
      fixture.detectChanges();
      const modal: HTMLElement = fixture.nativeElement.querySelector('app-add-feature-modal');
      expect(modal.querySelector('.readonly-note')?.textContent).toContain('from hit points: -2 hp');
      expect(modal.querySelector('fieldset')?.disabled).toBeTrue();
    });

    it('stabilizes a dying character and makes it dying again', () => {
      show(fighter({damageTaken: 13}));
      expect(text(ruleEntries()[0])).toContain('Dying');
      (ruleEntries()[0].querySelector('.stabilize') as HTMLElement).click();
      fixture.detectChanges();
      expect(service.raw().stable).toBeTrue();
      expect(text(ruleEntries()[0])).toContain('Stable (from hit points: -2 hp, stabilized)');

      (ruleEntries()[0].querySelector('.destabilize') as HTMLElement).click();
      fixture.detectChanges();
      expect(service.raw().stable).toBeFalse();
      expect(text(ruleEntries()[0])).toContain('Dying');
    });

    it('makes a character stabilized by a Stable condition added by hand dying again', () => {
      const char = fighter({damageTaken: 13});
      char.conditions.push(new Feature({name: 'Stable', adjustments: {}}));
      show(char);
      // the Stable condition of the character applies, the one the rule gives is its duplicate
      expect(ruleEntries()[0].classList).toContain('suppressed');
      (ruleEntries()[0].querySelector('.destabilize') as HTMLElement).click();
      fixture.detectChanges();
      expect(service.raw().conditions).toEqual([]);
      expect(text(ruleEntries()[0])).toContain('Dying');
    });
  });
});
