import { Component, EventEmitter, HostBinding, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Feature } from '../interfaces/character.interface';
import { CommonModule } from '@angular/common';
import { FeatureBlockComponent } from '../feature-block/feature-block.component';
import { ApplyCharacterService } from '../apply-character.service';
import { AdjustmentProblem, validateFeature } from '../rules/adjustment-schema';

const getNewFeature = (featureOptions?: Partial<Feature>): Feature => new Feature(featureOptions);

@Component({
  selector: 'app-add-feature-modal',
  imports: [FormsModule, CommonModule, FeatureBlockComponent],
  templateUrl: './add-feature-modal.component.html',
  styleUrl: './add-feature-modal.component.sass'
})
export class AddFeatureModalComponent {
  @Output() featureCreated = new EventEmitter<{feature: Feature, destination: string}>();
  @HostBinding('class.open') open: boolean = false;

  feature: Feature = getNewFeature();
  destination: string = '';
  // a feature only shown, not edited (a condition a rule gave), with a note saying where it comes from
  readonly: boolean = false;
  note: string = '';
  private characterService = inject(ApplyCharacterService);

  // what is wrong with the feature as it is being edited: paths the engine would skip, values it can not use, ...
  // checked against the applied character, so its own skills and casters are known. see rules/adjustment-schema.ts
  get problems(): AdjustmentProblem[] {
    if (this.readonly || !this.open) return [];
    return validateFeature(this.feature, {reference: this.characterService.applied()}, 'feature')
      .map(problem => ({...problem, path: problem.path.replace(/^feature\.(adjustments\.)?/, '')}));
  }

  confirm() {
    this.featureCreated.emit({feature: this.feature, destination: this.destination});
    this.closeModal();
  }

  /*
   * destination:string - What featurelist is this going on
   * feature:Feature - An existing feature to edit
   * feature:boolean - new feature with active set to true/false
   * readonlyNote:string - only show the feature (a copy of it), with that note, it can not be confirmed
   */
  openModal(destination: string, feature?: Feature|boolean, readonlyNote?: string) {
    this.readonly = readonlyNote !== undefined;
    this.note = readonlyNote || '';
    this.feature = typeof feature === 'boolean'
      ? getNewFeature({active: feature})
      : this.readonly && feature ? new Feature(JSON.parse(JSON.stringify(feature))) : feature || getNewFeature();
    this.destination = destination;
    this.open = true;
  }

  closeModal() {
    this.open = false;
    this.readonly = false;
    this.note = '';
    this.feature = getNewFeature();
  }

  consumeAdjustmentString(adj: any) {
    try {
      this.feature.adjustments = JSON.parse(adj.trim().replace(/(\s*\n\s*)|(,\s*(?=}))/g, ''));
    } catch (e) {/* swallow it */}
  }
}
