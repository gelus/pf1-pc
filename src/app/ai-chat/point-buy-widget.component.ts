import {Component, computed, input, output, signal, effect, untracked} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {AbilityModAlgorithm} from '../ability-mod.pipe';
import {ABILITIES} from '../rules/class-progression';
import {POINT_BUY_COST, POINT_BUY_MAX, POINT_BUY_MIN, pointBuyTotal} from '../rules/point-buy';

// the point buy the AI suggested, in the chat: the player moves each base score up or down, changes the points if
// the AI had them wrong, and confirms it. confirming is held back while the scores cost more than the points (fewer
// is fine). the chat sets the scores, the AI is not asked to
@Component({
  selector: 'app-point-buy-widget',
  imports: [FormsModule],
  template: `
    <div class="budget">
      <label>Point buy
        <input type="number" min="0" max="99" [ngModel]="budget()" (ngModelChange)="setBudget($event)" [disabled]="confirmed()" aria-label="points">
      </label>
      <span class="left" [class.over]="left() < 0" [class.under]="left() > 0">
        {{ left() < 0 ? (-left()) + ' over' : left() + ' left' }}
      </span>
    </div>
    <div class="rows" role="group" aria-label="base ability scores">
      @for (ability of abilities; track ability) {
        <div class="row">
          <span class="ability">{{ ability }}</span>
          <button type="button" class="step pf-btn pf-btn--secondary pf-btn--sm" (click)="move(ability, -1)"
            [disabled]="confirmed() || scores()[ability] <= min" [attr.aria-label]="'lower ' + ability">−</button>
          <span class="score">{{ scores()[ability] }}</span>
          <button type="button" class="step pf-btn pf-btn--secondary pf-btn--sm" (click)="move(ability, 1)"
            [disabled]="confirmed() || scores()[ability] >= max" [attr.aria-label]="'raise ' + ability">+</button>
          <span class="mod">{{ modifier(scores()[ability]) }}</span>
          <span class="cost">{{ cost(scores()[ability]) }} pt</span>
        </div>
      }
    </div>
    <div class="foot">
      <span class="total">{{ total() }} of {{ budget() }} points, before the race</span>
      @if (confirmed()) {
        <span class="done">confirmed</span>
      } @else {
        <button type="button" class="pf-btn pf-btn--primary pf-btn--sm" (click)="confirm.emit({scores: scores(), budget: budget()})"
          [disabled]="disabled() || left() < 0" [title]="left() < 0 ? 'the scores cost more than the points' : 'set these scores'">Confirm</button>
      }
    </div>
    @if (problem()) { <p class="problem">{{ problem() }}</p> }
  `,
  styleUrl: './point-buy-widget.component.sass',
})
export class PointBuyWidgetComponent {
  initialScores = input.required<{[ability: string]: number}>({alias: 'scores'});
  initialBudget = input.required<number>({alias: 'budget'});
  confirmed = input(false);
  // the chat is busy with the AI: confirming waits
  disabled = input(false);
  problem = input<string | undefined>();
  confirm = output<{scores: {[ability: string]: number}, budget: number}>();

  readonly abilities = ABILITIES;
  readonly min = POINT_BUY_MIN;
  readonly max = POINT_BUY_MAX;
  scores = signal<{[ability: string]: number}>({});
  budget = signal(0);
  total = computed(() => pointBuyTotal(this.scores()));
  left = computed(() => this.budget() - this.total());

  constructor() {
    // starts from the AI's suggestion (and the scores set, once confirmed)
    effect(() => {
      const scores = this.initialScores();
      const budget = this.initialBudget();
      untracked(() => {
        this.scores.set(Object.fromEntries(ABILITIES.map(a => [a, scores[a] ?? 10])));
        this.budget.set(budget);
      });
    });
  }

  move(ability: string, by: number): void {
    const next = (this.scores()[ability] ?? 10) + by;
    if (next < POINT_BUY_MIN || next > POINT_BUY_MAX) return;
    this.scores.update(scores => ({...scores, [ability]: next}));
  }

  setBudget(value: unknown): void {
    const points = Math.floor(Number(value));
    if (points >= 0) this.budget.set(points);
  }

  cost(score: number): number {
    return POINT_BUY_COST[score] ?? 0;
  }

  modifier(score: number): string {
    const mod = AbilityModAlgorithm(score);
    return mod >= 0 ? `+${mod}` : `${mod}`;
  }
}
