import { Component, EventEmitter, HostBinding, Output } from '@angular/core';
import {FormsModule} from '@angular/forms';
import {Feature} from '../interfaces/character.interface';
import {CommonModule} from '@angular/common';

const getNewFeature = (featureOptions?: Partial<Feature>): Feature => new Feature(featureOptions);

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

  /*
   * destination:string - What featurelist is this going on
   * feature:Feature - An existing feature to edit
   * feature:boolean - new feature with active set to true/false
   */
  openModal(destination: string, feature?: Feature|boolean) {
    this.feature =  typeof feature === 'boolean' ? getNewFeature({active:feature}) : feature || getNewFeature();
    this.destination = destination;
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
