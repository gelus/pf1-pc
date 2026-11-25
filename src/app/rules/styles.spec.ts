import { TestBed } from '@angular/core/testing';

import { ApplyCharacterService } from '../apply-character.service';
import { Feature } from '../interfaces/character.interface';
import { Character } from '../utils/character.class';

// style feats (Ultimate Combat): a stance the player enters and leaves, one at a time unless a feature allows more
// (stylesAtOnce), what holds always kept while out of it ("always"), and a feat that builds on a style gated by it ("if")
describe('styles', () => {
  let service: ApplyCharacterService;
  const apply = (char: Character) => { service.initializeCharacter(char); return service.applied(); };
  const snake = () => new Feature({id: 'snake', name: 'Snake Style', style: true, active: false,
    adjustments: {'skills.sense motive.value': {value: 2, always: true}, ac: {value: 1, type: 'dodge'}} as any});
  const crane = () => new Feature({id: 'crane', name: 'Crane Style', style: true, active: false,
    adjustments: {'ac[fighting defensively]': {value: 1, type: 'dodge'}} as any});
  const tiger = () => new Feature({id: 'tiger', name: 'Tiger Style', style: true, active: false,
    adjustments: {'cmd[trip]': 2} as any});
  const wing = () => new Feature({id: 'wing', name: 'Snake Fang', adjustments: {init: {value: 2, if: 'Snake Style'}} as any});
  const character = (...feats: Feature[]): Character => Object.assign(new Character(), {feats});
  const senseMotive = (char: Character) => (char.skills as any)['sense motive'].value;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ApplyCharacterService);
  });

  it('gives what holds always while out of the stance, and the rest only in it', () => {
    const out = apply(character(snake(), wing()));
    expect(senseMotive(out)).toBe(2);
    expect(out.ac).toBe(new Character().ac);
    expect(Number(out.init)).toBe(Number(new Character().init));
    service.setFeatureActive(service.raw().feats[0], true);
    const into = service.applied();
    expect(senseMotive(into)).toBe(2);
    expect(Number(into.ac)).toBe(Number(new Character().ac) + 1);
    expect(Number(into.init)).toBe(Number(new Character().init) + 2);
  });

  it('is in one style at a time: entering one leaves the other', () => {
    apply(character(snake(), crane()));
    service.setFeatureActive(service.raw().feats[0], true);
    service.setFeatureActive(service.raw().feats[1], true);
    expect(service.raw().feats.map(f => f.active)).toEqual([false, true]);
  });

  it('gates a bonus on a combat option in use, never on the feat of its name', () => {
    const craneStyle = new Feature({id: 'crane', name: 'Crane Style', style: true, active: true, adjustments: {
      ac: {value: 1, type: 'dodge', ifAny: ['Fighting Defensively', 'Total Defense']},
      attackRollBonus: {value: 2, if: 'Fighting Defensively', always: true}} as any});
    const intense = new Feature({name: 'Intense Blows', adjustments: {cmd: {value: 1, if: 'Power Attack'}} as any});
    const powerAttack = new Feature({name: 'Power Attack', adjustments: {'availableCombatOptions.powerAttack': true} as any});
    const using = (options: object) => {
      const char = character(craneStyle, intense, powerAttack);
      return apply(Object.assign(char, {combatOptions: {...char.combatOptions, ...options}}));
    };
    const off = using({});
    const on = using({fightingDefensively: true});
    // fighting defensively's +2 dodge and Crane Style's +1, and its -4 made -2
    expect(Number(on.ac) - Number(off.ac)).toBe(3);
    expect(Number(on.attackRollBonus) - Number(off.attackRollBonus)).toBe(-2);
    expect(Number(using({powerAttack: true}).cmd)).toBe(Number(off.cmd) + 1);
  });

  it('keeps as many styles as stylesAtOnce allows, leaving the ones past it', () => {
    const fuse = new Feature({name: 'Fuse Style', adjustments: {stylesAtOnce: 1} as any});
    apply(character(snake(), crane(), tiger(), fuse));
    expect(service.applied().stylesAtOnce).toBe(2);
    for (const i of [0, 1, 2]) service.setFeatureActive(service.raw().feats[i], true);
    expect(service.raw().feats.slice(0, 3).map(f => f.active)).toEqual([true, false, true]);
  });
});
