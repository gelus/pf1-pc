import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges, inject } from '@angular/core';
import { ApplyCharacterService } from '../apply-character.service';
import { FavoredClassOption } from '../interfaces/character.interface';
import { FormsModule } from '@angular/forms';
import { Archetype, BabProgression, ClassLevel, FavoredClassBonus, Proficiencies, SaveName, archetypesOf, featureKey } from '../utils/classlevel.class';
import { applyArchetypes, archetypeRuleProblems, archetypeWarnings } from '../rules/archetypes';
import { KNOWLEDGE_SPECIALTIES, getSkillList } from '../utils/skilllist.class';
import { EditFeatureArrayComponent } from '../edit-feature-array/edit-feature-array.component';
import { CLASS_PRESETS, classLevelFromPreset } from '../rules/class-presets';
import { ABILITIES, SAVES, isAbilityIncreaseLevel } from '../rules/class-progression';

// an archetype being written in the editor, before it is taken: every list as the text typed, comma separated
export interface ArchetypeDraft {
  name: string;
  replaces: string;
  alters: string;
  skillsAdd: string;
  skillsRemove: string;
  weaponsAdd: string;
  armorAdd: string;
  weaponsRemove: string;
  armorRemove: string;
  // how it changes the class's spellcasting: not at all, the class casts nothing with it, or what changes
  casting: 'unchanged' | 'none' | 'changes';
  ability: string;
  type: '' | 'prepared' | 'spontaneous';
  perDayChange: number | null;
  extraSlot: '' | 'none' | 'domain' | 'school';
}

const emptyDraft = (): ArchetypeDraft => ({
  name: '', replaces: '', alters: '', skillsAdd: '', skillsRemove: '', weaponsAdd: '', armorAdd: '', weaponsRemove: '',
  armorRemove: '', casting: 'unchanged', ability: '', type: '', perDayChange: null, extraSlot: '',
});

// "none" typed in a list is no entry of it: an archetype that replaces nothing (a totem warrior) says so
const commaList = (text: string, lowercase = false): string[] =>
  (text || '').split(',').map(s => s.trim()).filter(s => s && !/^none$/i.test(s)).map(s => lowercase ? s.toLowerCase() : s);
const sameClass = (a: ClassLevel, b: ClassLevel): boolean =>
  (a.name || '').trim().toLowerCase() === (b.name || '').trim().toLowerCase();

@Component({
  selector: 'app-class-level-form',
  imports: [CommonModule, FormsModule, EditFeatureArrayComponent],
  templateUrl: './class-level-form.component.html',
  styleUrl: './class-level-form.component.sass',
})
export class ClassLevelFormComponent implements OnInit, OnChanges {
  private character = inject(ApplyCharacterService);
  @Input() classLevels: ClassLevel[] = [];
  @Output() classLevelsChange = new EventEmitter<ClassLevel[]>();
  // the favored classes of the character, they can only be marked when given
  @Input() favoredClasses?: string[];
  @Output() favoredClassesChange = new EventEmitter<string[]>();

  readonly presets = CLASS_PRESETS;
  readonly abilities = ABILITIES;
  readonly saves = SAVES;
  readonly babProgressions: {value: BabProgression, label: string}[] = [
    {value: 'full', label: 'Full'},
    {value: 'threeQuarters', label: '3/4'},
    {value: 'half', label: '1/2'},
  ];
  readonly favoredClassBonuses: {value: FavoredClassBonus, label: string}[] = [
    {value: 'hp', label: '+1 HP'},
    {value: 'skill', label: '+1 skill rank'},
    {value: 'other', label: 'Other'},
  ];
  readonly isAbilityIncreaseLevel = isAbilityIncreaseLevel;
  // the proficiencies a class level entry can add, with the groups offered as suggestions
  readonly proficiencyKinds: {key: keyof Proficiencies, label: string, suggestions: string[]}[] = [
    {key: 'weapons', label: 'Weapons', suggestions: ['simple', 'martial']},
    {key: 'armor', label: 'Armor', suggestions: ['light', 'medium', 'heavy', 'shield', 'tower shield']},
  ];

  readonly allSkills: string[] = Object.keys(getSkillList()).flatMap(skill =>
    skill === 'knowledge'
      ? ['knowledge', ...KNOWLEDGE_SPECIALTIES.map(spec => `knowledge (${spec})`)]
      : [skill]
  );
  expandedSkillPickers: { [index: number]: boolean } = {};
  // the archetype being written at a level entry, by its index, and why the last try to take it did not
  archetypeDrafts: { [index: number]: ArchetypeDraft } = {};
  archetypeErrors: { [index: number]: string[] } = {};

  ngOnInit(): void {
    this.ensureArray();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['classLevels']) {
      this.ensureArray();
    }
  }

  private ensureArray(): void {
    if (!Array.isArray(this.classLevels)) {
      this.classLevels = this.classLevels ? [new ClassLevel(this.classLevels as any)] : [new ClassLevel()];
    }
    for (const cl of this.classLevels) {
      if (!Array.isArray(cl.features)) cl.features = [];
      if (!Array.isArray(cl.classSkills)) cl.classSkills = [];
    }
  }

  // which level of its class a new entry of that class is
  private nextLevelOf(name: string): number {
    return this.classLevels.filter(cl => (cl.name || '').trim().toLowerCase() === name.trim().toLowerCase()).length + 1;
  }

  // a new level of the last class taken, with the same progression
  addClassLevel(): void {
    const last = this.classLevels[this.classLevels.length - 1];
    const name = last?.name || 'New Class';
    this.classLevels.push(
      new ClassLevel({
        name,
        level: this.nextLevelOf(name),
        hitDice: last?.hitDice || 8,
        rolledHp: 0,
        skillRanks: last?.skillRanks || 2,
        startingWealth: 0,
        classSkills: [...(last?.classSkills || [])],
        babProgression: last?.babProgression,
        goodSaves: last?.goodSaves ? [...last.goodSaves] : undefined,
        favoredClassBonus: last?.favoredClassBonus,
        features: [],
      })
    );
    this.emitChange();
  }

  // a new level of a core class, filled from its preset
  addPresetLevel(presetName: string): void {
    const preset = this.presets.find(p => p.name === presetName);
    if (!preset) return;
    this.classLevels.push(classLevelFromPreset(preset, this.nextLevelOf(preset.name), this.classLevels.length === 0));
    this.emitChange();
  }

  // a class without good saves given leaves its saves to its features
  setSaveProgression(cl: ClassLevel, byProgression: boolean): void {
    cl.goodSaves = byProgression ? [] : undefined;
    this.emitChange();
  }

  toggleGoodSave(cl: ClassLevel, save: SaveName, checked: boolean): void {
    const others = (cl.goodSaves || []).filter(s => s !== save);
    cl.goodSaves = checked ? [...others, save] : others;
    this.emitChange();
  }

  // the alternate favored class bonuses the race lists for the class of the entry
  optionsFor(cl: ClassLevel): FavoredClassOption[] {
    const name = (cl.name || '').trim().toLowerCase();
    return (this.character.raw().race?.favoredClassOptions || []).filter(option => option.class.trim().toLowerCase() === name);
  }

  isFavoredClass(cl: ClassLevel): boolean {
    const name = (cl.name || '').trim().toLowerCase();
    return (this.favoredClasses || []).some(f => f.trim().toLowerCase() === name);
  }

  toggleFavoredClass(cl: ClassLevel, checked: boolean): void {
    const name = (cl.name || '').trim().toLowerCase();
    const others = (this.favoredClasses || []).filter(f => f.trim().toLowerCase() !== name);
    this.favoredClasses = checked && name ? [...others, cl.name.trim()] : others;
    this.favoredClassesChange.emit(this.favoredClasses);
  }

  removeClassLevel(index: number): void {
    this.classLevels.splice(index, 1);
    this.emitChange();
  }

  getClassSkillsText(cl: ClassLevel): string {
    return (cl.classSkills || []).join(', ');
  }

  onClassSkillsTextChange(cl: ClassLevel, text: string): void {
    cl.classSkills = (text || '')
      .split(',')
      .map(s => s.trim().toLowerCase())
      .filter(Boolean);
    this.emitChange();
  }

  hasClassSkill(cl: ClassLevel, skill: string): boolean {
    return Array.isArray(cl.classSkills) && cl.classSkills.some(s => s.toLowerCase() === skill.toLowerCase());
  }

  toggleClassSkill(cl: ClassLevel, skill: string, checked: boolean): void {
    if (!Array.isArray(cl.classSkills)) cl.classSkills = [];
    const lower = skill.toLowerCase();
    if (checked && !this.hasClassSkill(cl, lower)) {
      cl.classSkills.push(lower);
    } else if (!checked) {
      cl.classSkills = cl.classSkills.filter(s => s.toLowerCase() !== lower);
    }
    this.emitChange();
  }

  proficienciesOf(cl: ClassLevel, kind: keyof Proficiencies): string[] {
    return cl.proficiencies?.[kind] || [];
  }

  // adds what was typed in (several at once when separated by commas), lowercase and once each
  addProficiencies(cl: ClassLevel, kind: keyof Proficiencies, text: string): void {
    const names = (text || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    if (!names.length) return;
    const proficiencies = cl.proficiencies || {weapons: [], armor: []};
    proficiencies[kind] = [...new Set([...(proficiencies[kind] || []), ...names])];
    cl.proficiencies = {weapons: proficiencies.weapons || [], armor: proficiencies.armor || []};
    this.emitChange();
  }

  // an entry left without any proficiency adds none, so it does not keep an empty object around
  removeProficiency(cl: ClassLevel, kind: keyof Proficiencies, name: string): void {
    if (!cl.proficiencies) return;
    cl.proficiencies = {...cl.proficiencies, [kind]: (cl.proficiencies[kind] || []).filter(p => p !== name)};
    if (!cl.proficiencies.weapons?.length && !cl.proficiencies.armor?.length) cl.proficiencies = undefined;
    this.emitChange();
  }

  toggleSkillPicker(index: number): void {
    this.expandedSkillPickers[index] = !this.expandedSkillPickers[index];
  }

  // a prestige class: every level of it progresses its saves as a prestige class's
  setPrestige(cl: ClassLevel, on: boolean): void {
    for (const level of this.classLevels.filter(l => l.name === cl.name)) {
      if (on) level.prestige = true;
      else delete level.prestige;
    }
    this.emitChange();
  }

  // a prestige class level's "+1 level of existing spellcasting class": the classes it advances, by name
  setAdvancesCasting(cl: ClassLevel, value: string): void {
    const classes = String(value || '').split(',').map(c => c.trim()).filter(Boolean);
    if (classes.length) cl.advancesCasting = classes;
    else delete cl.advancesCasting;
    this.emitChange();
  }

  // ---- archetypes ----
  // an archetype taken by hand is what the AI's add_class_level takes (rules/archetypes.ts): recorded on the level, its
  // class skills, proficiencies and spellcasting put on the class's levels, the features it replaces taken off them.
  // what is wrong with it by the rules of archetypes is told, not refused, as the sheet's other editors do

  // what is wrong with the archetypes the classes have now: a feature one replaced still gained, one traded twice
  archetypeWarnings(): string[] {
    return archetypeWarnings(this.classLevels);
  }

  startArchetype(index: number): void {
    this.archetypeDrafts[index] = emptyDraft();
    delete this.archetypeErrors[index];
  }

  cancelArchetype(index: number): void {
    delete this.archetypeDrafts[index];
    delete this.archetypeErrors[index];
  }

  // the class feature names the class's levels give, to pick what an archetype trades from
  classFeatureNames(cl: ClassLevel): string[] {
    const names = this.classLevels.filter(l => sameClass(l, cl)).flatMap(l => (l.features || []).map(f => f.name || ''));
    return [...new Map(names.filter(Boolean).map(n => [featureKey(n), n])).values()];
  }

  // the archetype the draft writes. its spellcasting change is written as add_class_level's (ai/spells.ts)
  archetypeOf(draft: ArchetypeDraft): Archetype {
    const skillsAdd = commaList(draft.skillsAdd, true);
    const skillsRemove = commaList(draft.skillsRemove, true);
    const part = (weapons: string, armor: string): Partial<Proficiencies> | undefined => {
      const w = commaList(weapons, true);
      const a = commaList(armor, true);
      return w.length || a.length ? {...(w.length ? {weapons: w} : {}), ...(a.length ? {armor: a} : {})} : undefined;
    };
    const add = part(draft.weaponsAdd, draft.armorAdd);
    const remove = part(draft.weaponsRemove, draft.armorRemove);
    const change: {[key: string]: unknown} = {
      ...(draft.ability ? {ability: draft.ability} : {}),
      ...(draft.type ? {type: draft.type} : {}),
      ...(draft.perDayChange ? {spells_per_day_change: draft.perDayChange} : {}),
      ...(draft.extraSlot ? {extra_slot: draft.extraSlot} : {}),
    };
    const spellcasting = draft.casting === 'none' ? 'none' as const
      : draft.casting === 'changes' && Object.keys(change).length ? change : undefined;
    const alters = commaList(draft.alters);
    return {
      name: draft.name.trim(), replaces: commaList(draft.replaces), ...(alters.length ? {alters} : {}),
      ...(skillsAdd.length || skillsRemove.length ? {classSkills: {...(skillsAdd.length ? {add: skillsAdd} : {}), ...(skillsRemove.length ? {remove: skillsRemove} : {})}} : {}),
      ...(add || remove ? {proficiencies: {...(add ? {add} : {}), ...(remove ? {remove} : {})}} : {}),
      ...(spellcasting ? {spellcasting} : {}),
    };
  }

  // the class's features the archetype replaces, which taking it takes off the class's levels
  replacedOnLevels(cl: ClassLevel, draft: ArchetypeDraft): {name: string, level: number}[] {
    const replaced = new Set(this.archetypeOf(draft).replaces.map(featureKey));
    return this.classLevels.filter(l => sameClass(l, cl)).flatMap(l => (l.features || [])
      .filter(f => replaced.has(featureKey(f.name || ''))).map(f => ({name: f.name || '', level: l.level})));
  }

  // what is wrong with taking the draft at this level, as the rules of archetypes say. the features it replaces are
  // taken off when it is taken, so having them is not one
  draftProblems(cl: ClassLevel, draft: ArchetypeDraft): string[] {
    const archetype = this.archetypeOf(draft);
    if (!archetype.name) return [];
    const replaced = new Set(archetype.replaces.map(featureKey));
    const levels = this.classLevels.map(l => sameClass(l, cl)
      ? new ClassLevel({...l, features: (l.features || []).filter(f => !replaced.has(featureKey(f.name || '')))})
      : l);
    const entry = levels[this.classLevels.indexOf(cl)];
    // one that trades nothing is no problem: a totem warrior replaces no class feature
    return archetypeRuleProblems(levels, entry, [archetype]);
  }

  // takes the draft at the level: one change of the class levels. a spellcasting change is read as the AI's is, with
  // the class's archetypes' changes over the class's own (ai/spells.ts, loaded only then, it is the AI's code)
  async takeArchetype(index: number): Promise<void> {
    const cl = this.classLevels[index];
    const draft = this.archetypeDrafts[index];
    if (!cl || !draft) return;
    const archetype = this.archetypeOf(draft);
    if (!archetype.name) {
      this.archetypeErrors[index] = ['name the archetype'];
      return;
    }
    let spellcasting: ClassLevel['spellcasting'] | null | undefined;
    if (archetype.spellcasting) {
      const {archetypeCasting} = await import('../ai/spells');
      const ofClass = this.classLevels.filter(l => sameClass(l, cl));
      const base = ofClass.find(l => l.spellcasting)?.spellcasting;
      const read = archetypeCasting(base, [...archetypesOf(this.classLevels, cl.name), archetype], cl.name, ofClass.length);
      if (read.problems.length) {
        this.archetypeErrors[index] = read.problems;
        return;
      }
      spellcasting = read.spellcasting;
    }
    const replaced = new Set(archetype.replaces.map(featureKey));
    const ofClass = this.classLevels.filter(l => sameClass(l, cl));
    for (const level of ofClass) level.features = (level.features || []).filter(f => !replaced.has(featureKey(f.name || '')));
    // a 1st level the archetype changes the proficiencies of gets them, so the change has a list to change
    if (archetype.proficiencies && cl.level === 1 && !cl.proficiencies) cl.proficiencies = {weapons: [], armor: []};
    const changed = applyArchetypes(cl, ofClass.filter(l => l !== cl), [archetype], spellcasting);
    this.classLevels = this.classLevels.map(l => changed.get(l) ?? l);
    this.cancelArchetype(index);
    this.emitChange();
  }

  // gives an archetype up: its record leaves the level. what it changed on the class's levels (class skills,
  // proficiencies, the features it took off) stays as it is, for the editor to change back
  removeArchetype(cl: ClassLevel, archetype: Archetype): void {
    const left = (cl.archetypes || []).filter(a => a !== archetype);
    cl.archetypes = left.length ? left : undefined;
    this.emitChange();
  }

  // an archetype taken, its replaced or altered features corrected
  setArchetypeTrades(archetype: Archetype, kind: 'replaces' | 'alters', text: string): void {
    const list = commaList(text);
    if (kind === 'replaces') archetype.replaces = list;
    else if (list.length) archetype.alters = list;
    else delete archetype.alters;
    this.emitChange();
  }

  // what else an archetype taken changed, in words: its class skills, proficiencies and spellcasting
  archetypeChanges(archetype: Archetype): string[] {
    const prof = (p?: Partial<Proficiencies>) => [...(p?.weapons || []), ...(p?.armor || [])].join(', ');
    const casting = archetype.spellcasting;
    return [
      archetype.classSkills?.add?.length ? `class skills + ${archetype.classSkills.add.join(', ')}` : '',
      archetype.classSkills?.remove?.length ? `class skills − ${archetype.classSkills.remove.join(', ')}` : '',
      prof(archetype.proficiencies?.add) ? `proficiencies + ${prof(archetype.proficiencies?.add)}` : '',
      prof(archetype.proficiencies?.remove) ? `proficiencies − ${prof(archetype.proficiencies?.remove)}` : '',
      casting === 'none' ? 'casts no spells'
        : casting ? `spellcasting: ${Object.entries(casting).map(([k, v]) => `${k.replace(/_/g, ' ')} ${v}`).join(', ')}` : '',
    ].filter(Boolean);
  }

  emitChange(): void {
    this.classLevelsChange.emit(this.classLevels);
  }
}
