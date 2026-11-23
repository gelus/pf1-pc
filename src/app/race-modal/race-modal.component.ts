import {Component, EventEmitter, HostListener, OnInit, Output, inject} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {ApplyCharacterService} from '../apply-character.service';
import {Adjustments, FavoredClassOption, Feature, Race, sizes} from '../interfaces/character.interface';
import {v4} from 'uuid';
import {ABILITIES, Ability} from '../rules/ability-damage';
import {EditFeatureArrayComponent} from '../edit-feature-array/edit-feature-array.component';
import {FeatureBlockComponent} from '../feature-block/feature-block.component';

type StatPath = 'speed.land' | 'size' | 'languages' | `abilityScores.${Ability}`;

// the feature of a race that holds its stats: its ability modifiers, speed, size and languages. by convention the
// first of its features, named or with the id racial-stats (see new-character and the AI's creation)
export function racialStatsIndex(features: Feature[]): number {
  const named = features.findIndex(f => f.id === 'racial-stats' || /racial[\s-]*stats/i.test(f.name || ''));
  if (named > -1) return named;
  return features.findIndex(f => !!f?.adjustments && ('speed.land' in f.adjustments || 'size' in f.adjustments));
}

// the race of the character, opened from its name on the sheet: its name and subtype, its racial stats, and its
// racial traits. it edits a copy, saving puts the whole race back in one step of the history
@Component({
  selector: 'app-race-modal',
  imports: [FormsModule, EditFeatureArrayComponent, FeatureBlockComponent],
  templateUrl: './race-modal.component.html',
  styleUrl: './race-modal.component.sass',
})
export class RaceModalComponent implements OnInit {
  @Output() closed = new EventEmitter<void>();

  character = inject(ApplyCharacterService);
  sizes = sizes;
  abilities = ABILITIES;
  abilityNames: Record<Ability, string> = {str: 'Str', dex: 'Dex', con: 'Con', int: 'Int', wis: 'Wis', cha: 'Cha'};

  name = '';
  subtype = '';
  quadruped = false;
  // the racial stats feature (a new one when the race has none), where it was in the race's features, and the traits
  stats: Feature = new Feature({id: 'racial-stats', name: 'racial-stats', description: '', adjustments: {}});
  private statsAt = -1;
  traits: Feature[] = [];
  // its alternate favored class bonuses, each edited as a feature (its text and what one pick adjusts) with its class
  favoredOptions: {class: string, feature: Feature}[] = [];

  ngOnInit(): void {
    const race: Race = JSON.parse(JSON.stringify(this.character.raw().race || {name: '', subtype: '', features: []}));
    const features = (race.features || []).map(f => new Feature(f));
    this.name = race.name || '';
    this.subtype = race.subtype || '';
    this.quadruped = !!race.quadruped;
    this.statsAt = racialStatsIndex(features);
    if (this.statsAt > -1) {
      this.stats = features.splice(this.statsAt, 1)[0];
      if (!this.stats.adjustments || typeof this.stats.adjustments !== 'object') this.stats.adjustments = {};
    }
    this.traits = features;
    this.favoredOptions = (race.favoredClassOptions || []).map(option => ({
      class: option.class,
      feature: new Feature({id: option.id, name: option.name || '', description: option.description, adjustments: option.adjustments || {}}),
    }));
  }

  addFavoredOption(): void {
    this.favoredOptions.push({class: '', feature: new Feature({id: v4(), name: '', description: '', adjustments: {}})});
  }

  removeFavoredOption(index: number): void {
    this.favoredOptions.splice(index, 1);
  }

  private get adjustments(): Adjustments {
    return this.stats.adjustments as Adjustments;
  }

  // the number a stat holds, whether written as a number or as {value, mode}
  numberOf(path: StatPath | string): number | null {
    const written = (this.adjustments as any)[path];
    const value = written && typeof written === 'object' ? written.value : written;
    if (value === undefined || value === null || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  // an ability modifier is added, the speed and size set the character's. an empty field takes the stat away. a stat
  // written as {value, mode, type} keeps its mode and type
  setNumber(path: StatPath | string, value: unknown): void {
    const adjustments = this.adjustments as any;
    const number = value === null || value === undefined || value === '' ? NaN : Number(value);
    const isAbility = path.startsWith('abilityScores.');
    if (!Number.isFinite(number) || (isAbility && number === 0)) {
      delete adjustments[path];
      return;
    }
    const written = adjustments[path];
    if (written && typeof written === 'object') adjustments[path] = {...written, value: number};
    else if (isAbility || typeof written === 'number') adjustments[path] = number;
    else adjustments[path] = {value: number, mode: 'set'};
  }

  get languages(): string {
    const written = (this.adjustments as any)['languages'];
    const value = written && typeof written === 'object' && !Array.isArray(written) ? written.value : written;
    return Array.isArray(value) ? value.join(', ') : value == null ? '' : String(value);
  }

  set languages(value: string) {
    const adjustments = this.adjustments as any;
    if (!String(value ?? '').trim()) delete adjustments['languages'];
    else adjustments['languages'] = value;
  }

  // the racial stats as a whole feature, in the feature editor: every adjustment of it, not only the usual ones
  statsAsFeature = false;

  // the racial stats feature's other adjustments, which only the feature editor shows (they are kept as they are)
  otherStats(): string[] {
    const own = ['speed.land', 'size', 'languages', ...ABILITIES.map(a => `abilityScores.${a}`)];
    return Object.keys(this.adjustments).filter(path => !own.includes(path));
  }

  save(): void {
    const features = [...this.traits];
    const hasStats = this.statsAt > -1 || Object.keys(this.adjustments).length > 0;
    if (hasStats) features.splice(this.statsAt > -1 ? Math.min(this.statsAt, features.length) : 0, 0, this.stats);
    const {quadruped: _, ...rest} = this.character.raw().race || {} as Race;
    const race: Race = {...rest, name: this.name.trim(), subtype: this.subtype.trim(), features};
    if (this.quadruped) race.quadruped = true;
    // an option keeps its id, so the class levels that picked it still have it
    const options: FavoredClassOption[] = this.favoredOptions.filter(o => o.class.trim() && (o.feature.description || o.feature.name)).map(o => ({
      id: o.feature.id, class: o.class.trim(), ...(o.feature.name?.trim() ? {name: o.feature.name.trim()} : {}),
      description: o.feature.description || '', adjustments: o.feature.adjustments || {},
    }));
    if (options.length) race.favoredClassOptions = options; else delete race.favoredClassOptions;
    this.character.labelled(`edit the race${race.name ? ' ' + race.name : ''}`, () => this.character.update({race}));
    this.close();
  }

  close(): void {
    this.closed.emit();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close();
  }
}
