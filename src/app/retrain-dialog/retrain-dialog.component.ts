import {Component, EventEmitter, Output, computed, inject, signal} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {v4} from 'uuid';
import {ApplyCharacterService} from '../apply-character.service';
import {AddFeatureModalComponent} from '../add-feature-modal/add-feature-modal.component';
import {ChatRequestsService} from '../ai-chat/chat-requests.service';
import {Feature, Spell} from '../interfaces/character.interface';
import {CLASS_PRESETS, classLevelFromPreset} from '../rules/class-presets';
import {ABILITIES, isAbilityIncreaseLevel} from '../rules/class-progression';
import {RETRAINING_RULES_URL, RETRAIN_KINDS, RetrainDetail, RetrainKind, retrainQuote} from '../rules/retraining';
import {
  RetrainResult, payGold, retrainAbilityIncrease, retrainArchetype, retrainClassLevel, retrainFeature,
  retrainHitPoints, retrainLanguage, retrainSkillRanks, retrainSpellKnown,
} from '../retraining';
import {SpellFormComponent, createEmptySpell} from '../spell-form/spell-form.component';
import {BabProgression, ClassLevel, SaveName} from '../utils/classlevel.class';
import {Character} from '../utils/character.class';

// retraining by hand (Ultimate Campaign), everything the AI's retrain tool does: the kind, what is retrained and into
// what, what it takes in days and gold (told, never holding it back), and a Pay button that takes the gold from the
// purse only when clicked. a new feat, class feature, racial trait or spell is written in the sheet's own editors; a
// new class level's and an archetype's features are then added in the class levels editor (editClassLevels)
@Component({
  selector: 'app-retrain-dialog',
  imports: [FormsModule, AddFeatureModalComponent, SpellFormComponent],
  templateUrl: './retrain-dialog.component.html',
  styleUrl: './retrain-dialog.component.sass',
})
export class RetrainDialogComponent {
  @Output() closed = new EventEmitter<void>();
  // the class levels editor, for the features of a retrained class level or archetype
  @Output() editClassLevels = new EventEmitter<void>();

  character = inject(ApplyCharacterService);
  private chatRequests = inject(ChatRequestsService);
  readonly kinds = RETRAIN_KINDS;
  readonly abilities = ABILITIES;
  readonly presets = CLASS_PRESETS.map(p => p.name);
  // the rules page: the class pairs with synergy, and what each class's features retrain into
  readonly rulesUrl = RETRAINING_RULES_URL;

  kind = signal<RetrainKind>('feat');
  // what is retrained: a feature's id, a spell's name, a class's name
  target = '';
  level = 0;
  ability = 'str';
  fromSkill = '';
  toSkill = '';
  ranks = 1;
  language = '';
  caster = '';
  spellLevel = 1;
  newSpell: Spell = createEmptySpell();
  toClass = '';
  rolledHp = 1;
  hitDie = 8;
  bab: BabProgression = 'threeQuarters';
  goodSaves = 'will';
  skillRanks = 2;
  archetypeMode: 'take' | 'give up' = 'take';
  archetypeName = '';
  archetypeReplaces = '';
  removeFeatures: {[name: string]: boolean} = {};
  featureCount = 1;
  synergy = false;
  noTrainer = false;

  outcome = signal<RetrainResult | undefined>(undefined);
  paid = signal(false);
  payError = signal('');

  private raw = (): Character => this.character.raw();

  detail = (): RetrainDetail => ({
    ...(this.kind() === 'archetype' ? {features: Math.max(1, Object.values(this.removeFeatures).filter(Boolean).length)} : {}),
    ...(this.kind() === 'class feature' ? {features: Math.max(1, this.featureCount)} : {}),
    ...(this.kind() === 'spells known' ? {spellLevel: this.spellLevel} : {}),
    ...(this.synergy ? {synergy: true} : {}),
    ...(this.noTrainer ? {noTrainer: true} : {}),
  });
  quote = () => retrainQuote(this.raw(), this.kind(), this.detail());

  // ---- what can be retrained ----
  features = computed((): {id: string, label: string}[] => {
    const raw = this.raw();
    const kind = this.kind();
    if (kind === 'feat') return (raw.feats || []).map(f => ({id: f.id, label: f.name || 'a feat'}));
    if (kind === 'racial trait') return (raw.race?.features || []).map(f => ({id: f.id, label: f.name || 'a trait'}));
    if (kind === 'class feature') return (raw.classLevels || []).flatMap(l => (l.features || []).map(f => ({id: f.id, label: `${f.name} (${l.name} ${l.level})`})));
    return [];
  });
  increaseLevels = () => (this.raw().classLevels || []).map((_, i) => i + 1).filter(isAbilityIncreaseLevel);
  hpLevels = () => (this.raw().classLevels || []).map((l, i) => ({l, i})).filter(({l, i}) => i > 0 && (Number(l.rolledHp) || 0) < Number(l.hitDice))
    .map(({l, i}) => ({level: i + 1, label: `level ${i + 1}: ${l.name} ${l.level}, ${l.rolledHp || 0} of d${l.hitDice}`}));
  skillsWithRanks = () => this.skillNames().filter(s => this.ranksOf(s) > 0);
  skillNames = (): string[] => Object.entries(this.raw().skills || {}).flatMap(([key, skill]) =>
    skill.subSkills && Object.keys(skill.subSkills).length ? Object.keys(skill.subSkills).map(sub => `${key} (${sub})`) : [key]);
  private ranksOf = (name: string): number => {
    const family = /^(\w+) \((.+)\)$/.exec(name);
    const skills = this.raw().skills || {};
    return Number(family ? skills[family[1]]?.subSkills?.[family[2]]?.ranks : skills[name]?.ranks) || 0;
  };
  casters = () => Object.entries(this.character.applied().spells || {}).filter(([, c]) => c?.casting === 'spontaneous').map(([origin]) => origin);
  spellsKnown = () => (this.character.applied().spells?.[this.caster]?.spells?.[this.spellLevel]?.spells || []).map(s => s.name);
  classes = () => [...new Set((this.raw().classLevels || []).map(l => l.name))];
  classFeatures = () => (this.raw().classLevels || []).filter(l => l.name === this.target).flatMap(l => (l.features || []).map(f => f.name || ''));
  archetypesOf = () => (this.raw().classLevels || []).filter(l => l.name === this.target).flatMap(l => (l.archetypes || []).map(a => a.name));

  pickKind(kind: RetrainKind): void {
    this.kind.set(kind);
    this.target = '';
    this.outcome.set(undefined);
    this.paid.set(false);
    this.payError.set('');
  }

  private done(result: RetrainResult): void {
    this.outcome.set(result);
    this.paid.set(false);
    this.payError.set('');
  }

  // ---- retraining ----

  // a feat, class feature or racial trait: written anew in the feature editor, then traded in its place
  private oldFeature?: Feature;
  openFeatureEditor(modal: AddFeatureModalComponent): void {
    const raw = this.raw();
    const all = [...(raw.feats || []), ...(raw.race?.features || []), ...(raw.classLevels || []).flatMap(l => l.features || [])];
    this.oldFeature = all.find(f => f.id === this.target);
    if (!this.oldFeature) return;
    modal.openModal(this.kind() === 'feat' ? 'feats' : 'retrained', new Feature({...JSON.parse(JSON.stringify(this.oldFeature)), id: v4()}));
  }
  featureWritten(feature: Feature): void {
    if (this.oldFeature) this.done(retrainFeature(this.character, this.kind(), this.oldFeature, feature, this.detail()));
  }

  retrainNumbers(): void {
    const kind = this.kind();
    if (kind === 'ability increase') this.done(retrainAbilityIncrease(this.character, Number(this.level), this.ability));
    else if (kind === 'skill ranks') this.done(retrainSkillRanks(this.character, [{from: this.fromSkill, to: this.toSkill, ranks: Number(this.ranks)}]));
    else if (kind === 'hit points') this.done(retrainHitPoints(this.character, Number(this.level) || undefined));
    else if (kind === 'language') this.done(retrainLanguage(this.character, this.language));
  }

  retrainSpell(): void {
    const spell = this.newSpell;
    this.done(retrainSpellKnown(this.character, this.caster, Number(this.spellLevel), this.target, () => {
      if (!spell.name?.trim()) return {error: 'give the new spell its name'};
      this.character.saveSpell('spells', this.caster, Number(this.spellLevel), spell);
      return {done: `${spell.name} learned`};
    }));
  }

  // the new class's level: a core class from its preset, the next level of a class the character has as its last,
  // another class from what is given here. its class features go in the class levels editor
  retrainLevel(): void {
    const name = this.toClass.trim();
    this.done(retrainClassLevel(this.character, this.target, () => {
      if (!name) return {error: 'name the class the level becomes'};
      const levels = this.raw().classLevels || [];
      const ofClass = levels.filter(l => l.name.toLowerCase() === name.toLowerCase());
      const preset = CLASS_PRESETS.find(p => p.name.toLowerCase() === name.toLowerCase());
      const last = ofClass[ofClass.length - 1];
      const entry = last
        ? new ClassLevel({...JSON.parse(JSON.stringify(last)), level: ofClass.length + 1, features: [], rolledHp: Number(this.rolledHp), startingWealth: 0, proficiencies: undefined, archetypes: undefined, abilityIncrease: undefined})
        : preset ? new ClassLevel({...classLevelFromPreset(preset, 1, false), rolledHp: Number(this.rolledHp)})
        : new ClassLevel({name, level: 1, hitDice: Number(this.hitDie), rolledHp: Number(this.rolledHp), skillRanks: Number(this.skillRanks),
          babProgression: this.bab, goodSaves: this.goodSaves.split(',').map(s => s.trim()).filter(Boolean) as SaveName[], features: []});
      this.character.update({classLevels: [...levels, entry]});
      return {done: `${entry.name} ${entry.level} added`};
    }, this.detail()));
  }

  retrainArchetype(): void {
    const remove = Object.entries(this.removeFeatures).filter(([, on]) => on).map(([name]) => name);
    const replaces = this.archetypeReplaces.split(',').map(s => s.trim()).filter(Boolean);
    this.done(retrainArchetype(this.character, this.target, this.archetypeMode === 'take'
      ? {take: [{name: this.archetypeName.trim(), replaces: replaces.length ? replaces : remove}], remove}
      : {giveUp: [this.archetypeName], remove}));
  }

  pay(): void {
    const quote = this.outcome()?.quote;
    if (!quote) return;
    const paid = payGold(this.character, quote.cost, `retraining (${quote.kind})`);
    if (paid.done) this.paid.set(true);
    else this.payError.set(String(paid.error));
  }

  // the AI does it from the rules page instead: the chat comes into view with the request
  askAi(): void {
    const what = this.features().find(f => f.id === this.target)?.label || this.target;
    this.chatRequests.ask(`Retrain my ${this.kind()}${what ? ` ${what}` : ''}: suggest what it could become, and tell me what it takes.`);
    this.closed.emit();
  }
}
