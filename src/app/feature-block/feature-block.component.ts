import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges, forwardRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Adjustments, ChargesPer, Feature, SHOWN_IN, ShownIn, chargesPer } from '../interfaces/character.interface';
import { AdjustmentBlockComponent } from '../adjustment-block/adjustment-block.component';

export function countLabel(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

// a one line summary of a feature, for when it is collapsed
export function featureSummary(feature: Feature | undefined): string {
  const count = Object.keys(feature?.adjustments || {}).length;
  const parts = [countLabel(count, 'adjustment')];
  if (feature?.charges) parts.push(`${feature.charges.current}/${feature.charges.total} charges`);
  return parts.join(' · ');
}

@Component({
  selector: 'app-feature-block',
  imports: [CommonModule, FormsModule, forwardRef(() => AdjustmentBlockComponent)],
  templateUrl: './feature-block.component.html',
  styleUrl: './feature-block.component.sass',
})
export class FeatureBlockComponent implements OnInit, OnChanges {
  @Input() feature: Feature = new Feature({ adjustments: {} });
  @Output() featureChange = new EventEmitter<Feature>();
  // a feature shown inside something that collapses it (a list of features, an adjustment) has no toggle of its own
  @Input() collapsible = true;
  @Input() collapsed = false;

  // where the sheet lists the feature (Feature.shownIn): automatic is the special qualities for a race or class feature
  readonly shownInOptions: {value: ShownIn | '', label: string}[] = [
    {value: '', label: 'Automatic'}, {value: 'specialAttack', label: 'Special Attack'},
    {value: 'defensiveAbilities', label: 'Defensive Abilities'}, {value: 'specialQuality', label: 'Special Quality'},
    {value: 'hidden', label: 'Hidden'},
  ];

  setShownIn(value: string): void {
    if (SHOWN_IN.includes(value as ShownIn)) this.feature.shownIn = value as ShownIn;
    else delete this.feature.shownIn;
    this.emitChange();
  }

  // a form the character changes into (rules/forms.ts): kept switched off until the player changes into it
  setForm(on: boolean): void {
    if (on) {
      this.feature.form = this.feature.form ?? {};
      this.feature.active ??= false;
    } else delete this.feature.form;
    this.emitChange();
  }

  // the level it applies from (Feature.atLevel), left out for always
  setAtLevel(value: unknown): void {
    const level = Math.floor(Number(value) || 0);
    if (level > 1) this.feature.atLevel = level;
    else delete this.feature.atLevel;
    this.emitChange();
  }

  // an eidolon's evolution: its points from the pool (Feature.cost), left out for a feature that costs none
  setCost(value: unknown): void {
    if (value === null || value === '' || !(Number(value) >= 0)) delete this.feature.cost;
    else this.feature.cost = Math.floor(Number(value));
    this.emitChange();
  }

  // a feat's prerequisites, which retraining checks (rules/prerequisites.ts)
  setPrerequisites(value: string): void {
    if (String(value || '').trim()) this.feature.prerequisites = value;
    else delete this.feature.prerequisites;
    this.emitChange();
  }

  toggleCollapsed(): void {
    this.collapsed = !this.collapsed;
  }

  get summary(): string {
    return featureSummary(this.feature);
  }

  ngOnInit(): void {
    this.ensureFeatureDefaults();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['feature']) {
      this.ensureFeatureDefaults();
    }
  }

  private ensureFeatureDefaults(): void {
    if (!this.feature) {
      this.feature = new Feature({ adjustments: {} });
    }
    if (!this.feature.adjustments || typeof this.feature.adjustments !== 'object') {
      this.feature.adjustments = {};
    }
  }

  get hasActiveToggle(): boolean {
    return typeof this.feature?.active !== 'undefined';
  }

  set hasActiveToggle(enabled: boolean) {
    if (enabled) {
      if (typeof this.feature.active === 'undefined') {
        this.feature.active = true;
      }
    } else {
      delete this.feature.active;
    }
    this.emitChange();
  }

  get hasCharges(): boolean {
    return !!this.feature?.charges;
  }

  set hasCharges(enabled: boolean) {
    if (enabled) {
      if (!this.feature.charges) {
        this.feature.charges = { current: 1, total: 1, label: '' };
      }
    } else {
      delete this.feature.charges;
    }
    this.emitChange();
  }

  // what the label of the charges says about how often they come back, when per is not set
  get chargesPerFromLabel(): ChargesPer {
    return chargesPer(this.feature?.charges && { ...this.feature.charges, per: undefined });
  }

  setChargesPer(per: ChargesPer | ''): void {
    if (!this.feature.charges) return;
    if (per) this.feature.charges.per = per;
    else delete this.feature.charges.per;
    this.emitChange();
  }

  onAdjustmentsChange(adjustments: Adjustments): void {
    this.feature.adjustments = adjustments;
    this.emitChange();
  }

  emitChange(): void {
    this.featureChange.emit(this.feature);
  }
}
