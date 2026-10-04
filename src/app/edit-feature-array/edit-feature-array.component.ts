import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Feature } from '../interfaces/character.interface';
import { FeatureBlockComponent } from '../feature-block/feature-block.component';

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

  ngOnInit(): void {
    if (!Array.isArray(this.features)) {
      this.features = [];
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['features'] && !Array.isArray(this.features)) {
      this.features = [];
    }
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
    this.features[index] = updated;
    this.emitChange();
  }

  emitChange(): void {
    this.featuresChange.emit(this.features);
  }
}
