import { Component, EventEmitter, HostBinding, Output } from '@angular/core';
import {FormsModule} from '@angular/forms';
import {Feature} from '../interfaces/character.interface';
import {CommonModule} from '@angular/common';

const getNewFeature = (): Feature => ({
  name: 'A new Feat',
  destination: '',
  description: 'A new Feature',
  adjustments: {ac: 1},
})

@Component({
  selector: 'app-add-feature-modal',
  imports: [FormsModule, CommonModule],
  templateUrl: './add-feature-modal.component.html',
  styleUrl: './add-feature-modal.component.sass'
})
export class AddFeatureModalComponent {
  @Output() featureCreated = new EventEmitter<{feature: Feature, destination: string}>();
  @HostBinding('class.open') private open: boolean = false;

  feature: Feature = getNewFeature();
  destination: string = '';

  confirm() {
    console.log('confirm', this.feature)
    this.featureCreated.emit({feature: this.feature, destination: this.destination});

    this.closeModal()
  }

  openModal(openOption?: string | Feature) {
    this.feature = typeof openOption === 'object' ? openOption : getNewFeature();
    if (typeof openOption === 'string') this.destination = openOption;
    this.open = true;
  }

  closeModal() {
    this.open = false;
    this.feature = getNewFeature();
  }

  consumeAdjustmentString(adj: any) {
    try{
      this.feature.adjustments = JSON.parse(adj.trim().replace(/(\s*\n\s*)|(,\s*(?=}))/g, ''))
    } catch (e) {/* swallow it */}
  }
}
