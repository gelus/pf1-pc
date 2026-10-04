import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges, forwardRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Adjustments, Feature } from '../interfaces/character.interface';
import { AdjustmentBlockComponent } from '../adjustment-block/adjustment-block.component';

@Component({
  selector: 'app-feature-block',
  imports: [CommonModule, FormsModule, forwardRef(() => AdjustmentBlockComponent)],
  templateUrl: './feature-block.component.html',
  styleUrl: './feature-block.component.sass',
})
export class FeatureBlockComponent implements OnInit, OnChanges {
  @Input() feature: Feature = new Feature({ adjustments: {} });
  @Output() featureChange = new EventEmitter<Feature>();

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

  onAdjustmentsChange(adjustments: Adjustments): void {
    this.feature.adjustments = adjustments;
    this.emitChange();
  }

  emitChange(): void {
    this.featureChange.emit(this.feature);
  }
}
