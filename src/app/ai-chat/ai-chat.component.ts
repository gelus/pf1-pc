import {Component, ElementRef, HostBinding, ViewChild, effect, inject} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {AiChatService} from '../ai/ai-chat.service';

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

  // the questions a new conversation suggests
  readonly suggestions = ['Why is my AC what it is?', 'What does my character do best?', 'Explain my main attack'];

  constructor() {
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
