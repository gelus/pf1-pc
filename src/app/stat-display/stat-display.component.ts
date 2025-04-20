import { Component, HostListener, Input } from '@angular/core';
import {CommonModule} from '@angular/common';
import {Character} from '../utils/character.class';
import {getByPath} from '../utils/object.util';
import {AbilityModPipe} from '../ability-mod.pipe';

@Component({
  selector: 'stat',
  imports: [
    CommonModule,
    AbilityModPipe
  ],
  templateUrl: './stat-display.component.html',
  styleUrl: './stat-display.component.sass'
})
export class StatDisplayComponent {


  protected displayStat:number = 0;
  protected _stat: string = '';
  protected _char: Character | undefined;
  protected _abilityKey = '';
  hovered = false;

  @Input() additionalTooltips: String[][] = [];
  @Input() characterAdjustments: any = {};
  @Input() set char(char:Character) {
    this._char = char;
    this.setDisplayStat();
  }
  @Input() set stat(stat:string) {
    this._stat = stat;
    this.setDisplayStat();
  }
  @Input() set ability(ability:string) {
    this._abilityKey= ability;
    this.setDisplayStat();
  }

  setDisplayStat() {
    let displayStat = 0;
    if (this._char && this._stat) {
      let stat = getByPath(this._char, this._stat) ?? 0;
      displayStat = stat?.value ?? stat;
    } else displayStat = 0;

    if (this._abilityKey && this._char?.abilityScores) displayStat += AbilityModPipe.algorithm(this._char.abilityScores[this._abilityKey])
    this.displayStat = displayStat;
  }

  @HostListener('mouseenter') mouseIn() {
    this.hovered = true;
  }

  @HostListener('mouseleave') mouseOut() {
    this.hovered = false;
  }
}
