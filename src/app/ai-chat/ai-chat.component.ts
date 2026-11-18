import {Component, ElementRef, HostBinding, ViewChild, effect, inject} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {ActivatedRoute} from '@angular/router';
import {AiChatService} from '../ai/ai-chat.service';
import {ApplyCharacterService} from '../apply-character.service';

// the chat with the AI, docked to the corner of the sheet. it opens on demand and keeps its conversation while closed
@Component({
  selector: 'app-ai-chat',
  imports: [FormsModule],
  templateUrl: './ai-chat.component.html',
  styleUrl: './ai-chat.component.sass',
})
export class AiChatComponent {
  chat = inject(AiChatService);
  @HostBinding('class.open') open = false;
  draft = '';
  @ViewChild('log') log?: ElementRef<HTMLElement>;

  private character = inject(ApplyCharacterService);
  private route = inject(ActivatedRoute, {optional: true});

  // what a new conversation suggests: creating the character while it has no class levels, else questions about it
  get suggestions(): string[] {
    return (this.character.raw().classLevels || []).length
      ? ['Why is my AC what it is?', 'What does my character do best?', 'Explain my main attack']
      : ['Help me create this character', 'I want to play a dwarven fighter', 'Make me a 15-point buy elf wizard'];
  }

  constructor() {
    // a character created with the AI opens with the chat
    if (this.route?.snapshot.queryParamMap.get('create') === 'ai') {
      this.open = true;
      this.chat.startCreation();
    }
    // keeps the newest message in view
    effect(() => {
      this.chat.messages();
      queueMicrotask(() => {
        const log = this.log?.nativeElement;
        if (log) log.scrollTop = log.scrollHeight;
      });
    });
  }

  toggle(): void {
    this.open = !this.open;
  }

  // the suggestion to create the character opens the creation's questions, the others are sent as they are
  pick(suggestion: string): void {
    if (suggestion === this.suggestions[0] && !(this.character.raw().classLevels || []).length) this.chat.startCreation();
    else this.send(suggestion);
  }

  send(text: string = this.draft): void {
    if (!text.trim() || this.chat.busy()) return;
    this.draft = '';
    void this.chat.send(text);
  }

  // enter sends, shift+enter starts a new line
  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.send();
    }
  }
}
