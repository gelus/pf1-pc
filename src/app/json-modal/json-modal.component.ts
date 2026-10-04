import { Character } from '../utils/character.class';
import { CommonModule } from '@angular/common';
import { Component, EventEmitter, HostBinding, Optional, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApplyCharacterService } from '../apply-character.service';
import { Adjustments, Feature } from '../interfaces/character.interface';
import { ClassLevel } from '../utils/classlevel.class';
import { ClassLevelFormComponent } from '../class-level-form/class-level-form.component';
import { FeatureBlockComponent } from '../feature-block/feature-block.component';
import { EditFeatureArrayComponent } from '../edit-feature-array/edit-feature-array.component';
import { AdjustmentBlockComponent } from '../adjustment-block/adjustment-block.component';

export type JsonModalMode = 'classLevels' | 'feature' | 'featureArray' | 'adjustments';

@Component({
  selector: 'app-json-modal',
  imports: [
    FormsModule,
    CommonModule,
    ClassLevelFormComponent,
    FeatureBlockComponent,
    EditFeatureArrayComponent,
    AdjustmentBlockComponent,
  ],
  templateUrl: './json-modal.component.html',
  styleUrl: './json-modal.component.sass'
})
export class JsonModalComponent {
  @Output() updated = new EventEmitter<Partial<Character>>();
  @HostBinding('class.open') open: boolean = false;

  json: any = {};
  destination: string = '';
  mode: JsonModalMode = 'adjustments';

  classLevelsData: ClassLevel[] = [];
  featureData: Feature = new Feature({ adjustments: {} });
  featureArrayData: Feature[] = [];
  adjustmentsData: Adjustments = {};

  constructor(@Optional() public characterService?: ApplyCharacterService) {}

  confirm() {
    if (this.mode === 'classLevels') {
      this.json = this.classLevelsData;
      this.updated.emit({ [this.destination]: this.json });
    } else if (this.mode === 'feature') {
      this.json = this.featureData;
      const rawChar = this.characterService?.raw?.() as any;
      if (rawChar && Array.isArray(rawChar[this.destination])) {
        const list: Feature[] = [...rawChar[this.destination]];
        const idx = list.findIndex(f => f.id === this.featureData.id);
        if (idx > -1) {
          list.splice(idx, 1, this.featureData);
        } else {
          list.push(this.featureData);
        }
        this.updated.emit({ [this.destination]: list });
      } else {
        this.updated.emit({ [this.destination]: this.featureData });
      }
    } else if (this.mode === 'featureArray') {
      this.json = this.featureArrayData;
      this.updated.emit({ [this.destination]: this.json });
    } else {
      this.json = this.adjustmentsData;
      this.updated.emit({ [this.destination]: this.json });
    }
    this.closeModal();
  }

  openModal(destination: string, json: any) {
    this.destination = destination;
    const cloned = json ? JSON.parse(JSON.stringify(json)) : {};
    this.json = cloned;

    if (destination === 'classLevels' || this.isClassLevelsPayload(cloned)) {
      this.mode = 'classLevels';
      this.classLevelsData = Array.isArray(cloned) ? cloned : [new ClassLevel(cloned)];
    } else if (Array.isArray(cloned)) {
      this.mode = 'featureArray';
      this.featureArrayData = cloned;
    } else if (
      ['feats', 'conditions', 'specialAttack', 'defensiveAbilities', 'specialQuality'].includes(destination) ||
      (cloned && typeof cloned === 'object' && ('adjustments' in cloned || 'description' in cloned))
    ) {
      this.mode = 'feature';
      this.featureData = new Feature(cloned);
    } else {
      this.mode = 'adjustments';
      this.adjustmentsData = cloned;
    }

    this.open = true;
  }

  private isClassLevelsPayload(val: any): boolean {
    if (Array.isArray(val) && val.length > 0 && ('hitDice' in val[0] || 'classSkills' in val[0] || 'skillRanks' in val[0])) {
      return true;
    }
    return !!(val && typeof val === 'object' && !Array.isArray(val) && ('hitDice' in val || 'classSkills' in val || 'skillRanks' in val));
  }

  closeModal() {
    this.open = false;
    this.destination = '';
    this.json = {};
  }

  consumeAdjustmentString(adj: any) {
    try {
      this.json = JSON.parse(adj.trim().replace(/(\s*\n\s*)|(,\s*(?=}))/g, ''));
    } catch (e) {/* swallow it */}
  }
}
