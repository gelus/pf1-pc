import {Directive, ElementRef, HostListener, Input, OnDestroy, inject} from '@angular/core';

// a tooltip in the look of the stat block's (the global .tooltip): a label and a text, for what has a description to
// read (a feat, a special quality, an alignment). shown while the element is hovered or focused, placed above it or
// below when there is no room, kept on the screen. the title attribute's grey box did not fit the design
//   <span [pfTip]="feature.description" [pfTipLabel]="feature.name">
let tips = 0;

@Directive({selector: '[pfTip]', standalone: true})
export class TipDirective implements OnDestroy {
  @Input('pfTip') text: string | null | undefined;
  @Input() pfTipLabel: string | null | undefined;

  private host = inject(ElementRef<HTMLElement>);
  private tip?: HTMLElement;
  private readonly id = `pf-tip-${tips++}`;

  @HostListener('mouseenter') @HostListener('focusin') show(): void {
    const text = (this.text || '').trim();
    if (!text || this.tip) return;
    const tip = document.createElement('div');
    tip.className = 'tooltip pf-tip';
    tip.id = this.id;
    tip.setAttribute('role', 'tooltip');
    if (this.pfTipLabel) {
      const head = document.createElement('div');
      head.className = 'tip-head';
      const label = document.createElement('span');
      label.className = 'pf-label';
      label.textContent = this.pfTipLabel;
      head.appendChild(label);
      tip.appendChild(head);
    }
    const body = document.createElement('p');
    body.className = 'tip-text';
    body.textContent = text;
    tip.appendChild(body);
    document.body.appendChild(tip);
    this.tip = tip;
    this.host.nativeElement.setAttribute('aria-describedby', this.id);
    this.place();
  }

  @HostListener('mouseleave') @HostListener('focusout') @HostListener('click') @HostListener('window:scroll')
  hide(): void {
    this.tip?.remove();
    this.tip = undefined;
    this.host.nativeElement.removeAttribute('aria-describedby');
  }

  ngOnDestroy(): void {
    this.hide();
  }

  // above the element, below it when there is no room, its left edge at the element's, kept 8px inside the window
  private place(): void {
    const tip = this.tip;
    if (!tip) return;
    const rect = this.host.nativeElement.getBoundingClientRect();
    const box = tip.getBoundingClientRect();
    const above = rect.top - box.height - 8 >= 8;
    const top = above ? rect.top - box.height - 8 : rect.bottom + 8;
    const left = Math.min(Math.max(8, rect.left), window.innerWidth - box.width - 8);
    tip.style.top = `${Math.max(8, top)}px`;
    tip.style.left = `${Math.max(8, left)}px`;
  }
}
