import { Component, Input } from '@angular/core';
import {ApplyCharacterService} from '../apply-character.service';
import {AddFeatureModalComponent} from '../add-feature-modal/add-feature-modal.component';
import {Character} from '../utils/character.class';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {getByPath} from '../utils/object.util';
import {Feature} from '../interfaces/character.interface';

@Component({
  selector: 'app-feature-list',
  imports: [
    AddFeatureModalComponent,
    CommonModule,
    FormsModule,
  ],
  templateUrl: './feature-list.component.html',
  styleUrl: './feature-list.component.sass'
})
export class FeatureListComponent {
  @Input() charType: 'raw'|'applied' = 'raw';
  @Input() path!: keyof Character;

  constructor (
    public character: ApplyCharacterService
  ) {}

  getByPath(): Feature[] {
    return getByPath(this.character[this.charType](), this.path)
  }

  consumeFeature($event:{feature: Feature, destination: string}) {
    if (this.charType === 'raw') this.character.consumeFeature($event)
  }

}
