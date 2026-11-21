import {ComponentFixture, TestBed} from '@angular/core/testing';
import {PointBuyWidgetComponent} from './point-buy-widget.component';

describe('PointBuyWidgetComponent', () => {
  let fixture: ComponentFixture<PointBuyWidgetComponent>;
  let widget: PointBuyWidgetComponent;
  const el = () => fixture.nativeElement as HTMLElement;
  const confirmButton = () => [...el().querySelectorAll('button')].find(b => b.textContent?.trim() === 'Confirm')!;

  beforeEach(() => {
    fixture = TestBed.createComponent(PointBuyWidgetComponent);
    widget = fixture.componentInstance;
    fixture.componentRef.setInput('scores', {str: 16, dex: 14, con: 14, int: 10, wis: 10, cha: 7});
    fixture.componentRef.setInput('budget', 20);
    fixture.detectChanges();
  });

  it('starts from the suggestion, with the points left', () => {
    expect(widget.total()).toBe(10 + 5 + 5 - 4);
    expect(el().querySelector('.left')!.textContent!.trim()).toBe('4 left');
    expect(confirmButton().disabled).toBeFalse();
  });

  it('moves a score a step and holds confirming back over the points', () => {
    (el().querySelector('[aria-label="raise str"]') as HTMLButtonElement).click();
    (el().querySelector('[aria-label="raise str"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(widget.scores()['str']).toBe(18);
    expect(el().querySelector('.left')!.textContent!.trim()).toBe('3 over');
    expect(confirmButton().disabled).toBeTrue();
    widget.setBudget(25);
    fixture.detectChanges();
    expect(confirmButton().disabled).toBeFalse();
  });

  it('gives the scores and points on confirm, and locks once confirmed', () => {
    let picked: unknown;
    widget.confirm.subscribe(value => picked = value);
    confirmButton().click();
    expect(picked).toEqual({scores: {str: 16, dex: 14, con: 14, int: 10, wis: 10, cha: 7}, budget: 20});
    fixture.componentRef.setInput('confirmed', true);
    fixture.detectChanges();
    expect(el().querySelector('.done')!.textContent).toContain('confirmed');
    expect((el().querySelector('[aria-label="raise str"]') as HTMLButtonElement).disabled).toBeTrue();
  });
});
