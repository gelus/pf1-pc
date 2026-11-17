import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Attack } from '../utils/attack.class';

import { AttackComponent } from './attack.component';
import { ApplyCharacterService } from '../apply-character.service';
import { Character } from '../utils/character.class';
import { Feature } from '../interfaces/character.interface';
import { Item } from '../utils/item.class';
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

    // Base toHit = bab (1) + str mod (22 -> +6) = 7; Base dmg = str mod (+6) x1 1/2 for the two-handed greataxe = 9
    expect(toHitStat.textContent!.trim()).toBe('7');
    expect(dmgStat.textContent!.trim()).toBe('9');

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
    expect(dmgVariantHeaders).toEqual(['sharks 13']);
  });

  const showAttack = (char: Character, list: 'melee' | 'ranged' = 'melee', index = 0): HTMLElement => {
    charService.initializeCharacter(char);
    component.attack = charService.applied()[list][index];
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };

  const text = (el: Element | null) => (el?.textContent || '').replace(/\s+/g, ' ').trim();

  it('shows every attack roll of a full attack, the damage roll and the critical', () => {
    const char = new Character();
    char.bab = 11;
    char.abilityScores.str = 14;
    char.feats.push(new Feature({name: 'Sword', adjustments: {melee: Object.assign(new Attack(), {
      name: 'Longsword', damage: '1d8', toHitAbility: 'str', damageAbility: 'str', crit: 19,
    })}}));
    const el = showAttack(char);
    expect(text(el.querySelector('.to-hit')).replace(/ /g, '')).toBe('+13/+8/+3');
    expect(text(el.querySelector('.dice'))).toBe('1d8');
    expect(text(el.querySelector('.critical'))).toBe('19-20/x2');
  });

  it('lists the origins of the attack bonus in the tooltip', () => {
    const char = new Character();
    char.bab = 1;
    char.feats.push(new Feature({name: 'Club', adjustments: {melee: Object.assign(new Attack(), {
      name: 'Club', damage: '1d6', masterwork: true,
    })}}));
    const el = showAttack(char);
    const stat = el.querySelector('stat') as HTMLElement;
    stat.dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();
    const lines = Array.from(stat.querySelectorAll('.tooltip li'), li => `${text(li.querySelector('span'))} ${text(li.querySelector('b'))}`);
    expect(lines).toEqual(['1 base attack bonus', '1 masterwork (enhancement)']);
  });

  it('fires ammunition, one less of the item each time, until it runs out', () => {
    const char = new Character();
    const arrows = Object.assign(new Item(), {name: 'Arrows', quantity: 1});
    char.inventory.push(arrows);
    char.feats.push(new Feature({name: 'Bow', adjustments: {ranged: Object.assign(new Attack(), {
      name: 'Longbow', damage: '1d8', bow: 'bow', range: 100, ammunitionId: arrows.id,
    })}}));
    let el = showAttack(char, 'ranged');
    expect(text(el.querySelector('.ammunition'))).toBe('Arrows: 1 Fire');
    (el.querySelector('button.fire') as HTMLButtonElement).click();
    expect(charService.raw().inventory[0].quantity).toBe(0);
    component.attack = charService.applied().ranged[0];
    fixture.detectChanges();
    el = fixture.nativeElement;
    expect((el.querySelector('button.fire') as HTMLButtonElement).disabled).toBe(true);
    expect(el.querySelector('.ammunition.out')).toBeTruthy();
    expect(text(el.querySelector('.notes'))).toContain('out of ammunition');
  });
});
