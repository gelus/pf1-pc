import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClassLevel } from '../utils/classlevel.class';
import { getSkillList } from '../utils/skilllist.class';
import { EditFeatureArrayComponent } from '../edit-feature-array/edit-feature-array.component';

@Component({
  selector: 'app-class-level-form',
  imports: [CommonModule, FormsModule, EditFeatureArrayComponent],
  templateUrl: './class-level-form.component.html',
  styleUrl: './class-level-form.component.sass',
})
export class ClassLevelFormComponent implements OnInit, OnChanges {
  @Input() classLevels: ClassLevel[] = [];
  @Output() classLevelsChange = new EventEmitter<ClassLevel[]>();

  readonly allSkills: string[] = Object.keys(getSkillList());
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

  addClassLevel(): void {
    const nextLevel = this.classLevels.length + 1;
    this.classLevels.push(
      new ClassLevel({
        name: this.classLevels[0]?.name || 'New Class',
        level: nextLevel,
        hitDice: this.classLevels[0]?.hitDice || 8,
        rolledHp: 0,
        skillRanks: this.classLevels[0]?.skillRanks || 2,
        startingWealth: 0,
        classSkills: [...(this.classLevels[0]?.classSkills || [])],
        features: [],
      })
    );
    this.emitChange();
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

  toggleSkillPicker(index: number): void {
    this.expandedSkillPickers[index] = !this.expandedSkillPickers[index];
  }

  emitChange(): void {
    this.classLevelsChange.emit(this.classLevels);
  }
}
