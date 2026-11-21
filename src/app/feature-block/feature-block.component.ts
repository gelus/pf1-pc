import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges, forwardRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Adjustments, ChargesPer, Feature, chargesPer } from '../interfaces/character.interface';
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
