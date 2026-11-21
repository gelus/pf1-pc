import {TipDirective} from '../tip/tip.directive';
import {Component, ElementRef, ViewChild, computed, input, output, signal} from '@angular/core';
import {Feature} from '../interfaces/character.interface';

// the conditions to add, picked by typing: the list narrows to the names with what is typed, enter picks the one
// marked (the first by default), the arrows move the mark, escape closes it. a select of every condition made the
// player scroll for one
@Component({
  imports: [TipDirective],
  selector: 'app-condition-picker',
  template: `
    <div class="picker">
      <input #box type="text" class="condition-search" role="combobox" autocomplete="off" placeholder="Add from the list…"
        aria-label="Add a condition from the list" aria-autocomplete="list" [attr.aria-expanded]="open()"
        [attr.aria-controls]="listId" [attr.aria-activedescendant]="open() && matches().length ? optionId(marked()) : null"
        [value]="query()" (input)="type($any($event.target).value)" (focus)="open.set(true)" (blur)="close()"
        (keydown)="keydown($event)" />
      @if (open() && matches().length) {
        <ul class="options" role="listbox" [id]="listId" aria-label="conditions">
          @for (condition of matches(); track condition.name; let i = $index) {
            <li role="option" class="option" [id]="optionId(i)" [class.marked]="i === marked()" [attr.aria-selected]="i === marked()"
              [pfTip]="condition.description" [pfTipLabel]="condition.name" (mousedown)="$event.preventDefault(); pick(condition)" (mouseenter)="marked.set(i)">{{ condition.name }}</li>
          }
        </ul>
      } @else if (open() && query().trim()) {
        <div class="options none" role="status">no condition named "{{ query() }}"</div>
      }
    </div>
  `,
  styleUrl: './condition-picker.component.sass',
})
export class ConditionPickerComponent {
  conditions = input<Feature[]>([]);
  picked = output<Feature>();
  @ViewChild('box') box?: ElementRef<HTMLInputElement>;

  private static count = 0;
  readonly listId = `condition-options-${ConditionPickerComponent.count++}`;
  query = signal('');
  open = signal(false);
  marked = signal(0);
  // the names that start with what is typed first, then those that have it anywhere
  matches = computed(() => {
    const typed = this.query().trim().toLowerCase();
    const all = this.conditions();
    if (!typed) return all;
    const named = (c: Feature) => (c.name || '').toLowerCase();
    return [...all.filter(c => named(c).startsWith(typed)), ...all.filter(c => !named(c).startsWith(typed) && named(c).includes(typed))];
  });

  optionId(i: number): string {
    return `${this.listId}-${i}`;
  }

  type(value: string): void {
    this.query.set(value);
    this.marked.set(0);
    this.open.set(true);
  }

  keydown(event: KeyboardEvent): void {
    const count = this.matches().length;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      this.open.set(true);
      if (count) this.marked.set((this.marked() + (event.key === 'ArrowDown' ? 1 : count - 1)) % count);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const condition = this.matches()[this.marked()];
      if (this.open() && condition) this.pick(condition);
    } else if (event.key === 'Escape') {
      this.close();
    }
  }

  pick(condition: Feature): void {
    this.picked.emit(condition);
    this.query.set('');
    this.marked.set(0);
    this.open.set(false);
  }

  close(): void {
    this.open.set(false);
  }
}
