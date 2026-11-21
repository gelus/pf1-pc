import {TipDirective} from '../tip/tip.directive';
import {AfterViewInit, Component, ElementRef, EventEmitter, HostListener, Output, inject, signal} from '@angular/core';
import {ApplyCharacterService} from '../apply-character.service';
import {Alignment} from '../interfaces/character.interface';
import {ALIGNMENTS, ALIGNMENT_CHART, ALIGNMENT_COLUMNS, ALIGNMENT_ROWS, AlignmentInfo} from '../rules/alignments';

// the alignment chart, opened from the alignment on the sheet: law to chaos across, good to evil down. picking one
// sets the character's alignment (one step of the history) and closes the chart
@Component({
  imports: [TipDirective],
  selector: 'app-alignment-modal',
  templateUrl: './alignment-modal.component.html',
  styleUrl: './alignment-modal.component.sass',
})
export class AlignmentModalComponent implements AfterViewInit {
  @Output() closed = new EventEmitter<void>();

  character = inject(ApplyCharacterService);
  private host: HTMLElement = inject(ElementRef).nativeElement;

  chart = ALIGNMENT_CHART;
  columns = ALIGNMENT_COLUMNS;
  rows = ALIGNMENT_ROWS;
  alignments = ALIGNMENTS;

  // the alignment the description under the chart is of: the one hovered or focused, else the character's
  shown = signal<Alignment | null>(null);

  current(): Alignment {
    return this.character.raw().alignment;
  }

  described(): AlignmentInfo | undefined {
    return ALIGNMENTS[this.shown() ?? this.current()];
  }

  pick(alignment: Alignment): void {
    if (alignment !== this.current()) {
      this.character.labelled(`set the alignment to ${ALIGNMENTS[alignment].name}`, () => this.character.update({alignment}));
    }
    this.close();
  }

  close(): void {
    this.closed.emit();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close();
  }

  // the chart opens on the character's alignment, so the keyboard starts from it
  ngAfterViewInit(): void {
    (this.host.querySelector('.alignment-cell[aria-pressed="true"]') as HTMLElement | null)?.focus?.();
  }
}
