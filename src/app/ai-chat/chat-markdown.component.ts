import {Component, ViewEncapsulation, computed, input} from '@angular/core';
import {Marked} from 'marked';

// an answer of the AI, which writes markdown (bold names, lists of options, the odd heading or table), shown as the
// design system's chat text. marked turns it into HTML and Angular's sanitizer cleans that when it is bound to
// innerHTML (scripts, event handlers and javascript: links are dropped), so what the AI writes can not run in the page.
// the AI may quote rules pages, so raw HTML in its markdown is shown as text rather than parsed
const markdown = new Marked({
  gfm: true,
  // a single line break is a line break: the AI writes short lines more than paragraphs
  breaks: true,
  renderer: {
    // links open next to the sheet, never in its place
    link({href, title, tokens}) {
      const text = this.parser.parseInline(tokens);
      return `<a href="${escapeAttr(href)}"${title ? ` title="${escapeAttr(title)}"` : ''} target="_blank" rel="noopener noreferrer">${text}</a>`;
    },
    html({text}) {
      return escapeText(text);
    },
    // a table can be wider than the chat: it scrolls in a wrapper of its own, in the design system's table style
    table(token) {
      const cell = (c: {tokens: any[], align: string | null}, tag: 'th' | 'td') =>
        `<${tag}${c.align === 'right' ? ' class="num"' : ''}>${this.parser.parseInline(c.tokens)}</${tag}>`;
      const head = `<tr>${token.header.map(c => cell(c, 'th')).join('')}</tr>`;
      const body = token.rows.map(row => `<tr>${row.map(c => cell(c, 'td')).join('')}</tr>`).join('');
      return `<div class="md-table"><table class="pf-table"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
    },
  },
});

const escapeText = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = (text: string): string => escapeText(text).replace(/"/g, '&quot;');

export const renderChatMarkdown = (text: string): string => markdown.parse(text, {async: false}) as string;

@Component({
  selector: 'app-chat-markdown',
  template: '<div class="md" [innerHTML]="html()"></div>',
  styleUrl: './chat-markdown.component.sass',
  // the HTML is made at run time, so the styles can not be scoped by Angular's attributes: they are scoped by .md
  encapsulation: ViewEncapsulation.None,
})
export class ChatMarkdownComponent {
  readonly text = input.required<string>();
  readonly html = computed(() => renderChatMarkdown(this.text()));
}
