import {TestBed} from '@angular/core/testing';
import {ApplyCharacterService} from '../apply-character.service';
import {LibraryEntry, classLevelsOf} from './library-entry';
import {libraryFile} from './library-index';
import {Character} from '../utils/character.class';
import {Attack} from '../utils/attack.class';
import {Feature} from '../interfaces/character.interface';

// the library's rogue as a character has it: sneak attack's dice by its table, on its attacks while it is switched on
describe('the library\'s class features with an amount', () => {
  let service: ApplyCharacterService;
  const load = async (id: string) => (await (await fetch(libraryFile(id))).json()) as LibraryEntry & {kind: 'class'};
  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ApplyCharacterService);
  });

  it('gives a 5th-level rogue 3d6 of sneak attack on its attacks while it is on', async () => {
    const rogue = await load('class/rogue');
    const char = new Character();
    char.classLevels = classLevelsOf(rogue, 5).levels;
    char.feats.push(new Feature({name: 'Weapons', adjustments: {melee: [Object.assign(new Attack(), {name: 'Rapier', damage: '1d6', toHitAbility: 'str', damageAbility: 'str'})]}}));
    service.initializeCharacter(char);
    expect(service.applied().amounts['sneak attack']).toBe(3);
    const entry = service.applied().specialAttack.find(f => f.name === 'Sneak Attack')!;
    expect(entry.active).toBeFalse();
    service.setFeatureActive(entry, true);
    expect((service.applied().melee[0] as any).result.damage.expression).toBe('1d6 +3d6');
  });

  it('gives a cleric its channel energy dice and a paladin its lay on hands dice', async () => {
    for (const [id, levels, path, amount] of [['class/cleric', 7, 'channel energy', 4], ['class/paladin', 7, 'lay on hands', 3]] as const) {
      const char = new Character();
      char.classLevels = classLevelsOf(await load(id), levels).levels;
      service.initializeCharacter(char);
      expect(service.applied().amounts[path]).withContext(id).toBe(amount);
    }
  });

  it('gives a 9th-level fighter weapon training by the groups its levels picked', async () => {
    const char = new Character();
    char.classLevels = classLevelsOf(await load('class/fighter'), 9).levels;
    char.classLevels[4].picks = {'Weapon Training': {pick: 'heavy blades'}};
    char.classLevels[8].picks = {'Weapon Training': {pick: 'bows'}};
    char.feats.push(new Feature({name: 'Weapons', adjustments: {
      melee: [Object.assign(new Attack(), {name: 'Longsword', weapon: 'longsword', groups: ['heavy blades'], damage: '1d8', toHitAbility: 'str', damageAbility: 'str'})],
      ranged: [Object.assign(new Attack(), {name: 'Longbow', weapon: 'longbow', groups: ['bows'], damage: '1d8', toHitAbility: 'dex', range: 100})],
    }}));
    service.initializeCharacter(char);
    const part = (attack: any) => attack.result.toHit.parts.find((p: any) => p.origin === 'Weapon Training')?.value;
    expect(part(service.applied().melee[0])).toBe(2);
    expect(part(service.applied().ranged[0])).toBe(1);
  });
});
