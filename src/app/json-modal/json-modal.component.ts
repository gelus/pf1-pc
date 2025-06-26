import {Character} from '../utils/character.class';
import {CommonModule} from '@angular/common';
import {Component, EventEmitter, HostBinding, Output} from '@angular/core';
import {FormsModule} from '@angular/forms';

@Component({
  selector: 'app-json-modal',
  imports: [FormsModule, CommonModule],
  templateUrl: './json-modal.component.html',
  styleUrl: './json-modal.component.sass'
})
export class JsonModalComponent {
  @Output() updated = new EventEmitter<Partial<Character>>();
  @HostBinding('class.open') private open: boolean = false;

  json: object = {}
  destination: string = '';

  confirm() {
    this.updated.emit({[this.destination]:this.json});
    this.closeModal()
  }

  /*
   * destination:string - What featurelist is this going on
   * feature:Feature - An existing feature to edit
   * feature:boolean - new feature with active set to true/false
   */
  openModal(destination: string, json: object) {
    this.destination = destination;
    this.json = json;
    this.open = true;
  }

  closeModal() {
    this.open = false;
    this.destination = '';
    this.json = {};
  }

  consumeAdjustmentString(adj: any) {
    try {
      this.json = JSON.parse(adj.trim().replace(/(\s*\n\s*)|(,\s*(?=}))/g, ''))
    } catch (e) {/* swallow it */}
  }

}
