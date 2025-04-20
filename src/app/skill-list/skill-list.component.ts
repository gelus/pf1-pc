import { Component, EventEmitter, Input, Output } from '@angular/core';
import {Character} from '../utils/character.class';
import { SkillValuePipe } from './skill-value.pipe';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {RemainingRanksPipe} from '../characterPipes/remaining-ranks.pipe';
import {MaxLevelPipe} from '../characterPipes/max-level.pipe';

@Component({
  selector: 'app-skill-list',
  imports: [SkillValuePipe, RemainingRanksPipe, MaxLevelPipe, CommonModule, FormsModule],
  templateUrl: './skill-list.component.html',
  styleUrl: './skill-list.component.sass'
})
export class SkillListComponent {

  @Output() skillChange = new EventEmitter<Partial<Character>>();
  @Input() char!: Character;
  @Input() rawChar!: Character;

}
