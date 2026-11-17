import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BabProgression, ClassLevel, FavoredClassBonus, Proficiencies, SaveName } from '../utils/classlevel.class';
import { KNOWLEDGE_SPECIALTIES, getSkillList } from '../utils/skilllist.class';
import { EditFeatureArrayComponent } from '../edit-feature-array/edit-feature-array.component';
import { CLASS_PRESETS, classLevelFromPreset } from '../rules/class-presets';
import { ABILITIES, SAVES, isAbilityIncreaseLevel } from '../rules/class-progression';

@Component({
  selector: 'app-class-level-form',
  imports: [CommonModule, FormsModule, EditFeatureArrayComponent],
  templateUrl: './class-level-form.component.html',
  styleUrl: './class-level-form.component.sass',
})
export class ClassLevelFormComponent implements OnInit, OnChanges {
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

  emitChange(): void {
    this.classLevelsChange.emit(this.classLevels);
  }
}
