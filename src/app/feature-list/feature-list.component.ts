import {isForm} from '../rules/forms';
import {TipDirective} from '../tip/tip.directive';
import { Component, Input } from '@angular/core';
import {ApplyCharacterService} from '../apply-character.service';
import {AddFeatureModalComponent} from '../add-feature-modal/add-feature-modal.component';
import {Character} from '../utils/character.class';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {getByPath} from '../utils/object.util';
import {Feature} from '../interfaces/character.interface';
import {stabilityChange} from '../rules/damage-taken';

const nameOf = (feature: Feature): string => (feature.name || '').trim().toLowerCase();

@Component({
  selector: 'app-feature-list',
  imports: [TipDirective, 
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
  // a list in brackets (feats, traits), or tags (the conditions under the character's name)
  // 'inline': the items of a stat block line (traits, drawbacks), like the sheet's feats
  @Input() display: 'list'|'tags'|'inline' = 'list';
  // the conditions that are forms the character changes into (rules/forms.ts), or those that are not: the sheet lists
  // the forms apart from the other conditions. left out, every feature of the list
  @Input() forms?: 'only' | 'none';
  shown(feature: Feature): boolean {
    return this.forms === undefined || (this.forms === 'only') === isForm(feature);
  }

  constructor (
    public character: ApplyCharacterService
  ) {}

  getByPath(): Feature[] {
    return getByPath(this.character[this.charType](), this.path)
  }

  isSuppressed(index: number): boolean {
    return this.path === 'conditions' && this.charType === 'raw' && this.character.isConditionSuppressed(index);
  }

  // the conditions the rules put the character under are listed with its own conditions. they come and go with what
  // puts the character under them (its hit points, ...), so they can be looked at but not removed or edited
  ruleConditions(): Feature[] {
    return this.path === 'conditions' && this.charType === 'raw' ? this.character.ruleConditions() : [];
  }

  isRuleConditionSuppressed(index: number): boolean {
    return this.character.isRuleConditionSuppressed(index);
  }

  // the note saying where a rule condition comes from, and why
  ruleNote(condition: Feature): string {
    return [condition.source, condition.reason].filter(Boolean).join(': ');
  }

  // a dying character can be stabilized, and a stable one made dying again, see rules/damage-taken.ts
  canStabilize(condition: Feature): boolean {
    return nameOf(condition) === 'dying';
  }

  canDestabilize(condition: Feature): boolean {
    return nameOf(condition) === 'stable';
  }

  setStable(stable: boolean): void {
    this.character.update(stabilityChange(this.character.raw(), stable));
  }

  consumeFeature($event:{feature: Feature, destination: string}) {
    if (this.charType === 'raw') this.character.consumeFeature($event)
  }

}
