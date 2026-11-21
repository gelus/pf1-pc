import {ComponentFixture, TestBed} from '@angular/core/testing';
import {Feature} from '../interfaces/character.interface';
import {ConditionPickerComponent} from './condition-picker.component';

describe('ConditionPickerComponent', () => {
  let fixture: ComponentFixture<ConditionPickerComponent>;
  let picked: Feature[];
  const box = () => fixture.nativeElement.querySelector('.condition-search') as HTMLInputElement;
  const options = () => [...fixture.nativeElement.querySelectorAll('.option')].map((o: Element) => o.textContent!.trim());
  const typeIn = (value: string) => {
    box().dispatchEvent(new Event('focus'));
    box().value = value;
    box().dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  const key = (k: string) => {
    box().dispatchEvent(new KeyboardEvent('keydown', {key: k}));
    fixture.detectChanges();
  };

  beforeEach(() => {
    fixture = TestBed.createComponent(ConditionPickerComponent);
    fixture.componentRef.setInput('conditions', ['Blinded', 'Fatigued', 'Shaken', 'Sickened', 'Exhausted'].map(name => new Feature({name, description: `${name}.`})));
    picked = [];
    fixture.componentInstance.picked.subscribe(c => picked.push(c));
    fixture.detectChanges();
  });

  it('narrows the list as the name is typed, the names starting with it first', () => {
    typeIn('s');
    expect(options()).toEqual(['Shaken', 'Sickened', 'Exhausted']);
    typeIn('sha');
    expect(options()).toEqual(['Shaken']);
    typeIn('zzz');
    expect(fixture.nativeElement.querySelector('.none').textContent).toContain('no condition named "zzz"');
  });

  it('picks the marked one with enter, the arrows moving the mark, and starts over', () => {
    typeIn('s');
    key('Enter');
    expect(picked.map(c => c.name)).toEqual(['Shaken']);
    expect(box().value).toBe('');
    typeIn('s');
    key('ArrowDown');
    key('Enter');
    expect(picked.map(c => c.name)).toEqual(['Shaken', 'Sickened']);
  });

  it('picks one clicked, and closes with escape', () => {
    typeIn('fat');
    (fixture.nativeElement.querySelector('.option') as HTMLElement).dispatchEvent(new MouseEvent('mousedown'));
    expect(picked.map(c => c.name)).toEqual(['Fatigued']);
    typeIn('b');
    key('Escape');
    expect(options()).toEqual([]);
  });
});
