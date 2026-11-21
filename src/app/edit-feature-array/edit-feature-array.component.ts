import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Feature } from '../interfaces/character.interface';
import { FeatureBlockComponent, featureSummary } from '../feature-block/feature-block.component';

@Component({
  selector: 'app-edit-feature-array',
  imports: [CommonModule, FormsModule, FeatureBlockComponent],
  templateUrl: './edit-feature-array.component.html',
  styleUrl: './edit-feature-array.component.sass',
})
export class EditFeatureArrayComponent implements OnInit, OnChanges {
  @Input() features: Feature[] = [];
  @Input() label = 'Features';
  @Output() featuresChange = new EventEmitter<Feature[]>();

  // the features shown as one line; a list of more than one starts out collapsed, a feature added to it is open
  private collapsed = new Set<Feature>();

  ngOnInit(): void {
    if (!Array.isArray(this.features)) {
      this.features = [];
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['features']) {
      if (!Array.isArray(this.features)) {
        this.features = [];
      }
      this.collapsed = new Set(this.features.length > 1 ? this.features : []);
    }
  }

  isCollapsed(feature: Feature): boolean {
    return this.collapsed.has(feature);
  }

  toggleCollapsed(feature: Feature): void {
    if (!this.collapsed.delete(feature)) this.collapsed.add(feature);
  }

  summary(feature: Feature): string {
    return featureSummary(feature);
  }

  addFeature(): void {
    if (!Array.isArray(this.features)) {
      this.features = [];
    }
    this.features.push(
      new Feature({
        name: 'New Feature',
        description: '',
        adjustments: {},
      })
    );
    this.emitChange();
  }

  removeFeature(index: number): void {
    this.features.splice(index, 1);
    this.emitChange();
  }

  onFeatureChange(index: number, updated: Feature): void {
    if (this.collapsed.delete(this.features[index])) this.collapsed.add(updated);
    this.features[index] = updated;
    this.emitChange();
  }

  emitChange(): void {
    this.featuresChange.emit(this.features);
  }
}
