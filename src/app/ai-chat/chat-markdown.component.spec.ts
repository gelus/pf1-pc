import {Component} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {ChatMarkdownComponent, renderChatMarkdown} from './chat-markdown.component';

@Component({imports: [ChatMarkdownComponent], template: '<app-chat-markdown [text]="text"></app-chat-markdown>'})
class HostComponent {
  text = '';
}

describe('ChatMarkdownComponent', () => {
  const render = (text: string): HTMLElement => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.text = text;
    fixture.detectChanges();
    return fixture.nativeElement.querySelector('.md');
  };

  it('renders the AI\'s markdown: bold, lists, code and line breaks', () => {
    const md = render('**Studied Target** gives:\n- +1 attack\n- +1 damage\n\nUse `{level.slayer}`.\nNext line');
    expect(md.querySelector('strong')!.textContent).toBe('Studied Target');
    expect([...md.querySelectorAll('li')].map(li => li.textContent)).toEqual(['+1 attack', '+1 damage']);
    expect(md.querySelector('code')!.textContent).toBe('{level.slayer}');
    expect(md.querySelectorAll('br').length).toBe(1);
  });

  it('opens links next to the sheet and puts tables in the design system\'s table', () => {
    const md = render('[Slayer](https://www.d20pfsrd.com/classes/hybrid-classes/slayer/)\n\n| Level | Bonus |\n|---|--:|\n| 1 | +1 |');
    const link = md.querySelector('a')!;
    expect([link.getAttribute('target'), link.getAttribute('rel')]).toEqual(['_blank', 'noopener noreferrer']);
    expect(md.querySelector('.md-table table.pf-table td.num')!.textContent).toBe('+1');
  });

  it('runs nothing the AI writes: HTML shows as text, script links are dropped', () => {
    expect(renderChatMarkdown('<img src=x onerror=alert(1)>')).toContain('&lt;img');
    const md = render('<script>alert(1)</script> [click](javascript:alert(1))');
    expect(md.querySelector('script, img')).toBeNull();
    expect(md.querySelector('a')?.getAttribute('href') ?? '').not.toContain('javascript:alert');
  });
});
