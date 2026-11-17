import { TestBed } from '@angular/core/testing';
import { ApplyCharacterService } from './apply-character.service';
import { Character } from './utils/character.class';
import example from './example-character.json';

// the example character carries test items (unequipped, left behind) and test conditions (inactive) for trying
// the rules out by hand. these specs keep what their descriptions promise true
describe('the example character', () => {
  let service: ApplyCharacterService;

  const apply = (...changes: ((char: any) => void)[]): Character => {
    const char = JSON.parse(JSON.stringify(example));
    changes.forEach(change => change(char));
    service.initializeCharacter(char);
    return service.applied();
  };
  const on = (id: string) => (char: any) => char.conditions.find((c: any) => c.id === id).active = true;
  const equip = (...ids: string[]) => (char: any) =>
    ids.forEach(id => Object.assign(char.inventory.find((i: any) => i.id === id), {equipped: true, carried: true}));
  const withoutAxe = (char: any) => char.inventory.find((i: any) => i.name === 'Great Axe').equipped = false;
  const options = (combatOptions: object) => (char: any) => char.combatOptions = combatOptions;
  const attack = (char: Character, name: string): any => [...char.melee, ...char.ranged].find(a => a.name === name)!.result;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ApplyCharacterService);
  });

  it('is unchanged by its test items and conditions while they are off', () => {
    const char = apply();
    expect([char.ac, char.touchAc, char.flatFootedAc]).toEqual([13, 8, 13]);
    expect(char.melee.map(a => a.name)).toEqual(['Great Axe']);
    expect(char.ranged).toEqual([]);
    expect(attack(char, 'Great Axe').attackBonuses).toEqual([7]);
    expect(attack(char, 'Great Axe').damage.expression).toBe('1d12+9');
    expect(char.load).toBe('light');
  });

  it('powers up the greataxe with power attack', () => {
    const axe = attack(apply(on('test-power-attack-feat'), options({powerAttack: true})), 'Great Axe');
    expect(axe.attackBonuses).toEqual([6]);
    expect(axe.damage.expression).toBe('1d12+12');
  });

  it('enlarges the character', () => {
    const char = apply(on('test-enlarge-person'));
    expect(char.ac).toBe(12);
    expect(attack(char, 'Great Axe').damage.expression).toBe('3d6+10');
  });

  it('gives iterative attacks at bab 11', () => {
    expect(attack(apply(on('test-bab-11')), 'Great Axe').attackBonuses).toEqual([17, 12, 7]);
  });

  it('claws with the hands the weapons leave free: none with the greataxe, one beside a longsword, both bare-handed', () => {
    const axe = attack(apply(on('test-claws-natural-attacks')), 'Claw');
    expect(axe.attackBonuses).toEqual([]);
    expect(axe.notes).toContain('no free hand to make it: Great Axe holds both hands');
    const longsword = attack(apply(equip('test-longsword'), withoutAxe, on('test-claws-natural-attacks')), 'Claw');
    expect(longsword.attackBonuses).toEqual([2]);
    expect(longsword.damage.expression).toBe('1d4+3');
    const bare = attack(apply(withoutAxe, on('test-claws-natural-attacks')), 'Claw');
    expect(bare.attackBonuses).toEqual([7, 7]);
    expect(bare.damage.expression).toBe('1d4+6');
  });

  it('fights with two weapons, better with the feats', () => {
    const twf = apply(equip('test-longsword', 'test-short-sword'), withoutAxe, options({twoWeaponFighting: true}));
    expect(attack(twf, '+1 Longsword').attackBonuses).toEqual([4]);
    expect(attack(twf, 'Short Sword').attackBonuses).toEqual([-1]);
    expect(attack(twf, 'Short Sword').damage.expression).toBe('1d6+3');
    const feats = apply(equip('test-longsword', 'test-short-sword'), withoutAxe, options({twoWeaponFighting: true}),
      on('test-two-weapon-fighting-feat'), on('test-improved-two-weapon-fighting-feat'));
    expect(attack(feats, '+1 Longsword').attackBonuses).toEqual([6]);
    expect(attack(feats, 'Short Sword').attackBonuses).toEqual([5, 0]);
  });

  it('does not stack magic weapon with the longsword enhancement', () => {
    const longsword = attack(apply(equip('test-longsword'), withoutAxe, on('test-magic-weapon')), '+1 Longsword');
    expect(longsword.attackBonuses).toEqual([8]);
    expect(longsword.damage.expression).toBe('1d8+7');
  });

  it('adds a shield bonus that touch ac ignores', () => {
    const char = apply(equip('test-longsword', 'test-heavy-shield'), withoutAxe);
    expect([char.ac, char.touchAc, char.flatFootedAc]).toEqual([15, 8, 15]);
    expect(char.armorCheckPenalty).toBe(-6);
  });

  it('caps the dex bonus and penalizes attacks with a tower shield the barbarian is not proficient with', () => {
    const char = apply(equip('test-longsword', 'test-tower-shield'), withoutAxe);
    expect(char.maxDexBonus).toBe(2);
    expect(char.armorCheckPenalty).toBe(-14);
    // +8, -2 for the tower shield, -10 for its check penalty without proficiency
    expect(attack(char, '+1 Longsword').attackBonuses).toEqual([-4]);
  });

  it('shoots the composite bow with its arrows', () => {
    const bow = attack(apply(equip('test-composite-longbow', 'test-arrows'), withoutAxe), 'Composite Longbow');
    expect(bow.attackBonuses).toEqual([3]);
    expect(bow.damage.expression).toBe('1d8+2');
    expect(bow.ammunition.quantity).toBe(20);
  });

  it('throws the javelin with str to damage', () => {
    const javelin = attack(apply(equip('test-javelin'), withoutAxe), 'Javelin');
    expect(javelin.damage.expression).toBe('1d6+6');
    expect(javelin.range.maxIncrements).toBe(5);
  });

  it('takes -4 with the exotic spiked chain', () => {
    expect(attack(apply(equip('test-spiked-chain'), withoutAxe), 'Spiked Chain').attackBonuses).toEqual([3]);
  });

  it('keeps only the best deflection bonus of the rings', () => {
    expect(apply(equip('test-ring-1', 'test-ring-2')).ac).toBe(15);
  });

  it('stacks the dodge feat with fighting defensively at 3 acrobatics ranks', () => {
    const char = apply(on('test-dodge-feat'), on('test-acrobatics-3-ranks'), options({fightingDefensively: true}));
    expect([char.ac, char.touchAc, char.flatFootedAc]).toEqual([17, 12, 13]);
    expect(attack(char, 'Great Axe').attackBonuses).toEqual([3]);
  });

  it('allows more languages with int 14 and linguistics', () => {
    expect(apply().languagesAllowed).toBe(2);
    expect(apply(on('test-int-14-and-linguistics-2')).languagesAllowed).toBe(6);
  });
});
