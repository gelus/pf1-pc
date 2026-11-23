import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { CharacterSelectionComponent } from './character-selection.component';
import { Character } from '../utils/character.class';
import { ls } from '../utils/localstorage.util';

describe('CharacterSelectionComponent', () => {
  let component: CharacterSelectionComponent;
  let fixture: ComponentFixture<CharacterSelectionComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CharacterSelectionComponent],
      providers: [provideRouter([])]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CharacterSelectionComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

// a master's companions under it in the list, and what deleting a master does with them
describe('CharacterSelectionComponent companions', () => {
  let fixture: ComponentFixture<CharacterSelectionComponent>;
  let before: unknown;
  const ids: string[] = [];
  const el = (selector: string): HTMLElement => fixture.nativeElement.querySelector(selector);
  const names = (): string[] => Array.from(fixture.nativeElement.querySelectorAll('.pf-roster__name')).map((n: any) => n.textContent.trim());

  beforeEach(async () => {
    before = ls.getItem('characters');
    const master = Object.assign(new Character(), {name: 'Moss'});
    const fang = Object.assign(new Character(), {name: 'Fang', master: {masterId: master.id, kind: 'animal companion'}});
    master.companions = [fang.id];
    for (const c of [master, fang]) { ls.setItem('character-' + c.id, c); ids.push(c.id); }
    ls.setItem('characters', [master.id]);
    await TestBed.configureTestingModule({imports: [CharacterSelectionComponent], providers: [provideRouter([])]}).compileComponents();
    fixture = TestBed.createComponent(CharacterSelectionComponent);
    fixture.detectChanges();
  });
  afterEach(() => {
    ids.splice(0).forEach(id => ls.removeItem('character-' + id));
    if (before) ls.setItem('characters', before); else ls.removeItem('characters');
  });

  it('lists a companion under its master, collapsible', () => {
    expect(names()).toEqual(['Moss', 'Fang']);
    expect(el('.roster-companions .pf-roster__meta').textContent).toContain('animal companion of Moss');
    (el('.roster-companions__toggle') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(names()).toEqual(['Moss']);
  });

  it('asks whether a deleted master\'s companions go too, or stay as characters of their own', () => {
    (el('.delete') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el('.delete-dialog').textContent).toContain('Moss has 1 companion');
    (el('.keep-companions') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(names()).toEqual(['Fang']);
    expect(ls.getItem('character-' + ids[1]).master).toBeUndefined();
  });
});
