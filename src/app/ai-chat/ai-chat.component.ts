import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {Component, ElementRef, HostBinding, Input, ViewChild, booleanAttribute, effect, inject, output, untracked} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {ActivatedRoute} from '@angular/router';
import {AiChatService, ChatMessage} from '../ai/ai-chat.service';
import {PointBuyWidgetComponent} from './point-buy-widget.component';
import {ChatMarkdownComponent} from './chat-markdown.component';
import {ApplyCharacterService} from '../apply-character.service';
import {ChatRequestsService} from './chat-requests.service';
import {payGold} from '../retraining';

// the chat with the AI. docked, it fills the sheet's chat panel and is always open; else it floats in the corner of the
// page, opens on demand and keeps its conversation while closed
@Component({
  selector: 'app-ai-chat',
  imports: [FormsModule, ChatMarkdownComponent, PointBuyWidgetComponent],
  templateUrl: './ai-chat.component.html',
  styleUrl: './ai-chat.component.sass',
})
export class AiChatComponent {
  chat = inject(AiChatService);
  @HostBinding('class.open') open = false;
  @HostBinding('class.docked') @Input({transform: booleanAttribute}) docked = false;
  // the AI answered, the sheet marks the chat when it is not in view
  replied = output<void>();
  private seenMessages = 0;
  draft = '';
  @ViewChild('log') log?: ElementRef<HTMLElement>;

  private character = inject(ApplyCharacterService);
  private requests = inject(ChatRequestsService);
  private handledRequest = 0;
  private route = inject(ActivatedRoute, {optional: true});

  // what a new conversation suggests: creating the character while it has no class levels, else questions about it
  get suggestions(): string[] {
    return (this.character.raw().classLevels || []).length
      ? ['Why is my AC what it is?', 'What does my character do best?', 'Explain my main attack']
      : ['Help me create this character', 'I want to play a dwarven fighter', 'Make me a 15-point buy elf wizard'];
  }

  constructor() {
    // a character created with the AI opens with the chat
    // and so does a companion created with the AI from the side bar, which reuses this chat: the router tells the query
    // before the sheet opened the new character, so the creation starts once it has
    this.route?.queryParamMap?.pipe(takeUntilDestroyed()).subscribe(query => {
      if (query.get('create') !== 'ai') return;
      this.open = true;
      setTimeout(() => this.chat.startCreation());
    });
    // a question another part of the sheet asked (a stat's tooltip): the docked chat sends it, or leaves it in the
    // message box when it can not send now
    effect(() => {
      const request = this.requests.asked();
      if (!this.docked || !request || request.at <= this.handledRequest) return;
      this.handledRequest = request.at;
      untracked(() => {
        if (this.chat.available() && !this.chat.busy()) this.send(request.question);
        else this.draft = request.question;
      });
    });
    // keeps the newest message in view
    effect(() => {
      const messages = this.chat.messages();
      if (messages.length > this.seenMessages && messages[messages.length - 1]?.role === 'ai') this.replied.emit();
      this.seenMessages = messages.length;
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

  // the conversation's log as a file: a link clicked for it, nothing sent anywhere
  downloadLog(): void {
    const blob = new Blob([this.chat.exportLog()], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const name = (this.character.raw().name || 'character').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    link.href = url;
    link.download = `ai-log-${name}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url));
  }

  // why a point buy could not be set, under it
  pointBuyProblem = new Map<ChatMessage, string>();

  async confirmPointBuy(message: ChatMessage, picked: {scores: {[ability: string]: number}, budget: number}): Promise<void> {
    const problem = await this.chat.confirmPointBuy(message, picked.scores, picked.budget);
    if (problem) this.pointBuyProblem.set(message, problem);
  }

  // a retraining's gold, out of the purse when the player clicks Pay (retraining.ts): one step of the undo history
  payProblem = new Map<ChatMessage, string>();
  pay(message: ChatMessage): void {
    if (!message.pay || message.pay.paid) return;
    const paid = payGold(this.character, message.pay.gp, message.pay.what);
    if (paid.done) {
      message.pay.paid = true;
      this.payProblem.delete(message);
    } else this.payProblem.set(message, String(paid.error));
  }

  // enter sends, shift+enter starts a new line
  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.send();
    }
  }
}
