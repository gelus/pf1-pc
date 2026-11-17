import {Feature} from '../interfaces/character.interface';
import {Character} from './character.class';
import {traitsAllowed, traitsUsed} from './background.util';

describe('background', () => {
  it('allows two traits, one more per drawback and the bonus traits', () => {
    const char = new Character();
    expect(traitsAllowed(char)).toBe(2);
    char.drawbacks.push(new Feature({name: 'Paranoid'}));
    expect(traitsAllowed(char)).toBe(3);
    char.bonusTraits = 2;
    expect(traitsAllowed(char)).toBe(5);
  });

  it('counts the traits taken', () => {
    const char = new Character();
    char.traits.push(new Feature({name: 'Reactionary'}), new Feature({name: 'Magical Lineage'}));
    expect(traitsUsed(char)).toBe(2);
  });

  it('copes with characters saved before traits', () => {
    const char = new Character() as any;
    delete char.traits;
    delete char.drawbacks;
    delete char.bonusTraits;
    expect(traitsAllowed(char)).toBe(2);
    expect(traitsUsed(char)).toBe(0);
  });
});
