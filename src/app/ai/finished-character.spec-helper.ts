import {ApplyCharacterService} from '../apply-character.service';
import {skillRankBudget} from '../characterPipes/remaining-ranks.pipe';
import {Feature} from '../interfaces/character.interface';
import {availableFeats} from '../rules/class-progression';
import {createItem} from './builders';
import {setAbilityScores, setCharacterDetails, setRace} from './creation';
import {addClassLevel} from './level-up';

// a character with everything the app's check of a created character asks for: a dwarf fighter with its ranks and
// feats spent and a kit bought. specs that end a creation start from it
export const finishCharacter = (service: ApplyCharacterService): void => {
  setAbilityScores(service, {scores: '{"str": 16, "dex": 12, "con": 14, "int": 10, "wis": 12, "cha": 8}', method: 'rolled'});
  setRace(service, {name: 'Dwarf', based_on: 'own knowledge', features: JSON.stringify([
    {name: 'Dwarf racial stats', adjustments: {'abilityScores.con': 2, 'abilityScores.wis': 2, 'abilityScores.cha': -2,
      'speed.land': {value: 20, mode: 'set'}, size: {value: 4, mode: 'set'}, languages: 'Common, Dwarven'}},
  ])});
  if (!(service.raw().classLevels || []).length) addClassLevel(service, {class_name: 'Fighter', features: 'none', favored_class_bonus: 'hp'});
  else service.raw().classLevels[0].favoredClassBonus = 'hp';
  setCharacterDetails(service, {name: 'Thora', alignment: 'lawful neutral', favored_classes: 'Fighter'});
  const ranks = skillRankBudget(service.applied());
  const skills = ['climb', 'intimidate', 'perception', 'swim', 'ride', 'survival'].slice(0, ranks.available - ranks.spent);
  service.update({
    skills: Object.fromEntries(Object.entries(service.raw().skills).map(([name, skill]) =>
      [name, {...skill, ranks: skills.includes(name) ? 1 : skill.ranks}])) as any,
    feats: Array.from({length: availableFeats(service.applied())}, (_, i) =>
      new Feature({name: `Feat ${i + 1}`, adjustments: {init: 1} as Feature['adjustments']})),
  });
  createItem(service, {name: 'Longsword', type: 'weapon', handedness: 'one-handed', cost_gp: 15, based_on: 'own knowledge', features: '[]', damage: '1d8', critical: '19-20/x2', proficiency: 'martial'});
  createItem(service, {name: 'Explorer\'s outfit', type: 'other', cost_gp: 0, based_on: 'own knowledge', features: '[]'});
};
