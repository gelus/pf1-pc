import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { PartyNavComponent } from './party-nav.component';
import { HP_RING } from './party-member.component';
import { ApplyCharacterService } from '../apply-character.service';
import { CharacterRegistry } from '../character-registry.service';
import { Character } from '../utils/character.class';
import { ls } from '../utils/localstorage.util';

// the side bar's party: the master and its companions, each with its pop-out, and a companion added from there
describe('PartyNavComponent', () => {
  let fixture: ComponentFixture<PartyNavComponent>;
  let registry: CharacterRegistry;
  let open: ApplyCharacterService;
  const saved: string[] = [];
  const el = (selector: string): HTMLElement => fixture.nativeElement.querySelector(selector);
  const all = (selector: string): HTMLElement[] => Array.from(fixture.nativeElement.querySelectorAll(selector));

  beforeEach(async () => {
    await TestBed.configureTestingModule({imports: [PartyNavComponent], providers: [provideRouter([])]}).compileComponents();
    registry = TestBed.inject(CharacterRegistry);
    open = TestBed.inject(ApplyCharacterService);
    const master = new Character();
    master.name = 'Moss';
    ls.setItem('character-' + master.id, master);
    saved.push(master.id);
    registry.openCharacter(master.id);
    const id = registry.createCompanion(master.id, 'animal companion', 'Fang')!;
    saved.push(id);
    registry.serviceFor(id)!.update({hp: 20, currentHp: 12} as any);
    fixture = TestBed.createComponent(PartyNavComponent);
    fixture.detectChanges();
  });
  afterEach(() => saved.splice(0).forEach(id => ls.removeItem('character-' + id)));

  it('lists the master and its companions by their first letter over a health bar', () => {
    expect(all('.member__avatar').map(a => a.textContent!.trim())).toEqual(['M', 'F']);
    expect(all(HP_RING ? 'app-hp-ring.member__ring' : 'app-hp-bar.member__bar').length).toBe(2);
    expect(el('.member.current .member__avatar').textContent!.trim()).toBe('M');
  });

  it('pops a member out on hover: its name, init, AC, saves and hit points, which open its hit points dialog', () => {
    const fang = all('.member')[1];
    fang.dispatchEvent(new Event('mouseenter'));
    fixture.detectChanges();
    expect(el('.member__name').textContent).toBe('Fang');
    expect(el('.member__role').textContent).toContain('animal companion');
    expect(el('.member__ac').textContent).toBe('10');
    (el('.member__hp') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el('.hp-dialog .pf-dialog__title').textContent).toContain('Fang');
    // what is set there is the companion's, not the open sheet's
    const input = el('.hp-temp-input') as HTMLInputElement;
    input.value = '5';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(registry.serviceFor(saved[1])!.raw().tempHp).toBe(5);
    expect(open.raw().tempHp).toBeFalsy();
  });

  it('collapses the companions under the master', () => {
    (el('.party__collapse') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(all('.member').length).toBe(1);
  });

  it('adds a companion by its kind and name', () => {
    (el('.party__add') as HTMLButtonElement).click();
    fixture.detectChanges();
    fixture.componentInstance.kind = 'familiar';
    fixture.componentInstance.name = 'Hoot';
    fixture.componentInstance.add();
    fixture.detectChanges();
    saved.push(...open.raw().companions.filter(id => !saved.includes(id)));
    expect(registry.companionsOf(open.raw()).map(c => `${c.raw().name} (${c.raw().master!.kind})`)).toEqual(['Fang (animal companion)', 'Hoot (familiar)']);
  });
});
