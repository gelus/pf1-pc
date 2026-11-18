import {Injectable, signal} from '@angular/core';

// questions other parts of the sheet put to the AI (a stat's tooltip asks about the stat): the docked chat sends them,
// and the sheet brings the chat into view
@Injectable({providedIn: 'root'})
export class ChatRequestsService {
  readonly asked = signal<{question: string, at: number} | null>(null);

  ask(question: string): void {
    this.asked.set({question, at: Date.now()});
  }
}
