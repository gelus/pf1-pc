import {sizes} from '../interfaces/character.interface';
import {combatOptionLabels} from '../interfaces/character.interface';
import {CHARGES_PER, Charges, Feature, ShownIn} from '../interfaces/character.interface';
import {parseJsonArg} from './json-arg';
import {casterNumberFields, featureFields, validateAdjustments} from '../rules/adjustment-schema';
import {skillAbilityMap} from '../utils/skilllist.class';
import {SLA_KEYS, spellLikeAbilitiesOf, spellLikeProblems} from './spell-form';

// what the builders hold the AI to when it writes a feature: the rules of a feature become adjustments, so the
// sheet works them out, instead of staying in the description where nothing applies them. a feature that changes no
// number says so (descriptionOnly, with why), the rest is refused. a class feature does not show on the sheet by
// itself: what the player reads and uses goes in an entry it gives (specialAttack, defensiveAbilities,
// specialQuality), and a feature the player turns on and off (studied target, a stance, rage) has its toggle and
// its bonuses on that entry, where the sheet shows the checkbox

// where a feature shows on the sheet, and what goes there
export const DISPLAY_LISTS = ['specialAttack', 'defensiveAbilities', 'specialQuality'] as const;
const DISPLAY_GUIDE = 'specialAttack for what it does in a fight (sneak attack, studied target, smite, rage), '
  + 'defensiveAbilities for what protects it (evasion, uncanny dodge, trap sense), specialQuality for the rest (track, '
  + 'wild empathy, darkvision)';

// adjustments the sheet keeps count of without showing them as a feature: a bonus feat, skill ranks, proficiencies
const BOOKKEEPING = /^(bonusFeats|bonusSkillRanks|proficiencies\.|classSkills|languages|favoredClass)/;

// the paths the rules need most, which the AI gets wrong when it guesses: in the creation instructions and in
// every refusal, so the first try can be right
export const PATHS_GUIDE = 'Paths the rules need most: a bonus feat "bonusFeats": 1; the human\'s Skilled '
  + '"bonusSkillRanks": "{level}"; attack and damage "melee.*.toHitBonus" and "melee.*.damageBonus" ("ranged.*." for '
  + 'bows); with one kind of weapon or a weapon group only (Weapon Focus (longsword), Weapon Training (heavy blades)) '
  + '"melee.@longsword.toHitBonus", "melee.@heavy blades.damageBonus" (and "ranged.@..." when it can be thrown or shot); a feat that is a combat option "availableCombatOptions.powerAttack": true (deadlyAim, combatExpertise); '
  + 'Spell Focus "spellSchoolDcBonus.evocation": 1; "energyResistance.fire": 5; a sense "senses.darkvision": 60 (its range, 0 for low-light vision or scent); '
  + 'fast healing "fastHealing": 2 and regeneration "regeneration": 5 (what stops it in the note); a defense taken away "energyResistance.fire": {"value": 10, "mode": "lower"} (damageReduction, spellResistance too); a doubled threat range "melee.@longsword.threatRangeDoubled": true; '
  + 'a bonus equal to another feature\'s ("your bravery bonus", "half your favored enemy bonus") reads it: "{feature:Bravery}", "floor({feature:Favored Enemy} / 2)", on one of its paths "{feature:Bravery:saves.will[fear]}"; '
  + 'a bonus that builds up (+2 for every 5 damage taken, +1 a kill) a formula of {stacks} ("2 * {stacks}") with the feature\'s "stacks": {"current": 0, "max": 5, "label": "kills"}; '
  + 'saves "saves.will" (every save "savingThrowBonus"), weapon and armor proficiencies "proficiencies.weapons": '
  + '["longsword"], skills "skills.perception.value" (Knowledge "skills.knowledge.subSkills.*.value"), "init", '
  + '"ac", "cmb", "cmd", a faster speed "speed.land": 10, a speed of another kind "speed.climb" (swim, fly, burrow) '
  + '{"value": 20, "mode": "set"} with a fly speed\'s "flyManeuverability": "good"; caster level "spells.<class>.casterLevel" (Magical Knack: '
  + '"spells.sorcerer.casterLevel": 2), every caster "spells.*.casterLevel", concentration "spells.*.concentration". A typed bonus is {"value": 4, "type": "morale"}. A bonus only '
  + 'in a situation is a variant of the path: "saves.fort[poison]", "ranged.*.toHitBonus[within 30 ft.]", caster '
  + 'level checks against spell resistance "spells.*.casterLevel[spell resistance]". Uses a '
  + 'day go on the entry the sheet shows: "charges": {"total": 3, "label": "per day"}; uses a feat adds to another '
  + 'feature "extraUses.channel energy": 2. Spell-like abilities a feature gives (a gnome\'s dancing lights 1/day, a '
  + 'tiefling\'s darkness) go next to its adjustments as "spell_like_abilities": [{"name": "Darkness", "level": 2, '
  + '"uses": 1, "school": "evocation", "components": "V, M/DF", "saving_throw": "none", "description": "..."}], with '
  + '"spell_like_caster_level": "level" for the character\'s level. A class\'s caster level and spells per day come from '
  + 'its levels: never adjust them on its own class features.';

// how a feature's rules become adjustments, for the AI: given with every refusal, so the next try fixes it
export const MECHANICS_GUIDE = [
  'Write every number the rules give as adjustments: an always-on bonus as the path ("saves.will": 1), one that '
    + 'applies only in a situation the sheet can not know of as a variant ("skills.survival.value[follow tracks]"), '
    + 'and one the player turns on (while studying a target, in a stance, raging) on a feature with "active": false, '
    + 'so the sheet shows a checkbox and the bonuses while it is on.',
  'A rule the sheet has no path for (a path it refuses as no field, and none in get_adjustment_reference) is told in '
    + 'the description, with "descriptionOnly" starting "no path:".',
  'A number that grows with level goes in "grows", its value by level as the rules table lists it '
    + '({"<path>": {"1": 1, "5": 2}}): the app writes the formula. Never write one yourself.',
  `A feature is listed on the sheet in the section its "shown_in" names: ${DISPLAY_GUIDE}, specialQuality when left out. `
    + 'One the player switches on keeps its entry instead, the toggle ("active") and the bonuses on it: {"name": "Studied Target", "gained_at": 1, "adjustments": {"specialAttack": {"name": '
    + '"Studied Target", "description": "move action, one creature", "active": false}}, "grows": {"melee.*.toHitBonus": '
    + '{"1": 1, "5": 2, "10": 3, "15": 4, "20": 5}, ... the same for its damage and each skill it names}}.',
  PATHS_GUIDE,
  'Only a feature that changes no number (a proficiency the class already gives, a rule that is judged at the table) '
    + 'is description only: give it "descriptionOnly": "why".',
].join(' ');

const isObject = (value: unknown): value is {[key: string]: unknown} =>
  !!value && typeof value === 'object' && !Array.isArray(value);

// what the engine takes as one adjustment given as an object ({"value": 2, "type": "racial"})
const isValueObject = (value: {[key: string]: unknown}): boolean => 'value' in value;

// the groups the AI writes nested ({"abilityScores": {"con": 2}}) where the engine takes paths ("abilityScores.con")
const NESTED_GROUPS = ['abilityScores', 'saves', 'speed', 'energyResistance', 'spellSchoolDcBonus', 'availableCombatOptions', 'damageReduction'];

const flattened = (adjustments: {[path: string]: unknown}): {[path: string]: unknown} => {
  const flat: {[path: string]: unknown} = {};
  for (const [written, value] of Object.entries(adjustments)) {
    // a key the AI quoted once more inside the JSON ("\"bonusFeats\"")
    const path = written.trim().replace(/^["'](.*)["']$/, '$1');
    if (NESTED_GROUPS.includes(path) && isObject(value) && !isValueObject(value)) {
      for (const [key, inner] of Object.entries(value)) flat[`${path}.${key}`] = inner;
    } else if (path === 'skills' && isObject(value) && !isValueObject(value)) {
      // {"skills": {"intimidate": 2}}: a bonus on each skill
      for (const [key, inner] of Object.entries(value)) flat[`skills.${key.toLowerCase()}${/\.(value|ranks|classSkill)$/.test(key) ? '' : '.value'}`] = inner;
    } else if (isObject(value) && isValueObject(value) && typeof value['type'] === 'string' && /^(untyped|none|no type|)$/i.test(value['type'].trim())) {
      // "untyped" is no bonus type: the plain value is the untyped bonus
      const {type, ...rest} = value;
      flat[path] = Object.keys(rest).length === 1 ? rest['value'] : rest;
    } else if ((DISPLAY_LISTS as readonly string[]).includes(path) && isObject(value)) {
      flat[path] = normalizedFeature(value, true);
    } else {
      flat[path] = value;
    }
  }
  return flat;
};

// a feature as the AI wrote it, in the shape the engine and the checks take: adjustments as an object of flat paths,
// descriptionOnly however it was spelled (the tools' arguments are snake_case, so the AI writes description_only),
// and an entry it gives (specialAttack, ...) inside its adjustments where the AI put it next to them
// a section of the sheet as the AI names it: "defensiveAbilities", "Defensive Abilities", "DA", "SQ", "none"
const SECTION_NAMES: {[said: string]: ShownIn} = {
  specialattack: 'specialAttack', specialattacks: 'specialAttack', sa: 'specialAttack',
  defensiveabilities: 'defensiveAbilities', defensiveability: 'defensiveAbilities', da: 'defensiveAbilities', defensive: 'defensiveAbilities',
  specialquality: 'specialQuality', specialqualities: 'specialQuality', sq: 'specialQuality',
  hidden: 'hidden', none: 'hidden', hide: 'hidden',
};
const sectionOf = (value: unknown): ShownIn | undefined =>
  typeof value === 'string' ? SECTION_NAMES[value.toLowerCase().replace(/[^a-z]/g, '')] : undefined;

// what a feature the AI writes has besides its adjustments: a feature's fields, the form's, and the tools' own
const FEATURE_KEYS = new Set([...featureFields, 'adjustments', 'descriptionOnly', 'description_only', 'descriptiononly', 'description only',
  'gained_at', 'gainedAt', 'grows', 'uses_by_level', 'uses', 'uses_per_day', 'usesPerDay', 'uses_total', 'uses_per', 'uses_label',
  'shown_in', 'shown', 'sheet_section', 'section', 'prerequisites', 'list', 'based_on', 'source_url', 'rulesText', 'can_turn_off', 'style', 'stacks_max', 'stacks_label',
  'spellLikeProblems', ...SLA_KEYS, ...DISPLAY_LISTS]);

// the fields of the form the AI fills from a rules page, see feature-form.ts
const FORM_FIELDS = ['gained_at', 'grows', 'uses_by_level'];

export const normalizedFeature = (given: unknown, nested = false): any => {
  if (!isObject(given)) return given;
  const feature: {[key: string]: unknown} = {...given};
  for (const spelling of ['description_only', 'descriptiononly', 'description only']) {
    if (spelling in feature) {
      feature['descriptionOnly'] ??= feature[spelling];
      delete feature[spelling];
    }
  }
  // "descriptionOnly": true says it changes no number without saying why: its description says what it does
  if (feature['descriptionOnly'] === true) feature['descriptionOnly'] = String(feature['description'] || 'it changes no number');
  if (feature['descriptionOnly'] === false || feature['descriptionOnly'] === '') delete feature['descriptionOnly'];
  let adjustments: unknown = feature['adjustments'];
  if (typeof adjustments === 'string') adjustments = parseJsonArg(adjustments, 'adjustments').value;
  const kept: {[path: string]: unknown} = isObject(adjustments) ? {...adjustments} : {};
  // what belongs to the feature written among its adjustments: its uses and its toggle, and its form (feature-form.ts)
  for (const key of ['charges', 'uses', 'uses_per_day', 'usesPerDay', 'active', ...FORM_FIELDS]) {
    if (key in kept) {
      feature[key] ??= kept[key];
      delete kept[key];
    }
  }
  // the form written on the feature's sheet entry is the feature's
  for (const value of Object.values(kept)) {
    if (!isObject(value)) continue;
    for (const key of FORM_FIELDS) {
      if (key in value) {
        feature[key] ??= value[key];
        delete (value as {[key: string]: unknown})[key];
      }
    }
  }
  // the section of the sheet it is listed in, however the AI wrote it
  for (const spelling of ['shown_in', 'shownIn', 'shown', 'sheet_section', 'section']) {
    if (spelling in kept) { feature[spelling] ??= kept[spelling]; delete kept[spelling]; }
    if (spelling in feature) {
      const section = sectionOf(feature[spelling]);
      if (spelling !== 'shownIn') delete feature[spelling];
      if (section) feature['shownIn'] = section;
      else if (spelling === 'shownIn') delete feature['shownIn'];
    }
  }
  if ('gainedAt' in feature) {
    feature['gained_at'] ??= feature['gainedAt'];
    delete feature['gainedAt'];
  }
  for (const list of DISPLAY_LISTS) {
    if (isObject(feature[list]) && !(list in kept)) kept[list] = feature[list];
    delete feature[list];
  }
  // its spell-like abilities, written next to its adjustments or among them, made the engine's caster of them
  for (const key of SLA_KEYS) {
    if (key in kept && key !== 'spellLikeAbilities') { feature[key] ??= kept[key]; delete kept[key]; }
  }
  if (Array.isArray(kept['spellLikeAbilities'])) { feature['spell_like_abilities'] ??= kept['spellLikeAbilities']; delete kept['spellLikeAbilities']; }
  const slaProblems = spellLikeAbilitiesOf(feature, kept);
  if (slaProblems.length) feature['spellLikeProblems'] = slaProblems;
  // an adjustment written on the feature itself ("languages": "Common, Elven" next to its adjustments): every key
  // that is no field of a feature and that the engine takes as a path is one of its adjustments (an elf's languages
  // went unseen through six refusals)
  for (const key of Object.keys(feature)) {
    if (FEATURE_KEYS.has(key) || key in kept) continue;
    if (!validateAdjustments({[key]: feature[key]}).some(p => p.severity === 'error')) {
      kept[key] = feature[key];
      delete feature[key];
    }
  }
  feature['adjustments'] = flattened(kept);
  // a size by its name, as a race page says it ("Medium"): the engine keeps it as the index of the size, set
  const written = feature['adjustments'] as {[path: string]: unknown};
  const sizeOf = (value: unknown) => typeof value === 'string' ? sizes.findIndex(size => size.toLowerCase() === value.trim().toLowerCase()) : -1;
  const size = isObject(written['size']) ? (written['size'] as {value?: unknown}).value : written['size'];
  if (sizeOf(size) >= 0) written['size'] = {value: sizeOf(size), mode: 'set'};
  // the uses a day however they were written (a number, "uses", charges without current)
  for (const spelling of ['uses', 'uses_per_day', 'usesPerDay', 'uses_total']) {
    if (spelling in feature) {
      feature['charges'] ??= feature[spelling];
      delete feature[spelling];
    }
  }
  // a combat option feat (Power Attack) is the option and nothing else: the sheet works its numbers out, and the
  // AI's own would count them twice
  const option = combatOptionOf(String(feature['name'] || ''));
  const flat = feature['adjustments'] as {[path: string]: unknown};
  if (option && flat[`availableCombatOptions.${option}`] === true) feature['adjustments'] = {[`availableCombatOptions.${option}`]: true};
  const charges = chargesOf(feature['charges']);
  if (charges) feature['charges'] = charges;
  else delete feature['charges'];
  if (!nested) typedAsWritten(feature);
  return feature;
};

// charges as the engine keeps them, from a number of uses or charges with only some of their fields
const chargesOf = (value: unknown): Charges | undefined => {
  const given: {[key: string]: unknown} = isObject(value) ? value : {total: value};
  const total = Math.floor(Number(given['total'] ?? given['max'] ?? given['uses']));
  if (!(total > 0)) return undefined;
  const current = Math.floor(Number(given['current']));
  const label = typeof given['label'] === 'string' && given['label'].trim() ? given['label'].trim() : 'per day';
  const per = CHARGES_PER.includes(given['per'] as NonNullable<Charges['per']>) ? given['per'] as Charges['per']
    : /encounter|combat/i.test(label) ? 'encounter' : /\bday|daily/i.test(label) ? 'day' : undefined;
  return {total, current: current >= 0 && current <= total ? current : total, label, ...(per ? {per} : {})};
};

// the bonus type the text names, on the bonuses written without it: rage's "+4 morale bonus to Strength" written as
// "abilityScores.str": 4 would stack with every other morale bonus. only when the text names one type, and only on
// bonuses (a penalty, "ac": -2, is no morale bonus)
const BONUS_TYPE = /\b(alchemical|circumstance|competence|deflection|dodge|enhancement|insight|luck|morale|profane|racial|resistance|sacred|trait) bonus/gi;
const TYPED_PATH = /^(abilityScores\.|hp\b)/;
const typedAsWritten = (feature: {[key: string]: unknown}): void => {
  const text = textOf(feature as unknown as Feature);
  const types = [...new Set([...text.matchAll(BONUS_TYPE)].map(m => m[1].toLowerCase()))];
  if (types.length !== 1) return;
  const type = types[0];
  const typed = (adjustments: unknown) => {
    if (!isObject(adjustments)) return;
    for (const [path, value] of Object.entries(adjustments)) {
      // a race's ability modifiers are no racial bonus
      if (!(BONUS_PATH.test(path) || (TYPED_PATH.test(path) && type !== 'racial'))) continue;
      const bonus = typeof value === 'number' ? value > 0 : typeof value === 'string' && !!value.trim() && !value.trim().startsWith('-');
      if (bonus) adjustments[path] = {value, type};
    }
  };
  typed(feature['adjustments']);
  for (const entry of entriesGiven(feature as unknown as Feature)) typed(entry['adjustments']);
};

const entriesGiven = (feature: Feature): {[key: string]: unknown}[] => DISPLAY_LISTS.flatMap(list => {
  const given = (feature.adjustments as {[path: string]: unknown} | undefined)?.[list];
  return (Array.isArray(given) ? given : [given]).filter(isObject);
});

// every path of a feature, those of the entries it gives included
const allPaths = (feature: Feature): string[] => [
  ...Object.keys(feature.adjustments || {}),
  ...entriesGiven(feature).flatMap(entry => Object.keys(isObject(entry['adjustments']) ? entry['adjustments'] : {})),
];

// whether the player turns the feature (or an entry it gives) on and off
const isToggled = (feature: Feature): boolean =>
  feature.active !== undefined || entriesGiven(feature).some(entry => entry['active'] !== undefined);

// the rules text of a feature: its name and descriptions, without the app's notes on where it came from ("check it
// against the rules" read as a situational bonus, and refused every racial trait built from memory)
const APP_NOTES = /(^|\n)\s*(source: \S+|built by the ai from (memory|the player's description)[^\n]*)\s*$/gim;
const textOf = (feature: Feature): string => [
  feature.name, feature.description, (feature as {descriptionOnly?: unknown}).descriptionOnly,
  // the rules its page gave, when it was looked up (see rulesTextFor): never stored on the sheet
  (feature as {rulesText?: unknown}).rulesText,
  ...entriesGiven(feature).map(entry => entry['description']),
// each part on a line of its own, so a sentence opening a description opens a line ("While all elves are ...")
].filter(v => typeof v === 'string').map(v => (v as string).replace(APP_NOTES, '')).join('\n');

// what a description-only feature's text says it does, which a path holds: the description-only mark is for a rule
// judged at the table, not for one the AI did not find the path of. undefined when nothing in the text asks for one
// a "+N" on something the sheet keeps a number of, and so a path holds: attacks, damage, saves, AC, initiative, CMB,
// CMD, hit points, a caster's fields (caster level, concentration: casterNumberFields), and checks of what it keeps (a
// skill by name, skill or ability checks, an ability by name, caster level checks). a check of anything else (dispel,
// identify) has no path, and its description says it. "checks" alone once asked a path of every check there is
const words = (field: string): string => field.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
export const CASTER_WORDS = casterNumberFields.map(words);
let bonusTheSheetKeeps: RegExp | undefined;
const BONUS_THE_SHEET_KEEPS = (): RegExp => bonusTheSheetKeeps ??= new RegExp(
  `\\+\\s?\\d+[^.;]{0,40}\\b(attack|damage|saves?|saving throws?|fortitude|reflex|AC|armor class|initiative|CMB|CMD|hit points|`
  + `${CASTER_WORDS.join('|')}|`
  + `(${[...SKILL_NAMES, 'skill', 'ability', 'strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'].join('|')})(-based)? checks?)\\b`, 'i');

// a text that gives an attack: a sentence naming the attack and its damage dice ("a bite attack ... deals 1d4"), or a
// feature named for it with its dice in its text (a brawler's "Unarmed Strike": "Damage: 1d6"), not
// dice a sentence away from an attack it names in passing (sneak attack's "extra damage is 1d6", then "an unarmed
// strike" can deal it nonlethal)
const DICE = /(?<![+]\s?)\b\d+d\d+\b/;
const makesAttack = (text: string): boolean =>
  // the feature named for the attack ("Unarmed Strike", its first line) with its dice anywhere in its text
  (ATTACK_FORMS.test(text.split('\n')[0]) && DICE.test(text))
  || text.split(/(?<=[.!?])\s+|\n/).some(sentence => ATTACK_FORMS.test(sentence) && DICE.test(sentence));

// the kinds of attack the rules give a creature itself: unarmed strikes and natural attacks
const ATTACK_FORMS = /\b(unarmed strikes?|natural attacks?|bites?|claws?|slams?|gores?|hoof|hooves|tail slaps?|stings?|talons?|tentacles?|wings?|pincers?)\b/i;

// a feature's text without what names the class's bonus feats and gives none: what it trades ("This ability replaces
// the bonus feat gained at 6th level"), the list they come from, a pick of the class's own list ("may use his fighter bonus feats to select
// Flyby Attack", "when selecting fighter bonus feats", "can choose Iron Will ... as bonus feats")
// the clause that trades something away ("replaces the bonus feat gained at 6th level", "This replaces the bonus skill
// rank humans receive at each level"), which gives none of it
const tradeOf = (what: string): RegExp =>
  new RegExp(`\\b(replac(es?|ing)|alters?|in place of|instead of)\\s+((the|a|an|his|her|their|its|one|two|both)\\s+)?([\\w’'-]+\\s+){0,3}${what}\\b[^.;]*`, 'gi');
const withoutFeatTrades = (text: string): string => text
  // a sentence about others' bonus feats ("Fighters and paladins automatically have Heavy Armor Proficiency as a bonus
  // feat", "A monk can gain Binding Throw as a bonus feat starting at 14th level") gives none
  .split(/(?<=[.!?])\s+/).filter(sentence => !(/\bbonus feats?\b/i.test(sentence)
    && (/\b(automatically have|need not select)\b/i.test(sentence) || /^(an?\s+)?[A-Z][a-z]+s?\b[^.]*?\b(can|may)\s+(gain|select|take|choose)\b/.test(sentence))
    && !/\byou\b/i.test(sentence))).join(' ')
  // a sentence about the list the class's bonus feats come from, giving none ("adds Power Attack to his list of bonus
  // feats", "his bonus feats must be taken from the following list"): a feat it gives says so ("gains one of the following")
  .split(/(?<=[.!?])\s+/).filter(sentence => !(/\bbonus feats?\b/i.test(sentence) && /\b(list|following)\b/i.test(sentence)
    && !/\b(gains?|receives?|gets?)\b/i.test(sentence))).join(' ')
  .replace(tradeOf('bonus feats?'), '')
  .replace(/[^.]*\b(when (selecting|choosing)|use (his|her|their|its) (\w+ )?bonus feats? to (select|choose|take)|(choose|select|take)s?\b[^.]* as (\w+ )?bonus feats)\b[^.]*\./gi, '.');

// what two-weapon fighting's rules hold, which the attacks rule works out: penalties lessened, and more off-hand attacks
// (Two-Weapon Fighting and Improved Two-Weapon Fighting were noted as giving no number). a note of no path doesn't
// answer these: the path is there
const twoWeaponNeeds = (text: string): string[] => [
  ...(/\bpenalt(y|ies)\b[^.]{0,80}\b(two weapons|two-weapon fighting|primary hand|off hand|off-hand)\b[^.]{0,80}\b(reduced|lessens?|decreases?|reduces?)\b|\b(primary hand|off hand|off-hand)\b[^.]{0,30}\b(lessens|is reduced|decreases)\b/i.test(text)
    ? ['penalties of fighting with two weapons lessened are "twoWeaponFighting.primaryPenaltyReduction" and "twoWeaponFighting.offHandPenaltyReduction" (Two-Weapon Fighting: 2 and 6)'] : []),
  ...(/\b(second|third|additional|extra) attacks? with (your|its|his|her) off[- ]hand weapon\b/i.test(text)
    ? ['an off-hand attack more is "twoWeaponFighting.extraOffHandAttacks": 1'] : []),
];

const pathsItNeeds = (text: string): string | undefined => {
  const needs: string[] = [...twoWeaponNeeds(text)];
  if (/\b(bonus|extra|additional) feats?\b|\bgains? (a|one) (bonus )?feat\b/i.test(withoutFeatTrades(text))) {
    needs.push('a bonus feat is "bonusFeats": 1 (one the player picks is added at the feats step; one the text names, a wizard\'s Scribe Scroll, is the feature\'s own name, and the app gives it)');
  }
  if (/\bclass skills?\b/i.test(text)) {
    needs.push('a class skill it gives is "skills.<skill>.classSkill": true, one for each skill it names ("skills.knowledge.subSkills.planes.classSkill": true)');
  }
  if (/\bskill ranks?\b/i.test(text.replace(tradeOf('skill ranks?'), ''))) needs.push('skill ranks are "bonusSkillRanks" ("{level}" for one per level)');
  if (/\bDC\b/.test(text) && /abjuration|conjuration|divination|enchantment|evocation|illusion|necromancy|transmutation/i.test(text)) {
    needs.push('a school\'s DC is "spellSchoolDcBonus.<school>"');
  }
  if (/(never|not) (modified|reduced)[^.]{0,20}\b(armor|encumbrance|load)/i.test(text)) {
    needs.push('a speed armor and loads do not reduce is "speedUnslowedByArmorAndLoad": true');
  }
  // ("your base speed increases by 5 feet": Fleet gave nothing)
  if (/\bspeed (increases|is increased) by \d+\s?(ft\.?|feet)\b|\bspeed\b[^.]{0,50}\+\s?\d+\s?(ft\.?|feet)|\+\s?\d+\s?(ft\.?|feet)[^.]{0,30}\bspeed\b|\bspeed\b[^.]{0,30}\bfaster\b/i.test(text)) {
    needs.push('a faster speed is "speed.land": 10 (the feet it adds)');
  }
  if (MOVEMENT.test(text)) needs.push('a climb, swim, fly or burrow speed is "speed.climb" (and so on) with its feet, {"value": 20, "mode": "set"}, a fly speed with "flyManeuverability"');
  // or more rounds, uses or points of one (a half-orc barbarian's +1 round of rage a day, a gunslinger's +1/4 grit
  // point): "+N <rounds> ... a day", or "+N to the <class>'s <pool> points". never skill points or hit points
  // ("you can rage for 6 additional rounds per day": Extra Rage gave nothing)
  if (/\badditional (times|uses?)\b|\bextra (times|uses?)\b|\b(times|uses?) more\b/i.test(text)
    || /\b(\d+|one|two|three|four|five|six) (additional|extra|more) (rounds?|times|uses?)\b[^.;]{0,30}\b(per|a|each) day\b/i.test(text)
    || /\+\s?\d+(\s?\/\s?\d+)?\s+(rounds?|uses?|times)\b[^.;]{0,30}\b(per|a|each) day\b/i.test(text)
    || /\+\s?\d+(\s?\/\s?\d+)?\s+to (the|its|his|her|their)\b(?![^.;]{0,30}\b(skill|hit) points?\b)[a-z' ]{0,40}\b(points?|pool|rounds?|uses?)\b/i.test(text)) {
    needs.push('uses, rounds or points added to another feature are "extraUses.<its name>" (Extra Channel: "extraUses.channel energy": 2; a round of rage a day: "extraUses.rage": 1)');
  }
  if (/armor check penalt/i.test(text)) needs.push('a lower armor check penalty is "armorCheckPenalty": 1 (it adds to the negative penalty)');
  // an attack the feature makes, kept by the sheet as an attack: an unarmed strike or a natural attack (the rules'
  // own kinds of them) with its damage dice. "+1d6" is damage added to other attacks (sneak attack), not one. a
  // brawler's unarmed strike (1d6) went in as text, and the sheet had no attack for it
  if (makesAttack(text)) {
    needs.push('an attack it makes is "melee": [{"name": "Unarmed Strike", "damage": "1d6", "toHitAbility": "str", "damageAbility": "str"}]');
  }
  // proficiencies are kept by the sheet: an elf's Weapon Familiarity left its longsword unproficient
  if (/\bproficien(t|cy|cies) (with|in)\b/i.test(text)) {
    needs.push('proficiencies are "proficiencies.weapons": ["longsword", "rapier"] (names, or "simple", "martial") and "proficiencies.armor": ["light", "shield"]');
  }
  if (/\b(fire|cold|acid|electricity|sonic) resistance \d+|resist(ance)? (to )?(fire|cold|acid|electricity|sonic) \d+/i.test(text)) {
    needs.push('energy resistance is "energyResistance.<energy>"');
  }
  if (!/per (die|dice)/i.test(text) && BONUS_THE_SHEET_KEEPS().test(text)) {
    needs.push('its bonus is a path (a variant for when it applies)');
  }
  return needs.length ? needs.join('; ') : undefined;
};

// the skills the sheet keeps, from its own list (skillAbilityMap)
const SKILL_NAMES = Object.keys(skillAbilityMap);

// what the text gives that the adjustments leave out: a bonus to every attack written for melee only (studied
// target written for the bow), skills it names with their bonus and no path for them, a speed armor does not slow
// the clauses of a text that give a bonus: from its "+N" to the end of the sentence, or to where the sentence goes on
// to something else (", and they learn one additional language every time they put a rank in the Linguistics skill"
// gives no bonus on Linguistics)
// (a clause after it that says when something else happens, ", and whenever you encounter a dragon, you can make a
// Diplomacy check", is no part of the bonus)
// (nor is a bonus the text denies: "searchers don't gain the usual +4 bonus on their Perception checks")
const bonusClauses = (text: string): string[] =>
  [...text.matchAll(/\+\s?\d+[^.;]*/g)]
    .filter(match => !/\b(don['’]t|do not|doesn['’]t|does not|no longer|never)\s+(gain|get|receive|take|add)\b[^.;]*$/i.test(text.slice(Math.max(0, match.index! - 60), match.index)))
    // (nor a sum: "the wall's DC + 10")
    .filter(match => !/\b(DC|level|modifier)\s*$/.test(text.slice(Math.max(0, match.index! - 12), match.index)))
    .map(match => match[0].split(/,?\s+and\s+(they|he|she|it|you|these|those|the|whenever|when|if|creatures?|others|foes|enemies|opponents)\b/i)[0]);

// every path a feature's text gives a bonus on: its attacks (melee and ranged, to hit and damage, when it names no one
// kind) and each skill it names. a feature with no numbers yet is told all of them at once, not one a refusal
const pathsTheTextNames = (text: string): string[] => {
  const bonuses = bonusClauses(text);
  const attacks = bonuses.some(clause => /\battacks?\b/i.test(clause));
  const damage = bonuses.some(clause => /\bdamage\b/i.test(clause));
  const kinds = /\b(melee|ranged|bows?|thrown|rays?)\b/i.test(text) ? [] : ['melee', 'ranged'];
  const skills = [...new Set(bonuses.flatMap(clause => SKILL_NAMES.filter(skill => new RegExp(`\\b${skill}\\b`, 'i').test(clause))))];
  const casterFields = casterNumberFields.filter(field => new RegExp(`\\b${words(field)}\\b`, 'i').test(bonuses.join(' ')));
  return [
    ...(makesAttack(text) ? ['melee (the attack it makes: name, damage, toHitAbility, damageAbility)'] : []),
    ...(/\bproficien(t|cy|cies) (with|in)\b/i.test(text) ? ['proficiencies.weapons or proficiencies.armor'] : []),
    ...casterFields.map(field => `spells.*.${field} (spells.<class>.${field} for one class)`),
    ...(attacks ? kinds.map(k => ONE_WEAPON.test(text) ? `${k}.@<the weapon or group>.toHitBonus` : `${k}.*.toHitBonus`) : []),
    ...(attacks && damage ? kinds.map(k => ONE_WEAPON.test(text) ? `${k}.@<the weapon or group>.damageBonus` : `${k}.*.damageBonus`) : []),
    ...skills.map(skill => skill === 'knowledge' ? 'skills.knowledge.subSkills.*.value (every Knowledge)' : `skills.${skill}.value`),
  ];
};

// a bonus with one weapon or group only, as rules texts say it: "the selected weapon", "with a longsword", "weapons in
// that group", "with the chosen weapon"
const ONE_WEAPON = /\b(selected|chosen|that|this|one) (type of )?weapons?\b|\bweapons? (group|in (that|the|this) group)\b|\bwith (a|an|the|that) [a-z -]+ only\b/i;

// a speed of another kind a text gives with its feet: "a climb speed of 20 feet", "fly 60 ft. (good)", "a 30-foot swim
// speed", "burrow speed 10 ft."
const MOVEMENT = /\b(climb|swim|fly|burrow)(ing)?\s+speed\b[^.]{0,20}\d+\s*(ft\.?|feet|-foot)|\d+[- ]?(ft\.?|feet|foot)\s+(climb|swim|fly|burrow)(ing)?\s+speed\b|\b(climb|swim|fly|burrow)\s+\d+\s*ft\b/i;
const movementKinds = (text: string): string[] => ['climb', 'swim', 'fly', 'burrow'].filter(kind =>
  new RegExp(`\\b${kind}(ing)?\\s+speed\\b[^.]{0,20}\\d+\\s*(ft\\.?|feet|-foot)|\\d+[- ]?(ft\\.?|feet|foot)\\s+${kind}(ing)?\\s+speed\\b|\\b${kind}\\s+\\d+\\s*ft\\b`, 'i').test(text));

// "it cannot exceed your Hit Dice", "up to your character level"
const HD_CAP = /\b(can ?not|can't|may not|does not|never|up to|no (higher|more) than)\b[^.]{0,40}\b(hit dice|character level|your (total )?level)\b/i;

const coverageProblems = (name: string, text: string, paths: string[], values: {[path: string]: unknown} = {}, reason?: unknown): string[] => {
  const problems: string[] = [];
  // the bonuses written as a fixed number, not a formula of the levels
  const capped = paths.filter(path => {
    if (!BONUS_PATH.test(path) && !/\.(casterLevel|concentration)\b/.test(path)) return false;
    const value = values[path];
    const said = value && typeof value === 'object' && 'value' in value ? (value as {value: unknown}).value : value;
    return said !== undefined && !/\{level/.test(String(said));
  });
  const bonuses = bonusClauses(text);
  // (a charge and an attack of opportunity are melee attacks)
  if (bonuses.some(clause => /\battacks?\b/i.test(clause)) && !/\b(melee|ranged|bows?|thrown|rays?|charg\w*|attacks? of opportunity)\b/i.test(text) && !ONE_WEAPON.test(text)) {
    for (const field of ['toHitBonus', 'damageBonus']) {
      const melee = paths.some(p => p.startsWith(`melee.*.${field}`));
      const ranged = paths.some(p => p.startsWith(`ranged.*.${field}`));
      if (melee !== ranged) {
        problems.push(`${name}: its text gives the bonus to every attack, but only ${melee ? 'melee' : 'ranged'}.*.${field} has it: add ${melee ? 'ranged' : 'melee'}.*.${field} too`);
      }
    }
  }
  // a speed of another kind its text gives (a vanara's climb speed, a strix's fly speed): its own path, and a fly
  // speed its maneuverability. the Climb and Swim bonuses that come with them are the rules' (rules/movement.rule.ts)
  // (a speed of a form it takes, told with "no path:", is the form's)
  const noPath = typeof reason === 'string' && /^no path\b/i.test(reason.trim());
  for (const kind of noPath ? [] : movementKinds(text)) {
    // (a bonus to that speed in a situation counts: Wind Rider's +15 feet in strong winds)
    if (!paths.some(p => p === `speed.${kind}` || p.startsWith(`speed.${kind}[`))) problems.push(`${name}: its text gives a ${kind} speed: "speed.${kind}": {"value": <its feet>, "mode": "set"}`);
  }
  if (!noPath && movementKinds(text).includes('fly') && /\bmaneuverability\b/i.test(text) && !paths.includes('flyManeuverability')) {
    problems.push(`${name}: its text gives the fly speed's maneuverability: "flyManeuverability": "<clumsy, poor, average, good or perfect>"`);
  }
  // a bonus on saves without naming one is on all three: an elf's +2 against enchantment kept only Will
  // (saves "based on Constitution" name Fortitude: a dhampir's Blood Drinker)
  const everySave = bonuses.some(clause => /\b(saving throws?|saves)\b/i.test(clause) && !/\b(fort(itude)?|ref(lex)?|will)\b|\bbased on (constitution|dexterity|wisdom)\b|\b(constitution|dexterity|wisdom)[- ]based\b/i.test(clause));
  if (everySave && !paths.some(p => p.startsWith('savingThrowBonus'))) {
    const saved = ['fort', 'ref', 'will'].filter(save => paths.some(p => p.startsWith(`saves.${save}`)));
    if (saved.length && saved.length < 3) {
      problems.push(`${name}: its text gives the bonus on every save, but only ${saved.join(', ')} ${saved.length === 1 ? 'has' : 'have'} it: use "savingThrowBonus" (with its variant), or add the others`);
    }
  }
  // (a skill the player picks, "skills.{choice:skill}", may be any; a fly speed brings its Fly bonus, rules/movement.rule.ts)
  const covers = (skill: string) => paths.some(p => p.startsWith(`skills.${skill}`) || p.startsWith('skills.@') || p.startsWith('skillCheckBonus') || p.startsWith('skills.{choice:'))
    || skill === 'fly' && paths.some(p => p.startsWith('speed.fly') || p === 'flyManeuverability');
  // skills named as alternatives the character picks from ("a Craft or Profession skill of their choice") are covered
  // by any one of them
  // a text that writes its skills as the rules do, capitalized ("Perception"), names one only so: "to notice the
  // target in disguise" is no bonus on Disguise
  const titled = (skill: string) => skill.replace(/\b(?!of\b)[a-z]/g, letter => letter.toUpperCase());
  const rulesStyle = SKILL_NAMES.some(skill => new RegExp(`\\b${titled(skill)}\\b`).test(text));
  // what the checks are made for is no bonus on the skills it names: "Perception checks to notice Sleight of Hand
  // attempts" is a bonus on Perception alone
  // nor is a DC set for others' checks against it ("the DC to intimidate them increases by 2")
  // nor what the checks oppose ("Sense Motive checks that oppose the Bluff checks of ...", "opposed checks against the
  // Bluff and Disguise skills"), nor what a roll is made for ("attack rolls to perform the aid another action")
  // (nor checks made in place of others: "such checks instead of Perception checks")
  const purposeless = (clause: string) => clause.replace(/\b(instead of|in place of|rather than)\s+[^,;.]*?\bchecks?\b/gi, '')
    .replace(/\bchecks?\s+(?:made\s+)?to\s+[^,;]*?(?=,|;|\band on\b|$)/gi, 'checks')
    .replace(/\b(that oppose|opposed by|opposed checks against)\s+(the\s+)?[^,;]*?\b(checks?|skills?)\b/gi, '')
    .replace(/\brolls?\s+to\s+[^,;]*/gi, 'rolls')
    // (nor what someone tries to do: "whenever an opponent tries to perform an awesome blow")
    .replace(/\b(tries|try|attempts|attempt)\s+to\s+[^,;.]*/gi, '')
    .replace(/\bDCs?\s+(?:of\s+\w+\s+checks?\s+)?to\s+[\w ]+?(?=\s+(?:them|him|her|it)\b|[,;.]|$)/gi, 'DC')
    // ("the DC of Intimidate checks against you increases by 4": others' checks)
    .replace(/\bDCs?\s+of\s+[\w ]+?\bchecks?\s+(?:\w+\s+)?against\s+(?:you|them|him|her|it)\b/gi, 'DC')
    // (and the DC of anyone's checks made at it: "the DC of Sleight of Hand checks to remove items warded")
    .replace(/\bDCs?\s+of\s+[\w ]+?\bchecks?\s+to\s+[^,;.]*/gi, 'DC');
  const left = [...new Set(bonuses.map(purposeless).flatMap(clause => {
    const named = SKILL_NAMES.filter(skill => rulesStyle ? new RegExp(`\\b${titled(skill)}\\b`).test(clause) : new RegExp(`\\b${skill}\\b`, 'i').test(clause));
    const either = named.length > 1 && (/\bor\b/i.test(clause) && /\b(of (their|his|her|your) choice|one|either)\b/i.test(clause)
      || /\b(two|three) of the following\b/i.test(clause));
    return either && named.some(covers) ? [] : named.filter(skill => !covers(skill));
  }))];
  // (a note of no path says the numbers left are not its own: a mount's rider's +4 on Ride)
  if (left.length && !noPath && paths.some(p => p.startsWith('skills.') || BONUS_PATH.test(p))) {
    problems.push(`${name}: its text gives a bonus on ${left.join(', ')}, which no path has: add "skills.<skill>.value" for each (every Knowledge: "skills.knowledge.subSkills.*.value", one: "skills.knowledge.subSkills.religion.value")`);
  }
  // the skills a sentence about class skills names, each made one (a flame oracle's Acrobatics, Climb, ...)
  // the part of a sentence that says so, not a bonus before or after it ("+2 on Bluff and Sleight of Hand checks, and
  // Sleight of Hand is always a class skill" makes only Sleight of Hand one; "adds Diplomacy as a class skill and gains
  // a +2 bonus on Diplomacy and Knowledge (nature)" makes only Diplomacy)
  // and one that makes them so ("is always a class skill", "as class skills", "become class skills"), not one that only
  // names class skills ("his total Perform skill bonus, including class skill bonus")
  const MAKES = /\bclass skills?\s*:|\b(is|are|becomes?|counts? as|treated as|considers?)\s+(always\s+)?(an?\s+)?class skills?\b|\bas (an? )?class skills?\b|\bclass skills? for (him|her|them|it|you)\b|\b(gains?|adds?)\b[^.;]{0,60}\bclass skills?\b/i;
  // a condition ("whether or not ... or if it is a class skill") or a denial ("does not have Acrobatics or Escape Artist
  // as class skills") makes nothing so
  // what a clause makes class skills, without what it doesn't ("doesn't gain Diplomacy or Ride as class skills"), what
  // it takes away ("removes Climb") and what it makes them in place of ("Fly as a class skill instead of Ride")
  const positive = (clause: string): string => clause
    .replace(/(\b(if|whether|unless|not|no longer|never)|n['’]t)\b[^.;]*?\bclass skills?\b/gi, '')
    .replace(/\b(instead of|rather than|in place of|but not)\b[^,.;]*/gi, '').replace(/\b(loses?|removes?|replac\w*)\b[^.;]*/gi, '');
  // (", but you take a -1 penalty on Diplomacy checks" is a clause of its own)
  const classSkillClauses = text.split(/[.;\n]|,\s*and\s+(?=[A-Z])|,\s*(?=and\s+[A-Z])|\s+and\s+(?=(?:gains?|receives?|has|can)\b)|,\s*but\s+/)
    .map(positive).filter(clause => MAKES.test(clause));
  if (classSkillClauses.length) {
    const makes = (skill: string) => paths.some(p => (p.startsWith(`skills.${skill}.`) || p.startsWith('skills.{choice:')) && /\.classSkill(\[|$)/.test(p));
    // one of the skills it names, the player's pick ("one of these skills (your choice) is always a class skill"), is
    // made by any one of them
    const left = [...new Set(classSkillClauses.flatMap(clause => {
      const said = SKILL_NAMES.filter(skill => new RegExp(`\\b${skill}\\b`, 'i').test(clause));
      const either = /\b(one|either) of (these|those|the following|them)\b|\(your choice\)|of (your|his|her|their) choice/i.test(clause);
      return either && said.some(makes) ? [] : said.filter(skill => !makes(skill));
    }))];
    if (left.length) {
      problems.push(`${name}: its text makes ${left.join(', ')} class skills, which no path does: add "skills.<skill>.classSkill": true for each (Knowledge (planes): "skills.knowledge.subSkills.planes.classSkill": true)`);
    }
  }
  // a bonus its text caps at the character's Hit Dice or level, written as a plain number: Magical Knack's +2 gave a
  // 1st-level wizard caster level 3. the cap is a formula of the levels
  if (HD_CAP.test(text) && capped.length) {
    problems.push(`${name}: its text caps it at the character's Hit Dice, which ${capped.join(', ')} ${capped.length > 1 ? 'do' : 'does'} not: write the bonus as a formula `
      + 'of the levels, a caster level bonus "min(2, {level} - {level.<class>})" (no more than the levels the class is short of the character level), another "min(2, {level})"');
  }
  if (/(never|not) (modified|reduced)[^.]{0,20}\b(armor|encumbrance|load)/i.test(text) && !paths.includes('speedUnslowedByArmorAndLoad')) {
    problems.push(`${name}: a speed armor and loads do not reduce needs "speedUnslowedByArmorAndLoad": true`);
  }
  return problems;
};

// uses a day the sheet counts: rounds of rage, channel energy, a domain power used 3 + Wis times a day
const PER_DAY = /\b(times|rounds?|uses?) (per|a|each) day\b|\bper day\b|\/day\b/i;
// the spells a day of a caster are worked out by the rules, not counted on a feature
const usesADay = (text: string): boolean => PER_DAY.test(text.replace(/\b(spells?|orisons?|cantrips?|slots?)( of each level)? (per|a|each) day\b/gi, ''));

// when the text says the bonus applies only sometimes: "vs. poison", "against giants", "while raging"
const SITUATIONAL = /\b(vs\.?|versus|against|while|within \d+|up to \d+ (ft|feet)|when (wearing|wielding|using|fighting|flanking|charging|mounted))\b/i;
// the first wording of the text that makes a bonus situational, but not "while" doing what a skill it adjusts is
// for: a Swim check is made while swimming ("+4 on Swim checks, and can always take 10 while swimming" is always on),
// nor a "while" meaning although, opening a sentence of flavor ("While all elves are naturally lithe and agile, ..."),
// nor a situation "even" widens the bonus to ("apply even against touch attacks")
const situationOf = (whole: string, paths: string[]): RegExpExecArray | undefined => {
  // the clauses giving a bonus, when the text has any: a situation in a clause of something else ("the DCs of checks
  // to demoralize her allies within 30 feet") is not the bonus's
  // (a bonus's own clauses when it has any: "+1 on Acrobatics checks, and you take only a -2 penalty ... when using the
  // Climb skill" is always on)
  // (and not others' clauses: "Anyone who eats a portion within 1 day gains ...")
  // (and an energy resistance "against" its energy names the energy, not a situation: a dragonheir scion's)
  const parts = whole.replace(/\b(energy )?resistance \d+ (against|to) [\w ]+?(?=[.,;]|$)/gi, '').split(/[.;\n]|,\s*and\s+(?=(the|she|he|they|it|her|his|you)\b)/i).filter((c): c is string => !!c)
    .filter(c => !/^\s*(anyone|allies|each ally|your allies|an ally|the target|enemies|opponents|other creatures)\b/i.test(c));
  // (a clause adding to a DC is none: "add your bravery bonus to the DCs of checks to ... feint against you")
  const bonuses = parts.filter(c => /(?<!\b(DC|level|modifier)\s*)\+\s?\d|\bbonus\b/i.test(c) && !/\b(to|on) (the |its |their )?DCs?\b/i.test(c));
  const clauses = bonuses.length ? bonuses : parts.filter(c => /[+-]\s?\d|\bpenalt/i.test(c));
  const text = clauses.length ? clauses.join('\n') : whole;
  const acts = paths.map(path => /^skills\.([^.\[]+)/.exec(path)?.[1]).filter((skill): skill is string => !!skill && skill !== '*')
    .map(skill => skill.replace(/e$/, ''));
  for (const match of text.matchAll(new RegExp(SITUATIONAL.source, 'gi'))) {
    const next = /^\s+(\w+)/.exec(text.slice(match.index! + match[0].length))?.[1]?.toLowerCase() ?? '';
    if (/^while$/i.test(match[0]) && acts.some(act => next.startsWith(act))) continue;
    // "even against touch attacks", "even while flat-footed" widens a bonus, it does not restrict it
    if (/\beven\s+$/i.test(text.slice(Math.max(0, match.index! - 6), match.index))) continue;
    const opens = /(^|[.!?:]\s+|\n\s*)$/.test(text.slice(0, match.index));
    if (/^while$/i.test(match[0]) && opens && /^(all|some|most|many|few|every|each|no|not)$/.test(next)) continue;
    return match as RegExpExecArray;
  }
  return undefined;
};
// the numbers a text gives that the sheet could keep: a signed bonus or penalty ("+3", "–2"), or hit points. not a
// distance, a price or a time, nor a sum ("the wall's DC + 10")
// nor one taken away ("no -4 penalty for shooting into melee", "without the normal -4 penalty")
// nor a formula's term ("DC = 10 + 1/2 your character level + your Wisdom modifier", "a –1 penalty per 5 feet")
const SIGNED = /(?<![\w)])(?<!\b(DC|level|modifier)\s*)(?<!\d\s*)(?<!\b(no|without|the normal|the usual|instead of)\s+(\w+\s+)?)[+–-]\s?\d+(?![\d%]|d\d)(?!\s*(feet|ft\b|-?foot|gp|minutes?|hours?|rounds?|days?|\/|\s*per\b))|\b\d+\s+(temporary\s+)?hit points\b/i;
const signedNumbers = (text: string): string[] => [...new Set([...text.matchAll(new RegExp(SIGNED.source, 'gi'))].map(m => m[0].trim()))].slice(0, 4);

// every signed number the text gives, held by an adjustment or told in its note. a feature that writes its first bonus
// and leaves its second ("+1 on Acrobatics checks and a +1 to your CMB when resisting trip attacks", "this bonus
// increases to +4 when you are grappled") passed every check that asks only whether the numbers written are its text's.
// a number counts as held when an adjustment holds it, or two of their numbers add up to it (Skill Focus's +6 is
// "3 + 3 * ..."), or the note names it ("the foe's –2 is told here"). a combat option's numbers are the rules'
// the values a formula takes from 1st to 20th (of the levels, or of a skill's ranks) ("min(5, 1 + floor({level} / 5))" is 1 to 5): a growth's
// steps and its maximum are the formula's. a formula with other references counts its references as the level too
const MATH = {floor: Math.floor, ceil: Math.ceil, round: Math.round, abs: Math.abs, min: Math.min, max: Math.max};
const formulaValues = (formula: string): number[] => {
  if (!/\{/.test(formula)) return [];
  const values: number[] = [];
  for (let level = 1; level <= 20; level++) {
    const expression = formula.replace(/\{[^}]+\}/g, String(level));
    if (!/^[\d\s+\-*/().,a-z]*$/.test(expression) || /[a-z]+/g.test(expression.replace(/\b(floor|ceil|round|abs|min|max)\b/g, ''))) return values;
    try {
      const value = Function(...Object.keys(MATH), `return (${expression});`)(...Object.values(MATH));
      if (Number.isFinite(value)) values.push(Math.abs(Math.round(value)));
    } catch { return values; }
  }
  return values;
};

// every signed number the text gives, held by an adjustment or told in its note. a feature that writes its first bonus
// and leaves its second ("+1 on Acrobatics checks and a +1 to your CMB when resisting trip attacks", "this bonus
// increases to +4 when you are grappled") passed every check that asks only whether the numbers written are its text's.
// a number counts as held when what the feature keeps holds it (its adjustments, a table by level, its uses), or two of
// their numbers add up to it (Skill Focus's +6 is "3 + 3 * ..."), or a formula of the levels reaches it, or the note
// names it ("the foe's –2 is told here"). a combat option's numbers are the rules'
export const uncoveredNumbers = (feature: Feature): string[] => {
  const reason = String((feature as {descriptionOnly?: unknown}).descriptionOnly ?? '');
  if (/^no path\b/i.test(reason.trim()) || (feature as {metamagic?: unknown}).metamagic) return [];
  const {name: _name, description: _description, descriptionOnly: _note, ...kept} = feature as Feature & {descriptionOnly?: unknown};
  const written = JSON.stringify(kept);
  if (/availableCombatOptions/.test(written)) return [];
  const held = [...written.matchAll(/\d+/g)].map(m => Number(m[0]));
  const formulas = [...written.matchAll(/"([^"]*\{[^"]*)"/g)].flatMap(m => formulaValues(m[1]));
  const sums = new Set([...held, ...held.flatMap((a, i) => held.slice(i + 1).map(b => a + b)), ...formulas,
    ...[...reason.matchAll(/\d+/g)].map(m => Number(m[0]))]);
  // (the sentence that names what it replaces names that feature's numbers: "This replaces trap sense +1")
  const own = String(feature.description || '').split(/(?<=[.!?])\s+/).filter(sentence => !/\b(replaces?|alters?)\b/i.test(sentence)).join(' ');
  const given = [...own.matchAll(new RegExp(SIGNED.source, 'gi'))].map(m => m[0].trim());
  // (0 hit points is a creature reduced to them, no bonus)
  return [...new Set(given.filter(n => Number(/\d+/.exec(n)?.[0]) !== 0 && !sums.has(Number(/\d+/.exec(n)?.[0]))))];
};

const BONUS_PATH = /^(saves|savingThrowBonus|ac|touchAc|flatFootedAc|attackRollBonus|meleeAttackRollBonus|rangedAttackRollBonus|melee|ranged|skills|skillCheckBonus|cmb|cmd|init|abilityCheckBonus)\b/;

// a feat that is a combat option the rules work out (Power Attack): made available, never its numbers. the feat of
// two-weapon fighting lowers its penalties, it is not the option itself
const FEAT_OPTIONS = ['powerAttack', 'deadlyAim', 'combatExpertise'];
const combatOptionOf = (name: string): string | undefined => {
  const plain = name.toLowerCase().replace(/[^a-z]/g, '');
  return Object.entries(combatOptionLabels).filter(([key]) => FEAT_OPTIONS.includes(key)).find(([key, label]) =>
    key.toLowerCase() === plain || label.toLowerCase().replace(/[^a-z]/g, '') === plain)?.[0];
};

// what is wrong with how the features were written, undefined when nothing is. features are what the AI gave, with
// descriptionOnly still on them: strip it with withoutMarks before keeping them. class features are checked for
// where they show and where their toggle is too
// what is wrong with a variant's name: a variant names the situation alone, in a few words ("fear", "giants",
// "concealment from dim light"), so bonuses for one situation meet under it. a piece of the sentence it came from
// (Mobility's "attacks of opportunity caused when you move out of", "a +4 bonus against opponents that are shaken")
// shows on the sheet as it is and meets nothing. a combat option in use is no situation: the option gates it
const COMBAT_OPTION_WORDS = /\b(fighting defensively|fight defensively|total defense|combat expertise|power attack|deadly aim|two-weapon fighting)\b/i;
export const variantNameProblems = (name: string, paths: string[]): string[] => paths.flatMap(path => {
  const situation = /\[([^\]]*)\]$/.exec(path)?.[1]?.trim();
  if (situation === undefined || /^\{choice:[^}]+\}$/.test(situation)) return [];
  const wrong = [
    /[+–]\s?\d|(?<![a-z\d])-\d|\b(bonus(es)?|penalt(y|ies)) (on|to)\b/i.test(situation) && 'it names a bonus, not the situation',
    /\b(\w+) \1\b/i.test(situation) && 'a word is doubled',
    /^(and|or|but|which|who|they|as long as|are|is|you|if|when|whenever|while|to|made|can|can[’']t|do|does|unless)\b/i.test(situation)
      && 'it starts mid-sentence (no "while", "when", "and")',
    /\b(of|to|with|from|by|out|in|on|for|at|the|a|an|and|or|while|that|than|as|your|its)$/i.test(situation) && 'it stops mid-sentence',
    ((situation.match(/\(/g) || []).length !== (situation.match(/\)/g) || []).length || /pathfinder|\bpage \d|rulebook/i.test(situation))
      && 'it keeps a citation or half a parenthesis',
    situation.split(/\s+/).length > 10 && 'it is more than ten words',
    /^(it|this|that|these|those|such|so|them|him|her|the spell|this spell|doing so|the target|the subject|the creature|the effect)$/i.test(situation)
      && 'it is a pronoun or a filler, not a situation',
    /\bfor the duration\b|\bthe spell lasts\b|\bwhile the spell\b|\bspell is in effect\b|\buntil the (end|start|beginning)\b/i.test(situation)
      && 'it says how long, which the feature being on already says',
    /\||\bsuch as\b|\bas well as\b|\bthis (spell|feat|trait|ability)\b|\busing this\b|\bwith this (feat|trait|ability)\b/i.test(situation)
      && 'it keeps a piece of the sentence (an example, "as well as", "this feat", a table\'s column)',
    COMBAT_OPTION_WORDS.test(situation) && 'a combat option in use is gated on the option ({"value": 1, "if": "Fighting Defensively"}), not a variant',
  ].filter((why): why is string => !!why);
  return wrong.length ? [`${name}: the variant "${situation}" (${path}) is not a situation's name: ${wrong.join('; ')}. `
    + 'Name the situation alone, in a few words, as the rules would ("fear", "giants", "bull rush", "concealment from dim light")'] : [];
});

// what a text gives the character without a signed number, each in a form the rules always write it in: darkvision
// 60 feet, DR 5/magic, fire resistance 10, immunity to poison, the benefits of haste. one its adjustments do not hold
// was missed, unless its note names it (an ally's, a form's, one at the table). only a sentence giving it to the
// one who has the feature counts: not what is ignored or taken away, what others have (a construct immune to the
// spell, a creature with DR), one in a condition ("if you are immune") or in a form's list ("any of the following")
const UNSIGNED_EFFECTS: {name: string, gives: RegExp, held: (path: string) => boolean, noted: RegExp, fix: string}[] = [
  {name: 'darkvision', gives: /\bdarkvision\b(?! beyond)[^.;]{0,30}?\b\d+\s*(feet|ft)/i, held: p => p.startsWith('senses'), noted: /darkvision/i,
    fix: '"senses.darkvision": <its feet>'},
  {name: 'damage reduction', gives: /\b(DR|damage reduction) (\d+|equal)[^.;]{0,6}\//i, held: p => p.startsWith('damageReduction'), noted: /\bDR\b|damage reduction/i,
    fix: '"damageReduction.<what overcomes it>": <its value> ("damageReduction.magic": 5, "damageReduction.-" for DR/—)'},
  {name: 'energy resistance', gives: /\b(resistance (to )?(acid|cold|electricity|fire|sonic)( and \w+)? (\d+|equal)|(acid|cold|electricity|fire|sonic)( and (acid|cold|electricity|fire|sonic))? resistance (\d+|equal)|resist (acid|cold|electricity|fire|sonic) (\d+))/i,
    held: p => p.startsWith('energyResistance'), noted: /resist/i, fix: '"energyResistance.<energy>": <its value>'},
  {name: 'an immunity', gives: /\b(becomes?|is|are|gains?) (also )?immun(e|ity) to\b(?! (this|the effects of this|that|its|the \w+ (spell|ability|effect)|it\b))/i,
    held: p => p.startsWith('immunities'), noted: /immun/i, fix: '"immunities": ["<what it is immune to>", ...]'},
  {name: 'another spell\'s effect', gives: /\b(gains? the (benefits|effects) of|as if under the effects? of|as if affected by)\s+(an? )?(haste|bless|heroism|shield of faith|protection from \w+|mage armor|barkskin|bull's strength|cat's grace|bear's endurance|owl's wisdom|fox's cunning|eagle's splendor|resistance|fly|slow|freedom of movement|see invisibility|true seeing|blur|displacement)\b/i,
    held: () => true, noted: /./, fix: 'that spell\'s effect as its adjustments (haste: +1 on attacks, +1 dodge AC and Reflex, +30 ft. speeds)'},
];
const GIVES_VERB = /\b(gains?|gaining|has|have|receives?|becomes?|acquires?|develops?|possess(es)?|grants? (you|him|her|it|them|the \w+)|gives? (you|him|her|it|them)|with)\b/i;
const NOT_ITS_OWN = /\b(ignor\w*|bypass\w*|overcom\w*|penetrat\w*|loses?|lost|lack\w*|without|suppress\w*|negat\w*|reduc\w*|halv\w*|lower\w*|opponents?|enem(y|ies)|foes?|creatures? (that|with|who)|attackers?|instead of|if (it|he|she|you) (already|has)|for 24 hours|from that (source|creature)|any of the following|the listed ability|affected creatures?|a creature under|allies|an ally|the ally)\b/i;
const OTHERS_IMMUNE = /^\s*(?:\w+,\s*)?(?:the |a |an |any |all |such |these |those |other |its |your )*(creatures?|opponents?|enemies|foes?|constructs?|undead|targets? (that|who)|those|anyone|allies|ally|outsiders?|vermin|oozes?|swarms?|objects?|items?)\b/i;
export const unsignedEffectProblems = (name: string, text: string, paths: string[], reason?: unknown): string[] => {
  const note = typeof reason === 'string' ? reason : '';
  if (/^\s*no path\b/i.test(note)) return [];
  const sentences = text.replace(/\s+/g, ' ').split(/(?<=[.!?;])\s+/);
  return UNSIGNED_EFFECTS.flatMap(effect => {
    if (effect.name === 'another spell\'s effect' ? paths.length > 0 : paths.some(effect.held)) return [];
    if (effect.name !== 'another spell\'s effect' && effect.noted.test(note)) return [];
    // (another spell's effect is noted by naming that spell: "freedom of movement's is judged at the table")
    const spellNamed = (sentence: string) => {
      const m = effect.gives.exec(sentence);
      return !!m && effect.name === 'another spell\'s effect' && note.toLowerCase().includes(String(m[m.length - 1] ?? m[0]).toLowerCase());
    };
    const given = sentences.find(sentence => {
      const m = effect.gives.exec(sentence);
      if (!m || spellNamed(sentence)) return false;
      const before = sentence.slice(0, m.index);
      if (NOT_ITS_OWN.test(sentence) || /\b(if|unless|whether)\b[^.;]{0,40}$/i.test(before)) return false;
      if (effect.name === 'an immunity') return !OTHERS_IMMUNE.test(before);
      return effect.name === 'another spell\'s effect' || GIVES_VERB.test(before) || /^\s*(darkvision|DR|damage reduction|resist|\w+ resistance)\b/i.test(sentence);
    });
    return given ? [`${name}: its text gives ${effect.name} ("${given.trim().slice(0, 90)}"), which no path holds: ${effect.fix}, `
      + `or name it in descriptionOnly when it is not its own (an ally's, a form's pick, one the table judges)`] : [];
  });
};

// spell: the feature is a spell's effect, the condition its cast puts on the creature it affects. its text tells of
// the spell's own attacks, DCs and spell-like abilities, which are no feature's: only its numbers are held, each
// written as the effect or named in its note, its situations named and its bonuses on the paths their stats are
export const mechanicsProblems = (
  features: Feature[], options: {classFeatures?: boolean, spell?: boolean} = {},
): string[] => {
  const problems: string[] = [];
  for (const feature of features) {
    const name = feature.name || 'a feature';
    const reason = (feature as {descriptionOnly?: unknown}).descriptionOnly;
    const paths = Object.keys(feature.adjustments || {});
    if (options.spell) {
      problems.push(...variantNameProblems(name, allPaths(feature)));
      problems.push(...unsignedEffectProblems(name, textOf(feature), allPaths(feature), reason));
      const uncovered = uncoveredNumbers(feature);
      if (uncovered.length) {
        problems.push(`${name}: its text gives ${uncovered.join(', ')}, which its effect does not hold: write each as the path it adjusts on the `
          + 'creature it affects (a bonus by caster level as a formula of {casterLevel}), or name it in descriptionOnly where it goes ("no path:" when no path can hold it: damage, a DC, an attack of its own)');
      }
      if (paths.length) problems.push(...coverageProblems(name, textOf(feature), allPaths(feature), (feature.adjustments || {}) as {[path: string]: unknown}, reason));
      continue;
    }
    // its spell-like abilities as the sheet keeps them: written wrong, or left in its text
    problems.push(...((feature as {spellLikeProblems?: string[]}).spellLikeProblems ?? []));
    problems.push(...spellLikeProblems(name, textOf(feature), allPaths(feature), reason));
    problems.push(...variantNameProblems(name, allPaths(feature)));
    problems.push(...unsignedEffectProblems(name, textOf(feature), allPaths(feature), reason));
    const option = combatOptionOf(name);
    if (option && !paths.includes(`availableCombatOptions.${option}`)) {
      problems.push(`${name} is a combat option the sheet works out: its adjustments are {"availableCombatOptions.${option}": true}, nothing else`);
      continue;
    }
    if (!paths.length && !feature.shownIn) {
      if (typeof reason !== 'string' || !reason.trim()) {
        // its rules written and no number in them: it is description only, as the AI meant (Orc Blood, Weapon
        // Familiarity were refused for not saying so, a call each)
        const written = String(feature.description || '').replace(APP_NOTES, '').trim();
        const needs = pathsItNeeds(textOf(feature));
        const numbersImplied = /\b(bonus(es)?|penalt(y|ies)|increases?|decreases?)\b|[+-]\s?\d/i.test(textOf(feature));
        if (written.split(/\s+/).length >= 3 && !needs && !numbersImplied) continue;
        // numbers the text gives that no path the check knows names ("+3 on all checks with the chosen skill", "+3 hit
        // points"): still numbers, each a path, or the description says no path holds them
        const given = signedNumbers(textOf(feature));
        problems.push(needs
          ? `${name} adjusts nothing, and its text gives numbers: ${needs}`
          : given.length
          ? `${name} adjusts nothing, and its text gives numbers (${given.join(', ')}): write each as the path it adjusts (a pick's as {choice:<id>}), or if no path can hold them, start descriptionOnly with "no path:"`
          : `${name} adjusts nothing: write its rules as adjustments, or its rules in its description if it changes no number`);
        continue;
      }
      if (options.classFeatures) problems.push(...usesProblems(feature, name, reason));
      // a reason that says no path can hold it is taken at its word
      const noPath = /^no (path|spell-like)\b/i.test(reason.trim());
      const needs = noPath ? (twoWeaponNeeds(textOf(feature)).join('; ') || undefined) : pathsItNeeds(textOf(feature));
      // (a metamagic feat's levels are its metamagic's)
      const given = noPath || (feature as {metamagic?: unknown}).metamagic ? [] : signedNumbers(String(feature.description || ''));
      if (needs) {
        const named = pathsTheTextNames(textOf(feature));
        problems.push(`${name} is description only, but its text gives numbers: ${needs}${named.length ? `: ${named.join(', ')}` : ''}. `
          + 'If no path can hold them, start descriptionOnly with "no path:"');
      } else if (given.length) {
        problems.push(`${name} is description only, but its text gives numbers (${given.join(', ')}): write each as the path it adjusts, or if no path can hold them, start descriptionOnly with "no path:"`);
      }
      continue;
    }
    const all = allPaths(feature);
    // shown on the sheet and nothing more (an entry, or its section): its numbers are left out as much as with no
    // adjustments at all
    if (all.every(path => (DISPLAY_LISTS as readonly string[]).includes(path)) && !(typeof reason === 'string' && /^(no path|its numbers)\b/i.test(reason.trim()))) {
      const needs = pathsItNeeds(textOf(feature));
      if (needs) {
        const named = pathsTheTextNames(textOf(feature));
        problems.push(`${name} shows on the sheet but adjusts nothing, and its text gives numbers: ${needs}. Put them in its adjustments`
          + `${named.length ? `, every one its text names: ${named.join(', ')}` : ''}. If no path can hold them, start descriptionOnly with "no path:"`);
        continue;
      }
    }
    problems.push(...coverageProblems(name, textOf(feature), all, (feature.adjustments || {}) as {[path: string]: unknown}, reason));
    const uncovered = uncoveredNumbers(feature);
    if (uncovered.length) {
      problems.push(`${name}: its text gives ${uncovered.join(', ')}, which none of its adjustments holds: write each as the path it `
        + 'adjusts (a second bonus, a bonus in another situation, one that grows), or name it in descriptionOnly where it goes ("no path:" when no path can hold it)');
    }
    // a bonus with "the selected weapon" (Weapon Focus) is that weapon's, never every attack's
    if (/\b(the|your) (selected|chosen) (type of )?weapons?\b/i.test(textOf(feature)) && all.some(path => /^(attackRollBonus|(melee|ranged)\.\*\.(toHitBonus|damageBonus))$/.test(path))) {
      problems.push(`${name}: its bonus is the selected weapon's: "melee.@<weapon>.toHitBonus" (and "ranged.@<weapon>..."), the weapon a pick ({choice:weapon}), never every attack's`);
    }
    const situational = situationOf(textOf(feature), all);
    if (situational && !isToggled(feature) && !all.some(path => path.includes('[') || path.includes('.@') || path.includes('{choice'))) {
      // an attack the feature gives (an unarmed strike) is not a bonus that needs its situation
      // (a class skill is no bonus a situation limits)
      // (nor one that applies "if" another feature is on: a feat that works while in a style)
      const adjustments = (feature.adjustments || {}) as {[path: string]: unknown};
      const gated = (path: string) => isObject(adjustments[path]) && ['if', 'ifAny'].some(key => (adjustments[path] as {[key: string]: unknown})[key] !== undefined);
      const always = all.filter(path => BONUS_PATH.test(path) && !/^(melee|ranged)$/.test(path) && !/\.classSkill$/.test(path) && !gated(path));
      if (always.length) {
        problems.push(`${name}: its text says it applies only sometimes ("${situational[0]} ..."), but ${always.join(', ')} `
          + 'apply always: make each a variant of when it applies ("saves.fort[poison]", "ac[giants]"), or a '
          + 'feature the player turns on ("active")');
      }
    }
    // a toggled entry is on in its situation: a variant of that same situation would keep its bonuses off the sheet
    const switched = [...entriesGiven(feature), ...(feature.active !== undefined ? [feature as unknown as {[key: string]: unknown}] : [])];
    for (const entry of switched) {
      if (entry['active'] === undefined || !isObject(entry['adjustments'])) continue;
      const own = String(entry['name'] || name);
      const repeated = Object.keys(entry['adjustments']).filter(path => {
        const variant = /\[(.*)\]$/.exec(path)?.[1];
        return !!variant && isOwnSituation(own, variant);
      });
      if (repeated.length) {
        problems.push(`${name}: the player turns it on while it applies, so its bonuses are plain paths: ${repeated.join(', ')} `
          + 'would show only as situational (write "melee.*.toHitBonus", not "melee.*.toHitBonus[studied target]")');
      }
    }
    if (!options.classFeatures) continue;
    if (feature.active !== undefined) {
      problems.push(`${name}: a class feature does not show on the sheet, its toggle would hide it. Put "active" and the bonuses it turns on in the entry it gives (specialAttack, defensiveAbilities or specialQuality)`);
    }
    // every class feature shows on the sheet: by its entry, its shownIn, else in the special qualities
    for (const entry of entriesGiven(feature)) {
      if (entry['active'] !== undefined && typeof entry['active'] !== 'boolean') problems.push(`${name}: active is true or false`);
    }
    problems.push(...usesProblems(feature, name, reason));
  }
  return problems;
};

// uses a day a class feature's text gives, which the sheet counts; one with none says so ("no uses:"), as for any
// number (a feature told of uses it did not have could not get past it). asked of a description-only feature too: an
// evoker's school went in as text, and its Force Missile (3 + Int a day) uncounted
const usesProblems = (feature: Feature, name: string, reason: unknown): string[] => {
  const noPath = typeof reason === 'string' && /^no (path|uses)\b/i.test(reason.trim());
  // (spell-like abilities keep their own uses, and uses it adds to another feature are that feature's)
  if (!usesADay(textOf(feature)) || noPath || feature.charges || (feature as {usesByLevel?: unknown}).usesByLevel
    || Object.keys(feature.adjustments || {}).some(path => path.startsWith('spellLikeAbilities') || path.startsWith('extraUses.'))
    || entriesGiven(feature).some(entry => entry['charges'])) return [];
  return [`${name}: its text gives uses a day, which the sheet counts: give "uses_by_level" ({"at": {"1": 3}, "plus": "<ability, if any>", "label": "per day"}). `
    + 'If it has none, start descriptionOnly with "no uses:" and why'];
};

// whether a variant's situation is the feature's own (rage's "[raging]", studied target's "[studied target]"):
// its name, or a word of it as the doing of it ("raging" is rage's). a word of it otherwise is not: track's bonus
// "[follow tracks]" is a situation of its own
const stemOf = (word: string): string => word.replace(/e$/, '');
export const isOwnSituation = (featureName: string, situation: string): boolean => {
  const own = featureName.toLowerCase().replace(/[^a-z]/g, '');
  const said = situation.toLowerCase().replace(/[^a-z]/g, '');
  // a situation that is the whole name, its parenthesis aside, is the name's own ("favored enemy" of Favored Enemy
  // (humans)). one that is some words of it is not: Blinded Blade Style's "[blinded]", Shielded Staff Style's
  // "[shielded staff]" are situations within the stance
  const core = featureName.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z]/g, '');
  return (!!own && !!said && (said.includes(own) || own.includes(said) && said.length >= core.length)) || isDoingOf(featureName, situation);
};
// the situation is the doing of the feature ("raging"): the feature is one the player switches on, not a bonus in a
// situation of its own (track's "[follow tracks]" names it too, and stays a variant)
export const isDoingOf = (featureName: string, situation: string): boolean => {
  const ownStems = featureName.toLowerCase().split(/[^a-z]+/).filter(w => w.length >= 3).map(stemOf);
  // "raging" is rage's, "performing" bardic performance's: the root, or a word of the name it starts at least 4 letters of
  const roots = situation.toLowerCase().split(/[^a-z]+/).filter(w => /^[a-z]{3,}ing$/.test(w)).flatMap(w => [w.slice(0, -3), w.slice(0, -4)]);
  return roots.some(root => ownStems.includes(root) || (root.length >= 4 && ownStems.some(stem => stem.startsWith(root))));
};

// a class feature the player switches on while it applies: an action to start it, a target studied, a stance, rounds
// a day (studied target, rage, smite, challenge, favored target)
const ACTIVATED = /\b(move|swift|standard|immediate|free) action\b|\bstance\b|\brounds? (per|a|each) day\b|\bwhile (in|using|active)\b|\bwhen (you|he|she|they) (activate|choose|use)s?\b/i;

const isEntryList = (path: string): boolean => (DISPLAY_LISTS as readonly string[]).includes(path);

// such a class feature as the sheet shows it: its entry (specialAttack, defensiveAbilities or specialQuality) with
// the toggle, off until the player turns it on, and its bonuses on the entry where the toggle switches them. what the
// AI wrote otherwise (no entry, the bonuses next to it, no toggle, a variant of its own situation) is put right
// instead of refused. a feature that is not switched on is as it was
export const toggledWhenActivated = (feature: Feature): Feature => {
  const name = feature.name || 'a feature';
  // switched on by its text (an action, a stance), or by the AI marking the entry it shows through, as the recipe
  // has it (the feature's own "active" is too often its can-turn-off, and would hide the entry)
  const declared = DISPLAY_LISTS.some(list => isObject(feature.adjustments?.[list]) && (feature.adjustments as any)[list].active !== undefined);
  // or by every bonus being a variant of its own situation (rage's "[raging]"): the bonuses of a feature the player
  // switches on, written as if the sheet could not know when it applies
  const bonusPaths = Object.keys(feature.adjustments || {}).filter(path => !isEntryList(path) && !BOOKKEEPING.test(path));
  const ownVariants = bonusPaths.length > 0 && bonusPaths.every(path => {
    const situation = /\[(.*)\]$/.exec(path)?.[1];
    return !!situation && isDoingOf(name, situation);
  });
  if (!ACTIVATED.test(textOf(feature)) && !declared && !ownVariants) return feature;
  const adjustments: {[path: string]: any} = {...(feature.adjustments || {})};
  const listed = DISPLAY_LISTS.find(list => isObject(adjustments[list]));
  const list = listed ?? 'specialAttack';
  const entry: {[key: string]: any} = listed ? {...adjustments[list]} : {name, description: feature.description || ''};
  const bonuses: {[path: string]: unknown} = isObject(entry['adjustments']) ? {...entry['adjustments']} : {};
  // the bonuses next to the entry move onto it, those only kept count of (a bonus feat) stay where they are
  for (const [path, value] of Object.entries(adjustments)) {
    if (isEntryList(path) || BOOKKEEPING.test(path)) continue;
    bonuses[path] = value;
    delete adjustments[path];
  }
  // a variant of its own situation would keep its bonuses off the sheet while it is on
  const own = String(entry['name'] || name);
  for (const path of Object.keys(bonuses)) {
    const variant = /^(.*)\[(.*)\]$/.exec(path);
    if (variant && isOwnSituation(own, variant[2])) {
      bonuses[variant[1]] = bonuses[path];
      delete bonuses[path];
    }
  }
  // every bonus a variant of one situation (favored enemy's "[undead]"): the toggle is that situation
  const situations = new Set(Object.keys(bonuses).map(path => /\[(.*)\]$/.exec(path)?.[1].trim().toLowerCase()));
  const plain = Object.keys(bonuses).map(path => path.replace(/\[.*\]$/, ''));
  if (situations.size === 1 && !situations.has(undefined) && new Set(plain).size === plain.length) {
    for (const path of Object.keys(bonuses)) {
      bonuses[path.replace(/\[.*\]$/, '')] = bonuses[path];
      delete bonuses[path];
    }
  }
  // with no bonuses at all there is nothing to switch: the checks say what is missing
  if (!Object.keys(bonuses).length) return feature;
  entry['adjustments'] = bonuses;
  // a class feature just added is off: the player turns it on when it applies (the AI turned favored enemy on)
  entry['active'] = false;
  adjustments[list] = entry;
  const {active, ...kept} = feature as Feature & {active?: boolean};
  return Object.assign(new Feature({...kept, adjustments}), {descriptionOnly: (feature as any).descriptionOnly});
};

// a class feature the player uses (a number of times a day, dice it rolls, an action) shows on the sheet even with no
// number to adjust: channel energy written description only showed nowhere. its entry gets the uses the AI put on
// the feature, where the sheet counts them. the list is guessed from the text when the AI gave none
const USED = /\b\d+d\d+\b|\bper day\b|\b(times|rounds?|uses?) (per|a|each) day\b|\/day\b|\b(move|swift|standard|immediate|free) action\b/i;
const DEFENSIVE = /\b(evasion|uncanny dodge|trap sense|immun|resist|damage reduction|saving throws?|saves?|armor class|AC|hit points|below 0)\b/i;
const ATTACKING = /\b(attacks?|damage|\d+d\d+)\b/i;
export const shownOnSheet = (feature: Feature): Feature => {
  const adjustments: {[path: string]: any} = {...(feature.adjustments || {})};
  const listed = DISPLAY_LISTS.find(list => isObject(adjustments[list]));
  const charges = feature.charges;
  if (listed) {
    if (!charges || adjustments[listed].charges) return feature;
    adjustments[listed] = {...adjustments[listed], charges};
  } else {
    // listed by its section (shownIn), the sheet makes its entry: a copy of it in its adjustments is not written. the
    // section the AI gave, else the one its text points to
    if (feature.shownIn) return feature;
    const paths = Object.keys(adjustments);
    if (paths.length && paths.every(path => BOOKKEEPING.test(path))) return feature;
    // one with nothing to show is left to the checks (and the sheet's fallback, the special qualities)
    const used = USED.test(textOf(feature).replace(/\b(spells?|orisons?|cantrips?|slots?)( of each level)? (per|a|each) day\b/gi, ''));
    if (!paths.length && !charges && !used) return feature;
    const text = textOf(feature);
    const list = ATTACKING.test(text) ? 'specialAttack' : DEFENSIVE.test(text) ? 'defensiveAbilities' : 'specialQuality';
    return Object.assign(new Feature({...feature, shownIn: list}), {descriptionOnly: (feature as any).descriptionOnly});
  }
  const {charges: _, ...kept} = feature;
  return Object.assign(new Feature({...kept, adjustments}), {descriptionOnly: (feature as any).descriptionOnly});
};

// a domain gives a granted power at 1st level (Healing: Rebuke Death): a domain written with no power of its own left
// the power off the sheet. a power is a feature of its own, or an entry of the domain named for the power
const DOMAIN = /\bdomains?\b/i;
const CLASS_BASICS = /\b(aura|channel|orisons?|cantrips?|spontaneous|spells?|spellcasting|proficienc(y|ies)|languages?|domains?)\b/i;
export const domainProblems = (features: Feature[]): string[] => {
  const domains = features.filter(f => DOMAIN.test(f.name || ''));
  if (!domains.length) return [];
  // "Domains (Healing and Sun)" is two
  const wanted = domains.reduce((n, f) => n + Math.max(1, (f.name || '').split(/,|\band\b|\//).length), 0);
  const powers = features.filter(f => !CLASS_BASICS.test(f.name || '')).length
    + domains.filter(f => entriesGiven(f).some(entry => String(entry['name'] || '') && entry['name'] !== f.name)).length;
  return powers >= wanted ? [] : [`each domain gives a 1st-level granted power (Healing: Rebuke Death, Sun: Sun's Blessing), ${powers} of ${wanted} are here: add each as its own class feature with its entry and its uses a day, and keep the domain itself description only`];
};

// a class feature that is a bonus feat the class names (a wizard's Scribe Scroll, a monk's Improved Unarmed Strike):
// the feat itself, given by the feature, along with the feat it adds to those allowed. written as "bonusFeats": 1
// only, the app counted a feat left to pick, and the AI picked one the player never chose. a bonus feat the player
// picks (a fighter's "Bonus Feat") is left as it is: its name says no feat
export const bonusFeatGiven = (feature: Feature): Feature => {
  const adjustments = (feature.adjustments || {}) as {[path: string]: unknown};
  if (Number(adjustments['bonusFeats']) !== 1 || adjustments['feats'] !== undefined) return feature;
  const name = String(feature.name || '').trim();
  const inParens = /^bonus feat\s*\((.+)\)$/i.exec(name)?.[1]?.trim();
  const feat = inParens ?? (/\bfeats?\b|\bbonus\b/i.test(name) || !name ? undefined : name);
  if (!feat || /\b(any|choice|choose|selects?|picks?)\b/i.test(String(feature.description || ''))) return feature;
  const description = String(feature.description || '').replace(APP_NOTES, '').trim();
  return Object.assign(new Feature({...feature, adjustments: {...adjustments, feats: {name: feat, description: description || `a bonus feat of ${name}`, adjustments: {}}} as Feature['adjustments']}),
    {descriptionOnly: (feature as any).descriptionOnly});
};

// the features as they are kept: without the marks only the check reads
export const withoutMarks = (features: Feature[]): Feature[] => features.map(feature => {
  const {descriptionOnly, spellLikeProblems: _, ...kept} = feature as Feature & {descriptionOnly?: unknown, spellLikeProblems?: unknown};
  return new Feature(kept);
});

// the refusal, with how to fix it: everything wrong at once, so one more call fixes all of it
export const mechanicsRefusal = (problems: string[]): {error: string, problems: string[], how: string} => ({
  error: 'nothing was changed: the features need their rules as adjustments, fix all of these and call again',
  problems,
  how: MECHANICS_GUIDE,
});

// how to turn a class's page into its class features, given where they are built (the class step of a creation, a
// level up): one feature per entry of the table's row for the level, each written by what it does. the AI guessed
// the shape feature by feature (sneak attack a level early as a blank quality, track without its minimum)
export const CLASS_FEATURE_RECIPE = [
  'Class features, from the class page looked up with focus "the table row and class features of level N": one feature',
  'per entry of that row, none from another row, each with "gained_at": N. Never write a formula: a number that grows',
  'goes in "grows", its value at each level where the class table or text changes it ({"<path>": {"1": 1, "5": 2, ...}}),',
  'and uses a day in "uses_by_level" ({"at": {"1": 4, "2": 6, ...}, "plus": "con", "label": "rounds"}): the app writes',
  'the formulas and the uses, and gives them back by level to check against the table. Write each feature by what it does:',
  '- always on: a plain path ("speed.land": 10);',
  '- only in a situation: a variant, "skills.survival.value[follow tracks]";',
  '- switched on by the player (a study, a stance, a judgment): its sheet entry with "active": false and the bonuses on it;',
  '- extra damage dice or another attack (sneak attack, smite): "shown_in": "specialAttack", its dice in the description;',
  '- a defense (evasion, uncanny dodge, trap sense): "shown_in": "defensiveAbilities"; anything else is a special quality;',
  '- a choice (a domain, bloodline, rage power, bonus feat): ask the player, look the pick up, add what it gives;',
  '- no number at all: a description of its rules, never blank.',
  'Track (half level, minimum 1): {"name": "Track", "gained_at": 1, "description": "+1/2 level (min 1) to follow tracks",',
  '"adjustments": {},',
  '"grows": {"skills.survival.value[follow tracks]": {"1": 1, "4": 2, "6": 3, "8": 4, "10": 5, "12": 6, "14": 7, "16": 8, "18": 9, "20": 10}}}.',
  'Studied Target (+1, +1 more at 5th and every 5 levels): {"name": "Studied Target", "gained_at": 1, "adjustments":',
  '{"specialAttack": {"name": "Studied Target", "description": "move action, one creature", "active": false}}, "grows":',
  '{"melee.*.toHitBonus": {"1": 1, "5": 2, "10": 3, "15": 4, "20": 5}, "melee.*.damageBonus": {"1": 1, "5": 2, "10": 3, "15": 4, "20": 5}}}',
  '(the same for ranged attacks and its skills). Rage: {"name": "Rage", "gained_at": 1, "uses_by_level": {"at": {"1": 4, "2": 6,',
  '"3": 8}, "plus": "con", "label": "rounds"}, "adjustments": {...}}. get_adjustment_reference examples has more.',
].join(' ');
