import {ComponentFixture, TestBed, fakeAsync, tick} from '@angular/core/testing';
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

  const press = (label: string) => el().querySelector(`[aria-label="${label}"]`)!.dispatchEvent(new PointerEvent('pointerdown', {button: 0}));
  const letGo = (label: string) => el().querySelector(`[aria-label="${label}"]`)!.dispatchEvent(new PointerEvent('pointerup'));

  it('moves a score a step and holds confirming back over the points', () => {
    press('raise str'); letGo('raise str');
    // from the keyboard: a click with no pointer
    el().querySelector('[aria-label="raise str"]')!.dispatchEvent(new MouseEvent('click', {detail: 0}));
    fixture.detectChanges();
    expect(widget.scores()['str']).toBe(18);
    expect(el().querySelector('.left')!.textContent!.trim()).toBe('3 over');
    expect(confirmButton().disabled).toBeTrue();
    const select = el().querySelector('select')!;
    expect([...select.options].map(o => o.textContent!.trim())).toEqual(['10 (low)', '15 (standard)', '20 (high)', '25 (epic)']);
    select.value = select.options[3].value;
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(widget.budget()).toBe(25);
    expect(confirmButton().disabled).toBeFalse();
  });

  it('keeps stepping while a button is held, until let go or at the end of the scores', fakeAsync(() => {
    press('lower cha');
    tick(400);
    expect(widget.scores()['cha']).toBe(7);
    letGo('lower cha');
    // a step on the press, one after 400 ms, then every 70 ms
    press('raise dex');
    tick(400 + 70);
    expect(widget.scores()['dex']).toBe(17);
    letGo('raise dex');
    tick(1000);
    expect(widget.scores()['dex']).toBe(17);
    press('raise dex');
    tick(5000);
    expect(widget.scores()['dex']).toBe(18);
    letGo('raise dex');
  }));

  it('keeps a point buy the AI gave that is not a common one among the choices', () => {
    fixture.componentRef.setInput('budget', 30);
    fixture.detectChanges();
    expect([...el().querySelectorAll('option')].map(o => o.textContent!.trim())).toContain('30');
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
