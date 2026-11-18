import {Component, inject} from '@angular/core';
import {ThemeService} from '../theme.service';

// switches the colour theme: system, light, dark, round again
@Component({
  selector: 'app-theme-toggle',
  template: `
    <button type="button" class="theme-toggle pf-btn pf-btn--secondary pf-btn--sm" (click)="theme.next()"
      [attr.aria-label]="'Colour theme: ' + labels[theme.mode()] + '. Change it'" [title]="'Colour theme: ' + labels[theme.mode()]">
      {{labels[theme.mode()]}}
    </button>
  `,
  styles: [':host\n  display: inline-flex'],
})
export class ThemeToggleComponent {
  theme = inject(ThemeService);
  labels = {system: 'Auto', light: 'Light', dark: 'Dark'};
}
