import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AlignmentModalComponent } from './alignment-modal.component';
import { ApplyCharacterService } from '../apply-character.service';
import { Character } from '../utils/character.class';
import { ALIGNMENTS, ALIGNMENT_CHART, alignmentName, alignmentTooltip } from '../rules/alignments';

// the description tooltip an element shows while hovered (pfTip): its label and text, then it is put away
const tipOf = (element: Element): string => {
  element.dispatchEvent(new MouseEvent('mouseenter'));
  const tip = document.querySelector('.tooltip.pf-tip');
  const text = tip ? [...tip.children].map(c => c.textContent!.trim()).join(': ') : '';
  element.dispatchEvent(new MouseEvent('mouseleave'));
  return text;
};

describe('AlignmentModalComponent', () => {
  let fixture: ComponentFixture<AlignmentModalComponent>;
  let component: AlignmentModalComponent;
  let service: ApplyCharacterService;
  let closed: number;

  const cells = (): HTMLButtonElement[] => Array.from(fixture.nativeElement.querySelectorAll('.alignment-cell'));
  const cell = (id: string): HTMLButtonElement => cells().find(c => c.querySelector('.alignment-cell__id')!.textContent!.trim() === id)!;

  beforeEach(async () => {
    await TestBed.configureTestingModule({imports: [AlignmentModalComponent]}).compileComponents();
    service = TestBed.inject(ApplyCharacterService);
    const char = new Character();
    char.alignment = 'CG';
    service.initializeCharacter(char);
    fixture = TestBed.createComponent(AlignmentModalComponent);
    component = fixture.componentInstance;
    closed = 0;
    component.closed.subscribe(() => closed++);
    fixture.detectChanges();
  });

  it('lays the nine alignments out law to chaos across and good to evil down', () => {
    expect(cells().map(c => c.querySelector('.alignment-cell__id')!.textContent!.trim()))
      .toEqual(['LG', 'NG', 'CG', 'LN', 'N', 'CN', 'LE', 'NE', 'CE']);
    expect(ALIGNMENT_CHART.flat().length).toBe(9);
  });

  it('marks the current alignment as pressed, and only it', () => {
    expect(cells().filter(c => c.getAttribute('aria-pressed') === 'true').map(c => c.getAttribute('aria-label'))).toEqual(['Chaotic Good']);
    expect(cell('LG').getAttribute('aria-pressed')).toBe('false');
  });

  it('gives each entry a tooltip with its name and description', () => {
    for (const c of cells()) {
      const id = c.querySelector('.alignment-cell__id')!.textContent!.trim() as keyof typeof ALIGNMENTS;
      expect(tipOf(c)).toBe(`${ALIGNMENTS[id].name}: ${ALIGNMENTS[id].description}`);
      expect(c.type).toBe('button');
    }
  });

  it('describes the hovered alignment under the chart, else the current one', () => {
    const description = () => fixture.nativeElement.querySelector('.alignment-description').textContent;
    expect(description()).toContain('Chaotic Good');
    cell('LE').dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();
    expect(description()).toContain(ALIGNMENTS.LE.description);
    cell('LE').dispatchEvent(new MouseEvent('mouseleave'));
    fixture.detectChanges();
    expect(description()).toContain('Chaotic Good');
  });

  it('sets the alignment it is picked, as one step that undoes, and closes', () => {
    cell('LN').click();
    expect(service.raw().alignment).toBe('LN');
    expect(closed).toBe(1);
    service.undo();
    expect(service.raw().alignment).toBe('CG');
  });

  it('closes without a change on cancel and on escape', () => {
    fixture.nativeElement.querySelector('.alignment-cancel').click();
    document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape'}));
    expect(closed).toBe(2);
    expect(service.raw().alignment).toBe('CG');
  });

  it('names and describes alignments, and shows an unknown one as it is', () => {
    expect(alignmentName('NE')).toBe('Neutral Evil');
    expect(alignmentTooltip('N')).toMatch(/^Neutral: /);
    expect(alignmentTooltip('XX')).toBe('XX');
    for (const info of Object.values(ALIGNMENTS)) expect(info.description.length).toBeGreaterThan(40);
  });
});
