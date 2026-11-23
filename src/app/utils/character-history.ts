import {Signal, computed, signal} from '@angular/core';
import {Character} from './character.class';

// the undo history of the raw character: a copy of the character as it was before each change, so any change can be
// taken back, and taken back changes redone. the sheet edits the raw character in place and then calls update()
// (ApplyCharacterService), so what came before a change can not be read off the character any more: the history
// keeps the character as it was after the last change (baseline) and turns that into the step of the next one
// the copies are JSON, the raw character is plain data. the history is kept for the page only, a reload or opening
// another character starts it over

export interface HistoryStep {
  // the step's own number, it keeps it when undone and redone
  id: number;
  // what the change was, "cast Cure Light Wounds", when whoever made it said so
  label?: string;
  // the character as it was before the change (undo) or after it (redo), as JSON
  character: string;
  at: number;
}

// changes this close together without a label are one step: typing a name is one change, not one per letter
export const MERGE_WITHIN_MS = 1000;
// the oldest steps go past this many
export const MAX_STEPS = 100;

export interface HistoryState {
  baseline: string;
  lastChange: number;
  nextId: number;
  undo: HistoryStep[];
  redo: HistoryStep[];
}

export class CharacterHistory {
  private baseline = '';
  private lastChange = 0;
  private nextId = 1;
  private readonly undoSteps = signal<HistoryStep[]>([]);
  private readonly redoSteps = signal<HistoryStep[]>([]);

  readonly canUndo: Signal<boolean> = computed(() => this.undoSteps().length > 0);
  readonly canRedo: Signal<boolean> = computed(() => this.redoSteps().length > 0);
  // what undo and redo would take back or bring back, undefined when the change had no label
  readonly undoLabel: Signal<string | undefined> = computed(() => this.undoSteps().at(-1)?.label);
  readonly redoLabel: Signal<string | undefined> = computed(() => this.redoSteps().at(-1)?.label);
  // the step undo would take back: an action can tell whether it is still the last change (the chat's undo of it)
  readonly lastStepId: Signal<number | undefined> = computed(() => this.undoSteps().at(-1)?.id);

  constructor(private readonly now: () => number = Date.now) {}

  // a character is opened: its history starts empty
  // the whole history, to hand over to another holder of the same character (the open sheet takes over the history of a
  // companion it opens, see CharacterRegistry), and to take over from one
  state(): HistoryState {
    return {baseline: this.baseline, lastChange: this.lastChange, nextId: this.nextId, undo: this.undoSteps(), redo: this.redoSteps()};
  }
  load(state: HistoryState): void {
    this.baseline = state.baseline;
    this.lastChange = state.lastChange;
    this.nextId = state.nextId;
    this.undoSteps.set([...state.undo]);
    this.redoSteps.set([...state.redo]);
  }

  // the character as it is now is where the next change starts from, with no step for what changed (see sync)
  rebase(character: Character): void {
    this.baseline = JSON.stringify(character);
  }

  reset(character: Character): void {
    this.baseline = JSON.stringify(character);
    this.lastChange = 0;
    this.undoSteps.set([]);
    this.redoSteps.set([]);
  }

  // the character changed (to character): what it was becomes a step. a change that changes nothing is no step.
  // sameStep puts the change in the last step (the second save of one action, a spell cast that spends a slot and
  // then puts the spell's effect on the character). whether the character changed
  record(character: Character, label?: string, sameStep = false): boolean {
    const after = JSON.stringify(character);
    if (after === this.baseline) return false;
    const at = this.now();
    const steps = this.undoSteps();
    const last = steps.at(-1);
    const merge = last && (sameStep || (!label && !last.label && at - this.lastChange < MERGE_WITHIN_MS));
    if (!merge) this.undoSteps.set([...steps, {id: this.nextId++, label, character: this.baseline, at}].slice(-MAX_STEPS));
    this.redoSteps.set([]);
    this.baseline = after;
    this.lastChange = at;
    return true;
  }

  // the character before the last change, undefined when there is nothing to undo. current is the character now
  undo(current: Character): Character | undefined {
    return this.move(this.undoSteps, this.redoSteps, current);
  }

  // the character after the last change undone, undefined when there is nothing to redo
  redo(current: Character): Character | undefined {
    return this.move(this.redoSteps, this.undoSteps, current);
  }

  private move(from: typeof this.undoSteps, to: typeof this.undoSteps, current: Character): Character | undefined {
    const step = from().at(-1);
    if (!step) return undefined;
    from.set(from().slice(0, -1));
    to.set([...to(), {id: step.id, label: step.label, character: JSON.stringify(current), at: this.now()}]);
    this.baseline = step.character;
    // the next change starts a step of its own
    this.lastChange = 0;
    return JSON.parse(step.character);
  }
}
