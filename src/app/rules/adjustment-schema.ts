import {adjustmentModes, combatOptionLabels, energyTypes} from '../interfaces/character.interface';
import {Character} from '../utils/character.class';
import {MeleeAttack} from '../utils/attack.class';
import {KNOWLEDGE_SPECIALTIES, OPEN_SKILL_FAMILIES, SKILL_FAMILIES} from '../utils/skilllist.class';
import {getByPath, isCalculatedString, levelReference, parseFormula} from '../utils/object.util';

// what the adjustments of a feature can adjust and the values they can take, for checking adjustments written by
// someone else (an AI, an import) before the engine applies them: the engine itself skips what it can not use without
// a word, a typo in a path just leaves the sheet as it was. validateAdjustments says what is wrong and how to fix it,
// adjustmentReference (adjustment-reference.ts) writes all of it down for whoever writes adjustments
//
// the paths are those of the Character (utils/character.class.ts): the documentation of each field below is checked
// against it by a spec, so a field added to the character without being documented here fails the tests

export const abilities = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
export const spellSchools = [
  'abjuration', 'conjuration', 'divination', 'enchantment', 'evocation', 'illusion', 'necromancy', 'transmutation',
  'universal',
] as const;

// the bonus types of the core rulebook (chapter 8 and the glossary), and what each one is for. bonuses of one type do
// not stack, see bonusStackingKey. natural is what the engine calls natural armor, both are dropped from touch ac
export const bonusTypes: {[type: string]: string} = {
  alchemical: 'from alchemical items (antitoxin, ...)',
  armor: 'from armor and armor spells (mage armor), dropped from touch ac',
  circumstance: 'from the situation, stacks with circumstance bonuses of other features',
  competence: 'from skill or training items and spells (guidance, ...)',
  deflection: 'to ac, from rings of protection, shield of faith, ...',
  dodge: 'stacks with every other dodge bonus, dropped from flat-footed ac',
  enhancement: 'improves what is there: weapon and armor enhancement, bull\'s strength, ...',
  inherent: 'to ability scores, from wishes and manuals',
  insight: 'from foreknowledge (true strike, ...)',
  luck: 'from good fortune (luckstone, divine favor, ...)',
  morale: 'from hope and courage: rage, heroism, bless',
  natural: 'natural armor to ac (barkskin, amulet of natural armor enhances it), dropped from touch ac',
  'natural armor': 'the same as natural',
  profane: 'from evil powers (unholy aura, ...)',
  racial: 'from the race of the character',
  resistance: 'to saves, from cloaks of resistance, resistance, ...',
  sacred: 'from good powers (holy aura, ...)',
  shield: 'from shields and the shield spell, dropped from touch ac',
  size: 'from the size of the character (the size rule gives these, see rules/size.rule.ts)',
  trait: 'from character traits',
  cover: 'to ac from cover',
  dex: 'marks an adjustment of ac as part of the dex bonus: dropped from flat-footed ac while it is a bonus',
  dexterity: 'the same as dex',
};

// values that are not numbers but mean something to the engine
export const specialValues: {[value: string]: string} = {
  half: 'on a speed (speed.land, ...): halves it once everything else has adjusted it, rounded down to 5 ft.',
  reduced: 'on a speed: the reduced speed of medium armor and loads (30 ft. becomes 20 ft.), worked out last',
  'auto-fail': 'on a check, usually with a variant (skills.perception.value[sight]): the check fails',
};

// how a field of the character can be adjusted
//  number    a number, a formula or {value, type, mode}
//  boolean   true or false, an adjustment turns it on
//  text      a string added after what is there, with a space
//  list      a string, or several of them, added to the list
//  features  a feature ({name, description, adjustments}) or several, added to that list of the character
//  attacks   an attack (see utils/attack.class.ts) or several, added to the attacks of the character
//  casters   spell casters by origin ({Cleric: {casterLevel, spells: [...]}}), merged into those of the character
//  group     an object, its fields are adjusted (abilityScores.str, not abilityScores)
//  derived   worked out by the engine, adjusting it does nothing: the description says what to adjust instead
//  state     what the player keeps track of (experience, damage taken, ...), a feature should not adjust it
export type FieldKind = 'number' | 'boolean' | 'text' | 'list' | 'features' | 'attacks' | 'casters' | 'group'
  | 'derived' | 'state';

export interface FieldDoc {
  kind: FieldKind;
  description: string;
  example?: string;
}

// every field of the character, by its path from the character. the fields of a group are documented as
// group.field, a group whose keys are open (any skill, any caster origin, ...) as group.<key>
export const characterFields: {[path: string]: FieldDoc} = {
  id: {kind: 'state', description: 'the id of the character'},
  name: {kind: 'state', description: 'the name of the character'},
  age: {kind: 'state', description: 'in years'},
  height: {kind: 'state', description: 'in inches'},
  weight: {kind: 'state', description: 'in pounds, of the character itself'},
  description: {kind: 'state', description: 'free text about the character'},
  alignment: {kind: 'state', description: 'LG, NG, CG, LN, N, CN, LE, NE or CE'},
  deity: {kind: 'state', description: 'the deity the character worships'},
  classLevels: {kind: 'state', description: 'one entry per character level, its class and the features it gives'},
  race: {kind: 'state', description: 'the race: name, subtype, its features (race.features) and quadruped'},
  favoredClasses: {kind: 'state', description: 'the classes whose levels give the favored class bonus'},
  experience: {kind: 'state', description: 'experience points'},
  advancementTrack: {kind: 'state', description: 'slow, medium or fast'},
  creation: {kind: 'state', description: 'where creating the character with the AI is, and what the player decided'},
  inventory: {kind: 'state', description: 'the items of the character, an equipped item applies its features'},
  wealth: {kind: 'state', description: 'the coins of the character (pp, gp, sp, cp)'},
  combatOptions: {kind: 'state', description: 'the combat options the player turned on, a feature makes one available with availableCombatOptions'},
  damageTaken: {kind: 'state', description: 'the lethal damage taken, healing takes it off'},
  currentTempHp: {kind: 'state', description: 'the temporary hit points left'},
  nonlethalDamage: {kind: 'state', description: 'the nonlethal damage taken'},
  stable: {kind: 'state', description: 'a dying character that was stabilized'},
  abilityDamage: {kind: 'state', description: 'damage to ability scores by ability (abilityDamage.str), heals with rest. a feature dealing ability damage is applied by the player'},
  abilityDrain: {kind: 'state', description: 'drain of ability scores by ability, does not heal with rest'},
  carriedWeight: {kind: 'derived', description: 'worked out from the inventory, adjust the weight of the items instead'},
  carryingCapacity: {kind: 'derived', description: 'worked out from strength and size, adjust carryingCapacityStrBonus instead'},
  load: {kind: 'derived', description: 'worked out from the carried weight and the carrying capacity'},
  currentHp: {kind: 'derived', description: 'the max hp less the damage taken, adjust hp instead'},
  languagesAllowed: {kind: 'derived', description: 'worked out from Int and Linguistics ranks, add to languages instead'},

  init: {kind: 'number', description: 'initiative, on top of the Dex modifier the sheet adds', example: '"init": 4 (Improved Initiative)'},
  size: {kind: 'number', description: 'an index into the sizes: 0 Fine, 1 Diminutive, 2 Tiny, 3 Small, 4 Medium, 5 Large, 6 Huge, 7 Gargantuan, 8 Colossal. a race sets it, growing adds to it', example: '"size": {"value": 3, "mode": "set"} (a small race), "size": 1 (enlarge person)'},
  senses: {kind: 'text', description: 'the senses of the character', example: '"senses": "darkvision 60 ft."'},
  ac: {kind: 'number', description: 'armor class, on top of the base 10 and Dex. the bonus type decides what touch and flat-footed ac keep', example: '"ac": {"value": 2, "type": "deflection"}'},
  touchAc: {kind: 'number', description: 'touch ac only, ac adjusts it already (except armor, shield and natural)'},
  flatFootedAc: {kind: 'number', description: 'flat-footed ac only, ac adjusts it already (except dodge and the dex bonus)'},
  hp: {kind: 'number', description: 'max hit points, on top of hit dice and Con', example: '"hp": "max(3, {level})" (toughness)'},
  tempHp: {kind: 'number', description: 'temporary hit points the feature gives'},
  saves: {kind: 'group', description: 'saving throws'},
  'saves.fort': {kind: 'number', description: 'fortitude save', example: '"saves.fort": {"value": 1, "type": "resistance"}'},
  'saves.ref': {kind: 'number', description: 'reflex save'},
  'saves.will': {kind: 'number', description: 'will save'},
  'saves.conditional': {kind: 'text', description: 'a note on saves that only apply sometimes', example: '"saves.conditional": "+2 vs. poison"'},
  defensiveAbilities: {kind: 'features', description: 'defensive abilities shown on the sheet (evasion, uncanny dodge, ...)'},
  immune: {kind: 'text', description: 'immunities as free text, from before immunities. use immunities'},
  immunities: {kind: 'list', description: 'what the character is immune to', example: '"immunities": ["fear", "poison"]'},
  speed: {kind: 'group', description: 'speeds in feet'},
  'speed.land': {kind: 'number', description: 'land speed, half or reduced slow it down', example: '"speed.land": {"value": 30, "mode": "set"} (race), "speed.land": 10 (fast movement), "speed.land": "half"'},
  'speed.swim': {kind: 'number', description: 'swim speed'},
  'speed.fly': {kind: 'number', description: 'fly speed'},
  melee: {kind: 'attacks', description: 'melee attacks given by the feature, or with melee.*.<field> a field of every melee attack', example: '"melee.*.toHitBonus": 1, "melee": {"name": "Bite", "type": "natural", "damage": "1d6", "toHitAbility": "str", "damageAbility": "str"}'},
  ranged: {kind: 'attacks', description: 'ranged attacks, or with ranged.*.<field> a field of every ranged attack'},
  specialAttack: {kind: 'features', description: 'special attacks shown on the sheet (sneak attack, rage, ...)', example: '"specialAttack": {"name": "Sneak Attack", "description": "+1d6 damage"}'},
  spellLikeAbilities: {kind: 'casters', description: 'spell-like abilities by origin, like spells'},
  spells: {kind: 'casters', description: 'spell casters by origin (the class name): caster level, concentration, spell levels', example: '"spells.Cleric.casterLevel": 1, "spells.Cleric.spells.1.perDay.total": 1'},
  abilityScores: {kind: 'group', description: 'the ability scores: str, dex, con, int, wis, cha', example: '"abilityScores.str": {"value": 4, "type": "enhancement"}'},
  bab: {kind: 'number', description: 'base attack bonus, the class levels give it already'},
  cmb: {kind: 'number', description: 'combat maneuver bonus, on top of bab, Str and size'},
  cmd: {kind: 'number', description: 'combat maneuver defense, on top of 10, bab, Str, Dex and size'},
  attackRollBonus: {kind: 'number', description: 'every attack roll', example: '"attackRollBonus": {"value": 1, "type": "morale"} (bless)'},
  meleeAttackRollBonus: {kind: 'number', description: 'every melee attack roll'},
  rangedAttackRollBonus: {kind: 'number', description: 'every ranged attack roll'},
  savingThrowBonus: {kind: 'number', description: 'every saving throw'},
  skillCheckBonus: {kind: 'number', description: 'every skill check'},
  abilityCheckBonus: {kind: 'number', description: 'every ability check'},
  feats: {kind: 'features', description: 'feats the feature gives (a fighter bonus feat, ...)'},
  conditions: {kind: 'features', description: 'conditions the feature puts the character under, a condition named like one of the conditions of the app takes its template', example: '"conditions": {"name": "Fatigued"}'},
  skills: {kind: 'group', description: 'the skills by name in lower case (skills.acrobatics, skills.sense motive), skills.* is every skill and skills.@dex every Dex skill. families keep their skills in subSkills: skills.knowledge.subSkills.arcana, skills.craft.subSkills.<anything>'},
  languages: {kind: 'list', description: 'languages the character knows', example: '"languages": ["orc"]'},
  specialQuality: {kind: 'features', description: 'special qualities shown on the sheet'},
  maxDexBonus: {kind: 'number', description: 'the highest Dex bonus to ac, nothing caps it unless something adjusts it. armor caps it with min', example: '"maxDexBonus": {"value": 3, "mode": "min"}'},
  armorCheckPenalty: {kind: 'number', description: 'the armor check penalty, a negative number. armor training lessens it with a positive one', example: '"armorCheckPenalty": -4'},
  arcaneSpellFailureChance: {kind: 'number', description: 'arcane spell failure in percent', example: '"arcaneSpellFailureChance": 20'},
  spellFailureChance: {kind: 'number', description: 'spell failure in percent for every spell (deafened gives it as spellFailureChance[verbal])'},
  spellSchoolDcBonus: {kind: 'group', description: 'added to the save DC of the spells of a school, spellSchoolDcBonus.<school>', example: '"spellSchoolDcBonus.evocation": 1 (spell focus)'},
  denyDexBonus: {kind: 'group', description: 'the character loses its Dex bonus to ac or cmd: denyDexBonus.ac, denyDexBonus.cmd'},
  speedUnslowedByArmorAndLoad: {kind: 'boolean', description: 'medium and heavy armor and loads do not reduce the speed', example: '"speedUnslowedByArmorAndLoad": true (dwarf)'},
  carryingCapacityStrBonus: {kind: 'number', description: 'added to Str for carrying capacity only', example: '"carryingCapacityStrBonus": 8 (muleback cords)'},
  bonusFeats: {kind: 'number', description: 'feats on top of one per odd level', example: '"bonusFeats": 1 (human)'},
  bonusSkillRanks: {kind: 'number', description: 'skill ranks on top of those of the class levels', example: '"bonusSkillRanks": "{level}" (human, Skilled)'},
  proficiencies: {kind: 'group', description: 'proficiencies.weapons (names, or simple and martial) and proficiencies.armor (light, medium, heavy, shield, tower shield)'},
  traits: {kind: 'features', description: 'character traits'},
  drawbacks: {kind: 'features', description: 'drawbacks, each one allows a trait more'},
  bonusTraits: {kind: 'number', description: 'traits on top of the two every character gets'},
  damageReduction: {kind: 'group', description: 'damage reduction by what overcomes it: damageReduction.<bypass>, "-" when nothing does. the best one of each bypass applies', example: '"damageReduction.-": 1 (DR 1/—), "damageReduction.magic": 5'},
  energyResistance: {kind: 'group', description: 'energy resistance: energyResistance.<energy>, the best one applies', example: '"energyResistance.fire": 10'},
  spellResistance: {kind: 'number', description: 'spell resistance, the best one applies'},
  concealment: {kind: 'number', description: 'the miss chance of attacks against the character in percent, the best one applies'},
  availableCombatOptions: {kind: 'group', description: 'combat options the feature makes available: availableCombatOptions.<option>: true', example: '"availableCombatOptions.powerAttack": true'},
  twoWeaponFighting: {kind: 'group', description: 'what lessens the penalties of two-weapon fighting', example: '"twoWeaponFighting.primaryPenaltyReduction": 2, "twoWeaponFighting.offHandPenaltyReduction": 6'},
};

// the fields of groups that are not obvious from their name
export const groupFieldDocs: {[path: string]: FieldDoc} = {
  'skills.<skill>.value': {kind: 'number', description: 'a bonus to the skill, on top of ranks, ability and class skill', example: '"skills.stealth.value": {"value": 4, "type": "racial"}'},
  'skills.<skill>.ranks': {kind: 'number', description: 'ranks the feature puts in the skill'},
  'skills.<skill>.classSkill': {kind: 'boolean', description: 'makes it a class skill', example: '"skills.perception.classSkill": true'},
  'denyDexBonus.ac': {kind: 'boolean', description: 'no Dex bonus to ac'},
  'denyDexBonus.cmd': {kind: 'boolean', description: 'no Dex bonus to cmd'},
  'proficiencies.weapons': {kind: 'list', description: 'weapon proficiencies'},
  'proficiencies.armor': {kind: 'list', description: 'armor proficiencies'},
};

// groups whose keys are open: any key the description allows, each holding a value of that kind
export const openGroups: {[path: string]: {keys: readonly string[] | string, kind: FieldKind}} = {
  damageReduction: {keys: 'what overcomes it: -, magic, cold iron, silver, adamantine, good, evil, lawful, chaotic, bludgeoning, piercing, slashing, or combinations like "cold iron or silver" (no dots)', kind: 'number'},
  energyResistance: {keys: energyTypes, kind: 'number'},
  abilityDamage: {keys: abilities, kind: 'number'},
  abilityDrain: {keys: abilities, kind: 'number'},
  spellSchoolDcBonus: {keys: spellSchools, kind: 'number'},
  availableCombatOptions: {keys: Object.keys(combatOptionLabels), kind: 'boolean'},
};

// the fields an adjustment given as an object can have
export const adjustmentObjectFields: {[field: string]: string} = {
  value: 'the number, formula or special value',
  type: 'the bonus type, see the bonus types',
  mode: 'add (the default), set, min or max, see the modes',
  if: 'the name (or names) of features that must be active for it to apply',
  unless: 'the name (or names) of features that keep it from applying while active',
};

export const featureFields = ['id', 'name', 'description', 'adjustments', 'active', 'charges', 'source', 'reason'];
const attackFields = Object.keys(new MeleeAttack());
const casterFields = [
  'name', 'ability', 'casterLevel', 'concentration', 'spells', 'dcBonus', 'casting', 'arcane', 'classTable',
  'classLevel', 'domainSlots', 'specialistSchool', 'ignoreArmorSpellFailure', 'domains', 'school', 'oppositionSchools',
  'maxSpellLevel', 'arcaneSpellFailure',
];
const casterNumberFields = ['casterLevel', 'concentration', 'dcBonus', 'classLevel', 'maxSpellLevel', 'arcaneSpellFailure'];
const spellLevelNumberPaths = ['perDay.total', 'perDay.current', 'used', 'extraUsed', 'base', 'bonus', 'known', 'dc'];

export type Severity = 'error' | 'warning';

// a problem found in some adjustments. path is where it is ("feats[0].adjustments.abilityScore.str"), message what is
// wrong and how to fix it. an error is something the engine skips or gets wrong, a warning something that works but
// probably not as meant
export interface AdjustmentProblem {
  severity: Severity;
  path: string;
  message: string;
}

// the character the paths are checked against: the applied character works best (its skills, casters and attacks
// are all there), a new character when there is none
export interface ValidationOptions {
  reference?: Character;
}

const levenshtein = (a: string, b: string): number => {
  const row = Array.from({length: b.length + 1}, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const current = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = current;
    }
  }
  return row[b.length];
};

// the closest of candidates to what was written, when one is close enough to be what was meant
export const closest = (written: string, candidates: readonly string[]): string | undefined => {
  const lower = written.toLowerCase();
  const exact = candidates.find(c => c.toLowerCase() === lower);
  if (exact) return exact;
  const prefixed = candidates.filter(c => c.toLowerCase().startsWith(lower) || lower.startsWith(c.toLowerCase()));
  if (prefixed.length === 1 && Math.min(lower.length, prefixed[0].length) >= 3) return prefixed[0];
  let best: string | undefined, bestDistance = Infinity;
  for (const candidate of candidates) {
    const distance = levenshtein(lower, candidate.toLowerCase());
    if (distance < bestDistance) [best, bestDistance] = [candidate, distance];
  }
  const allowed = written.length <= 3 ? 1 : Math.max(2, Math.floor(written.length / 3));
  return best !== undefined && bestDistance <= allowed ? best : undefined;
};

const didYouMean = (written: string, candidates: readonly string[], listAll = true): string => {
  const suggestion = closest(written, candidates);
  if (suggestion) return `, did you mean "${suggestion}"?`;
  return listAll && candidates.length <= 40 ? `, it is one of: ${candidates.join(', ')}` : '';
};

// is it what the engine takes as an adjustment given as an object (see isAdjustmentWrapperObject in the service)
const isAdjustmentObject = (val: any): boolean =>
  val !== null && typeof val === 'object' && !Array.isArray(val) && 'value' in val &&
  !('adjustments' in val) && !('damage' in val) && !('casterLevel' in val) && !('spells' in val);

const isPlainObject = (val: any): boolean => val !== null && typeof val === 'object' && !Array.isArray(val);

// where a path leads: the kind of value found there, or why it leads nowhere
type Resolved = {kind: FieldKind, doc?: FieldDoc} | {error: string};

const sampleSkill = {name: '', ranks: 0, value: 0, classSkill: false, baseAbility: ''};

// fields that are not there, which a writer means another path by: the closest name by spelling would mislead
// ("damageRollBonus" is closest to "attackRollBonus", and the damage would be dropped)
const commonMistakes: [RegExp, string][] = [
  [/^damage(Roll)?(Bonus)?$/i, 'damage is a field of the attacks, "melee.*.damageBonus" (every melee attack) or "ranged.*.damageBonus", with a variant for when it applies'],
  [/^(toHit|hit|attack)(Bonus)?$/i, 'every attack is "attackRollBonus", melee or ranged ones only "melee.*.toHitBonus" or "ranged.*.toHitBonus"'],
  [/^initiative$/i, 'initiative is "init"'],
  [/^(darkvision|lowLightVision|vision)$/i, 'senses are text, "senses": "darkvision 60 ft."'],
  [/^(spellDc|dc|saveDc)$/i, 'a school\'s save DC is "spellSchoolDcBonus.<school>"'],
  [/^(bonusFeat|feats?)$/i, 'a bonus feat is "bonusFeats": 1'],
];

// follows a path (without its variant) through the character, the way the engine would
export const resolvePath = (path: string, reference: Character = new Character()): Resolved => {
  const segments = path.split('.');
  const [top, ...rest] = segments;
  const topFields = Object.keys(characterFields);
  if (!top) return {error: 'an empty path'};
  if (top.includes('@')) return {error: '@<ability> selects skills, it only goes right after skills. (skills.@dex.value)'};
  const doc = characterFields[top];
  if (!doc) {
    const meant = commonMistakes.find(([wrong]) => wrong.test(top))?.[1];
    return {error: `the character has no field "${top}"${meant ? `: ${meant}` : didYouMean(top, topFields, false)}`};
  }
  if (doc.kind === 'derived' || doc.kind === 'state') return {kind: doc.kind, doc};
  if (!rest.length) return {kind: doc.kind, doc};

  if (top === 'skills') return resolveSkillPath(rest, reference);
  if (top === 'melee' || top === 'ranged') {
    const [index, field, ...more] = rest;
    if (index !== '*' && !/^\d+$/.test(index)) {
      return {error: `${top}.<index or *>.<field> adjusts its attacks (${top}.*.toHitBonus), "${index}" is not an index`};
    }
    if (!field) return {error: `${top}.${index} is a whole attack, adjust one of its fields (${top}.${index}.toHitBonus)`};
    if (!attackFields.includes(field)) return {error: `an attack has no field "${field}"${didYouMean(field, attackFields)}`};
    if (more.length) return {error: `${top}.${index}.${field} has no fields`};
    const sample = (new MeleeAttack() as any)[field];
    return {kind: typeof sample === 'number' ? 'number' : typeof sample === 'boolean' ? 'boolean' : Array.isArray(sample) ? 'list' : 'text'};
  }
  if (top === 'spells' || top === 'spellLikeAbilities') return resolveCasterPath(top, rest);

  const open = openGroups[top];
  if (open) {
    const [key, ...more] = rest;
    if (Array.isArray(open.keys) && key !== '*' && !open.keys.includes(key)) {
      return {error: `${top} has no "${key}"${didYouMean(key, open.keys as string[])}`};
    }
    if (more.length) return {error: `${top}.${key} has no fields${top === 'damageReduction' ? ', a bypass can not hold a dot' : ''}`};
    return {kind: open.kind, doc: {kind: open.kind, description: doc.description}};
  }

  // a group of fixed fields: abilityScores, saves, speed, denyDexBonus, proficiencies, twoWeaponFighting, race
  let node: any = (new Character() as any)[top];
  const walked = [top];
  for (const segment of rest) {
    if (!isPlainObject(node)) return {error: `${walked.join('.')} has no fields, adjust ${walked.join('.')} itself`};
    if (segment === '*') {
      const keys = Object.keys(node);
      if (!keys.length) return {error: `${walked.join('.')}.* matches nothing`};
      node = node[keys[0]];
    } else if (!(segment in node)) {
      return {error: `${walked.join('.')} has no field "${segment}"${didYouMean(segment, Object.keys(node))}`};
    } else {
      node = node[segment];
    }
    walked.push(segment);
  }
  const fieldDoc = characterFields[walked.join('.')] || groupFieldDocs[walked.join('.')];
  if (fieldDoc) return {kind: fieldDoc.kind, doc: fieldDoc};
  return {kind: kindOfSample(node)};
};

const kindOfSample = (sample: any): FieldKind =>
  typeof sample === 'number' ? 'number'
    : typeof sample === 'boolean' ? 'boolean'
    : typeof sample === 'string' ? 'text'
    : Array.isArray(sample) ? 'list'
    : isPlainObject(sample) ? 'group' : 'number';

const resolveSkillPath = (rest: string[], reference: Character): Resolved => {
  const skills = reference.skills && Object.keys(reference.skills).length ? reference.skills : new Character().skills;
  const skillNames = Object.keys(skills);
  const [skill, ...after] = rest;
  let fieldPath = after;
  if (skill.startsWith('@')) {
    const ability = skill.slice(1).toLowerCase();
    if (!(abilities as readonly string[]).includes(ability)) {
      return {error: `skills.@<ability> takes an ability, "${skill.slice(1)}" is not one${didYouMean(skill.slice(1), abilities)}`};
    }
  } else if (skill !== '*') {
    const family = (SKILL_FAMILIES as readonly string[]).includes(skill.toLowerCase());
    if (!skills[skill] && !family) {
      return {error: `there is no skill "${skill}" (skills go by their name in lower case)${didYouMean(skill, skillNames, false)}`};
    }
    if (skill !== skill.toLowerCase() && !skills[skill]) {
      return {error: `skills go by their name in lower case, "${skill}" is "${skill.toLowerCase()}"`};
    }
    if (after[0] === 'subSkills') {
      if (!family) return {error: `${skill} has no subSkills, only ${SKILL_FAMILIES.join(', ')} do`};
      const sub = after[1];
      if (!sub) return {error: `skills.${skill}.subSkills.<skill>.<field>, which ${skill} skill?`};
      if (skill.toLowerCase() === 'knowledge' && sub !== '*' && !(KNOWLEDGE_SPECIALTIES as readonly string[]).includes(sub.toLowerCase())) {
        return {error: `there is no knowledge "${sub}"${didYouMean(sub, KNOWLEDGE_SPECIALTIES)}`};
      }
      if (!(OPEN_SKILL_FAMILIES as readonly string[]).includes(skill.toLowerCase()) && skill.toLowerCase() !== 'knowledge') {
        return {error: `${skill} has no subSkills`};
      }
      fieldPath = after.slice(2);
    }
  }
  if (!fieldPath.length) {
    return {error: `skills.${rest.join('.')} is a whole skill, adjust a field of it: .value (a bonus), .ranks or .classSkill`};
  }
  const [field, ...more] = fieldPath;
  const skillFields = Object.keys(sampleSkill);
  if (!skillFields.includes(field)) return {error: `a skill has no field "${field}"${didYouMean(field, ['value', 'ranks', 'classSkill'])}`};
  if (more.length) return {error: `${field} of a skill has no fields`};
  const doc = groupFieldDocs[`skills.<skill>.${field}`];
  return doc ? {kind: doc.kind, doc} : {kind: kindOfSample((sampleSkill as any)[field])};
};

const resolveCasterPath = (top: string, rest: string[]): Resolved => {
  const [origin, field, ...more] = rest;
  if (!field) return {kind: 'casters'};
  if (!casterFields.includes(field)) return {error: `a caster has no field "${field}"${didYouMean(field, casterFields)}`};
  if (field === 'spells') {
    const [level, ...levelPath] = more;
    if (level === undefined) return {kind: 'casters'};
    if (level !== '*' && !/^\d$/.test(level)) return {error: `${top}.${origin}.spells.<spell level 0-9>, "${level}" is not a spell level`};
    if (!levelPath.length) return {kind: 'casters'};
    if (!spellLevelNumberPaths.includes(levelPath.join('.'))) {
      return {error: `a spell level has no number "${levelPath.join('.')}"${didYouMean(levelPath.join('.'), spellLevelNumberPaths)}`};
    }
    return {kind: 'number'};
  }
  if (more.length) return {error: `${field} of a caster has no fields`};
  return {kind: casterNumberFields.includes(field) ? 'number' : 'text'};
};

// the problems of one formula: whether it parses, what it references, and whether it divides without rounding
const formulaProblems = (formula: string, path: string, reference: Character): AdjustmentProblem[] => {
  const parsed = parseFormula(formula);
  if (typeof parsed === 'string') return [{severity: 'error', path, message: `the formula "${formula}" can not be worked out: ${parsed}`}];
  const problems: AdjustmentProblem[] = [];
  for (const {path: ref, mod} of parsed.references) {
    if (levelReference(reference, ref) !== undefined) continue;
    if (/^level\./i.test(ref)) continue;
    const resolved = resolvePath(ref, reference);
    if ('error' in resolved) {
      problems.push({severity: 'error', path, message: `the formula "${formula}" references {${ref}}: ${resolved.error}`});
    } else if (resolved.kind !== 'number' && resolved.kind !== 'derived' && resolved.kind !== 'state') {
      problems.push({severity: 'error', path, message: `the formula "${formula}" references {${ref}}, which is not a number`});
    } else if (mod && !/^abilityScores\.[a-z]+$/.test(ref)) {
      problems.push({severity: 'warning', path, message: `{mod:${ref}} takes the ability modifier of a number that is not an ability score, {mod:abilityScores.<ability>} is the modifier of an ability`});
    } else if (typeof getByPath(reference, ref) !== 'number' && resolved.kind === 'number' && !ref.includes('*')) {
      // a number the character does not have yet (maxDexBonus before armor caps it) is NaN in the formula
      problems.push({severity: 'warning', path, message: `{${ref}} has no value on this character yet, the formula is NaN until it has one`});
    }
  }
  if (formula.includes('/') && !/(floor|ceil|round)\s*\(/i.test(formula)) {
    problems.push({severity: 'warning', path, message: `the formula "${formula}" divides without rounding, pathfinder rounds down: floor(...) (ceil(...) for "1 per 2 levels, starting at 1st")`});
  }
  return problems;
};

const numberValueProblems = (value: any, path: string, adjusting: string, reference: Character): AdjustmentProblem[] => {
  if (typeof value === 'number') return Number.isFinite(value) ? [] : [{severity: 'error', path, message: `${value} is not a number the sheet can use`}];
  if (typeof value === 'string') {
    if (value === 'half' || value === 'reduced') {
      return adjusting.startsWith('speed.') ? [] : [{severity: 'error', path, message: `"${value}" only slows a speed (speed.land, ...)`}];
    }
    if (value === 'auto-fail') return [];
    if (isCalculatedString(value) || /[{}()]/.test(value)) return formulaProblems(value, path, reference);
    return [{severity: 'error', path, message: `"${value}" is not a number, a formula or one of ${Object.keys(specialValues).join(', ')}, the engine adds it as text`}];
  }
  return [{severity: 'error', path, message: `${adjusting} takes a number or a formula, not ${describeValue(value)}`}];
};

const describeValue = (value: any): string =>
  value === null ? 'null' : Array.isArray(value) ? 'a list' : typeof value === 'object' ? 'an object' : `${typeof value} ${JSON.stringify(value)}`;

// checks the adjustments of a feature: every path, value, bonus type and mode. where is the path of the adjustments
// themselves, for the messages ("feats[0].adjustments")
export const validateAdjustments = (
  adjustments: any, options: ValidationOptions = {}, where = 'adjustments',
): AdjustmentProblem[] => {
  const reference = options.reference || new Character();
  if (adjustments === undefined) return [];
  if (!isPlainObject(adjustments)) {
    return [{severity: 'error', path: where, message: `adjustments are an object of path: value, not ${describeValue(adjustments)}`}];
  }
  const problems: AdjustmentProblem[] = [];
  for (const [rawKey, rawValue] of Object.entries(adjustments)) {
    const at = `${where}.${rawKey}`;
    const variantMatch = /^(.+?)\[([^\]]*)\]$/.exec(rawKey);
    if (!variantMatch && /[\[\]]/.test(rawKey)) {
      problems.push({severity: 'error', path: at, message: 'a variant goes at the end of the path in square brackets: skills.perception.value[sight]'});
      continue;
    }
    const adjusting = variantMatch ? variantMatch[1] : rawKey;
    const variant = variantMatch?.[2];
    const resolved = resolvePath(adjusting, reference);
    if ('error' in resolved) {
      problems.push({severity: 'error', path: at, message: resolved.error});
      continue;
    }
    if (resolved.kind === 'derived') {
      problems.push({severity: 'error', path: at, message: `${adjusting} is worked out by the engine, adjusting it does nothing: ${resolved.doc?.description}`});
      continue;
    }
    if (resolved.kind === 'state') {
      problems.push({severity: 'warning', path: at, message: `${adjusting} is the player's to keep track of (${resolved.doc?.description}), a feature should not adjust it`});
      continue;
    }
    problems.push(...valueProblems(rawValue, at, adjusting, resolved.kind, variant, options, reference));
  }
  return problems;
};

const valueProblems = (
  rawValue: any, at: string, adjusting: string, kind: FieldKind, variant: string | undefined,
  options: ValidationOptions, reference: Character,
): AdjustmentProblem[] => {
  const problems: AdjustmentProblem[] = [];
  const wrapped = isAdjustmentObject(rawValue);
  const value = wrapped ? rawValue.value : rawValue;

  if (wrapped) {
    for (const field of Object.keys(rawValue)) {
      if (!(field in adjustmentObjectFields)) {
        problems.push({severity: 'error', path: at, message: `an adjustment has no "${field}", the engine ignores it${didYouMean(field, Object.keys(adjustmentObjectFields))}`});
      }
    }
    const {mode, type} = rawValue;
    if (mode !== undefined && !(adjustmentModes as readonly string[]).includes(mode)) {
      problems.push({severity: 'error', path: at, message: `there is no mode "${mode}", the engine adds it instead${didYouMean(String(mode), adjustmentModes)}`});
    }
    if (mode && mode !== 'add' && kind !== 'number') {
      problems.push({severity: 'error', path: at, message: `${mode} only works on numbers, ${adjusting} is not one`});
    }
    if (mode && mode !== 'add' && variant !== undefined) {
      problems.push({severity: 'warning', path: at, message: `an adjustment with a variant ([${variant}]) always adds, its mode ${mode} is ignored`});
    }
    if (type !== undefined && type !== '') {
      if (typeof type !== 'string') {
        problems.push({severity: 'error', path: at, message: `a bonus type is a string, not ${describeValue(type)}`});
      } else if (!(type.trim().toLowerCase() in bonusTypes)) {
        problems.push({severity: 'warning', path: at, message: `"${type}" is not a bonus type, it only stacks with others written the same way${didYouMean(type, Object.keys(bonusTypes), false) || ' (leave it out for an untyped bonus)'}`});
      }
      if (mode && mode !== 'add') {
        problems.push({severity: 'warning', path: at, message: `a bonus type only matters to adjustments that add, ${mode} ignores it`});
      }
    }
    for (const field of ['if', 'unless']) {
      const names = rawValue[field];
      if (names === undefined) continue;
      const list = Array.isArray(names) ? names : [names];
      if (!list.length || list.some(name => typeof name !== 'string' || !name.trim())) {
        problems.push({severity: 'error', path: at, message: `${field} takes the name of a feature or a list of names`});
      }
    }
  } else if (isPlainObject(rawValue) && kind === 'number') {
    problems.push({severity: 'error', path: at, message: `an adjustment given as an object needs a value: {"value": ..., "type": ..., "mode": ...}${'val' in rawValue || 'amount' in rawValue ? ' (it is called value)' : ''}`});
    return problems;
  }

  switch (kind) {
    case 'number':
      problems.push(...numberValueProblems(value, at, adjusting, reference));
      break;
    case 'boolean':
      if (typeof value !== 'boolean') problems.push({severity: 'error', path: at, message: `${adjusting} takes true or false, not ${describeValue(value)}`});
      break;
    case 'text':
      if (typeof value !== 'string') problems.push({severity: 'error', path: at, message: `${adjusting} takes text, not ${describeValue(value)}`});
      break;
    case 'list': {
      const list = Array.isArray(value) ? value : [value];
      if (list.some(item => typeof item !== 'string')) problems.push({severity: 'error', path: at, message: `${adjusting} takes a string or a list of strings`});
      break;
    }
    case 'features': {
      const list = Array.isArray(value) ? value : [value];
      list.forEach((feature, i) =>
        problems.push(...validateFeature(feature, options, Array.isArray(value) ? `${at}[${i}]` : at)));
      break;
    }
    case 'attacks': {
      const list = Array.isArray(value) ? value : [value];
      list.forEach((attack, i) => {
        const attackAt = Array.isArray(value) ? `${at}[${i}]` : at;
        if (!isPlainObject(attack)) {
          problems.push({severity: 'error', path: attackAt, message: `an attack is an object (see utils/attack.class.ts), not ${describeValue(attack)}`});
          return;
        }
        for (const field of Object.keys(attack)) {
          if (!attackFields.includes(field)) problems.push({severity: 'warning', path: attackAt, message: `an attack has no field "${field}"${didYouMean(field, attackFields)}`});
        }
        if (!attack.name) problems.push({severity: 'warning', path: attackAt, message: 'the attack has no name'});
      });
      break;
    }
    case 'casters':
      problems.push(...casterProblems(value, at, adjusting));
      break;
    case 'group':
      problems.push({severity: 'error', path: at, message: `${adjusting} is a group, adjust one of its fields (${adjusting}.<field>), see the reference`});
      break;
  }
  return problems;
};

// spells (casters by origin), spells.<origin> (a caster), spells.<origin>.spells (its spell levels) and
// spells.<origin>.spells.<n> (one spell level)
const casterProblems = (value: any, at: string, adjusting: string): AdjustmentProblem[] => {
  const depth = adjusting.split('.').length;
  if (depth === 3 && !Array.isArray(value)) {
    return [{severity: 'error', path: at, message: `${adjusting} takes a list of spell levels, index 0 for cantrips: [{"perDay": {"total": 3, "current": 3}, "spells": []}]`}];
  }
  if (depth !== 3 && !isPlainObject(value)) {
    const what = depth === 1 ? 'casters by origin: {"Cleric": {"casterLevel": 1, ...}}' : depth === 2 ? 'a caster: {"casterLevel": 1, "ability": "wis", ...}' : 'a spell level: {"perDay": {"total": 1, "current": 1}, "spells": []}';
    return [{severity: 'error', path: at, message: `${adjusting} takes ${what}, not ${describeValue(value)}`}];
  }
  const casters = depth === 1 ? value : depth === 2 ? {[adjusting.split('.')[1]]: value} : {};
  const problems: AdjustmentProblem[] = [];
  for (const [origin, caster] of Object.entries(casters)) {
    if (!isPlainObject(caster)) {
      problems.push({severity: 'error', path: `${at}.${origin}`, message: 'a caster is an object: {casterLevel, ability, spells: [...]}'});
      continue;
    }
    for (const field of Object.keys(caster as object)) {
      if (!casterFields.includes(field)) problems.push({severity: 'warning', path: `${at}.${origin}`, message: `a caster has no field "${field}"${didYouMean(field, casterFields)}`});
    }
  }
  return problems;
};

// checks a feature: its fields and its adjustments
export const validateFeature = (feature: any, options: ValidationOptions = {}, where = 'feature'): AdjustmentProblem[] => {
  if (!isPlainObject(feature)) return [{severity: 'error', path: where, message: `a feature is an object: {name, description, adjustments}, not ${describeValue(feature)}`}];
  const problems: AdjustmentProblem[] = [];
  for (const field of Object.keys(feature)) {
    if (!featureFields.includes(field)) {
      problems.push({severity: 'warning', path: where, message: `a feature has no field "${field}", the engine ignores it${didYouMean(field, featureFields)}`});
    }
  }
  if (!feature.name || typeof feature.name !== 'string') problems.push({severity: 'warning', path: where, message: 'the feature has no name, the tooltips show where a number comes from by it'});
  if (feature.active !== undefined && typeof feature.active !== 'boolean') problems.push({severity: 'error', path: where, message: 'active is true or false'});
  if (feature.charges !== undefined) {
    const {charges} = feature;
    if (!isPlainObject(charges) || typeof charges.total !== 'number' || typeof charges.current !== 'number') {
      problems.push({severity: 'error', path: `${where}.charges`, message: 'charges are {"total": <number>, "current": <number>, "per": "day" | "encounter" | "none"}'});
    } else if (charges.per !== undefined && !['day', 'encounter', 'none'].includes(charges.per)) {
      problems.push({severity: 'error', path: `${where}.charges`, message: `charges are per day, encounter or none, not "${charges.per}"`});
    }
  }
  problems.push(...validateAdjustments(feature.adjustments, options, `${where}.adjustments`));
  return problems;
};

// where a character keeps features, and the path each one is at
const featureLocations = (char: any): {where: string, feature: any}[] => {
  const found: {where: string, feature: any}[] = [];
  const list = (where: string, features: any) => {
    if (Array.isArray(features)) features.forEach((feature, i) => found.push({where: `${where}[${i}]`, feature}));
  };
  (Array.isArray(char.classLevels) ? char.classLevels : []).forEach((level: any, i: number) => list(`classLevels[${i}].features`, level?.features));
  list('race.features', char.race?.features);
  for (const key of ['feats', 'traits', 'drawbacks', 'conditions', 'specialAttack', 'defensiveAbilities', 'specialQuality']) list(key, char[key]);
  (Array.isArray(char.inventory) ? char.inventory : []).forEach((item: any, i: number) => list(`inventory[${i}].features`, item?.features));
  return found;
};

// checks every feature of a raw character (as saved or imported): its class levels, race, feats, traits, conditions,
// items and the rest. the character itself is the reference, so its own skills and casters are known
export const validateCharacter = (char: any, options: ValidationOptions = {}): AdjustmentProblem[] => {
  if (!isPlainObject(char)) return [{severity: 'error', path: 'character', message: `a character is an object, not ${describeValue(char)}`}];
  const reference = options.reference || Object.assign(new Character(), char);
  return featureLocations(char).flatMap(({where, feature}) => validateFeature(feature, {reference}, where));
};

// the problems as lines of text, errors first
export const formatProblems = (problems: AdjustmentProblem[]): string =>
  [...problems]
    .sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1))
    .map(({severity, path, message}) => `${severity}: ${path}: ${message}`)
    .join('\n');

export const hasErrors = (problems: AdjustmentProblem[]): boolean => problems.some(p => p.severity === 'error');

// the feature lists of the character, for the reference
export const featureListPaths = ['race.features', 'classLevels[n].features', 'feats', 'traits', 'drawbacks', 'conditions', 'specialAttack', 'defensiveAbilities', 'specialQuality', 'inventory[n].features (applies while the item is equipped)'];
