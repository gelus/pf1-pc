import { RemainingStartingWealthPipe } from './remaining-starting-wealth.pipe';
import { Character } from '../utils/character.class';
import { ClassLevel } from '../utils/classlevel.class';
import { Item } from '../utils/item.class';

describe('RemainingStartingWealthPipe', () => {
  it('create an instance', () => {
    const pipe = new RemainingStartingWealthPipe();
    expect(pipe).toBeTruthy();
  });

  it('takes the price of every item bought off the starting wealth, once for each of it', () => {
    const char = new Character();
    char.classLevels = [new ClassLevel({startingWealth: 105})];
    char.inventory = [
      Object.assign(new Item(), {name: 'Arrows', cost: {pp: 0, gp: 0, sp: 0, cp: 5}, quantity: 20}),
      Object.assign(new Item(), {name: 'Greataxe', cost: {pp: 0, gp: 20, sp: 0, cp: 0}, quantity: 1}),
    ];
    // 105 gp - 20 x 5 cp - 20 gp
    expect({...new RemainingStartingWealthPipe().transform(char)}).toEqual({pp: 0, gp: 84, sp: 0, cp: 0});
  });

  it('counts an item without a quantity once', () => {
    const char = new Character();
    char.classLevels = [new ClassLevel({startingWealth: 105})];
    const rope = Object.assign(new Item(), {name: 'Rope', cost: {pp: 0, gp: 1, sp: 0, cp: 0}});
    delete (rope as any).quantity;
    char.inventory = [rope];
    expect({...new RemainingStartingWealthPipe().transform(char)}).toEqual({pp: 0, gp: 104, sp: 0, cp: 0});
  });
});
