import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Attack } from '../utils/attack.class';

import { AttackComponent } from './attack.component';
import { ApplyCharacterService } from '../apply-character.service';
import { Character } from '../utils/character.class';
import { Feature } from '../interfaces/character.interface';
import exampleCharacter from '../example-character.json';

describe('AttackComponent', () => {
  let component: AttackComponent;
  let fixture: ComponentFixture<AttackComponent>;
  let charService: ApplyCharacterService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AttackComponent]
    })
    .compileComponents();

    charService = TestBed.inject(ApplyCharacterService);
    fixture = TestBed.createComponent(AttackComponent);
    component = fixture.componentInstance;
    component.attack = new Attack();
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('displays to-hit and damage variants in attack tooltips without altering displayed attack totals', () => {
    const char = Object.assign(new Character(), JSON.parse(JSON.stringify(exampleCharacter))) as Character;
    char.feats.push(
      new Feature({
        name: 'SharkBane',
        active: true,
        adjustments: {
          'attackRollBonus[sighted]': 2,
          'meleeAttackRollBonus[fey]': 1,
          'melee.*.toHitBonus[fey]': 2,
          'melee.*.damageBonus[sharks]': 4,
        },
      })
    );
    charService.initializeCharacter(char);
    const applied = charService.applied();

    component.attack = applied.melee[0];
    fixture.detectChanges();

    const stats = fixture.nativeElement.querySelectorAll('stat') as NodeListOf<HTMLElement>;
    const toHitStat = stats[0];
    const dmgStat = stats[1];

    // Base toHit = bab (1) + str mod (22 -> +6) = 7; Base dmg = str mod (+6)
    expect(toHitStat.textContent!.trim()).toBe('7');
    expect(dmgStat.textContent!.trim()).toBe('6');

    toHitStat.dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();
    const toHitVariantHeaders = Array.from(
      toHitStat.querySelectorAll('.tooltip .variant-header'),
      el => el.textContent!.replace(/\s+/g, ' ').trim()
    );
    expect(toHitVariantHeaders).toEqual(['sighted 9', 'fey 10']);
    toHitStat.dispatchEvent(new MouseEvent('mouseleave'));

    dmgStat.dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();
    const dmgVariantHeaders = Array.from(
      dmgStat.querySelectorAll('.tooltip .variant-header'),
      el => el.textContent!.replace(/\s+/g, ' ').trim()
    );
    expect(dmgVariantHeaders).toEqual(['sharks 10']);
  });
});
