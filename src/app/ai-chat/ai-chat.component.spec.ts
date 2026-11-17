import {ComponentFixture, TestBed} from '@angular/core/testing';
import {AI_PROVIDER} from '../ai/ai-chat.service';
import {AiProvider} from '../ai/ai-provider';
import {AiChatComponent} from './ai-chat.component';
import {ApplyCharacterService} from '../apply-character.service';
import {Character} from '../utils/character.class';
import {ClassLevel} from '../utils/classlevel.class';

describe('AiChatComponent', () => {
  let fixture: ComponentFixture<AiChatComponent>;
  let provider: AiProvider | null;
  const el = (selector: string): HTMLElement => fixture.nativeElement.querySelector(selector);

  // a character with a class level, or a blank one being created
  const create = async (withProvider: boolean, leveled = true) => {
    provider = withProvider ? {
      name: 'fake',
      startSession: () => ({send: async () => ({text: 'Your AC is 12.', toolCalls: []})}),
    } : null;
    await TestBed.configureTestingModule({
      imports: [AiChatComponent],
      providers: [{provide: AI_PROVIDER, useValue: () => provider}],
    }).compileComponents();
    const char = new Character();
    if (leveled) char.classLevels.push(new ClassLevel({name: 'Fighter', hitDice: 10}));
    TestBed.inject(ApplyCharacterService).initializeCharacter(char);
    fixture = TestBed.createComponent(AiChatComponent);
    fixture.detectChanges();
  };

  it('opens from a button and closes again', async () => {
    await create(true);
    expect(el('.panel')).toBeNull();
    el('.opener').click();
    fixture.detectChanges();
    expect(el('.panel')).toBeTruthy();
    el('.close').click();
    fixture.detectChanges();
    expect(el('.panel')).toBeNull();
  });

  it('sends a suggested question and shows the answer', async () => {
    await create(true);
    el('.opener').click();
    fixture.detectChanges();
    el('.suggestion').click();
    await fixture.whenStable();
    fixture.detectChanges();
    const messages = [...fixture.nativeElement.querySelectorAll('.message')].map((m: HTMLElement) => [m.className.trim(), m.textContent!.trim()]);
    expect(messages).toEqual([['message player', 'Why is my AC what it is?'], ['message ai', 'Your AC is 12.']]);
  });

  it('suggests creating a character that has no class level yet', async () => {
    await create(true, false);
    el('.opener').click();
    fixture.detectChanges();
    expect(el('.suggestion').textContent!.trim()).toBe('Help me create this character');
    expect(el('.hint').textContent).toContain('builds the character with you');
  });

  it('says how to set the AI up when it is not', async () => {
    await create(false);
    el('.opener').click();
    fixture.detectChanges();
    expect(el('.setup').textContent).toContain('ai-config.ts');
  });
});
