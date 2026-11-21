import {Component} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {TipDirective} from './tip.directive';

@Component({
  imports: [TipDirective],
  template: `<span class="with" [pfTip]="'+4 on initiative checks.'" pfTipLabel="Improved Initiative">Improved Initiative</span>
    <span class="without" [pfTip]="''">Nothing to say</span>`,
})
class HostComponent {}

describe('TipDirective', () => {
  const tip = () => document.querySelector('.tooltip.pf-tip');

  it('shows the stat block\'s tooltip with its label and text while hovered, described by it', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement.querySelector('.with') as HTMLElement;
    el.dispatchEvent(new MouseEvent('mouseenter'));
    expect(tip()!.querySelector('.pf-label')!.textContent).toBe('Improved Initiative');
    expect(tip()!.querySelector('.tip-text')!.textContent).toBe('+4 on initiative checks.');
    expect(tip()!.getAttribute('role')).toBe('tooltip');
    expect(el.getAttribute('aria-describedby')).toBe(tip()!.id);
    el.dispatchEvent(new MouseEvent('mouseleave'));
    expect(tip()).toBeNull();
    expect(el.hasAttribute('aria-describedby')).toBeFalse();
  });

  it('shows nothing for no text, and goes with its element', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    fixture.nativeElement.querySelector('.without').dispatchEvent(new MouseEvent('mouseenter'));
    expect(tip()).toBeNull();
    fixture.nativeElement.querySelector('.with').dispatchEvent(new FocusEvent('focusin'));
    expect(tip()).not.toBeNull();
    fixture.destroy();
    expect(tip()).toBeNull();
  });
});
